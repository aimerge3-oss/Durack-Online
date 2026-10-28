/**
 * Stage 2: shop, referral, friends
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var BOT = 'DurackOnlineBOT';
  var privateRoomCode = null;

  var FALLBACK_STICKERS = [
    { id: 1, name: 'Классика', price: 50, emoji: '🃏', description: 'Карта', owned: false },
    { id: 2, name: 'Огонь', price: 100, emoji: '🔥', description: 'Жар', owned: false },
    { id: 3, name: 'Молния', price: 150, emoji: '⚡', description: 'Скорость', owned: false },
    { id: 4, name: 'Корона', price: 300, emoji: '👑', description: 'Победитель', owned: false },
    { id: 5, name: 'Черт', price: 200, emoji: '👿', description: 'Дурак', owned: false },
    { id: 6, name: 'Звезда', price: 250, emoji: '⭐', description: 'Удача', owned: false },
    { id: 7, name: 'Роза', price: 80, emoji: '🌹', description: 'Стиль', owned: false },
    { id: 8, name: 'Ракета', price: 500, emoji: '🚀', description: 'Премиум', owned: false },
  ];

  function $(id) { return document.getElementById(id); }

  function getToken() {
    try { if (window.__authToken) return String(window.__authToken); } catch (e) {}
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
    if (typeof window.showScreen === 'function') window.showScreen(name);
  }

  function toast(msg) {
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.showAlert) Telegram.WebApp.showAlert(String(msg));
    else alert(msg);
  }

  function myTelegramId() {
    var t = getToken();
    return t && t !== '0' ? t : '0';
  }

  function refLink() {
    var id = myTelegramId();
    return 'https://t.me/' + BOT + '?startapp=ref_' + id;
  }

  function readMenuCoins() {
    try {
      var el = $('user-coins');
      if (el) return parseInt(el.textContent, 10) || 0;
    } catch (e) {}
    try {
      if (window.currentUser && window.currentUser.coins != null) return window.currentUser.coins;
    } catch (e) {}
    return 0;
  }

  function setCoins(n) {
    if (n == null || isNaN(Number(n))) return;
    n = Number(n);
    var a = $('user-coins');
    if (a) a.textContent = n;
    var b = $('shop-coins');
    if (b) b.textContent = n;
    try {
      if (window.currentUser) window.currentUser.coins = n;
    } catch (e) {}
  }
  window.setCoinsDisplay = setCoins;

  function renderShopList(list, coins) {
    if (coins != null && !isNaN(Number(coins))) setCoins(Number(coins));
    else setCoins(readMenuCoins());
    var root = $('shop-list');
    if (!root) return;
    root.innerHTML = '';
    (list || []).forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'shop-item' + (s.owned ? ' owned' : '');
      card.innerHTML =
        '<div style="font-size:32px">' + (s.emoji || '🃏') + '</div>' +
        '<div class="shop-name">' + s.name + '</div>' +
        '<div class="shop-desc">' + (s.description || '') + '</div>' +
        (s.owned
          ? '<button class="btn btn-sm" disabled>Куплено</button>'
          : '<button class="btn btn-sm primary shop-buy" data-id="' + s.id + '">' + s.price + ' 🪙</button>');
      root.appendChild(card);
    });
  }

  function openShop() {
    show('shop');
    // сразу показываем текущий баланс, чтобы не мелькал
    setCoins(readMenuCoins());
    var list = $('shop-list');
    if (list) list.innerHTML = '<p style="opacity:.6">...</p>';

    // параллельно /me для точного баланса
    fetch(API + '/me', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.user && d.user.coins != null) setCoins(d.user.coins);
      })
      .catch(function () {});

    fetch(API + '/shop', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || 'API');
        // coins из shop только если пришли числом (в т.ч. 0)
        var c = data.coins;
        if (c == null || isNaN(Number(c))) c = readMenuCoins();
        renderShopList(data.stickers || FALLBACK_STICKERS, c);
      })
      .catch(function () {
        renderShopList(FALLBACK_STICKERS, readMenuCoins());
      });
  }
  window.openShopScreen = openShop;

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
        if (typeof window.refreshStickersBar === 'function') window.refreshStickersBar();
      })
      .catch(function (e) { toast(e.message || 'Ошибка покупки'); });
  }

  function openReferral() {
    show('referral');
    var el = $('ref-link-text');
    if (el) el.textContent = refLink();
  }
  window.openReferralScreen = openReferral;

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
        '&text=' + encodeURIComponent('Давай сыграем в Дурак Онлайн! +500 монет за друга')
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
  window.openFriendsScreen = openFriends;

  function createRoom() {
    privateRoomCode = randomCode();
    var row = $('room-created-row');
    if (row) row.classList.remove('hidden');
    var disp = $('room-code-display');
    if (disp) disp.textContent = privateRoomCode;
    toast('Код: ' + privateRoomCode);
  }

  function enterPrivateRoom(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code || code.length < 3) { toast('Введи код'); return; }
    if (typeof window.startOnlineRoom === 'function') {
      window.startOnlineRoom('priv_' + code, { needPlayers: 2, hint: 'Комната ' + code + '...' });
    } else toast('Онлайн не готов');
  }

  function shareRoom() {
    if (!privateRoomCode) return;
    var text = 'Заходи в Дурак! Код: ' + privateRoomCode;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
      Telegram.WebApp.openTelegramLink(
        'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/' + BOT) +
        '&text=' + encodeURIComponent(text)
      );
    } else copyText(text);
  }

  function bind() {
    if ($('shop-list')) {
      $('shop-list').addEventListener('click', function (e) {
        var btn = e.target.closest('.shop-buy');
        if (btn) buySticker(parseInt(btn.getAttribute('data-id'), 10));
      });
    }
    if ($('btn-shop')) $('btn-shop').addEventListener('click', function () { openShop(); });
    if ($('btn-referral')) $('btn-referral').addEventListener('click', function () { openReferral(); });
    if ($('btn-friends')) $('btn-friends').addEventListener('click', function () { openFriends(); });
    if ($('btn-share-ref')) $('btn-share-ref').onclick = shareRef;
    if ($('btn-copy-ref')) $('btn-copy-ref').onclick = function () { copyText(refLink()); };
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
    if ($('btn-back-friends')) $('btn-back-friends').onclick = function () { show('menu'); };
    if ($('btn-back-ref')) $('btn-back-ref').onclick = function () { show('menu'); };
    if ($('btn-back-shop')) $('btn-back-shop').onclick = function () { show('menu'); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 500);
})();
