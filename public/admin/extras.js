/*
 * Admin - extrak / kiegeszitok kezelese (hozzaadas, szerkesztes, torles).
 */
(function (window, document) {
  'use strict';

  var app = window.AdminApp;
  var state = { extras: [], editingId: null };

  function form() {
    return document.querySelector('[data-extra-form]');
  }

  function render() {
    var body = document.querySelector('[data-extras-body]');

    if (!state.extras.length) {
      app.messageRow(body, 3, 'Még nincs kiegészítő. Adj hozzá egyet fent.');
      return;
    }

    body.innerHTML = '';
    state.extras.forEach(function (extra) {
      var row = document.createElement('tr');
      row.dataset.extraRow = extra.id;

      row.appendChild(app.cell(extra.name));
      row.appendChild(app.cell(app.money(extra.price), 'col-num'));
      row.appendChild(
        app.actionsCell([
          app.button('Szerkesztés', 'btn--ghost', function () { startEdit(extra); }),
          app.button('Törlés', 'btn--danger', function () { remove(extra); })
        ])
      );

      body.appendChild(row);
    });
  }

  function startEdit(extra) {
    var element = form();
    state.editingId = extra.id;

    element.elements.id.value = extra.id;
    element.elements.name.value = extra.name;
    element.elements.price.value = extra.price;

    document.querySelector('[data-extra-form-title]').textContent = 'Kiegészítő szerkesztése';
    document.querySelector('[data-extra-submit]').textContent = 'Mentés';
    document.querySelector('[data-extra-cancel]').hidden = false;
    app.clearErrors(element);
  }

  function cancelEdit() {
    var element = form();
    state.editingId = null;

    element.reset();
    element.elements.id.value = '';

    document.querySelector('[data-extra-form-title]').textContent = 'Új kiegészítő';
    document.querySelector('[data-extra-submit]').textContent = 'Hozzáadás';
    document.querySelector('[data-extra-cancel]').hidden = true;
    app.clearErrors(element);
  }

  function save(event) {
    event.preventDefault();
    var element = form();
    var values = app.values(element);
    var editingId = state.editingId;
    var path = editingId ? '/api/admin/extras/' + editingId : '/api/admin/extras';

    app
      .submit(
        element,
        function () {
          return app.api(path, {
            method: editingId ? 'PUT' : 'POST',
            body: { name: values.name, price: values.price }
          });
        },
        editingId ? 'Kiegészítő mentve.' : 'Kiegészítő hozzáadva.'
      )
      .then(function () {
        cancelEdit();
        return load();
      })
      .catch(function () {});
  }

  function remove(extra) {
    if (!app.confirm('Biztosan törlöd a(z) "' + extra.name + '" kiegészítőt?')) return;

    app
      .api('/api/admin/extras/' + extra.id, { method: 'DELETE' })
      .then(function () {
        app.toast('Kiegészítő törölve.');
        if (state.editingId === extra.id) cancelEdit();
        return load();
      })
      .catch(function (err) {
        app.toast(err.message, true);
      });
  }

  function load() {
    return app.api('/api/admin/extras').then(function (data) {
      state.extras = data.extras;
      render();
    });
  }

  app.register('extras', {
    init: function () {
      form().addEventListener('submit', save);
      document.querySelector('[data-extra-cancel]').addEventListener('click', cancelEdit);
    },
    load: load
  });
})(window, document);
