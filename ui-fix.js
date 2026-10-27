/** UI: leaderboard rows open profile modal + drop zone expand helper */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';

  function $(id) { return document.getElementById(id); }

  function show(name) {
    if (typeof window.showScreen === 'function') window.showScreen(name);
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
          var tid = u.telegram_id || '';
          var letter = name.charAt(0);
          var avatarHtml = photo
            ? '<img class="lb-avatar" src="' + photo.replace(/"/g, '') + '" alt="" />'
            : '<div class="lb-avatar lb-fallback">' + letter + '</div>';
          html +=
            '<div class="lb-item lb-clickable" data-tid="' + tid + '">' +
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
    var btn = $('btn-leaderboard');
    if (btn) {
      btn.addEventListener(
        'click',
        function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          renderLeaderboard();
        },
        true
      );
    }
    if ($('btn-back-lb')) {
      $('btn-back-lb').addEventListener('click', function () { show('menu'); });
    }

    var list = $('lb-list');
    if (list && !list.__profileClick) {
      list.__profileClick = true;
      list.addEventListener('click', function (e) {
        var row = e.target.closest('.lb-item');
        if (!row) return;
        var tid = row.getAttribute('data-tid');
        if (tid && typeof window.openProfileModal === 'function') {
          window.openProfileModal(tid);
        }
      });
    }
  }

  // Expand drop targets after each render: larger hit area
  var dropObs = new MutationObserver(function () {
    document.querySelectorAll('.table-pair.uncovered').forEach(function (pair) {
      pair.style.minWidth = '72px';
      pair.style.minHeight = '96px';
      pair.style.padding = '8px';
      pair.style.margin = '4px';
    });
  });
  setTimeout(function () {
    var table = $('table-cards');
    if (table) dropObs.observe(table, { childList: true, subtree: true });
  }, 800);

  setInterval(function () {
    var face = $('trump-card-face');
    if (face && face.innerHTML && face.innerHTML.trim()) {
      face.style.display = 'flex';
      face.style.visibility = 'visible';
    }
  }, 600);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
