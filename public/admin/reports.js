/*
 * Admin - Vezetoi riportok es statisztikak (14. szegmens).
 *
 * Negy riport egy nezetben, **kozos** datumtartomany-valasztoval: mi fogy a
 * legjobban, mikor van a csucsforgalom, hogyan teljesitenek a pincerek, es
 * mennyi ido alatt keszul el egy-egy etel. A negy lekerdezes parhuzamosan
 * indul, es egyszerre frissul - a vezetonek egy datumot kell beallitania.
 *
 * ---------------------------------------------------------------------------
 * Miert natív SVG a diagram, es nem Chart.js?
 *
 *   - A projekt egyetlen kliens oldali fuggoseget sem tolt be CDN-rol (meg a
 *     Socket.io klienst is a sajat szerver adja), es nincs bundler sem. Egy
 *     diagram-konyvtar bevezetese vagy uj CDN-fuggest, vagy egy ~200 KB-os
 *     vendor fajlt jelentene a repoban - negy egyszeru abraert.
 *   - Az adatmennyiseg pici: 24 oszlop az oradiagramon, 10 sor a rangsorban.
 *     Ehhez nem kell rajzolomotor; egy `<svg>` es nehany `<rect>` eleg.
 *   - Igy a diagram az admin felulet temajat (kek-fekete, CSS valtozok)
 *     kozvetlenul orokli, es nyomtatasban / nagyitva is eles marad.
 *
 * A rangsor (A riport) nem is SVG: ott vizszintes savok jobban olvashatok
 * hosszu tetelnevekkel, azt tiszta HTML + CSS oldja meg.
 * ---------------------------------------------------------------------------
 */
