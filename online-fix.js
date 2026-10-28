/**
 * Онлайн матчмейкинг + комнаты
 * Выход останавливает поиск — больше не возвращает в игру
 */
(function () {
  var WS_BASE = 'wss://durack-online.pozzistory666.workers.dev';
  var searchTimer = null;
  var searchAttempt = 0;
  var userLeft = false;
  var activeRoomId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function getMyId() {
    try {
      if (window.currentUser && window.currentUser.telegram_id)
        return String(window.currentUser.telegram_id);
    } catch (e) {}
    try {
      var u =
        window.Telegram &&
        Telegram.WebApp &&
        Telegram.WebApp.initDataUnsafe &&
        Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return 'guest_' + Math.random().toString(36).slice(2, 8);
  }

  function getName() {
    try {
      if (window.currentUser && window.currentUser.first_name)
        return window.currentUser.first_name;
    } catch (e) {}
    try {
      var u =
        window.Telegram &&
        Telegram.WebApp &&
        Telegram.WebApp.initDataUnsafe &&
        Telegram.WebApp.initDataUnsafe.user;
      if (u && u.first_name) return u.first_name;
    } catch (e) {}
    return 'Игрок';
  }

  function setHint(t) {
    var h = $('table-hint');
    if (h) {
      h.classList.remove('hide');
      h.textContent = t;
    }
  }

  function clearSearch() {
    if (searchTimer) {
      clearInterval(searchTimer);
      searchTimer = null;
    }
    searchAttempt = 0;
  }

  /**
   * Полный выход из онлайна / поиска
   */
  window.leaveOnline = function () {
    userLeft = true;
    clearSearch();
    activeRoomId = null;

    try {
      clearInterval(window.timerInterval || null);
    } catch (e) {}
    try {
      if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
    } catch (e) {}

    try {
      if (window.ws) {
        window.ws.__intentionalClose = true;
        window.ws.close();
      }
    } catch (e) {}
    try {
      if (typeof ws !== 'undefined' && ws) {
        ws.__intentionalClose = true;
        ws.close();
      }
    } catch (e) {}

    window.ws = null;
    try {
      ws = null;
    } catch (e) {}
    try {
      onlineState = null;
    } catch (e) {}
    try {
      game = null;
    } catch (e) {}
    try {
      mode = null;
    } catch (e) {}
  };

  /**
   * Общий вход в WS-комнату
   */
  window.startOnlineRoom = function (roomId, opts) {
    opts = opts || {};
    // если пользователь вышел — не подключаемся обратно
    if (userLeft && opts.fromSearch) return;

    userLeft = false;
    var need = opts.needPlayers || 2;
    activeRoomId = roomId;

    if (typeof window.ensureAudio === 'function') window.ensureAudio();

    try {
      mode = 'online';
    } catch (e) {}
    try {
      game = null;
    } catch (e) {}
    try {
      onlineState = null;
    } catch (e) {}

    var myId = getMyId();
    try {
      window.myId = myId;
    } catch (e) {}

    var name = getName();
    if (typeof window.showScreen === 'function') window.showScreen('game');

    if ($('player-hand')) $('player-hand').innerHTML = '';
    if ($('opponents')) $('opponents').innerHTML = '';
    if ($('table-cards')) $('table-cards').innerHTML = '';

    setHint(opts.hint || 'Подключение...');

    try {
      if (window.ws) {
        window.ws.__intentionalClose = true;
        window.ws.close();
      }
    } catch (e) {}

    var url =
      WS_BASE +
      '/ws/' +
      encodeURIComponent(roomId) +
      '?userId=' +
      encodeURIComponent(myId) +
      '&username=' +
      encodeURIComponent(name);

    var socket = new WebSocket(url);
    window.ws = socket;
    try {
      ws = socket;
    } catch (e) {}

    socket.onopen = function () {
      if (userLeft) {
        try {
          socket.close();
        } catch (e) {}
        return;
      }
      setHint('В лобби: 1/' + need + ' · ждём...');
      socket.send(JSON.stringify({ type: 'join', userId: myId, name: name }));
    };

    socket.onmessage = function (ev) {
      if (userLeft) return;
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'welcome' || msg.type === 'player_joined') {
          var n = (msg.players && msg.players.length) || 1;
          setHint(
            'В лобби: ' +
              n +
              '/' +
              need +
              (n < need ? ' · ждём...' : ' · старт!')
          );
        }
        if (msg.type === 'state' && msg.state) {
          if (typeof window.renderOnlineState === 'function')
            window.renderOnlineState(msg.state);
        }
        if (msg.type === 'game_started') {
          setHint('Игра началась!');
          clearSearch(); // игра шла — поиск больше не нужен
        }
        if (msg.type === 'error' && typeof window.flash === 'function') {
          window.flash(msg.message);
        }
        if (msg.type === 'sticker' && typeof window.handleStickerMessage === 'function') {
          window.handleStickerMessage(msg);
        }
      } catch (e) {}
    };

    socket.onclose = function () {
      if (userLeft) return;
      setHint('Соединение закрыто. Выйди и зайди снова.');
    };

    socket.onerror = function () {
      if (userLeft) return;
      setHint('Ошибка сети.');
    };
  };

  /**
   * Поиск соперника
   */
  window.startMatchmaking = function (playerCount) {
    userLeft = false;
    var pc = playerCount || 2;
    searchAttempt = 0;
    clearSearch();

    function joinSlot() {
      if (userLeft) {
        clearSearch();
        return;
      }
      // если уже идёт игра — не рвём
      try {
        if (
          window.onlineState &&
          window.onlineState.phase &&
          window.onlineState.phase !== 'waiting'
        ) {
          clearSearch();
          return;
        }
      } catch (e) {}

      var slot = Math.floor(Date.now() / 60000);
      var roomId = 'mm_' + pc + '_' + slot;
      window.startOnlineRoom(roomId, {
        needPlayers: pc,
        hint: 'Поиск соперника...',
        fromSearch: true,
      });
    }

    joinSlot();

    searchTimer = setInterval(function () {
      if (userLeft) {
        clearSearch();
        return;
      }
      searchAttempt++;
      try {
        if (
          window.onlineState &&
          window.onlineState.phase &&
          window.onlineState.phase !== 'waiting'
        ) {
          clearSearch();
          return;
        }
      } catch (e) {}
      if (searchAttempt > 6) {
        clearSearch();
        setHint('Никого не нашли. Попробуй комнату с другом.');
        return;
      }
      joinSlot();
    }, 20000);
  };

  // кнопка Выйти — останавливаем поиск
  function bindLeave() {
    var btn = $('btn-leave');
    if (!btn || btn.__leaveOnlineBound) return;
    btn.__leaveOnlineBound = true;
    btn.addEventListener(
      'click',
      function () {
        window.leaveOnline();
      },
      true
    );
  }

  function bind() {
    bindLeave();

    var online = $('btn-online');
    if (online && !online.__mmBound) {
      online.__mmBound = true;
      online.addEventListener(
        'click',
        function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          window.startMatchmaking(2);
        },
        true
      );
    }
    var quick = $('btn-quick');
    if (quick && !quick.__mmBound) {
      quick.__mmBound = true;
      quick.addEventListener(
        'click',
        function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          window.startMatchmaking(2);
        },
        true
      );
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 400);
  setTimeout(bindLeave, 800);
})();
