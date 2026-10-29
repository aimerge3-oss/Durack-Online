/**
 * Патч renderTableState: поиск me через String(id)
 * Без этого в онлайне рука пустая (number vs string)
 */
(function () {
  function same(a, b) {
    return String(a) === String(b);
  }

  // Перехватываем после того как app.js определил renderOnlineState
  function install() {
    if (typeof window.renderOnlineState !== 'function') return;
    if (window.renderOnlineState.__renderIdFix) return;

    var inner = window.renderOnlineState;
    window.renderOnlineState = function (state) {
      if (!state || !state.players) return inner.call(this, state);

      try {
        var mid =
          (typeof myId !== 'undefined' && myId != null && myId !== '')
            ? String(myId)
            : String((window.myId || (window.currentUser && window.currentUser.telegram_id) || ''));
        myId = mid;
        window.myId = mid;
        mode = 'online';
        game = null;

        // нормализуем id игроков
        for (var i = 0; i < state.players.length; i++) {
          state.players[i].id = String(state.players[i].id);
        }
        if (state.attackerId != null) state.attackerId = String(state.attackerId);
        if (state.defenderId != null) state.defenderId = String(state.defenderId);

        // если рука не пришла — запросим sync
        var me = null;
        for (var j = 0; j < state.players.length; j++) {
          if (same(state.players[j].id, mid)) me = state.players[j];
        }
        if (me && !me.hand && window.ws && window.ws.readyState === 1) {
          try {
            window.ws.send(JSON.stringify({ type: 'sync' }));
          } catch (e) {}
        }
      } catch (e) {}

      return inner.call(this, state);
    };
    window.renderOnlineState.__renderIdFix = true;
  }

  // Патч локальный поиск me в прототипе Function —
  // дублируем рендер руки если после оригинала рука пустая
  function afterRenderFix(state) {
    try {
      var mid = String(
        (typeof myId !== 'undefined' && myId) ||
          window.myId ||
          (window.currentUser && window.currentUser.telegram_id) ||
          ''
      );
      if (!mid || !state || !state.players) return;
      var me = null;
      for (var i = 0; i < state.players.length; i++) {
        if (same(state.players[i].id, mid)) me = state.players[i];
      }
      if (!me || !me.hand || !me.hand.length) return;
      var handRoot = document.getElementById('player-hand');
      if (!handRoot) return;
      // если уже есть карты — ок
      if (handRoot.children.length > 0) return;

      // аварийный рендер руки
      handRoot.innerHTML = '';
      handRoot.className = 'hand';
      if (me.hand.length >= 10) handRoot.classList.add('crowded');
      else if (me.hand.length >= 7) handRoot.classList.add('many');

      for (var h = 0; h < me.hand.length; h++) {
        var card = me.hand[h];
        if (typeof window.createCardEl === 'function') {
          handRoot.appendChild(window.createCardEl(card, { playable: false }));
        } else {
          var el = document.createElement('div');
          el.className = 'card';
          el.textContent = (card.rank || '') + ' ' + (card.suit || '');
          handRoot.appendChild(el);
        }
      }
    } catch (e) {}
  }

  function wrapWithFallback() {
    if (typeof window.renderOnlineState !== 'function') return;
    if (window.renderOnlineState.__fallback) return;
    var prev = window.renderOnlineState;
    window.renderOnlineState = function (state) {
      var r = prev.call(this, state);
      setTimeout(function () {
        afterRenderFix(state);
      }, 0);
      return r;
    };
    window.renderOnlineState.__fallback = true;
  }

  setTimeout(function () {
    install();
    wrapWithFallback();
  }, 300);
  setTimeout(function () {
    install();
    wrapWithFallback();
  }, 1200);
})();
