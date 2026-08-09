/*
 * Pinceri rendeles-attekinto: elo statuszkovetes es kiszolgalas.
 *
 * Az asztalterkeprol vagy a rendelesfelvetelbol nyilik, es egy asztal (vagy
 * online rendeles) minden eddig leadott tetelet mutatja allapot szerint
 * csoportositva: elkeszult -> keszul -> leadva -> kiszolgalva. Az elkeszult
 * tetelek jelolhetok kiszolgaltnak, egyesevel vagy egyszerre.
 *
 * Az allapotokat a szerver adja (order_item.status), a felulet csak megjeleniti:
 * "keszul" / "elkeszult" allapotot a pincer nem allithat, azt a konyha teszi.
 * A frissites socket esemenyre tortenik, ujratoltes nelkul.
 */
(function (window, document) {
  'use strict';

  /** Megjelenitesi sorrend: ami tenni valot ad, az van elol. */
  var GROUPS = [
    { status: 'ready', title: 'Elkészült', note: 'Kivihető az asztalhoz' },
    { status: 'preparing', title: 'Készül', note: 'A konyha dolgozik rajta' },
    { status: 'pending', title: 'Leadva', note: 'Sorban áll a konyhán' },
    { status: 'served', title: 'Kiszolgálva', note: 'Lezárt tétel' }
  ];

  var STATUS_LABEL = {
    pending: 'leadva',
    preparing: 'készül',
    ready: 'elkészült',
    served: 'kiszolgálva'
  };

  /*
   * Allapotikonok vektorosan (nem emojival): igy minden keszuleken azonosan
   * neznek ki, es a szinuket a CSS-bol oroklik (currentColor).
   */
  var ICONS = {
    pending: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    preparing:
      '<path d="M7.5 16.5h9V21h-9z"/>' +
      '<path d="M8 16.5a4.4 4.4 0 1 1-.7-8.7 4 4 0 0 1 4.7-3.6 4 4 0 0 1 4.7 3.6 4.4 4.4 0 1 1-.7 8.7"/>',
    ready:
      '<path d="M18.5 16.5h-13L7 14.2V10a5 5 0 0 1 10 0v4.2z"/>' +
      '<path d="M10.2 19.2a2 2 0 0 0 3.6 0"/>',
    served: '<path d="M5 12.6l4.6 4.4L19 7.4"/>'
  };

  var FLASH_MS = 2400;

  /** Fizetesi modok a kozos konstansokbol. */
  var PAYMENT_METHODS = window.APP_CONSTANTS.PAYMENT_METHODS;

  var state = {
    context: null,
    order: null,
    /** A rendeles fizetesi allapota (GET /api/orders/:id/payments). */
    payment: null,
    paymentDraft: { method: null, amount: 0 },
    /** itemId -> allapot az elozo megjelenitesbol (a felvillanashoz). */
    previousStatuses: {},
    /** itemId -> mikor lett elkeszult (a kiemeles idejere). */
    flashedAt: {},
    busy: false
  };

  var deps = {
    api: null,
    toast: null,
    onChanged: null,
    onTakeOrder: null,
    onReadyItems: null
  };

  function el(selector) {
    return document.querySelector(selector);
  }

  function money(value) {
    return new Intl.NumberFormat('hu-HU').format(Math.round(value || 0)) + ' Ft';
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }

  function statusIcon(status) {
    var span = document.createElement('span');
    span.className = 'status-icon status-icon--' + status;
    // Konstans jelolo, nem felhasznaloi adat.
    span.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[status] || '') +
      '</svg>';
    return span;
  }

  /* ------------------------------------------------------------ rajzolas */

  function renderHead() {
    var order = state.order;
    var context = state.context;

    el('[data-status-title]').textContent =
      (context && context.type === 'table' ? context.label : 'Online rendelés') + ' – áttekintés';

    var serveAll = el('[data-status-serve-all]');
    var print = el('[data-status-print]');
    var pay = el('[data-status-pay]');

    if (!order) {
      el('[data-status-meta]').textContent = 'Ehhez az asztalhoz nincs nyitott rendelés.';
      serveAll.hidden = true;
      print.disabled = true;
      pay.hidden = true;
      el('[data-payment-badge]').hidden = true;
      return;
    }
    pay.hidden = false;

    var parts = [];
    // A blokkon is ez az azonosito jelenik meg - igy a pincer papir nelkul is
    // ossze tudja parositani a rendelest.
    if (order.receiptNumber) parts.push('#' + order.receiptNumber);
    parts.push(
      'Felvette: ' + (order.waiterName || 'ismeretlen'),
      formatTime(order.createdAt),
      order.itemCount + ' tétel',
      money(order.total)
    );
    if (order.readyCount) parts.push(order.readyCount + ' elkészült');
    el('[data-status-meta]').textContent = parts.join(' · ');

    serveAll.hidden = order.readyCount === 0;
    serveAll.textContent = 'Mindet kiszolgáltam (' + order.readyCount + ')';
    serveAll.disabled = state.busy;

    // A blokk nyomtatasa csak akkor ertelmes, ha minden tetel kiment.
    // Az allItemsServed-et a szerver szamolja, nem a lista alapjan talaljuk ki.
    print.disabled = !order.allItemsServed;
    print.title = order.allItemsServed
      ? 'A rendelés minden tétele kiszolgálva.'
      : 'Amíg van ki nem szolgált tétel, a blokk nem nyomtatható.';

    renderPaymentBadge();
  }

  /* ------------------------------------------------------------ fizetes */

  function isPaid() {
    return Boolean(state.payment && state.payment.paymentStatus === 'paid');
  }

  function methodLabel(key) {
    var found = PAYMENT_METHODS.filter(function (m) { return m.key === key; })[0];
    return found ? found.label : key;
  }

  /** Fizetettsegi jelveny a fejlecben - futolagos pillantasra is lathato. */
  function renderPaymentBadge() {
    var badge = el('[data-payment-badge]');
    var payment = state.payment;
    var pay = el('[data-status-pay]');

    if (!payment) {
      badge.hidden = true;
      return;
    }

    badge.hidden = false;
    badge.className = 'pay-badge pay-badge--' + payment.paymentStatus;

    if (payment.paymentStatus === 'paid') {
      var methods = payment.payments.map(function (p) { return methodLabel(p.method); });
      badge.textContent = 'Kifizetve · ' + money(payment.paidAmount) +
        (methods.length ? ' · ' + methods.join(', ') : '');
      pay.hidden = true;
    } else {
      badge.textContent = payment.paidAmount
        ? 'Hátralék: ' + money(payment.dueAmount) + ' (befizetve ' + money(payment.paidAmount) + ')'
        : 'Fizetésre vár · ' + money(payment.total);
      pay.hidden = false;
    }
  }

  function renderPaymentMethods() {
    var list = el('[data-payment-methods]');
    list.innerHTML = '';

    PAYMENT_METHODS.forEach(function (method) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pay-method' +
        (state.paymentDraft.method === method.key ? ' is-selected' : '');
      button.dataset.payMethod = method.key;

      var label = document.createElement('span');
      label.className = 'pay-method__label';
      label.textContent = method.label;

      var note = document.createElement('span');
      note.className = 'pay-method__note';
      note.textContent = method.note;

      button.appendChild(label);
      button.appendChild(note);
      button.addEventListener('click', function () {
        state.paymentDraft.method = method.key;
        renderPaymentMethods();
        el('[data-payment-confirm]').disabled = false;
      });

      list.appendChild(button);
    });
  }

  function openPaymentDialog() {
    if (!state.order || !state.payment) return;

    state.paymentDraft = { method: null, amount: state.payment.dueAmount };
    el('[data-payment-note]').textContent =
      (state.order.tableLabel || 'Online rendelés') + ' · fizetendő: ' +
      money(state.payment.dueAmount) +
      (state.payment.paidAmount ? ' (eddig befizetve: ' + money(state.payment.paidAmount) + ')' : '');
    el('[data-payment-amount]').value = state.payment.dueAmount;
    el('[data-payment-confirm]').disabled = true;

    renderPaymentMethods();
    el('[data-print-warning]').hidden = true;
    el('[data-payment-dialog]').hidden = false;
  }

  function submitPayment() {
    if (!state.order || !state.paymentDraft.method) return;

    var button = el('[data-payment-confirm]');
    var amount = Number(el('[data-payment-amount]').value);
    button.disabled = true;

    deps
      .api('/api/orders/' + state.order.id + '/payments', {
        method: 'POST',
        body: { method: state.paymentDraft.method, amount: amount > 0 ? amount : undefined }
      })
      .then(function (result) {
        el('[data-payment-dialog]').hidden = true;
        deps.toast(
          methodLabel(result.payment.method) + ' · ' + money(result.payment.amount) + ' rögzítve.'
        );
        if (typeof deps.onChanged === 'function') deps.onChanged(state.order);
        return load();
      })
      .catch(function (err) {
        deps.toast(err.message || 'A fizetés rögzítése nem sikerült.', true);
      })
      .finally(function () {
        button.disabled = !state.paymentDraft.method;
      });
  }

  function renderRow(item) {
    var row = document.createElement('li');
    row.className = 'status-row status-row--' + item.status;
    row.dataset.itemId = item.id;
    row.dataset.itemStatus = item.status;

    if (state.flashedAt[item.id] && Date.now() - state.flashedAt[item.id] < FLASH_MS) {
      row.classList.add('is-flash');
    }

    row.appendChild(statusIcon(item.status));

    var main = document.createElement('div');
    main.className = 'status-row__main';

    var name = document.createElement('div');
    name.className = 'status-row__name';
    name.textContent = item.quantity + '× ' + item.name;
    main.appendChild(name);

    if (item.extras.length) {
      var extras = document.createElement('div');
      extras.className = 'status-row__extras';
      extras.textContent = item.extras
        .map(function (extra) { return '+ ' + extra.name; })
        .join('  ');
      main.appendChild(extras);
    }

    if (item.comment) {
      var comment = document.createElement('div');
      comment.className = 'status-row__comment';
      comment.textContent = '„' + item.comment + '”';
      main.appendChild(comment);
    }

    // Ki adta le es mikor - kiszolgalas utan a kivitel ideje is latszik.
    var meta = document.createElement('div');
    meta.className = 'status-row__meta';
    meta.textContent =
      (item.waiterName || 'ismeretlen') + ' · ' + formatTime(item.createdAt) +
      (item.servedAt ? ' · kiszolgálva ' + formatTime(item.servedAt) : '');
    main.appendChild(meta);

    row.appendChild(main);

    var right = document.createElement('div');
    right.className = 'status-row__right';

    var badge = document.createElement('span');
    badge.className = 'status-badge status-badge--' + item.status;
    badge.textContent = STATUS_LABEL[item.status] || item.status;
    right.appendChild(badge);

    var price = document.createElement('div');
    price.className = 'status-row__price';
    price.textContent = money(item.lineTotal);
    right.appendChild(price);

    // Kiszolgalas jelolese kizarolag elkeszult tetelnel.
    if (item.status === 'ready') {
      var serve = document.createElement('button');
      serve.type = 'button';
      serve.className = 'btn btn--sm';
      serve.dataset.serveItem = item.id;
      serve.textContent = 'Kiszolgálva';
      serve.disabled = state.busy;
      serve.addEventListener('click', function () {
        serveItem(item.id);
      });
      right.appendChild(serve);
    }

    row.appendChild(right);
    return row;
  }

  function renderGroups() {
    var container = el('[data-status-groups]');
    container.innerHTML = '';

    var order = state.order;
    var items = order ? order.items : [];

    el('[data-status-empty]').hidden = items.length > 0;
    el('[data-status-total]').textContent = money(order ? order.total : 0);

    GROUPS.forEach(function (group) {
      var groupItems = items.filter(function (item) { return item.status === group.status; });
      if (!groupItems.length) return;

      var section = document.createElement('section');
      section.className = 'status-group status-group--' + group.status;
      section.dataset.statusGroup = group.status;

      var head = document.createElement('h3');
      head.className = 'status-group__title';

      var dot = document.createElement('span');
      dot.className = 'status-dot status-dot--' + group.status;
      head.appendChild(dot);

      var title = document.createElement('span');
      title.textContent = group.title + ' (' + groupItems.length + ')';
      head.appendChild(title);

      var note = document.createElement('span');
      note.className = 'status-group__note';
      note.textContent = group.note;
      head.appendChild(note);

      section.appendChild(head);

      var list = document.createElement('ul');
      list.className = 'status-list';
      groupItems.forEach(function (item) {
        list.appendChild(renderRow(item));
      });
      section.appendChild(list);

      container.appendChild(section);
    });
  }

  function render() {
    renderHead();
    renderGroups();
  }

  /* ------------------------------------------------------ allapotvaltas */

  /**
   * Az uj adat osszevetese az elozovel: melyik tetel lett most "elkeszult".
   * Ezekre kerul a rovid kiemelo animacio.
   */
  function detectNewlyReady(order) {
    var fresh = [];

    (order ? order.items : []).forEach(function (item) {
      var before = state.previousStatuses[item.id];
      if (item.status === 'ready' && before && before !== 'ready') {
        state.flashedAt[item.id] = Date.now();
        fresh.push(item);
      }
    });

    var next = {};
    (order ? order.items : []).forEach(function (item) {
      next[item.id] = item.status;
    });
    state.previousStatuses = next;

    return fresh;
  }

  function applyOrder(order) {
    var fresh = detectNewlyReady(order);
    state.order = order;
    render();

    if (fresh.length && typeof deps.onReadyItems === 'function') deps.onReadyItems(fresh);

    // A kiemelest a lejarta utan le kell venni, kulonben a kovetkezo
    // ujrarajzolasig ott maradna.
    if (fresh.length) {
      window.setTimeout(function () {
        if (isOpen()) render();
      }, FLASH_MS + 60);
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    document.querySelectorAll('[data-serve-item]').forEach(function (button) {
      button.disabled = busy;
    });
    el('[data-status-serve-all]').disabled = busy;
  }

  function serveItem(itemId) {
    if (state.busy) return;
    setBusy(true);

    deps
      .api('/api/waiter/order-items/' + itemId + '/served', { method: 'PATCH' })
      .then(function (result) {
        applyOrder(result.order);
        if (result.changed) deps.toast('Kiszolgálva.');
        if (typeof deps.onChanged === 'function') deps.onChanged(result.order);
      })
      .catch(function (err) {
        deps.toast(err.message || 'A jelölés nem sikerült.', true);
      })
      .finally(function () {
        setBusy(false);
        render();
      });
  }

  function serveAllReady() {
    if (state.busy || !state.order) return;
    setBusy(true);

    deps
      .api('/api/waiter/orders/' + state.order.id + '/serve-all-ready', { method: 'PATCH' })
      .then(function (result) {
        applyOrder(result.order);
        deps.toast(
          result.count
            ? result.count + ' tétel kiszolgálva.'
            : 'Nincs elkészült tétel, amit ki lehetne szolgálni.'
        );
        if (typeof deps.onChanged === 'function') deps.onChanged(result.order);
      })
      .catch(function (err) {
        deps.toast(err.message || 'A jelölés nem sikerült.', true);
      })
      .finally(function () {
        setBusy(false);
        render();
      });
  }

  /* ------------------------------------------------------- nyomtatas */

  /**
   * Vendegblokk nyomtatasa.
   *
   * A nyomtatasi nezet kulon lapon nyilik (`receipt-print.html`), ott tolti be
   * az adatokat, es maga inditja a bongeszo nyomtatasi parbeszedet - igy a
   * nyomtatas nem a munkakepernyot foglalja el, es a pincer a bezaras utan
   * ugyanitt folytatja.
   *
   * A gomb csak akkor aktiv, ha a szerver szerint minden tetel kiszolgalt;
   * a szerver ezt a blokk lekeresekor ujra ellenorzi.
   */
  function printReceipt() {
    var order = state.order;
    if (!order) return;

    if (!order.allItemsServed) {
      deps.toast('A blokk csak akkor nyomtatható, ha minden tétel kiszolgálásra került.', true);
      return;
    }

    // Ha meg nincs kifizetve, eloszor figyelmeztetunk - de nem tiltjuk meg:
    // eletszeru, hogy a blokk elobb keszul el, mint a fizetes.
    if (!isPaid() && !state.printWarned) {
      state.printWarned = true;
      el('[data-print-warning]').hidden = false;
      return;
    }
    state.printWarned = false;
    el('[data-print-warning]').hidden = true;

    var target = window.open('/waiter/receipt-print.html?orderId=' + encodeURIComponent(order.id), '_blank');
    if (!target) {
      deps.toast('A böngésző blokkolta a nyomtatási ablakot. Engedélyezd a felugró ablakokat.', true);
      return;
    }

    deps.toast('Blokk megnyitva nyomtatásra.');
  }

  /* -------------------------------------------------------- betoltes */

  function load() {
    var context = state.context;

    // Ha mar tudjuk, melyik rendelest mutatjuk, azt kerjuk le nev szerint - az
    // asztal vegpontja csak a **nyitott** rendelest adja vissza, a kifizetett,
    // lezart rendeles viszont tovabbra is latszodjon a nezetben (a pincer meg
    // nyomtathat vagy visszanezhet).
    var request = state.order
      ? deps.api('/api/waiter/orders/' + state.order.id)
      : (context.type === 'table'
        ? deps.api('/api/waiter/tables/' + context.tableId + '/order')
        : deps.api('/api/waiter/orders/' + context.orderId));

    return request.then(function (data) {
      applyOrder(data.order || null);

      if (!data.order) {
        state.payment = null;
        renderPaymentBadge();
        return null;
      }

      // A fizetesi allapotot kulon kerjuk le: ez adja a vegosszeget AFA-val es
      // szervizdijjal egyutt, amit fizetni kell.
      return deps
        .api('/api/orders/' + data.order.id + '/payments')
        .then(function (payment) {
          state.payment = payment;
          renderHead();
          return data.order;
        })
        .catch(function () {
          state.payment = null;
          return data.order;
        });
    });
  }

  /**
   * Attekinto megnyitasa.
   * @param {{ type: 'table'|'order', tableId?: string, orderId?: string, label?: string }} context
   */
  function open(context) {
    state.context = context;
    state.order = null;
    state.payment = null;
    state.printWarned = false;
    state.previousStatuses = {};
    state.flashedAt = {};
    el('[data-print-warning]').hidden = true;

    el('[data-status-title]').textContent =
      (context.type === 'table' ? context.label : 'Online rendelés') + ' – áttekintés';
    el('[data-status-meta]').textContent = 'Betöltés…';
    el('[data-status-groups]').innerHTML = '';
    el('[data-status-view]').hidden = false;

    return load().catch(function (err) {
      deps.toast(err.message, true);
      el('[data-status-meta]').textContent = 'A rendelés betöltése nem sikerült.';
    });
  }

  function close() {
    el('[data-status-view]').hidden = true;
    state.context = null;
  }

  function isOpen() {
    return !el('[data-status-view]').hidden;
  }

  /** Ujratoltes socket esemenyre (konyhai allapotvaltas, masik pincer). */
  function refresh() {
    if (!isOpen() || !state.context) return Promise.resolve();
    return load().catch(function () {});
  }

  function getContext() {
    return state.context;
  }

  function setup(options) {
    deps.api = options.api;
    deps.toast = options.toast;
    deps.onChanged = options.onChanged;
    deps.onTakeOrder = options.onTakeOrder;
    deps.onReadyItems = options.onReadyItems;

    el('[data-status-close]').addEventListener('click', close);
    el('[data-status-serve-all]').addEventListener('click', serveAllReady);

    el('[data-status-order]').addEventListener('click', function () {
      var context = state.context;
      close();
      if (typeof deps.onTakeOrder === 'function') deps.onTakeOrder(context);
    });

    el('[data-status-print]').addEventListener('click', printReceipt);

    el('[data-status-pay]').addEventListener('click', openPaymentDialog);
    el('[data-warning-pay]').addEventListener('click', function () {
      el('[data-print-warning]').hidden = true;
      openPaymentDialog();
    });
    el('[data-print-anyway]').addEventListener('click', function () {
      el('[data-print-warning]').hidden = true;
      printReceipt();
    });
    el('[data-warning-close]').addEventListener('click', function () {
      el('[data-print-warning]').hidden = true;
      state.printWarned = false;
    });

    el('[data-payment-confirm]').addEventListener('click', submitPayment);
    el('[data-payment-cancel]').addEventListener('click', function () {
      el('[data-payment-dialog]').hidden = true;
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!el('[data-payment-dialog]').hidden) el('[data-payment-dialog]').hidden = true;
      else if (isOpen()) close();
    });
  }

  window.AndOrderOrderStatus = {
    setup: setup,
    open: open,
    close: close,
    isOpen: isOpen,
    refresh: refresh,
    getContext: getContext,
    state: state
  };
})(window, document);
