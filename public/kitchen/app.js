/*
 * Konyhai munkapult.
 *
 * A szerver asztalonkent (rendelesenkent) blokkokba rendezve adja a meg
 * elkeszitendo eteleket; ez a modul kirajzolja oket, es leptet allapotot.
 *
 * A szakacs ket iranyba lephet: leadva -> keszul, keszul -> elkeszult. A
 * kiszolgalast a pincer jelzi, ide csak visszajelzesként jut vissza.
 *
 * Minden valtozas socket esemenyre erkezik (uj tetel, allapotvaltas,
 * kiszolgalas), igy a nezet ujratoltes nelkul kovet - fali monitoron is
 * magatol frissul.
 */
(function (window, document) {
  'use strict';

  var SORT_KEY = 'aoh.kitchen.sort';

  var STATUS_LABEL = {
    pending: 'leadva',
    preparing: 'készül',
    ready: 'elkészült',
    served: 'kiszolgálva'
  };

  /** A kovetkezo lepes allapotonkent (a kiszolgalas mar nem a konyhae). */
  var NEXT_STEP = {
    pending: { status: 'preparing', label: 'Indítás' },
    preparing: { status: 'ready', label: 'Kész' }
  };

  /*
   * Allapotikonok vektorosan: ora (sorban all), fazek (keszul), csengo (kesz),
   * pipa (kiszolgalva). Nem emoji, hogy minden kijelzon azonos legyen.
   */
  var ICONS = {
    pending: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    preparing:
      '<path d="M4.5 10h15v4.5a4 4 0 0 1-4 4h-7a4 4 0 0 1-4-4z"/>' +
      '<path d="M19.5 11.5h1.2a1.8 1.8 0 0 1 0 3.6h-1.2"/>' +
      '<path d="M9 6.5V4.8M12 6.2V4.2M15 6.5V4.8"/>',
    ready:
      '<path d="M18.5 16.5h-13L7 14.2V10a5 5 0 0 1 10 0v4.2z"/>' +
      '<path d="M10.2 19.2a2 2 0 0 0 3.6 0"/>',
    served: '<path d="M5 12.6l4.6 4.4L19 7.4"/>'
  };

  var state = {
    blocks: [],
    counts: {},
    sort: 'oldest',
    busy: false
  };

  var toastTimer = null;
  var reloadTimer = null;

  function el(selector) {
    return document.querySelector(selector);
  }

  function api(path, options) {
    return window.AndOrderAuth.request(path, options);
  }

  function toast(message, isError) {
    var box = el('[data-toast]');
    box.textContent = message;
    box.className = 'toast' + (isError ? ' toast--error' : '');
    box.hidden = false;

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      box.hidden = true;
    }, isError ? 6000 : 2500);
  }

  /** "12 perce" / "most" - a konyhan a perc a hasznos egyseg. */
  function agoLabel(minutes) {
    if (minutes === null || minutes === undefined) return '';
    if (minutes < 1) return 'most';
    return minutes + ' perce';
  }

  function statusIcon(status) {
    var span = document.createElement('span');
    span.className = 'state-icon state-icon--' + status;
    // Konstans jelolo, nem felhasznaloi adat.
    span.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[status] || '') +
      '</svg>';
    return span;
  }

  /* ---------------------------------------------------------- rajzolas */

  function renderItem(item) {
    var row = document.createElement('li');
    row.className = 'ticket-item ticket-item--' + item.status;
    row.dataset.itemId = item.id;
    row.dataset.itemStatus = item.status;

    row.appendChild(statusIcon(item.status));

    var main = document.createElement('div');
    main.className = 'ticket-item__main';

    var name = document.createElement('div');
    name.className = 'ticket-item__name';
    name.textContent = item.name + ' ×' + item.quantity;
    main.appendChild(name);

    // Extrak a tetel neve alatt, "+" jellel - a szakacsnak ez kulon munka.
    if (item.extras.length) {
      var extras = document.createElement('div');
      extras.className = 'ticket-item__extras';
      extras.textContent = item.extras
        .map(function (extra) { return '+ ' + extra.name; })
        .join('  ');
      main.appendChild(extras);
    }

    // Mikor kezdett keszulni - a kesobbi idotullepes-riasztas alapja.
    if (item.status === 'preparing' && item.preparingMinutes !== null) {
      var timer = document.createElement('div');
      timer.className = 'ticket-item__timer';
      timer.dataset.timerFrom = item.preparingStartedAt || '';
      timer.textContent = agoLabel(item.preparingMinutes) + ' készül';
      main.appendChild(timer);
    }

    row.appendChild(main);

    var side = document.createElement('div');
    side.className = 'ticket-item__side';

    var tag = document.createElement('span');
    tag.className = 'state-tag state-tag--' + item.status;
    tag.textContent = STATUS_LABEL[item.status] || item.status;
    side.appendChild(tag);

    var step = NEXT_STEP[item.status];
    if (step) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--step btn--step-' + step.status;
      button.dataset.step = item.id;
      button.dataset.stepStatus = step.status;
      button.textContent = step.label;
      button.disabled = state.busy;
      button.addEventListener('click', function () {
        stepItem(item.id, step.status);
      });
      side.appendChild(button);
    }

    row.appendChild(side);
    return row;
  }

  function renderBlock(block) {
    var card = document.createElement('article');
    card.className = 'ticket';
    card.dataset.orderId = block.orderId;

    var head = document.createElement('header');
    head.className = 'ticket__head';

    var label = document.createElement('span');
    label.className = 'ticket__label';
    label.textContent = block.label;
    head.appendChild(label);

    var age = document.createElement('span');
    age.className = 'ticket__age';
    age.dataset.timerFrom = block.createdAt;
    age.textContent = agoLabel(block.waitingMinutes);
    head.appendChild(age);

    card.appendChild(head);

    var list = document.createElement('ul');
    list.className = 'ticket__items';
    block.items.forEach(function (item) {
      list.appendChild(renderItem(item));
    });
    card.appendChild(list);

    // Vendegkommentek a blokk aljan, soronkent, idezojelben.
    var comments = block.items.filter(function (item) { return item.comment; });
    if (comments.length) {
      var notes = document.createElement('footer');
      notes.className = 'ticket__notes';
      comments.forEach(function (item) {
        var note = document.createElement('p');
        note.className = 'ticket__note';
        note.textContent = item.name + ' — „' + item.comment + '”';
        notes.appendChild(note);
      });
      card.appendChild(notes);
    }

    // Tomeges leptetes: csak akkor van ertelme, ha van mit lepni.
    var bulk = document.createElement('div');
    bulk.className = 'ticket__bulk';

    if (block.counts.pending) {
      bulk.appendChild(
        bulkButton(block, 'preparing', 'Mind indítása (' + block.counts.pending + ')')
      );
    }
    if (block.counts.pending || block.counts.preparing) {
      bulk.appendChild(
        bulkButton(block, 'ready', 'Mind elkészült (' + (block.counts.pending + block.counts.preparing) + ')')
      );
    }
    if (bulk.children.length) card.appendChild(bulk);

    return card;
  }

  function bulkButton(block, status, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--ghost btn--bulk';
    button.dataset.bulk = status;
    button.dataset.bulkOrder = block.orderId;
    button.textContent = label;
    button.disabled = state.busy;
    button.addEventListener('click', function () {
      stepBlock(block.orderId, status);
    });
    return button;
  }

  function render() {
    var board = el('[data-board]');
    board.innerHTML = '';

    var blocks = state.blocks.slice();
    if (state.sort === 'newest') blocks.reverse();

    blocks.forEach(function (block) {
      board.appendChild(renderBlock(block));
    });

    el('[data-board-empty]').hidden = blocks.length > 0;
    el('[data-count-pending]').textContent = state.counts.pending || 0;
    el('[data-count-preparing]').textContent = state.counts.preparing || 0;
    el('[data-count-ready]').textContent = state.counts.ready || 0;
  }

  /** Csak az eltelt idok frissitese - percenkent, ujrarajzolas nelkul. */
  function tickTimers() {
    var now = Date.now();
    document.querySelectorAll('[data-timer-from]').forEach(function (node) {
      var from = node.dataset.timerFrom;
      if (!from) return;

      var minutes = Math.max(0, Math.floor((now - new Date(from)) / 60000));
      node.textContent = node.classList.contains('ticket-item__timer')
        ? agoLabel(minutes) + ' készül'
        : agoLabel(minutes);
    });
  }

  /* --------------------------------------------------------- muveletek */

  function setBusy(busy) {
    state.busy = busy;
    document.querySelectorAll('[data-step], [data-bulk]').forEach(function (button) {
      button.disabled = busy;
    });
  }

  function load() {
    return api('/api/kitchen/orders')
      .then(function (data) {
        state.blocks = data.blocks || [];
        state.counts = data.counts || {};
        render();
        window.AndOrderUiState.clear('[data-load-error]');
        return data;
      })
      .catch(function (err) {
        // A konyhaban senki nem nezi a kepernyot folyamatosan: a hibauzenet
        // maradjon kint, amig valaki ujra nem probalja.
        window.AndOrderUiState.error('[data-load-error]', err, {
          title: 'A konyhai munkapult nem tölthető be.',
          retry: load
        });
        toast(err.message, true);
      });
  }

  /** Tobb esemeny egyszerre is erkezhet - egy korben toltunk ujra. */
  function scheduleReload() {
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(load, 150);
  }

  function stepItem(itemId, status) {
    if (state.busy) return;
    setBusy(true);

    api('/api/kitchen/order-items/' + itemId + '/status', {
      method: 'PATCH',
      body: { status: status }
    })
      .then(function (result) {
        toast(
          result.item.name + ' – ' + (STATUS_LABEL[status] || status) +
          (status === 'ready' ? ' · a pincér értesítést kapott' : '')
        );
        return load();
      })
      .catch(function (err) {
        toast(err.message || 'Az állapot módosítása nem sikerült.', true);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function stepBlock(orderId, status) {
    if (state.busy) return;
    setBusy(true);

    api('/api/kitchen/orders/' + orderId + '/items-status', {
      method: 'PATCH',
      body: { status: status }
    })
      .then(function (result) {
        toast(result.count + ' tétel · ' + (STATUS_LABEL[status] || status));
        return load();
      })
      .catch(function (err) {
        toast(err.message || 'Az állapot módosítása nem sikerült.', true);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  /* ----------------------------------------------------------- indulas */

  function setSort(sort) {
    state.sort = sort;
    el('[data-sort-toggle]').textContent =
      sort === 'oldest' ? 'Legrégebbi elöl' : 'Legújabb elöl';
    try {
      window.localStorage.setItem(SORT_KEY, sort);
    } catch (err) {
      /* privat bongeszes: csak erre a munkamenetre marad meg */
    }
  }

  function setupControls() {
    el('[data-board-refresh]').addEventListener('click', function () {
      load().then(function () {
        toast('Munkapult frissítve.');
      });
    });

    el('[data-sort-toggle]').addEventListener('click', function () {
      setSort(state.sort === 'oldest' ? 'newest' : 'oldest');
      render();
    });
  }

  function setupSocket() {
    var socket = window.AndOrderSocket;

    socket.connect({
      token: window.AndOrderAuth.getToken(),
      onSession: function (session) {
        console.log('[kitchen] szobák:', session.rooms.join(', '));
      }
    });

    // Uj rendeles vagy uj tetel: azonnal megjelenik a munkapulton.
    socket.on('order:created', function () {
      scheduleReload();
      toast('Új rendelés érkezett.');
    });
    socket.on('order_item:added', function () {
      scheduleReload();
      toast('Új tétel érkezett.');
    });

    // Masik szakacs leptetett, vagy a pincer kiszolgalt egy tetelt.
    socket.on('order_item:status_changed', scheduleReload);
    socket.on('order_item:served', scheduleReload);
  }

  function start() {
    var stored = 'oldest';
    try {
      stored = window.localStorage.getItem(SORT_KEY) || 'oldest';
    } catch (err) {
      /* alapertelmezes marad */
    }
    setSort(stored === 'newest' ? 'newest' : 'oldest');

    setupControls();
    setupSocket();
    load();

    // A "x perce" cimkek percenkent lepnek, teljes ujrarajzolas nelkul.
    window.setInterval(tickTimers, 30000);
  }

  window.AndOrderAuth.init({
    interface: 'kitchen',
    mode: 'pin',
    // Konyhai tablet / fali monitor: hosszabb élettartamú munkamenet.
    storage: 'local',
    role: 'cook',
    onLogin: start
  });

  // Fejlesztoi konzolbol es automatizalt ellenorzeskor is lekerdezheto allapot.
  window.AndOrderKitchen = { state: state, load: load, render: render };
})(window, document);
