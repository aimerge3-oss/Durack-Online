/**
 * Сортировка руки: масть + номинал по возрастанию, козыри справа
 */
(function () {
  var RANK_ORD = { '6': 0, '7': 1, '8': 2, '9': 3, '10': 4, J: 5, Q: 6, K: 7, A: 8 };
  // некозырные масти слева направо
  var SUIT_ORD = { spades: 0, clubs: 1, diamonds: 2, hearts: 3 };

  window.sortHandCards = function (hand, trump) {
    if (!hand || !hand.length) return hand || [];
    return hand.slice().sort(function (a, b) {
      var aTrump = trump && a.suit === trump ? 1 : 0;
      var bTrump = trump && b.suit === trump ? 1 : 0;
      // козыри всегда справа
      if (aTrump !== bTrump) return aTrump - bTrump;
      if (a.suit !== b.suit) {
        return (SUIT_ORD[a.suit] || 0) - (SUIT_ORD[b.suit] || 0);
      }
      return (RANK_ORD[a.rank] || 0) - (RANK_ORD[b.rank] || 0);
    });
  };

  // патчим renderTableState: сортируем me.hand перед отрисовкой
  function patch() {
    if (typeof window.renderTableState !== 'function') return false;
    if (window.renderTableState.__sorted) return true;
    var orig = window.renderTableState;
    window.renderTableState = function (state, opts) {
      try {
        if (state && state.players) {
          for (var i = 0; i < state.players.length; i++) {
            var p = state.players[i];
            if (p.hand && p.hand.length) {
              p.hand = window.sortHandCards(p.hand, state.trump);
            }
          }
        }
      } catch (e) {}
      return orig.call(this, state, opts);
    };
    window.renderTableState.__sorted = true;
    return true;
  }

  function tryPatch() {
    if (!patch()) setTimeout(tryPatch, 200);
  }
  tryPatch();
  setTimeout(tryPatch, 800);
})();
