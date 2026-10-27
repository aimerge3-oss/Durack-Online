/**
 * Drag / touch play cards onto table pairs (expanded hit area)
 */
(function () {
  var ghost = null;
  var dragState = null;

  function clearGhost() {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
    document.body.classList.remove('dragging-card');
    document.querySelectorAll('.drop-hover').forEach(function (el) {
      el.classList.remove('drop-hover');
    });
  }

  function startGhost(cardEl, x, y) {
    clearGhost();
    ghost = cardEl.cloneNode(true);
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

  function findDropZone(x, y) {
    // сначала точное попадание
    var under = document.elementFromPoint(x, y);
    if (under) {
      var z = under.closest('[data-drop]');
      if (z) return z;
    }
    // расширенная зона: ищем ближайшую непокрытую пару в радиусе ~56px
    var pairs = document.querySelectorAll('.table-pair[data-drop], .table-area[data-drop]');
    var best = null;
    var bestDist = 56;
    for (var i = 0; i < pairs.length; i++) {
      var el = pairs[i];
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dx = x - cx;
      var dy = y - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      // также считаем «внутри расширенного прямоугольника»
      var pad = 28;
      var inside =
        x >= r.left - pad &&
        x <= r.right + pad &&
        y >= r.top - pad &&
        y <= r.bottom + pad;
      if (inside && d < bestDist) {
        bestDist = d;
        best = el;
      } else if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    }
    return best;
  }

  function moveGhost(x, y) {
    if (!ghost) return;
    ghost.style.left = x - 30 + 'px';
    ghost.style.top = y - 40 + 'px';

    document.querySelectorAll('.drop-hover').forEach(function (el) {
      el.classList.remove('drop-hover');
    });
    var zone = findDropZone(x, y);
    if (zone) zone.classList.add('drop-hover');
  }

  function finishDrop(x, y) {
    var zone = findDropZone(x, y);
    clearGhost();
    if (!dragState || !zone) {
      dragState = null;
      return;
    }
    var payload = dragState;
    dragState = null;

    var kind = zone.getAttribute('data-drop');
    if (payload.canDefend && (kind === 'defend' || kind === 'attack')) {
      var idx = parseInt(zone.getAttribute('data-attack-index'), 10);
      if (isNaN(idx) && payload.defendIdxs && payload.defendIdxs.length) idx = payload.defendIdxs[0];
      if (payload.defendIdxs && payload.defendIdxs.indexOf(idx) !== -1 && typeof payload.onDefend === 'function') {
        payload.onDefend(idx, payload.card);
      }
      return;
    }
    if (payload.canAttack && (kind === 'attack' || kind === 'table' || kind === 'defend')) {
      if (typeof payload.onAttack === 'function') payload.onAttack(payload.card);
    }
  }

  window.attachCardPlay = function (el, opts) {
    if (!opts || (!opts.canAttack && !opts.canDefend)) return;

    el.classList.add('playable');
    el.style.touchAction = 'none';

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
      var hint = document.getElementById('table-hint');
      if (hint) {
        hint.classList.remove('hide');
        hint.textContent = 'Перетащи карту на нужную на столе';
      }
    });

    el.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches[0]) return;
      var t = e.touches[0];
      dragState = opts;
      startGhost(el, t.clientX, t.clientY);
    }, { passive: true });

    el.addEventListener('touchmove', function (e) {
      if (!dragState || !e.touches || !e.touches[0]) return;
      e.preventDefault();
      var t = e.touches[0];
      moveGhost(t.clientX, t.clientY);
    }, { passive: false });

    el.addEventListener('touchend', function (e) {
      if (!dragState) return;
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      if (t) finishDrop(t.clientX, t.clientY);
      else clearGhost();
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
        e.dataTransfer.setData('text/plain', JSON.stringify(opts.card));
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
