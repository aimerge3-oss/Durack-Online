/** UI fixes: compact leaderboard, avatar->profile, trump visible */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';

  function $(id) { return document.getElementById(id); }

  function show(name) {
    if (typeof window.showScreen === 'function') window.showScreen(name);
  }

  function wireProfileClick() {
    var info = document.querySelector('.user-info');
    if (!info || info.__profileBound) return;
    info.__profileBound = true;
    info.style.cursor = 'pointer';
    info.addEventListener('click', function () {
      if (typeof window.openProfileScreen === 'function') window.openProfileScreen();
      else show('profile');
    });
  }

  function renderLeaderboard() {
    show('leaderboard');
    var list = $('lb-list');
    if (!list) return;
    list.innerHTML = '<p style="opacity:.6;padding:8px">...</p>';

    fetch(API + '/leaderboard')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error('err');
        var rows = data.leaderboard || [];
        if (!rows.length) {
          list.innerHTML = '<p style="opacity:.6;padding:8px">Пока пусто</p>';
          return;
        }
        var html = '';
        for (var i = 0; i < rows.length; i++) {
          var u = rows[i];
          var name = u.first_name || u.username || '?';
          var photo = u.photo_url || '';
          var wins = u.wins_random != null ? u.wins_random : 0;
          var letter = name.charAt(0);
          var avatarHtml = photo
            ? '<img class="lb-avatar" src="' + photo.replace(/"/g, '') + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" />' +
              '<div class="lb-avatar lb-fallback" style="display:none">' + letter + '</div>'
            : '<div class="lb-avatar lb-fallback">' + letter + '</div>';
          html +=
            '<div class="lb-item">' +
            '<span class="lb-rank">' + (i + 1) + '</span>' +
            avatarHtml +
            '<span class="lb-name">' + name + '</span>' +
            '<span class="lb-wins">' + wins + '</span>' +
            '</div>';
        }
        list.innerHTML = html;
      })
      .catch(function (e) {
        list.innerHTML = '<p style="color:#ff8a80;padding:8px">' + (e.message || 'error') + '</p>';
      });
  }

  function bind() {
    wireProfileClick();
    var btn = $('btn-leaderboard');
    if (btn) {
      // capture so our handler wins over app.js
      btn.addEventListener('click', function (e) {
        e.stopImmediatePropagation();
        e.preventDefault();
        renderLeaderboard();
      }, true);
    }
    if ($('btn-back-lb')) {
      $('btn-back-lb').addEventListener('click', function () { show('menu'); });
    }
  }

  // Always show trump face if content exists
  setInterval(function () {
    var face = $('trump-card-face');
    if (face && face.innerHTML && face.innerHTML.trim()) {
      face.style.display = 'flex';
      face.style.visibility = 'visible';
      face.style.opacity = '1';
    }
  }, 500);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(wireProfileClick, 800);
})();