(function (window, document) {
  'use strict';

  var app = window.AdminApp;

  /** Az oradiagram magassaga (px) - a savok ehhez skalazodnak. */
  var CHART_HEIGHT = 180;

  var state = {
    /** Melyik mennyiseget mutassa az oradiagram. */
    peakMetric: 'orderCount',
    /** Pincer tablazat rendezese. */
    waiterSort: { field: 'revenue', direction: 'desc' },
    /** Az utolso valaszok - ujrarendezeshez / metrika valtashoz nem kell uj keres. */
    peak: null,
    waiters: null,
    optionsLoaded: false
  };

  function el(selector) {
    return document.querySelector(selector);
  }

  function form() {
    return el('[data-reports-range]');
  }

  /* ---------------------------------------------------------- formazas */

  /**
   * Idotartam olvashato alakja.
   *
   * Egy perc alatt masodpercre valtunk: a "0 perc" ugy nezne ki, mintha nem
   * lenne adat, pedig van - csak gyors volt.
   */
  function duration(value) {
    if (value === null || value === undefined) return '—';
    if (value < 1) return Math.round(value * 60) + ' mp';
    return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(value) + ' perc';
  }

  function count(value) {
    return new Intl.NumberFormat('hu-HU').format(Number(value) || 0);
  }

  /** Mai naphoz kepest eltolt nap, input[type=date] alakban. */
  function toDateInput(date) {
    var pad = function (value) { return String(value).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function daysAgo(days) {
    var date = new Date();
    date.setDate(date.getDate() - days);
    return toDateInput(date);
  }

  function preset(name) {
    switch (name) {
      case 'today': return { dateFrom: daysAgo(0), dateTo: daysAgo(0) };
      case 'yesterday': return { dateFrom: daysAgo(1), dateTo: daysAgo(1) };
      case 'week': return { dateFrom: daysAgo(6), dateTo: daysAgo(0) };
      case 'month': return { dateFrom: daysAgo(29), dateTo: daysAgo(0) };
      default: return null;
    }
  }

  /** ÉÉÉÉ. HH. NN. alak - a szoveges osszefoglalokhoz. */
  function dateOnly(value) {
    var parts = String(value || '').slice(0, 10).split('-');
    return parts.length === 3 ? parts[0] + '. ' + parts[1] + '. ' + parts[2] + '.' : '—';
  }

  function rangeLabel(range) {
    if (!range) return '';
    return range.dateFrom === range.dateTo
      ? dateOnly(range.dateFrom)
      : dateOnly(range.dateFrom) + ' – ' + dateOnly(range.dateTo);
  }

  /** Query string a kozos datummezokbol, tovabbi parameterekkel kiegeszitve. */
  function query(extra) {
    var values = app.values(form());
    var params = { dateFrom: values.dateFrom, dateTo: values.dateTo };
    Object.keys(extra || {}).forEach(function (key) {
      params[key] = extra[key];
    });

    var parts = [];
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  /* ------------------------------------------ A) legnepszerubb tetelek */

  function renderTopItems(report) {
    var list = el('[data-top-list]');
    list.innerHTML = '';

    if (!report.items.length) {
      var empty = document.createElement('li');
      empty.className = 'rank-list__empty';
      empty.textContent = 'Ebben az időszakban nem fogyott egyetlen tétel sem.';
      list.appendChild(empty);
      return;
    }

    // A leghosszabb sav a legtobbet fogyott tetel - ehhez skalazunk.
    var max = report.items[0].quantity || 1;

    report.items.forEach(function (item, index) {
      var row = document.createElement('li');
      row.className = 'rank-list__row';
      row.dataset.menuItemId = item.menuItemId;

      var rank = document.createElement('span');
      rank.className = 'rank-list__rank';
      rank.textContent = index + 1 + '.';

      var body = document.createElement('div');
      body.className = 'rank-list__body';

      var head = document.createElement('div');
      head.className = 'rank-list__head';

      var name = document.createElement('span');
      name.className = 'rank-list__name';
      name.textContent = item.name;

      var numbers = document.createElement('span');
      numbers.className = 'rank-list__numbers';
      numbers.textContent = count(item.quantity) + ' db · ' + app.money(item.revenue);

      head.appendChild(name);
      head.appendChild(numbers);

      var track = document.createElement('span');
      track.className = 'rank-list__bar';
      var fill = document.createElement('span');
      fill.className = 'rank-list__fill';
      fill.style.width = Math.max(2, (item.quantity / max) * 100) + '%';
      track.appendChild(fill);

      var meta = document.createElement('span');
      meta.className = 'rank-list__meta';
      meta.textContent = (item.categoryName || 'nincs kategória')
        + ' · ' + app.money(item.unitPrice) + ' / adag'
        + ' · ' + count(item.orderCount) + ' rendelésben';

      body.appendChild(head);
      body.appendChild(track);
      body.appendChild(meta);

      row.appendChild(rank);
      row.appendChild(body);
      list.appendChild(row);
    });
  }

  /* ----------------------------------------- B) forgalmi csucsidoszakok */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attributes) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      node.setAttribute(key, attributes[key]);
    });
    return node;
  }

  /**
   * Oszlopdiagram a 0-23 orara.
   *
   * Mind a 24 ora megjelenik, akkor is, ha ures - igy latszik a zarva tartas,
   * es a tengely nem csuszik ossze az egyik naprol a masikra.
   */
  function renderPeakHours(report) {
    var box = el('[data-peak-chart]');
    box.innerHTML = '';

    var metric = state.peakMetric;
    var values = report.hours.map(function (hour) { return hour[metric]; });
    var max = Math.max.apply(null, values.concat([0]));

    var note = el('[data-peak-note]');
    if (report.busiestHour) {
      note.textContent = 'Csúcsidőszak: ' + report.busiestHour.label + ' — '
        + count(report.busiestHour.orderCount) + ' rendelés, '
        + app.money(report.busiestHour.revenue) + '. Óránkénti bontás a rendelés '
        + 'felvételének időpontja szerint.';
    } else {
      note.textContent = 'Ebben az időszakban nem érkezett rendelés.';
    }

    // A savokat nyujtott koordinatarendszerben rajzoljuk (a szelesseg a
    // kepernyohoz igazodik), a felirat viszont HTML-ben keszul: a
    // preserveAspectRatio="none" a szoveget is vizszintesen nyujtana.
    var chart = svgEl('svg', {
      viewBox: '0 0 240 ' + CHART_HEIGHT,
      preserveAspectRatio: 'none',
      class: 'chart__svg',
      role: 'img',
      'aria-label': 'Óránkénti forgalom'
    });

    // Vizszintes segedvonalak: negyedelve, hogy a magassag becsulheto legyen.
    [0, 0.25, 0.5, 0.75, 1].forEach(function (ratio) {
      var y = CHART_HEIGHT - ratio * CHART_HEIGHT;
      chart.appendChild(svgEl('line', {
        x1: 0, x2: 240, y1: y, y2: y, class: 'chart__grid'
      }));
    });

    report.hours.forEach(function (hour, index) {
      var value = hour[metric];
      var height = max > 0 ? (value / max) * CHART_HEIGHT : 0;
      var x = index * (240 / 24);

      var bar = svgEl('rect', {
        x: x + 1.2,
        // A nulla ertek is kapjon egy hajszalnyi jelet, hogy latszodjon a rács.
        y: CHART_HEIGHT - Math.max(height, value > 0 ? 2 : 0),
        width: 240 / 24 - 2.4,
        height: Math.max(height, value > 0 ? 2 : 0),
        class: 'chart__bar' + (report.busiestHour && report.busiestHour.hour === hour.hour
          ? ' chart__bar--peak' : '')
      });

      // Egereszes: pontos ertek a bongeszo sajat sugobuborekaban.
      var tooltip = svgEl('title', {});
      tooltip.textContent =
        hour.label + ' — ' + count(hour.orderCount) + ' rendelés, ' + app.money(hour.revenue);
      bar.appendChild(tooltip);

      chart.appendChild(bar);
    });

    box.appendChild(chart);

    // Oratengely: 24 egyenlo cella, csak minden harmadik feliratozva -
    // kulonben osszefolynak a szamok.
    var axis = document.createElement('div');
    axis.className = 'chart__axis';
    report.hours.forEach(function (hour) {
      var cell = document.createElement('span');
      cell.className = 'chart__label';
      cell.textContent = hour.hour % 3 === 0 ? String(hour.hour) : '';
      axis.appendChild(cell);
    });
    box.appendChild(axis);

    var scale = document.createElement('p');
    scale.className = 'chart__scale';
    scale.textContent = max > 0
      ? 'Legmagasabb oszlop: ' + (metric === 'revenue' ? app.money(max) : count(max) + ' rendelés')
      : 'Nincs megjeleníthető adat.';
    box.appendChild(scale);
  }

  /* ------------------------------------ C) pincerenkenti teljesitmeny */

  function sortWaiters(rows) {
    var field = state.waiterSort.field;
    var direction = state.waiterSort.direction === 'asc' ? 1 : -1;

    return rows.slice().sort(function (a, b) {
      var left = a[field];
      var right = b[field];

      // A hianyzo ertek (pl. meg egy lezart rendeles sincs) mindig hatra kerul,
      // fuggetlenul a rendezes iranyatol - kulonben elfedne a valodi adatot.
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;

      if (typeof left === 'string') return left.localeCompare(right, 'hu') * direction;
      return (left - right) * direction;
    });
  }

  function renderWaiters(report) {
    var body = el('[data-waiter-body]');

    if (!report.waiters.length) {
      app.messageRow(body, 6, 'Ebben az időszakban nem vett fel rendelést egyetlen pincér sem.');
      return;
    }

    body.innerHTML = '';

    sortWaiters(report.waiters).forEach(function (waiter) {
      var row = document.createElement('tr');
      row.dataset.waiterId = waiter.waiterId;

      row.appendChild(app.cell(waiter.name));
      row.appendChild(app.cell(count(waiter.orderCount), 'col-num'));
      row.appendChild(app.cell(count(waiter.itemCount), 'col-num'));
      row.appendChild(app.cell(app.money(waiter.revenue), 'col-num'));
      row.appendChild(app.cell(app.money(waiter.avgOrderValue), 'col-num'));

      var completion = app.cell(duration(waiter.avgCompletionMinutes), 'col-num');
      // A mintaszam nelkul az atlag felreertheto - odaírjuk, mibol jott.
      completion.title = waiter.completedCount
        ? waiter.completedCount + ' lezárt rendelésből'
        : 'Még nincs teljesen kiszolgált rendelés';
      if (!waiter.completedCount) completion.classList.add('is-muted');
      row.appendChild(completion);

      body.appendChild(row);
    });

    document.querySelectorAll('[data-waiter-head] [data-sort]').forEach(function (header) {
      var active = header.dataset.sort === state.waiterSort.field;
      header.classList.toggle('is-sorted', active);
      header.classList.toggle('is-asc', active && state.waiterSort.direction === 'asc');
    });
  }

  /* ------------------------------------- D) konyhai elkeszitesi idok */

  function renderKitchenTimes(report) {
    var body = el('[data-kitchen-body]');
    var missing = el('[data-kitchen-missing]');

    if (!report.items.length) {
      app.messageRow(
        body,
        6,
        'Ebben az időszakban nincs mérhető elkészítési idő (a konyhai jelöléshez „készül" és „elkészült" lépés is kell).'
      );
    } else {
      body.innerHTML = '';
      report.items.forEach(function (item) {
        var row = document.createElement('tr');
        row.dataset.menuItemId = item.menuItemId;
        row.appendChild(app.cell(item.name));
        row.appendChild(app.cell(item.categoryName || '—'));
        row.appendChild(app.cell(duration(item.avgMinutes), 'col-num col-strong'));
        row.appendChild(app.cell(duration(item.minMinutes), 'col-num'));
        row.appendChild(app.cell(duration(item.maxMinutes), 'col-num'));
        row.appendChild(app.cell(count(item.sampleCount), 'col-num'));
        body.appendChild(row);
      });
    }

    var note = el('[data-kitchen-note]');
    note.textContent = report.overall.sampleCount
      ? 'A „készül" és az „elkészült" jelölés között eltelt idő. Átlag az időszakban: '
        + duration(report.overall.avgMinutes) + ' (' + count(report.overall.sampleCount)
        + ' mérésből). A leglassabb tétel van elöl.'
      : 'A „készül" és az „elkészült" jelölés között eltelt idő.';

    if (report.missingSampleCount) {
      missing.hidden = false;
      missing.textContent = count(report.missingSampleCount)
        + ' eladott tételsorhoz nem tartozik mérés — vagy még készül, vagy a konyha '
        + 'egy lépésben ugrott az „elkészült" állapotra, esetleg a tétel a mérés '
        + 'bevezetése előtt készült.';
    } else {
      missing.hidden = true;
    }
  }

  /* ---------------------------------------------------------- szurok */

  function fill(selector, items) {
    var select = el(selector);
    if (!select) return;
    while (select.options.length > 1) select.remove(1);

    items.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    });
  }

  function loadOptions() {
    if (state.optionsLoaded) return Promise.resolve();

    return app.api('/api/admin/reports/filter-options').then(function (options) {
      fill('[data-top-category]', options.categories);
      fill('[data-kitchen-category]', options.categories);
      state.optionsLoaded = true;
    });
  }

  /* ------------------------------------------------------------ toltes */

  function load() {
    var topCategoryId = el('[data-top-category]').value;
    var kitchenCategoryId = el('[data-kitchen-category]').value;

    return loadOptions()
      .then(function () {
        // A negy riport fuggetlen egymastol, ezert parhuzamosan indul.
        return Promise.all([
          app.api('/api/admin/reports/top-items' + query({ categoryId: topCategoryId })),
          app.api('/api/admin/reports/peak-hours' + query()),
          app.api('/api/admin/reports/waiter-performance' + query()),
          app.api('/api/admin/reports/kitchen-times' + query({ categoryId: kitchenCategoryId }))
        ]);
      })
      .then(function (reports) {
        app.clearErrors(form());

        // Ha a mezok uresek voltak, a szerver alapertelmezese (elmult 7 nap)
        // kerul beleuk - igy a kovetkezo szures mar a lathato idoszakbol indul.
        var range = reports[0].range;
        form().querySelector('[name="dateFrom"]').value = range.dateFrom;
        form().querySelector('[name="dateTo"]').value = range.dateTo;

        el('[data-reports-caption]').textContent = rangeLabel(range)
          + ' — ' + count(reports[1].totals.orderCount) + ' rendelés, '
          + app.money(reports[1].totals.revenue) + ' bevétel. '
          + 'A sztornózott rendelések mindenhonnan kimaradnak.';

        state.peak = reports[1];
        state.waiters = reports[2];

        renderTopItems(reports[0]);
        renderPeakHours(reports[1]);
        renderWaiters(reports[2]);
        renderKitchenTimes(reports[3]);

        return reports;
      })
      .catch(function (err) {
        if (err.data && err.data.fields) app.showErrors(form(), err.data.fields);
        el('[data-reports-caption]').textContent = 'A riportok nem tölthetők be.';
        throw err;
      });
  }

  /* ---------------------------------------------------------- indulas */

  app.register('reports', {
    init: function () {
      var box = form();

      // Alapertelmezes: az elmult 7 nap (a szerver ugyanezt adja ures mezokre,
      // de igy a felhasznalo azonnal latja, mit kerdez le).
      var initial = preset('week');
      box.querySelector('[name="dateFrom"]').value = initial.dateFrom;
      box.querySelector('[name="dateTo"]').value = initial.dateTo;

      box.addEventListener('submit', function (event) {
        event.preventDefault();
        load().catch(function (err) { app.toast(err.message, true); });
      });

      box.addEventListener('click', function (event) {
        var button = event.target.closest('[data-preset]');
        if (!button) return;
        var range = preset(button.dataset.preset);
        if (!range) return;
        box.querySelector('[name="dateFrom"]').value = range.dateFrom;
        box.querySelector('[name="dateTo"]').value = range.dateTo;
        load().catch(function (err) { app.toast(err.message, true); });
      });

      // A kategoria szurok azonnal ujratoltik a sajat riportjukat.
      el('[data-top-category]').addEventListener('change', function () {
        app.api('/api/admin/reports/top-items' + query({ categoryId: this.value }))
          .then(renderTopItems)
          .catch(function (err) { app.toast(err.message, true); });
      });

      el('[data-kitchen-category]').addEventListener('change', function () {
        app.api('/api/admin/reports/kitchen-times' + query({ categoryId: this.value }))
          .then(renderKitchenTimes)
          .catch(function (err) { app.toast(err.message, true); });
      });

      // Metrika valtas az oradiagramon - nincs uj keres, a valasz mar megvan.
      el('[data-peak-metric]').addEventListener('click', function (event) {
        var button = event.target.closest('[data-metric]');
        if (!button || !state.peak) return;

        state.peakMetric = button.dataset.metric;
        this.querySelectorAll('[data-metric]').forEach(function (item) {
          item.classList.toggle('is-active', item === button);
        });
        renderPeakHours(state.peak);
      });

      // Rendezes a pincer tablazat fejlecere kattintva - szinten kliens oldalon.
      el('[data-waiter-head]').addEventListener('click', function (event) {
        var header = event.target.closest('[data-sort]');
        if (!header || !state.waiters) return;

        var field = header.dataset.sort;
        if (state.waiterSort.field === field) {
          state.waiterSort.direction = state.waiterSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          // Nev szerint novekvo a termeszetes, szamoknal a nagyobb erdekes elol.
          state.waiterSort = { field: field, direction: field === 'name' ? 'asc' : 'desc' };
        }
        renderWaiters(state.waiters);
      });
    },
    load: load
  });
})(window, document);
