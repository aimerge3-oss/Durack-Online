/**
 * Дурак — серверный движок (Durable Object)
 * id всегда сравниваются как String
 */

const SUITS = ['spades', 'clubs', 'diamonds', 'hearts'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VAL = { 6: 0, 7: 1, 8: 2, 9: 3, 10: 4, J: 5, Q: 6, K: 7, A: 8 };

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function sameId(a, b) {
  return String(a) === String(b);
}

function canBeat(card, attack, trump) {
  if (card.suit === attack.suit) return RANK_VAL[card.rank] > RANK_VAL[attack.rank];
  if (card.suit === trump && attack.suit !== trump) return true;
  return false;
}

export class DurakGame {
  constructor(players) {
    if (players.length < 2 || players.length > 6) throw new Error('Need 2–6 players');
    this.players = players.map((p) => ({
      id: String(p.id),
      name: p.name,
      hand: [],
      out: false,
    }));
    this.deck = [];
    this.trump = null;
    this.trumpCard = null;
    this.table = [];
    this.attackerIndex = 0;
    this.defenderIndex = 1;
    this.phase = 'waiting';
    this.winnerIds = [];
    this.foolId = null;
    this.started = false;
    this.maxAttackCards = 6;
  }

  start() {
    this.deck = makeDeck();
    this.trumpCard = this.deck[this.deck.length - 1];
    this.trump = this.trumpCard.suit;
    for (const p of this.players) {
      p.hand = [];
      p.out = false;
      for (let i = 0; i < 6; i++) {
        if (this.deck.length) p.hand.push(this.deck.shift());
      }
    }
    // минимальный козырь ходит первым
    let minIdx = 0;
    let minVal = 99;
    this.players.forEach((p, idx) => {
      for (const c of p.hand) {
        if (c.suit === this.trump && RANK_VAL[c.rank] < minVal) {
          minVal = RANK_VAL[c.rank];
          minIdx = idx;
        }
      }
    });
    this.attackerIndex = minIdx;
    this.defenderIndex = this.nextActiveIndex(minIdx);
    this.phase = 'attack';
    this.started = true;
    this.table = [];
    this.winnerIds = [];
    this.foolId = null;
    return this.getPublicState();
  }

  nextActiveIndex(from) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (!this.players[idx].out) return idx;
    }
    return from;
  }

  get attacker() {
    return this.players[this.attackerIndex];
  }
  get defender() {
    return this.players[this.defenderIndex];
  }

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

  findPlayer(playerId) {
    return this.players.find((p) => sameId(p.id, playerId));
  }

  attack(playerId, card) {
    const allowedPhase =
      this.phase === 'attack' || this.phase === 'throw' || this.phase === 'defend';
    if (!allowedPhase) return { ok: false, error: 'Not attack phase' };

    const player = this.findPlayer(playerId);
    if (!player) return { ok: false, error: 'Player not found' };
    if (!sameId(playerId, this.attacker.id) && this.phase === 'attack' && this.table.length === 0) {
      return { ok: false, error: 'Not your turn to attack' };
    }
    // первый ход — только атакующий; подкид — атакующий (простая модель)
    if (this.table.length === 0 && !sameId(playerId, this.attacker.id)) {
      return { ok: false, error: 'Not your turn to attack' };
    }
    if (this.table.length > 0 && !sameId(playerId, this.attacker.id)) {
      return { ok: false, error: 'Only attacker throws in' };
    }
    if (this.table.length >= this.maxAttackCards) return { ok: false, error: 'Max attacks' };

    const def = this.defender;
    if (this.table.length > 0 && def && this.uncoveredCount() >= def.hand.length) {
      return { ok: false, error: 'Defender has no free cards' };
    }

    const idx = player.hand.findIndex(
      (c) => c.suit === card.suit && c.rank === card.rank
    );
    if (idx < 0) return { ok: false, error: 'Card not in hand' };

    if (this.table.length > 0) {
      const ranks = this.ranksOnTable();
      if (!ranks.has(card.rank)) return { ok: false, error: 'Rank not on table' };
    }

    const played = player.hand.splice(idx, 1)[0];
    this.table.push({ attack: played, defend: null });
    this.phase = 'defend';
    return { ok: true, state: this.getPublicState() };
  }

  defend(playerId, attackIndex, card) {
    if (this.phase !== 'defend' && this.phase !== 'throw') {
      return { ok: false, error: 'Not defend phase' };
    }
    if (!sameId(playerId, this.defender.id)) return { ok: false, error: 'Not defender' };
    const pair = this.table[attackIndex];
    if (!pair || pair.defend) return { ok: false, error: 'Invalid attack index' };

    const player = this.defender;
    const idx = player.hand.findIndex(
      (c) => c.suit === card.suit && c.rank === card.rank
    );
    if (idx < 0) return { ok: false, error: 'Card not in hand' };
    if (!canBeat(card, pair.attack, this.trump)) return { ok: false, error: 'Cannot beat' };

    pair.defend = player.hand.splice(idx, 1)[0];
    if (this.uncoveredCount() === 0) this.phase = 'throw';
    return { ok: true, state: this.getPublicState() };
  }

  take(playerId) {
    if (!sameId(playerId, this.defender.id)) return { ok: false, error: 'Not defender' };
    for (const pair of this.table) {
      this.defender.hand.push(pair.attack);
      if (pair.defend) this.defender.hand.push(pair.defend);
    }
    this.table = [];
    this.drawUp();
    this.attackerIndex = this.nextActiveIndex(this.defenderIndex);
    this.defenderIndex = this.nextActiveIndex(this.attackerIndex);
    this.phase = this.isFinished() ? 'finished' : 'attack';
    return { ok: true, state: this.getPublicState() };
  }

  bito(playerId) {
    if (this.phase !== 'throw' && this.phase !== 'attack') {
      return { ok: false, error: 'Cannot bito now' };
    }
    if (this.uncoveredCount() > 0) return { ok: false, error: 'Unbeaten cards' };
    this.table = [];
    this.drawUp();
    this.attackerIndex = this.defenderIndex;
    this.defenderIndex = this.nextActiveIndex(this.attackerIndex);
    this.phase = this.isFinished() ? 'finished' : 'attack';
    return { ok: true, state: this.getPublicState() };
  }

  drawUp() {
    const order = [];
    order.push(this.attackerIndex);
    for (let i = 0; i < this.players.length; i++) {
      if (i !== this.attackerIndex && i !== this.defenderIndex) order.push(i);
    }
    order.push(this.defenderIndex);
    for (const idx of order) {
      const p = this.players[idx];
      if (p.out) continue;
      while (p.hand.length < 6 && this.deck.length > 0) {
        p.hand.push(this.deck.shift());
      }
    }
  }

  isFinished() {
    const active = this.players.filter((p) => !p.out && p.hand.length > 0);
    const empty = this.players.filter((p) => !p.out && p.hand.length === 0);
    if (this.deck.length === 0) {
      for (const p of this.players) {
        if (p.hand.length === 0) p.out = true;
      }
      const still = this.players.filter((p) => !p.out);
      if (still.length <= 1) {
        this.foolId = still.length === 1 ? still[0].id : null;
        this.winnerIds = this.players.filter((p) => p.id !== this.foolId).map((p) => p.id);
        return true;
      }
    }
    return false;
  }

  getPublicState(forPlayerId = null) {
    const fid = forPlayerId != null ? String(forPlayerId) : null;
    return {
      started: this.started,
      phase: this.phase,
      trump: this.trump,
      trumpCard: this.trumpCard,
      deckCount: this.deck.length,
      table: this.table.map((p) => ({ attack: p.attack, defend: p.defend })),
      attackerId: this.attacker ? String(this.attacker.id) : null,
      defenderId: this.defender ? String(this.defender.id) : null,
      players: this.players.map((p) => ({
        id: String(p.id),
        name: p.name,
        cardsCount: p.hand.length,
        out: p.out,
        hand: fid && sameId(fid, p.id) ? p.hand.slice() : undefined,
      })),
      winnerIds: this.winnerIds,
      foolId: this.foolId,
      maxAttackCards: this.maxAttackCards,
    };
  }

  getLegalMoves(playerId) {
    const player = this.findPlayer(playerId);
    if (!player) return { attacks: [], defends: [] };
    const attacks = [];
    const defends = [];
    const pid = String(playerId);

    const canAttackNow =
      sameId(pid, this.attacker.id) &&
      this.table.length < this.maxAttackCards &&
      (this.phase === 'attack' ||
        this.phase === 'throw' ||
        (this.phase === 'defend' && this.table.length > 0));

    if (canAttackNow) {
      const def = this.defender;
      const canAdd =
        !def || this.table.length === 0 || this.uncoveredCount() < def.hand.length;
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

    if (
      (this.phase === 'defend' || this.phase === 'throw') &&
      sameId(pid, this.defender.id)
    ) {
      this.table.forEach((pair, i) => {
        if (pair.defend) return;
        player.hand.forEach((c) => {
          if (canBeat(c, pair.attack, this.trump)) {
            defends.push({ attackIndex: i, card: c });
          }
        });
      });
    }
    return { attacks, defends };
  }
}
