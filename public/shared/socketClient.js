/*
 * Kozos kliens oldali Socket.io seged mind az 5 felulethez.
 *
 * Feladatai:
 *   - csatlakozas a szerverhez a tarolt JWT tokennel (handshake.auth.token),
 *   - automatikus ujracsatlakozas halozati megszakadas eseten,
 *   - lathato kapcsolat-allapot jelzo (zold pott: elo kapcsolat, piros: megszakadt),
 *   - az esemenykatalogus osszes esemenyenek regisztralasa (alapertelmezesben
 *     console.log, felulirhato sajat kezelovel).
 *
 * Betoltes:
 *   <script src="/socket.io/socket.io.js"></script>   (a szerver szolgalja ki)
 *   <script src="/shared/socketEvents.js"></script>
 *   <script src="/shared/socketClient.js"></script>
 *
 * Hasznalat:
 *   AndOrderSocket.connect({ token: AndOrderAuth.getToken(), label: 'Pincer' });
 *   AndOrderSocket.on('order:created', function (payload) { ... });
 */
(function (window, document) {
  'use strict';

  var catalog = window.SOCKET_CATALOG;

  var client = {
    socket: null,
    config: {},
    handlers: {},
    lastEvent: null,
    indicator: null,

    /* ---------- allapotjelzo ---------- */

    /** Kis jelzo a felulet sarkaban: kapcsolat allapota + utolso esemeny. */
    createIndicator: function () {
      if (client.indicator) return client.indicator;

      var box = document.createElement('div');
      box.className = 'conn-status is-connecting';
      box.setAttribute('data-conn-status', '');

      var dot = document.createElement('span');
      dot.className = 'conn-status__dot';

      var text = document.createElement('span');
      text.className = 'conn-status__text';
      text.textContent = 'kapcsolódás…';

      var event = document.createElement('span');
      event.className = 'conn-status__event';

      box.appendChild(dot);
      box.appendChild(text);
      box.appendChild(event);
      document.body.appendChild(box);

      client.indicator = { box: box, text: text, event: event };
      return client.indicator;
    },

    /**
     * @param {'connected'|'disconnected'|'connecting'} state
     * @param {string} label a felhasznalonak megjeleno szoveg
     */
    setStatus: function (state, label) {
      var indicator = client.createIndicator();
      indicator.box.className = 'conn-status is-' + state;
      indicator.text.textContent = label;

      if (typeof client.config.onStatus === 'function') {
        client.config.onStatus(state, label);
      }
    },

    showLastEvent: function (name) {
      var indicator = client.createIndicator();
      client.lastEvent = name;
      indicator.event.textContent = name;
    },

    /* ---------- kapcsolat ---------- */

    /**
     * @param {{ token?: string, restaurantId?: string, label?: string,
     *           onStatus?: (state: string, label: string) => void,
     *           onEvent?: (name: string, payload: object) => void }} options
     */
    connect: function (options) {
      client.config = options || {};

      if (typeof window.io !== 'function') {
        console.error('[socket] Hianyzik a Socket.io kliens (/socket.io/socket.io.js).');
        client.setStatus('disconnected', 'nincs kapcsolat');
        return null;
      }

      client.disconnect();

      var auth = {};
      if (client.config.token) auth.token = client.config.token;
      if (client.config.restaurantId) auth.restaurantId = client.config.restaurantId;

      client.setStatus('connecting', 'kapcsolódás…');

      var socket = window.io({
        auth: auth,
        // Halozati megszakadas eseten automatikus ujraprobalkozas, novekvo varakozassal.
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 8000
      });

      socket.on('connect', function () {
        client.setStatus('connected', 'élő kapcsolat');
        console.log('[socket] kapcsolódva:', socket.id);
      });

      socket.on('disconnect', function (reason) {
        client.setStatus('disconnected', 'kapcsolat megszakadt');
        console.warn('[socket] bontva:', reason);
      });

      socket.io.on('reconnect_attempt', function (attempt) {
        client.setStatus('connecting', 'újracsatlakozás… (' + attempt + '.)');
      });

      socket.io.on('reconnect', function (attempt) {
        console.log('[socket] újracsatlakozva a(z) ' + attempt + '. próbálkozásra');
      });

      socket.on('connect_error', function (err) {
        // Ha a szerver utasitotta el a kapcsolatot (pl. lejart token), a
        // Socket.io nem probalkozik ujra automatikusan.
        var authError = socket.active === false;
        client.setStatus('disconnected', authError ? 'bejelentkezés szükséges' : 'kapcsolat megszakadt');
        console.warn('[socket] kapcsolódási hiba:', err.message);

        if (authError && typeof client.config.onAuthError === 'function') {
          client.config.onAuthError(err);
        }
      });

      // A szerver visszajelzese: melyik szobakba kerult a kliens.
      socket.on(catalog.SESSION_EVENT, function (session) {
        console.log('[socket] szobák:', session.rooms.join(', '));
        if (typeof client.config.onSession === 'function') client.config.onSession(session);
      });

      // Az esemenykatalogus minden esemenye: alapertelmezett naplozas + sajat kezelok.
      catalog.ALL_EVENTS.forEach(function (name) {
        socket.on(name, function (payload) {
          console.log('[socket] esemény:', name, payload);
          client.showLastEvent(name);

          if (typeof client.config.onEvent === 'function') client.config.onEvent(name, payload);
          (client.handlers[name] || []).forEach(function (handler) {
            handler(payload);
          });
        });
      });

      client.socket = socket;
      return socket;
    },

    /** Esemenykezelo regisztralasa (a katalogus barmelyik esemenyere). */
    on: function (eventName, handler) {
      if (!client.handlers[eventName]) client.handlers[eventName] = [];
      client.handlers[eventName].push(handler);
    },

    disconnect: function () {
      if (client.socket) {
        client.socket.disconnect();
        client.socket = null;
      }
    },

    isConnected: function () {
      return Boolean(client.socket && client.socket.connected);
    }
  };

  window.AndOrderSocket = client;
})(window, document);
