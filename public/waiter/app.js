/*
 * Pinceri felulet - az asztalterkep vezerlese.
 *
 * A rajzolas a floorMap.js dolga; itt van a betoltes, a valos ideju frissites,
 * az erintes/eger kezelese (koppintas, pasztazas, pinch-zoom) es a foglalas.
 */
(function (window, document) {
  'use strict';

  var map = null;
  var layout = { tables: [], zones: [] };
  var pending = { table: null, mode: null };
  var toastTimer = null;

  /** Az elkeszult etel hangjelzesenek kapcsoloja (keszuleken megjegyezve). */
  var SOUND_KEY = 'aoh.waiter.sound';
  var soundOn = true;
  var audioCtx = null;

  /* ----------------------------------------------------------- segedek */

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
    }, isError ? 6000 : 3000);
  }

  /* ------------------------------------------------------- hangjelzes */

  /**
   * Diszkret ket hangos jelzes, ha etel keszult el.
   *
   * Sajat generalt hang (Web Audio), nem kulso fajl - igy nincs plusz keres, es
   * offline is megszolal. A bongeszo csak felhasznaloi interakcio utan enged
   * hangot; a PIN-es belepes koppintasai ezt mar biztositjak.
   */
  function beep() {
    if (!soundOn) return;

    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      var start = audioCtx.currentTime;
      [880, 1174.7].forEach(function (frequency, index) {
        var at = start + index * 0.13;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.1, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + 0.13);
      });
    } catch (err) {
      /* a hangjelzes csak kiegeszites: ha nem megy, a vizualis jelzes marad */
    }
  }

  function setSound(on) {
    soundOn = on;
    var button = el('[data-sound-toggle]');
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.textContent = on ? '🔔 Hang: be' : '🔕 Hang: ki';
    try {
      window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch (err) {
      /* privat bongeszes: csak erre a munkamenetre marad meg */
    }
  }

  /** ISO idopont rovid, magyar formatumban. */
  function formatTime(iso) {
    var date = new Date(iso);
    return date.toLocaleString('hu-HU', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /** Date -> a datetime-local input formatuma (helyi ido szerint). */
  function toInputValue(date) {
    var pad = function (value) { return String(value).padStart(2, '0'); };
    return (
      date.getFullYear() +
      '-' + pad(date.getMonth() + 1) +
      '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) +
      ':' + pad(date.getMinutes())
    );
  }

  function clearErrors(form) {
    form.querySelectorAll('[data-field]').forEach(function (wrapper) {
      wrapper.classList.remove('field--error');
      var box = wrapper.querySelector('.field__error');
      if (box) box.textContent = '';
    });
  }

  function showErrors(form, fields) {
    clearErrors(form);
    (fields || []).forEach(function (item) {
      var wrapper = form.querySelector('[data-field="' + item.field + '"]');
      if (!wrapper) return;
      wrapper.classList.add('field--error');
      var box = wrapper.querySelector('.field__error');
      if (box) box.textContent = item.message;
    });
  }

  /* ---------------------------------------------------------- betoltes */

  /** Az elrendezes (asztalok, zonak) - ritkan valtozik. */
  function loadLayout() {
    return Promise.all([api('/api/waiter/tables'), api('/api/waiter/zones')]).then(function (res) {
      layout = { tables: res[0].tables, zones: res[1].zones };
      map.setLayout(layout);

      el('[data-map-empty]').hidden = layout.tables.length > 0 || layout.zones.length > 0;
      return layout;
    });
  }

  /** Az allapotok - ez frissul socket esemenyre, kis valasz. */
  function loadStates() {
    return api('/api/waiter/table-states').then(function (data) {
      map.setStates(data);
      renderSummary(data);
      return data;
    });
  }

  function renderSummary(data) {
    var counts = { free: 0, ordering: 0, bill_requested: 0, reserved: 0 };
    var ready = 0;

    (data.states || []).forEach(function (state) {
      counts[state.status] = (counts[state.status] || 0) + 1;
      if (state.reservation) counts.reserved += 1;
      ready += state.readyItemCount || 0;
    });

    el('[data-map-summary]').textContent =
      counts.ordering + ' rendelés alatt · ' +
      counts.free + ' szabad · ' +
      counts.reserved + ' lefoglalva' +
      (ready ? ' · ' + ready + ' elkészült tétel vár' : '') +
      (data.online && data.online.activeCount ? ' · ' + data.online.activeCount + ' online rendelés' : '');
  }

  /**
   * Teljes ujratoltes (elrendezes + allapotok).
   *
   * Halozati hiba eseten a kepernyon marado hibadobozt mutatjuk
   * ujraprobalkozas gombbal - egy elszallo toast a pincer kezeben eszrevetlen
   * maradna, es az asztalterkep magyarazat nelkul allna meg.
   */
  function refreshAll() {
    return loadLayout()
      .then(loadStates)
      .then(function (data) {
        window.AndOrderUiState.clear('[data-load-error]');
        return data;
      })
      .catch(function (err) {
        window.AndOrderUiState.error('[data-load-error]', err, {
          title: 'Az asztaltérkép nem tölthető be.',
          retry: refreshAll
        });
        throw err;
      });
  }

  /* ------------------------------------------------------------- menu */

  function openMenu(hit, screenX, screenY) {
    var menu = el('[data-map-menu]');

    if (hit.type === 'online') {
      pending = { table: null, mode: 'online' };
      el('[data-menu-title]').textContent = 'Online rendelések';
      el('[data-menu-meta]').textContent =
        hit.online.activeCount + ' feldolgozásra váró online rendelés.';
      el('[data-menu-reserve]').hidden = true;
      el('[data-menu-status]').hidden = hit.online.activeCount === 0;
    } else {
      var table = hit.table;
      var state = hit.state || {};
      pending = { table: table, mode: 'table' };

      el('[data-menu-title]').textContent = table.label;

      var meta = [];
      if (state.status === 'ordering') meta.push('Rendelés alatt (' + state.openItemCount + ' tétel)');
      else if (state.status === 'bill_requested') meta.push('Számlát kért');
      else meta.push('Szabad');
      if (state.readyItemCount) meta.push(state.readyItemCount + ' elkészült tétel vár');
      if (table.comment) meta.push(table.comment);
      if (state.reservation) {
        meta.push(
          (state.reservation.isActive ? 'Foglalás most: ' : 'Foglalva: ') +
            formatTime(state.reservation.reservedFrom) +
            ' – ' +
            formatTime(state.reservation.reservedTo) +
            (state.reservation.comment ? ' (' + state.reservation.comment + ')' : '')
        );
      }
      el('[data-menu-meta]').textContent = meta.join(' · ');
      el('[data-menu-reserve]').hidden = false;
      // Attekinteni csak akkor van mit, ha van nyitott rendeles az asztalon.
      el('[data-menu-status]').hidden = !state.openOrderCount;

      map.select(table.id);
    }

    // A menu a kereten belul marad.
    var frame = el('[data-map-frame]').getBoundingClientRect();
    menu.hidden = false;
    var width = menu.offsetWidth;
    var height = menu.offsetHeight;

    menu.style.left = Math.max(8, Math.min(screenX, frame.width - width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(screenY, frame.height - height - 8)) + 'px';
  }

  function closeMenu() {
    el('[data-map-menu]').hidden = true;
    map.select(null);
  }

  /* --------------------------------------------------------- foglalas */

  function openReserveDialog() {
    if (!pending.table) return;

    var form = el('[data-reserve-form]');
    clearErrors(form);

    // Alapertelmezes: a kovetkezo negyedora, masfel oras idotartammal.
    var start = new Date(Math.ceil(Date.now() / (15 * 60000)) * 15 * 60000);
    form.elements.reservedFrom.value = toInputValue(start);
    form.elements.duration.value = '90';
    form.elements.comment.value = '';
    syncEndTime();

    el('[data-reserve-table]').textContent = pending.table.label +
      (pending.table.comment ? ' – ' + pending.table.comment : '');
    el('[data-reserve-dialog]').hidden = false;
    form.elements.reservedFrom.focus();
  }

  /** A vege idopont a kezdes + idotartam alapjan. */
  function syncEndTime() {
    var form = el('[data-reserve-form]');
    var from = form.elements.reservedFrom.value;
    if (!from) return;

    var minutes = Number(form.elements.duration.value) || 90;
    var end = new Date(new Date(from).getTime() + minutes * 60000);
    form.elements.reservedTo.value = toInputValue(end);
  }

  function submitReservation(event) {
    event.preventDefault();
    if (!pending.table) return;

    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var values = {
      tableId: pending.table.id,
      // A datetime-local helyi idot ad; ISO-ra alakitva kuldjuk.
      reservedFrom: new Date(form.elements.reservedFrom.value).toISOString(),
      reservedTo: new Date(form.elements.reservedTo.value).toISOString(),
      comment: form.elements.comment.value
    };

    clearErrors(form);
    button.disabled = true;

    api('/api/waiter/reservations', { method: 'POST', body: values })
      .then(function (data) {
        el('[data-reserve-dialog]').hidden = true;
        closeMenu();
        toast('Foglalás rögzítve: ' + formatTime(data.reservation.reservedFrom));
        // A sajat nezet azonnal frissul; a tobbi pincer a socket esemenybol.
        return loadStates();
      })
      .catch(function (err) {
        if (err.data && err.data.fields) showErrors(form, err.data.fields);
        toast(err.message, true);
      })
      .finally(function () {
        button.disabled = false;
      });
  }

  /* ------------------------------------------------- rendelesfelvetel */

  /**
   * A kijelolt asztal, vagy - az auto ikonrol - a legregebbi meg le nem zart
   * online rendeles. Ebbol a leirasbol dolgozik a rendelesfelvetel es az
   * attekinto nezet is.
   *
   * @returns {Promise<object|null>}
   */
  function resolveContext() {
    if (pending.mode === 'online') {
      return api('/api/waiter/online-orders').then(function (data) {
        var order = (data.orders || [])[0];
        if (!order) {
          toast('Nincs feldolgozásra váró online rendelés.', true);
          return null;
        }
        return { type: 'order', orderId: order.id, label: 'Online rendelés' };
      });
    }

    if (!pending.table) return Promise.resolve(null);
    return Promise.resolve({
      type: 'table',
      tableId: pending.table.id,
      label: pending.table.label
    });
  }

  /** Rendelesfelvetel megnyitasa. */
  function openOrderView(context) {
    closeMenu();

    var resolved = context ? Promise.resolve(context) : resolveContext();
    resolved
      .then(function (target) {
        if (target) window.AndOrderOrderView.open(target);
      })
      .catch(function (err) {
        toast(err.message, true);
      });
  }

  /** Rendeles-attekinto (allapotkovetes es kiszolgalas) megnyitasa. */
  function openStatusView(context) {
    closeMenu();

    var resolved = context ? Promise.resolve(context) : resolveContext();
    resolved
      .then(function (target) {
        if (target) window.AndOrderOrderStatus.open(target);
      })
      .catch(function (err) {
        toast(err.message, true);
      });
  }

  /* ------------------------------------------------ eger es erintes */

  var gesture = null;

  function localPoint(event) {
    var rect = el('[data-map-frame]').getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function setupPointer() {
    var frame = el('[data-map-frame]');
    var pointers = new Map();
    var pinchStart = null;

    frame.addEventListener('pointerdown', function (event) {
      pointers.set(event.pointerId, localPoint(event));

      if (pointers.size === 2) {
        // Ket ujj: pinch-to-zoom, a pasztazas ilyenkor all.
        var values = Array.from(pointers.values());
        pinchStart = {
          distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y),
          scale: map.getScale(),
          center: {
            x: (values[0].x + values[1].x) / 2,
            y: (values[0].y + values[1].y) / 2
          }
        };
        gesture = null;
        return;
      }

      gesture = { start: localPoint(event), last: localPoint(event), moved: false };
      frame.setPointerCapture(event.pointerId);
    });

    frame.addEventListener('pointermove', function (event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, localPoint(event));

      if (pinchStart && pointers.size === 2) {
        var values = Array.from(pointers.values());
        var distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
        if (pinchStart.distance > 0) {
          var target = pinchStart.scale * (distance / pinchStart.distance);
          map.zoomAt(target / map.getScale(), pinchStart.center.x, pinchStart.center.y);
          updateZoomLabel();
        }
        return;
      }

      if (!gesture) return;
      var point = localPoint(event);
      var dx = point.x - gesture.last.x;
      var dy = point.y - gesture.last.y;

      if (!gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 6) {
        gesture.moved = true;
        closeMenu();
      }
      if (gesture.moved) {
        map.pan(dx, dy);
        gesture.last = point;
      }
    });

    function endPointer(event) {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = null;

      if (!gesture) return;
      var finished = gesture;
      gesture = null;

      try {
        frame.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* mar elengedte */
      }

      // Koppintas (nem huzas): kivalasztas.
      if (finished.moved) return;

      var point = localPoint(event);
      var hit = map.hitTest(point.x, point.y);
      if (hit) openMenu(hit, point.x + 12, point.y + 12);
      else closeMenu();
    }

    frame.addEventListener('pointerup', endPointer);
    frame.addEventListener('pointercancel', endPointer);

    // Egergorgo: nagyitas a kurzor korul.
    frame.addEventListener('wheel', function (event) {
      event.preventDefault();
      var point = localPoint(event);
      map.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, point.x, point.y);
      updateZoomLabel();
    }, { passive: false });
  }

  function updateZoomLabel() {
    el('[data-map-zoom-value]').textContent = Math.round(map.getScale() * 100) + '%';
  }

  /* ----------------------------------------------------------- indulas */

  function setupControls() {
    el('[data-map-zoom-in]').addEventListener('click', function () {
      map.zoomAt(1.2);
      updateZoomLabel();
    });
    el('[data-map-zoom-out]').addEventListener('click', function () {
      map.zoomAt(1 / 1.2);
      updateZoomLabel();
    });
    el('[data-map-zoom-fit]').addEventListener('click', function () {
      map.fit();
      updateZoomLabel();
    });
    el('[data-map-refresh]').addEventListener('click', function () {
      refreshAll().then(function () {
        toast('Asztaltérkép frissítve.');
      });
    });

    el('[data-menu-close]').addEventListener('click', closeMenu);
    el('[data-menu-reserve]').addEventListener('click', openReserveDialog);
    el('[data-menu-order]').addEventListener('click', function () { openOrderView(); });
    el('[data-menu-status]').addEventListener('click', function () { openStatusView(); });

    // A rendelesfelvetelbol atlepes az attekintesre ugyanarra az asztalra.
    el('[data-order-status]').addEventListener('click', function () {
      var context = window.AndOrderOrderView.getContext();
      window.AndOrderOrderView.close();
      if (context) openStatusView(context);
    });

    el('[data-sound-toggle]').addEventListener('click', function () {
      setSound(!soundOn);
      if (soundOn) beep();
    });

    var form = el('[data-reserve-form]');
    form.addEventListener('submit', submitReservation);
    form.elements.reservedFrom.addEventListener('change', syncEndTime);
    form.elements.duration.addEventListener('change', syncEndTime);
    el('[data-reserve-cancel]').addEventListener('click', function () {
      el('[data-reserve-dialog]').hidden = true;
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!el('[data-reserve-dialog]').hidden) el('[data-reserve-dialog]').hidden = true;
      else closeMenu();
    });

    /*
     * Atmeretezes: a bongeszo huzas kozben tucatnyi esemenyt kuld, de eleg a
     * kovetkezo kepkockan egyszer ujrarajzolni.
     */
    var resizeFrame = null;
    window.addEventListener('resize', function () {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(function () {
        resizeFrame = null;
        map.resize();
      });
    });
  }

  /** Minden nyitott nezet frissitese egy esemeny utan. */
  function refreshViews() {
    loadStates();
    window.AndOrderOrderView.refresh();
    window.AndOrderOrderStatus.refresh();
  }

  /**
   * Osszevont frissites (15. szegmens).
   *
   * Egy asztalnal tobb esemeny is erkezhet egymas utan tized-masodpercen belul
   * (a konyha egyszerre lep tovabb tobb tetelt, a rendeles leadasa utan pedig
   * az `order:created` es az `order_item:added` is befut). Enelkul minden
   * esemeny kulon halozati kerest es teljes Canvas-ujrarajzolast inditana.
   *
   * A kesleltetes rovid: a pincer szamara ez eszrevehetetlen, de a sorozatban
   * erkezo esemenyeket egyetlen frissitesse vonja ossze.
   */
  var refreshTimer = null;

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      refreshTimer = null;
      refreshViews();
    }, 150);
  }

  /** itemId -> mikor jeleztuk; ugyanarrol a tetelrol ne szoljunk ketszer. */
  var announced = {};

  /**
   * "Elkészült" jelzes: felvillano asztal a terkepen + toast + hangjelzes.
   *
   * Ugyanarra a tetelre ket forrasbol is erkezhet jelzes (a socket esemeny es a
   * nyitott attekinto ujratoltese), ezert rovid ideig szurunk az ismetlesre.
   *
   * @param {object} item a tetel (nev, mennyiseg)
   * @param {string} [tableLabel] melyik asztalhoz tartozik
   * @param {string} [tableId] a felvillantando asztal
   */
  function announceReady(item, tableLabel, tableId) {
    var now = Date.now();
    Object.keys(announced).forEach(function (id) {
      if (now - announced[id] > 60000) delete announced[id];
    });
    if (announced[item.id] && now - announced[item.id] < 5000) return;
    announced[item.id] = now;

    toast(
      'Elkészült: ' + item.quantity + '× ' + item.name +
        (tableLabel ? ' – ' + tableLabel : '')
    );
    beep();
    if (tableId) map.flashTable(tableId);
  }

  /** A valos ideju esemenyek: allapot- es elrendezes-frissites ujratoltes nelkul. */
  function setupSocket() {
    var socket = window.AndOrderSocket;

    socket.connect({
      token: window.AndOrderAuth.getToken(),
      onSession: function (session) {
        console.log('[waiter] szobák:', session.rooms.join(', '));
      }
    });

    // Allapotot erinto esemenyek: eleg a kis table-states valaszt ujra kerni.
    // Ha eppen nyitva van a rendelesfelvetel vagy az attekinto, azok is
    // frissulnek (mas pincer is adhatott tetelt ugyanahhoz az asztalhoz).
    ['table:status_changed', 'table:reserved', 'order:created', 'order_item:added',
      'order_item:served', 'order:payment_recorded'].forEach(function (event) {
      socket.on(event, function () {
        scheduleRefresh();
      });
    });

    // A konyhai allapotvaltas (9. szegmens) ezen az esemenyen erkezik. Az
    // elkeszult etelrol kulon is szolunk: felvillan az asztal a terkepen,
    // toast es - ha be van kapcsolva - rovid hangjelzes hivja fel ra a
    // figyelmet, hogy ne kelljen a reszletes nezetet figyelni.
    socket.on('order_item:status_changed', function (payload) {
      scheduleRefresh();

      var item = payload && payload.orderItem;
      if (!item || item.status !== 'ready') return;

      var order = (payload && payload.order) || {};
      announceReady(item, order.tableLabel, order.tableId);
    });

    // Az admin atrendezte a termet: az elrendezes is valtozott.
    socket.on('table:layout_changed', function () {
      refreshAll().then(function () {
        toast('Az elrendezés frissült.');
      });
    });
  }

  function start() {
    map = window.FloorMap.create({ canvas: el('[data-map-canvas]') });
    // A terkep peldanya kivulrol is elerheto: fejlesztoi konzolbol es
    // automatizalt ellenorzeskor igy lehet a nezetre rakerdezni.
    window.AndOrderFloorMap = map;

    setupControls();
    setupPointer();
    setupSocket();

    window.AndOrderOrderView.setup({
      api: api,
      toast: toast,
      // Leadas utan az asztalterkep allapota is frissul ("rendeles alatt").
      onSubmitted: function () {
        loadStates();
      }
    });

    window.AndOrderOrderStatus.setup({
      api: api,
      toast: toast,
      // Kiszolgalas utan a terkep is frissul (elfogyhatott az "elkeszult" jelzes).
      onChanged: function () {
        loadStates();
      },
      onTakeOrder: function (context) {
        openOrderView(context);
      },
      // Ha nyitva van az attekinto, es ott lesz kesz egy tetel, ugyanugy szolunk.
      onReadyItems: function (items) {
        var order = window.AndOrderOrderStatus.state.order;
        announceReady(items[0], order && order.tableLabel, order && order.tableId);
      }
    });

    try {
      setSound(window.localStorage.getItem(SOUND_KEY) !== 'off');
    } catch (err) {
      setSound(true);
    }

    map.resize();

    refreshAll()
      .then(function () {
        map.fit();
        updateZoomLabel();
      })
      .catch(function (err) {
        toast(err.message, true);
      });
  }

  window.AndOrderAuth.init({
    interface: 'waiter',
    mode: 'pin',
    // Tableten hosszabb élettartamú munkamenet.
    storage: 'local',
    role: 'waiter',
    onLogin: start
  });
})(window, document);
