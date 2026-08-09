/*
 * Kozos kliens oldali auth seged mind az 5 felulethez.
 *
 * Feladatai:
 *   - bejelentkezesi urlap kezelese (jelszavas vagy PIN-billentyuzetes),
 *   - a JWT token tarolasa (localStorage vagy sessionStorage),
 *   - minden API hivasnal az Authorization: Bearer <token> fejlec hozzaadasa,
 *   - lejart / ervenytelen token eseten visszateres a bejelentkezo kepernyore.
 *
 * Hasznalat egy feluleten:
 *   AndOrderAuth.init({ interface: 'waiter', mode: 'pin', storage: 'local',
 *                       role: 'waiter', onLogin: (user) => {...} });
 *
 * Betoltes: <script src="/shared/auth.js"></script>
 */
(function (window, document) {
  'use strict';

  var TOKEN_KEY_PREFIX = 'aoh.token.';

  var api = {
    config: null,
    user: null,

    /* ---------- token tarolas ---------- */

    storage: function () {
      // Pincer / szakacs: tableten hosszabb elettartam -> localStorage.
      // Admin / logisztika: rovidebb munkamenet -> sessionStorage (lap bezarasaval torlodik).
      return api.config && api.config.storage === 'session'
        ? window.sessionStorage
        : window.localStorage;
    },

    tokenKey: function () {
      return TOKEN_KEY_PREFIX + (api.config ? api.config.interface : 'default');
    },

    getToken: function () {
      try {
        return api.storage().getItem(api.tokenKey());
      } catch (err) {
        return null;
      }
    },

    setToken: function (token) {
      try {
        api.storage().setItem(api.tokenKey(), token);
      } catch (err) {
        /* privat bongeszes eseten csak a memoriaban marad */
      }
    },

    clearToken: function () {
      try {
        api.storage().removeItem(api.tokenKey());
      } catch (err) {
        /* nincs teendo */
      }
    },

    /* ---------- API hivasok ---------- */

    /**
     * fetch wrapper: JSON body, Bearer token, egyseges hibakezeles.
     * 401 eseten torli a tokent es visszavisz a bejelentkezo kepernyore.
     *
     * @returns {Promise<any>} a valasz JSON torzse
     */
    request: function (path, options) {
      options = options || {};

      var headers = Object.assign({}, options.headers || {});
      var token = api.getToken();
      if (token) headers.Authorization = 'Bearer ' + token;

      var init = { method: options.method || 'GET', headers: headers };
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }

      return window.fetch(path, init).then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (response.ok) return data;

            if (response.status === 401 && !options.skipAuthRedirect) {
              api.handleSessionEnd(data.message || 'A munkamenet lejart, jelentkezz be ujra.');
            }

            var error = new Error(data.message || 'Ismeretlen hiba (' + response.status + ')');
            error.status = response.status;
            error.code = data.error;
            error.data = data;
            throw error;
          });
      });
    },

    me: function () {
      return api.request('/api/auth/me', { skipAuthRedirect: true });
    },

    /* ---------- bejelentkezes / kilepes ---------- */

    loginWithPassword: function (email, password) {
      return api
        .request('/api/auth/login', {
          method: 'POST',
          body: { email: email, password: password },
          skipAuthRedirect: true
        })
        .then(api.acceptSession);
    },

    loginWithPin: function (pinCode, restaurantId) {
      return api
        .request('/api/auth/login-pin', {
          method: 'POST',
          body: { pinCode: pinCode, restaurantId: restaurantId || undefined },
          skipAuthRedirect: true
        })
        .then(api.acceptSession);
    },

    /** Sikeres belepes utan: szerepkor ellenorzes, token mentes, felulet valtas. */
    acceptSession: function (result) {
      if (api.config.role && result.user.role !== api.config.role) {
        var error = new Error('Ezzel a fiokkal nem ehhez a felulethez van hozzaferesed.');
        error.code = 'wrong_interface';
        throw error;
      }

      api.setToken(result.token);
      api.user = result.user;
      api.showApp(result.user);
      return result.user;
    },

    logout: function () {
      var finish = function () {
        api.clearToken();
        api.user = null;
        api.showLogin();
      };
      // A kijelentkezes szerver oldalon JWT eseten nem kotelezo, de jelezzuk.
      return api
        .request('/api/auth/logout', { method: 'POST', skipAuthRedirect: true })
        .catch(function () {})
        .then(finish);
    },

    /** Lejart / ervenytelen token: token eldobasa es vissza a bejelentkezeshez. */
    handleSessionEnd: function (message) {
      api.clearToken();
      api.user = null;
      api.showLogin(message);
    },

    /* ---------- nezetvaltas ---------- */

    el: function (selector) {
      return document.querySelector(selector);
    },

    showLogin: function (message) {
      var login = api.el('[data-auth-login]');
      var app = api.el('[data-auth-app]');
      if (login) login.hidden = false;
      if (app) app.hidden = true;
      api.setError(message || '');
      api.resetPin();
    },

    showApp: function (user) {
      var login = api.el('[data-auth-login]');
      var app = api.el('[data-auth-app]');
      if (login) login.hidden = true;
      if (app) app.hidden = false;
      api.setError('');

      var nameEl = api.el('[data-auth-user]');
      if (nameEl) nameEl.textContent = user.name;

      if (typeof api.config.onLogin === 'function') {
        api.config.onLogin(user);
      }
    },

    setError: function (message) {
      var box = api.el('[data-auth-error]');
      if (!box) return;
      box.textContent = message || '';
      box.hidden = !message;
    },

    /* ---------- jelszavas urlap ---------- */

    setupPasswordForm: function () {
      var form = api.el('[data-auth-form]');
      if (!form) return;

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = form.querySelector('[name="email"]').value.trim();
        var password = form.querySelector('[name="password"]').value;
        var button = form.querySelector('button[type="submit"]');

        api.setError('');
        if (button) button.disabled = true;

        api
          .loginWithPassword(email, password)
          .catch(function (err) {
            api.setError(err.message);
          })
          .then(function () {
            if (button) button.disabled = false;
          });
      });
    },

    /* ---------- PIN billentyuzet ---------- */

    pin: '',
    maxPinLength: 6,

    resetPin: function () {
      api.pin = '';
      api.renderPin();
    },

    renderPin: function () {
      var display = api.el('[data-auth-pin-display]');
      if (!display) return;

      display.innerHTML = '';
      for (var i = 0; i < api.pin.length; i += 1) {
        var dot = document.createElement('span');
        dot.className = 'pin-display__dot is-filled';
        display.appendChild(dot);
      }
      // A meg hatralevo helyek jelzese (legalabb 4 jegy).
      for (var j = api.pin.length; j < 4; j += 1) {
        var empty = document.createElement('span');
        empty.className = 'pin-display__dot';
        display.appendChild(empty);
      }
    },

    submitPin: function () {
      if (api.pin.length < 4) {
        api.setError('A PIN kod legalabb 4 szamjegy.');
        return;
      }

      var keypad = api.el('[data-auth-keypad]');
      var select = api.el('[data-auth-restaurant]');
      var restaurantId = select ? select.value : undefined;

      api.setError('');
      if (keypad) keypad.querySelectorAll('button').forEach(function (b) { b.disabled = true; });

      api
        .loginWithPin(api.pin, restaurantId)
        .catch(function (err) {
          api.setError(err.message);
          api.resetPin();
        })
        .then(function () {
          if (keypad) keypad.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
        });
    },

    setupKeypad: function () {
      var keypad = api.el('[data-auth-keypad]');
      if (!keypad) return;

      var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Törlés', '0', 'Belépés'];
      keypad.innerHTML = '';

      keys.forEach(function (key) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'keypad__key';
        button.textContent = key;

        if (key === 'Törlés' || key === 'Belépés') {
          button.classList.add('keypad__key--action');
          if (key === 'Belépés') button.classList.add('keypad__key--confirm');
        }

        button.addEventListener('click', function () {
          if (key === 'Törlés') {
            api.pin = '';
            api.setError('');
            api.renderPin();
          } else if (key === 'Belépés') {
            api.submitPin();
          } else if (api.pin.length < api.maxPinLength) {
            api.pin += key;
            api.renderPin();
            api.setError('');
          }
        });

        keypad.appendChild(button);
      });

      // Fizikai billentyuzet is mukodjon (tablet mellett laptopon is kenyelmes).
      document.addEventListener('keydown', function (event) {
        var loginVisible = api.el('[data-auth-login]');
        if (!loginVisible || loginVisible.hidden) return;

        if (/^[0-9]$/.test(event.key) && api.pin.length < api.maxPinLength) {
          api.pin += event.key;
          api.renderPin();
          api.setError('');
        } else if (event.key === 'Backspace') {
          api.pin = api.pin.slice(0, -1);
          api.renderPin();
        } else if (event.key === 'Enter') {
          api.submitPin();
        }
      });

      api.renderPin();
    },

    /** Etterem valaszto feltoltese (csak ha tobb etterem van). */
    setupRestaurantSelect: function () {
      var select = api.el('[data-auth-restaurant]');
      if (!select) return Promise.resolve();

      return api
        .request('/api/auth/restaurants', { skipAuthRedirect: true })
        .then(function (data) {
          var list = data.restaurants || [];
          if (list.length < 2) {
            var field = select.closest('.field');
            if (field) field.hidden = true;
            return;
          }
          list.forEach(function (restaurant) {
            var option = document.createElement('option');
            option.value = restaurant.id;
            option.textContent = restaurant.name;
            select.appendChild(option);
          });
        })
        .catch(function () {
          /* ha nem sikerul, a szerver az egyetlen ettermet hasznalja */
        });
    },

    /* ---------- indulas ---------- */

    /**
     * @param {{ interface: string, mode: 'password'|'pin', storage: 'local'|'session',
     *           role?: string, onLogin?: (user) => void }} options
     */
    init: function (options) {
      api.config = Object.assign({ mode: 'password', storage: 'local' }, options || {});

      var logoutButton = api.el('[data-auth-logout]');
      if (logoutButton) {
        logoutButton.addEventListener('click', function () {
          api.logout();
        });
      }

      if (api.config.mode === 'pin') {
        api.setupKeypad();
        api.setupRestaurantSelect();
      } else {
        api.setupPasswordForm();
      }

      // Van-e meg ervenyes munkamenet?
      if (!api.getToken()) {
        api.showLogin();
        return Promise.resolve(null);
      }

      return api
        .me()
        .then(function (data) {
          if (api.config.role && data.user.role !== api.config.role) {
            api.clearToken();
            api.showLogin('Ezzel a fiokkal nem ehhez a felulethez van hozzaferesed.');
            return null;
          }
          api.user = data.user;
          api.showApp(data.user);
          return data.user;
        })
        .catch(function (err) {
          api.clearToken();
          api.showLogin(err.status === 401 ? '' : err.message);
          return null;
        });
    }
  };

  window.AndOrderAuth = api;
})(window, document);
