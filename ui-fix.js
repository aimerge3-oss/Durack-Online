/** UI fixes: leaderboard compact, avatar opens profile, trump force-show */
(function () {
  function $(id) { return document.getElementById(id); }

  // Avatar / name -> profile
  function wireProfileClick() {
    var info = document.querySelector('.user-info');
    if (!info) return;
    info.style.cursor = 'pointer';
    info.onclick = function () {
      if (typeof window.openProfileScreen === 'function') window.openProfileScreen();
      else if (typeof window.showScreen === 'function') window.showScreen('profile');
    };
  }

  // Patch loadLeaderboard if present
  function fixLeaderboardHtml() {
    var list = $('lb-list');
    if (!list) return;
    // If broken large images exist, constrain them
    list.querySelectorAll('img').forEach(function (img) {
      img.classList.add('lb-avatar');
      img.style.width = '40px';
      img.style.height = '40px';
      img.style.borderRadius = '50%';
      img.style.objectFit = 'cover';
      img.style.flexShrink = '0';
    });
  }

  // Observe leaderboard list
  var obs = new MutationObserver(fixLeaderboardHtml);
  setTimeout(function () {
    var list = $('lb-list');
    if (list) obs.observe(list, { childList: true, subtree: true });
    fixLeaderboardHtml();
  }, 500);

  // Override loadLeaderboard render via fetch intercept is hard; wrap after app loads
  setTimeout(function () {
    if (typeof window.loadLeaderboard === 'function') return;
    // patch by replacing btn handler already in app - rebind
    var btn = $('btn-leaderboard');
    if (!btn) return;
    btn.addEventListener('click', function () {
      setTimeout(fixLeaderboardHtml, 400);
      setTimeout(fixLeaderboardHtml, 1200);
    });
  }, 600);

  // Force trump face always visible when game has trump in DOM
  setInterval(function () {
    var face = $('trump-card-face');
    if (!face) return;
    if (!face.innerHTML || face.innerHTML.trim() === '') return;
    face.style.display = 'flex';
  }, 800);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireProfileClick);
  } else {
    wireProfileClick();
  }
  setTimeout(wireProfileClick, 1000);
})();
