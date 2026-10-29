/**
 * Сравнение id как строк — иначе рука пустая в онлайне
 */
(function () {
  function sameId(a, b) {
    return String(a) === String(b);
  }

  window.samePlayerId = sameId;

  // патч renderTableState если доступна через перехват renderOnlineState
  var origRenderOnline = null;

  function patch() {
    if (typeof window.renderOnlineState === 'function' && !window.renderOnlineState.__idFix) {
      origRenderOnline = window.renderOnlineState;
      window.renderOnlineState = function (state) {
        if (!state) return;

        // синхрон myId
        try {
          if (window.myId) myId = String(window.myId);
          else if (window.currentUser && window.currentUser.telegram_id)
            myId = String(window.currentUser.telegram_id);
        } catch (e) {}

        try {
          mode = 'online';
          game = null; // не рисуем бота
        } catch (e) {}

        // подставляем hand если id не совпали на сервере
        if (state.players && state.players.length) {
          var mid = String(typeof myId !== 'undefined' ? myId : window.myId || '');
          for (var i = 0; i < state.players.length; i++) {
            var p = state.players[i];
            if (sameId(p.id, mid) && !p.hand && state._hands && state._hands[mid]) {
              p.hand = state._hands[mid];
            }
          }
        }

        return origRenderOnline.call(this, state);
      };
      window.renderOnlineState.__idFix = true;
    }

    // патч локальный renderTableState через обёртку поиска me
    // Нельзя переопределить легко — делаем proxy на рендер из игры
    if (typeof window.renderFromGame === 'function' && !window.renderFromGame.__idFix) {
      var origFg = window.renderFromGame;
      window.renderFromGame = function () {
        try {
          if (window.currentUser && window.currentUser.telegram_id)
            myId = String(window.currentUser.telegram_id);
        } catch (e) {}
        return origFg.apply(this, arguments);
      };
      window.renderFromGame.__idFix = true;
    }
  }

  setTimeout(patch, 200);
  setTimeout(patch, 800);
  setTimeout(patch, 2000);
})();
