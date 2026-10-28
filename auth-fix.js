/** Ensure auth sends startParam / referrerId correctly */
(function () {
  var API = 'https://durack-online.pozzistory666.workers.dev';

  function getStartParam() {
    try {
      var tg = window.Telegram && Telegram.WebApp;
      if (!tg) return null;
      var sp = (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || null;
      if (!sp && tg.initData) {
        try {
          sp = new URLSearchParams(tg.initData).get('start_param');
        } catch (e) {}
      }
      return sp;
    } catch (e) {
      return null;
    }
  }

  function parseRefId(sp) {
    if (!sp) return null;
    var s = String(sp);
    if (s.indexOf('ref_') === 0) {
      var n = parseInt(s.slice(4), 10);
      return isNaN(n) ? null : n;
    }
    var n2 = parseInt(s.replace(/\D/g, ''), 10);
    return isNaN(n2) ? null : n2;
  }

  // Re-auth once with proper ref if original auth missed it
  function boostAuth() {
    try {
      var tg = window.Telegram && Telegram.WebApp;
      if (!tg || !tg.initData) return;
      var sp = getStartParam();
      var rid = parseRefId(sp);
      if (!rid && !sp) return;

      fetch(API + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: tg.initData,
          startParam: sp && String(sp).indexOf('ref_') === 0 ? sp : rid ? 'ref_' + rid : sp,
          referrerId: rid,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.ok) return;
          if (data.user) {
            try {
              window.currentUser = data.user;
              if (typeof window.renderUser === 'function') window.renderUser();
            } catch (e) {}
            var coins = document.getElementById('user-coins');
            if (coins && data.user.coins != null) coins.textContent = data.user.coins;
          }
          if (data.referralBonus && data.referralBonus > 0) {
            if (Telegram.WebApp.showAlert) {
              Telegram.WebApp.showAlert('Реферал: другу начислено +' + data.referralBonus + ' 🪙');
            }
          }
          if (data.subscription && typeof window.applySubscriptionGate === 'function') {
            window.applySubscriptionGate(data.subscription);
          }
        })
        .catch(function () {});
    } catch (e) {}
  }

  setTimeout(boostAuth, 1500);
})();
