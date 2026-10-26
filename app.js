/**
 * Durack Online — Frontend
 * API + local Durak vs bot
 */

const API_BASE = 'https://durack-online.pozzistory666.workers.dev';

const SUITS = {
  spades:   { symbol: '\u2660', color: 'black' },
  hearts:   { symbol: '\u2665', color: 'red' },
  diamonds: { symbol: '\u2666', color: 'red' },
  clubs:    { symbol: '\u2663', color: 'black' },
};

const RANK_LABEL = {
  '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  'J': '\u0412', 'Q': '\u0414', 'K': '\u041a', 'A': '\u0422',
};

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  document.body.style.backgroundColor = tg.themeParams.bg_color || '#1a3a5c';
}

let currentUser = null;
let authToken = null;
let timerInterval = null;
let timerSeconds = 15;

let game = null;
let myId = 'player';
const botId = 'bot';
let pendingDefendIndex = null;

const $ = (id) => document.getElementById(id);
const screens = {
  loading: $('loading'),
  menu: $('menu'),
  leaderboard: $('leaderboard'),
  game: $('game'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

async function authenticate() {
  try {
    if (!tg || !tg.initData) {
      currentUser = {
        telegram_id: 0,
        first_name: '\u0414\u0435\u043c\u043e',
        username: 'demo',
        coins: 1000,
        wins_random: 0,
        photo_url: '',
      };
      authToken = '0';
      renderUser();
      showScreen('menu');
      return;
    }
    const res = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg.initData,
        referrerId: tg.initDataUnsafe?.start_param
          ? parseInt(tg.initDataUnsafe.start_param, 10)
          : null,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438');
    currentUser = data.user;
    authToken = data.token;
    myId = String(currentUser.telegram_id || 'player');
    renderUser();
    showScreen('menu');
  } catch (err) {
    console.error(err);
    $('loading').innerHTML = `<p style="color:#ff8a80">\u041e\u0448\u0438\u0431\u043a\u0430: ${err.message}</p>`;
  }
}

function renderUser() {
  if (!currentUser) return;
  $('user-name').textContent = currentUser.first_name || currentUser.username || '\u0418\u0433\u0440\u043e\u043a';
  $('user-coins').textContent = currentUser.coins ?? 0;
  const letter = (currentUser.first_name || '?')[0];
  $('user-avatar').src = currentUser.photo_url ||
    'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle fill="#2a5a8c" cx="20" cy="20" r="20"/><text x="20" y="26" text-anchor="middle" fill="#fff" font-size="16">${letter}</text></svg>`
    );
}

function createCardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  if (opts.back) {
    el.classList.add('back');
    return el;
  }
  const suitInfo = SUITS[card.suit] || SUITS.spades;
  el.classList.add(suitInfo.color);
  if (opts.playable) el.classList.add('playable');
  if (opts.extraClass) el.classList.add(opts.extraClass);
  el.innerHTML = `<span class="rank">${RANK_LABEL[card.rank] || card.rank}</span><span class="suit">${suitInfo.symbol}</span>`;
  if (opts.onClick) el.addEventListener('click', () => opts.onClick(card, el));
  return el;
}

function stateToUI(state) {
  const me = state.players.find((p) => p.id === myId);
  const opponents = state.players
    .filter((p) => p.id !== myId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      cards: p.cardsCount,
      active: p.id === state.attackerId || p.id === state.defenderId,
    }));

  let role = 'wait';
  if (state.phase === 'finished') role = 'finished';
  else if (state.defenderId === myId && (state.phase === 'defend' || state.phase === 'throw')) role = 'defend';
  else if (state.attackerId === myId && (state.phase === 'attack' || state.phase === 'throw')) role = 'attack';

  return {
    trump: state.trump,
    deckCount: state.deckCount,
    opponents,
    table: state.table,
    hand: me?.hand || [],
    role,
    phase: state.phase,
    foolId: state.foolId,
    attackerId: state.attackerId,
    defenderId: state.defenderId,
  };
}

function renderFromGame() {
  if (!game) return;
  const state = game.getPublicState(myId);
  const ui = stateToUI(state);
  renderGameUI(ui, state);
  startTimer(15);
  maybeBotTurn();
}

