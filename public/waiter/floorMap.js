/*
 * Pinceri asztalterkep - natív HTML5 Canvas rajzolo, kulso konyvtar nelkul.
 *
 * Az admin altal beallitott geometriat (posX, posY, rotation, width, height)
 * rajzolja ki: a zonakat sokszogkent, az asztalokat elforgatott teglalapkent.
 *
 * Nezet: world -> screen transzformacio (scale + eltolas). A pasztazas es a
 * nagyitas (gombok, egergorgo, pinch) ezt a ket erteket allitja, a rajzolas
 * mindig ugyanabbol a vilag-koordinatabol dolgozik.
 *
 * Az ikonokat (ora, auto) vektorosan rajzoljuk, nem emojival: igy nem fugg
 * attol, hogy a keszuleken van-e emoji betukeszlet.
 */
(function (window) {
  'use strict';

  /** Allapotszinek - a pinceri zold-fekete temahoz igazitva. */
  var COLORS = {
    free: { stroke: '#8b8b93', fill: 'rgba(139, 139, 147, 0.16)', text: '#e7e7ea' },
    ordering: { stroke: '#35c46a', fill: 'rgba(53, 196, 106, 0.22)', text: '#eafff1' },
    bill_requested: { stroke: '#f2b544', fill: 'rgba(242, 181, 68, 0.22)', text: '#fff6e2' },
    zone: { stroke: 'rgba(90, 200, 220, 0.7)', fill: 'rgba(90, 200, 220, 0.1)', text: 'rgba(175, 232, 242, 0.9)' },
    grid: 'rgba(53, 196, 106, 0.07)',
    selected: '#ffffff'
  };

  var MIN_SCALE = 0.25;
  var MAX_SCALE = 3;

  function createFloorMap(options) {
    var canvas = options.canvas;
    var ctx = canvas.getContext('2d');

    var map = {
      tables: [],
      zones: [],
      states: {},
      online: { activeCount: 0, orders: [] },
      selectedTableId: null,

      view: { scale: 1, offsetX: 0, offsetY: 0 },
      /** Kepernyo-koordinatas talalati teruletek (auto ikon). */
      iconHits: [],

      onSelect: options.onSelect || function () {},
      onBackground: options.onBackground || function () {}
    };

    /* ---------------------------------------------------------- meretezes */

    /**
     * A canvas belso felbontasa a CSS meret * devicePixelRatio, hogy retina
     * kijelzon se legyen elmosodott a rajz.
     */
    function resize() {
      var ratio = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      map.cssWidth = rect.width;
      map.cssHeight = rect.height;
      draw();
    }

    /** A tartalom befoglalo teglalapja vilag-koordinatakban. */
    function contentBounds() {
      var minX = Infinity;
      var minY = Infinity;
      var maxX = -Infinity;
      var maxY = -Infinity;

      map.tables.forEach(function (table) {
        minX = Math.min(minX, table.posX);
        minY = Math.min(minY, table.posY);
        maxX = Math.max(maxX, table.posX + table.width);
        maxY = Math.max(maxY, table.posY + table.height);
      });

      map.zones.forEach(function (zone) {
        (zone.shapeCoordinates || []).forEach(function (point) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
      });

      if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1200, maxY: 720 };
      return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    /** A teljes elrendezes belefeszitese a vaszonba. */
    function fit() {
      if (!map.cssWidth) return;

      var bounds = contentBounds();
      var padding = 40;
      var width = Math.max(bounds.maxX - bounds.minX, 1);
      var height = Math.max(bounds.maxY - bounds.minY, 1);

      var scale = Math.min(
        (map.cssWidth - padding * 2) / width,
        (map.cssHeight - padding * 2) / height
      );
      map.view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
      map.view.offsetX = (map.cssWidth - width * map.view.scale) / 2 - bounds.minX * map.view.scale;
      map.view.offsetY = (map.cssHeight - height * map.view.scale) / 2 - bounds.minY * map.view.scale;

      draw();
    }

    /** Nagyitas a vaszon kozeppontja (vagy egy megadott pont) korul. */
    function zoomAt(factor, screenX, screenY) {
      var previous = map.view.scale;
      var next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, previous * factor));
      if (next === previous) return;

      var cx = screenX === undefined ? map.cssWidth / 2 : screenX;
      var cy = screenY === undefined ? map.cssHeight / 2 : screenY;

      // A kurzor alatti vilag-pont a helyen marad.
      map.view.offsetX = cx - ((cx - map.view.offsetX) / previous) * next;
      map.view.offsetY = cy - ((cy - map.view.offsetY) / previous) * next;
      map.view.scale = next;

      draw();
    }

    function pan(dx, dy) {
      map.view.offsetX += dx;
      map.view.offsetY += dy;
      draw();
    }

    function toWorld(screenX, screenY) {
      return {
        x: (screenX - map.view.offsetX) / map.view.scale,
        y: (screenY - map.view.offsetY) / map.view.scale
      };
    }

    function toScreen(worldX, worldY) {
      return {
        x: worldX * map.view.scale + map.view.offsetX,
        y: worldY * map.view.scale + map.view.offsetY
      };
    }

    /* ------------------------------------------------------------ rajzolas */

    function draw() {
      if (!map.cssWidth) return;
      map.iconHits = [];

      ctx.clearRect(0, 0, map.cssWidth, map.cssHeight);
      drawGrid();

      // 1. menet: a vilag-koordinatas elemek (zonak, asztalok).
      ctx.save();
      ctx.translate(map.view.offsetX, map.view.offsetY);
      ctx.scale(map.view.scale, map.view.scale);

      map.zones.forEach(drawZone);
      map.tables.forEach(drawTable);

      ctx.restore();

      // 2. menet: az ikonok mar kepernyo-koordinataban, hogy a nagyitastol
      // fuggetlenul ugyanakkorak es olvashatok maradjanak. Fontos, hogy ez a
      // vilag-transzformacio visszaallitasa UTAN fusson, kulonben a
      // kepernyo-koordinatak megegyszer atmennenek a transzformacion.
      map.tables.forEach(drawTableIcons);
      map.zones.forEach(drawZoneBadge);
    }

    /** Foglalas orajele az asztal jobb felso sarkanal, kepernyo-meretben. */
    function drawTableIcons(table) {
      var state = map.states[table.id];
      if (!state || !state.reservation) return;

      var corner = toScreen(table.posX + table.width, table.posY);
      drawClock(corner.x - 4, corner.y + 4, state.reservation.isActive);
    }

    /** Halvany racs, hogy a vaszon ne hasson uresnek. */
    function drawGrid() {
      var step = 100 * map.view.scale;
      if (step < 20) return;

      ctx.save();
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (var x = map.view.offsetX % step; x < map.cssWidth; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, map.cssHeight);
      }
      for (var y = map.view.offsetY % step; y < map.cssHeight; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(map.cssWidth, Math.round(y) + 0.5);
      }

      ctx.stroke();
      ctx.restore();
    }

    function drawZone(zone) {
      var points = zone.shapeCoordinates || [];
      if (points.length < 3) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();

      ctx.fillStyle = COLORS.zone.fill;
      ctx.fill();

      ctx.strokeStyle = COLORS.zone.stroke;
      ctx.lineWidth = 2 / map.view.scale;
      ctx.setLineDash([8 / map.view.scale, 6 / map.view.scale]);
      ctx.stroke();
      ctx.setLineDash([]);

      // A felirat a bal felso sarokba, hogy ne takarja az asztalokat.
      var minX = Math.min.apply(null, points.map(function (p) { return p.x; }));
      var minY = Math.min.apply(null, points.map(function (p) { return p.y; }));

      ctx.fillStyle = COLORS.zone.text;
      ctx.font = 600 + ' ' + 13 / map.view.scale + 'px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(zone.label, minX + 8 / map.view.scale, minY + 6 / map.view.scale);
      ctx.restore();
    }

    /** Az online rendelesek auto ikonja a zona kozepen, kepernyo-meretben. */
    function drawZoneBadge(zone) {
      if (!map.online || !map.online.activeCount) return;

      var points = zone.shapeCoordinates || [];
      if (points.length < 3) return;

      // A zona jobb felso sarka: a kozeppontban tipikusan asztalok vannak,
      // ott az ikon eltakarna oket.
      var maxX = Math.max.apply(null, points.map(function (p) { return p.x; }));
      var minY = Math.min.apply(null, points.map(function (p) { return p.y; }));
      var screen = toScreen(maxX, minY);
      screen.x -= 30;
      screen.y += 30;
      if (screen.x < -40 || screen.y < -40 || screen.x > map.cssWidth + 40 || screen.y > map.cssHeight + 40) {
        return;
      }

      drawCar(screen.x, screen.y, map.online.activeCount);
      map.iconHits.push({ type: 'online', x: screen.x, y: screen.y, radius: 30 });
    }

    /** Egyszeru auto ikon + darabszam jelvennyel. */
    function drawCar(x, y, count) {
      ctx.save();
      ctx.translate(x, y);

      // hatter korong
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(90, 200, 220, 0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90, 200, 220, 0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // karosszeria
      ctx.fillStyle = '#aef0fa';
      roundedRect(-15, -3, 30, 11, 3);
      ctx.fill();

      // teto
      ctx.beginPath();
      ctx.moveTo(-9, -3);
      ctx.lineTo(-5, -11);
      ctx.lineTo(6, -11);
      ctx.lineTo(10, -3);
      ctx.closePath();
      ctx.fill();

      // kerekek
      ctx.fillStyle = '#04252b';
      [-8, 8].forEach(function (wheelX) {
        ctx.beginPath();
        ctx.arc(wheelX, 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      if (count > 1) {
        ctx.beginPath();
        ctx.arc(18, -16, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#35c46a';
        ctx.fill();

        ctx.fillStyle = '#04140a';
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(count), 18, -15);
      }

      ctx.restore();
    }

    function roundedRect(x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + width, y, x + width, y + height, radius);
      ctx.arcTo(x + width, y + height, x, y + height, radius);
      ctx.arcTo(x, y + height, x, y, radius);
      ctx.arcTo(x, y, x + width, y, radius);
      ctx.closePath();
    }

    function drawTable(table) {
      var state = map.states[table.id] || { status: 'free' };
      var colors = COLORS[state.status] || COLORS.free;

      var centerX = table.posX + table.width / 2;
      var centerY = table.posY + table.height / 2;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((table.rotation * Math.PI) / 180);

      var half = { w: table.width / 2, h: table.height / 2 };

      roundedRect(-half.w, -half.h, table.width, table.height, 8);
      ctx.fillStyle = colors.fill;
      ctx.fill();

      ctx.strokeStyle = table.id === map.selectedTableId ? COLORS.selected : colors.stroke;
      ctx.lineWidth = (table.id === map.selectedTableId ? 4 : 2.5) / map.view.scale;
      ctx.stroke();

      // A felirat vizszintes marad akkor is, ha az asztal el van forgatva.
      ctx.rotate((-table.rotation * Math.PI) / 180);

      ctx.fillStyle = colors.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + 14 / map.view.scale + 'px system-ui, sans-serif';
      ctx.fillText(table.label, 0, table.comment ? -7 / map.view.scale : 0);

      if (table.comment) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.font = 11 / map.view.scale + 'px system-ui, sans-serif';
        ctx.fillText(table.comment, 0, 8 / map.view.scale);
      }

      if (state.openItemCount) {
        ctx.fillStyle = colors.stroke;
        ctx.font = '600 ' + 10 / map.view.scale + 'px system-ui, sans-serif';
        ctx.fillText(state.openItemCount + ' tétel', 0, half.h - 10 / map.view.scale);
      }

      ctx.restore();
    }

    /** Ora ikon: lefoglalt asztal jelzese. */
    function drawClock(x, y, isActive) {
      ctx.save();
      ctx.translate(x, y);

      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#f2b544' : '#0e0e10';
      ctx.fill();
      ctx.strokeStyle = '#f2b544';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.strokeStyle = isActive ? '#1a1200' : '#f2b544';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -5.5);
      ctx.moveTo(0, 0);
      ctx.lineTo(4, 1.5);
      ctx.stroke();

      ctx.restore();
    }

    /* ---------------------------------------------------------- talalatok */

    /** Melyik asztal / ikon van a kepernyo adott pontja alatt. */
    function hitTest(screenX, screenY) {
      for (var i = 0; i < map.iconHits.length; i += 1) {
        var icon = map.iconHits[i];
        var dx = screenX - icon.x;
        var dy = screenY - icon.y;
        if (dx * dx + dy * dy <= icon.radius * icon.radius) {
          return { type: 'online', online: map.online };
        }
      }

      var point = toWorld(screenX, screenY);

      // Hatulrol elore: a kesobb rajzolt (felul levo) asztal nyer.
      for (var j = map.tables.length - 1; j >= 0; j -= 1) {
        var table = map.tables[j];
        var centerX = table.posX + table.width / 2;
        var centerY = table.posY + table.height / 2;

        // A pontot visszaforgatjuk az asztal sajat rendszerebe.
        var rad = (-table.rotation * Math.PI) / 180;
        var localX = (point.x - centerX) * Math.cos(rad) - (point.y - centerY) * Math.sin(rad);
        var localY = (point.x - centerX) * Math.sin(rad) + (point.y - centerY) * Math.cos(rad);

        if (Math.abs(localX) <= table.width / 2 && Math.abs(localY) <= table.height / 2) {
          return { type: 'table', table: table, state: map.states[table.id] || null };
        }
      }

      return null;
    }

    /* ------------------------------------------------------------ adatok */

    function setLayout(layout) {
      map.tables = layout.tables || [];
      map.zones = layout.zones || [];
      draw();
    }

    function setStates(payload) {
      var byId = {};
      (payload.states || []).forEach(function (state) {
        byId[state.tableId] = state;
      });
      map.states = byId;
      map.online = payload.online || { activeCount: 0, orders: [] };
      draw();
    }

    function select(tableId) {
      map.selectedTableId = tableId || null;
      draw();
    }

    return {
      canvas: canvas,
      state: map,
      resize: resize,
      draw: draw,
      fit: fit,
      zoomAt: zoomAt,
      pan: pan,
      toWorld: toWorld,
      toScreen: toScreen,
      hitTest: hitTest,
      setLayout: setLayout,
      setStates: setStates,
      select: select,
      getScale: function () { return map.view.scale; },
      MIN_SCALE: MIN_SCALE,
      MAX_SCALE: MAX_SCALE
    };
  }

  window.FloorMap = { create: createFloorMap, COLORS: COLORS };
})(window);
