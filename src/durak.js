/**
 * Классический Дурак — сервер
 */

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i]));

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function canBeat(card, target, trump) {
  if (card.suit === target.suit) return RANK_VALUE[card.rank] > RANK_VALUE[target.rank];
  if (card.suit === trump && target.suit !== trump) return true;
  return false;
}

export class DurakGame {
  constructor(players) {
    if (players.length < 2 || players.length > 6) throw new Error('Need 2–6 players');
    this.players = players.map((p) => ({ id: p.id, name: p.name, hand: [], out: false }));
    this.deck = [];
    this.trump = null;
    this.trumpCard = null;
    this.table = [];
    this.attackerIndex = 0;
    this.defenderIndex = 1;
    this.phase = 'waiting';
    this.winnerIds = [];
    this.foolId = null;
    this.maxAttackCards = 6;
    this.started = false;
  }

  start() {
    this.deck = shuffle(createDeck());
    for (let i = 0; i < 6; i++) {
      for (const p of this.players) {
        if (this.deck.length) p.hand.push(this.deck.pop());
      }
    }
    this.trumpCard = this.deck[0];
    this.trump = this.trumpCard.suit;
    this.deck.push(this.deck.shift());

    let minTrump = null;
    let minIdx = 0;
    this.players.forEach((p, idx) => {
      p.hand.forEach((c) => {
        if (c.suit === this.trump) {
          if (minTrump === null || RANK_VALUE[c.rank] < RANK_VALUE[minTrump.rank]) {
            minTrump = c;
            minIdx = idx;
          }
        }
      });
    });
    this.attackerIndex = minIdx;
    this.defenderIndex = this.nextActiveIndex(minIdx);
    this.phase = 'attack';
    this.started = true;
    this.table = [];
    this.setMaxAttackForRound();
    return this.getPublicState();
  }

  setMaxAttackForRound() {
    const def = this.players[this.defenderIndex];
    const handSize = def ? def.hand.length : 6;
    this.maxAttackCards = Math.min(6, Math.max(1, handSize));
  }

