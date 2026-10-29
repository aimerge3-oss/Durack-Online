/**
 * Обновление баланса без перезахода (рефералка +500 у реферера)
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var timer = null;

  function headers() {
    if (typeof window.apiHeaders === 'function') return window.apiHeaders();
    var h = {};
    try {
      if (Telegram.WebApp.initData) h['X-Telegram-Init-Data'] = Telegram.WebApp.initData;
    } catch (e) {}
    try {
      if (window.__authToken) h['Authorization'] = 'Bearer ' + window.__authToken;
    } catch (e) {}
    return h;
  }

  function applyCoins(n) {
    if (typeof n !== 'number') return;
    try {
      if (window.currentUser) window.currentUser.coins = n;
    } catch (e) {}
    var el = document.getElementById('user-coins');
    if (el) el.textContent = String(n);
    var shop = document.getElementById('shop-coins');
    if (shop && shop.textContent !== '—') shop.textContent = String(n);
  }

  window.refreshCoins = function () {
    fetch(API + '/me', { headers: headers() })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.user && typeof d.user.coins === 'number') applyCoins(d.user.coins);
        else if (d && typeof d.coins === 'number') applyCoins(d.coins);
      })
      .catch(function () {});
  };

  function start() {
    if (timer) return;
    timer = setInterval(function () {
      // только в меню / не в активной партии часто
      window.refreshCoins();
    }, 15000);
    setTimeout(window.refreshCoins, 3000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
