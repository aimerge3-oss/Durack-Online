/**
 * Профиль как всплывающее окно
 * openProfileModal(telegramId?) — свой или чужой
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';

  function token() {
    try { if (window.__authToken) return String(window.__authToken); } catch (e) {}
    try {
      var u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return null;
  }

  function headers() {
    var h = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function ensureModal() {
    var m = document.getElementById('profile-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'profile-modal';
    m.className = 'modal-overlay hidden';
    m.innerHTML =
      '<div class="modal-sheet" role="dialog">' +
      '<button type="button" class="modal-close" id="profile-modal-close">×</button>' +
      '<div id="profile-modal-body" class="modal-body">...</div>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m) closeProfileModal();
    });
    document.getElementById('profile-modal-close').onclick = closeProfileModal;
    return m;
  }

  function closeProfileModal() {
    var m = document.getElementById('profile-modal');
    if (m) m.classList.add('hidden');
  }
  window.closeProfileModal = closeProfileModal;

  function openProfileModal(telegramId) {
    var m = ensureModal();
    var body = document.getElementById('profile-modal-body');
    body.innerHTML = '<p style="opacity:.6;text-align:center;padding:24px">...</p>';
    m.classList.remove('hidden');

    var url = telegramId ? API + '/profile/' + telegramId : API + '/profile';
    fetch(url, { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'err');
        var u = data.user;
        var name = u.first_name || u.username || 'Игрок';
        var letter = name.charAt(0);
        var photo = u.photo_url
          ? '<img class="modal-avatar" src="' + u.photo_url.replace(/"/g, '') + '" alt="" />'
          : '<div class="modal-avatar modal-avatar-letter">' + letter + '</div>';

        var coinsBlock =
          u.coins != null
            ? '<div class="modal-stat"><b>' + u.coins + '</b><span>монет</span></div>'
            : '';

        var hist = (data.history || u.history || []).slice(0, 8).map(function (h) {
          var icon = h.result === 'win' ? '✅' : '❌';
          return (
            '<div class="hist-row"><span>' +
            icon +
            ' ' +
            (h.mode || '') +
            '</span><span>' +
            String(h.created_at || '').slice(5, 16) +
            '</span></div>'
          );
        }).join('') || '<p style="opacity:.5;font-size:13px">Нет игр</p>';

        body.innerHTML =
          '<div class="modal-profile-head">' +
          photo +
          '<div class="modal-name">' +
          name +
          '</div>' +
          (u.username ? '<div class="modal-username">@' + u.username + '</div>' : '') +
          '</div>' +
          '<div class="modal-stats">' +
          coinsBlock +
          '<div class="modal-stat"><b>' +
          (u.wins_random || 0) +
          '</b><span>побед</span></div>' +
          '<div class="modal-stat"><b>' +
          (u.games_total || 0) +
          '</b><span>игр</span></div>' +
          '</div>' +
          '<h3 class="modal-section">Последние</h3>' +
          '<div class="hist-list">' +
          hist +
          '</div>';
      })
      .catch(function (e) {
        body.innerHTML =
          '<p style="color:#ff8a80;text-align:center;padding:24px">' + (e.message || 'error') + '</p>';
      });
  }
  window.openProfileModal = openProfileModal;

  // свой профиль
  window.openProfileScreen = function () {
    openProfileModal(null);
  };

  function bind() {
    var info = document.querySelector('.user-info');
    if (info && !info.__modalBound) {
      info.__modalBound = true;
      info.style.cursor = 'pointer';
      info.addEventListener('click', function () {
        openProfileModal(null);
      });
    }
    var btn = document.getElementById('btn-profile');
    if (btn && !btn.__modalBound) {
      btn.__modalBound = true;
      btn.addEventListener(
        'click',
        function (e) {
          e.stopImmediatePropagation();
          openProfileModal(null);
        },
        true
      );
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 600);
})();
