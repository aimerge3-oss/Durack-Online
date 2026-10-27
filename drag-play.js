/**
 * Drag & drop / touch: перетаскивание карт на стол
 */
(function () {
  var dragState = null;
  var ghost = null;

  function clearGhost() {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
    document.body.classList.remove('dragging-card');
    document.querySelectorAll('.drop-hover').forEach(function (el) {
      el.classList.remove('drop-hover');
    });
  }

  function makeGhost(fromEl, x, y) {
    clearGhost();
    ghost = fromEl.cloneNode(true);
    ghost.classList.add('card-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = x - 30 + 'px';
    ghost.style.top = y - 40 + 'px';
    ghost.style.zIndex = '9999';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.95';
    ghost.style.transform = 'scale(1.08) rotate(-6deg)';
    ghost.style.boxShadow = '0 12px 24px rgba(0,0,0,0.45)';
    document.body.appendChild(ghost);
    document.body.classList.add('dragging-card');
  }

  function moveGhost(x, y) {
    if (!ghost) return;
    ghost.style.left = x - 30 + 'px';
    ghost.style.top = y - 40 + 'px';

    document.querySelectorAll('.drop-hover').forEach(function (el) {
      el.classList.remove('drop-hover');
    });
    var under = document.elementFromPoint(x, y);
    if (!under) return;
    var zone = under.closest('[data-drop]');
    if (zone) zone.classList.add('drop-hover');
  }

  function finishDrop(x, y) {
    var under = document.elementFromPoint(x, y);
    clearGhost();
    if (!dragState || !under) {
      dragState = null;
      return;
    }
    var zone = under.closest('[data-drop]');
    var payload = dragState;
    dragState = null;
    if (!zone) return;

    var kind = zone.getAttribute('data-drop');
    if (payload.canDefend && kind === 'defend') {
      var idx = parseInt(zone.getAttribute('data-attack-index'), 10);
      if (payload.defendIdxs.indexOf(idx) !== -1 && typeof payload.onDefend === 'function') {
        payload.onDefend(idx, payload.card);
      }
      return;
    }
    if (payload.canAttack && (kind === 'attack' || kind === 'table')) {
      if (typeof payload.onAttack === 'function') payload.onAttack(payload.card);
    }
  }

  /**
   * @param {HTMLElement} el
   * @param {object} opts { card, canAttack, canDefend, defendIdxs, onAttack, onDefend }
   */
  window.attachCardPlay = function (el, opts) {
    if (!opts || (!opts.canAttack && !opts.canDefend)) return;

    el.classList.add('playable');
    el.style.touchAction = 'none';

    // Клик: если одна цель отбоя или атака
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (opts.canDefend && opts.defendIdxs && opts.defendIdxs.length === 1) {
        opts.onDefend(opts.defendIdxs[0], opts.card);
        return;
      }
      if (opts.canAttack && !opts.canDefend) {
        opts.onAttack(opts.card);
        return;
      }
      // несколько целей — нужно перетащить
      var hint = document.getElementById('table-hint');
      if (hint) {
        hint.classList.remove('hide');
        hint.textContent = 'Перетащи карту на нужную на столе';
      }
    });

    // Mouse drag
    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragState = {
        card: opts.card,
        canAttack: !!opts.canAttack,
        canDefend: !!opts.canDefend,
        defendIdxs: opts.defendIdxs || [],
        onAttack: opts.onAttack,
        onDefend: opts.onDefend,
      };
      makeGhost(el, e.clientX, e.clientY);

      function onMove(ev) {
        moveGhost(ev.clientX, ev.clientY);
      }
      function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        finishDrop(ev.clientX, ev.clientY);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Touch drag
    el.addEventListener(
      'touchstart',
      function (e) {
        if (!e.touches[0]) return;
        e.preventDefault();
        var t = e.touches[0];
        dragState = {
          card: opts.card,
          canAttack: !!opts.canAttack,
          canDefend: !!opts.canDefend,
          defendIdxs: opts.defendIdxs || [],
          onAttack: opts.onAttack,
          onDefend: opts.onDefend,
        };
        makeGhost(el, t.clientX, t.clientY);
      },
      { passive: false }
    );

    el.addEventListener(
      'touchmove',
      function (e) {
        if (!dragState || !e.touches[0]) return;
        e.preventDefault();
        moveGhost(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: false }
    );

    el.addEventListener('touchend', function (e) {
      if (!dragState) return;
      var t = e.changedTouches && e.changedTouches[0];
      if (t) finishDrop(t.clientX, t.clientY);
      else clearGhost();
      dragState = null;
    });

    el.addEventListener('touchcancel', function () {
      clearGhost();
      dragState = null;
    });
  };
})();
