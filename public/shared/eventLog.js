/*
 * Kozos esemenynaplo a feluletekhez.
 *
 * Osszekoti az AndOrderSocket klienst a lappal: elinditja a kapcsolatot, es a
 * beerkezo esemenyeket kiirja a konzolra (ezt a socketClient teszi) es egy
 * lathato listaba is, hogy tobb bongeszoablakban egyszerre ellenorizheto legyen,
 * hova jut el egy esemeny.
 *
 * Elvart DOM (elhagyhato):
 *   <code data-socket-rooms></code>   - a szobak, amikbe a kliens bekerult
 *   <ul data-event-log></ul>          - a beerkezo esemenyek listaja
 */
(function (window, document) {
  'use strict';

  var MAX_ROWS = 15;

  var eventLog = {
    /**
     * @param {{ token?: string, restaurantId?: string }} [options]
     *   token nelkul publikus (online) vendegkent csatlakozik
     */
    start: function (options) {
      options = options || {};

      return window.AndOrderSocket.connect({
        token: options.token,
        restaurantId: options.restaurantId,

        onSession: function (session) {
          var target = document.querySelector('[data-socket-rooms]');
          if (target) target.textContent = session.rooms.join(', ');
        },

        onEvent: function (name, payload) {
          eventLog.append(name, payload);
        },

        onAuthError: function () {
          // Lejart / ervenytelen token: a lap auth retege ugyis visszavisz a
          // bejelentkezeshez, itt csak jelezzuk a naploban.
          eventLog.append('socket:auth_error', { message: 'Bejelentkezés szükséges.' });
        }
      });
    },

    /** Egy sor hozzaadasa a lathato naplohoz. */
    append: function (name, payload) {
      var list = document.querySelector('[data-event-log]');
      if (!list) return;

      var empty = list.querySelector('.event-log__empty');
      if (empty) empty.remove();

      var row = document.createElement('li');
      row.className = 'event-log__row';

      var time = document.createElement('span');
      time.className = 'event-log__time';
      time.textContent = new Date().toLocaleTimeString('hu-HU');

      var label = document.createElement('span');
      label.className = 'event-log__name';
      label.textContent = name;

      var detail = document.createElement('span');
      detail.className = 'event-log__detail';
      detail.textContent = eventLog.describe(payload);

      row.appendChild(time);
      row.appendChild(label);
      row.appendChild(detail);
      list.prepend(row);

      while (list.children.length > MAX_ROWS) {
        list.removeChild(list.lastChild);
      }
    },

    /** Rovid, olvashato osszefoglalo az esemeny torzsebol. */
    describe: function (payload) {
      if (!payload) return '';
      if (payload.order) {
        return payload.order.type === 'online'
          ? 'online rendelés · ' + payload.order.id
          : (payload.order.tableLabel || payload.order.tableId || '') + ' · ' + payload.order.id;
      }
      if (payload.orderItem) return payload.orderItem.status + ' · ' + payload.orderItem.id;
      if (payload.table) return payload.table.label || payload.table.id;
      if (payload.reservation) return payload.reservation.tableId;
      if (payload.menuItem) {
        return payload.menuItem.name + ' · ' + (payload.menuItem.isAvailable ? 'elérhető' : 'elfogyott');
      }
      return payload.message || '';
    }
  };

  window.AndOrderEventLog = eventLog;
})(window, document);
