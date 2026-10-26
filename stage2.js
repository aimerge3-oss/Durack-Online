/**
 * Stage 2: shop, referral, friends rooms, matchmaking
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var BOT = 'DurackOnlineBOT';
  var privateRoomCode = null;

  function $(id) { return document.getElementById(id); }

  function getToken() {
    try {
      if (typeof authToken !== 'undefined' && authToken) return String(authToken);
    } catch (e) {}
    try {
      if (window.__authToken) return String(window.__authToken);
    } catch (e) {}
    try {
      var u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return null;
  }

  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function show(name) {
    ['loading', 'menu', 'leaderboard', 'shop', 'friends', 'referral', 'game'].forEach(function (n) {
      var el = $(n);
      if (el) el.classList.toggle('hidden', n !== name);
    });
  }

  function toast(msg) {
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.showAlert) Telegram.WebApp.showAlert(String(msg));
    else alert(msg);
  }

  function myTelegramId() {
    var t = getToken();
    if (t && t !== '0') return t;
    return '0';
  }

  function refLink() {
    return 'https://t.me/' + BOT + '?start=' + myTelegramId();
  }

  function setCoins(n) {
    var a = $('user-coins');
    if (a) a.textContent = n;
    var b = $('shop-coins');
    if (b) b.textContent = n;
  }

  function openShop() {
    show('shop');
    var list = $('shop-list');
    if (list) list.innerHTML = '<p style="opacity:.6">...</p>';
    fetch(API + '/shop', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'err');
        setCoins(data.coins || 0);
        list.innerHTML = '';
        (data.stickers || []).forEach(function (s) {
          var card = document.createElement('div');
          card.className = 'shop-item' + (s.owned ? ' owned' : '');
          card.innerHTML =
            '<div class="shop-emoji">' + (s.emoji || '🃏') + '</div>' +
            '<div class="shop-name">' + s.name + '</div>' +
            '<div class="shop-desc">' + (s.description || '') + '</div>' +
            (s.owned
              ? '<button class="btn btn-sm" disabled>Куплено</button>'
              : '<button class="btn btn-sm primary shop-buy" data-id="' + s.id + '">' + s.price + ' 🪙</button>');
          list.appendChild(card);
        });
      })
      .catch(function (e) {
        if (list) list.innerHTML = '<p style="color:#ff8a80">' + e.message + '</p>';
      });
  }

  function buySticker(id) {
    fetch(API + '/shop/buy', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ stickerId: id }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.ok) throw new Error((res.d && res.d.error) || 'err');
        toast('Куплено: ' + (res.d.sticker.emoji || '') + ' ' + res.d.sticker.name);
        setCoins(res.d.coins);
        openShop();
      })
      .catch(function (e) { toast(e.message); });
  }

  function openReferral() {
    show('referral');
    var el = $('ref-link-text');
    if (el) el.textContent = refLink();
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('Скопировано'); });
    } else toast(t);
  }

  function shareRef() {
    var link = refLink();
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
      Telegram.WebApp.openTelegramLink(
        'https://t.me/share/url?url=' + encodeURIComponent(link) +
        '&text=' + encodeURIComponent('Давай сыграем в Дурак Онлайн!')
      );
    } else copyText(link);
  }

  function randomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function openFriends() {
    show('friends');
    privateRoomCode = null;
    var row = $('room-created-row');
    if (row) row.classList.add('hidden');
    var input = $('room-code-input');
    if (input) input.value = '';
  }

  function createRoom() {
    privateRoomCode = randomCode();
    var row = $('room-created-row');
    if (row) row.classList.remove('hidden');
    var disp = $('room-code-display');
    if (disp) disp.textContent = privateRoomCode;
  }

  function enterPrivateRoom(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code || code.length < 3) { toast('Введи код'); return; }
    window.startOnlineRoom('priv_' + code);
  }

  function shareRoom() {
    if (!privateRoomCode) return;
    var text = 'Заходи в комнату Дурака: ' + privateRoomCode;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
      Telegram.WebApp.openTelegramLink(
        'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/' + BOT) +
        '&text=' + encodeURIComponent(text)
      );
    } else copyText(text);
  }

  window.startOnlineRoom = function (roomId) {
    var tg = window.Telegram && Telegram.WebApp;
    var uid = myTelegramId();
    if (uid === '0') uid = 'guest_' + Math.random().toString(36).slice(2, 8);
    var uname = 'Игрок';
    try {
      if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) {
        uname = tg.initDataUnsafe.user.first_name;
      }
    } catch (e) {}

    roomId = roomId || ('mm_2_' + Math.floor(Date.now() / 15000));

    show('game');
    var hint = $('table-hint');
    if (hint) {
      hint.classList.remove('hide');
      hint.textContent = roomId.indexOf('priv_') === 0
        ? 'Комната ' + roomId.slice(5) + ' — ожидание...'
        : 'Поиск соперника...';
    }
    if ($('player-hand')) $('player-hand').innerHTML = '';
    if ($('opponents')) $('opponents').innerHTML = '';
    if ($('table-cards')) $('table-cards').innerHTML = '';

    try {
      if (typeof mode !== 'undefined') mode = 'online';
      if (typeof myId !== 'undefined') myId = uid;
      if (typeof onlineState !== 'undefined') onlineState = null;
    } catch (e) {}

    var oldWs = window.ws || (typeof ws !== 'undefined' ? ws : null);
    if (oldWs) try { oldWs.close(); } catch (e) {}

    var socket = new WebSocket(
      'wss://durack-online.pozzistory666.workers.dev/ws/' + roomId +
      '?userId=' + encodeURIComponent(uid) +
      '&username=' + encodeURIComponent(uname)
    );
    window.ws = socket;
    try { ws = socket; } catch (e) {}

    socket.onopen = function () {
      if (hint) hint.textContent = 'Подключено...';
      socket.send(JSON.stringify({ type: 'join', userId: uid, name: uname }));
    };
    socket.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'welcome' || msg.type === 'player_joined' || msg.type === 'player_left') {
          var n = (msg.players && msg.players.length) || 1;
          if (hint) { hint.classList.remove('hide'); hint.textContent = 'В комнате: ' + n + '/2'; }
        }
        if (msg.type === 'state' && msg.state) {
          try { onlineState = msg.state; } catch (e) {}
          if (typeof renderOnlineState === 'function') renderOnlineState(msg.state);
        }
        if (msg.type === 'error') toast(msg.message);
        if (msg.type === 'game_over') toast(msg.foolId === uid ? 'Вы — дурак' : 'Игра окончена');
      } catch (e) {}
    };
    socket.onclose = function () {
      if (hint) { hint.classList.remove('hide'); hint.textContent = 'Соединение закрыто'; }
    };
  };

  // polish matchmaking for btn-online
  setTimeout(function () {
    var btn = $('btn-online');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopImmediatePropagation();
        var pc = 2;
        try { if (typeof playerCount !== 'undefined') pc = playerCount; } catch (err) {}
        var slot = Math.floor(Date.now() / 15000);
        window.startOnlineRoom('mm_' + pc + '_' + slot);
      }, true);
    }
  }, 500);

  function bind() {
    if ($('btn-shop')) $('btn-shop').onclick = function (e) { e.stopPropagation(); openShop(); };
    if ($('btn-back-shop')) $('btn-back-shop').onclick = function () { show('menu'); };
    if ($('shop-list')) {
      $('shop-list').addEventListener('click', function (e) {
        var btn = e.target.closest('.shop-buy');
        if (btn) buySticker(parseInt(btn.getAttribute('data-id'), 10));
      });
    }
    if ($('btn-referral')) $('btn-referral').onclick = function (e) { e.stopPropagation(); openReferral(); };
    if ($('btn-back-ref')) $('btn-back-ref').onclick = function () { show('menu'); };
    if ($('btn-share-ref')) $('btn-share-ref').onclick = shareRef;
    if ($('btn-copy-ref')) $('btn-copy-ref').onclick = function () { copyText(refLink()); };
    if ($('btn-friends')) $('btn-friends').onclick = function (e) { e.stopPropagation(); openFriends(); };
    if ($('btn-back-friends')) $('btn-back-friends').onclick = function () { show('menu'); };
    if ($('btn-create-room')) $('btn-create-room').onclick = createRoom;
    if ($('btn-copy-room')) $('btn-copy-room').onclick = function () { if (privateRoomCode) copyText(privateRoomCode); };
    if ($('btn-share-room')) $('btn-share-room').onclick = shareRoom;
    if ($('btn-enter-created')) $('btn-enter-created').onclick = function () { enterPrivateRoom(privateRoomCode); };
    if ($('btn-join-room')) {
      $('btn-join-room').onclick = function () {
        var input = $('room-code-input');
        enterPrivateRoom(input && input.value);
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
