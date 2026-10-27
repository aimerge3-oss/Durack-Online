/**
 * Stage 4: quests, profile, admin tournaments
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';

  function $(id) { return document.getElementById(id); }

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

  function show(name) {
    if (typeof window.showScreen === 'function') window.showScreen(name);
  }

  function toast(msg) {
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.showAlert) Telegram.WebApp.showAlert(String(msg));
    else alert(msg);
  }

  function setCoins(n) {
    var a = $('user-coins');
    if (a) a.textContent = n;
  }

  // ---- Quests ----
  function openQuests() {
    show('quests');
    var list = $('quests-list');
    if (list) list.innerHTML = '<p style="opacity:.6">...</p>';
    fetch(API + '/quests', { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'err');
        setCoins(data.coins);
        list.innerHTML = '';
        (data.quests || []).forEach(function (q) {
          var el = document.createElement('div');
          el.className = 'quest-card' + (q.claimed ? ' claimed' : q.done ? ' done' : '');
          var pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          el.innerHTML =
            '<div class="quest-top"><b>' + q.title + '</b><span class="quest-reward">+' + q.reward + ' \uD83E\uDE99</span></div>' +
            '<p class="quest-desc">' + q.desc + '</p>' +
            '<div class="quest-bar"><div class="quest-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="quest-prog">' + q.progress + ' / ' + q.target + '</div>' +
            (q.claimed
              ? '<button class="btn btn-sm" disabled>\u041f\u043e\u043b\u0443\u0447\u0435\u043d\u043e</button>'
              : q.done
                ? '<button class="btn btn-sm primary quest-claim" data-id="' + q.id + '">\u0417\u0430\u0431\u0440\u0430\u0442\u044c</button>'
                : '<button class="btn btn-sm" disabled>\u0412 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0435</button>');
          list.appendChild(el);
        });
      })
      .catch(function (e) {
        if (list) list.innerHTML = '<p style="color:#ff8a80">' + (e.message || 'offline') + '</p>';
      });
  }
  window.openQuestsScreen = openQuests;

  function claimQuest(id) {
    fetch(API + '/quests/claim', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ questId: id }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'err');
        setCoins(data.coins);
        toast('+' + data.reward + ' \uD83E\uDE99');
        openQuests();
      })
      .catch(function (e) { toast(e.message); });
  }

  /** В\u044b\u0437\u044b\u0432\u0430\u0442\u044c \u043f\u043e\u0441\u043b\u0435 \u043a\u043e\u043d\u0446\u0430 \u0438\u0433\u0440\u044b */
  window.reportGameEnd = function (mode, result, coinsDelta) {
    fetch(API + '/quests/event', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        event: 'game_end',
        mode: mode || 'bot',
        result: result || 'lose',
        coinsDelta: coinsDelta || 0,
      }),
    }).catch(function () {});
  };

  // ---- Profile ----
  function openProfile() {
    show('profile');
    var box = $('profile-box');
    if (box) box.innerHTML = '<p style="opacity:.6">...</p>';
    fetch(API + '/profile', { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'err');
        var u = data.user;
        var hist = (data.history || []).slice(0, 10).map(function (h) {
          var icon = h.result === 'win' ? '\u2705' : '\u274C';
          return '<div class="hist-row"><span>' + icon + ' ' + h.mode + '</span><span>' + (h.created_at || '').slice(0, 16) + '</span></div>';
        }).join('') || '<p style="opacity:.5">\u041f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442\u043e</p>';
        box.innerHTML =
          '<div class="profile-head">' +
          '<div class="profile-name">' + (u.first_name || u.username || '\u0418\u0433\u0440\u043e\u043a') + '</div>' +
          '<div class="profile-stats">' +
          '<div><b>' + (u.coins || 0) + '</b><span>\u043c\u043e\u043d\u0435\u0442</span></div>' +
          '<div><b>' + (u.wins_random || 0) + '</b><span>\u043f\u043e\u0431\u0435\u0434</span></div>' +
          '<div><b>' + (u.games_total || 0) + '</b><span>\u0438\u0433\u0440</span></div>' +
          '</div></div>' +
          '<h3 style="margin:16px 0 8px;font-size:15px">\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0438\u0433\u0440\u044b</h3>' +
          '<div class="hist-list">' + hist + '</div>';
      })
      .catch(function (e) {
        if (box) box.innerHTML = '<p style="color:#ff8a80">' + e.message + '</p>';
      });
  }
  window.openProfileScreen = openProfile;

  // ---- Tournaments (admin launch) ----
  var isAdmin = false;

  function loadTournaments() {
    show('tournament');
    var list = $('tournament-list');
    if (list) list.innerHTML = '<p style="opacity:.6">...</p>';

    Promise.all([
      fetch(API + '/tournaments').then(function (r) { return r.json(); }),
      fetch(API + '/admin/me', { headers: headers() }).then(function (r) { return r.json(); }).catch(function () { return {}; }),
    ]).then(function (arr) {
      var data = arr[0];
      var adm = arr[1];
      isAdmin = !!(adm && adm.isAdmin);

      var html = '';
      if (isAdmin) {
        html +=
          '<div class="tour-card admin">' +
          '<div class="tour-title">\u0410\u0434\u043c\u0438\u043d</div>' +
          '<p class="tour-desc">\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0442\u0443\u0440\u043d\u0438\u0440 (\u0442\u043e\u043b\u044c\u043a\u043e \u0430\u0434\u043c\u0438\u043d)</p>' +
          '<button class="btn primary btn-sm" id="btn-admin-create">\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0442\u0443\u0440\u043d\u0438\u0440</button>' +
          '</div>';
      }

      var tours = (data && data.tournaments) || [];
      if (!tours.length) {
        html += '<p class="screen-sub">\u0421\u0435\u0439\u0447\u0430\u0441 \u043d\u0435\u0442 \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u0445 \u0442\u0443\u0440\u043d\u0438\u0440\u043e\u0432. \u0416\u0434\u0438\u0442\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0430 \u0430\u0434\u043c\u0438\u043d\u043e\u043c.</p>';
      } else {
        tours.forEach(function (t) {
          html +=
            '<div class="tour-card">' +
            '<div class="tour-title">' + (t.title || '\u0422\u0443\u0440\u043d\u0438\u0440') + '</div>' +
            '<p class="tour-desc">\u041a\u043e\u0434: <b>' + t.code + '</b> \u00b7 ' + (t.players || 0) + '/' + t.max_players +
            ' \u00b7 \u043f\u0440\u0438\u0437 ' + (t.prize || 0) + ' \uD83E\uDE99</p>' +
            '<button class="btn primary btn-sm tour-join" data-code="' + t.code + '">\u0412\u0441\u0442\u0443\u043f\u0438\u0442\u044c</button>' +
            '</div>';
        });
      }

      html +=
        '<div class="tour-card">' +
        '<div class="tour-title">\u0412\u043e\u0439\u0442\u0438 \u043f\u043e \u043a\u043e\u0434\u0443</div>' +
        '<input class="input" id="tour-code-input" placeholder="TXXXXX" maxlength="8" />' +
        '<button class="btn btn-sm" id="btn-tour-code-join">\u0412\u043e\u0439\u0442\u0438</button>' +
        '</div>';

      list.innerHTML = html;

      if ($('btn-admin-create')) {
        $('btn-admin-create').onclick = function () {
          fetch(API + '/admin/tournament', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ title: '\u0422\u0443\u0440\u043d\u0438\u0440', maxPlayers: 8, prize: 200 }),
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d.ok) throw new Error(d.error || 'err');
              toast('\u0422\u0443\u0440\u043d\u0438\u0440: ' + d.tournament.code);
              loadTournaments();
            })
            .catch(function (e) { toast(e.message); });
        };
      }

      list.querySelectorAll('.tour-join').forEach(function (btn) {
        btn.onclick = function () { joinTour(btn.getAttribute('data-code')); };
      });
      if ($('btn-tour-code-join')) {
        $('btn-tour-code-join').onclick = function () {
          var inp = $('tour-code-input');
          joinTour(inp && inp.value);
        };
      }
    }).catch(function (e) {
      if (list) list.innerHTML = '<p style="color:#ff8a80">' + e.message + '</p>';
    });
  }
  window.openTournamentScreen = loadTournaments;

  function joinTour(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) { toast('\u0412\u0432\u0435\u0434\u0438 \u043a\u043e\u0434'); return; }
    fetch(API + '/tournament/join', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ code: code }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'err');
        toast('\u0412 \u043b\u043e\u0431\u0431\u0438: ' + d.players + '/' + d.maxPlayers);
        if (typeof window.startOnlineRoom === 'function') {
          window.startOnlineRoom(d.roomId);
        }
      })
      .catch(function (e) { toast(e.message); });
  }

  function bind() {
    if ($('btn-quests')) $('btn-quests').onclick = openQuests;
    if ($('btn-back-quests')) $('btn-back-quests').onclick = function () { show('menu'); };
    if ($('btn-profile')) $('btn-profile').onclick = openProfile;
    if ($('btn-back-profile')) $('btn-back-profile').onclick = function () { show('menu'); };

    if ($('quests-list')) {
      $('quests-list').addEventListener('click', function (e) {
        var b = e.target.closest('.quest-claim');
        if (b) claimQuest(b.getAttribute('data-id'));
      });
    }

    // override tournament from stage3
    setTimeout(function () {
      if ($('btn-tournament')) $('btn-tournament').onclick = loadTournaments;
    }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
