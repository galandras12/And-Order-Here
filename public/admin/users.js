/*
 * Admin - felhasznalo lista (megjelenites; szerkesztes kesobbi szegmensben).
 */
(function (window, document) {
  'use strict';

  var app = window.AdminApp;

  var ROLE_LABELS = {
    waiter: 'Pincér',
    cook: 'Szakács',
    admin: 'Admin',
    logistics: 'Logisztika',
    customer: 'Vendég'
  };

  /**
   * @param {boolean} isOn
   * @param {string} offClass 'tag--off' csak ott, ahol a nemleges ertek tenyleg
   *   figyelmeztetes (inaktiv fiok); a hianyzo PIN semleges informacio.
   */
  function tagCell(isOn, onLabel, offLabel, offClass) {
    var td = document.createElement('td');
    var span = document.createElement('span');
    span.className = 'tag ' + (isOn ? 'tag--on' : offClass || '');
    span.textContent = isOn ? onLabel : offLabel;
    td.appendChild(span);
    return td;
  }

  function render(users) {
    var body = document.querySelector('[data-users-body]');

    if (!users.length) {
      app.messageRow(body, 5, 'Nincs felhasználó.');
      return;
    }

    body.innerHTML = '';
    users.forEach(function (user) {
      var row = document.createElement('tr');
      row.appendChild(app.cell(user.name));
      row.appendChild(app.cell(ROLE_LABELS[user.role] || user.role));
      row.appendChild(app.cell(user.email || '—'));
      row.appendChild(tagCell(user.hasPin, 'van', 'nincs'));
      row.appendChild(tagCell(user.isActive, 'aktív', 'inaktív', 'tag--off'));
      body.appendChild(row);
    });
  }

  app.register('users', {
    load: function () {
      return app.api('/api/admin/users').then(function (data) {
        render(data.users || []);
      });
    }
  });
})(window, document);
