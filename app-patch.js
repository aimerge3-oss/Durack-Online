/** Patch screens for quests/profile + report end */
(function () {
  try {
    if (typeof window.showScreen === 'function') {
      var _show = window.showScreen;
      window.showScreen = function (name) {
        ['quests', 'profile', 'settings', 'tournament', 'shop', 'friends', 'referral', 'leaderboard', 'menu', 'game', 'loading'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.classList.add('hidden');
        });
        var el = document.getElementById(name);
        if (el) el.classList.remove('hidden');
      };
    }
  } catch (e) {}

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
})();
