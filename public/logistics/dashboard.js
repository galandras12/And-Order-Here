/*
 * Logisztika - A) forgalmi osszesito ("Attekintes" ful).
 *
 * Egyetlen keresbol dolgozik (`GET /api/logistics/summary`): osszesito kartyak
 * es a fizetesi mod szerinti bontas. A datumtartomany-valaszto a szerverre
 * kuldi a szurest, a kliens nem szamol ujra semmit - igy a kepernyon lathato
 * szam es a szerver szama sosem terhet el.
 */
(function (window, document) {
  'use strict';

  var app = window.LogisticsApp;

  function el(selector) {
    return document.querySelector(selector);
  }

  function form() {
    return el('[data-summary-range]');
  }

  /* ---------------------------------------------------------- rajzolas */

  function renderCards(summary) {
    el('[data-stat-revenue]').textContent = app.money(summary.revenue.total);
    el('[data-stat-revenue-note]').textContent =
      summary.revenue.paymentCount + ' rögzített fizetés · '
      + summary.revenue.settledOrderCount + ' lezárt rendelés';

    el('[data-stat-orders]').textContent = summary.orderCounts.total;
    el('[data-stat-orders-note]').textContent = summary.orderCounts.cancelled
      ? summary.orderCounts.cancelled + ' sztornózott rendelés nincs beleszámolva'
      : 'az időszakban felvett rendelés';

    el('[data-stat-dinein]').textContent = summary.orderCounts.dineIn;
    el('[data-stat-online]').textContent = summary.orderCounts.online;

    el('[data-stat-unpaid]').textContent = app.money(summary.unpaid.amount);
    el('[data-stat-unpaid-note]').textContent = summary.unpaid.count
      ? summary.unpaid.count + ' rendelés vár fizetésre'
      : 'minden rendelés rendezve';
    // A figyelmeztetes csak akkor kiabal, ha tenyleg van behajtani valo.
    el('[data-stat-unpaid-card]').classList.toggle('is-alert', summary.unpaid.count > 0);
  }

  function renderMethods(summary) {
    var body = el('[data-method-body]');
    body.innerHTML = '';

    var total = summary.revenue.total;
    var count = 0;

    summary.byMethod.forEach(function (method) {
      count += method.count;

      var row = document.createElement('tr');
      if (!method.amount) row.className = 'is-empty';

      row.appendChild(app.cell(method.label));
      row.appendChild(app.cell(app.money(method.amount), 'col-num'));
      row.appendChild(app.cell(method.count, 'col-num'));

      var share = total > 0 ? (method.amount / total) * 100 : 0;
      row.appendChild(app.cell(total > 0 ? share.toFixed(1) + '%' : '—', 'col-num'));

      // Egyszeru savdiagram: nem kell hozza rajzolo konyvtar, es nyomtatasban
      // vagy nagyitva is olvashato marad.
      var barCell = document.createElement('td');
      barCell.className = 'col-bar';
      var track = document.createElement('span');
      track.className = 'bar';
      var fill = document.createElement('span');
      fill.className = 'bar__fill';
      fill.style.width = Math.max(0, Math.min(100, share)) + '%';
      track.appendChild(fill);
      barCell.appendChild(track);
      row.appendChild(barCell);

      body.appendChild(row);
    });

    el('[data-method-total]').textContent = app.money(total);
    el('[data-method-count]').textContent = count;
  }

  function render(summary) {
    el('[data-summary-caption]').textContent =
      app.rangeLabel(summary.range)
      + ' — a bevétel a fizetés rögzítésének, a rendelésszám a rendelés felvételének időpontja szerint.';

    renderCards(summary);
    renderMethods(summary);
  }

  /* ------------------------------------------------------------ toltes */

  function load() {
    var values = app.values(form());

    return app
      .api('/api/logistics/summary' + app.query({
        dateFrom: values.dateFrom,
        dateTo: values.dateTo
      }))
      .then(function (summary) {
        app.clearErrors(form());
        // Ha a mezok uresek voltak, a szerver alapertelmezese (mai nap) kerul
        // beleuk - igy a kovetkezo szures mar a lathato idoszakbol indul.
        form().querySelector('[name="dateFrom"]').value = summary.range.dateFrom;
        form().querySelector('[name="dateTo"]').value = summary.range.dateTo;
        render(summary);
        return summary;
      })
      .catch(function (err) {
        if (err.data && err.data.fields) app.showErrors(form(), err.data.fields);
        el('[data-summary-caption]').textContent = 'Az összesítő nem tölthető be.';
        app.messageRow(el('[data-method-body]'), 5, err.message);
        // A hibat a hivo (LogisticsApp.loadPanel) mutatja meg toastban is.
        throw err;
      });
  }

  app.register('dashboard', {
    init: function () {
      var box = form();
      box.addEventListener('submit', function (event) {
        event.preventDefault();
        load();
      });
      app.bindPresets(box);
    },
    load: load
  });
})(window, document);
