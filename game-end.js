/**
 * Плашка играть закрывается · победа/поражение · таймер 20с
 */
(function () {
  var TURN_SEC = 20;
  var endShown = false;

  function $(id) {
    return document.getElementById(id);
  }

  function closeSheets() {
    ['play-sheet', 'bots-sheet'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.add('hidden');
    });
  }
  window.closePlaySheets = closeSheets;

  // закрывать sheet при любом входе в игру
  function patchShowScreen() {
    if (typeof window.showScreen !== 'function') return;
    if (window.showScreen.__sheetPatch) return;
    var orig = window.showScreen;
    window.showScreen = function (name) {
      if (name === 'game' || name === 'menu') closeSheets();
      if (name === 'menu') endShown = false;
      return orig.apply(this, arguments);
    };
    window.showScreen.__sheetPatch = true;
  }

  function ensureOverlay() {
    var o = $('game-end-overlay');
    if (o) return o;
    o = document.createElement('div');
    o.id = 'game-end-overlay';
    o.className = 'game-end-overlay hidden';
    o.innerHTML =
      '<div class="game-end-card">' +
      '<div class="game-end-emoji" id="game-end-emoji">🏆</div>' +
      '<div class="game-end-title" id="game-end-title">ПОБЕДА</div>' +
      '<div class="game-end-sub" id="game-end-sub"></div>' +
      '<button class="btn primary" id="game-end-ok">В меню</button>' +
      '</div>';
    document.body.appendChild(o);
    $('game-end-ok').addEventListener('click', function () {
      hideEnd();
      goMenu();
    });
    return o;
  }

  function goMenu() {
    try {
      clearInterval(window.timerInterval || null);
    } catch (e) {}
    try {
      if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
    } catch (e) {}
    try {
      game = null;
    } catch (e) {}
    try {
      onlineState = null;
    } catch (e) {}
    try {
      if (window.ws) window.ws.close();
    } catch (e) {}
    try {
      if (typeof ws !== 'undefined' && ws) ws.close();
    } catch (e) {}
    if (typeof window.showScreen === 'function') window.showScreen('menu');
  }

  function hideEnd() {
    var o = $('game-end-overlay');
    if (o) o.classList.add('hidden');
  }

  /**
   * @param {'win'|'lose'} result
   * @param {string} [reason]
   */
  window.showGameEnd = function (result, reason) {
    if (endShown) return;
    endShown = true;
    closeSheets();

    try {
      clearInterval(window.timerInterval || null);
    } catch (e) {}
    try {
      if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
    } catch (e) {}

    var o = ensureOverlay();
    var title = $('game-end-title');
    var emoji = $('game-end-emoji');
    var sub = $('game-end-sub');

    if (result === 'win') {
      o.classList.remove('lose');
      o.classList.add('win');
      if (title) title.textContent = 'ВЫ ВЫИГРАЛИ';
      if (emoji) emoji.textContent = '🏆';
      if (sub) sub.textContent = reason || '+25 🪙';
      try {
        if (typeof window.reportGameEnd === 'function') window.reportGameEnd('bot', 'win', 25);
      } catch (e) {}
    } else {
      o.classList.remove('win');
      o.classList.add('lose');
      if (title) title.textContent = 'ВЫ ПРОИГРАЛИ';
      if (emoji) emoji.textContent = '💀';
      if (sub) sub.textContent = reason || 'Не повезло';
      try {
        if (typeof window.reportGameEnd === 'function') window.reportGameEnd('bot', 'lose', 0);
      } catch (e) {}
    }

    o.classList.remove('hidden');

    setTimeout(function () {
      hideEnd();
      goMenu();
    }, 3200);
  };

  // таймер 20 сек + поражение по таймауту
  function patchTimer() {
    if (typeof window.startTimer !== 'function' && typeof startTimer !== 'function') return false;

    // делаем глобальную версию
    window.startTimer = function (seconds) {
      var sec = seconds || TURN_SEC;
      if (sec < TURN_SEC && sec === 15) sec = TURN_SEC;

      try {
        if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
      } catch (e) {}
      clearInterval(window.__turnTimer);

      var el = $('timer');
      if (!el) return;

      var left = sec;
      el.textContent = left;
      el.classList.remove('urgent');

      window.__turnTimer = setInterval(function () {
        left -= 1;
        el.textContent = left;
        if (left <= 5) el.classList.add('urgent');
        if (left <= 0) {
          clearInterval(window.__turnTimer);
          el.textContent = '0';
          onTimeout();
        }
      }, 1000);

      try {
        timerInterval = window.__turnTimer;
      } catch (e) {}
    };
    return true;
  }

  function isMyTurn() {
    try {
      if (typeof mode !== 'undefined' && mode === 'bot' && typeof game !== 'undefined' && game) {
        if (game.phase === 'finished') return false;
        var mid = typeof myId !== 'undefined' ? myId : null;
        if (game.defender && game.defender.id === mid && (game.phase === 'defend' || game.phase === 'throw')) return true;
        if (game.attacker && game.attacker.id === mid && (game.phase === 'attack' || game.phase === 'throw' || game.phase === 'defend')) return true;
      }
      if (typeof mode !== 'undefined' && mode === 'online' && typeof onlineState !== 'undefined' && onlineState) {
        var st = onlineState;
        var mid2 = typeof myId !== 'undefined' ? myId : null;
        if (st.phase === 'finished') return false;
        if (st.defenderId === mid2 && (st.phase === 'defend' || st.phase === 'throw')) return true;
        if (st.attackerId === mid2 && (st.phase === 'attack' || st.phase === 'throw' || st.phase === 'defend')) return true;
      }
    } catch (e) {}
    return false;
  }

  function onTimeout() {
    if (!isMyTurn()) return;
    // по запросу: конец времени хода = поражение
    window.showGameEnd('lose', 'Время вышло');
    try {
      if (typeof mode !== 'undefined' && mode === 'bot' && typeof game !== 'undefined' && game) {
        game.phase = 'finished';
        game.foolId = typeof myId !== 'undefined' ? myId : null;
      }
    } catch (e) {}
    try {
      if (typeof mode !== 'undefined' && mode === 'online' && typeof ws !== 'undefined' && ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'forfeit' }));
      }
    } catch (e) {}
  }

  // следим за окончанием игры в бот-режиме
  var lastPhase = null;
  setInterval(function () {
    try {
      if (typeof game === 'undefined' || !game) {
        lastPhase = null;
        return;
      }
      if (game.phase === 'finished' && lastPhase !== 'finished') {
        lastPhase = 'finished';
        var mid = typeof myId !== 'undefined' ? myId : null;
        var lose = game.foolId && mid && String(game.foolId) === String(mid);
        window.showGameEnd(lose ? 'lose' : 'win', lose ? 'Вы — дурак' : 'Победа!');
      } else if (game.phase !== 'finished') {
        lastPhase = game.phase;
      }
    } catch (e) {}
  }, 400);

  // онлайн finished
  setInterval(function () {
    try {
      if (typeof onlineState === 'undefined' || !onlineState) return;
      if (onlineState.phase === 'finished' && !endShown) {
        var mid = typeof myId !== 'undefined' ? myId : null;
        var lose = onlineState.foolId && mid && String(onlineState.foolId) === String(mid);
        window.showGameEnd(lose ? 'lose' : 'win', lose ? 'Вы — дурак' : 'Победа!');
      }
    } catch (e) {}
  }, 500);

  // перехват кнопок старта — закрыть sheet
  function bindStart() {
    ['btn-quick', 'btn-online', 'btn-vs-bot', 'btn-bots-start', 'btn-enter-created', 'btn-join-room'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener(
        'click',
        function () {
          closeSheets();
          endShown = false;
        },
        true
      );
    });
  }

  function boot() {
    patchShowScreen();
    patchTimer();
    bindStart();
    ensureOverlay();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 300);
  setTimeout(patchTimer, 600);
  setTimeout(patchShowScreen, 600);
})();
