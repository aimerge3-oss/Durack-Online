/**
 * Стикеры в игре — только экипированные + WS
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var EQUIP_KEY = 'durack_equipped_stickers';

  function $(id) { return document.getElementById(id); }

  function getToken() {
    try { if (window.__authToken) return String(window.__authToken); } catch (e) {}
    try {
      var u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return null;
  }

  function getEquipped() {
    if (typeof window.getEquippedStickerIds === 'function') return window.getEquippedStickerIds();
    try {
      var raw = localStorage.getItem(EQUIP_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(Number) : [];
    } catch (e) {
      return [];
    }
  }

  function myName() {
    try {
      if (window.currentUser && window.currentUser.first_name) return window.currentUser.first_name;
    } catch (e) {}
    return 'Игрок';
  }

  window.showStickerFloat = function (emoji, fromName) {
    var float = document.createElement('div');
    float.className = 'sticker-float';
    float.innerHTML =
      '<div class="sticker-float-emoji">' +
      (emoji || '🃏') +
      '</div>' +
      (fromName ? '<div class="sticker-float-name">' + fromName + '</div>' : '');
    document.body.appendChild(float);
    setTimeout(function () {
      if (float.parentNode) float.parentNode.removeChild(float);
    }, 1800);
    if (typeof window.durackVibrate === 'function') window.durackVibrate(30);
  };

  function sendSticker(s) {
    var payload = {
      type: 'sticker',
      stickerId: s.id,
      emoji: s.emoji || '🃏',
      name: s.name || '',
      fromName: myName(),
    };
    window.showStickerFloat(payload.emoji, null);
    try {
      var sock = window.ws || (typeof ws !== 'undefined' ? ws : null);
      if (sock && sock.readyState === 1) sock.send(JSON.stringify(payload));
    } catch (e) {}
  }

  function renderStickersBar(stickers) {
    var bar = $('stickers-bar');
    if (!bar) return;
    bar.innerHTML = '';
    var equipped = getEquipped();
    var owned = (stickers || []).filter(function (s) {
      return s.owned && (equipped.length === 0 || equipped.indexOf(Number(s.id)) !== -1);
    });
    // если есть экип — только экип; если пусто — все owned
    if (equipped.length) {
      owned = (stickers || []).filter(function (s) {
        return s.owned && equipped.indexOf(Number(s.id)) !== -1;
      });
    }
    if (!owned.length) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    owned.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sticker-chip';
      b.textContent = s.emoji || '🃏';
      b.title = s.name || '';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        sendSticker(s);
      });
      bar.appendChild(b);
    });
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

  window.handleStickerMessage = function (msg) {
    if (!msg || msg.type !== 'sticker') return;
    var myId = '';
    try {
      myId = String(window.myId || (window.currentUser && window.currentUser.telegram_id) || '');
    } catch (e) {}
    if (msg.fromId && myId && String(msg.fromId) === myId) return;
    window.showStickerFloat(msg.emoji, msg.fromName || 'Соперник');
  };

  function patchWs() {
    var orig = window.startOnlineRoom;
    if (typeof orig !== 'function' || orig.__stickerPatch) return;
    window.startOnlineRoom = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        var sock = window.ws;
        if (!sock || sock.__stickerHook) return;
        sock.__stickerHook = true;
        var prev = sock.onmessage;
        sock.onmessage = function (ev) {
          try {
            var msg = JSON.parse(ev.data);
            if (msg.type === 'sticker') window.handleStickerMessage(msg);
          } catch (e) {}
          if (typeof prev === 'function') prev.call(sock, ev);
        };
      }, 100);
      loadOwnedStickers();
      return r;
    };
    window.startOnlineRoom.__stickerPatch = true;
  }

  function onGameScreen() {
    if (typeof window.showScreen !== 'function' || window.showScreen.__stickerBar) return;
    var o = window.showScreen;
    window.showScreen = function (name) {
      var r = o.apply(this, arguments);
      if (name === 'game') loadOwnedStickers();
      return r;
    };
    window.showScreen.__stickerBar = true;
  }

  function boot() {
    patchWs();
    onGameScreen();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 400);
  setTimeout(patchWs, 900);
})();
