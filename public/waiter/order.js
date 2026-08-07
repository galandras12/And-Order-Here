/*
 * Pinceri rendelesfelvetel.
 *
 * Az asztalterkeprol nyilik (asztal vagy online rendeles), betolti az etlapot
 * es a mar leadott teteleket, kosarba gyujti az uj teteleket, majd egyben adja
 * le oket a szervernek.
 *
 * A kosar a leadasig a bongeszoben el, es localStorage-ba is mentodik: ha a
 * halozat elszall vagy a lap ujratoltodik, a mar osszevalogatott tetelek
 * megmaradnak, es a leadas ujraprobalhato.
 */
(function (window, document) {
  'use strict';

  var CART_KEY_PREFIX = 'aoh.cart.';

  var state = {
    context: null, // { type: 'table' | 'order', tableId, orderId, label }
    menu: { categories: [], items: [], extras: [], allergens: [] },
    existingOrder: null,
    activeCategoryId: null,
    cart: [],
    editingIndex: null,
    draft: null
  };

  var deps = {
    api: null,
    toast: null,
    onSubmitted: null
  };

  function el(selector) {
    return document.querySelector(selector);
  }

  function money(value) {
    return new Intl.NumberFormat('hu-HU').format(Math.round(value || 0)) + ' Ft';
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }

  /* ------------------------------------------------------- kosar tarolas */

  function cartKey() {
    var context = state.context;
    if (!context) return null;
    return CART_KEY_PREFIX + (context.tableId || context.orderId);
  }

  function saveCart() {
    var key = cartKey();
    if (!key) return;
    try {
      if (state.cart.length) window.localStorage.setItem(key, JSON.stringify(state.cart));
      else window.localStorage.removeItem(key);
    } catch (err) {
      /* privat bongeszes: ilyenkor csak a memoriaban marad */
    }
  }

  function loadCart() {
    var key = cartKey();
    if (!key) return [];
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  /* ------------------------------------------------------------- etlap */

  function menuItemById(id) {
    return state.menu.items.filter(function (item) { return item.id === id; })[0] || null;
  }

  function extraById(id) {
    return state.menu.extras.filter(function (extra) { return extra.id === id; })[0] || null;
  }

  function allergenLabel(key) {
    var found = state.menu.allergens.filter(function (a) { return a.key === key; })[0];
    return found ? found.label : key;
  }

  function renderTabs() {
    var tabs = el('[data-menu-tabs]');
    tabs.innerHTML = '';

    state.menu.categories.forEach(function (category) {
      var count = state.menu.items.filter(function (item) {
        return item.categoryId === category.id;
      }).length;
      if (!count) return;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-tab' + (category.id === state.activeCategoryId ? ' is-active' : '');
      button.dataset.categoryId = category.id;
      button.textContent = category.name + ' (' + count + ')';
      button.addEventListener('click', function () {
        state.activeCategoryId = category.id;
        renderTabs();
        renderItems();
      });
      tabs.appendChild(button);
    });
  }

  function renderItems() {
    var grid = el('[data-menu-grid]');
    grid.innerHTML = '';

    var items = state.menu.items.filter(function (item) {
      return item.categoryId === state.activeCategoryId;
    });

    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'cart-empty';
      empty.textContent = 'Ebben a kategóriában nincs elérhető tétel.';
      grid.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'menu-card';
      card.dataset.menuItem = item.id;

      var name = document.createElement('span');
      name.className = 'menu-card__name';
      name.textContent = item.name;

      var price = document.createElement('span');
      price.className = 'menu-card__price';
      price.textContent = money(item.price);

      card.appendChild(name);
      card.appendChild(price);

      if (item.allergens && item.allergens.length) {
        var list = document.createElement('span');
        list.className = 'menu-card__allergens';
        item.allergens.forEach(function (key) {
          var tag = document.createElement('span');
          tag.className = 'allergen-tag';
          tag.textContent = allergenLabel(key);
          list.appendChild(tag);
        });
        card.appendChild(list);
      }

      card.addEventListener('click', function () {
        openCustomize(item);
      });
      grid.appendChild(card);
    });
  }

  /* --------------------------------------------------- testreszabas */

  function openCustomize(item, editIndex) {
    var existing = editIndex === undefined ? null : state.cart[editIndex];

    state.editingIndex = editIndex === undefined ? null : editIndex;
    state.draft = {
      menuItemId: item.id,
      quantity: existing ? existing.quantity : 1,
      comment: existing ? existing.comment : '',
      extraIds: existing ? existing.extraIds.slice() : []
    };

    el('[data-customize-name]').textContent = item.name;
    el('[data-customize-base]').textContent = money(item.price) + ' / adag';
    el('[data-customize-comment]').value = state.draft.comment;

    renderExtras();
    renderDraftTotal();

    el('[data-customize-confirm]').textContent = existing ? 'Mentés' : 'Kosárba';
    el('[data-customize-dialog]').hidden = false;
  }

  function renderExtras() {
    var list = el('[data-extras-list]');
    list.innerHTML = '';

    if (!state.menu.extras.length) {
      el('[data-extras-field]').hidden = true;
      return;
    }
    el('[data-extras-field]').hidden = false;

    state.menu.extras.forEach(function (extra) {
      var label = document.createElement('label');
      label.className = 'extra-option';

      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = extra.id;
      input.dataset.extraOption = '';
      input.checked = state.draft.extraIds.indexOf(extra.id) !== -1;
      input.addEventListener('change', function () {
        if (input.checked) state.draft.extraIds.push(extra.id);
        else state.draft.extraIds = state.draft.extraIds.filter(function (id) { return id !== extra.id; });
        renderDraftTotal();
      });

      var name = document.createElement('span');
      name.textContent = extra.name;

      var price = document.createElement('span');
      price.className = 'extra-option__price';
      price.textContent = '+' + money(extra.price);

      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(price);
      list.appendChild(label);
    });
  }

  /** Egy kosar-tetel egysegara: alapar + a valasztott extrak felara. */
  function unitPriceOf(entry) {
    var item = menuItemById(entry.menuItemId);
    var base = item ? item.price : 0;
    return entry.extraIds.reduce(function (total, id) {
      var extra = extraById(id);
      return total + (extra ? extra.price : 0);
    }, base);
  }

  function renderDraftTotal() {
    el('[data-qty-value]').textContent = state.draft.quantity;
    el('[data-qty-minus]').disabled = state.draft.quantity <= 1;
    el('[data-customize-total]').textContent = money(unitPriceOf(state.draft) * state.draft.quantity);
  }

  function confirmCustomize() {
    state.draft.comment = el('[data-customize-comment]').value.trim();

    if (state.editingIndex === null) state.cart.push(state.draft);
    else state.cart[state.editingIndex] = state.draft;

    state.draft = null;
    state.editingIndex = null;
    el('[data-customize-dialog]').hidden = true;

    saveCart();
    renderCart();
  }

  /* --------------------------------------------------------- kosar */

  function renderCart() {
    var list = el('[data-cart-list]');
    list.innerHTML = '';

    if (!state.cart.length) {
      var empty = document.createElement('li');
      empty.className = 'cart-empty';
      empty.textContent = 'Válassz tételt az étlapról.';
      list.appendChild(empty);
    }

    state.cart.forEach(function (entry, index) {
      var item = menuItemById(entry.menuItemId);
      var row = document.createElement('li');
      row.className = 'cart-row';
      row.dataset.cartRow = String(index);

      var name = document.createElement('span');
      name.className = 'cart-row__name';
      name.textContent = entry.quantity + '× ' + (item ? item.name : '(ismeretlen)');

      var price = document.createElement('span');
      price.className = 'cart-row__price';
      price.textContent = money(unitPriceOf(entry) * entry.quantity);

      row.appendChild(name);
      row.appendChild(price);

      var details = [];
      if (entry.extraIds.length) {
        details.push(
          entry.extraIds
            .map(function (id) { var extra = extraById(id); return extra ? extra.name : id; })
            .join(', ')
        );
      }
      if (entry.comment) details.push('„' + entry.comment + '”');

      if (details.length) {
        var detail = document.createElement('span');
        detail.className = 'cart-row__detail';
        detail.textContent = details.join(' · ');
        row.appendChild(detail);
      }

      var actions = document.createElement('div');
      actions.className = 'cart-row__actions';

      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn--ghost btn--sm';
      edit.textContent = 'Szerkesztés';
      edit.addEventListener('click', function () {
        if (item) openCustomize(item, index);
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost btn--sm';
      remove.dataset.cartRemove = String(index);
      remove.textContent = 'Törlés';
      remove.addEventListener('click', function () {
        state.cart.splice(index, 1);
        saveCart();
        renderCart();
      });

      actions.appendChild(edit);
      actions.appendChild(remove);
      row.appendChild(actions);

      list.appendChild(row);
    });

    var total = state.cart.reduce(function (sum, entry) {
      return sum + unitPriceOf(entry) * entry.quantity;
    }, 0);

    el('[data-cart-total]').textContent = money(total);
    el('[data-cart-submit]').disabled = state.cart.length === 0;
  }

  /* ----------------------------------------------- mar leadott tetelek */

  function renderExistingOrder() {
    var section = el('[data-existing-section]');
    var list = el('[data-existing-list]');
    var order = state.existingOrder;

    if (!order || !order.items.length) {
      section.hidden = true;
      list.innerHTML = '';
      return;
    }

    section.hidden = false;
    list.innerHTML = '';

    order.items.forEach(function (item) {
      var row = document.createElement('li');
      row.className = 'existing-row';

      var left = document.createElement('div');
      var name = document.createElement('div');
      name.textContent = item.quantity + '× ' + item.name;

      // "Ki adta le, mikor" - minden tetelnel latszik.
      var meta = document.createElement('div');
      meta.className = 'existing-row__meta';
      meta.textContent =
        (item.waiterName ? item.waiterName : 'ismeretlen') + ' · ' + formatTime(item.createdAt) +
        (item.comment ? ' · „' + item.comment + '”' : '') +
        (item.extras.length ? ' · ' + item.extras.map(function (e) { return e.name; }).join(', ') : '');

      left.appendChild(name);
      left.appendChild(meta);

      var right = document.createElement('div');
      right.style.textAlign = 'right';

      var status = document.createElement('span');
      status.className = 'status-pill status-pill--' + item.status;
      status.textContent = {
        pending: 'leadva',
        preparing: 'készül',
        ready: 'kész',
        served: 'kiszolgálva'
      }[item.status] || item.status;

      var price = document.createElement('div');
      price.className = 'existing-row__meta';
      price.textContent = money(item.lineTotal);

      right.appendChild(status);
      right.appendChild(price);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });

    var summary = document.createElement('li');
    summary.className = 'existing-row';
    summary.innerHTML = '';
    var label = document.createElement('div');
    label.textContent = 'Eddig összesen';
    var value = document.createElement('div');
    value.style.fontWeight = '700';
    value.textContent = money(order.total);
    summary.appendChild(label);
    summary.appendChild(value);
    list.appendChild(summary);
  }

  /* ---------------------------------------------------------- leadas */

  function submit() {
    var button = el('[data-cart-submit]');
    button.disabled = true;
    button.textContent = 'Leadás…';

    var payload = {
      items: state.cart.map(function (entry) {
        return {
          menuItemId: entry.menuItemId,
          quantity: entry.quantity,
          comment: entry.comment,
          extraIds: entry.extraIds
        };
      })
    };
    if (state.context.type === 'table') payload.tableId = state.context.tableId;
    else payload.orderId = state.context.orderId;

    deps
      .api('/api/waiter/orders', { method: 'POST', body: payload })
      .then(function (result) {
        // Csak sikeres leadas utan uritjuk a kosarat.
        state.cart = [];
        saveCart();
        renderCart();

        state.existingOrder = result.order;
        renderExistingOrder();
        showDone(result);

        if (typeof deps.onSubmitted === 'function') deps.onSubmitted(result);
      })
      .catch(function (err) {
        // Halozati vagy szerver hiba: a kosar marad, ujra lehet probalni.
        deps.toast(
          (err.message || 'A leadás nem sikerült.') + ' A kosár megmaradt, próbáld újra.',
          true
        );
      })
      .finally(function () {
        button.textContent = 'Rendelés leadása';
        button.disabled = state.cart.length === 0;
      });
  }

  function showDone(result) {
    var box = el('[data-order-done]');
    el('[data-order-done-title]').textContent = result.created
      ? 'Rendelés leadva'
      : 'Tételek hozzáadva';
    el('[data-order-done-note]').textContent =
      result.addedItems.length + ' tétel · ' + (result.order.tableLabel || 'online rendelés');

    box.hidden = false;
    window.setTimeout(function () {
      box.hidden = true;
    }, 1400);
  }

  /* ---------------------------------------------------------- nyitas */

  /**
   * Rendelesfelvetel megnyitasa.
   * @param {{ type: 'table'|'order', tableId?: string, orderId?: string, label?: string }} context
   */
  function open(context) {
    state.context = context;
    state.cart = loadCart();
    state.existingOrder = null;

    el('[data-order-title]').textContent =
      context.type === 'table' ? context.label + ' – rendelésfelvétel' : 'Online rendelés';
    el('[data-order-meta]').textContent = 'Étlap betöltése…';
    el('[data-order-view]').hidden = false;

    return Promise.all([
      deps.api('/api/waiter/menu'),
      context.type === 'table'
        ? deps.api('/api/waiter/tables/' + context.tableId + '/order')
        : deps.api('/api/waiter/orders/' + context.orderId)
    ])
      .then(function (responses) {
        state.menu = responses[0];
        state.existingOrder = responses[1].order || null;

        var firstWithItems = state.menu.categories.filter(function (category) {
          return state.menu.items.some(function (item) { return item.categoryId === category.id; });
        })[0];
        state.activeCategoryId = firstWithItems ? firstWithItems.id : null;

        renderTabs();
        renderItems();
        renderCart();
        renderExistingOrder();
        renderHeaderMeta();
      })
      .catch(function (err) {
        deps.toast(err.message, true);
        el('[data-order-meta]').textContent = 'Az étlap betöltése nem sikerült.';
      });
  }

  function renderHeaderMeta() {
    var order = state.existingOrder;
    if (!order) {
      el('[data-order-meta]').textContent = 'Nincs nyitott rendelés – az első leadás új rendelést nyit.';
      return;
    }

    el('[data-order-meta]').textContent =
      'Nyitott rendelés · felvette: ' + (order.waiterName || 'ismeretlen') +
      ' · ' + formatTime(order.createdAt) +
      ' · eddig ' + order.itemCount + ' tétel, ' + money(order.total);
  }

  function close() {
    el('[data-order-view]').hidden = true;
    el('[data-customize-dialog]').hidden = true;
    state.context = null;
  }

  function isOpen() {
    return !el('[data-order-view]').hidden;
  }

  /** A most szerkesztett asztal / rendeles - az attekinto nezet ebbol nyilik. */
  function getContext() {
    return state.context;
  }

  /** A nyitott rendeles ujratoltese (socket esemenyre). */
  function refresh() {
    if (!isOpen() || !state.context) return Promise.resolve();

    var request = state.context.type === 'table'
      ? deps.api('/api/waiter/tables/' + state.context.tableId + '/order')
      : deps.api('/api/waiter/orders/' + state.context.orderId);

    return request
      .then(function (data) {
        state.existingOrder = data.order || null;
        renderExistingOrder();
        renderHeaderMeta();
      })
      .catch(function () {});
  }

  function setup(options) {
    deps.api = options.api;
    deps.toast = options.toast;
    deps.onSubmitted = options.onSubmitted;

    el('[data-order-close]').addEventListener('click', close);
    el('[data-cart-submit]').addEventListener('click', submit);

    el('[data-qty-plus]').addEventListener('click', function () {
      if (state.draft.quantity < 99) state.draft.quantity += 1;
      renderDraftTotal();
    });
    el('[data-qty-minus]').addEventListener('click', function () {
      if (state.draft.quantity > 1) state.draft.quantity -= 1;
      renderDraftTotal();
    });
    el('[data-customize-confirm]').addEventListener('click', confirmCustomize);
    el('[data-customize-cancel]').addEventListener('click', function () {
      el('[data-customize-dialog]').hidden = true;
      state.draft = null;
      state.editingIndex = null;
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!el('[data-customize-dialog]').hidden) {
        el('[data-customize-dialog]').hidden = true;
        state.draft = null;
      } else if (isOpen()) {
        close();
      }
    });
  }

  window.AndOrderOrderView = {
    setup: setup,
    open: open,
    close: close,
    isOpen: isOpen,
    refresh: refresh,
    getContext: getContext,
    state: state
  };
})(window, document);
