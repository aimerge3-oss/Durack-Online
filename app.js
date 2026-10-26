/**
 * Durack Online — Frontend
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
let myId = 'player';
const botId = 'bot';

function $(id) {
  return document.getElementById(id);
}

const screens = {
  loading: $('loading'),
  menu: $('menu'),
  leaderboard: $('leaderboard'),
  game: $('game'),
};

function showScreen(name) {
  Object.keys(screens).forEach(function (k) {
    if (screens[k]) screens[k].classList.add('hidden');
  });
  if (screens[name]) screens[name].classList.remove('hidden');
}

function cardKey(c) {
  return c.rank + '_' + c.suit;
}

function flash(msg) {
  if (tg && tg.showAlert) tg.showAlert(String(msg));
  else {
    var hint = $('table-hint');
    if (hint) {
      hint.classList.remove('hide');
      hint.textContent = String(msg);
    }
  }
}

function renderUser() {
  if (!currentUser) return;
  var nameEl = $('user-name');
  var coinsEl = $('user-coins');
  var av = $('user-avatar');
  if (nameEl) nameEl.textContent = currentUser.first_name || currentUser.username || 'Игрок';
  if (coinsEl) coinsEl.textContent = currentUser.coins != null ? currentUser.coins : 0;
  if (av) {
    var letter = (currentUser.first_name || '?')[0];
    av.src = currentUser.photo_url ||
      'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle fill="#2a5a8c" cx="20" cy="20" r="20"/><text x="20" y="26" text-anchor="middle" fill="#fff" font-size="16">' +
          letter +
          '</text></svg>'
      );
  }
}

function createCardEl(card, opts) {
  opts = opts || {};
  var el = document.createElement('div');
  el.className = 'card';
  if (opts.back) {
    el.classList.add('back');
    return el;
  }
  var suitInfo = SUITS[card.suit] || SUITS.spades;
  el.classList.add(suitInfo.color);
  if (opts.playable) el.classList.add('playable');
  if (opts.extraClass) el.classList.add(opts.extraClass);
  el.innerHTML =
    '<span class="rank">' +
    (RANK_LABEL[card.rank] || card.rank) +
    '</span><span class="suit">' +
    suitInfo.symbol +
    '</span>';
  if (opts.onClick) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      opts.onClick(card, el);
    });
  }
  return el;
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
      if (game && game.defender && game.defender.id === myId &&
          (game.phase === 'defend' || game.phase === 'throw')) {
        game.take(myId);
        renderFromGame();
      } else if (game && game.attacker && game.attacker.id === myId &&
          game.phase === 'throw' && game.uncoveredCount() === 0) {
        game.bito(myId);
        renderFromGame();
      }
    }
  }, 1000);
}

function renderFromGame() {
  if (!game) return;
  var state = game.getPublicState(myId);
  renderGameUI(state);
  startTimer(15);
  maybeBotTurn();
}

function renderGameUI(state) {
  var me = null;
  for (var i = 0; i < state.players.length; i++) {
    if (state.players[i].id === myId) me = state.players[i];
  }

  var trumpInfo = SUITS[state.trump] || SUITS.spades;
  var trumpEl = $('trump-suit');
  if (trumpEl) {
    trumpEl.textContent = trumpInfo.symbol;
    trumpEl.className = 'trump-suit ' + trumpInfo.color;
  }
  var deckEl = $('deck-count');
  if (deckEl) deckEl.textContent = state.deckCount;

  var oppRoot = $('opponents');
  if (oppRoot) {
    oppRoot.innerHTML = '';
    for (var j = 0; j < state.players.length; j++) {
      var p = state.players[j];
      if (p.id === myId) continue;
      var active = p.id === state.attackerId || p.id === state.defenderId;
      var div = document.createElement('div');
      div.className = 'opponent' + (active ? ' active' : '');
      div.innerHTML =
        '<img class="avatar" src="" alt="" /><span class="name">' +
        p.name +
        '</span><span class="cards-count">' +
        p.cardsCount +
        '</span>';
      div.querySelector('img').src =
        'data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle fill="#2a5a8c" cx="18" cy="18" r="18"/><text x="18" y="23" text-anchor="middle" fill="#fff" font-size="14">' +
            (p.name || '?')[0] +
            '</text></svg>'
        );
      oppRoot.appendChild(div);
    }
  }

  var isDefender = state.defenderId === myId;
  var isAttacker = state.attackerId === myId;
  var role = 'wait';
  if (state.phase === 'finished') role = 'finished';
  else if (isDefender && (state.phase === 'defend' || state.phase === 'throw')) role = 'defend';
  else if (isAttacker && (state.phase === 'attack' || state.phase === 'throw')) role = 'attack';

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
      hint.textContent = fool
        ? fool.id === myId
          ? 'Вы — дурак'
          : 'Дурак: ' + fool.name
        : 'Игра окончена';
    }
  } else if (!state.table.length) {
    if (hint) {
      hint.classList.remove('hide');
      hint.textContent =
        role === 'attack' ? 'Ваш ход — атакуйте' : 'Ожидание хода...';
    }
  } else {
    if (hint) hint.classList.add('hide');
    for (var t = 0; t < state.table.length; t++) {
      var pair = state.table[t];
      var wrap = document.createElement('div');
      wrap.className = 'table-pair' + (!pair.defend ? ' uncovered' : '');
      wrap.appendChild(createCardEl(pair.attack, { extraClass: 'attack' }));
      if (pair.defend) {
        wrap.appendChild(createCardEl(pair.defend, { extraClass: 'defend' }));
      }
      if (tableRoot) tableRoot.appendChild(wrap);
    }
  }

  var legal = game.getLegalMoves(myId);
  var attackKeys = {};
  for (var a = 0; a < (legal.attacks || []).length; a++) {
    attackKeys[cardKey(legal.attacks[a])] = true;
  }
  var defendByCard = {};
  for (var d = 0; d < (legal.defends || []).length; d++) {
    var dd = legal.defends[d];
    var dk = cardKey(dd.card);
    if (!defendByCard[dk]) defendByCard[dk] = [];
    defendByCard[dk].push(dd.attackIndex);
  }

  var handRoot = $('player-hand');
  if (handRoot) {
    handRoot.innerHTML = '';
    var hand = (me && me.hand) || [];
    for (var h = 0; h < hand.length; h++) {
      (function (card) {
        var key = cardKey(card);
        var canAttack = role === 'attack' && attackKeys[key];
        var canDefend = role === 'defend' && defendByCard[key];
        var canPlay = canAttack || canDefend;
        var el = createCardEl(card, {
          playable: !!canPlay,
          onClick: canPlay
            ? function () {
                if (canAttack) {
                  var res = game.attack(myId, card);
                  if (!res.ok) flash(res.error);
                  else renderFromGame();
                } else if (canDefend) {
                  var idx = defendByCard[key][0];
                  var res2 = game.defend(myId, idx, card);
                  if (!res2.ok) flash(res2.error);
                  else renderFromGame();
                }
              }
            : null,
        });
        if (!canPlay) el.style.opacity = '0.5';
        handRoot.appendChild(el);
      })(hand[h]);
    }
  }

  var btnTake = $('btn-take');
  var btnDone = $('btn-done');
  var btnPass = $('btn-pass');
  if (btnTake) btnTake.classList.add('hidden');
  if (btnDone) btnDone.classList.add('hidden');
  if (btnPass) btnPass.classList.add('hidden');

  if (role === 'defend') {
    if (btnTake) btnTake.classList.remove('hidden');
    var allCovered = state.table.length > 0;
    for (var c = 0; c < state.table.length; c++) {
      if (!state.table[c].defend) allCovered = false;
    }
    if (allCovered && btnDone) {
      btnDone.classList.remove('hidden');
      btnDone.textContent = 'Бито';
    }
  } else if (role === 'attack') {
    var allCovered2 = state.table.length > 0;
    for (var c2 = 0; c2 < state.table.length; c2++) {
      if (!state.table[c2].defend) allCovered2 = false;
    }
    if (allCovered2 && btnDone) {
      btnDone.classList.remove('hidden');
      btnDone.textContent = 'Бито';
    }
  }
}

function maybeBotTurn() {
  if (!game || game.phase === 'finished') return;
  var botTurn =
    (game.attacker.id === botId && (game.phase === 'attack' || game.phase === 'throw')) ||
    (game.defender.id === botId && game.phase === 'defend');
  if (!botTurn) return;

  setTimeout(function () {
    if (!game || game.phase === 'finished') return;
    if (game.phase === 'throw' && game.attacker.id === botId) {
      var moves = game.getLegalMoves(botId);
      if ((!moves.attacks || !moves.attacks.length) && game.uncoveredCount() === 0) {
        game.bito(botId);
        renderFromGame();
        return;
      }
    }
    if (typeof window.durakBotMove === 'function') {
      var res = window.durakBotMove(game, botId);
      if (res && res.ok) renderFromGame();
      else if (game.phase === 'throw' && game.attacker.id === botId && game.uncoveredCount() === 0) {
        game.bito(botId);
        renderFromGame();
      }
    }
  }, 600);
}

function startVsBot() {
  if (typeof window.DurakGame !== 'function') {
    flash('Движок не загрузился. Обновите страницу.');
    return;
  }
  var name = (currentUser && currentUser.first_name) || 'Игрок';
  myId = String((currentUser && currentUser.telegram_id) || 'player');
  game = new window.DurakGame([
    { id: myId, name: name },
    { id: botId, name: 'Бот' },
  ]);
  game.start();
  showScreen('game');
  renderFromGame();
}

async function authenticate() {
  try {
    if (!tg || !tg.initData) {
      currentUser = {
        telegram_id: 0,
        first_name: 'Демо',
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

    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, 8000);

    var res = await fetch(API_BASE + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg.initData,
        referrerId:
          tg.initDataUnsafe && tg.initDataUnsafe.start_param
            ? parseInt(tg.initDataUnsafe.start_param, 10)
            : null,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'auth error');

    currentUser = data.user;
    authToken = data.token;
    myId = String(currentUser.telegram_id);
    renderUser();
    showScreen('menu');
  } catch (err) {
    console.error(err);
    // Не виснем на загрузке — пускаем в меню демо
    currentUser = {
      telegram_id: 0,
      first_name: 'Игрок',
      username: 'guest',
      coins: 0,
      wins_random: 0,
      photo_url: '',
    };
    myId = 'player';
    renderUser();
    showScreen('menu');
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
    if (!data.leaderboard.length) {
      list.innerHTML = '<p style="opacity:0.6">Пока пусто</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < data.leaderboard.length; i++) {
      var u = data.leaderboard[i];
      html +=
        '<div class="lb-item"><span class="lb-rank">' +
        (i + 1) +
        '</span><img src="' +
        (u.photo_url || '') +
        '" onerror="this.style.display=\'none\'" /><span class="lb-name">' +
        (u.first_name || u.username || '?') +
        '</span><span class="lb-wins">' +
        u.wins_random +
        '</span></div>';
    }
    list.innerHTML = html;
  } catch (e) {
    if (list) list.innerHTML = '<p style="color:#ff8a80">' + e.message + '</p>';
  }
}

function bind() {
  var btnQuick = $('btn-quick');
  var btnBot = $('btn-vs-bot');
  if (btnQuick) btnQuick.addEventListener('click', startVsBot);
  if (btnBot) btnBot.addEventListener('click', startVsBot);

  var btnLb = $('btn-leaderboard');
  if (btnLb) btnLb.addEventListener('click', loadLeaderboard);

  var btnBack = $('btn-back-lb');
  if (btnBack) btnBack.addEventListener('click', function () {
    showScreen('menu');
  });

  var btnLeave = $('btn-leave');
  if (btnLeave) {
    btnLeave.addEventListener('click', function () {
      clearInterval(timerInterval);
      game = null;
      showScreen('menu');
    });
  }

  var btnTake = $('btn-take');
  if (btnTake) {
    btnTake.addEventListener('click', function () {
      if (!game) return;
      var res = game.take(myId);
      if (!res.ok) flash(res.error);
      else renderFromGame();
    });
  }

  var btnDone = $('btn-done');
  if (btnDone) {
    btnDone.addEventListener('click', function () {
      if (!game) return;
      var res = game.bito(myId);
      if (!res.ok) flash(res.error);
      else renderFromGame();
    });
  }

  ['btn-tournament', 'btn-friends', 'btn-shop', 'btn-settings'].forEach(function (id) {
    var el = $(id);
    if (el) {
      el.addEventListener('click', function () {
        flash('Скоро');
      });
    }
  });
}

bind();
authenticate();
