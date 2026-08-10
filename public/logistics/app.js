/*
 * Logisztikai felulet - kozos mag.
 *
 * Itt van a bejelentkezes bekotese, a fulek kezelese es minden modul kozos
 * segedfuggvenye (API hivas, datumkezeles, penzformazas, tablazat epites).
 * A harom nezetet kulon fajl valositja meg (dashboard.js, orders.js,
 * closing.js), amik a LogisticsApp.register()-rel jelentkeznek be.
 *
 * A felulet fo hasznalati esete asztali gep / tablet: adatkozpontu, feher-fekete
 * megjelenes, sok tablazattal - ezert a kozos segedek is a tablazatepiteshez
 * es a szamok olvashato formazasahoz keszultek.
 */
(function (window, document) {
  'use strict';

  var modules = {};
  var loaded = {};

  var app = {
    user: null,

    /* ---------- modulok ---------- */

    /**
     * @param {string} name a ful neve (data-tab / data-panel ertek)
     * @param {{ init?: Function, load: Function, onPaymentRecorded?: Function }} handlers
     */
    register: function (name, handlers) {
      modules[name] = handlers;
    },

    /** Egy ful adatainak (ujra)toltese. */
    loadPanel: function (name, force) {
      var handler = modules[name];
      if (!handler) return Promise.resolve();

      if (!loaded[name] && typeof handler.init === 'function') {
        handler.init();
        loaded[name] = true;
      }

      return Promise.resolve(handler.load(force)).catch(function (err) {
        app.toast(err.message, true);
      });
    },

    /* ---------- API ---------- */

    /** API hivas a bejelentkezett munkatars tokenjevel. */
    api: function (path, options) {
      return window.AndOrderAuth.request(path, options);
    },

    /**
     * Query string osszeallitasa: az ures ertekek kimaradnak, igy a szerver
     * alapertelmezese ervenyesul (pl. ures datum -> mai nap).
     */
    query: function (params) {
      var parts = [];
      Object.keys(params || {}).forEach(function (key) {
        var value = params[key];
        if (value === undefined || value === null || value === '') return;
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
      });
      return parts.length ? '?' + parts.join('&') : '';
    },

    /* ---------- urlapok ---------- */

    /** Urlap ertekei objektumkent. */
    values: function (form) {
      var out = {};
      Array.prototype.forEach.call(form.elements, function (element) {
        if (!element.name) return;
        out[element.name] = element.type === 'checkbox' ? element.checked : element.value;
      });
      return out;
    },

    clearErrors: function (form) {
      form.querySelectorAll('[data-field]').forEach(function (wrapper) {
        wrapper.classList.remove('field--error');
        var box = wrapper.querySelector('.field__error');
        if (box) box.textContent = '';
      });
    },

    /** Szerver oldali mezohibak kirakasa a megfelelo mezokhoz. */
    showErrors: function (form, fields) {
      app.clearErrors(form);
      (fields || []).forEach(function (item) {
        var wrapper = form.querySelector('[data-field="' + item.field + '"]');
        if (!wrapper) return;
        wrapper.classList.add('field--error');
        var box = wrapper.querySelector('.field__error');
        if (box) box.textContent = item.message;
      });
    },

    /**
     * Urlap bekuldes kozos kezelese: hibak torlese, gomb tiltasa, mezohibak
     * kirakasa, sikeres muvelet utan visszajelzes.
     */
    submit: function (form, action, successMessage) {
      var button = form.querySelector('button[type="submit"]');
      app.clearErrors(form);
      if (button) button.disabled = true;

      return Promise.resolve()
        .then(action)
        .then(function (result) {
          if (successMessage) app.toast(successMessage);
          return result;
        })
        .catch(function (err) {
          if (err.data && err.data.fields) app.showErrors(form, err.data.fields);
          app.toast(err.message, true);
          throw err;
        })
        .finally(function () {
          if (button) button.disabled = false;
        });
    },

    /* ---------- formazas ---------- */

    /** Ft formatum ezres tagolassal. */
    money: function (value) {
      return new Intl.NumberFormat('hu-HU').format(Math.round(Number(value) || 0)) + ' Ft';
    },

    /** Elojeles osszeg - az elteres megjelenitesehez. */
    signedMoney: function (value) {
      var amount = Math.round(Number(value) || 0);
      return (amount > 0 ? '+' : '') + app.money(amount);
    },

    /** Datum + ido, tablazatba valo rovid alakban. */
    dateTime: function (iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleString('hu-HU', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    },

    /** Csak a nap (YYYY. MM. DD.). */
    dateOnly: function (value) {
      if (!value) return '—';
      // A YYYY-MM-DD alakot helyi idoben ertelmezzuk, hogy ne csusszon at a
      // szomszedos napra a bongeszo idozonaja miatt.
      var parts = String(value).slice(0, 10).split('-');
      return parts[0] + '. ' + parts[1] + '. ' + parts[2] + '.';
    },

    /* ---------- datum segedek ---------- */

    /** Egy Date helyi ido szerinti napja YYYY-MM-DD alakban (input[type=date]). */
    toDateInput: function (date) {
      var pad = function (value) { return String(value).padStart(2, '0'); };
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    },

    today: function () {
      return app.toDateInput(new Date());
    },

    /** Mai naphoz kepest eltolt nap. */
    daysAgo: function (days) {
      var date = new Date();
      date.setDate(date.getDate() - days);
      return app.toDateInput(date);
    },

    /**
     * Gyors idoszak gombok kiszolgalasa (Ma / Tegnap / 7 nap / 30 nap).
     * @returns {{ dateFrom: string, dateTo: string }|null}
     */
    preset: function (name) {
      switch (name) {
        case 'today': return { dateFrom: app.today(), dateTo: app.today() };
        case 'yesterday': return { dateFrom: app.daysAgo(1), dateTo: app.daysAgo(1) };
        case 'week': return { dateFrom: app.daysAgo(6), dateTo: app.today() };
        case 'month': return { dateFrom: app.daysAgo(29), dateTo: app.today() };
        default: return null;
      }
    },

    /** Az idoszak emberi leirasa a fejlecekhez. */
    rangeLabel: function (range) {
      if (!range) return '';
      return range.dateFrom === range.dateTo
        ? app.dateOnly(range.dateFrom)
        : app.dateOnly(range.dateFrom) + ' – ' + app.dateOnly(range.dateTo);
    },

    /**
     * Idoszak gombok bekotese egy urlapra: a gomb kitolti a ket datum mezot,
     * es azonnal be is kuldi az urlapot.
     */
    bindPresets: function (form) {
      form.addEventListener('click', function (event) {
        var button = event.target.closest('[data-preset]');
        if (!button) return;
        var range = app.preset(button.dataset.preset);
        if (!range) return;
        form.querySelector('[name="dateFrom"]').value = range.dateFrom;
        form.querySelector('[name="dateTo"]').value = range.dateTo;
        form.requestSubmit
          ? form.requestSubmit()
          : form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    },

    /* ---------- tablazat ---------- */

    /** Szoveges cella. */
    cell: function (text, className) {
      var td = document.createElement('td');
      td.textContent = text === null || text === undefined || text === '' ? '—' : String(text);
      if (className) td.className = className;
      return td;
    },

    /** Egy egesz soros uzenet a tablazatban (ures lista, hiba, toltes). */
    messageRow: function (body, colspan, message) {
      body.innerHTML = '';
      var row = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = colspan;
      td.className = 'data-table__message';
      td.textContent = message;
      row.appendChild(td);
      body.appendChild(row);
    },

    /** Allapotcimke (fizetve / nincs fizetve, online / helyszini). */
    badge: function (text, variant) {
      var span = document.createElement('span');
      span.className = 'badge' + (variant ? ' badge--' + variant : '');
      span.textContent = text;
      return span;
    },

    /* ---------- megjelenites ---------- */

    toast: function (message, isError) {
      var box = document.querySelector('[data-toast]');
      if (!box) return;

      box.textContent = message;
      box.className = 'toast' + (isError ? ' toast--error' : '');
      box.hidden = false;

      window.clearTimeout(app._toastTimer);
      app._toastTimer = window.setTimeout(function () {
        box.hidden = true;
      }, isError ? 6000 : 3000);
    },

    /* ---------- fulek ---------- */

    setupTabs: function () {
      var nav = document.querySelector('[data-logi-nav]');
      if (!nav) return;

      nav.addEventListener('click', function (event) {
        var tab = event.target.closest('[data-tab]');
        if (!tab) return;
        app.showTab(tab.dataset.tab);
      });
    },

    showTab: function (name) {
      app.activeTab = name;

      document.querySelectorAll('[data-tab]').forEach(function (tab) {
        tab.classList.toggle('is-active', tab.dataset.tab === name);
      });
      document.querySelectorAll('[data-panel]').forEach(function (panel) {
        panel.hidden = panel.dataset.panel !== name;
      });

      app.loadPanel(name);
    },

    /* ---------- valos ideju frissules ---------- */

    /**
     * A 12. szegmens `order:payment_recorded` esemenye a logisztikai szobaba is
     * megy: ha eppen nyitva van egy nezet, frissul, hogy a napi forgalom ne
     * avuljon el a kepernyon.
     *
     * A frissitest osszevonjuk: forgalmas oraban tobb fizetes is erkezhet
     * egymas utan, de eleg egyszer ujratolteni.
     */
    setupLiveUpdates: function () {
      window.AndOrderSocket.connect({ token: window.AndOrderAuth.getToken() });

      window.AndOrderSocket.on('order:payment_recorded', function (payload) {
        Object.keys(modules).forEach(function (name) {
          var handler = modules[name];
          if (loaded[name] && typeof handler.onPaymentRecorded === 'function') {
            handler.onPaymentRecorded(payload);
          }
        });

        window.clearTimeout(app._refreshTimer);
        app._refreshTimer = window.setTimeout(function () {
          app.loadPanel(app.activeTab, true);
        }, 400);
      });
    },

    /* ---------- indulas ---------- */

    start: function (user) {
      app.user = user;
      app.setupTabs();
      app.setupLiveUpdates();
      app.showTab('dashboard');
    }
  };

  window.LogisticsApp = app;

  window.AndOrderAuth.init({
    interface: 'logistics',
    mode: 'password',
    // Rövidebb munkamenet: a lap bezárásával törlődik a token.
    storage: 'session',
    role: 'logistics',
    onLogin: app.start
  });
})(window, document);
