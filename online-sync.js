/**
 * Синхрон стола: stateSeq + ping
 */
(function () {
  var lastSeq = 0;
  var pingTimer = null;

  var origRender = null;

  function install() {
    if (typeof window.renderOnlineState === 'function' && !window.renderOnlineState.__seq) {
      origRender = window.renderOnlineState;
      window.renderOnlineState = function (state) {
        if (!state) return;
        if (typeof state.stateSeq === 'number') {
          if (state.stateSeq < lastSeq) return; // устаревший state
          lastSeq = state.stateSeq;
        }
        try {
          window.onlineState = state;
        } catch (e) {}
        return origRender.apply(this, arguments);
      };
      window.renderOnlineState.__seq = true;
    }
  }

  function startPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(function () {
      try {
        var sock = window.ws;
        if (sock && sock.readyState === 1) {
          sock.send(JSON.stringify({ type: 'ping' }));
        }
      } catch (e) {}
    }, 15000);
  }

  function stopPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    lastSeq = 0;
  }

  var origStart = window.startOnlineRoom;
  if (typeof origStart === 'function' && !origStart.__syncPatch) {
    window.startOnlineRoom = function () {
      lastSeq = 0;
      var r = origStart.apply(this, arguments);
      startPing();
      setTimeout(install, 50);
      return r;
    };
    window.startOnlineRoom.__syncPatch = true;
  }

  var origLeave = window.leaveOnline;
  window.leaveOnline = function () {
    stopPing();
    if (typeof origLeave === 'function') return origLeave.apply(this, arguments);
  };

  setTimeout(install, 500);
  setTimeout(install, 1500);
})();
