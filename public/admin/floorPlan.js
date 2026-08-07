/*
 * Admin - vizualis asztalterkep szerkeszto.
 *
 * MEGVALOSITAS: DOM + CSS transform, nem Canvas.
 *
 * Miert: az elemek szama kicsi (par tucat asztal), ezert a canvas rajzolasi
 * teljesitmenye nem hoz elonyt, cserebe DOM-mal ingyen megkapjuk azt, amit
 * canvason kezzel kellene megirni:
 *   - talalat-vizsgalat (melyik asztalra kattintottak) a bongeszo dolga,
 *   - a cimke es a komment sima szoveg: torddel, ellipszissel, betumerettel,
 *   - a fogantyuk kulon elemek, sajat kurzorral es touch-celponttal,
 *   - billentyuzet es kepernyoolvaso is eleri (tabindex, aria-label),
 *   - a stilus a meglevo CSS valtozokbol jon, nem kell a rajzoloba egetni.
 * A zonak viszont tetszoleges sokszogek lehetnek, azokat egy SVG retegen
 * rajzoljuk (polygon), az asztalok alatt.
 *
 * Az eger es az erintes kezelese kozos: Pointer Events (pointerdown/move/up),
 * igy tableten es asztali gepen ugyanaz a kod fut, kulso konyvtar nelkul.
 */
