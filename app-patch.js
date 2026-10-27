/** Patch screens + export startVsBot + centered hand */
(function () {
  try {
    if (typeof window.showScreen === 'function') {
      var _show = window.showScreen;
      window.showScreen = function (name) {
        [
          'quests', 'profile', 'settings', 'tournament', 'shop', 'friends',
          'referral', 'leaderboard', 'menu', 'game', 'loading',
        ].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.classList.add('hidden');
        });
        var el = document.getElementById(name);
        if (el) el.classList.remove('hidden');
      };
    }
  } catch (e) {}

  // export startVsBot for menu-ui
  setTimeout(function () {
    try {
      if (typeof startVsBot === 'function' && !window.startVsBot) {
        window.startVsBot = startVsBot;
      }
    } catch (e) {}
  }, 300);

  var lastPhase = null;
  setInterval(function () {
    try {
      if (typeof game !== 'undefined' && game && game.phase === 'finished' && lastPhase !== 'finished') {
        lastPhase = 'finished';
        var foolId = game.foolId;
        var mid = typeof myId !== 'undefined' ? myId : null;
        var res = foolId && mid && String(foolId) === String(mid) ? 'lose' : 'win';
        var m = typeof mode !== 'undefined' ? mode : 'bot';
        if (typeof window.reportGameEnd === 'function') window.reportGameEnd(m, res, res === 'win' ? 25 : 0);
      }
      if (typeof game !== 'undefined' && game && game.phase !== 'finished') lastPhase = game.phase;
    } catch (e) {}
  }, 1000);

  // keep hand single-row centered
  setInterval(function () {
    var hand = document.getElementById('player-hand');
    if (!hand) return;
    var n = hand.querySelectorAll('.card').length;
    hand.classList.remove('many', 'crowded');
    if (n >= 10) hand.classList.add('crowded');
    else if (n >= 7) hand.classList.add('many');
    // scroll active card into view gently
  }, 500);
})();
