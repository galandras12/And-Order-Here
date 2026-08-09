/*
 * Admin felulet - kozos mag.
 *
 * Itt van a bejelentkezes bekotese, a fulek kezelese es minden modul kozos
 * segedfuggvenye (API hivas, urlap kezeles, visszajelzes). A tenyleges
 * nezeteket kulon fajlok valositjak meg (restaurant.js, menu.js, extras.js,
 * users.js), amik az AdminApp.register()-rel jelentkeznek be.
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
     * @param {{ init?: Function, load: Function }} handlers
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

    /** Egy masik modul adatainak frissitese (pl. kategoria valtozott -> tetelek). */
    refresh: function (name) {
      if (loaded[name]) return app.loadPanel(name, true);
      return Promise.resolve();
    },

    /* ---------- API ---------- */

    /**
     * API hivas a bejelentkezett admin tokenjevel.
     * A hibakat egyseges Error-kent dobja: message + fields (mezonkenti hibak).
     */
    api: function (path, options) {
      return window.AndOrderAuth.request(path, options);
    },

    /* ---------- urlapok ---------- */

    /** Urlap ertekei objektumkent (a checkboxok logikai ertekkel). */
    values: function (form) {
      var out = {};
      Array.prototype.forEach.call(form.elements, function (element) {
        if (!element.name) return;
        if (element.type === 'checkbox') {
          out[element.name] = element.checked;
        } else {
          out[element.name] = element.value;
        }
      });
      return out;
    },

    /** Korabbi mezohibak torlese. */
    clearErrors: function (form) {
      form.querySelectorAll('[data-field]').forEach(function (wrapper) {
        wrapper.classList.remove('field--error');
        var box = wrapper.querySelector('.field__error');
        if (box) box.textContent = '';
      });
    },

    /**
     * Szerver oldali validacios hibak kirakasa a megfelelo mezokhoz.
     * @param {Array<{field: string, message: string}>} fields
     */
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
     *
     * @param {HTMLFormElement} form
     * @param {() => Promise<any>} action
     * @param {string} successMessage
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
          if (err.data && err.data.fields) {
            app.showErrors(form, err.data.fields);
          }
          app.toast(err.message, true);
          throw err;
        })
        .finally(function () {
          if (button) button.disabled = false;
        });
    },

    /* ---------- megjelenites ---------- */

    /** Rovid visszajelzes a kepernyo aljan. */
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

    /** Ft formatum ezres tagolassal. */
    money: function (value) {
      return new Intl.NumberFormat('hu-HU').format(Number(value) || 0) + ' Ft';
    },

    /** Megerosites veszelyes muvelet elott. */
    confirm: function (message) {
      return window.confirm(message);
    },

    /** Szoveges cella keszitese. */
    cell: function (text, className) {
      var td = document.createElement('td');
      td.textContent = text;
      if (className) td.className = className;
      return td;
    },

    /** Gomb keszitese egy tablazatsorhoz. */
    button: function (label, variant, onClick, options) {
      options = options || {};
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--sm ' + (variant || 'btn--ghost');
      button.textContent = label;
      if (options.title) button.title = options.title;
      if (options.disabled) button.disabled = true;
      button.addEventListener('click', onClick);
      return button;
    },

    /** Muveleti gombok cellaja. */
    actionsCell: function (buttons) {
      var td = document.createElement('td');
      td.className = 'col-actions';
      var wrap = document.createElement('div');
      wrap.className = 'row-actions';
      buttons.filter(Boolean).forEach(function (button) {
        wrap.appendChild(button);
      });
      td.appendChild(wrap);
      return td;
    },

    /** Egy egesz soros uzenet a tablazatban (ures lista, hiba). */
    messageRow: function (body, colspan, message) {
      body.innerHTML = '';
      var row = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = colspan;
      td.textContent = message;
      row.appendChild(td);
      body.appendChild(row);
    },

    /* ---------- fulek ---------- */

    setupTabs: function () {
      var nav = document.querySelector('[data-admin-nav]');
      if (!nav) return;

      nav.addEventListener('click', function (event) {
        var tab = event.target.closest('[data-tab]');
        if (!tab) return;
        app.showTab(tab.dataset.tab);
      });
    },

    showTab: function (name) {
      document.querySelectorAll('[data-tab]').forEach(function (tab) {
        tab.classList.toggle('is-active', tab.dataset.tab === name);
      });
      document.querySelectorAll('[data-panel]').forEach(function (panel) {
        panel.hidden = panel.dataset.panel !== name;
      });

      app.loadPanel(name);
    },

    /* ---------- indulas ---------- */

    start: function (user) {
      app.user = user;
      app.setupTabs();

      // Valos ideju csatorna a bejelentkezeskor kapott tokennel.
      window.AndOrderEventLog.start({ token: window.AndOrderAuth.getToken() });

      // Az elso ful azonnal toltodik, a tobbi a valasztaskor.
      app.showTab('restaurant');
    }
  };

  window.AdminApp = app;

  window.AndOrderAuth.init({
    interface: 'admin',
    mode: 'password',
    // Admin munkamenet rovidebb: a lap bezarasaval torlodik a token.
    storage: 'session',
    role: 'admin',
    onLogin: app.start
  });
})(window, document);
