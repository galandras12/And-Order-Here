/*
 * Admin - "Étterem beállításai" nezet.
 * Urlap az alapadatokhoz, mentessel es sikeres mentes visszajelzessel.
 */
(function (window, document) {
  'use strict';

  var app = window.AdminApp;
  var current = null;

  var FIELDS = [
    'name',
    'address',
    'phone',
    'vatRate',
    'serviceFeeRate',
    'apCode',
    'receiptFooterMessage'
  ];

  function form() {
    return document.querySelector('[data-restaurant-form]');
  }

  /** A betoltott ertekek visszairasa az urlapba. */
  function fill(restaurant) {
    current = restaurant;
    var element = form();
    FIELDS.forEach(function (name) {
      var input = element.elements[name];
      if (input) input.value = restaurant[name] === null || restaurant[name] === undefined ? '' : restaurant[name];
    });
    app.clearErrors(element);
  }

  function save(event) {
    event.preventDefault();
    var element = form();
    var values = app.values(element);

    app.submit(
      element,
      function () {
        return app
          .api('/api/admin/restaurant', { method: 'PUT', body: values })
          .then(function (data) {
            fill(data.restaurant);
            return data.restaurant;
          });
      },
      'Az étterem adatai elmentve.'
    );
  }

  app.register('restaurant', {
    init: function () {
      form().addEventListener('submit', save);

      document.querySelector('[data-restaurant-reset]').addEventListener('click', function () {
        if (current) {
          fill(current);
          app.toast('A nem mentett módosítások visszaállítva.');
        }
      });
    },

    load: function () {
      return app.api('/api/admin/restaurant').then(function (data) {
        fill(data.restaurant);
      });
    }
  });
})(window, document);
