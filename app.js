/**
 * Durack Online — Frontend
 */

const API_BASE = 'https://durack-online.pozzistory666.workers.dev';
const WS_BASE = 'wss://durack-online.pozzistory666.workers.dev';

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
let mode = 'bot'; // bot | online
let ws = null;
let roomId = null;

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
      myId = 'player';
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
    if (!res.ok || !data.ok) throw new Error(data.error || 'auth error');
    currentUser = data.user;
    authToken = data.token;
    myId = String(currentUser.telegram_id);
    renderUser();
    showScreen('menu');
  } catch (err) {
    console.error(err);
    $('loading').innerHTML = `<p style="color:#ff8a80">${err.message}</p>`;
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
  if (opts.onClick) el.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.onClick(card, el);
  });
  return el;
}

function cardKey(c) {
  return c.rank + '_' + c.suit;
}

function renderFromGame() {
  if (!game) return;
  const state = game.getPublicState(myId);
  renderGameUI(state);
  startTimer(15);
  if (mode === 'bot') maybeBotTurn();
}

function renderGameUI(state) {
  const me = state.players.find((p) => p.id === myId);
  const trumpInfo = SUITS[state.trump] || SUITS.spades;
  const trumpEl = $('trump-suit');
  trumpEl.textContent = trumpInfo.symbol;
  trumpEl.className = 'trump-suit ' + trumpInfo.color;
  $('deck-count').textContent = state.deckCount;

  const oppRoot = $('opponents');
  oppRoot.innerHTML = '';
  state.players.filter((p) => p.id !== myId).forEach((p) => {
    const active = p.id === state.attackerId || p.id === state.defenderId;
    const div = document.createElement('div');
    div.className = 'opponent' + (active ? ' active' : '');
    div.innerHTML = `<img class="avatar" src="" alt="" /><span class="name">${p.name}</span><span class="cards-count">${p.cardsCount}</span>`;
    div.querySelector('img').src =
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle fill="#2a5a8c" cx="18" cy="18" r="18"/><text x="18" y="23" text-anchor="middle" fill="#fff" font-size="14">${(p.name || '?')[0]}</text></svg>`
      );
    oppRoot.appendChild(div);
  });

  const isDefender = state.defenderId === myId;
  const isAttacker = state.attackerId === myId;
  const role =
    state.phase === 'finished' ? 'finished' :
    isDefender && (state.phase === 'defend' || state.phase === 'throw') ? 'defend' :
    isAttacker && (state.phase === 'attack' || state.phase === 'throw') ? 'attack' : 'wait';

  const tableRoot = $('table-cards');
  tableRoot.innerHTML = '';
  const hint = $('table-hint');

  if (state.phase === 'finished') {
    hint.classList.remove('hide');
    const fool = state.players.find((p) => p.id === state.foolId);
    hint.textContent = fool
      ? (fool.id === myId ? '\u0412\u044b \u2014 \u0434\u0443\u0440\u0430\u043a' : `\u0414\u0443\u0440\u0430\u043a: ${fool.name}`)
      : '\u0418\u0433\u0440\u0430 \u043e\u043a\u043e\u043d\u0447\u0435\u043d\u0430';
  } else if (!state.table.length) {
    hint.classList.remove('hide');
    hint.textContent = role === 'attack' ? '\u0412\u0430\u0448 \u0445\u043e\u0434 \u2014 \u0430\u0442\u0430\u043a\u0443\u0439\u0442\u0435' : '\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u0445\u043e\u0434\u0430...';
  } else {
    hint.classList.add('hide');
    state.table.forEach((pair) => {
      const wrap = document.createElement('div');
      wrap.className = 'table-pair' + (!pair.defend ? ' uncovered' : '');
      wrap.appendChild(createCardEl(pair.attack, { extraClass: 'attack' }));
      if (pair.defend) {
        wrap.appendChild(createCardEl(pair.defend, { extraClass: 'defend' }));
      }
      tableRoot.appendChild(wrap);
    });
  }

  const legal = mode === 'bot' && game
    ? game.getLegalMoves(myId)
    : { attacks: me?.hand || [], defends: [] };

  // Для online legal пр\u0438\u0445\u043e\u0434\u0438\u0442 \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043f\u043e\u0437\u0436\u0435; \u043f\u043e\u043a\u0430 \u0434\u043b\u044f bot
  const attackKeys = new Set((legal.attacks || []).map(cardKey));
  const defendByCard = {};
  (legal.defends || []).forEach((d) => {
    const k = cardKey(d.card);
    if (!defendByCard[k]) defendByCard[k] = [];
    defendByCard[k].push(d.attackIndex);
  });

  const handRoot = $('player-hand');
  handRoot.innerHTML = '';
  (me?.hand || []).forEach((card) => {
    const key = cardKey(card);
    const canAttack = role === 'attack' && attackKeys.has(key);
    const canDefend = role === 'defend' && defendByCard[key];
    const canPlay = canAttack || canDefend;
    const el = createCardEl(card, {
      playable: !!canPlay,
      onClick: canPlay
        ? () => {
            if (canAttack) {
              const res = game.attack(myId, card);
              if (!res.ok) flash(res.error);
              else renderFromGame();
            } else if (canDefend) {
              // \u0431\u044c\u0451\u043c \u043f\u0435\u0440\u0432\u0443\u044e \u043f\u043e\u0434\u0445\u043e\u0434\u044f\u0449\u0443\u044e \u043d\u0435\u043f\u043e\u043a\u0440\u044b\u0442\u0443\u044e
              const idx = defendByCard[key][0];
              const res = game.defend(myId, idx, card);
              if (!res.ok) flash(res.error);
              else renderFromGame();
            }
          }
        : null,
    });
    if (!canPlay) el.style.opacity = '0.5';
    handRoot.appendChild(el);
  });

  const btnTake = $('btn-take');
  const btnDone = $('btn-done');
  const btnPass = $('btn-pass');
  btnTake.classList.add('hidden');
  btnDone.classList.add('hidden');
  btnPass.classList.add('hidden');

  if (role === 'defend') {
    btnTake.classList.remove('hidden');
    if (state.table.length && state.table.every((p) => p.defend)) {
      btnDone.classList.remove('hidden');
      btnDone.textContent = '\u0411\u0438\u0442\u043e';
    }
  } else if (role === 'attack') {
    if (state.table.length && state.table.every((p) => p.defend)) {
      btnDone.classList.remove('hidden');
      btnDone.textContent = '\u0411\u0438\u0442\u043e';
    }
  }
}

function flash(msg) {
  if (tg?.showAlert) tg.showAlert(String(msg));
  else {
    const hint = $('table-hint');
    hint.classList.remove('hide');
    hint.textContent = msg;
  }
}

function maybeBotTurn() {
  if (!game || game.phase === 'finished') return;
  const botTurn =
    (game.attacker.id === botId && (game.phase === 'attack' || game.phase === 'throw')) ||
    (game.defender.id === botId && game.phase === 'defend');
  if (!botTurn) return;

  setTimeout(() => {
    if (!game || game.phase === 'finished') return;
    if (game.phase === 'throw' && game.attacker.id === botId) {
      const moves = game.getLegalMoves(botId);
      if (!moves.attacks.length && game.uncoveredCount() === 0) {
        game.bito(botId);
        renderFromGame();
        return;
      }
    }
    const res = window.durakBotMove(game, botId);
    if (res?.ok) renderFromGame();
    else if (game.phase === 'throw' && game.attacker.id === botId && game.uncoveredCount() === 0) {
      game.bito(botId);
      renderFromGame();
    }
  }, 600);
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
      if (mode === 'bot' && game) {
        if (game.defender.id === myId && (game.phase === 'defend' || game.phase === 'throw')) {
          game.take(myId);
          renderFromGame();
        } else if (game.attacker.id === myId && game.phase === 'throw' && game.uncoveredCount() === 0) {
          game.bito(myId);
          renderFromGame();
        }
      }
    }
  }, 1000);
}

function startVsBot() {
  if (!window.DurakGame) {
    alert('Engine not loaded');
    return;
  }
  mode = 'bot';
  const name = currentUser?.first_name || '\u0418\u0433\u0440\u043e\u043a';
  myId = String(currentUser?.telegram_id || 'player');
  game = new window.DurakGame([
    { id: myId, name },
    { id: botId, name: '\u0411\u043e\u0442' },
  ]);
  game.start();
  showScreen('game');
  renderFromGame();
}

/** ===== Online matchmaking (step C skeleton) ===== */
function startQuickOnline() {
  mode = 'online';
  roomId = 'quick_' + Math.floor(Date.now() / 30000); // \u043e\u043a\u043d\u043e 30\u0441 \u0434\u043b\u044f \u043f\u0430\u0440\u044b
  const name = encodeURIComponent(currentUser?.first_name || '\u0418\u0433\u0440\u043e\u043a');
  const uid = encodeURIComponent(myId);
  showScreen('game');
  $('table-hint').classList.remove('hide');
  $('table-hint').textContent = '\u041f\u043e\u0438\u0441\u043a \u0441\u043e\u043f\u0435\u0440\u043d\u0438\u043a\u0430...';
  $('player-hand').innerHTML = '';
  $('opponents').innerHTML = '';
  $('table-cards').innerHTML = '';

  if (ws) try { ws.close(); } catch (_) {}
  ws = new WebSocket(`${WS_BASE}/ws/${roomId}?userId=${uid}&username=${name}`);

  ws.onopen = () => {
    $('table-hint').textContent = '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e. \u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u0438\u0433\u0440\u043e\u043a\u043e\u0432...';
    ws.send(JSON.stringify({ type: 'join', userId: myId, name: currentUser?.first_name || '\u0418\u0433\u0440\u043e\u043a' }));
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleWsMessage(msg);
    } catch (e) {
      console.error(e);
    }
  };
  ws.onclose = () => {
    $('table-hint').classList.remove('hide');
    $('table-hint').textContent = '\u0421\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u0435 \u0437\u0430\u043a\u0440\u044b\u0442\u043e';
  };
  ws.onerror = () => flash('WebSocket error');
}

function handleWsMessage(msg) {
  if (msg.type === 'welcome' || msg.type === 'player_joined') {
    const players = msg.players || [];
    $('table-hint').textContent = `\u0412 \u043a\u043e\u043c\u043d\u0430\u0442\u0435: ${players.length}/2`;
    if (players.length >= 2 && ws) {
      ws.send(JSON.stringify({ type: 'start_game' }));
    }
  }
  if (msg.type === 'state' && msg.state) {
    // \u0441\u0435\u0440\u0432\u0435\u0440\u043d\u0430\u044f \u0438\u0433\u0440\u0430 \u2014 \u043d\u0430 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u043c \u0448\u0430\u0433\u0435 \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e
    renderOnlineState(msg.state);
  }
  if (msg.type === 'chat') {
    console.log('chat', msg);
  }
}

function renderOnlineState(state) {
  // \u043f\u043e\u043a\u0430 \u043f\u0440\u043e\u0441\u0442\u043e\u0439 \u0440\u0435\u043d\u0434\u0435\u0440 \u043a\u0430\u043a \u0443 bot, \u0431\u0435\u0437 local game object
  // \u043f\u043e\u043b\u043d\u0430\u044f \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u0432 \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u0438 C
  $('table-hint').classList.remove('hide');
  $('table-hint').textContent = state.phase || 'online';
}

async function loadLeaderboard() {
  showScreen('leaderboard');
  const list = $('lb-list');
  list.innerHTML = '<p style="opacity:0.6">...</p>';
  try {
    const res = await fetch(`${API_BASE}/leaderboard`);
    const data = await res.json();
    if (!data.ok) throw new Error('err');
    if (!data.leaderboard.length) {
      list.innerHTML = '<p style="opacity:0.6">\u041f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442\u043e</p>';
      return;
    }
    list.innerHTML = data.leaderboard
      .map(
        (u, i) =>
          `<div class="lb-item"><span class="lb-rank">${i + 1}</span><img src="${u.photo_url || ''}" onerror="this.style.display='none'" /><span class="lb-name">${u.first_name || u.username || '?'}</span><span class="lb-wins">${u.wins_random}</span></div>`
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
  if (ws) try { ws.close(); } catch (_) {}
  ws = null;
  showScreen('menu');
});

$('btn-take').addEventListener('click', () => {
  if (mode === 'bot' && game) {
    const res = game.take(myId);
    if (!res.ok) flash(res.error);
    else renderFromGame();
  }
});

$('btn-done').addEventListener('click', () => {
  if (mode === 'bot' && game) {
    const res = game.bito(myId);
    if (!res.ok) flash(res.error);
    else renderFromGame();
  }
});

['btn-tournament', 'btn-friends', 'btn-shop', 'btn-settings'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('click', () => {
    if (tg?.showAlert) tg.showAlert('\u0421\u043a\u043e\u0440\u043e');
    else alert('\u0421\u043a\u043e\u0440\u043e');
  });
});

authenticate();
