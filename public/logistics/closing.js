/*
 * Logisztika - C) napi kasszazaras ("Napi zaras" ful).
 *
 * Ket keresbol dolgozik:
 *   - `GET  /api/logistics/cash-closing/preview` - a rendszer altal vart
 *     keszpenz-egyenleg az idoszakra (keszpenz + utolagos ATM),
 *   - `POST /api/logistics/cash-closing`          - a zaras rogzitese.
 *
 * A vart osszeget mindig a szerver szamolja: a kliens csak a leszamolt osszeget
 * es a jegyzetet kuldi. Az elteres a beviteli mezo alatt azonnal latszik, hogy
 * a munkatars meg a rogzites elott eszrevegye, ha elgepelt.
 */
(function (window, document) {
  'use strict';

  var app = window.LogisticsApp;

  var COLUMNS = 7;

  var state = {
    expectedAmount: 0
  };

  function el(selector) {
    return document.querySelector(selector);
  }

  function rangeForm() {
    return el('[data-closing-range]');
  }

  function closingForm() {
    return el('[data-closing-form]');
  }

  /** A zaras idoszaka: ami a datummezokben all (ures = a szerver alapertelmezese). */
  function currentRange() {
    var values = app.values(rangeForm());
    return { dateFrom: values.dateFrom, dateTo: values.dateTo };
  }

  /* ------------------------------------------------------------ elteres */

  /**
   * Az elteres kiszamolasa es kiirasa.
   * Elojel: pozitiv = tobblet a fiokban, negativ = hiany.
   */
  function updateDifference() {
    var box = el('[data-closing-diff-box]');
    var output = el('[data-closing-diff]');
    var raw = closingForm().querySelector('[name="actualAmount"]').value;

    if (raw === '') {
      output.textContent = '—';
      box.className = 'closing-diff';
      return;
    }

    var difference = Math.round(Number(raw) || 0) - state.expectedAmount;
    output.textContent = app.signedMoney(difference);

    box.className = 'closing-diff'
      + (difference === 0 ? ' is-match' : difference > 0 ? ' is-over' : ' is-short');
  }

  /* ---------------------------------------------------------- elonezet */

  function renderPreview(preview) {
    state.expectedAmount = preview.expectedAmount;

    el('[data-closing-expected]').textContent = app.money(preview.expectedAmount);

    var list = el('[data-closing-breakdown]');
    list.innerHTML = '';
    preview.byMethod.forEach(function (method) {
      var row = document.createElement('li');
      var label = document.createElement('span');
      label.textContent = method.label + ' (' + method.count + ' db)';
      var amount = document.createElement('span');
      amount.textContent = app.money(method.amount);
      row.appendChild(label);
      row.appendChild(amount);
      list.appendChild(row);
    });

    // Ha erre az idoszakra mar zartak, azt jelezzuk - de nem tiltjuk: egy napon
    // tobb muszak is zarhat.
    var warning = el('[data-closing-existing]');
    if (preview.existingClosings.length) {
      warning.hidden = false;
      warning.textContent = 'Erre az időszakra már van ' + preview.existingClosings.length
        + ' rögzített zárás. Új zárás rögzítése ettől még lehetséges (pl. másik műszak).';
    } else {
      warning.hidden = true;
      warning.textContent = '';
    }

    updateDifference();
  }

  /* -------------------------------------------------- korabbi zarasok */

  function renderClosings(data) {
    var body = el('[data-closing-body]');

    if (!data.closings.length) {
      app.messageRow(body, COLUMNS, 'Még nincs rögzített kasszazárás.');
      return;
    }

    body.innerHTML = '';

    data.closings.forEach(function (closing) {
      var row = document.createElement('tr');

      var period = closing.dateFrom === closing.dateTo
        ? app.dateOnly(closing.dateFrom)
        : app.dateOnly(closing.dateFrom) + ' – ' + app.dateOnly(closing.dateTo);

      row.appendChild(app.cell(period, 'col-time'));
      row.appendChild(app.cell(app.dateTime(closing.closedAt), 'col-time'));
      row.appendChild(app.cell(app.money(closing.expectedAmount), 'col-num'));
      row.appendChild(app.cell(app.money(closing.actualAmount), 'col-num'));

      var diff = app.cell(app.signedMoney(closing.difference), 'col-num col-strong');
      diff.classList.add(
        closing.difference === 0 ? 'is-match' : closing.difference > 0 ? 'is-over' : 'is-short'
      );
      row.appendChild(diff);

      row.appendChild(app.cell(closing.closedByName));
      row.appendChild(app.cell(closing.note, 'col-note'));

      body.appendChild(row);
    });
  }

  /* ------------------------------------------------------------ toltes */

  function load() {
    var range = currentRange();

    return Promise.all([
      app.api('/api/logistics/cash-closing/preview' + app.query(range)),
      app.api('/api/logistics/cash-closing' + app.query({ limit: 50 }))
    ])
      .then(function (responses) {
        app.clearErrors(rangeForm());
        rangeForm().querySelector('[name="dateFrom"]').value = responses[0].range.dateFrom;
        rangeForm().querySelector('[name="dateTo"]').value = responses[0].range.dateTo;

        renderPreview(responses[0]);
        renderClosings(responses[1]);
        return responses[0];
      })
      .catch(function (err) {
        if (err.data && err.data.fields) app.showErrors(rangeForm(), err.data.fields);
        el('[data-closing-expected]').textContent = '—';
        app.messageRow(el('[data-closing-body]'), COLUMNS, err.message);
        throw err;
      });
  }

  /* ---------------------------------------------------------- rogzites */

  function save() {
    var form = closingForm();
    var values = app.values(form);
    var range = currentRange();

    return app.submit(
      form,
      function () {
        return app.api('/api/logistics/cash-closing', {
          method: 'POST',
          body: {
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            actualAmount: values.actualAmount,
            note: values.note
          }
        });
      },
      'A kasszazárás rögzítve.'
    ).then(function () {
      form.reset();
      return load();
    });
  }

  /* ---------------------------------------------------------- indulas */

  app.register('closing', {
    init: function () {
      var range = rangeForm();

      range.addEventListener('submit', function (event) {
        event.preventDefault();
        load();
      });
      app.bindPresets(range);

      closingForm().addEventListener('submit', function (event) {
        event.preventDefault();
        save().catch(function () {
          /* a hibauzenetet az app.submit mar megmutatta */
        });
      });

      closingForm()
        .querySelector('[name="actualAmount"]')
        .addEventListener('input', updateDifference);
    },
    load: load
  });
})(window, document);
