/**
 * Компактное меню: Играть / боты / вкладки магазина
 */
(function () {
  function $(id) { return document.getElementById(id); }

  function openSheet(id) {
    var el = $(id);
    if (el) el.classList.remove('hidden');
  }
  function closeSheet(id) {
    var el = $(id);
    if (el) el.classList.add('hidden');
  }

  function bindPlay() {
    var play = $('btn-play');
    if (play) {
      play.addEventListener('click', function () {
        openSheet('play-sheet');
      });
    }
    var close = $('btn-play-close');
    if (close) close.addEventListener('click', function () { closeSheet('play-sheet'); });

    var playSheet = $('play-sheet');
    if (playSheet) {
      playSheet.addEventListener('click', function (e) {
        if (e.target === playSheet) closeSheet('play-sheet');
      });
    }

    // Боты — сначала выбор кол-ва
    var vsBot = $('btn-vs-bot');
    if (vsBot) {
      vsBot.addEventListener(
        'click',
        function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          closeSheet('play-sheet');
          openSheet('bots-sheet');
        },
        true
      );
    }

    var botsClose = $('btn-bots-close');
    if (botsClose) {
      botsClose.addEventListener('click', function () {
        closeSheet('bots-sheet');
        openSheet('play-sheet');
      });
    }
    var botsSheet = $('bots-sheet');
    if (botsSheet) {
      botsSheet.addEventListener('click', function (e) {
        if (e.target === botsSheet) closeSheet('bots-sheet');
      });
    }

    // count buttons
    var counts = $('player-count-btns');
    if (counts) {
      counts.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-count]');
        if (!b) return;
        counts.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var n = parseInt(b.getAttribute('data-count'), 10);
        if (typeof window.playerCount !== 'undefined') window.playerCount = n;
        try { playerCount = n; } catch (err) {}
      });
    }

    var startBots = $('btn-bots-start');
    if (startBots) {
      startBots.addEventListener('click', function () {
        closeSheet('bots-sheet');
        if (typeof window.startVsBot === 'function') window.startVsBot();
        else if (typeof startVsBot === 'function') startVsBot();
      });
    }

    // другие режимы закрывают sheet
    ['btn-quick', 'btn-online', 'btn-friends'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('click', function () {
        closeSheet('play-sheet');
      });
    });
  }

  function bindShopTabs() {
    var tabs = $('shop-tabs');
    if (!tabs) return;
    tabs.addEventListener('click', function (e) {
      var t = e.target.closest('.shop-tab');
      if (!t) return;
      var name = t.getAttribute('data-tab');
      tabs.querySelectorAll('.shop-tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      ['stickers', 'donate', 'cases'].forEach(function (p) {
        var panel = $('shop-panel-' + p);
        if (!panel) return;
        if (p === name) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      });
    });
  }

  function bind() {
    bindPlay();
    bindShopTabs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 500);
})();