function renderGameUI(ui, rawState) {
  const trumpInfo = SUITS[ui.trump] || SUITS.spades;
  const trumpEl = $('trump-suit');
  trumpEl.textContent = trumpInfo.symbol;
  trumpEl.className = 'trump-suit ' + trumpInfo.color;
  $('deck-count').textContent = ui.deckCount;

  const oppRoot = $('opponents');
  oppRoot.innerHTML = '';
  ui.opponents.forEach((o) => {
    const div = document.createElement('div');
    div.className = 'opponent' + (o.active ? ' active' : '');
    div.innerHTML = `<img class="avatar" src="" alt="" /><span class="name">${o.name}</span><span class="cards-count">${o.cards}</span>`;
    div.querySelector('img').src =
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle fill="#2a5a8c" cx="18" cy="18" r="18"/><text x="18" y="23" text-anchor="middle" fill="#fff" font-size="14">${o.name[0]}</text></svg>`
      );
    oppRoot.appendChild(div);
  });

  const tableRoot = $('table-cards');
  tableRoot.innerHTML = '';
  const hint = $('table-hint');
  if (ui.phase === 'finished') {
    hint.classList.remove('hide');
    const fool = rawState.players.find((p) => p.id === ui.foolId);
    hint.textContent = fool
      ? (fool.id === myId ? '\u0412\u044b \u2014 \u0434\u0443\u0440\u0430\u043a \ud83d\ude14' : `\u0414\u0443\u0440\u0430\u043a: ${fool.name} \ud83c\udf89`)
      : '\u0418\u0433\u0440\u0430 \u043e\u043a\u043e\u043d\u0447\u0435\u043d\u0430';
  } else if (!ui.table.length) {
    hint.textContent = ui.role === 'attack' ? '\u0412\u0430\u0448 \u0445\u043e\u0434 \u2014 \u0430\u0442\u0430\u043a\u0443\u0439\u0442\u0435' : '\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u0445\u043e\u0434\u0430...';
    hint.classList.remove('hide');
  } else {
    hint.classList.add('hide');
    ui.table.forEach((pair, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'table-pair';
      wrap.appendChild(createCardEl(pair.attack, { extraClass: 'attack' }));
      if (pair.defend) {
        wrap.appendChild(createCardEl(pair.defend, { extraClass: 'defend' }));
      } else if (ui.role === 'defend') {
        wrap.style.outline = '2px dashed #ffeb3b';
        wrap.style.borderRadius = '8px';
        wrap.dataset.attackIndex = String(i);
        wrap.addEventListener('click', () => {
          pendingDefendIndex = i;
          document.querySelectorAll('.table-pair').forEach((el) => (el.style.outline = '2px dashed #ffeb3b'));
          wrap.style.outline = '2px solid #4fc3f7';
        });
      }
      tableRoot.appendChild(wrap);
    });
  }

  const legal = game.getLegalMoves(myId);
  const attackKeys = new Set(legal.attacks.map((c) => c.rank + '_' + c.suit));
  const defendKeys = new Set(legal.defends.map((d) => d.card.rank + '_' + d.card.suit));

  const handRoot = $('player-hand');
  handRoot.innerHTML = '';
  ui.hand.forEach((card) => {
    const key = card.rank + '_' + card.suit;
    const canPlay =
      (ui.role === 'attack' && attackKeys.has(key)) ||
      (ui.role === 'defend' && defendKeys.has(key));
    const el = createCardEl(card, {
      playable: canPlay,
      onClick: canPlay ? () => onCardClick(card, ui.role) : null,
    });
    if (!canPlay) el.style.opacity = '0.55';
    handRoot.appendChild(el);
  });

  const btnTake = $('btn-take');
  const btnDone = $('btn-done');
  const btnPass = $('btn-pass');
  btnTake.classList.add('hidden');
  btnDone.classList.add('hidden');
  btnPass.classList.add('hidden');

  if (ui.role === 'defend') {
    btnTake.classList.remove('hidden');
    if (rawState.table.every((p) => p.defend)) {
      btnDone.classList.remove('hidden');
      btnDone.textContent = '\u0411\u0438\u0442\u043e';
    }
  } else if (ui.role === 'attack') {
    if (rawState.table.length > 0 && rawState.table.every((p) => p.defend)) {
      btnDone.classList.remove('hidden');
      btnDone.textContent = '\u0411\u0438\u0442\u043e';
    } else if (rawState.table.length > 0) {
      btnPass.classList.remove('hidden');
    }
  }
}

function onCardClick(card, role) {
  if (!game) return;
  if (role === 'attack') {
    const res = game.attack(myId, card);
    if (!res.ok) {
      flash(res.error);
      return;
    }
    renderFromGame();
    return;
  }
  if (role === 'defend') {
    let attackIndex = pendingDefendIndex;
    if (attackIndex == null) {
      const uncovered = game.table.map((p, i) => (!p.defend ? i : -1)).filter((i) => i >= 0);
      if (uncovered.length === 1) attackIndex = uncovered[0];
      else {
        flash('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u0430\u0440\u0442\u0443 \u043d\u0430 \u0441\u0442\u043e\u043b\u0435');
        return;
      }
    }
    const res = game.defend(myId, attackIndex, card);
    if (!res.ok) {
      flash(res.error);
      return;
    }
    pendingDefendIndex = null;
    renderFromGame();
  }
}

function flash(msg) {
  if (tg?.showAlert) tg.showAlert(msg);
  else {
    const hint = $('table-hint');
    hint.classList.remove('hide');
    hint.textContent = msg;
    setTimeout(() => renderFromGame(), 1200);
  }
}

function maybeBotTurn() {
  if (!game || game.phase === 'finished') return;
  const botIsAttacker = game.attacker.id === botId;
  const botIsDefender = game.defender.id === botId;
  const botShouldMove =
    (botIsAttacker && (game.phase === 'attack' || game.phase === 'throw')) ||
    (botIsDefender && game.phase === 'defend');

  if (!botShouldMove) return;

  setTimeout(() => {
    if (!game || game.phase === 'finished') return;
    // throw phase: bot may pass/bito if nothing to throw
    if (game.phase === 'throw' && game.attacker.id === botId) {
      const moves = game.getLegalMoves(botId);
      if (!moves.attacks.length && game.uncoveredCount() === 0) {
        game.bito(botId);
        renderFromGame();
        return;
      }
    }
    const res = window.durakBotMove(game, botId);
    if (res && res.ok) renderFromGame();
    else if (game.phase === 'throw' && game.attacker.id === botId && game.uncoveredCount() === 0) {
      game.bito(botId);
      renderFromGame();
    }
  }, 700);
}

function startTimer(seconds = 15) {
  clearInterval(timerInterval);
  timerSeconds = seconds;
  const el = $('timer');
  el.textContent = timerSeconds;
  el.classList.remove('urgent');
  timerInterval = setInterval(() => {
    timerSeconds -= 1;
    el.textContent = timerSeconds;
    if (timerSeconds <= 5) el.classList.add('urgent');
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      el.textContent = '0';
      autoMoveOnTimeout();
    }
  }, 1000);
}

function autoMoveOnTimeout() {
  if (!game || game.phase === 'finished') return;
  if (game.defender.id === myId && (game.phase === 'defend' || game.phase === 'throw')) {
    game.take(myId);
    renderFromGame();
  } else if (game.attacker.id === myId && game.phase === 'throw' && game.uncoveredCount() === 0) {
    game.bito(myId);
    renderFromGame();
  }
}

function startVsBot() {
  if (!window.DurakGame) {
    alert('Durak engine not loaded');
    return;
  }
  const name = currentUser?.first_name || '\u0418\u0433\u0440\u043e\u043a';
  myId = String(currentUser?.telegram_id || 'player');
  game = new window.DurakGame([
    { id: myId, name },
    { id: botId, name: '\u0411\u043e\u0442' },
  ]);
  game.start();
  pendingDefendIndex = null;
  showScreen('game');
  renderFromGame();
}

async function loadLeaderboard() {
  showScreen('leaderboard');
  const list = $('lb-list');
  list.innerHTML = '<p style="opacity:0.6">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...</p>';
  try {
    const res = await fetch(`${API_BASE}/leaderboard`);
    const data = await res.json();
    if (!data.ok) throw new Error('\u041e\u0448\u0438\u0431\u043a\u0430');
    if (!data.leaderboard.length) {
      list.innerHTML = '<p style="opacity:0.6">\u041f\u043e\u043a\u0430 \u043d\u0438\u043a\u043e\u0433\u043e \u043d\u0435\u0442</p>';
      return;
    }
    list.innerHTML = data.leaderboard
      .map(
        (u, i) =>
          `<div class="lb-item"><span class="lb-rank">${i + 1}</span><img src="${u.photo_url || ''}" onerror="this.style.display='none'" /><span class="lb-name">${u.first_name || u.username || '\u0418\u0433\u0440\u043e\u043a'}</span><span class="lb-wins">${u.wins_random} \u043f\u043e\u0431\u0435\u0434</span></div>`
      )
      .join('');
  } catch (e) {
    list.innerHTML = `<p style="color:#ff8a80">${e.message}</p>`;
  }
}

$('btn-quick').addEventListener('click', startVsBot);
$('btn-vs-bot')?.addEventListener('click', startVsBot);
$('btn-leaderboard').addEventListener('click', loadLeaderboard);
$('btn-back-lb').addEventListener('click', () => showScreen('menu'));
$('btn-leave').addEventListener('click', () => {
  clearInterval(timerInterval);
  game = null;
  showScreen('menu');
});

$('btn-take').addEventListener('click', () => {
  if (!game) return;
  const res = game.take(myId);
  if (!res.ok) flash(res.error);
  else renderFromGame();
});

$('btn-done').addEventListener('click', () => {
  if (!game) return;
  const res = game.bito(myId);
  if (!res.ok) flash(res.error);
  else renderFromGame();
});

$('btn-pass').addEventListener('click', () => {
  if (!game) return;
  const res = game.pass(myId);
  if (!res.ok) flash(res.error);
  else renderFromGame();
});

['btn-tournament', 'btn-friends', 'btn-shop', 'btn-settings'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('click', () => {
    if (tg?.showAlert) tg.showAlert('\u0421\u043a\u043e\u0440\u043e (\u042d\u0442\u0430\u043f 2)');
    else alert('\u0421\u043a\u043e\u0440\u043e (\u042d\u0442\u0430\u043f 2)');
  });
});

authenticate();
