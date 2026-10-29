/**
 * Админ-панель (видна только ADMIN_IDS)
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var isAdminUser = false;

  function $(id) {
    return document.getElementById(id);
  }

  function headers() {
    if (typeof window.apiHeaders === 'function') return window.apiHeaders();
    var h = { 'Content-Type': 'application/json' };
    try {
      if (Telegram.WebApp.initData) h['X-Telegram-Init-Data'] = Telegram.WebApp.initData;
    } catch (e) {}
    return h;
  }

  function toast(msg) {
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.showAlert)
      Telegram.WebApp.showAlert(String(msg));
    else alert(msg);
  }

  function ensureAdminScreen() {
    if ($('admin')) return;
    var el = document.createElement('div');
    el.id = 'admin';
    el.className = 'screen hidden';
    el.innerHTML =
      '<div class="header"><button class="btn-back" id="btn-back-admin">← Назад</button>' +
      '<h2>Админка <span class="admin-badge">ADMIN</span></h2></div>' +
      '<div class="admin-panel" id="admin-panel"><p style="opacity:.6">Загрузка...</p></div>';
    document.getElementById('app').appendChild(el);
    $('btn-back-admin').onclick = function () {
      if (typeof window.showScreen === 'function') window.showScreen('menu');
    };
  }

  function ensureAdminBtn() {
    if ($('btn-admin')) return;
    var foot = document.querySelector('.menu-foot-links');
    if (!foot) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'link-btn';
    b.id = 'btn-admin';
    b.textContent = 'Админ';
    b.style.color = '#ffeb3b';
    foot.appendChild(b);
    b.onclick = openAdmin;
  }

  function openAdmin() {
    ensureAdminScreen();
    if (typeof window.showScreen === 'function') window.showScreen('admin');
    loadAdmin();
  }
  window.openAdminPanel = openAdmin;

  function loadAdmin() {
    var panel = $('admin-panel');
    if (!panel) return;
    panel.innerHTML = '<p style="opacity:.6">...</p>';

    Promise.all([
      fetch(API + '/admin/me', { headers: headers() }).then(function (r) {
        return r.json();
      }),
      fetch(API + '/admin/stats', { headers: headers() }).then(function (r) {
        return r.json();
      }),
    ])
      .then(function (arr) {
        var me = arr[0];
        var st = arr[1];
        if (!me || !me.admin) {
          panel.innerHTML = '<p style="color:#ff8a80">Нет доступа</p>';
          return;
        }
        var s = (st && st.stats) || {};
        panel.innerHTML =
          '<div class="admin-stat-grid">' +
          '<div class="admin-stat"><b>' +
          (s.users || 0) +
          '</b><span>игроков</span></div>' +
          '<div class="admin-stat"><b>' +
          (s.onlineApprox || 0) +
          '</b><span>онлайн ~</span></div>' +
          '<div class="admin-stat"><b>' +
          (s.games || 0) +
          '</b><span>игр</span></div>' +
          '<div class="admin-stat"><b>' +
          (s.totalCoins || 0) +
          '</b><span>монет всего</span></div>' +
          '<div class="admin-stat"><b>' +
          (s.referrals || 0) +
          '</b><span>рефералов</span></div>' +
          '<div class="admin-stat"><b>' +
          (s.stickerPurchases || 0) +
          '</b><span>стикеров</span></div>' +
          '</div>' +
          '<div class="admin-card">' +
          '<h3>Выдать / снять монеты</h3>' +
          '<div class="admin-row"><input class="input" id="adm-tid" placeholder="Telegram ID" inputmode="numeric" /></div>' +
          '<div class="admin-row"><input class="input" id="adm-amt" placeholder="Сумма (+/-)" inputmode="numeric" />' +
          '<button class="btn primary btn-sm" id="adm-grant" style="width:auto;padding:12px 16px">OK</button></div>' +
          '</div>' +
          '<div class="admin-card">' +
          '<h3>Турнир</h3>' +
          '<button class="btn primary" id="adm-tour-create">Создать турнир (приз 20)</button>' +
          '<p style="font-size:12px;opacity:.6">Масштабные турниры — только через админку</p>' +
          '</div>';

        $('adm-grant').onclick = function () {
          var tid = parseInt($('adm-tid').value, 10);
          var amount = parseInt($('adm-amt').value, 10);
          fetch(API + '/admin/coins', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ telegramId: tid, amount: amount }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              if (!d.ok) throw new Error(d.error || 'err');
              toast('Баланс: ' + d.coins);
              loadAdmin();
            })
            .catch(function (e) {
              toast(e.message);
            });
        };

        $('adm-tour-create').onclick = function () {
          fetch(API + '/admin/tournament', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ title: 'Турнир', prize: 20, maxPlayers: 8 }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              if (!d.ok && !d.code) throw new Error(d.error || 'err');
              toast('Турнир: ' + (d.code || d.tournament && d.tournament.code || 'ok'));
            })
            .catch(function (e) {
              toast(e.message);
            });
        };
      })
      .catch(function (e) {
        panel.innerHTML = '<p style="color:#ff8a80">' + (e.message || 'error') + '</p>';
      });
  }

  function checkAdmin() {
    fetch(API + '/admin/me', { headers: headers() })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.admin) {
          isAdminUser = true;
          ensureAdminBtn();
        }
      })
      .catch(function () {});
  }

  // профиль всегда кликабелен
  function bindProfile() {
    var info = $('user-info-click');
    if (!info || info.__adminProf) return;
    info.__adminProf = true;
    info.style.cursor = 'pointer';
    info.addEventListener('click', function () {
      if (typeof window.openProfileModal === 'function') window.openProfileModal(null);
    });
  }

  function boot() {
    bindProfile();
    setTimeout(checkAdmin, 600);
    setTimeout(checkAdmin, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
