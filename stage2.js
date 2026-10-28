/**
 * Stage 2: shop (stable balance) + referral + friends + equip
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var BOT = 'DurackOnlineBOT';
  var privateRoomCode = null;
  var EQUIP_KEY = 'durack_equipped_stickers';
  var lastGoodCoins = null;

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
    return 'https://t.me/' + BOT + '?startapp=ref_' + myTelegramId();
  }

  function readDisplayedCoins() {
    try {
      if (lastGoodCoins != null && !isNaN(lastGoodCoins)) return lastGoodCoins;
    } catch (e) {}
    try {
      if (window.currentUser && window.currentUser.coins != null) return Number(window.currentUser.coins);
    } catch (e) {}
    try {
      var el = $('user-coins');
      if (el) {
        var n = parseInt(el.textContent, 10);
        if (!isNaN(n)) return n;
      }
    } catch (e) {}
    return 0;
  }

  /**
   * force=true после покупки / из /me
   * иначе не затираем баланс нулём из плохого /shop
   */
  function setCoins(n, force) {
    if (n == null || isNaN(Number(n))) return;
    n = Number(n);
    var cur = readDisplayedCoins();
    if (!force && n === 0 && cur > 0) return;
    lastGoodCoins = n;
    var a = $('user-coins');
    if (a) a.textContent = String(n);
    var b = $('shop-coins');
    if (b) b.textContent = String(n);
    try {
      if (window.currentUser) window.currentUser.coins = n;
    } catch (e) {}
  }
  window.setCoinsDisplay = setCoins;

  function getEquipped() {
    try {
      var raw = localStorage.getItem(EQUIP_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.map(Number).filter(function (x) { return x; });
    } catch (e) {
      return [];
    }
  }

  function setEquipped(ids) {
    try {
      localStorage.setItem(EQUIP_KEY, JSON.stringify(ids.slice(0, 8)));
    } catch (e) {}
    window.__equippedStickers = ids.slice(0, 8);
  }
  window.getEquippedStickerIds = getEquipped;

  function renderShopList(list) {
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

  function renderEquipList(list) {
    var root = $('equip-list');
    if (!root) return;
    root.innerHTML = '';
    var owned = (list || []).filter(function (s) { return s.owned; });
    var equipped = getEquipped();
    if (!owned.length) {
      root.innerHTML = '<p style="opacity:.65;text-align:center;grid-column:1/-1">Пока нет стикеров.<br/>Купи во вкладке «Стикеры»</p>';
      return;
    }
    owned.forEach(function (s) {
      var on = equipped.indexOf(Number(s.id)) !== -1;
      var card = document.createElement('div');
      card.className = 'shop-item' + (on ? ' equipped' : '');
      card.innerHTML =
        '<div style="font-size:32px">' + (s.emoji || '🃏') + '</div>' +
        '<div class="shop-name">' + s.name + '</div>' +
        '<button class="btn btn-sm ' + (on ? 'primary' : '') + ' equip-toggle" data-id="' + s.id + '">' +
        (on ? 'Надето ✓' : 'Надеть') +
        '</button>';
      root.appendChild(card);
    });
  }

  function toggleEquip(id) {
    id = Number(id);
    var eq = getEquipped();
    var i = eq.indexOf(id);
    if (i !== -1) eq.splice(i, 1);
    else {
      if (eq.length >= 6) {
        toast('Максимум 6 стикеров в игре');
        return;
      }
      eq.push(id);
    }
    setEquipped(eq);
    if (window.__lastShopStickers) renderEquipList(window.__lastShopStickers);
    if (typeof window.refreshStickersBar === 'function') window.refreshStickersBar();
  }

  function syncCoinsFromMe() {
    return fetch(API + '/me', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.user && d.user.coins != null) {
          setCoins(d.user.coins, true);
        }
      })
      .catch(function () {});
  }

  function openShop() {
    show('shop');
    // сразу фиксируем баланс из меню / памяти — без мигания в 0
    setCoins(readDisplayedCoins(), true);

    var list = $('shop-list');
    if (list) list.innerHTML = '<p style="opacity:.6">...</p>';

    syncCoinsFromMe();

    fetch(API + '/shop', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('shop');
        window.__lastShopStickers = data.stickers || FALLBACK_STICKERS;
        // coins из shop только если число и не лучше чем текущий (или force если > 0)
        if (typeof data.coins === 'number') {
          if (data.coins > 0 || readDisplayedCoins() === 0) {
            setCoins(data.coins, data.coins > 0);
          }
        }
        renderShopList(window.__lastShopStickers);
        renderEquipList(window.__lastShopStickers);

        // авто-экип всех купленных, если ещё ничего не выбрано
        var ownedIds = window.__lastShopStickers.filter(function (s) { return s.owned; }).map(function (s) { return Number(s.id); });
        var eq = getEquipped().filter(function (id) { return ownedIds.indexOf(id) !== -1; });
        if (!eq.length && ownedIds.length) {
          setEquipped(ownedIds.slice(0, 6));
          renderEquipList(window.__lastShopStickers);
        } else {
          setEquipped(eq);
        }
      })
      .catch(function () {
        renderShopList(FALLBACK_STICKERS);
        renderEquipList(FALLBACK_STICKERS);
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
        setCoins(res.d.coins, true);
        // авто надеть новый
        var eq = getEquipped();
        if (eq.indexOf(Number(id)) === -1 && eq.length < 6) {
          eq.push(Number(id));
          setEquipped(eq);
        }
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
  }
  window.openFriendsScreen = openFriends;

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
    if (typeof window.startOnlineRoom === 'function') {
      window.startOnlineRoom('priv_' + code, { needPlayers: 2 });
    }
  }

  function shareRoom() {
    if (!privateRoomCode) return;
    var text = 'Код комнаты Дурак: ' + privateRoomCode;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
      Telegram.WebApp.openTelegramLink(
        'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/' + BOT) +
        '&text=' + encodeURIComponent(text)
      );
    } else copyText(text);
  }

  function bindShopTabs() {
    var tabs = $('shop-tabs');
    if (!tabs || tabs.__bound) return;
    tabs.__bound = true;
    tabs.addEventListener('click', function (e) {
      var t = e.target.closest('.shop-tab');
      if (!t) return;
      var name = t.getAttribute('data-tab');
      tabs.querySelectorAll('.shop-tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      ['stickers', 'equip', 'donate', 'cases'].forEach(function (p) {
        var panel = $('shop-panel-' + p);
        if (!panel) return;
        if (p === name) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      });
      // баланс не трогаем при переключении вкладок
      setCoins(readDisplayedCoins(), true);
    });
  }

  function bind() {
    bindShopTabs();
    if ($('shop-list')) {
      $('shop-list').addEventListener('click', function (e) {
        var btn = e.target.closest('.shop-buy');
        if (btn) buySticker(parseInt(btn.getAttribute('data-id'), 10));
      });
    }
    if ($('equip-list')) {
      $('equip-list').addEventListener('click', function (e) {
        var btn = e.target.closest('.equip-toggle');
        if (btn) toggleEquip(btn.getAttribute('data-id'));
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
        enterPrivateRoom($('room-code-input') && $('room-code-input').value);
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
