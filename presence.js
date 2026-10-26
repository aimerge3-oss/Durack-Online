/** Online presence badge */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  function $(id) { return document.getElementById(id); }
  function refresh() {
    fetch(API + '/online')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var el = $('online-count');
        if (el && d && d.ok) el.textContent = d.online || 0;
      })
      .catch(function () {});
  }
  function beat() {
    var headers = { 'Content-Type': 'application/json' };
    try {
      if (typeof authToken !== 'undefined' && authToken) {
        headers['Authorization'] = 'Bearer ' + authToken;
      }
    } catch (e) {}
    fetch(API + '/presence', { method: 'POST', headers: headers, body: '{}' }).catch(function () {});
    refresh();
  }
  // после авторизации token появится — повторяем
  setTimeout(beat, 1500);
  setInterval(beat, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) beat();
  });
})();
