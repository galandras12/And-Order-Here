/*
 * Admin felulet. Egyelore csak a felhasznalo lista jelenik meg (4. szegmens
 * elokeszitese), szerkesztes meg nincs.
 */
(function () {
  'use strict';

  var ROLE_LABELS = {
    waiter: 'Pincér',
    cook: 'Szakács',
    admin: 'Admin',
    logistics: 'Logisztika',
    customer: 'Vendég'
  };

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  /**
   * @param {boolean} isOn
   * @param {string} onLabel
   * @param {string} offLabel
   * @param {string} [offClass] 'tag--off' csak ott, ahol a nemleges ertek tenyleg
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

  function renderUsers(users) {
    var body = document.querySelector('[data-users-body]');
    body.innerHTML = '';

    if (!users.length) {
      var empty = document.createElement('tr');
      empty.appendChild(cell('Nincs felhasználó.'));
      body.appendChild(empty);
      return;
    }

    users.forEach(function (user) {
      var row = document.createElement('tr');
      row.appendChild(cell(user.name));
      row.appendChild(cell(ROLE_LABELS[user.role] || user.role));
      row.appendChild(cell(user.email || '—'));
      row.appendChild(tagCell(user.hasPin, 'van', 'nincs'));
      row.appendChild(tagCell(user.isActive, 'aktív', 'inaktív', 'tag--off'));
      body.appendChild(row);
    });
  }

  function loadUsers() {
    AndOrderAuth.request('/api/admin/users')
      .then(function (data) {
        renderUsers(data.users || []);
      })
      .catch(function (err) {
        var body = document.querySelector('[data-users-body]');
        body.innerHTML = '';
        var row = document.createElement('tr');
        row.appendChild(cell('Nem sikerült betölteni: ' + err.message));
        body.appendChild(row);
      });
  }

  AndOrderAuth.init({
    interface: 'admin',
    mode: 'password',
    // Admin munkamenet rovidebb: a lap bezarasaval torlodik a token.
    storage: 'session',
    role: 'admin',
    onLogin: function () {
      loadUsers();
      // Valos ideju csatorna a bejelentkezeskor kapott tokennel.
      AndOrderEventLog.start({ token: AndOrderAuth.getToken() });
    }
  });
})();
