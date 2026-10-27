/**
 * Durack Online — Frontend
 */

const API_BASE = 'https://durack-online.pozzistory666.workers.dev';
const WS_BASE = 'wss://durack-online.pozzistory666.workers.dev';

const CARD_SUITS = {
  spades:   { symbol: '\u2660', color: 'black' },
  hearts:   { symbol: '\u2665', color: 'red' },
  diamonds: { symbol: '\u2666', color: 'red' },
  clubs:    { symbol: '\u2663', color: 'black' },
};

const RANK_LABEL = {
  '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  'J': 'В', 'Q': 'Д', 'K': 'К', 'A': 'Т',
};

const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.themeParams && tg.themeParams.bg_color) {
      document.body.style.backgroundColor = tg.themeParams.bg_color;
    }
  } catch (e) {}
}

let currentUser = null;
let authToken = null;
let timerInterval = null;
let timerSeconds = 15;
let game = null;
let onlineState = null;
let selectedDefendIndex = null;
let myId = 'player';
let playerCount = 2;
let mode = 'bot';
let ws = null;
let audioCtx = null;

function $(id) { return document.getElementById(id); }

const screens = {
  loading: $('loading'),
  menu: $('menu'),
  leaderboard: $('leaderboard'),
  shop: $('shop'),
  friends: $('friends'),
  referral: $('referral'),
  game: $('game'),
};

window.showScreen = showScreen;
function showScreen(name) {
  Object.keys(screens).forEach(function (k) {
    if (screens[k]) screens[k].classList.add('hidden');
  });
  if (screens[name]) screens[name].classList.remove('hidden');
}

function cardKey(c) { return c.rank + '_' + c.suit; }
function isBotId(id) { return String(id).indexOf('bot') === 0; }

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
}
window.ensureAudio = ensureAudio;

function playTone(freq, dur, type, vol) {
  ensureAudio();
  if (!audioCtx) return;
  try {
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    g.gain.value = vol || 0.08;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

function sfxPlay() {
  playTone(420, 0.08, 'triangle', 0.1);
  setTimeout(function () { playTone(520, 0.06, 'triangle', 0.07); }, 40);
}
function sfxDefend() {
  playTone(360, 0.07, 'square', 0.06);
  setTimeout(function () { playTone(280, 0.1, 'triangle', 0.08); }, 50);
}
function sfxTake() { playTone(200, 0.12, 'sawtooth', 0.05); }
function sfxBito() {
  playTone(600, 0.08, 'sine', 0.07);
  setTimeout(function () { playTone(800, 0.1, 'sine', 0.06); }, 70);
}
window.sfxPlay = sfxPlay;

function flash(msg) {
  if (tg && tg.showAlert) tg.showAlert(String(msg));
  else {
    var hint = $('table-hint');
    if (hint) { hint.classList.remove('hide'); hint.textContent = String(msg); }
  }
}
window.flash = flash;

function renderUser() {
  if (!currentUser) return;
  var nameEl = $('user-name'), coinsEl = $('user-coins'), av = $('user-avatar');
  if (nameEl) nameEl.textContent = currentUser.first_name || currentUser.username || 'Игрок';
  if (coinsEl) coinsEl.textContent = currentUser.coins != null ? currentUser.coins : 0;
  if (av) {
    var letter = (currentUser.first_name || '?')[0];
    av.src = currentUser.photo_url ||
      'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle fill="#2a5a8c" cx="20" cy="20" r="20"/><text x="20" y="26" text-anchor="middle" fill="#fff" font-size="16">' +
        letter + '</text></svg>');
  }
}
window.renderUser = renderUser;

function createCardEl(card, opts) {
  opts = opts || {};
  var el = document.createElement('div');
  el.className = 'card';
  if (opts.back) { el.classList.add('back'); return el; }
  var suitInfo = CARD_SUITS[card.suit] || CARD_SUITS.spades;
  el.classList.add(suitInfo.color);
  if (opts.playable) el.classList.add('playable');
  if (opts.extraClass) el.classList.add(opts.extraClass);
  el.innerHTML = '<span class="rank">' + (RANK_LABEL[card.rank] || card.rank) +
    '</span><span class="suit">' + suitInfo.symbol + '</span>';
  if (opts.onClick) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      opts.onClick(card, el);
    });
  }
  return el;
}

