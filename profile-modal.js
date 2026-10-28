/**
 * Профиль во всплывающем окне
 * @username не показываем (приватность)
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';

  function getToken() {
    try {
      if (window.__authToken) return String(window.__authToken);
    } catch (e) {}
    try {
      var u =
        window.Telegram &&
        Telegram.WebApp &&
        Telegram.WebApp.initDataUnsafe &&
        Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return null;
  }

  function ensureModal() {
    var m = document.getElementById('profile-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'profile-modal';
    m.className = 'modal-overlay hidden';
    m.innerHTML =
      '<div class="modal-sheet">' +
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
    body.innerHTML = '<p style="opacity:.6;text-align:center">Загрузка...</p>';
    m.classList.remove('hidden');

    var url = telegramId ? API + '/profile/' + telegramId : API + '/profile';
    var headers = {};
    var t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;

    fetch(url, { headers: headers })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok || !data.user) throw new Error('fail');
        var u = data.user;
        // только имя, без @username
        var name = u.first_name || 'Игрок';
        var letter = (name[0] || '?').toUpperCase();
        var avatar =
          u.photo_url ||
          'data:image/svg+xml,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><circle fill="#2a5a8c" cx="36" cy="36" r="36"/><text x="36" y="46" text-anchor="middle" fill="#fff" font-size="28">' +
                letter +
                '</text></svg>'
            );

        var stats =
          '<div class="modal-stats">' +
          '<div class="modal-stat"><b>' +
          (u.wins_random || 0) +
          '</b><span>побед</span></div>' +
          '<div class="modal-stat"><b>' +
          (u.games_total || 0) +
          '</b><span>игр</span></div>';
        if (u.coins != null) {
          stats +=
            '<div class="modal-stat"><b>' + u.coins + '</b><span>монет</span></div>';
        }
        stats += '</div>';

        var hist = '';
        var list = data.history || u.history || [];
        if (list.length) {
          hist = '<div class="modal-section">История</div><div class="hist-list">';
          list.slice(0, 8).forEach(function (h) {
            hist +=
              '<div class="hist-row"><span>' +
              (h.mode || 'game') +
              '</span><span>' +
              (h.result === 'win' ? '✅' : '❌') +
              '</span></div>';
          });
          hist += '</div>';
        }

        body.innerHTML =
          '<div class="modal-profile-head">' +
          '<img class="modal-avatar" src="' +
          avatar +
          '" alt="" />' +
          '<div class="modal-name">' +
          name +
          '</div>' +
          '</div>' +
          stats +
          hist;
      })
      .catch(function () {
        body.innerHTML =
          '<p style="text-align:center;opacity:.7">Не удалось загрузить профиль</p>';
      });
  }
  window.openProfileModal = openProfileModal;

  function bind() {
    var info = document.getElementById('user-info-click');
    if (info) {
      info.addEventListener('click', function () {
        openProfileModal(null);
      });
    }
    var btn = document.getElementById('btn-profile');
    if (btn) {
      btn.addEventListener('click', function () {
        openProfileModal(null);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 400);
})();
