/**
 * Онлайн матчмейкинг + комнаты
 */
(function () {
  var WS_BASE = 'wss://durack-online.pozzistory666.workers.dev';
  var searchTimer = null;
  var searchAttempt = 0;

  function $(id) { return document.getElementById(id); }

  function getMyId() {
    try {
      if (window.currentUser && window.currentUser.telegram_id) return String(window.currentUser.telegram_id);
    } catch (e) {}
    try {
      var u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) return String(u.id);
    } catch (e) {}
    return 'guest_' + Math.random().toString(36).slice(2, 8);
  }

  function getName() {
    try {
      if (window.currentUser && window.currentUser.first_name) return window.currentUser.first_name;
    } catch (e) {}
    try {
      var u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
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

  /**
   * Общий вход в WS-комнату
   */
  window.startOnlineRoom = function (roomId, opts) {
    opts = opts || {};
    var need = opts.needPlayers || 2;

    if (typeof window.ensureAudio === 'function') window.ensureAudio();

    try { mode = 'online'; } catch (e) {}
    try { game = null; } catch (e) {}
    try { onlineState = null; } catch (e) {}

    var myId = getMyId();
    try { window.myId = myId; } catch (e) {}
    try { myId = myId; } catch (e) {}

    var name = getName();
    if (typeof window.showScreen === 'function') window.showScreen('game');

    if ($('player-hand')) $('player-hand').innerHTML = '';
    if ($('opponents')) $('opponents').innerHTML = '';
    if ($('table-cards')) $('table-cards').innerHTML = '';

    setHint(opts.hint || ('Подключение... (' + roomId + ')'));

    try {
      if (window.ws) window.ws.close();
    } catch (e) {}
    try {
      if (typeof ws !== 'undefined' && ws) ws.close();
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
    try { ws = socket; } catch (e) {}

    socket.onopen = function () {
      setHint('В лобби: 1/' + need + ' · ждём...');
      socket.send(JSON.stringify({ type: 'join', userId: myId, name: name }));
    };

    socket.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'welcome' || msg.type === 'player_joined') {
          var n = (msg.players && msg.players.length) || 1;
          setHint('В лобби: ' + n + '/' + need + (n < need ? ' · ждём...' : ' · старт!'));
        }
        if (msg.type === 'state' && msg.state) {
          if (typeof window.renderOnlineState === 'function') window.renderOnlineState(msg.state);
        }
        if (msg.type === 'game_started') {
          setHint('Игра началась!');
        }
        if (msg.type === 'error' && typeof window.flash === 'function') {
          window.flash(msg.message);
        }
      } catch (e) {}
    };

    socket.onclose = function () {
      setHint('Соединение закрыто. Выйди и зайди снова.');
    };

    socket.onerror = function () {
      setHint('Ошибка сети. Проверь интернет.');
    };
  };

  /**
   * Поиск соперника: общий лобби на 60 сек + переподключение
   */
  window.startMatchmaking = function (playerCount) {
    var pc = playerCount || 2;
    searchAttempt = 0;
    if (searchTimer) clearInterval(searchTimer);

    function joinSlot() {
      // окно 60 сек — все ищущие в эту минуту попадают вместе
      var slot = Math.floor(Date.now() / 60000);
      var roomId = 'mm_' + pc + '_' + slot;
      window.startOnlineRoom(roomId, {
        needPlayers: pc,
        hint: 'Поиск соперника (' + pc + 'игр.)...',
      });
    }

    joinSlot();

    // каждые 20 с переподключаемся к текущему слоту (если ещё один)
    searchTimer = setInterval(function () {
      searchAttempt++;
      // если уже идёт игра — не рвём
      try {
        if (window.onlineState && window.onlineState.phase && window.onlineState.phase !== 'waiting') {
          clearInterval(searchTimer);
          return;
        }
      } catch (e) {}
      if (searchAttempt > 6) {
        clearInterval(searchTimer);
        setHint('Никого не нашли. Попробуй комнату с другом.');
        return;
      }
      joinSlot();
    }, 20000);
  };

  // перехват кнопок онлайн / быстрая
  function bind() {
    var online = $('btn-online');
    if (online) {
      online.addEventListener(
        'click',
        function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          var pc = 2;
          try {
            if (typeof playerCount === 'number') pc = playerCount;
          } catch (err) {}
          window.startMatchmaking(pc || 2);
        },
        true
      );
    }
    var quick = $('btn-quick');
    if (quick) {
      quick.addEventListener(
        'click',
        function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          // быстрая = онлайн 1на1
          window.startMatchmaking(2);
        },
        true
      );
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 400);
})();