function renderTrumpPile(state) {
  var face = $('trump-card-face');
  var count = $('deck-count');
  var big = $('trump-suit-big');
  if (count) count.textContent = state.deckCount;
  var card = state.trumpCard || { rank: '6', suit: state.trump };
  var suitInfo = CARD_SUITS[card.suit] || CARD_SUITS[state.trump] || CARD_SUITS.spades;
  if (face) {
    face.className = 'trump-card-face ' + suitInfo.color;
    face.innerHTML = '<span class="rank">' + (RANK_LABEL[card.rank] || card.rank) +
      '</span><span class="suit">' + suitInfo.symbol + '</span>';
    face.style.display = state.deckCount > 0 || state.trumpCard ? 'flex' : 'none';
  }
  if (big) {
    big.textContent = suitInfo.symbol;
    big.className = 'trump-suit-big ' + suitInfo.color;
  }
  var stack = $('deck-stack');
  if (stack) stack.style.display = state.deckCount > 0 ? 'block' : 'none';
}

function startTimer(seconds) {
  clearInterval(timerInterval);
  timerSeconds = seconds || 15;
  var el = $('timer');
  if (!el) return;
  el.textContent = timerSeconds;
  el.classList.remove('urgent');
  timerInterval = setInterval(function () {
    timerSeconds -= 1;
    el.textContent = timerSeconds;
    if (timerSeconds <= 5) el.classList.add('urgent');
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      el.textContent = '0';
      if (mode === 'bot' && game) {
        if (game.defender && game.defender.id === myId &&
            (game.phase === 'defend' || game.phase === 'throw')) {
          game.take(myId); sfxTake(); renderFromGame();
        } else if (game.attacker && game.attacker.id === myId &&
            game.table.length && game.uncoveredCount() === 0) {
          game.bito(myId); sfxBito(); renderFromGame();
        }
      } else if (mode === 'online' && onlineState && ws && ws.readyState === 1) {
        var st = onlineState;
        if (st.defenderId === myId && (st.phase === 'defend' || st.phase === 'throw')) {
          ws.send(JSON.stringify({ type: 'take' }));
        } else if (st.attackerId === myId && st.table && st.table.length) {
          var uncovered = false;
          for (var i = 0; i < st.table.length; i++) if (!st.table[i].defend) uncovered = true;
          if (!uncovered) ws.send(JSON.stringify({ type: 'bito' }));
        }
      }
    }
  }, 1000);
}

function renderFromGame() {
  if (!game) return;
  renderTableState(game.getPublicState(myId), {
    legal: game.getLegalMoves(myId),
    onAttack: function (card) {
      var res = game.attack(myId, card);
      if (!res.ok) flash(res.error);
      else { sfxPlay(); renderFromGame(); }
    },
    onDefend: function (idx, card) {
      var res = game.defend(myId, idx, card);
      if (!res.ok) flash(res.error);
      else { sfxDefend(); renderFromGame(); }
    },
  });
  startTimer(15);
  maybeBotTurn();
}

