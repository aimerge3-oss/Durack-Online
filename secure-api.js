/**
 * Все API-запросы с X-Telegram-Init-Data (жёсткий HMAC на сервере)
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';

  function getInitData() {
    try {
      if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) {
        return Telegram.WebApp.initData;
      }
    } catch (e) {}
    return '';
  }

  function getTelegramId() {
    try {
      if (window.__authToken) return String(window.__authToken);
    } catch (e) {}
    try {
      var u =
        window.Telegram &&
        Telegram.WebApp &&
        Telegram.WebApp.initDataUnsafe &&
        Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return null;
  }

  window.apiHeaders = function (extra) {
    var h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    var initData = getInitData();
    if (initData) {
      h['X-Telegram-Init-Data'] = initData;
      h['Authorization'] = 'tma ' + initData;
    } else {
      var tid = getTelegramId();
      if (tid) h['Authorization'] = 'Bearer ' + tid;
    }
    return h;
  };

  window.apiFetch = function (path, opts) {
    opts = opts || {};
    var headers = window.apiHeaders(opts.headers || {});
    return fetch(API + path, Object.assign({}, opts, { headers: headers }));
  };

  // патч reportGameEnd — уникальный eventId
  var origReport = window.reportGameEnd;
  window.reportGameEnd = function (mode, result, coinsDelta) {
    var eventId =
      'g_' +
      Date.now() +
      '_' +
      Math.random().toString(36).slice(2, 9);
    window
      .apiFetch('/quests/event', {
        method: 'POST',
        body: JSON.stringify({
          mode: mode || 'bot',
          result: result || 'lose',
          coinsDelta: coinsDelta || 0,
          eventId: eventId,
          ts: Date.now(),
        }),
      })
      .catch(function () {});
    if (typeof origReport === 'function') {
      try {
        origReport(mode, result, coinsDelta);
      } catch (e) {}
    }
  };

  // помочь stage2/4 перейти на apiHeaders
  window.getSecureAuthHeaders = window.apiHeaders;
})();
