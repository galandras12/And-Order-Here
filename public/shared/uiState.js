/*
 * Kozos betoltesi es hibaallapot mind az ot felulethez (15. szegmens).
 *
 * Korabban minden felulet maskepp jelezte a halozati hibat: volt, ahol csak egy
 * par masodpercre felvillano toast, volt, ahol semmi - a felhasznalo ures
 * kepernyot latott, es nem tudta, mi tortent. Ez a modul egysegesiti:
 *
 *   - a hibauzenet **megmarad**, amig meg nem szunik a hiba,
 *   - mindig van mellette **ujraprobalkozas** gomb, hogy ne kelljen a lapot
 *     ujratolteni,
 *   - a szoveg a felhasznalonak szol, a technikai reszlet alatta, halvanyan.
 *
 * Elvart DOM (feluletenkent egy darab, a fo tartalom tetejen):
 *
 *   <div class="state-box" data-load-error hidden>
 *     <p class="state-box__text">
 *       <span class="state-box__title"></span>
 *       <span class="state-box__detail"></span>
 *     </p>
 *     <button type="button" class="state-box__retry">Újrapróbálom</button>
 *   </div>
 *
 * Hasznalat:
 *   AndOrderUiState.error('[data-load-error]', err, { retry: load });
 *   AndOrderUiState.clear('[data-load-error]');
 */
(function (window, document) {
  'use strict';

  var DEFAULT_TITLE = 'Nem sikerült betölteni az adatokat.';

  /** Halozati hiba-e (a szerver el sem erheto), vagy a szerver valaszolt hibaval. */
  function describe(error) {
    if (!error) return '';
    // A fetch halozati hibanal TypeError-t dob, uzenet nelkul is elofordulhat.
    if (error.status === undefined && error.message) {
      return 'Úgy tűnik, nincs kapcsolat a szerverrel. ' + error.message;
    }
    return error.message || '';
  }

  var api = {
    /**
     * Hibaallapot megjelenitese ujraprobalkozas gombbal.
     *
     * @param {string|Element} target a doboz (szelektor vagy elem)
     * @param {Error|string} error a hiba, vagy kesz uzenet
     * @param {{ title?: string, retry?: Function }} [options]
     *   retry: a gomb megnyomasakor hivott fuggveny; ha hianyzik, a gomb rejtve marad
     */
    error: function (target, error, options) {
      options = options || {};
      var box = typeof target === 'string' ? document.querySelector(target) : target;
      if (!box) return;

      var title = box.querySelector('.state-box__title');
      var detail = box.querySelector('.state-box__detail');
      var retry = box.querySelector('.state-box__retry');

      if (title) title.textContent = options.title || DEFAULT_TITLE;
      if (detail) {
        detail.textContent = typeof error === 'string' ? error : describe(error);
      }

      if (retry) {
        retry.hidden = typeof options.retry !== 'function';

        // Minden megjelenitesnel friss kezelo: a korabbi bezarasa maradna bent.
        if (box._retryHandler) retry.removeEventListener('click', box._retryHandler);
        if (typeof options.retry === 'function') {
          box._retryHandler = function () {
            retry.disabled = true;
            Promise.resolve()
              .then(options.retry)
              .catch(function () {
                /* az ujabb hibat maga a hivo teszi ki ugyanide */
              })
              .then(function () {
                retry.disabled = false;
              });
          };
          retry.addEventListener('click', box._retryHandler);
        }
      }

      box.hidden = false;
    },

    /** A hibaallapot eltuntetese (sikeres betoltes utan). */
    clear: function (target) {
      var box = typeof target === 'string' ? document.querySelector(target) : target;
      if (box) box.hidden = true;
    },

    /**
     * Skeleton sorok egy tablazat torzsebe, amig az adat megerkezik.
     *
     * @param {Element} body a <tbody>
     * @param {number} columns hany oszlopos a tablazat
     * @param {number} [rows] hany helyorzo sor keszuljon
     */
    skeletonRows: function (body, columns, rows) {
      if (!body) return;
      body.innerHTML = '';

      for (var i = 0; i < (rows || 3); i += 1) {
        var row = document.createElement('tr');
        var cell = document.createElement('td');
        cell.colSpan = columns;
        var bar = document.createElement('span');
        bar.className = 'skeleton skeleton--text';
        cell.appendChild(bar);
        row.appendChild(cell);
        body.appendChild(row);
      }
    }
  };

  window.AndOrderUiState = api;
})(window, document);