function renderTableState(state, opts) {
  opts = opts || {};
  if (selectedDefendIndex != null) {
    var okSel = state.table && state.table[selectedDefendIndex] && !state.table[selectedDefendIndex].defend;
    if (!okSel) selectedDefendIndex = null;
  }
  var legal = opts.legal || state.legal || { attacks: [], defends: [] };

  var me = null;
  for (var i = 0; i < state.players.length; i++) {
    if (state.players[i].id === myId) me = state.players[i];
  }
  renderTrumpPile(state);

  var oppRoot = $('opponents');
  if (oppRoot) {
    oppRoot.innerHTML = '';
    for (var j = 0; j < state.players.length; j++) {
      var p = state.players[j];
      if (p.id === myId) continue;
      var active = p.id === state.attackerId || p.id === state.defenderId;
      var div = document.createElement('div');
      div.className = 'opponent' + (active ? ' active' : '');
      div.innerHTML = '<img class="avatar" src="" alt="" /><span class="name">' + p.name +
        '</span><span class="cards-count">' + p.cardsCount + '</span>';
      div.querySelector('img').src = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle fill="#2a5a8c" cx="18" cy="18" r="18"/><text x="18" y="23" text-anchor="middle" fill="#fff" font-size="14">' +
        (p.name || '?')[0] + '</text></svg>');
      oppRoot.appendChild(div);
    }
  }

  var isDefender = state.defenderId === myId;
  var isAttacker = state.attackerId === myId;
  var role = 'wait';
  if (state.phase === 'finished') role = 'finished';
  else if (isDefender && (state.phase === 'defend' || state.phase === 'throw')) role = 'defend';
  else if (isAttacker && (state.phase === 'attack' || state.phase === 'throw' || state.phase === 'defend')) role = 'attack';

  var tableArea = document.querySelector('.table-area');
  if (tableArea) {
    if (role === 'attack') tableArea.setAttribute('data-drop', 'table');
    else tableArea.removeAttribute('data-drop');
  }

  var tableRoot = $('table-cards');
  var hint = $('table-hint');
  if (tableRoot) tableRoot.innerHTML = '';

  if (state.phase === 'finished') {
    if (hint) {
      hint.classList.remove('hide');
      var fool = null;
      for (var f = 0; f < state.players.length; f++) {
        if (state.players[f].id === state.foolId) fool = state.players[f];
      }
      hint.textContent = fool ? (fool.id === myId ? 'Вы — дурак' : 'Дурак: ' + fool.name) : 'Игра окончена';
    }
  } else if (!state.table || !state.table.length) {
    if (hint) {
      hint.classList.remove('hide');
      hint.textContent = role === 'attack' ? 'Ваш ход — атакуйте' : 'Ожидание хода...';
    }
  } else {
    if (hint) {
      if (role === 'defend') {
        hint.classList.remove('hide');
        hint.textContent = 'Перетащи карту из руки на нужную на столе';
      } else if (role === 'attack') {
        hint.classList.remove('hide');
        hint.textContent = 'Подкиньте или Пас';
      } else {
        hint.classList.add('hide');
      }
    }
    for (var t = 0; t < state.table.length; t++) {
      (function (tIdx, pair) {
        var wrap = document.createElement('div');
        wrap.className = 'table-pair' + (!pair.defend ? ' uncovered' : '');
        wrap.appendChild(createCardEl(pair.attack, { extraClass: 'attack' }));
        if (pair.defend) wrap.appendChild(createCardEl(pair.defend, { extraClass: 'defend' }));
        if (!pair.defend) {
          wrap.setAttribute('data-drop', role === 'defend' ? 'defend' : 'attack');
          wrap.setAttribute('data-attack-index', String(tIdx));
        }
        if (tableRoot) tableRoot.appendChild(wrap);
      })(t, state.table[t]);
    }
  }

  var attackKeys = {};
  for (var a = 0; a < (legal.attacks || []).length; a++) attackKeys[cardKey(legal.attacks[a])] = true;
  var defendByCard = {};
  for (var d = 0; d < (legal.defends || []).length; d++) {
    var dd = legal.defends[d];
    var dk = cardKey(dd.card);
    if (!defendByCard[dk]) defendByCard[dk] = [];
    defendByCard[dk].push(dd.attackIndex);
  }

  var allCovered = state.table && state.table.length > 0;
  if (state.table) {
    for (var c0 = 0; c0 < state.table.length; c0++) {
      if (!state.table[c0].defend) allCovered = false;
    }
  } else allCovered = false;

  var handRoot = $('player-hand');
  if (handRoot) {
    handRoot.innerHTML = '';
    handRoot.className = 'hand';
    var hand = (me && me.hand) || [];
    if (hand.length >= 10) handRoot.classList.add('crowded');
    else if (hand.length >= 7) handRoot.classList.add('many');

    for (var h = 0; h < hand.length; h++) {
      (function (card) {
        var key = cardKey(card);
        var canAttack = role === 'attack' && attackKeys[key];
        var canDefend = role === 'defend' && defendByCard[key];
        var canPlay = canAttack || canDefend;
        var el = createCardEl(card, { playable: !!canPlay });
        if (canPlay && typeof window.attachCardPlay === 'function') {
          window.attachCardPlay(el, {
            card: card,
            canAttack: !!canAttack,
            canDefend: !!canDefend,
            defendIdxs: canDefend ? defendByCard[key].slice() : [],
            onAttack: function (c) {
              ensureAudio();
              if (opts.onAttack) opts.onAttack(c);
            },
            onDefend: function (idx, c) {
              ensureAudio();
              if (opts.onDefend) opts.onDefend(idx, c);
            },
          });
        } else if (canPlay) {
          el.addEventListener('click', function () {
            ensureAudio();
            if (canAttack && opts.onAttack) opts.onAttack(card);
            else if (canDefend && opts.onDefend) opts.onDefend(defendByCard[key][0], card);
          });
        }
        handRoot.appendChild(el);
      })(hand[h]);
    }
  }

  var btnTake = $('btn-take'), btnDone = $('btn-done'), btnPass = $('btn-pass');
  if (btnTake) btnTake.classList.add('hidden');
  if (btnDone) btnDone.classList.add('hidden');
  if (btnPass) btnPass.classList.add('hidden');

  if (role === 'defend') {
    if (btnTake) btnTake.classList.remove('hidden');
    if (allCovered && btnDone) {
      btnDone.classList.remove('hidden');
      btnDone.textContent = 'Бито';
    }
  } else if (role === 'attack' && state.table && state.table.length > 0) {
    if (allCovered) {
      if (btnPass) { btnPass.classList.remove('hidden'); btnPass.textContent = 'Пас'; }
      if (btnDone) { btnDone.classList.remove('hidden'); btnDone.textContent = 'Бито'; }
    }
  }
}

