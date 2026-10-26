/**
 * Durack Online — Frontend
 * API: https://durack-online.pozzistory666.workers.dev
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

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  document.body.style.backgroundColor = tg.themeParams.bg_color || '#1a3a5c';
}

let currentUser = null;
let authToken = null;
let selectedCards = [];
let timerInterval = null;
let timerSeconds = 15;

// Demo state for UI preview (until real game logic)
const demoState = {
  trump: 'spades',
  deckCount: 24,
  opponents: [
    { id: 1, name: 'Алекс', cards: 6, active: false },
    { id: 2, name: 'Мария', cards: 5, active: true },
  ],
  table: [
    { attack: { rank: '9', suit: 'hearts' }, defend: { rank: 'J', suit: 'hearts' } },
    { attack: { rank: 'K', suit: 'clubs' }, defend: null },
  ],
  hand: [
    { rank: '6', suit: 'clubs' },
    { rank: '8', suit: 'spades' },
    { rank: '10', suit: 'hearts' },
    { rank: 'Q', suit: 'diamonds' },
    { rank: 'A', suit: 'spades' },
    { rank: '7', suit: 'hearts' },
  ],
  role: 'defend', // attack | defend | throw
};

const $ = (id) => document.getElementById(id);
const screens = {
  loading: $('loading'),
  menu: $('menu'),
  leaderboard: $('leaderboard'),
  game: $('game'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

/* ===== Auth ===== */
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
    if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка авторизации');

    currentUser = data.user;
    authToken = data.token;
    renderUser();
    showScreen('menu');
  } catch (err) {
    console.error(err);
    $('loading').innerHTML = `
      <p style="color:#ff8a80">Ошибка: ${err.message}</p>
      <p style="font-size:13px;opacity:0.7;margin-top:8px">
        Проверьте Worker и TELEGRAM_BOT_TOKEN.
      </p>`;
  }
}

function renderUser() {
  if (!currentUser) return;
  $('user-name').textContent = currentUser.first_name || currentUser.username || 'Игрок';
  $('user-coins').textContent = currentUser.coins ?? 0;
  if (currentUser.photo_url) {
    $('user-avatar').src = currentUser.photo_url;
  } else {
    const letter = (currentUser.first_name || '?')[0];
    $('user-avatar').src =
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle fill="#2a5a8c" cx="20" cy="20" r="20"/><text x="20" y="26" text-anchor="middle" fill="#fff" font-size="16">${letter}</text></svg>`
      );
  }
}

/* ===== Cards ===== */
function createCardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  if (opts.back) {
    el.classList.add('back');
    return el;
  }
  const suitInfo = SUITS[card.suit] || SUITS.spades;
  el.classList.add(suitInfo.color);
  if (opts.selected) el.classList.add('selected');
  if (opts.playable) el.classList.add('playable');
  if (opts.extraClass) el.classList.add(opts.extraClass);

  el.innerHTML = `<span class="rank">${RANK_LABEL[card.rank] || card.rank}</span><span class="suit">${suitInfo.symbol}</span>`;

  if (opts.onClick) {
    el.addEventListener('click', () => opts.onClick(card, el));
  }
  return el;
}

/* ===== Game UI ===== */
function renderGame(state = demoState) {
  // Trump & deck
  const trumpInfo = SUITS[state.trump] || SUITS.spades;
  const trumpEl = $('trump-suit');
  trumpEl.textContent = trumpInfo.symbol;
  trumpEl.className = 'trump-suit ' + trumpInfo.color;
  $('deck-count').textContent = state.deckCount;

  // Opponents
  const oppRoot = $('opponents');
  oppRoot.innerHTML = '';
  state.opponents.forEach((o) => {
    const div = document.createElement('div');
    div.className = 'opponent' + (o.active ? ' active' : '');
    div.innerHTML = `
      <img class="avatar" src="" alt="" />
      <span class="name">${o.name}</span>
      <span class="cards-count">${o.cards}</span>`;
    const img = div.querySelector('img');
    img.src =
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle fill="#2a5a8c" cx="18" cy="18" r="18"/><text x="18" y="23" text-anchor="middle" fill="#fff" font-size="14">${o.name[0]}</text></svg>`
      );
    oppRoot.appendChild(div);
  });

  // Table
  const tableRoot = $('table-cards');
  tableRoot.innerHTML = '';
  const hint = $('table-hint');
  if (!state.table.length) {
    hint.textContent = 'Ожидание хода...';
    hint.classList.remove('hide');
  } else {
    hint.classList.add('hide');
    state.table.forEach((pair) => {
      const wrap = document.createElement('div');
      wrap.className = 'table-pair';
      const attackEl = createCardEl(pair.attack, { extraClass: 'attack' });
      wrap.appendChild(attackEl);
      if (pair.defend) {
        const defendEl = createCardEl(pair.defend, { extraClass: 'defend' });
        wrap.appendChild(defendEl);
      }
      tableRoot.appendChild(wrap);
    });
  }

  // Hand
  const handRoot = $('player-hand');
  handRoot.innerHTML = '';
  selectedCards = [];
  state.hand.forEach((card) => {
    const el = createCardEl(card, {
      playable: true,
      onClick: (c, cardEl) => {
        cardEl.classList.toggle('selected');
        const key = c.rank + c.suit;
        if (cardEl.classList.contains('selected')) {
          selectedCards.push(c);
        } else {
          selectedCards = selectedCards.filter((x) => x.rank + x.suit !== key);
        }
      },
    });
    handRoot.appendChild(el);
  });

  // Actions by role
  const btnTake = $('btn-take');
  const btnDone = $('btn-done');
  const btnPass = $('btn-pass');
  btnTake.classList.add('hidden');
  btnDone.classList.add('hidden');
  btnPass.classList.add('hidden');

  if (state.role === 'defend') {
    btnTake.classList.remove('hidden');
    btnDone.classList.remove('hidden');
    btnDone.textContent = 'Бито';
  } else if (state.role === 'attack') {
    btnDone.classList.remove('hidden');
    btnDone.textContent = 'Пас';
  } else if (state.role === 'throw') {
    btnPass.classList.remove('hidden');
    btnDone.classList.remove('hidden');
    btnDone.textContent = 'Подкинуть';
  }
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
      // auto action later
    }
  }, 1000);
}

