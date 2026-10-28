/**
 * Drag / touch play — надёжный drop + мгновенное убирание из руки
 */
(function () {
  var dragState = null;
  var ghost = null;
  var sourceEl = null;

  function clearGhost() {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
    document.body.classList.remove('dragging-card');
    document.querySelectorAll('.drop-hover').forEach(function (el) {
      el.classList.remove('drop-hover');
    });
    if (sourceEl) {
      sourceEl.classList.remove('dragging-source');
      sourceEl.style.opacity = '';
      sourceEl = null;
    }
  }

  function startGhost(cardEl, x, y) {
    clearGhost();
    sourceEl = cardEl;
    cardEl.classList.add('dragging-source');
    cardEl.style.opacity = '0.25';

    ghost = cardEl.cloneNode(true);
    ghost.classList.add('card-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = x - 26 + 'px';
    ghost.style.top = y - 40 + 'px';
    ghost.style.zIndex = '99999';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '1';
    ghost.style.transform = 'scale(1.08) rotate(-6deg)';
    ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,.45)';
    document.body.appendChild(ghost);
    document.body.classList.add('dragging-card');
  }

  function findDropZone(x, y) {
    // расширенный hit-test: сначала пары, потом стол
    var pairs = document.querySelectorAll('.table-pair[data-drop]');
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < pairs.length; i++) {
      var r = pairs[i].getBoundingClientRect();
      // расширяем зону на 28px
      var pad = 28;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
        var cx = (r.left + r.right) / 2;
        var cy = (r.top + r.bottom) / 2;
        var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestDist) {
          bestDist = d;
          best = pairs[i];
        }
      }
    }
    if (best) return best;

    var area = document.querySelector('.table-area[data-drop], .table-area');
    if (area) {
      var ar = area.getBoundingClientRect();
      if (x >= ar.left && x <= ar.right && y >= ar.top && y <= ar.bottom) {
        return area;
      }
    }
    return null;
  }

  function moveGhost(x, y) {
    if (!ghost) return;
    ghost.style.left = x - 26 + 'px';
    ghost.style.top = y - 40 + 'px';
    document.querySelectorAll('.drop-hover').forEach(function (el) {
      el.classList.remove('drop-hover');
    });
    var zone = findDropZone(x, y);
    if (zone) zone.classList.add('drop-hover');
  }

  function removeSourceFromHand() {
    if (sourceEl && sourceEl.parentNode) {
      try {
        sourceEl.parentNode.removeChild(sourceEl);
      } catch (e) {}
    }
    sourceEl = null;
  }

  function finishDrop(x, y) {
    var zone = findDropZone(x, y);
    var payload = dragState;
    dragState = null;

    if (!payload) {
      clearGhost();
      return;
    }

    // если координаты нулевые (dragend bug) — берём центр стола
    if ((!x && !y) || (x === 0 && y === 0)) {
      var area = document.querySelector('.table-area');
      if (area) {
        var r = area.getBoundingClientRect();
        x = (r.left + r.right) / 2;
        y = (r.top + r.bottom) / 2;
        zone = findDropZone(x, y);
      }
    }

    var played = false;

    if (zone) {
      var kind = zone.getAttribute('data-drop') || (zone.classList.contains('table-area') ? 'table' : '');

      if (payload.canDefend && (kind === 'defend' || kind === 'attack' || zone.classList.contains('table-pair'))) {
        var idx = parseInt(zone.getAttribute('data-attack-index'), 10);
        if (isNaN(idx) && payload.defendIdxs && payload.defendIdxs.length) idx = payload.defendIdxs[0];
        if (!isNaN(idx) && payload.defendIdxs && payload.defendIdxs.indexOf(idx) !== -1) {
          if (typeof payload.onDefend === 'function') {
            removeSourceFromHand();
            clearGhost();
            payload.onDefend(idx, payload.card);
            played = true;
          }
        }
      }

      if (!played && payload.canAttack && (kind === 'attack' || kind === 'table' || kind === 'defend' || zone.classList.contains('table-area'))) {
        if (typeof payload.onAttack === 'function') {
          removeSourceFromHand();
          clearGhost();
          payload.onAttack(payload.card);
          played = true;
        }
      }
    }

    // если можно только атаковать и бросили «куда-то вверх» — всё равно ход
    if (!played && payload.canAttack && !payload.canDefend && typeof payload.onAttack === 'function') {
      // только если отпустили не слишком близко к руке
      var hand = document.getElementById('player-hand');
      var inHand = false;
      if (hand) {
        var hr = hand.getBoundingClientRect();
        if (y >= hr.top - 10) inHand = true;
      }
      if (!inHand) {
        removeSourceFromHand();
        clearGhost();
        payload.onAttack(payload.card);
        played = true;
      }
    }

    if (!played) clearGhost();
  }

  window.attachCardPlay = function (el, opts) {
    if (!opts || (!opts.canAttack && !opts.canDefend)) return;

    el.classList.add('playable');
    el.style.touchAction = 'none';

    // Клик — быстрый ход без drag
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (opts.canDefend && opts.defendIdxs && opts.defendIdxs.length === 1) {
        try { el.parentNode && el.parentNode.removeChild(el); } catch (err) {}
        opts.onDefend(opts.defendIdxs[0], opts.card);
        return;
      }
      if (opts.canAttack && !opts.canDefend) {
        try { el.parentNode && el.parentNode.removeChild(el); } catch (err) {}
        opts.onAttack(opts.card);
        return;
      }
      if (opts.canDefend && opts.defendIdxs && opts.defendIdxs.length > 1) {
        var hint = document.getElementById('table-hint');
        if (hint) {
          hint.classList.remove('hide');
          hint.textContent = 'Перетащи карту на нужную на столе';
        }
      }
    });

    var startX = 0, startY = 0, moved = false;

    el.addEventListener(
      'touchstart',
      function (e) {
        if (!e.touches || !e.touches[0]) return;
        var t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        moved = false;
        dragState = opts;
        startGhost(el, t.clientX, t.clientY);
      },
      { passive: true }
    );

    el.addEventListener(
      'touchmove',
      function (e) {
        if (!dragState || !e.touches || !e.touches[0]) return;
        var t = e.touches[0];
        if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) moved = true;
        e.preventDefault();
        moveGhost(t.clientX, t.clientY);
      },
      { passive: false }
    );

    el.addEventListener('touchend', function (e) {
      if (!dragState) return;
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      if (t) {
        // короткий тап без движения — как клик
        if (!moved && opts.canAttack && !opts.canDefend) {
          dragState = null;
          clearGhost();
          try { el.parentNode && el.parentNode.removeChild(el); } catch (err) {}
          opts.onAttack(opts.card);
          return;
        }
        if (!moved && opts.canDefend && opts.defendIdxs && opts.defendIdxs.length === 1) {
          dragState = null;
          clearGhost();
          try { el.parentNode && el.parentNode.removeChild(el); } catch (err) {}
          opts.onDefend(opts.defendIdxs[0], opts.card);
          return;
        }
        finishDrop(t.clientX, t.clientY);
      } else {
        clearGhost();
      }
      dragState = null;
    });

    el.addEventListener('touchcancel', function () {
      clearGhost();
      dragState = null;
    });

    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', function (e) {
      dragState = opts;
      try {
        e.dataTransfer.setData('text/plain', 'card');
        e.dataTransfer.effectAllowed = 'move';
      } catch (err) {}
      startGhost(el, e.clientX || 0, e.clientY || 0);
    });
    el.addEventListener('drag', function (e) {
      if (e.clientX || e.clientY) moveGhost(e.clientX, e.clientY);
    });
    el.addEventListener('dragend', function (e) {
      finishDrop(e.clientX, e.clientY);
      dragState = null;
    });
  };
})();
