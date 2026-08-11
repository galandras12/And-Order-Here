/*
 * Logisztika - B) blokk-archivum ("Blokk-archivum" ful).
 *
 * Szurheto, lapozhato rendeleslista (`GET /api/logistics/orders`), es egy sorra
 * kattintva a rendeles reszletes nezete (`GET /api/logistics/orders/:id`).
 *
 * A reszletes nezet a 10. szegmens nyomtatasi sablonjanak **olvashato**
 * valtozata: ugyanaz az adat, ugyanaz a felepites (fejlec - tetelek - osszesites
 * - lablec), de kepernyore szanva, nyomtatas nelkul. A blokkot a szerver
 * ugyanazzal a `receiptService` logikaval allitja ossze, mint amit a pincer
 * kinyomtat - igy egy utolagos ellenorzeskor biztosan ugyanaz jon ki.
 */
(function (window, document) {
  'use strict';

  var app = window.LogisticsApp;

  var COLUMNS = 7;

  var state = {
    page: 1,
    pageCount: 1,
    optionsLoaded: false
  };

  function el(selector) {
    return document.querySelector(selector);
  }

  function form() {
    return el('[data-orders-filter]');
  }

  /* ------------------------------------------------------------- szurok */

  /** A szuro legordulok feltoltese (asztalok, pincerek, fizetesi modok). */
  function loadOptions() {
    if (state.optionsLoaded) return Promise.resolve();

    return app.api('/api/logistics/filter-options').then(function (options) {
      fill('[data-filter-tables]', options.tables.map(function (table) {
        return { value: table.id, label: table.label };
      }));
      fill('[data-filter-waiters]', options.waiters.map(function (waiter) {
        return { value: waiter.id, label: waiter.name };
      }));
      fill('[data-filter-methods]', options.paymentMethods.map(function (method) {
        return { value: method.key, label: method.label };
      }));
      state.optionsLoaded = true;
    });
  }

  function fill(selector, items) {
    var select = el(selector);
    if (!select) return;

    // Az elso ("Mind") opcio marad, a tobbit ujraepitjuk.
    while (select.options.length > 1) select.remove(1);

    items.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });
  }

  /* ---------------------------------------------------------- lista */

  /** Asztal jelolese, vagy online rendelesnel a vendeg neve. */
  function whoCell(order) {
    var td = document.createElement('td');

    if (order.type === 'online') {
      td.appendChild(app.badge('Online', 'online'));
      var guest = document.createElement('span');
      guest.className = 'cell-sub';
      guest.textContent = order.guestName || 'névtelen vendég';
      td.appendChild(guest);
      return td;
    }

    td.textContent = order.tableLabel || '—';
    return td;
  }

  function methodsCell(order) {
    var td = document.createElement('td');

    if (!order.paymentMethods.length) {
      td.textContent = '—';
      return td;
    }

    order.paymentMethods.forEach(function (method) {
      var tag = document.createElement('span');
      tag.className = 'tag';
      // Reszfizetesnel az osszeg is latszik, kulonben csak a mod neve.
      tag.textContent = order.paymentMethods.length > 1
        ? method.label + ' (' + app.money(method.amount) + ')'
        : method.label;
      td.appendChild(tag);
    });

    return td;
  }

  function statusCell(order) {
    var td = document.createElement('td');

    if (order.paymentStatus === 'paid') {
      td.appendChild(app.badge('Fizetve', 'paid'));
    } else {
      td.appendChild(app.badge('Nincs fizetve', 'unpaid'));
      if (order.paidAmount > 0) {
        var partial = document.createElement('span');
        partial.className = 'cell-sub';
        partial.textContent = 'hátralék: ' + app.money(order.dueAmount);
        td.appendChild(partial);
      }
    }

    if (order.status === 'cancelled') td.appendChild(app.badge('Sztornó', 'cancelled'));

    return td;
  }

  function renderRows(data) {
    var body = el('[data-orders-body]');

    if (!data.orders.length) {
      app.messageRow(body, COLUMNS, 'Ebben az időszakban nincs a szűrésnek megfelelő rendelés.');
      return;
    }

    body.innerHTML = '';

    data.orders.forEach(function (order) {
      var row = document.createElement('tr');
      row.className = 'is-clickable';
      row.tabIndex = 0;
      row.dataset.orderId = order.id;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', 'Rendelés részletei: ' + (order.receiptNumber || order.id));

      // A cimkek a mobil kartyas nezetben a fejlec helyett jelennek meg.
      row.appendChild(app.cell(order.receiptNumber || order.id, 'col-id', 'Azonosító'));
      row.appendChild(app.cell(app.dateTime(order.createdAt), 'col-time', 'Dátum / idő'));
      row.appendChild(app.labelled(whoCell(order), 'Asztal / vendég'));
      row.appendChild(app.cell(order.waiterName, 'col-waiter', 'Pincér'));
      row.appendChild(app.cell(app.money(order.total), 'col-num col-strong', 'Végösszeg'));
      row.appendChild(app.labelled(methodsCell(order), 'Fizetési mód'));
      row.appendChild(app.labelled(statusCell(order), 'Állapot'));

      body.appendChild(row);
    });
  }

  function renderPager(data) {
    var pager = el('[data-orders-pager]');
    pager.hidden = data.pageCount <= 1;

    el('[data-page-label]').textContent =
      data.page + ' / ' + data.pageCount + ' oldal · ' + data.totalCount + ' rendelés';
    el('[data-page-prev]').disabled = data.page <= 1;
    el('[data-page-next]').disabled = data.page >= data.pageCount;
  }

  function load() {
    var values = app.values(form());

    return loadOptions()
      .then(function () {
        return app.api('/api/logistics/orders' + app.query({
          dateFrom: values.dateFrom,
          dateTo: values.dateTo,
          type: values.type,
          tableId: values.tableId,
          waiterId: values.waiterId,
          paymentMethod: values.paymentMethod,
          paymentStatus: values.paymentStatus,
          page: state.page,
          limit: values.limit
        }));
      })
      .then(function (data) {
        app.clearErrors(form());
        form().querySelector('[name="dateFrom"]').value = data.range.dateFrom;
        form().querySelector('[name="dateTo"]').value = data.range.dateTo;

        state.page = data.page;
        state.pageCount = data.pageCount;

        el('[data-orders-caption]').textContent =
          app.rangeLabel(data.range) + ' · ' + data.totalCount + ' rendelés';

        renderRows(data);
        renderPager(data);
        return data;
      })
      .catch(function (err) {
        if (err.data && err.data.fields) app.showErrors(form(), err.data.fields);
        app.messageRow(el('[data-orders-body]'), COLUMNS, err.message);
        el('[data-orders-pager]').hidden = true;
        throw err;
      });
  }

  /* ------------------------------------------------- reszletes nezet */

  function line(label, value, variant) {
    var row = document.createElement('p');
    row.className = 'receipt-view__row' + (variant ? ' receipt-view__row--' + variant : '');

    var left = document.createElement('span');
    left.textContent = label;
    var right = document.createElement('span');
    right.textContent = value;

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function renderReceipt(detail) {
    var box = el('[data-drawer-body]');
    box.innerHTML = '';

    var receipt = detail.receipt;
    var view = document.createElement('div');
    view.className = 'receipt-view';
    view.setAttribute('data-receipt-view', '');

    // --- fejlec: etterem adatai ---
    var head = document.createElement('header');
    head.className = 'receipt-view__head';
    var name = document.createElement('p');
    name.className = 'receipt-view__name';
    name.textContent = receipt.restaurant.name;
    head.appendChild(name);
    [receipt.restaurant.address, receipt.restaurant.phone].forEach(function (text) {
      if (!text) return;
      var row = document.createElement('p');
      row.className = 'receipt-view__line';
      row.textContent = text;
      head.appendChild(row);
    });
    view.appendChild(head);

    // --- rendeles azonosito adatai ---
    var meta = document.createElement('div');
    meta.className = 'receipt-view__block';
    meta.appendChild(line('Rendelés', receipt.order.receiptNumber || receipt.order.id));
    meta.appendChild(line('Felvéve', app.dateTime(receipt.order.createdAt)));
    if (receipt.order.tableLabel) meta.appendChild(line('Asztal', receipt.order.tableLabel));
    if (detail.order.guestName) meta.appendChild(line('Vendég', detail.order.guestName));
    if (receipt.order.waiterName) meta.appendChild(line('Kiszolgálta', receipt.order.waiterName));
    view.appendChild(meta);

    // --- tetelek extrakkal ---
    var items = document.createElement('div');
    items.className = 'receipt-view__block';

    receipt.items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'receipt-view__item';
      row.appendChild(line(item.quantity + '× ' + item.name, app.money(item.lineTotal)));

      var unit = document.createElement('p');
      unit.className = 'receipt-view__unit';
      unit.textContent = app.money(item.unitPrice) + ' / adag';
      row.appendChild(unit);

      item.extras.forEach(function (extra) {
        row.appendChild(line('+ ' + extra.name, app.money(extra.lineTotal), 'extra'));
      });

      items.appendChild(row);
    });

    if (!receipt.items.length) {
      var empty = document.createElement('p');
      empty.className = 'receipt-view__line';
      empty.textContent = 'A rendeléshez nem tartozik tétel.';
      items.appendChild(empty);
    }
    view.appendChild(items);

    // --- osszesites ---
    var totals = document.createElement('div');
    totals.className = 'receipt-view__block';
    totals.appendChild(line('Részösszeg', app.money(receipt.totals.subtotal)));
    if (receipt.totals.vatAmount) {
      totals.appendChild(line('ÁFA (' + receipt.totals.vatRate + '%)', app.money(receipt.totals.vatAmount)));
    }
    if (receipt.totals.serviceFeeAmount) {
      totals.appendChild(line(
        'Szervizdíj (' + receipt.totals.serviceFeeRate + '%)',
        app.money(receipt.totals.serviceFeeAmount)
      ));
    }
    totals.appendChild(line('Fizetendő', app.money(receipt.totals.total), 'total'));
    view.appendChild(totals);

    // --- rogzitett fizetesek (12. szegmens) ---
    var payments = document.createElement('div');
    payments.className = 'receipt-view__block';
    var paymentsTitle = document.createElement('p');
    paymentsTitle.className = 'receipt-view__subtitle';
    paymentsTitle.textContent = 'Rögzített fizetések';
    payments.appendChild(paymentsTitle);

    if (detail.payments.length) {
      detail.payments.forEach(function (payment) {
        payments.appendChild(line(
          payment.label + ' · ' + app.dateTime(payment.paidAt),
          app.money(payment.amount)
        ));
      });
      if (detail.order.dueAmount > 0) {
        payments.appendChild(line('Hátralék', app.money(detail.order.dueAmount), 'due'));
      }
    } else {
      var noPayment = document.createElement('p');
      noPayment.className = 'receipt-view__line';
      noPayment.textContent = 'Ehhez a rendeléshez még nincs rögzített fizetés.';
      payments.appendChild(noPayment);
    }
    view.appendChild(payments);

    // --- lablec ---
    var foot = document.createElement('footer');
    foot.className = 'receipt-view__foot';
    if (receipt.restaurant.apCode) {
      var ap = document.createElement('p');
      ap.className = 'receipt-view__line';
      ap.textContent = 'AP kód: ' + receipt.restaurant.apCode;
      foot.appendChild(ap);
    }
    var message = document.createElement('p');
    message.className = 'receipt-view__line';
    message.textContent = receipt.restaurant.receiptFooterMessage;
    foot.appendChild(message);
    view.appendChild(foot);

    box.appendChild(view);
  }

  function openDetail(orderId) {
    var drawer = el('[data-order-drawer]');
    drawer.hidden = false;
    el('[data-drawer-title]').textContent = 'Rendelés betöltése…';
    el('[data-drawer-body]').innerHTML = '<p class="card__note">Betöltés…</p>';

    app
      .api('/api/logistics/orders/' + encodeURIComponent(orderId))
      .then(function (detail) {
        el('[data-drawer-title]').textContent =
          'Blokk #' + (detail.order.receiptNumber || detail.order.id);
        renderReceipt(detail);
      })
      .catch(function (err) {
        el('[data-drawer-title]').textContent = 'Nem sikerült betölteni';
        el('[data-drawer-body]').innerHTML = '';
        var box = document.createElement('p');
        box.className = 'alert';
        box.textContent = err.message;
        el('[data-drawer-body]').appendChild(box);
      });
  }

  function closeDetail() {
    el('[data-order-drawer]').hidden = true;
  }

  /* ---------------------------------------------------------- indulas */

  app.register('orders', {
    init: function () {
      var box = form();

      box.addEventListener('submit', function (event) {
        event.preventDefault();
        // Uj szuresnel mindig az elso oldalrol indulunk.
        state.page = 1;
        load();
      });

      el('[data-orders-reset]').addEventListener('click', function () {
        box.reset();
        box.querySelector('[name="dateFrom"]').value = '';
        box.querySelector('[name="dateTo"]').value = '';
        state.page = 1;
        load();
      });

      el('[data-page-prev]').addEventListener('click', function () {
        if (state.page <= 1) return;
        state.page -= 1;
        load();
      });

      el('[data-page-next]').addEventListener('click', function () {
        if (state.page >= state.pageCount) return;
        state.page += 1;
        load();
      });

      // Sorra kattintva (vagy Enterrel) nyilik a reszletes nezet.
      el('[data-orders-body]').addEventListener('click', function (event) {
        var row = event.target.closest('[data-order-id]');
        if (row) openDetail(row.dataset.orderId);
      });

      el('[data-orders-body]').addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var row = event.target.closest('[data-order-id]');
        if (!row) return;
        event.preventDefault();
        openDetail(row.dataset.orderId);
      });

      document.querySelectorAll('[data-drawer-close]').forEach(function (button) {
        button.addEventListener('click', closeDetail);
      });

      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeDetail();
      });
    },
    load: load
  });
})(window, document);
