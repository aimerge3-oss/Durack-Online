/**
 * Stage 3: settings, stickers in-game, tournament UI, matchmaking polish
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var KEY = 'durack_settings_v1';

  function $(id) { return document.getElementById(id); }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { sound: true, vibro: true, haptics: true };
  }

  function saveSettings(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    window.__durackSettings = s;
  }

  var settings = loadSettings();
  window.__durackSettings = settings;

  window.durackSoundEnabled = function () {
    return !!(window.__durackSettings && window.__durackSettings.sound);
  };
  window.durackVibroEnabled = function () {
    return !!(window.__durackSettings && window.__durackSettings.vibro);
  };

  window.durackVibrate = function (pattern) {
    if (!window.durackVibroEnabled()) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern || 30);
    } catch (e) {}
    try {
      var tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.HapticFeedback && settings.haptics) {
        tg.HapticFeedback.impactOccurred('light');
      }
    } catch (e) {}
  };

  // patch playTone if available later
  var _origPlayTone = null;
  function wrapAudio() {
    // sfx functions check durackSoundEnabled inside app via window
  }

  function show(name) {
    if (typeof window.showScreen === 'function') window.showScreen(name);
    else {
      ['loading', 'menu', 'leaderboard', 'shop', 'friends', 'referral', 'settings', 'tournament', 'game'].forEach(function (n) {
        var el = $(n);
        if (el) el.classList.toggle('hidden', n !== name);
      });
    }
  }

  function openSettings() {
    show('settings');
    var s = loadSettings();
    var sound = $('set-sound');
    var vibro = $('set-vibro');
    if (sound) sound.checked = !!s.sound;
    if (vibro) vibro.checked = !!s.vibro;
  }
  window.openSettingsScreen = openSettings;

  function openTournament() {
    show('tournament');
    var list = $('tournament-list');
    if (!list) return;
    list.innerHTML =
      '<div class="tour-card">' +
      '<div class="tour-title">Дневной рандом</div>' +
      '<p class="tour-desc">Сыграй 3 партии онлайн — получи +50 🪙</p>' +
      '<button class="btn primary btn-sm" id="btn-tour-daily">Играть</button>' +
      '</div>' +
      '<div class="tour-card locked">' +
      '<div class="tour-title">Турнир 8 игроков</div>' +
      '<p class="tour-desc">Сетка на выбывание · скоро</p>' +
      '<button class="btn btn-sm" disabled>Скоро</button>' +
      '</div>';
    var btn = $('btn-tour-daily');
    if (btn) {
      btn.onclick = function () {
        if (typeof window.startOnline === 'function') window.startOnline();
        else show('menu');
      };
    }
  }
  window.openTournamentScreen = openTournament;

  function getToken() {
    try { if (window.__authToken) return String(window.__authToken); } catch (e) {}
    try {
      var u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return null;
  }

  function renderStickersBar(stickers) {
    var bar = $('stickers-bar');
    if (!bar) return;
    bar.innerHTML = '';
    if (!stickers || !stickers.length) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    stickers.forEach(function (s) {
      if (!s.owned) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sticker-chip';
      b.textContent = s.emoji || '🃏';
      b.title = s.name || '';
      b.addEventListener('click', function () {
        window.durackVibrate(20);
        var hint = $('table-hint');
        if (hint) {
          hint.classList.remove('hide');
          hint.textContent = (s.emoji || '') + ' ' + (s.name || 'Стикер');
          setTimeout(function () {
            if (hint.textContent.indexOf(s.name) !== -1) hint.classList.add('hide');
          }, 1500);
        }
        // visual float
        var float = document.createElement('div');
        float.className = 'sticker-float';
        float.textContent = s.emoji || '🃏';
        document.body.appendChild(float);
        setTimeout(function () {
          if (float.parentNode) float.parentNode.removeChild(float);
        }, 900);
      });
      bar.appendChild(b);
    });
    if (!bar.children.length) bar.classList.add('hidden');
  }

  function loadOwnedStickers() {
    var token = getToken();
    fetch(API + '/shop', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.stickers) {
          window.__ownedStickers = data.stickers.filter(function (s) { return s.owned; });
          renderStickersBar(data.stickers);
        }
      })
      .catch(function () {});
  }
  window.refreshStickersBar = loadOwnedStickers;

  // matchmaking polish: better status under online button area via table-hint already
  // expose helper for waiting UI
  window.setMatchStatus = function (text) {
    var hint = $('table-hint');
    if (hint) {
      hint.classList.remove('hide');
      hint.textContent = text;
    }
  };

  function bind() {
    if ($('btn-settings')) {
      $('btn-settings').onclick = function () { openSettings(); };
    }
    if ($('btn-back-settings')) {
      $('btn-back-settings').onclick = function () { show('menu'); };
    }
    if ($('btn-tournament')) {
      $('btn-tournament').onclick = function () { openTournament(); };
    }
    if ($('btn-back-tournament')) {
      $('btn-back-tournament').onclick = function () { show('menu'); };
    }
    if ($('set-sound')) {
      $('set-sound').onchange = function () {
        settings.sound = !!$('set-sound').checked;
        saveSettings(settings);
        if (settings.sound && typeof window.sfxPlay === 'function') window.sfxPlay();
      };
    }
    if ($('set-vibro')) {
      $('set-vibro').onchange = function () {
        settings.vibro = !!$('set-vibro').checked;
        saveSettings(settings);
        if (settings.vibro) window.durackVibrate(40);
      };
    }

    // remove "Скоро" if app.js bound it — rebind after delay
    setTimeout(function () {
      if ($('btn-settings')) $('btn-settings').onclick = function () { openSettings(); };
      if ($('btn-tournament')) $('btn-tournament').onclick = function () { openTournament(); };
    }, 300);

    // load stickers when menu shown
    setTimeout(loadOwnedStickers, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
