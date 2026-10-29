/**
 * Перехват старых authHeaders() → apiHeaders с initData
 */
(function () {
  function patch() {
    if (typeof window.apiHeaders !== 'function') return;

    // stage2 / stage3 / stage4 могут держать локальные функции —
    // перехватываем fetch на workers.dev
    if (window.fetch && !window.fetch.__durackSecure) {
      var nativeFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        try {
          var url = typeof input === 'string' ? input : input && input.url;
          if (url && String(url).indexOf('durack-online.pozzistory666.workers.dev') !== -1) {
            init = init || {};
            var h = window.apiHeaders(init.headers || {});
            // merge
            if (init.headers && typeof init.headers.forEach === 'function') {
              // Headers object
              var merged = h;
              init.headers.forEach(function (v, k) {
                if (k.toLowerCase() !== 'authorization' && k.toLowerCase() !== 'x-telegram-init-data') {
                  merged[k] = v;
                }
              });
              init.headers = merged;
            } else {
              init.headers = Object.assign({}, init.headers || {}, h);
            }
          }
        } catch (e) {}
        return nativeFetch(input, init);
      };
      window.fetch.__durackSecure = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch);
  else patch();
  setTimeout(patch, 200);
  setTimeout(patch, 800);
})();