function maybeBotTurn() {
  if (!game || game.phase === 'finished' || mode !== 'bot') return;
  var actorId = null;
  if (game.phase === 'defend' && isBotId(game.defender.id)) actorId = game.defender.id;
  else if ((game.phase === 'attack' || game.phase === 'throw') && isBotId(game.attacker.id))
    actorId = game.attacker.id;
  else if (game.phase === 'defend' && isBotId(game.attacker.id)) {
    if (Math.random() < 0.35) actorId = game.attacker.id;
  }
  if (!actorId) return;

  setTimeout(function () {
    if (!game || game.phase === 'finished') return;
    if (game.phase === 'throw' && isBotId(game.attacker.id)) {
      var moves = game.getLegalMoves(game.attacker.id);
      if (game.table.length && game.uncoveredCount() === 0) {
        if (!moves.attacks || !moves.attacks.length || Math.random() < 0.4) {
          game.bito(game.attacker.id); sfxBito(); renderFromGame(); return;
        }
      }
    }
    if (typeof window.durakBotMove === 'function') {
      var res = window.durakBotMove(game, actorId);
      if (res && res.ok) { sfxPlay(); renderFromGame(); }
      else if (game.phase === 'throw' && isBotId(game.attacker.id) && game.uncoveredCount() === 0) {
        game.bito(game.attacker.id); sfxBito(); renderFromGame();
      }
    }
  }, 550);
}

function startVsBot() {
  ensureAudio();
  if (typeof window.DurakGame !== 'function') {
    flash('Движок не загрузился');
    return;
  }
  mode = 'bot';
  onlineState = null;
  selectedDefendIndex = null;
  var name = (currentUser && currentUser.first_name) || 'Игрок';
  myId = String((currentUser && currentUser.telegram_id) || 'player');
  var players = [{ id: myId, name: name }];
  var bots = playerCount - 1;
  for (var i = 0; i < bots; i++) {
    players.push({ id: 'bot' + (i + 1), name: bots === 1 ? 'Бот' : 'Бот ' + (i + 1) });
  }
  game = new window.DurakGame(players);
  game.start();
  showScreen('game');
  renderFromGame();
}

