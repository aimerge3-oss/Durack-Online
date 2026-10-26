/**
 * Stage 2: shop, referral, friends rooms, matchmaking helpers
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var BOT = 'DurackOnlineBOT';
  var privateRoomCode = null;

  function $(id) {
    return document.getElementById(id);
  }

  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    try {
      if (typeof authToken !== 'undefined' && authToken) {
        h['Authorization'] = 'Bearer ' + authToken;
      }
    } catch (e) {}
    return h;
  }

  function show(name) {
    if (typeof showScreen === 'function') showScreen(name);
    else {
      ['menu', 'leaderboard', 'shop', 'friends', 'referral', 'game', 'loading'].forEach(function (n) {
        var el = $(n);
        if (el) el.classList.toggle('hidden', n !== name);
      });
    }
  }

  function toast(msg) {
    if (typeof flash === 'function') flash(msg);
    else if (window.Telegram && Telegram.WebApp && Telegram.WebApp.showAlert) {
      Telegram.WebApp.showAlert(String(msg));
    } else alert(msg);
  }

  function myTelegramId() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser && currentUser.telegram_id) {
        return String(currentUser.telegram_id);
      }
    } catch (e) {}
    return '0';
  }

  function refLink() {
    var id = myTelegramId();
    return 'https://t.me/' + BOT + '?start=' + id;
  }

  /* ===== Shop ===== */
  function openShop() {
    show('shop');
    var list = $('shop-list');
    if (list) list.innerHTML = '<p style="opacity:.6">...</p>';
    fetch(API + '/shop', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'err');
        var coinsEl = $('shop-coins');
        if (coinsEl) coinsEl.textContent = data.coins || 0;
        try {
          if (typeof currentUser !== 'undefined' && currentUser) {
            currentUser.coins = data.coins;
            if (typeof renderUser === 'function') renderUser();
          }
        } catch (e) {}
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
        try {
          if (typeof currentUser !== 'undefined' && currentUser) {
            currentUser.coins = res.d.coins;
            if (typeof renderUser === 'function') renderUser();
          }
        } catch (e) {}
        openShop();
      })
      .catch(function (e) {
        toast(e.message);
      });
  }

  /* ===== Referral ===== */
  function openReferral() {
    show('referral');
    var el = $('ref-link-text');
    if (el) el.textContent = refLink();
  }

  function shareRef() {
    var link = refLink();
    var text = 'Давай сыграем в Дурак Онлайн! ' + link;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
      Telegram.WebApp.openTelegramLink(
        'https://t.me/share/url?url=' + encodeURIComponent(link) +
        '&text=' + encodeURIComponent('Давай сыграем в Дурак Онлайн!')
      );
    } else if (navigator.share) {
      navigator.share({ title: 'Дурак Онлайн', text: text, url: link }).catch(function () {});
    } else {
      copyText(link);
    }
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('Скопировано'); });
    } else {
      toast(t);
    }
  }

  /* ===== Friends room ===== */
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
    if (!code || code.length < 3) {
      toast('Введи код комнаты');
      return;
    }
    // переиспользуем онлайн-подключение с фиксированным room id
    if (typeof startOnlineRoom === 'function') {
      startOnlineRoom('priv_' + code);
    } else if (typeof startOnline === 'function') {
      // fallback: monkey-patch room id via global
      window.__forceRoomId = 'priv_' + code;
      startOnline();
    } else {
      toast('Онлайн не готов');
    }
  }

  function shareRoom() {
    if (!privateRoomCode) return;
    var text = 'Заходи в комнату Дурака: ' + privateRoomCode;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
      Telegram.WebApp.openTelegramLink(
        'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/' + BOT) +
        '&text=' + encodeURIComponent(text)
      );
    } else {
      copyText(text);
    }
  }

  /* ===== Matchmaking polish: expose startOnlineRoom ===== */
  window.startOnlineRoom = function (roomId) {
    if (typeof ensureAudio === 'function') ensureAudio();
    try {
      mode = 'online';
      game = null;
      onlineState = null;
      myId = String(
        (typeof currentUser !== 'undefined' && currentUser && currentUser.telegram_id) ||
          'guest_' + Math.random().toString(36).slice(2, 8)
      );
    } catch (e) {}

    var name = encodeURIComponent(
      (typeof currentUser !== 'undefined' && currentUser && currentUser.first_name) || 'Игрок'
    );
    roomId = roomId || window.__forceRoomId || ('quick_' + Math.floor(Date.now() / 30000));
    window.__forceRoomId = null;

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

    if (typeof ws !== 'undefined' && ws) {
      try { ws.close(); } catch (e) {}
    }

    var WS = 'wss://durack-online.pozzistory666.workers.dev';
    var socket = new WebSocket(
      WS + '/ws/' + roomId +
        '?userId=' + encodeURIComponent(myId) +
        '&username=' + name
    );
    try { ws = socket; } catch (e) { window.ws = socket; }

    socket.onopen = function () {
      if (hint) hint.textContent = 'Подключено...';
      socket.send(
        JSON.stringify({
          type: 'join',
          userId: myId,
          name: (typeof currentUser !== 'undefined' && currentUser && currentUser.first_name) || 'Игрок',
        })
      );
    };
    socket.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'welcome' || msg.type === 'player_joined' || msg.type === 'player_left') {
          var n = (msg.players && msg.players.length) || 1;
          if (hint && !onlineState) {
            hint.classList.remove('hide');
            hint.textContent = 'В комнате: ' + n + '/2';
          }
        }
        if (msg.type === 'state' && msg.state) {
          onlineState = msg.state;
          if (typeof renderOnlineState === 'function') renderOnlineState(msg.state);
        }
        if (msg.type === 'game_started' && typeof sfxPlay === 'function') sfxPlay();
        if (msg.type === 'game_over') {
          toast(msg.foolId === myId ? 'Вы — дурак' : 'Игра окончена');
        }
        if (msg.type === 'error') toast(msg.message);
      } catch (e) {}
    };
    socket.onclose = function () {
      if (hint) {
        hint.classList.remove('hide');
        hint.textContent = 'Соединение закрыто';
      }
    };
  };

  // Override startOnline to use polished room
  var _origStartOnline = window.startOnline;
  window.startOnline = function () {
    if (window.__forceRoomId) {
      window.startOnlineRoom(window.__forceRoomId);
      return;
    }
    // лучший matchmaking: слот 15 сек + playerCount
    var slot = Math.floor(Date.now() / 15000);
    var pc = typeof playerCount !== 'undefined' ? playerCount : 2;
    window.startOnlineRoom('mm_' + pc + '_' + slot);
  };

  function bind() {
    var shopBtn = $('btn-shop');
    if (shopBtn) shopBtn.onclick = openShop;
    var backShop = $('btn-back-shop');
    if (backShop) backShop.onclick = function () { show('menu'); };

    var shopList = $('shop-list');
    if (shopList) {
      shopList.addEventListener('click', function (e) {
        var btn = e.target.closest('.shop-buy');
        if (!btn) return;
        buySticker(parseInt(btn.getAttribute('data-id'), 10));
      });
    }

    var refBtn = $('btn-referral');
    if (refBtn) refBtn.onclick = openReferral;
    var backRef = $('btn-back-ref');
    if (backRef) backRef.onclick = function () { show('menu'); };
    var shareRefBtn = $('btn-share-ref');
    if (shareRefBtn) shareRefBtn.onclick = shareRef;
    var copyRefBtn = $('btn-copy-ref');
    if (copyRefBtn) copyRefBtn.onclick = function () { copyText(refLink()); };

    var friendsBtn = $('btn-friends');
    if (friendsBtn) friendsBtn.onclick = openFriends;
    var backFriends = $('btn-back-friends');
    if (backFriends) backFriends.onclick = function () { show('menu'); };
    var createBtn = $('btn-create-room');
    if (createBtn) createBtn.onclick = createRoom;
    var copyRoom = $('btn-copy-room');
    if (copyRoom) copyRoom.onclick = function () { if (privateRoomCode) copyText(privateRoomCode); };
    var shareRoomBtn = $('btn-share-room');
    if (shareRoomBtn) shareRoomBtn.onclick = shareRoom;
    var enterCreated = $('btn-enter-created');
    if (enterCreated) enterCreated.onclick = function () { enterPrivateRoom(privateRoomCode); };
    var joinBtn = $('btn-join-room');
    if (joinBtn) {
      joinBtn.onclick = function () {
        var input = $('room-code-input');
        enterPrivateRoom(input && input.value);
      };
    }

    // убираем старые «Скоро» на shop/friends если повесились в app.js
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