  nextActiveIndex(from) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (!this.players[idx].out) return idx;
    }
    return from;
  }

  get attacker() { return this.players[this.attackerIndex]; }
  get defender() { return this.players[this.defenderIndex]; }

  ranksOnTable() {
    const ranks = new Set();
    for (const pair of this.table) {
      ranks.add(pair.attack.rank);
      if (pair.defend) ranks.add(pair.defend.rank);
    }
    return ranks;
  }

  uncoveredCount() {
    return this.table.filter((p) => !p.defend).length;
  }

  attack(playerId, card) {
    const allowedPhase =
      this.phase === 'attack' ||
      this.phase === 'throw' ||
      (this.phase === 'defend' && this.table.length > 0);
    if (!allowedPhase) return { ok: false, error: 'Not attack phase' };

    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.out) return { ok: false, error: 'Invalid player' };
    if (playerId !== this.attacker.id) return { ok: false, error: 'Not your turn to attack' };
    if (this.table.length >= this.maxAttackCards) return { ok: false, error: 'Max cards on table' };

    const def = this.defender;
    if (def && this.table.length > 0 && this.uncoveredCount() >= def.hand.length) {
      return { ok: false, error: 'Defender has no cards to cover' };
    }

    const idx = player.hand.findIndex((c) => c.rank === card.rank && c.suit === card.suit);
    if (idx === -1) return { ok: false, error: 'Card not in hand' };

    if (this.table.length > 0) {
      const ranks = this.ranksOnTable();
      if (!ranks.has(card.rank)) return { ok: false, error: 'Rank not on table' };
    }

    const [played] = player.hand.splice(idx, 1);
    this.table.push({ attack: played, defend: null });
    this.phase = 'defend';
    return { ok: true, state: this.getPublicState() };
  }

  defend(playerId, attackIndex, card) {
    if (this.phase !== 'defend') return { ok: false, error: 'Not defend phase' };
    if (playerId !== this.defender.id) return { ok: false, error: 'Not defender' };
    const pair = this.table[attackIndex];
    if (!pair || pair.defend) return { ok: false, error: 'Invalid attack index' };

    const idx = this.defender.hand.findIndex((c) => c.rank === card.rank && c.suit === card.suit);
    if (idx === -1) return { ok: false, error: 'Card not in hand' };
    if (!canBeat(card, pair.attack, this.trump)) return { ok: false, error: 'Cannot beat' };

    const [played] = this.defender.hand.splice(idx, 1);
    pair.defend = played;
    if (this.uncoveredCount() === 0) this.phase = 'throw';
    return { ok: true, state: this.getPublicState() };
  }

  take(playerId) {
    if (playerId !== this.defender.id) return { ok: false, error: 'Not defender' };
    if (this.phase !== 'defend' && this.phase !== 'throw') return { ok: false, error: 'Cannot take now' };

    for (const pair of this.table) {
      this.defender.hand.push(pair.attack);
      if (pair.defend) this.defender.hand.push(pair.defend);
    }
    this.table = [];
    this.drawCards();
    this.checkOuts();
    this.attackerIndex = this.nextActiveIndex(this.defenderIndex);
    this.defenderIndex = this.nextActiveIndex(this.attackerIndex);
    this.phase = this.isFinished() ? 'finished' : 'attack';
    this.setMaxAttackForRound();
    return { ok: true, state: this.getPublicState() };
  }

  bito(playerId) {
    if (this.phase !== 'throw' && this.phase !== 'attack') return { ok: false, error: 'Cannot bito now' };
    if (this.uncoveredCount() > 0) return { ok: false, error: 'Uncovered cards remain' };
    if (this.table.length === 0) return { ok: false, error: 'Table empty' };

    this.table = [];
    this.drawCards();
    this.checkOuts();
    this.attackerIndex = this.defenderIndex;
    this.defenderIndex = this.nextActiveIndex(this.attackerIndex);
    this.phase = this.isFinished() ? 'finished' : 'attack';
    this.setMaxAttackForRound();
    return { ok: true, state: this.getPublicState() };
  }

  pass(playerId) {
    if (playerId !== this.attacker.id) return { ok: false, error: 'Not attacker' };
    if (this.uncoveredCount() === 0 && this.table.length > 0) return this.bito(playerId);
    return { ok: false, error: 'Cannot pass' };
  }

  drawCards() {
    const order = [];
    let idx = this.attackerIndex;
    for (let i = 0; i < this.players.length; i++) {
      if (!this.players[idx].out) order.push(idx);
      idx = (idx + 1) % this.players.length;
    }
    const defPos = order.indexOf(this.defenderIndex);
    if (defPos !== -1) {
      order.splice(defPos, 1);
      order.push(this.defenderIndex);
    }
    for (const i of order) {
      const p = this.players[i];
      while (p.hand.length < 6 && this.deck.length > 0) p.hand.push(this.deck.pop());
    }
  }

  checkOuts() {
    for (const p of this.players) {
      if (!p.out && p.hand.length === 0 && this.deck.length === 0) {
        p.out = true;
        if (!this.winnerIds.includes(p.id)) this.winnerIds.push(p.id);
      }
    }
  }

  isFinished() {
    const active = this.players.filter((p) => !p.out);
    if (active.length <= 1) {
      this.phase = 'finished';
      this.foolId = active[0] ? active[0].id : null;
      return true;
    }
    return false;
  }

  getPublicState(forPlayerId = null) {
    return {
      started: this.started,
      phase: this.phase,
      trump: this.trump,
      trumpCard: this.trumpCard,
      deckCount: this.deck.length,
      table: this.table.map((p) => ({ attack: p.attack, defend: p.defend })),
      attackerId: this.attacker ? this.attacker.id : null,
      defenderId: this.defender ? this.defender.id : null,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        cardsCount: p.hand.length,
        out: p.out,
        hand: forPlayerId === p.id ? p.hand : undefined,
      })),
      winnerIds: this.winnerIds,
      foolId: this.foolId,
      maxAttackCards: this.maxAttackCards,
    };
  }

  getLegalMoves(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { attacks: [], defends: [] };
    const attacks = [];
    const defends = [];

    const canAttackNow =
      playerId === this.attacker.id &&
      this.table.length < this.maxAttackCards &&
      (this.phase === 'attack' ||
        this.phase === 'throw' ||
        (this.phase === 'defend' && this.table.length > 0));

    if (canAttackNow) {
      const def = this.defender;
      const canAdd = !def || this.table.length === 0 || this.uncoveredCount() < def.hand.length;
      if (canAdd) {
        if (this.table.length === 0) player.hand.forEach((c) => attacks.push(c));
        else {
          const ranks = this.ranksOnTable();
          player.hand.forEach((c) => {
            if (ranks.has(c.rank)) attacks.push(c);
          });
        }
      }
    }

    if (this.phase === 'defend' && playerId === this.defender.id) {
      this.table.forEach((pair, i) => {
        if (pair.defend) return;
        player.hand.forEach((c) => {
          if (canBeat(c, pair.attack, this.trump)) defends.push({ attackIndex: i, card: c });
        });
      });
    }
    return { attacks, defends };
  }
}
