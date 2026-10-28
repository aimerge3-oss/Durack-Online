/**
 * Обязательная подписка на канал — проверка при входе
 */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var CHANNEL = 'https://t.me/Durack_0nline';

  function $(id) { return document.getElementById(id); }

  function token() {
    try { if (window.__authToken) return String(window.__authToken); } catch (e) {}
    try {
      var u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return null;
  }

  function ensureGate() {
    var g = $('sub-gate');
    if (g) return g;
    g = document.createElement('div');
    g.id = 'sub-gate';
    g.className = 'sub-gate hidden';
    g.innerHTML =
      '<div class="sub-gate-card">' +
      '<div class="sub-gate-emoji">📢</div>' +
      '<h2>Подписка на канал</h2>' +
      '<p>Чтобы играть, подпишись на наш канал <b>@Durack_0nline</b></p>' +
      '<a class="btn primary" id="sub-open" href="' + CHANNEL + '" target="_blank" rel="noopener">Подписаться</a>' +
      '<button class="btn" id="sub-check-btn">Я подписался</button>' +
      '<p class="sub-gate-hint" id="sub-hint"></p>' +
      '</div>';
    document.body.appendChild(g);

    var openBtn = $('sub-open');
    if (openBtn) {
      openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
          Telegram.WebApp.openTelegramLink(CHANNEL);
        } else {
          window.open(CHANNEL, '_blank');
        }
      });
    }
    var checkBtn = $('sub-check-btn');
    if (checkBtn) {
      checkBtn.addEventListener('click', function () {
        recheck(true);
      });
    }
    return g;
  }

  function showGate(channel) {
    var g = ensureGate();
    if (channel) {
      var a = $('sub-open');
      if (a) a.href = channel;
      CHANNEL = channel;
    }
    g.classList.remove('hidden');
    // блокируем меню
    var menu = $('menu');
    if (menu) menu.classList.add('hidden');
    var loading = $('loading');
    if (loading) loading.classList.add('hidden');
  }

  function hideGate() {
    var g = $('sub-gate');
    if (g) g.classList.add('hidden');
  }

  function applySub(sub) {
    if (!sub || !sub.required) {
      hideGate();
      return true;
    }
    if (sub.subscribed) {
      hideGate();
      return true;
    }
    showGate(sub.channel || CHANNEL);
    return false;
  }
  window.applySubscriptionGate = applySub;

  function recheck(fromButton) {
    var t = token();
    if (!t) return;
    var hint = $('sub-hint');
    if (fromButton && hint) hint.textContent = 'Проверяем...';
    fetch(API + '/sub-check', {
      headers: { Authorization: 'Bearer ' + t },
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.subscribed) {
          hideGate();
          if (typeof window.showScreen === 'function') window.showScreen('menu');
          if (hint) hint.textContent = '';
        } else {
          showGate(data.channel || CHANNEL);
          if (hint) {
            hint.textContent = fromButton
              ? 'Подписка не найдена. Подпишись и нажми снова.'
              : '';
          }
        }
      })
      .catch(function () {
        if (hint) hint.textContent = 'Ошибка проверки. Попробуй ещё раз.';
      });
  }
  window.recheckSubscription = recheck;

  // перехват auth-ответа: поллим /me после загрузки
  function bootCheck() {
    var t = token();
    if (!t) {
      setTimeout(bootCheck, 800);
      return;
    }
    fetch(API + '/sub-check', { headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        applySub({
          required: data.required,
          subscribed: data.subscribed,
          channel: data.channel,
        });
      })
      .catch(function () {});
  }

  setTimeout(bootCheck, 1200);
  setTimeout(bootCheck, 3000);
})();