function startOnline() {
  var pc = playerCount || 2;
  var slot = Math.floor(Date.now() / 15000);
  if (typeof window.startOnlineRoom === 'function') {
    window.startOnlineRoom('mm_' + pc + '_' + slot);
    return;
  }
  ensureAudio();
  mode = 'online';
  game = null;
  onlineState = null;
  myId = String((currentUser && currentUser.telegram_id) || ('guest_' + Math.random().toString(36).slice(2, 8)));
  var name = encodeURIComponent((currentUser && currentUser.first_name) || 'Игрок');
  var roomId = 'mm_' + pc + '_' + slot;
  showScreen('game');
  $('table-hint').classList.remove('hide');
  $('table-hint').textContent = 'Поиск соперника...';
  $('player-hand').innerHTML = '';
  $('opponents').innerHTML = '';
  $('table-cards').innerHTML = '';
  if (ws) try { ws.close(); } catch (e) {}
  ws = new WebSocket(WS_BASE + '/ws/' + roomId + '?userId=' + encodeURIComponent(myId) + '&username=' + name);
  ws.onopen = function () {
    $('table-hint').textContent = 'Подключено...';
    ws.send(JSON.stringify({ type: 'join', userId: myId, name: (currentUser && currentUser.first_name) || 'Игрок' }));
  };
  ws.onmessage = function (ev) {
    try {
      var msg = JSON.parse(ev.data);
      if (msg.type === 'welcome' || msg.type === 'player_joined') {
        var n = (msg.players && msg.players.length) || 1;
        $('table-hint').textContent = 'В комнате: ' + n + '/2';
      }
      if (msg.type === 'state' && msg.state) renderOnlineState(msg.state);
      if (msg.type === 'error') flash(msg.message);
    } catch (e) {}
  };
  ws.onclose = function () {
    $('table-hint').classList.remove('hide');
    $('table-hint').textContent = 'Соединение закрыто';
  };
}
window.startOnline = startOnline;

function renderOnlineState(state) {
  if (!state) return;
  onlineState = state;
  showScreen('game');
  renderTableState(state, {
    legal: state.legal || { attacks: [], defends: [] },
    onAttack: function (card) {
      if (!ws || ws.readyState !== 1) return;
      sfxPlay();
      ws.send(JSON.stringify({ type: 'attack', card: card }));
    },
    onDefend: function (idx, card) {
      if (!ws || ws.readyState !== 1) return;
      sfxDefend();
      ws.send(JSON.stringify({ type: 'defend', attackIndex: idx, card: card }));
    },
  });
  var left = 15;
  if (state.turnDeadline) left = Math.max(1, Math.ceil((state.turnDeadline - Date.now()) / 1000));
  startTimer(left);
}
window.renderOnlineState = renderOnlineState;

function wsSend(type, extra) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(Object.assign({ type: type }, extra || {})));
}

async function authenticate() {
  try {
    if (!tg || !tg.initData) {
      currentUser = { telegram_id: 0, first_name: 'Демо', username: 'demo', coins: 1000, wins_random: 0, photo_url: '' };
      authToken = '0'; window.__authToken = '0'; myId = 'player';
      renderUser(); showScreen('menu'); return;
    }
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 5000);
    var res = await fetch(API_BASE + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg.initData,
        referrerId: (function () {
          var sp = (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || null;
          if (!sp && tg.initData) {
            try {
              var p = new URLSearchParams(tg.initData);
              sp = p.get('start_param');
            } catch (e) {}
          }
          if (!sp) return null;
          var n = parseInt(String(sp).replace(/\D/g, ''), 10);
          return isNaN(n) ? null : n;
        })(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'auth error');
    currentUser = data.user; authToken = data.token; window.__authToken = data.token;
    myId = String(currentUser.telegram_id);
    renderUser(); showScreen('menu');
  } catch (err) {
    console.error(err);
    currentUser = { telegram_id: 0, first_name: 'Игрок', username: 'guest', coins: 0, wins_random: 0, photo_url: '' };
    try {
      if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser.telegram_id = tg.initDataUnsafe.user.id || 0;
        currentUser.first_name = tg.initDataUnsafe.user.first_name || 'Игрок';
        myId = String(currentUser.telegram_id || 'player');
        authToken = myId; window.__authToken = myId;
      }
    } catch (e) {}
    renderUser(); showScreen('menu');
  }
}

async function loadLeaderboard() {
  showScreen('leaderboard');
  var list = $('lb-list');
  if (list) list.innerHTML = '<p style="opacity:0.6">...</p>';
  try {
    var res = await fetch(API_BASE + '/leaderboard');
    var data = await res.json();
    if (!data.ok) throw new Error('err');
    if (!data.leaderboard.length) { list.innerHTML = '<p style="opacity:0.6">Пока пусто</p>'; return; }
    var html = '';
    for (var i = 0; i < data.leaderboard.length; i++) {
      var u = data.leaderboard[i];
      html += '<div class="lb-item"><span class="lb-rank">' + (i + 1) +
        '</span><img src="' + (u.photo_url || '') +
        '" onerror="this.style.display=\'none\'" /><span class="lb-name">' +
        (u.first_name || u.username || '?') +
        '</span><span class="lb-wins">' + u.wins_random + '</span></div>';
    }
    list.innerHTML = html;
  } catch (e) {
    if (list) list.innerHTML = '<p style="color:#ff8a80">' + e.message + '</p>';
  }
}

