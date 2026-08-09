/*
 * Admin - menukategoriak es etlap tetelek kezelese.
 *
 * A kategoriak es a tetelek szorosan osszefuggnek (a tetelek kategoriankent
 * csoportositva jelennek meg, es a tetel urlap a kategoriakbol epiti a
 * valasztot), ezert egy fajlban van a ketto.
 */
(function (window, document) {
  'use strict';

  var app = window.AdminApp;

  /** Kategoria tipusok a kozos konstansokbol (a konyhai sort a food tolti fel). */
  var CATEGORY_KINDS = window.APP_CONSTANTS.MENU_CATEGORY_KINDS;

  var state = {
    categories: [],
    items: [],
    allergens: [],
    editingItemId: null,
    availableOnly: false
  };

  /* ------------------------------------------------------------ kategoriak */

  function categoryForm() {
    return document.querySelector('[data-category-form]');
  }

  function itemCountOf(categoryId) {
    return state.items.filter(function (item) {
      return item.categoryId === categoryId;
    }).length;
  }

  function renderCategories() {
    var body = document.querySelector('[data-categories-body]');
    if (!state.categories.length) {
      app.messageRow(body, 5, 'Még nincs kategória. Adj hozzá egyet fent.');
      return;
    }

    body.innerHTML = '';
    state.categories.forEach(function (category, index) {
      var count = itemCountOf(category.id);
      var row = document.createElement('tr');

      row.appendChild(app.cell(String(index + 1)));
      row.appendChild(app.cell(category.name));
      row.appendChild(kindCell(category));
      row.appendChild(app.cell(String(count), 'col-num'));
      row.appendChild(
        app.actionsCell([
          app.button('↑', 'btn--ghost btn--icon', function () { move(category.id, 'up'); },
            { title: 'Feljebb', disabled: index === 0 }),
          app.button('↓', 'btn--ghost btn--icon', function () { move(category.id, 'down'); },
            { title: 'Lejjebb', disabled: index === state.categories.length - 1 }),
          app.button('Átnevezés', 'btn--ghost', function () { rename(category); }),
          app.button('Törlés', 'btn--danger', function () { removeCategory(category, count); },
            { title: count ? 'Csak üres kategória törölhető' : 'Törlés' })
        ])
      );

      body.appendChild(row);
    });
  }

  /**
   * A kategoria tipusa helyben allithato: ez donti el, hogy a tetelei
   * megjelennek-e a konyhai munkapulton.
   */
  function kindCell(category) {
    var td = document.createElement('td');
    var select = document.createElement('select');
    select.className = 'field__input field__input--inline';
    select.dataset.categoryKind = category.id;

    CATEGORY_KINDS.forEach(function (kind) {
      var option = document.createElement('option');
      option.value = kind.key;
      option.textContent = kind.label;
      option.selected = category.kind === kind.key;
      select.appendChild(option);
    });

    select.addEventListener('change', function () {
      app
        .api('/api/admin/menu-categories/' + category.id, {
          method: 'PUT',
          body: { name: category.name, kind: select.value }
        })
        .then(function () {
          app.toast('Kategória típusa mentve.');
          return reload();
        })
        .catch(function (err) {
          app.toast(err.message, true);
          select.value = category.kind;
        });
    });

    td.appendChild(select);
    return td;
  }

  function addCategory(event) {
    event.preventDefault();
    var element = categoryForm();
    var values = app.values(element);

    app
      .submit(
        element,
        function () {
          return app.api('/api/admin/menu-categories', {
            method: 'POST',
            body: { name: values.name, kind: values.kind }
          });
        },
        'Kategória hozzáadva.'
      )
      .then(function () {
        element.reset();
        return reload();
      })
      .catch(function () {});
  }

  function rename(category) {
    var name = window.prompt('Kategória új neve:', category.name);
    if (name === null || name.trim() === '' || name === category.name) return;

    app
      .api('/api/admin/menu-categories/' + category.id, { method: 'PUT', body: { name: name } })
      .then(function () {
        app.toast('Kategória átnevezve.');
        return reload();
      })
      .catch(function (err) {
        app.toast(err.message, true);
      });
  }

  function move(categoryId, direction) {
    app
      .api('/api/admin/menu-categories/' + categoryId + '/move', {
        method: 'POST',
        body: { direction: direction }
      })
      .then(function (data) {
        state.categories = data.categories;
        renderCategories();
        renderItems();
      })
      .catch(function (err) {
        app.toast(err.message, true);
      });
  }

  function removeCategory(category, count) {
    if (count > 0) {
      app.toast('A(z) "' + category.name + '" kategória nem törölhető, mert ' + count + ' tétel tartozik hozzá.', true);
      return;
    }
    if (!app.confirm('Biztosan törlöd a(z) "' + category.name + '" kategóriát?')) return;

    app
      .api('/api/admin/menu-categories/' + category.id, { method: 'DELETE' })
      .then(function () {
        app.toast('Kategória törölve.');
        return reload();
      })
      .catch(function (err) {
        app.toast(err.message, true);
      });
  }

  /* ---------------------------------------------------------- etlap tetelek */

  function itemForm() {
    return document.querySelector('[data-item-form]');
  }

  /** Allergen checkboxok felepitese a szervertol kapott katalogusbol. */
  function renderAllergenChoices() {
    var list = document.querySelector('[data-allergen-list]');
    list.innerHTML = '';

    state.allergens.forEach(function (allergen) {
      var label = document.createElement('label');
      label.className = 'checkbox';

      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = allergen.key;
      input.dataset.allergen = '';

      var text = document.createElement('span');
      text.textContent = allergen.label;

      label.appendChild(input);
      label.appendChild(text);
      list.appendChild(label);
    });
  }

  function selectedAllergens() {
    return Array.prototype.slice
      .call(document.querySelectorAll('[data-allergen]:checked'))
      .map(function (input) { return input.value; });
  }

  function setSelectedAllergens(keys) {
    document.querySelectorAll('[data-allergen]').forEach(function (input) {
      input.checked = (keys || []).indexOf(input.value) !== -1;
    });
  }

  /** Kategoria valaszto feltoltese a tetel urlapon. */
  function renderCategoryOptions() {
    var select = itemForm().elements.categoryId;
    var previous = select.value;
    select.innerHTML = '';

    if (!state.categories.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Előbb hozz létre kategóriát';
      select.appendChild(empty);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    state.categories.forEach(function (category) {
      var option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    });
    if (previous) select.value = previous;
  }

  function allergenLabels(keys) {
    return (keys || []).map(function (key) {
      var found = state.allergens.filter(function (allergen) { return allergen.key === key; })[0];
      return found ? found.label : key;
    });
  }

  function renderItems() {
    var container = document.querySelector('[data-items-list]');
    container.innerHTML = '';

    var visible = state.availableOnly
      ? state.items.filter(function (item) { return item.isAvailable; })
      : state.items;

    if (!state.categories.length) {
      var note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = 'Előbb hozz létre legalább egy kategóriát.';
      container.appendChild(note);
      return;
    }

    state.categories.forEach(function (category) {
      var items = visible.filter(function (item) { return item.categoryId === category.id; });

      var group = document.createElement('section');
      group.className = 'category-group';
      group.dataset.categoryGroup = category.id;

      var head = document.createElement('div');
      head.className = 'category-group__head';

      var title = document.createElement('h3');
      title.className = 'category-group__title';
      title.textContent = category.name;

      var count = document.createElement('span');
      count.className = 'category-group__count';
      count.textContent = items.length + ' tétel';

      head.appendChild(title);
      head.appendChild(count);
      group.appendChild(head);

      if (!items.length) {
        var empty = document.createElement('p');
        empty.className = 'empty-note';
        empty.textContent = 'Nincs tétel ebben a kategóriában.';
        group.appendChild(empty);
      } else {
        group.appendChild(itemsTable(items));
      }

      container.appendChild(group);
    });
  }

  function itemsTable(items) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';

    var table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML =
      '<thead><tr><th>Név</th><th class="col-num">Ár</th><th>Allergének</th>' +
      '<th>Elérhető</th><th class="col-actions">Műveletek</th></tr></thead>';

    var body = document.createElement('tbody');

    items.forEach(function (item) {
      var row = document.createElement('tr');
      row.dataset.itemRow = item.id;
      if (!item.isAvailable) row.classList.add('is-unavailable');

      row.appendChild(app.cell(item.name));
      row.appendChild(app.cell(app.money(item.price), 'col-num'));
      row.appendChild(allergenCell(item.allergens));
      row.appendChild(availabilityCell(item));
      row.appendChild(
        app.actionsCell([
          app.button('Szerkesztés', 'btn--ghost', function () { startEdit(item); }),
          app.button('Törlés', 'btn--danger', function () { removeItem(item); })
        ])
      );

      body.appendChild(row);
    });

    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  function allergenCell(keys) {
    var td = document.createElement('td');
    td.className = 'col-wrap';

    var labels = allergenLabels(keys);
    if (!labels.length) {
      td.textContent = '—';
      return td;
    }

    var list = document.createElement('div');
    list.className = 'allergen-list';
    labels.forEach(function (label) {
      var tag = document.createElement('span');
      tag.className = 'allergen-tag';
      tag.textContent = label;
      list.appendChild(tag);
    });
    td.appendChild(list);
    return td;
  }

  /** Gyors elerheto / elfogyott kapcsolo - socket esemenyt is kivalt a szerveren. */
  function availabilityCell(item) {
    var td = document.createElement('td');

    var label = document.createElement('label');
    label.className = 'switch';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = item.isAvailable;
    input.dataset.availabilityToggle = item.id;

    var track = document.createElement('span');
    track.className = 'switch__track';

    var text = document.createElement('span');
    text.className = 'switch__label';
    text.textContent = item.isAvailable ? 'elérhető' : 'elfogyott';

    input.addEventListener('change', function () {
      input.disabled = true;
      app
        .api('/api/admin/menu-items/' + item.id + '/availability', {
          method: 'PATCH',
          body: { isAvailable: input.checked }
        })
        .then(function (data) {
          text.textContent = data.item.isAvailable ? 'elérhető' : 'elfogyott';
          var row = document.querySelector('[data-item-row="' + item.id + '"]');
          if (row) row.classList.toggle('is-unavailable', !data.item.isAvailable);

          var stored = state.items.filter(function (existing) { return existing.id === item.id; })[0];
          if (stored) stored.isAvailable = data.item.isAvailable;

          app.toast(
            data.item.name + ' → ' + (data.item.isAvailable ? 'elérhető' : 'elfogyott')
          );
        })
        .catch(function (err) {
          input.checked = !input.checked;
          app.toast(err.message, true);
        })
        .finally(function () {
          input.disabled = false;
        });
    });

    label.appendChild(input);
    label.appendChild(track);
    label.appendChild(text);
    td.appendChild(label);
    return td;
  }

  function startEdit(item) {
    var element = itemForm();
    state.editingItemId = item.id;

    element.elements.id.value = item.id;
    element.elements.name.value = item.name;
    element.elements.price.value = item.price;
    element.elements.categoryId.value = item.categoryId;
    element.elements.isAvailable.checked = item.isAvailable;
    setSelectedAllergens(item.allergens);

    document.querySelector('[data-item-form-title]').textContent = 'Menütétel szerkesztése';
    document.querySelector('[data-item-submit]').textContent = 'Mentés';
    document.querySelector('[data-item-cancel]').hidden = false;

    app.clearErrors(element);
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    var element = itemForm();
    state.editingItemId = null;

    element.reset();
    element.elements.id.value = '';
    element.elements.isAvailable.checked = true;
    setSelectedAllergens([]);

    document.querySelector('[data-item-form-title]').textContent = 'Új menütétel';
    document.querySelector('[data-item-submit]').textContent = 'Hozzáadás';
    document.querySelector('[data-item-cancel]').hidden = true;
    app.clearErrors(element);
  }

  function saveItem(event) {
    event.preventDefault();
    var element = itemForm();
    var values = app.values(element);

    var payload = {
      name: values.name,
      price: values.price,
      categoryId: values.categoryId,
      allergens: selectedAllergens(),
      isAvailable: values.isAvailable
    };

    var editingId = state.editingItemId;
    var path = editingId ? '/api/admin/menu-items/' + editingId : '/api/admin/menu-items';

    app
      .submit(
        element,
        function () {
          return app.api(path, { method: editingId ? 'PUT' : 'POST', body: payload });
        },
        editingId ? 'Menütétel mentve.' : 'Menütétel hozzáadva.'
      )
      .then(function () {
        cancelEdit();
        return reload();
      })
      .catch(function () {});
  }

  function removeItem(item) {
    if (!app.confirm('Biztosan törlöd a(z) "' + item.name + '" tételt?')) return;

    app
      .api('/api/admin/menu-items/' + item.id, { method: 'DELETE' })
      .then(function () {
        app.toast('Menütétel törölve.');
        if (state.editingItemId === item.id) cancelEdit();
        return reload();
      })
      .catch(function (err) {
        app.toast(err.message, true);
      });
  }

  /* ------------------------------------------------------------- betoltes */

  /** Kategoriak es tetelek egyutt - a ketto egymastol fugg. */
  function reload() {
    return Promise.all([
      app.api('/api/admin/menu-categories'),
      app.api('/api/admin/menu-items')
    ]).then(function (responses) {
      state.categories = responses[0].categories;
      state.items = responses[1].items;
      state.allergens = responses[1].allergens;

      if (!document.querySelector('[data-allergen]')) renderAllergenChoices();
      renderCategoryOptions();
      renderCategories();
      renderItems();
    });
  }

  var initialized = false;

  var panel = {
    // A ket ful ugyanezt a kezelot hasznalja, ezert csak egyszer kotunk esemenyt.
    init: function () {
      if (initialized) return;
      initialized = true;

      categoryForm().addEventListener('submit', addCategory);
      itemForm().addEventListener('submit', saveItem);
      document.querySelector('[data-item-cancel]').addEventListener('click', cancelEdit);

      document
        .querySelector('[data-items-filter-available]')
        .addEventListener('change', function (event) {
          state.availableOnly = event.target.checked;
          renderItems();
        });
    },
    load: reload
  };

  // A ket ful ugyanazt az adatot hasznalja, ezert ugyanaz a kezelo.
  app.register('categories', panel);
  app.register('items', panel);
})(window, document);
