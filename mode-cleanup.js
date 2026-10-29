/**
 * Полный сброс состояния игры при смене режима bot <-> online
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  window.fullGameCleanup = function (opts) {
    opts = opts || {};

    // таймеры хода / бота
    try {
      if (typeof timerInterval !== 'undefined' && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    } catch (e) {}
    try {
      if (window.timerInterval) {
        clearInterval(window.timerInterval);
        window.timerInterval = null;
      }
    } catch (e) {}

    // локальная игра с ботом
    try {
      game = null;
    } catch (e) {}
    try {
      window.game = null;
    } catch (e) {}
    try {
      onlineState = null;
    } catch (e) {}
    try {
      window.onlineState = null;
    } catch (e) {}

    // DOM
    try {
      if ($('player-hand')) $('player-hand').innerHTML = '';
      if ($('opponents')) $('opponents').innerHTML = '';
      if ($('table-cards')) $('table-cards').innerHTML = '';
      if ($('table-hint')) {
        $('table-hint').classList.remove('hide');
        if (opts.hint) $('table-hint').textContent = opts.hint;
      }
      if ($('stickers-bar')) $('stickers-bar').classList.add('hidden');
      var btns = ['btn-take', 'btn-done', 'btn-pass'];
      for (var i = 0; i < btns.length; i++) {
        var b = $(btns[i]);
        if (b) b.classList.add('hidden');
      }
    } catch (e) {}

    // WS только если явно просим
    if (opts.closeWs) {
      try {
        if (window.ws) {
          window.ws.__intentionalClose = true;
          window.ws.close();
        }
      } catch (e) {}
      window.ws = null;
      try {
        ws = null;
      } catch (e) {}
    }
  };

  // обёртка startVsBot / startOnlineRoom
  function patchStarts() {
    if (typeof window.startVsBot === 'function' && !window.startVsBot.__cleanPatch) {
      var origBot = window.startVsBot;
      window.startVsBot = function () {
        if (typeof window.leaveOnline === 'function') {
          try {
            window.leaveOnline();
          } catch (e) {}
        }
        window.fullGameCleanup({ closeWs: true, hint: 'Игра с ботом...' });
        try {
          mode = 'bot';
        } catch (e) {}
        return origBot.apply(this, arguments);
      };
      window.startVsBot.__cleanPatch = true;
    }

    // глобальная startVsBot в app.js может быть не на window
    if (typeof startVsBot === 'function') {
      try {
        if (!startVsBot.__cleanPatch) {
          var o = startVsBot;
          startVsBot = function () {
            if (typeof window.leaveOnline === 'function') {
              try {
                window.leaveOnline();
              } catch (e) {}
            }
            window.fullGameCleanup({ closeWs: true });
            try {
              mode = 'bot';
            } catch (e) {}
            return o.apply(this, arguments);
          };
          startVsBot.__cleanPatch = true;
          window.startVsBot = startVsBot;
        }
      } catch (e) {}
    }

    if (typeof window.startOnlineRoom === 'function' && !window.startOnlineRoom.__cleanPatch) {
      var origOn = window.startOnlineRoom;
      window.startOnlineRoom = function () {
        window.fullGameCleanup({
          closeWs: false,
          hint: 'Подключение...',
        });
        try {
          mode = 'online';
          game = null;
        } catch (e) {}
        // myId из Telegram — строка
        try {
          if (window.currentUser && window.currentUser.telegram_id) {
            myId = String(window.currentUser.telegram_id);
            window.myId = myId;
          }
        } catch (e) {}
        return origOn.apply(this, arguments);
      };
      window.startOnlineRoom.__cleanPatch = true;
    }

    if (typeof window.startMatchmaking === 'function' && !window.startMatchmaking.__cleanPatch) {
      var origMm = window.startMatchmaking;
      window.startMatchmaking = function () {
        window.fullGameCleanup({ closeWs: true, hint: 'Поиск соперника...' });
        try {
          mode = 'online';
          game = null;
        } catch (e) {}
        try {
          if (window.currentUser && window.currentUser.telegram_id) {
            myId = String(window.currentUser.telegram_id);
            window.myId = myId;
          }
        } catch (e) {}
        return origMm.apply(this, arguments);
      };
      window.startMatchmaking.__cleanPatch = true;
    }
  }

  setTimeout(patchStarts, 100);
  setTimeout(patchStarts, 600);
  setTimeout(patchStarts, 1500);
})();