function bind() {
  var countRoot = $('player-count-btns');
  if (countRoot) {
    countRoot.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-count]');
      if (!btn) return;
      playerCount = parseInt(btn.getAttribute('data-count'), 10) || 2;
      var buttons = countRoot.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) buttons[i].classList.toggle('active', buttons[i] === btn);
    });
  }
  if ($('btn-quick')) $('btn-quick').addEventListener('click', startVsBot);
  if ($('btn-vs-bot')) $('btn-vs-bot').addEventListener('click', startVsBot);
  if ($('btn-online')) $('btn-online').addEventListener('click', startOnline);
  if ($('btn-leaderboard')) $('btn-leaderboard').addEventListener('click', loadLeaderboard);
  if ($('btn-back-lb')) $('btn-back-lb').addEventListener('click', function () { showScreen('menu'); });
  if ($('btn-leave')) $('btn-leave').addEventListener('click', function () {
    clearInterval(timerInterval); game = null; onlineState = null;
    if (ws) try { ws.close(); } catch (e) {}
    ws = null; showScreen('menu');
  });

  if ($('btn-take')) $('btn-take').addEventListener('click', function () {
    if (mode === 'bot' && game) {
      var res = game.take(myId);
      if (!res.ok) flash(res.error); else { sfxTake(); renderFromGame(); }
    } else if (mode === 'online') { sfxTake(); wsSend('take'); }
  });
  if ($('btn-done')) $('btn-done').addEventListener('click', function () {
    if (mode === 'bot' && game) {
      var res = game.bito(myId);
      if (!res.ok) flash(res.error); else { sfxBito(); renderFromGame(); }
    } else if (mode === 'online') { sfxBito(); wsSend('bito'); }
  });
  if ($('btn-pass')) $('btn-pass').addEventListener('click', function () {
    if (mode === 'bot' && game) {
      var res = game.bito(myId);
      if (!res.ok) res = game.pass(myId);
      if (!res.ok) flash(res.error); else { sfxBito(); renderFromGame(); }
    } else if (mode === 'online') { sfxBito(); wsSend('pass'); }
  });

  ['btn-tournament', 'btn-settings'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('click', function () { flash('Скоро'); });
  });

  if ($('btn-shop')) $('btn-shop').addEventListener('click', function () {
    if (typeof window.openShopScreen === 'function') window.openShopScreen();
    else showScreen('shop');
  });
  if ($('btn-friends')) $('btn-friends').addEventListener('click', function () {
    if (typeof window.openFriendsScreen === 'function') window.openFriendsScreen();
    else showScreen('friends');
  });
  if ($('btn-referral')) $('btn-referral').addEventListener('click', function () {
    if (typeof window.openReferralScreen === 'function') window.openReferralScreen();
    else showScreen('referral');
  });
  if ($('btn-back-shop')) $('btn-back-shop').addEventListener('click', function () { showScreen('menu'); });
  if ($('btn-back-friends')) $('btn-back-friends').addEventListener('click', function () { showScreen('menu'); });
  if ($('btn-back-ref')) $('btn-back-ref').addEventListener('click', function () { showScreen('menu'); });

  document.body.addEventListener('touchstart', ensureAudio, { once: true });
  document.body.addEventListener('click', ensureAudio, { once: true });
}

try { bind(); } catch (e) { console.error('bind error', e); }
try { authenticate(); } catch (e) {
  console.error('auth error', e);
  try { showScreen('menu'); } catch (e2) {}
}
setTimeout(function () {
  try {
    var loading = document.getElementById('loading');
    if (loading && !loading.classList.contains('hidden')) {
      if (typeof showScreen === 'function') showScreen('menu');
      else {
        loading.classList.add('hidden');
        var menu = document.getElementById('menu');
        if (menu) menu.classList.remove('hidden');
      }
    }
  } catch (e) {}
}, 3500);
