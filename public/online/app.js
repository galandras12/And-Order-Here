/*
 * Online rendelés — vendégoldal.
 *
 * Bejelentkezés nélküli, publikus felület: a vendég böngészi az étlapot,
 * összeállítja a kosarát, megadja a nevét, és leadja a rendelést. A leadott
 * rendelés ugyanabba a valós idejű folyamatba kerül, mint egy asztali: a pincér
 * térképén autó ikonként, a konyhai munkapulton pedig sima blokként jelenik meg.
 *
 * A kosár a leadásig a böngészőben él (localStorage is), így egy véletlen
 * oldalfrissítés nem viszi el a válogatást.
 */
(function (window, document) {
  'use strict';

  var CART_KEY = 'aoh.online.cart';
  var THEME_KEY = 'aoh.online.theme';

  /**
   * A penztarban felajanlott fizetesi modok.
   *
   * A helyszini fizetes szandekosan egyetlen, egyertelmuen jelolt opcio azoknak,
   * akik nem akarnak vagy nem tudnak online fizetni - keszpenzkent rogzul, a
   * pincer pedig latja a modot es az osszeget a rendeles attekintojeben.
   */
  var CHECKOUT_METHODS = [
    { key: 'card', label: 'Bankkártya', note: 'Bank- vagy hitelkártya', simulated: true },
    { key: 'szep_card', label: 'SZÉP kártya', note: 'Vendéglátás zseb', simulated: true },
    { key: 'coupon', label: 'Kupon', note: 'Utalvány, kupon', simulated: true },
    {
      key: 'cash',
      label: 'Fizetés a helyszínen',
      note: 'Készpénz vagy ATM — a pultnál rendezed',
      simulated: false
    }
  ];

  var state = {
    restaurant: null,
    menu: { categories: [], items: [], allergens: [] },
    extras: [],
    activeCategoryId: null,
    cart: [],
    editingIndex: null,
    draft: null,
    order: null,
    /** A penztar adatai (GET /api/orders/:id/payments). */
    checkout: null,
    checkoutMethod: null,
    lastEvent: null,
    submitting: false
  };

  var toastTimer = null;

  function el(selector) {
    return document.querySelector(selector);
  }

  function money(value) {
    return new Intl.NumberFormat('hu-HU').format(Math.round(value || 0)) + ' Ft';
  }

  function api(path, options) {
    options = options || {};
    var init = { method: options.method || 'GET', headers: {} };
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    return window.fetch(path, init).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.ok) return data;
        var error = new Error(data.message || 'Valami félresikerült. Próbáld újra.');
        error.status = response.status;
        error.data = data;
        throw error;
      });
    });
  }

  function toast(message, isError) {
    var box = el('[data-toast]');
    box.textContent = message;
    box.className = 'toast' + (isError ? ' toast--error' : '');
    box.hidden = false;

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      box.hidden = true;
    }, isError ? 6000 : 2600);
  }

  /* ------------------------------------------------------------- tema */

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    var button = el('[data-theme-toggle]');
    button.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    el('[data-theme-label]').textContent = theme === 'light' ? 'Világos' : 'Sötét';
    el('[data-theme-icon]').textContent = theme === 'light' ? '☀️' : '🌙';

    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* privát böngészés: csak erre a munkamenetre marad meg */
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  /* ------------------------------------------------------- kosar tarolas */

  function saveCart() {
    try {
      if (state.cart.length) window.localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
      else window.localStorage.removeItem(CART_KEY);
    } catch (err) {
      /* privát böngészés: ilyenkor csak a memóriában marad */
    }
  }

  function loadCart() {
    try {
      var raw = window.localStorage.getItem(CART_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      // Csak azok a tételek maradnak, amik még szerepelnek az étlapon.
      return parsed.filter(function (entry) { return Boolean(menuItemById(entry.menuItemId)); });
    } catch (err) {
      return [];
    }
  }

  /* ------------------------------------------------------------- etlap */

  function menuItemById(id) {
    return state.menu.items.filter(function (item) { return item.id === id; })[0] || null;
  }

  function extraById(id) {
    return state.extras.filter(function (extra) { return extra.id === id; })[0] || null;
  }

  function allergenLabel(key) {
    var found = state.menu.allergens.filter(function (a) { return a.key === key; })[0];
    return found ? found.label : key;
  }

  function itemsOfCategory(categoryId) {
    return state.menu.items.filter(function (item) { return item.categoryId === categoryId; });
  }

  function renderTabs() {
    var tabs = el('[data-menu-tabs]');
    tabs.innerHTML = '';

    state.menu.categories.forEach(function (category) {
      if (!itemsOfCategory(category.id).length) return;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab' + (category.id === state.activeCategoryId ? ' is-active' : '');
      button.dataset.categoryId = category.id;
      button.textContent = category.name;
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

    var items = itemsOfCategory(state.activeCategoryId);
    el('[data-menu-empty]').hidden = state.menu.items.length > 0;

    items.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'card';
      card.dataset.menuItem = item.id;

      var name = document.createElement('span');
      name.className = 'card__name';
      name.textContent = item.name;

      var price = document.createElement('span');
      price.className = 'card__price';
      price.textContent = money(item.price);

      card.appendChild(name);
      card.appendChild(price);

      if (item.allergens && item.allergens.length) {
        var list = document.createElement('span');
        list.className = 'card__allergens';
        item.allergens.forEach(function (key) {
          var tag = document.createElement('span');
          tag.className = 'allergen-tag';
          tag.textContent = allergenLabel(key);
          list.appendChild(tag);
        });
        card.appendChild(list);
      }

      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'card__add';
      add.dataset.addItem = item.id;
      add.textContent = 'Kosárba';
      add.addEventListener('click', function () {
        openCustomize(item);
      });
      card.appendChild(add);

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
    el('[data-customize-confirm]').textContent = existing ? 'Mentés' : 'Kosárba';

    renderExtras();
    renderDraftTotal();

    el('[data-cart-sheet]').hidden = true;
    el('[data-customize-sheet]').hidden = false;
  }

  function renderExtras() {
    var list = el('[data-extras-list]');
    list.innerHTML = '';

    if (!state.extras.length) {
      el('[data-extras-field]').hidden = true;
      return;
    }
    el('[data-extras-field]').hidden = false;

    state.extras.forEach(function (extra) {
      var label = document.createElement('label');
      label.className = 'extra-option';

      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = extra.id;
      input.dataset.extraOption = '';
      input.checked = state.draft.extraIds.indexOf(extra.id) !== -1;
      input.addEventListener('change', function () {
        if (input.checked) state.draft.extraIds.push(extra.id);
        else {
          state.draft.extraIds = state.draft.extraIds.filter(function (id) { return id !== extra.id; });
        }
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

  /** Egy kosár-tétel egységára: alapár + a választott kiegészítők felára. */
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
    el('[data-customize-total]').textContent =
      money(unitPriceOf(state.draft) * state.draft.quantity);
  }

  function confirmCustomize() {
    state.draft.comment = el('[data-customize-comment]').value.trim();

    if (state.editingIndex === null) state.cart.push(state.draft);
    else state.cart[state.editingIndex] = state.draft;

    var wasEditing = state.editingIndex !== null;
    state.draft = null;
    state.editingIndex = null;

    el('[data-customize-sheet]').hidden = true;
    saveCart();
    renderCart();

    if (wasEditing) el('[data-cart-sheet]').hidden = false;
    else toast('Hozzáadva a kosárhoz.');
  }

  /* --------------------------------------------------------- kosar */

  function cartTotal() {
    return state.cart.reduce(function (sum, entry) {
      return sum + unitPriceOf(entry) * entry.quantity;
    }, 0);
  }

  function cartCount() {
    return state.cart.reduce(function (sum, entry) { return sum + entry.quantity; }, 0);
  }

  function renderCart() {
    var list = el('[data-cart-list]');
    list.innerHTML = '';

    if (!state.cart.length) {
      var empty = document.createElement('li');
      empty.className = 'cart-empty';
      empty.textContent = 'A kosarad még üres.';
      list.appendChild(empty);
    }

    state.cart.forEach(function (entry, index) {
      var item = menuItemById(entry.menuItemId);
      var row = document.createElement('li');
      row.className = 'cart-row';
      row.dataset.cartRow = String(index);

      var name = document.createElement('span');
      name.className = 'cart-row__name';
      name.textContent = entry.quantity + '× ' + (item ? item.name : '(ismeretlen tétel)');

      var price = document.createElement('span');
      price.className = 'cart-row__price';
      price.textContent = money(unitPriceOf(entry) * entry.quantity);

      row.appendChild(name);
      row.appendChild(price);

      var details = [];
      if (entry.extraIds.length) {
        details.push(entry.extraIds
          .map(function (id) { var extra = extraById(id); return extra ? '+ ' + extra.name : ''; })
          .filter(Boolean)
          .join('  '));
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

      var minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'btn--sm';
      minus.dataset.cartMinus = String(index);
      minus.textContent = '−';
      minus.addEventListener('click', function () {
        if (entry.quantity > 1) entry.quantity -= 1;
        else state.cart.splice(index, 1);
        saveCart();
        renderCart();
      });

      var plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'btn--sm';
      plus.dataset.cartPlus = String(index);
      plus.textContent = '+';
      plus.addEventListener('click', function () {
        if (entry.quantity < 99) entry.quantity += 1;
        saveCart();
        renderCart();
      });

      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn--sm';
      edit.dataset.cartEdit = String(index);
      edit.textContent = 'Módosítás';
      edit.addEventListener('click', function () {
        if (item) openCustomize(item, index);
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn--sm';
      remove.dataset.cartRemove = String(index);
      remove.textContent = 'Törlés';
      remove.addEventListener('click', function () {
        state.cart.splice(index, 1);
        saveCart();
        renderCart();
      });

      actions.appendChild(minus);
      actions.appendChild(plus);
      actions.appendChild(edit);
      actions.appendChild(remove);
      row.appendChild(actions);

      list.appendChild(row);
    });

    var total = cartTotal();
    var count = cartCount();

    el('[data-cart-total]').textContent = money(total);
    el('[data-cart-fab-total]').textContent = money(total);
    el('[data-cart-count]').textContent = count;
    el('[data-cart-open]').hidden = count === 0;
    el('[data-cart-submit]').disabled = count === 0 || state.submitting;

    // Ha kiürült a kosár, nincs mit mutatni a lapon.
    if (!count) el('[data-cart-sheet]').hidden = true;
  }

  /* ---------------------------------------------------------- leadas */

  function clearErrors() {
    var form = el('[data-guest-form]');
    form.querySelectorAll('[data-field]').forEach(function (wrapper) {
      wrapper.classList.remove('field--error');
      var box = wrapper.querySelector('.field__error');
      if (box) box.textContent = '';
    });
  }

  function showErrors(fields) {
    clearErrors();
    var form = el('[data-guest-form]');
    (fields || []).forEach(function (item) {
      var wrapper = form.querySelector('[data-field="' + item.field + '"]');
      if (!wrapper) return;
      wrapper.classList.add('field--error');
      var box = wrapper.querySelector('.field__error');
      if (box) box.textContent = item.message;
    });
  }

  function submitOrder() {
    if (state.submitting || !state.cart.length) return;

    var form = el('[data-guest-form]');
    var guestName = form.elements.guestName.value.trim();
    clearErrors();

    if (guestName.length < 2) {
      showErrors([{ field: 'guestName', message: 'Add meg a neved (legalább 2 karakter).' }]);
      form.elements.guestName.focus();
      return;
    }

    state.submitting = true;
    var button = el('[data-cart-submit]');
    button.disabled = true;
    button.textContent = 'Leadás…';

    api('/api/online/orders', {
      method: 'POST',
      body: {
        guestName: guestName,
        restaurantId: state.restaurant ? state.restaurant.id : undefined,
        items: state.cart.map(function (entry) {
          return {
            menuItemId: entry.menuItemId,
            quantity: entry.quantity,
            comment: entry.comment,
            extraIds: entry.extraIds
          };
        })
      }
    })
      .then(function (result) {
        // Csak sikeres leadás után ürítjük a kosarat.
        state.order = result.order;
        state.cart = [];
        saveCart();
        renderCart();

        el('[data-cart-sheet]').hidden = true;
        form.reset();
        showConfirmation(result.order);
      })
      .catch(function (err) {
        if (err.data && err.data.fields) showErrors(err.data.fields);
        toast((err.message || 'A leadás nem sikerült.') + ' A kosarad megmaradt.', true);
      })
      .finally(function () {
        state.submitting = false;
        button.textContent = 'Rendelés leadása';
        button.disabled = state.cart.length === 0;
      });
  }

  function showConfirmation(order) {
    el('[data-confirm-name]').textContent = order.guestName;
    el('[data-confirm-number]').textContent = order.receiptNumber || '—';
    el('[data-confirm-total]').textContent = money(order.total);

    var list = el('[data-confirm-items]');
    list.innerHTML = '';

    order.items.forEach(function (item) {
      var row = document.createElement('li');
      row.className = 'confirm__item';

      var left = document.createElement('span');
      left.textContent = item.quantity + '× ' + item.name;

      var details = [];
      if (item.extras.length) {
        details.push(item.extras.map(function (e) { return '+ ' + e.name; }).join('  '));
      }
      if (item.comment) details.push('„' + item.comment + '”');

      if (details.length) {
        var detail = document.createElement('span');
        detail.className = 'confirm__item-detail';
        detail.textContent = details.join(' · ');
        left.appendChild(detail);
      }

      var right = document.createElement('span');
      right.textContent = money(item.lineTotal);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });

    el('[data-confirm]').hidden = false;
  }

  /* ---------------------------------------------------------- penztar */

  /**
   * Penztar megnyitasa: a szervertol kerjuk le a fizetendo osszeget (AFA-val es
   * szervizdijjal egyutt), hogy a vendeg pontosan azt lassa, amit fizetnie kell.
   */
  function openCheckout() {
    if (!state.order) return;

    state.checkoutMethod = null;
    el('[data-checkout-submit]').disabled = true;
    el('[data-checkout-note]').hidden = true;

    api('/api/orders/' + state.order.id + '/payments')
      .then(function (data) {
        state.checkout = data;
        renderCheckout();
        el('[data-confirm]').hidden = true;
        el('[data-checkout]').hidden = false;
      })
      .catch(function (err) {
        toast(err.message || 'A pénztár nem tölthető be.', true);
      });
  }

  function renderCheckout() {
    var checkout = state.checkout;
    var totals = checkout.totals;

    el('[data-checkout-number]').textContent = checkout.receiptNumber || '—';
    el('[data-checkout-subtotal]').textContent = money(totals.subtotal);

    if (totals.vatRate) {
      el('[data-checkout-vat-label]').textContent = 'ÁFA (' + totals.vatRate + '%)';
      el('[data-checkout-vat]').textContent = money(totals.vatAmount);
      el('[data-checkout-vat-row]').hidden = false;
    }
    if (totals.serviceFeeRate) {
      el('[data-checkout-service-label]').textContent = 'Szervizdíj (' + totals.serviceFeeRate + '%)';
      el('[data-checkout-service]').textContent = money(totals.serviceFeeAmount);
      el('[data-checkout-service-row]').hidden = false;
    }
    el('[data-checkout-total]').textContent = money(checkout.dueAmount || checkout.total);

    var list = el('[data-checkout-items]');
    list.innerHTML = '';
    (state.order.items || []).forEach(function (item) {
      var row = document.createElement('li');
      row.className = 'confirm__item';

      var left = document.createElement('span');
      left.textContent = item.quantity + '× ' + item.name;
      if (item.extras.length) {
        var detail = document.createElement('span');
        detail.className = 'confirm__item-detail';
        detail.textContent = item.extras.map(function (e) { return '+ ' + e.name; }).join('  ');
        left.appendChild(detail);
      }

      var right = document.createElement('span');
      right.textContent = money(item.lineTotal);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });

    renderCheckoutMethods();
  }

  function renderCheckoutMethods() {
    var list = el('[data-checkout-methods]');
    list.innerHTML = '';

    CHECKOUT_METHODS.forEach(function (method) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pay-method' + (state.checkoutMethod === method.key ? ' is-selected' : '');
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
        state.checkoutMethod = method.key;
        renderCheckoutMethods();

        var noteBox = el('[data-checkout-note]');
        noteBox.hidden = false;
        noteBox.textContent = method.simulated
          ? 'Szimulált fizetés: a rendszer csak a fizetési módot rögzíti — a tényleges terhelés nem itt történik.'
          : 'A pultnál fizetsz készpénzzel vagy kártyával; a kollégánk látni fogja a rendelésed.';

        el('[data-checkout-submit]').disabled = false;
      });

      list.appendChild(button);
    });
  }

  /**
   * Fizetés rögzítése.
   *
   * TODO (kesobbi szegmens): itt kotheto be valodi fizetesi szolgaltato
   * (SimplePay, Barion, Stripe). A gomb ekkor a szolgaltato feluletere vinne, es
   * csak a sikeres tranzakcio utan hivnank a POST /api/orders/:id/payments
   * vegpontot - a felulet tobbi resze valtozatlan maradhat.
   */
  function submitCheckout() {
    if (!state.order || !state.checkoutMethod || state.submitting) return;

    state.submitting = true;
    var button = el('[data-checkout-submit]');
    button.disabled = true;
    button.textContent = 'Fizetés…';

    api('/api/orders/' + state.order.id + '/payments', {
      method: 'POST',
      body: { method: state.checkoutMethod }
    })
      .then(function (result) {
        var method = CHECKOUT_METHODS.filter(function (m) {
          return m.key === result.payment.method;
        })[0];

        el('[data-paid-number]').textContent = state.order.receiptNumber || '—';
        el('[data-paid-method]').textContent = method ? method.label : result.payment.method;
        el('[data-paid-amount]').textContent = money(result.payment.amount);
        el('[data-paid-note]').textContent = method && method.simulated
          ? 'Szimulált fizetési visszaigazolás — a rendelésed fizetettként szerepel a rendszerben.'
          : 'A helyszíni fizetést rögzítettük; a pultnál tudod rendezni.';

        el('[data-checkout]').hidden = true;
        el('[data-paid]').hidden = false;
      })
      .catch(function (err) {
        toast(err.message || 'A fizetés rögzítése nem sikerült.', true);
      })
      .finally(function () {
        state.submitting = false;
        button.textContent = 'Fizetés';
        button.disabled = !state.checkoutMethod;
      });
  }

  /* ---------------------------------------------------------- betoltes */

  function loadMenu() {
    return Promise.all([api('/api/online/menu'), api('/api/online/extras')])
      .then(function (responses) {
        state.menu = responses[0];
        state.extras = responses[1].extras || [];

        var firstWithItems = state.menu.categories.filter(function (category) {
          return itemsOfCategory(category.id).length > 0;
        })[0];
        if (!state.activeCategoryId || !itemsOfCategory(state.activeCategoryId).length) {
          state.activeCategoryId = firstWithItems ? firstWithItems.id : null;
        }

        renderTabs();
        renderItems();
      });
  }

  function loadRestaurant() {
    return api('/api/online/restaurant').then(function (data) {
      state.restaurant = data.restaurant;
      el('[data-restaurant-name]').textContent = data.restaurant.name || 'Étlap';
      el('[data-restaurant-meta]').textContent =
        [data.restaurant.address, data.restaurant.phone].filter(Boolean).join(' · ');
    });
  }

  /* ------------------------------------------------------------ indulas */

  function setupControls() {
    el('[data-theme-toggle]').addEventListener('click', function () {
      setTheme(currentTheme() === 'light' ? 'dark' : 'light');
    });

    el('[data-cart-open]').addEventListener('click', function () {
      el('[data-cart-sheet]').hidden = false;
    });
    el('[data-cart-close]').addEventListener('click', function () {
      el('[data-cart-sheet]').hidden = true;
    });
    el('[data-cart-submit]').addEventListener('click', submitOrder);
    el('[data-guest-form]').addEventListener('submit', function (event) {
      event.preventDefault();
      submitOrder();
    });

    el('[data-customize-close]').addEventListener('click', function () {
      el('[data-customize-sheet]').hidden = true;
      state.draft = null;
      state.editingIndex = null;
    });
    el('[data-customize-confirm]').addEventListener('click', confirmCustomize);
    el('[data-qty-plus]').addEventListener('click', function () {
      if (state.draft.quantity < 99) state.draft.quantity += 1;
      renderDraftTotal();
    });
    el('[data-qty-minus]').addEventListener('click', function () {
      if (state.draft.quantity > 1) state.draft.quantity -= 1;
      renderDraftTotal();
    });

    el('[data-pay]').addEventListener('click', openCheckout);
    el('[data-checkout-submit]').addEventListener('click', submitCheckout);
    el('[data-checkout-back]').addEventListener('click', function () {
      el('[data-checkout]').hidden = true;
      el('[data-confirm]').hidden = false;
    });
    el('[data-paid-close]').addEventListener('click', function () {
      el('[data-paid]').hidden = true;
      el('[data-confirm]').hidden = true;
      state.order = null;
      state.checkout = null;
    });
    el('[data-confirm-close]').addEventListener('click', function () {
      el('[data-confirm]').hidden = true;
      state.order = null;
    });

    // A felcsúszó lapok háttérre koppintva is bezárhatók.
    [['[data-cart-sheet]'], ['[data-customize-sheet]']].forEach(function (pair) {
      var sheet = el(pair[0]);
      sheet.addEventListener('click', function (event) {
        if (event.target === sheet) sheet.hidden = true;
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!el('[data-customize-sheet]').hidden) el('[data-customize-sheet]').hidden = true;
      else if (!el('[data-cart-sheet]').hidden) el('[data-cart-sheet]').hidden = true;
    });
  }

  /**
   * Élő étlap: ha egy tétel közben elfogy (vagy újra lesz), a vendég ne
   * rendelhessen olyat, ami már nincs. A felület bejelentkezés nélkül, vendég
   * szobába csatlakozik.
   */
  function setupSocket() {
    if (!window.AndOrderSocket) return;

    window.AndOrderSocket.connect({});
    window.AndOrderSocket.on('menu_item:availability_changed', function (payload) {
      state.lastEvent = 'menu_item:availability_changed';
      loadMenu().then(function () {
        var item = payload && payload.menuItem;
        if (item && item.isAvailable === false) {
          toast('A(z) „' + item.name + '” épp elfogyott.', true);
        }
      });
    });
  }

  function start() {
    setTheme(currentTheme());
    setupControls();
    setupSocket();

    Promise.all([loadRestaurant(), loadMenu()])
      .then(function () {
        state.cart = loadCart();
        renderCart();
      })
      .catch(function (err) {
        toast(err.message || 'Az étlap betöltése nem sikerült.', true);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Fejlesztői konzolból és automatizált ellenőrzéskor is lekérdezhető állapot.
  window.AndOrderOnline = { state: state, loadMenu: loadMenu, renderCart: renderCart };
})(window, document);
