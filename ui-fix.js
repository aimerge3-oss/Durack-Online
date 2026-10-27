/** UI: leaderboard profile + trump force + hand classes */
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

  function forceTrump() {
    var face = $('trump-card-face');
    if (!face) return;
    face.style.cssText =
      'position:absolute;left:0;top:50%;width:52px;height:74px;margin-top:-37px;' +
      'background:#fff;border-radius:7px;box-shadow:0 2px 10px rgba(0,0,0,.5);' +
      'display:flex!important;visibility:visible;opacity:1;flex-direction:column;' +
      'align-items:center;justify-content:center;font-weight:700;z-index:1;' +
      'transform:rotate(-18deg);pointer-events:none;';
    if (face.classList.contains('red')) face.style.color = '#c62828';
    else face.style.color = '#212121';
  }

  function fixHandClasses() {
    var hand = $('player-hand');
    if (!hand) return;
    var n = hand.querySelectorAll('.card').length;
    hand.classList.remove('many', 'crowded');
    if (n >= 10) hand.classList.add('crowded');
    else if (n >= 7) hand.classList.add('many');
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

  setInterval(function () {
    forceTrump();
    fixHandClasses();
  }, 400);

  var dropObs = new MutationObserver(function () {
    document.querySelectorAll('.table-pair.uncovered').forEach(function (pair) {
      pair.style.minWidth = '72px';
      pair.style.minHeight = '96px';
    });
    forceTrump();
    fixHandClasses();
  });
  setTimeout(function () {
    var table = $('table-cards');
    if (table) dropObs.observe(table, { childList: true, subtree: true });
    var hand = $('player-hand');
    if (hand) dropObs.observe(hand, { childList: true });
  }, 600);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