(function (window, document) {
  'use strict';

  var app = window.AdminApp;

  /** Racsra illesztes - a Shift lenyomva tartasa kikapcsolja. */
  var GRID = 10;
  var ROTATION_STEP = 15;
  var MIN_ZONE_SIZE = 40;

  var state = {
    tables: [],
    zones: [],
    limits: { SIZE_MIN: 30, SIZE_MAX: 600, POSITION_MAX: 5000 },
    defaultSize: { width: 90, height: 90 },
    selection: null, // { type: 'table' | 'zone', id }
    zoneMode: false,
    gesture: null // eppen folyo huzas/meretezes/forgatas
  };

  function canvas() {
    return document.querySelector('[data-floor-canvas]');
  }

  function snap(value, step, disabled) {
    return disabled ? Math.round(value) : Math.round(value / step) * step;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function findTable(id) {
    return state.tables.filter(function (table) { return table.id === id; })[0] || null;
  }

  function findZone(id) {
    return state.zones.filter(function (zone) { return zone.id === id; })[0] || null;
  }

  /* ------------------------------------------------------------ rajzolas */

  function renderTables() {
    var area = canvas();

    // A mar nem letezo asztalok elemeit eltavolitjuk.
    area.querySelectorAll('[data-table-id]').forEach(function (element) {
      if (!findTable(element.dataset.tableId)) element.remove();
    });

    state.tables.forEach(function (table) {
      var element = area.querySelector('[data-table-id="' + table.id + '"]');
      if (!element) {
        element = createTableElement(table);
        area.appendChild(element);
      }
      applyTableGeometry(element, table);

      element.querySelector('.floor-table__label').textContent = table.label;
      var comment = element.querySelector('.floor-table__comment');
      comment.textContent = table.comment || '';
      comment.hidden = !table.comment;

      element.classList.toggle(
        'is-selected',
        Boolean(state.selection && state.selection.type === 'table' && state.selection.id === table.id)
      );
      element.setAttribute(
        'aria-label',
        table.label + (table.comment ? ' – ' + table.comment : '')
      );
    });

    renderCounts();
  }

  function createTableElement(table) {
    var element = document.createElement('div');
    element.className = 'floor-table';
    element.dataset.tableId = table.id;
    element.tabIndex = 0;
    element.setAttribute('role', 'button');

    var label = document.createElement('span');
    label.className = 'floor-table__label';

    var comment = document.createElement('span');
    comment.className = 'floor-table__comment';

    var resize = document.createElement('span');
    resize.className = 'floor-handle floor-handle--resize';
    resize.dataset.handle = 'resize';
    resize.title = 'Méretezés';

    var rotate = document.createElement('span');
    rotate.className = 'floor-handle floor-handle--rotate';
    rotate.dataset.handle = 'rotate';
    rotate.title = 'Forgatás';

    element.appendChild(label);
    element.appendChild(comment);
    element.appendChild(resize);
    element.appendChild(rotate);

    element.addEventListener('pointerdown', onTablePointerDown);
    element.addEventListener('dblclick', function () {
      var input = document.querySelector('[data-floor-table-form] [name=comment]');
      if (input) input.focus();
    });

    return element;
  }

  /** A tarolt geometria kirakasa: bal-felso sarok + meret + kozeppont koruli forgatas. */
  function applyTableGeometry(element, table) {
    element.style.left = table.posX + 'px';
    element.style.top = table.posY + 'px';
    element.style.width = table.width + 'px';
    element.style.height = table.height + 'px';
    element.style.transform = 'rotate(' + table.rotation + 'deg)';
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function renderZones() {
    var layer = document.querySelector('[data-floor-zones]');
    layer.innerHTML = '';

    state.zones.forEach(function (zone) {
      var points = zone.shapeCoordinates || [];
      if (points.length < 3) return;

      var group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'floor-zone' + (isSelected('zone', zone.id) ? ' is-selected' : ''));
      group.dataset.zoneId = zone.id;

      var polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('class', 'floor-zone__shape');
      polygon.setAttribute(
        'points',
        points.map(function (point) { return point.x + ',' + point.y; }).join(' ')
      );
      polygon.addEventListener('pointerdown', function (event) {
        event.stopPropagation();
        select('zone', zone.id);
      });

      // A cimke a terulet bal felso sarkaba kerul: a sulypontban tipikusan
      // asztalok vannak, ott takarnak egymast a feliratok.
      var minX = Math.min.apply(null, points.map(function (point) { return point.x; }));
      var minY = Math.min.apply(null, points.map(function (point) { return point.y; }));

      var text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'floor-zone__label');
      text.setAttribute('x', minX + 10);
      text.setAttribute('y', minY + 20);
      text.textContent = zone.label;

      group.appendChild(polygon);
      group.appendChild(text);
      layer.appendChild(group);
    });
  }

  function renderCounts() {
    var box = document.querySelector('[data-floor-counts]');
    if (box) box.textContent = state.tables.length + ' asztal · ' + state.zones.length + ' zóna';
  }

  function isSelected(type, id) {
    return Boolean(state.selection && state.selection.type === type && state.selection.id === id);
  }

  /* ------------------------------------------------------------ kijeloles */

  function select(type, id) {
    state.selection = type && id ? { type: type, id: id } : null;
    renderTables();
    renderZones();
    renderPanels();
  }

  function renderPanels() {
    var empty = document.querySelector('[data-floor-empty]');
    var tableProps = document.querySelector('[data-floor-table-props]');
    var zoneProps = document.querySelector('[data-floor-zone-props]');

    var table = state.selection && state.selection.type === 'table' ? findTable(state.selection.id) : null;
    var zone = state.selection && state.selection.type === 'zone' ? findZone(state.selection.id) : null;

    empty.hidden = Boolean(table || zone);
    tableProps.hidden = !table;
    zoneProps.hidden = !zone;

    if (table) {
      var form = document.querySelector('[data-floor-table-form]');
      form.elements.label.value = table.label;
      form.elements.comment.value = table.comment || '';
      form.elements.posX.value = table.posX;
      form.elements.posY.value = table.posY;
      form.elements.width.value = table.width;
      form.elements.height.value = table.height;
      form.elements.rotation.value = table.rotation;
      app.clearErrors(form);
    }

    if (zone) {
      var zoneForm = document.querySelector('[data-floor-zone-form]');
      zoneForm.elements.label.value = zone.label;
      app.clearErrors(zoneForm);
      document.querySelector('[data-floor-zone-points]').textContent =
        (zone.shapeCoordinates || []).length + ' pontból álló terület.';
    }
  }

  /* -------------------------------------------------------------- mentes */

  /** Egy asztal mentese a szerverre (a muvelet lezarasakor hivjuk). */
  function saveTable(table, successMessage) {
    return app
      .api('/api/admin/tables/' + table.id, {
        method: 'PUT',
        body: {
          label: table.label,
          comment: table.comment,
          posX: table.posX,
          posY: table.posY,
          width: table.width,
          height: table.height,
          rotation: table.rotation
        }
      })
      .then(function (data) {
        Object.assign(findTable(table.id) || {}, data.table);
        if (successMessage) app.toast(successMessage);
        return data.table;
      })
      .catch(function (err) {
        app.toast(err.message, true);
        // Szerver oldali elutasitasnal visszatoltjuk az igazsagot.
        return load().then(function () { throw err; });
      });
  }

  /* -------------------------------------------------- huzas / meret / forgatas */

  function pointInCanvas(event) {
    var rect = canvas().getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onTablePointerDown(event) {
    var element = event.currentTarget;
    var table = findTable(element.dataset.tableId);
    if (!table) return;

    // Zona modban a vaszonra rajzolas a fontos, az asztalt csak kijeloljuk.
    select('table', table.id);
    if (state.zoneMode) return;

    var handle = event.target.dataset ? event.target.dataset.handle : null;
    var start = pointInCanvas(event);

    state.gesture = {
      type: handle || 'move',
      tableId: table.id,
      startPointer: start,
      startTable: { posX: table.posX, posY: table.posY, width: table.width, height: table.height, rotation: table.rotation },
      element: element,
      moved: false
    };

    element.setPointerCapture(event.pointerId);
    element.classList.add('is-dragging');
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event) {
    if (state.zoneDraft) {
      updateZoneDraft(event);
      return;
    }

    var gesture = state.gesture;
    if (!gesture) return;

    var table = findTable(gesture.tableId);
    if (!table) return;

    var point = pointInCanvas(event);
    var dx = point.x - gesture.startPointer.x;
    var dy = point.y - gesture.startPointer.y;
    var free = event.shiftKey; // Shift: racs nelkul, pixelre pontosan
    gesture.moved = gesture.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;

    if (gesture.type === 'move') {
      table.posX = clamp(snap(gesture.startTable.posX + dx, GRID, free), 0, state.limits.POSITION_MAX);
      table.posY = clamp(snap(gesture.startTable.posY + dy, GRID, free), 0, state.limits.POSITION_MAX);
    } else if (gesture.type === 'resize') {
      // A meretezes az asztal sajat (elforgatas elotti) rendszereben tortenik,
      // ezert az egermozgast visszaforgatjuk a tabla szogevel.
      var rad = (-gesture.startTable.rotation * Math.PI) / 180;
      var localX = dx * Math.cos(rad) - dy * Math.sin(rad);
      var localY = dx * Math.sin(rad) + dy * Math.cos(rad);

      table.width = clamp(
        snap(gesture.startTable.width + localX, GRID, free),
        state.limits.SIZE_MIN,
        state.limits.SIZE_MAX
      );
      table.height = clamp(
        snap(gesture.startTable.height + localY, GRID, free),
        state.limits.SIZE_MIN,
        state.limits.SIZE_MAX
      );
    } else if (gesture.type === 'rotate') {
      var centerX = gesture.startTable.posX + gesture.startTable.width / 2;
      var centerY = gesture.startTable.posY + gesture.startTable.height / 2;
      var angle = (Math.atan2(point.y - centerY, point.x - centerX) * 180) / Math.PI + 90;
      if (angle < 0) angle += 360;
      table.rotation = clamp(snap(angle, ROTATION_STEP, free) % 360, 0, 360);
      gesture.moved = true;
    }

    applyTableGeometry(gesture.element, table);
    renderPanels();
  }

  function onPointerUp(event) {
    if (state.zoneDraft) {
      finishZoneDraft(event);
      return;
    }

    var gesture = state.gesture;
    if (!gesture) return;
    state.gesture = null;

    gesture.element.classList.remove('is-dragging');
    try {
      gesture.element.releasePointerCapture(event.pointerId);
    } catch (err) {
      /* mar elengedte */
    }

    // Csak akkor mentunk, ha tenylegesen valtozott valami - a puszta
    // kijelolo kattintas ne generaljon szerver hivast.
    if (!gesture.moved) return;

    var table = findTable(gesture.tableId);
    if (table) saveTable(table);
  }

  /* --------------------------------------------------------- zona rajzolas */

  function setZoneMode(enabled) {
    state.zoneMode = enabled;
    canvas().classList.toggle('is-zone-mode', enabled);

    var button = document.querySelector('[data-floor-zone-mode]');
    button.classList.toggle('btn--active', enabled);
    button.textContent = enabled ? 'Zóna kijelölés (aktív)' : 'Zóna kijelölés';

    document.querySelector('[data-floor-hint]').textContent = enabled
      ? 'Húzz egy téglalapot a vásznon a zóna kijelöléséhez. A módból ugyanezzel a gombbal léphetsz ki.'
      : 'Húzd az asztalt a mozgatáshoz, a sarkát a méretezéshez, a felső fogantyút a forgatáshoz. Rácsra illesztés: Shift lenyomva kikapcsol.';
  }

  function onCanvasPointerDown(event) {
    if (!state.zoneMode) {
      // Ures teruletre kattintva megszunik a kijeloles.
      if (event.target === canvas() || event.target.classList.contains('floor-zones')) select(null);
      return;
    }
    if (state.gesture) return;

    var start = pointInCanvas(event);
    var draft = document.createElement('div');
    draft.className = 'floor-draft';
    canvas().appendChild(draft);

    state.zoneDraft = { start: start, current: start, element: draft };
    canvas().setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function updateZoneDraft(event) {
    var draft = state.zoneDraft;
    draft.current = pointInCanvas(event);

    var left = Math.min(draft.start.x, draft.current.x);
    var top = Math.min(draft.start.y, draft.current.y);

    draft.element.style.left = left + 'px';
    draft.element.style.top = top + 'px';
    draft.element.style.width = Math.abs(draft.current.x - draft.start.x) + 'px';
    draft.element.style.height = Math.abs(draft.current.y - draft.start.y) + 'px';
  }

  function finishZoneDraft(event) {
    var draft = state.zoneDraft;
    state.zoneDraft = null;
    draft.element.remove();

    try {
      canvas().releasePointerCapture(event.pointerId);
    } catch (err) {
      /* mar elengedte */
    }

    var free = event.shiftKey;
    var x1 = clamp(snap(Math.min(draft.start.x, draft.current.x), GRID, free), 0, state.limits.POSITION_MAX);
    var y1 = clamp(snap(Math.min(draft.start.y, draft.current.y), GRID, free), 0, state.limits.POSITION_MAX);
    var x2 = clamp(snap(Math.max(draft.start.x, draft.current.x), GRID, free), 0, state.limits.POSITION_MAX);
    var y2 = clamp(snap(Math.max(draft.start.y, draft.current.y), GRID, free), 0, state.limits.POSITION_MAX);

    if (x2 - x1 < MIN_ZONE_SIZE || y2 - y1 < MIN_ZONE_SIZE) {
      app.toast('A zóna túl kicsi, húzz nagyobb területet.', true);
      return;
    }

    var label = window.prompt('Zóna neve:', 'Zóna ' + (state.zones.length + 1));
    if (label === null || label.trim() === '') return;

    // Teglalap negy sarka - a tarolas sokszogkent tortenik, igy kesobb
    // tetszoleges alaku terulet is berajzolhato lesz.
    var shapeCoordinates = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 }
    ];

    app
      .api('/api/admin/zones', { method: 'POST', body: { label: label, shapeCoordinates: shapeCoordinates } })
      .then(function (data) {
        state.zones.push(data.zone);
        setZoneMode(false);
        select('zone', data.zone.id);
        app.toast('Zóna létrehozva.');
      })
      .catch(function (err) {
        app.toast(err.message, true);
      });
  }

  /* ------------------------------------------------------------ muveletek */

  function addTable() {
    var area = canvas();
    var width = state.defaultSize.width;
    var height = state.defaultSize.height;

    // A vaszon kozepere, racsra illesztve.
    var posX = snap(area.clientWidth / 2 - width / 2, GRID, false);
    var posY = snap(area.clientHeight / 2 - height / 2, GRID, false);

    var label = nextTableLabel();

    app
      .api('/api/admin/tables', {
        method: 'POST',
        body: { label: label, posX: posX, posY: posY, width: width, height: height, rotation: 0, comment: '' }
      })
      .then(function (data) {
        state.tables.push(data.table);
        select('table', data.table.id);
        app.toast('Asztal hozzáadva: ' + data.table.label);
      })
      .catch(function (err) {
        app.toast(err.message, true);
      });
  }

  /** Szabad megnevezes: "1. asztal", "2. asztal", ... */
  function nextTableLabel() {
    var index = state.tables.length + 1;
    var taken = state.tables.map(function (table) { return table.label.toLowerCase(); });
    while (taken.indexOf(index + '. asztal') !== -1) index += 1;
    return index + '. asztal';
  }

  function saveTableForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var table = findTable(state.selection && state.selection.id);
    if (!table) return;

    var values = app.values(form);
    app
      .submit(
        form,
        function () {
          return app.api('/api/admin/tables/' + table.id, { method: 'PUT', body: values });
        },
        'Asztal mentve.'
      )
      .then(function (data) {
        Object.assign(table, data.table);
        renderTables();
        renderPanels();
      })
      .catch(function () {});
  }

  /**
   * Asztal torlese. Ha a szerver 409-cel jelzi, hogy nyitott rendeles vagy
   * foglalas tartozik hozza, megerositest kerunk, es force=true-val ujra kuldjuk.
   */
  function deleteTable() {
    var table = findTable(state.selection && state.selection.id);
    if (!table) return;
    if (!app.confirm('Biztosan törlöd a(z) "' + table.label + '" asztalt?')) return;

    var remove = function (force) {
      return app.api('/api/admin/tables/' + table.id + (force ? '?force=true' : ''), {
        method: 'DELETE'
      });
    };

    remove(false)
      .catch(function (err) {
        if (err.status === 409 && err.data && err.data.details) {
          if (!app.confirm(err.message)) throw err;
          return remove(true);
        }
        throw err;
      })
      .then(function (result) {
        if (!result) return;
        state.tables = state.tables.filter(function (item) { return item.id !== table.id; });
        select(null);
        renderTables();
        app.toast(
          'Asztal törölve.' +
            (result.removedReservations ? ' Törölt foglalások: ' + result.removedReservations + '.' : '')
        );
      })
      .catch(function (err) {
        if (err && err.message) app.toast(err.message, true);
      });
  }

  function saveZoneForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var zone = findZone(state.selection && state.selection.id);
    if (!zone) return;

    app
      .submit(
        form,
        function () {
          return app.api('/api/admin/zones/' + zone.id, {
            method: 'PUT',
            body: { label: app.values(form).label }
          });
        },
        'Zóna mentve.'
      )
      .then(function (data) {
        Object.assign(zone, data.zone);
        renderZones();
        renderPanels();
      })
      .catch(function () {});
  }

  function deleteZone() {
    var zone = findZone(state.selection && state.selection.id);
    if (!zone) return;
    if (!app.confirm('Biztosan törlöd a(z) "' + zone.label + '" zónát?')) return;

    app
      .api('/api/admin/zones/' + zone.id, { method: 'DELETE' })
      .then(function () {
        state.zones = state.zones.filter(function (item) { return item.id !== zone.id; });
        select(null);
        renderZones();
        app.toast('Zóna törölve.');
      })
      .catch(function (err) {
        app.toast(err.message, true);
      });
  }

  /* ------------------------------------------------------ billentyuzet */

  function onKeyDown(event) {
    var panel = document.querySelector('[data-panel="floor"]');
    if (!panel || panel.hidden || !state.selection) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf(event.target.tagName) !== -1) return;

    if (event.key === 'Escape') {
      select(null);
      return;
    }
    if (event.key === 'Delete') {
      if (state.selection.type === 'table') deleteTable();
      else deleteZone();
      return;
    }

    // Nyilakkal finomhangolas: racslepes, Shift-tel egy pixel.
    var deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    var delta = deltas[event.key];
    if (!delta || state.selection.type !== 'table') return;

    var table = findTable(state.selection.id);
    if (!table) return;

    var step = event.shiftKey ? 1 : GRID;
    table.posX = clamp(table.posX + delta[0] * step, 0, state.limits.POSITION_MAX);
    table.posY = clamp(table.posY + delta[1] * step, 0, state.limits.POSITION_MAX);

    var element = canvas().querySelector('[data-table-id="' + table.id + '"]');
    if (element) applyTableGeometry(element, table);
    renderPanels();
    saveTable(table);
    event.preventDefault();
  }

  /* -------------------------------------------------------------- betoltes */

  function load() {
    return Promise.all([app.api('/api/admin/tables'), app.api('/api/admin/zones')]).then(
      function (responses) {
        state.tables = responses[0].tables;
        state.limits = responses[0].limits || state.limits;
        state.defaultSize = responses[0].defaultSize || state.defaultSize;
        state.zones = responses[1].zones;

        if (state.selection) {
          var stillThere =
            state.selection.type === 'table'
              ? findTable(state.selection.id)
              : findZone(state.selection.id);
          if (!stillThere) state.selection = null;
        }

        renderTables();
        renderZones();
        renderPanels();
      }
    );
  }

  var initialized = false;

  app.register('floor', {
    init: function () {
      if (initialized) return;
      initialized = true;

      document.querySelector('[data-floor-add-table]').addEventListener('click', addTable);
      document.querySelector('[data-floor-zone-mode]').addEventListener('click', function () {
        setZoneMode(!state.zoneMode);
      });

      document.querySelector('[data-floor-table-form]').addEventListener('submit', saveTableForm);
      document.querySelector('[data-floor-table-delete]').addEventListener('click', deleteTable);
      document.querySelector('[data-floor-zone-form]').addEventListener('submit', saveZoneForm);
      document.querySelector('[data-floor-zone-delete]').addEventListener('click', deleteZone);

      canvas().addEventListener('pointerdown', onCanvasPointerDown);
      // A mozgast/felengedest az ablakon figyeljuk, hogy a vaszonrol kicsuszo
      // huzas is rendesen lezaruljon.
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      document.addEventListener('keydown', onKeyDown);

      // Ha egy masik admin rendezi at a termet, kovetjuk a valtozast - de nem
      // rantjuk ki a kezunkbol az eppen huzott asztalt.
      window.AndOrderSocket.on('table:layout_changed', function () {
        var panel = document.querySelector('[data-panel="floor"]');
        if (!panel || panel.hidden || state.gesture || state.zoneDraft) return;
        load();
      });
    },

    load: load
  });
})(window, document);
