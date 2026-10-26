/**
 * Durack Online — Frontend (Telegram Mini App)
 * API: https://durack-online.pozzistory666.workers.dev
 */

const API_BASE = 'https://durack-online.pozzistory666.workers.dev';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  document.body.style.backgroundColor = tg.themeParams.bg_color || '#1a3a5c';
}

let currentUser = null;
let authToken = null;

const $ = (id) => document.getElementById(id);
const screens = {
  loading: $('loading'),
  menu: $('menu'),
  leaderboard: $('leaderboard'),
  game: $('game')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

async function authenticate() {
  try {
    if (!tg || !tg.initData) {
      console.warn('Нет Telegram.WebApp — демо-режим');
      currentUser = {
        telegram_id: 0,
        first_name: 'Демо',
        username: 'demo',
        coins: 1000,
        wins_random: 0,
        photo_url: ''
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
          : null
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Ошибка авторизации');
    }

    currentUser = data.user;
    authToken = data.token;
    renderUser();
    showScreen('menu');

  } catch (err) {
    console.error(err);
    $('loading').innerHTML = `
      <p style="color:#ff8a80">Ошибка: ${err.message}</p>
      <p style="font-size:13px;opacity:0.7;margin-top:8px">
        Проверьте, что Worker задеплоен и TELEGRAM_BOT_TOKEN установлен.
      </p>
    `;
  }
}

function renderUser() {
  if (!currentUser) return;
  $('user-name').textContent = currentUser.first_name || currentUser.username || 'Игрок';
  $('user-coins').textContent = currentUser.coins ?? 0;
  if (currentUser.photo_url) {
    $('user-avatar').src = currentUser.photo_url;
  } else {
    $('user-avatar').src = 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle fill="#2a5a8c" cx="20" cy="20" r="20"/><text x="20" y="26" text-anchor="middle" fill="#fff" font-size="16">${(currentUser.first_name||'?')[0]}</text></svg>`
    );
  }
}

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

    list.innerHTML = data.leaderboard.map((u, i) => `
      <div class="lb-item">
        <span class="lb-rank">${i + 1}</span>
        <img src="${u.photo_url || ''}" onerror="this.style.display='none'" />
        <span class="lb-name">${u.first_name || u.username || 'Игрок'}</span>
        <span class="lb-wins">${u.wins_random} побед</span>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<p style="color:#ff8a80">${e.message}</p>`;
  }
}

$('btn-quick').addEventListener('click', () => {
  showScreen('game');
  $('room-info').textContent = 'Поиск игры... (логика в Этапе 1)';
});

$('btn-leaderboard').addEventListener('click', loadLeaderboard);
$('btn-back-lb').addEventListener('click', () => showScreen('menu'));
$('btn-leave').addEventListener('click', () => showScreen('menu'));

['btn-tournament', 'btn-friends', 'btn-shop', 'btn-settings'].forEach(id => {
  $(id).addEventListener('click', () => {
    if (tg?.showAlert) {
      tg.showAlert('Скоро будет доступно (Этап 2)');
    } else {
      alert('Скоро будет доступно (Этап 2)');
    }
  });
});

authenticate();
