/**
 * Онлайн: очередь матчмейкинга + реконнект
 */
(function () {
  var WS_BASE = 'wss://durack-online.pozzistory666.workers.dev';
  var API = 'https://durack-online.pozzistory666.workers.dev';
  var pollTimer = null;
  var userLeft = false;
  var activeRoomId = null;
  var ROOM_KEY = 'durack_active_room';
  var reconnectAttempt = 0;

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

  function saveRoom(roomId) {
    activeRoomId = roomId;
    try {
      sessionStorage.setItem(ROOM_KEY, roomId || '');
    } catch (e) {}
  }

  function loadRoom() {
    try {
      return sessionStorage.getItem(ROOM_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function clearRoom() {
    activeRoomId = null;
    try {
      sessionStorage.removeItem(ROOM_KEY);
    } catch (e) {}
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  window.leaveOnline = function () {
    userLeft = true;
    stopPoll();
    reconnectAttempt = 0;

    // выйти из очереди
    try {
      fetch(API + '/matchmaking/leave', {
        method: 'POST',
        headers: headers(),
        body: '{}',
      }).catch(function () {});
    } catch (e) {}

    clearRoom();

    try {
      if (window.ws) {
        window.ws.__intentionalClose = true;
        window.ws.close();
      }
    } catch (e) {}
    window.ws = null;
    try {
      onlineState = null;
      game = null;
      mode = null;
    } catch (e) {}
  };

  window.startOnlineRoom = function (roomId, opts) {
    opts = opts || {};
    if (userLeft && opts.fromSearch) return;

    userLeft = false;
    var need = opts.needPlayers || 2;
    saveRoom(roomId);

    if (typeof window.ensureAudio === 'function') window.ensureAudio();

    try {
      mode = 'online';
      game = null;
      onlineState = null;
    } catch (e) {}

    var myId = getMyId();
    window.myId = myId;
    var name = getName();

    if (typeof window.showScreen === 'function') window.showScreen('game');
    if ($('player-hand')) $('player-hand').innerHTML = '';
    if ($('opponents')) $('opponents').innerHTML = '';
    if ($('table-cards')) $('table-cards').innerHTML = '';

    setHint(opts.hint || (opts.reconnect ? 'Переподключение...' : 'Подключение...'));

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

    socket.onopen = function () {
      if (userLeft) {
        try {
          socket.close();
        } catch (e) {}
        return;
      }
      reconnectAttempt = 0;
      setHint(opts.reconnect ? 'Снова в игре' : 'В лобби: 1/' + need + ' · ждём...');
      socket.send(JSON.stringify({ type: 'join', userId: myId, name: name }));
      // запрос актуального state
      socket.send(JSON.stringify({ type: 'sync' }));
    };

    socket.onmessage = function (ev) {
      if (userLeft) return;
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'welcome' || msg.type === 'player_joined') {
          var n = (msg.players && msg.players.length) || 1;
          setHint(
            'В лобби: ' + n + '/' + need + (n < need ? ' · ждём...' : ' · старт!')
          );
        }
        if (msg.type === 'state' && msg.state) {
          if (typeof window.renderOnlineState === 'function') window.renderOnlineState(msg.state);
        }
        if (msg.type === 'game_started') setHint('Игра началась!');
        if (msg.type === 'error' && typeof window.flash === 'function') window.flash(msg.message);
        if (msg.type === 'sticker' && typeof window.handleStickerMessage === 'function') {
          window.handleStickerMessage(msg);
        }
      } catch (e) {}
    };

    socket.onclose = function () {
      if (userLeft || socket.__intentionalClose) return;
      // авто-реконнект
      var room = activeRoomId || loadRoom();
      if (!room) {
        setHint('Соединение закрыто');
        return;
      }
      reconnectAttempt++;
      if (reconnectAttempt > 8) {
        setHint('Не удалось переподключиться. Выйди и зайди снова.');
        return;
      }
      setHint('Переподключение (' + reconnectAttempt + ')...');
      var delay = Math.min(8000, 800 * reconnectAttempt);
      setTimeout(function () {
        if (userLeft) return;
        window.startOnlineRoom(room, {
          needPlayers: need,
          reconnect: true,
          hint: 'Переподключение...',
        });
      }, delay);
    };

    socket.onerror = function () {
      if (!userLeft) setHint('Ошибка сети...');
    };
  };

  /**
   * Очередь матчмейкинга (серверная)
   */
  window.startMatchmaking = function (playerCount) {
    userLeft = false;
    var pc = playerCount || 2;
    stopPoll();

    if (typeof window.showScreen === 'function') window.showScreen('game');
    setHint('Поиск соперника...');

    fetch(API + '/matchmaking/join', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ needPlayers: pc, name: getName() }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || 'queue error');
        if (d.status === 'matched' && d.roomId) {
          window.startOnlineRoom(d.roomId, { needPlayers: pc, hint: 'Соперник найден!' });
          return;
        }
        setHint('В очереди: ' + (d.inQueue || 1) + ' · ждём...');
        pollTimer = setInterval(pollStatus, 2000);
      })
      .catch(function (e) {
        setHint(e.message || 'Ошибка поиска');
      });

    function pollStatus() {
      if (userLeft) {
        stopPoll();
        return;
      }
      fetch(API + '/matchmaking/status', { headers: headers() })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (!d || !d.ok) return;
          if (d.status === 'matched' && d.roomId) {
            stopPoll();
            window.startOnlineRoom(d.roomId, {
              needPlayers: pc,
              hint: 'Соперник найден!',
            });
          } else if (d.status === 'waiting') {
            setHint(
              'В очереди: ' +
                (d.inQueue || 1) +
                (d.waitedSec ? ' · ' + d.waitedSec + 'с' : '') +
                ' · ждём...'
            );
          }
        })
        .catch(function () {});
    }
  };

  // авто-реконнект при открытии приложения
  function tryResumeRoom() {
    var room = loadRoom();
    if (!room) return;
    // не авто-входим сразу в меню — только если пользователь был в игре
    // мягкий resume: не форсируем
  }

  function bind() {
    var btn = $('btn-leave');
    if (btn && !btn.__leaveOnlineBound) {
      btn.__leaveOnlineBound = true;
      btn.addEventListener(
        'click',
        function () {
          window.leaveOnline();
        },
        true
      );
    }

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
  setTimeout(tryResumeRoom, 1000);
})();