function openGameDemo() {
  showScreen('game');
  renderGame(demoState);
  startTimer(15);
}

/* ===== Leaderboard ===== */
async function loadLeaderboard() {
  showScreen('leaderboard');
  const list = $('lb-list');
  list.innerHTML = '<p style="opacity:0.6">Загрузка...</p>';
  try {
    const res = await fetch(`${API_BASE}/leaderboard`);
    const data = await res.json();
    if (!data.ok) throw new Error('Ошибка');
    if (!data.leaderboard.length) {
      list.innerHTML = '<p style="opacity:0.6">Пока никого нет</p>';
      return;
    }
    list.innerHTML = data.leaderboard
      .map(
        (u, i) => `
      <div class="lb-item">
        <span class="lb-rank">${i + 1}</span>
        <img src="${u.photo_url || ''}" onerror="this.style.display='none'" />
        <span class="lb-name">${u.first_name || u.username || 'Игрок'}</span>
        <span class="lb-wins">${u.wins_random} побед</span>
      </div>`
      )
      .join('');
  } catch (e) {
    list.innerHTML = `<p style="color:#ff8a80">${e.message}</p>`;
  }
}

/* ===== Events ===== */
$('btn-quick').addEventListener('click', openGameDemo);
$('btn-leaderboard').addEventListener('click', loadLeaderboard);
$('btn-back-lb').addEventListener('click', () => showScreen('menu'));
$('btn-leave').addEventListener('click', () => {
  clearInterval(timerInterval);
  showScreen('menu');
});

$('btn-take').addEventListener('click', () => {
  if (tg?.showAlert) tg.showAlert('Беру — логика в следующем шаге');
  else alert('Беру — логика в следующем шаге');
});

$('btn-done').addEventListener('click', () => {
  if (tg?.showAlert) tg.showAlert('Бито / Пас — логика в следующем шаге');
  else alert('Бито / Пас — логика в следующем шаге');
});

['btn-tournament', 'btn-friends', 'btn-shop', 'btn-settings'].forEach((id) => {
  $(id).addEventListener('click', () => {
    if (tg?.showAlert) tg.showAlert('Скоро (Этап 2)');
    else alert('Скоро (Этап 2)');
  });
});

authenticate();
