/*
 * Vendégblokk nyomtatási nézet.
 *
 * A pincér felület áttekintő nézetéből nyílik új lapon, `?orderId=…`
 * paraméterrel. Egyetlen kérésből dolgozik
 * (`GET /api/waiter/orders/:id/receipt`), majd - ha az adat rendben megérkezett
 * - elindítja a böngésző natív nyomtatási párbeszédét.
 *
 * Nincs nyomtató-driver és nincs szerver oldali PDF-generálás: amit az
 * operációs rendszer nyomtatóként lát (hálózati vagy USB hőnyomtató), azzal
 * működik.
 *
 * TODO (16. szegmens - nyomtató-hiba kezelés): ha a fizikai nyomtató nem
 * érhető el, ide kerül a PDF-mentési alternatíva. A hely elő van készítve:
 * a `handlePrintFallback()` függvényben - ott derül ki, hogy a nyomtatás
 * elindult-e, és onnan lehet majd felajánlani a "Mentés PDF-be" utat.
 */
(function (window, document) {
  'use strict';

  var state = {
    receipt: null,
    printed: false
  };

  function el(selector) {
    return document.querySelector(selector);
  }

  function money(value) {
    return new Intl.NumberFormat('hu-HU').format(Math.round(value || 0)) + ' Ft';
  }

  function dateTime(iso) {
    return new Date(iso).toLocaleString('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function showError(message) {
    var box = el('[data-error]');
    box.textContent = message;
    box.hidden = false;
    el('[data-status]').hidden = true;
    el('[data-receipt]').hidden = true;
  }

  /* ------------------------------------------------------------ rajzolas */

  function renderItems(items) {
    var list = el('[data-items]');
    list.innerHTML = '';

    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'receipt-item';

      var head = document.createElement('div');
      head.className = 'receipt-item__head';

      var name = document.createElement('span');
      name.textContent = item.quantity + '× ' + item.name;

      var amount = document.createElement('span');
      amount.className = 'receipt-item__amount';
      amount.textContent = money(item.lineTotal);

      head.appendChild(name);
      head.appendChild(amount);
      row.appendChild(head);

      // Egységár külön sorban, hogy a hosszú tételnév ne tolja szét a sort.
      var unit = document.createElement('div');
      unit.className = 'receipt-item__unit';
      unit.textContent = money(item.unitPrice) + ' / adag';
      row.appendChild(unit);

      // Extrák "+" jellel, saját árral.
      item.extras.forEach(function (extra) {
        var line = document.createElement('div');
        line.className = 'receipt-item__extra';

        var extraName = document.createElement('span');
        extraName.textContent = '+ ' + extra.name;

        var extraAmount = document.createElement('span');
        extraAmount.textContent = money(extra.lineTotal);

        line.appendChild(extraName);
        line.appendChild(extraAmount);
        row.appendChild(line);
      });

      list.appendChild(row);
    });
  }

  function render(receipt) {
    var restaurant = receipt.restaurant;
    var order = receipt.order;
    var totals = receipt.totals;

    el('[data-restaurant-name]').textContent = restaurant.name;
    el('[data-restaurant-address]').textContent = restaurant.address;
    el('[data-restaurant-phone]').textContent = restaurant.phone;

    el('[data-receipt-number]').textContent = order.receiptNumber;

    if (order.tableLabel) {
      el('[data-table-label]').textContent = order.tableLabel;
      el('[data-table-row]').hidden = false;
    }
    if (order.waiterName) {
      el('[data-waiter-name]').textContent = order.waiterName;
      el('[data-waiter-row]').hidden = false;
    }

    renderItems(receipt.items);

    el('[data-subtotal]').textContent = money(totals.subtotal);

    if (totals.vatRate) {
      el('[data-vat-label]').textContent = 'ÁFA (' + totals.vatRate + '%)';
      el('[data-vat]').textContent = money(totals.vatAmount);
      el('[data-vat-row]').hidden = false;
    }
    if (totals.serviceFeeRate) {
      el('[data-service-label]').textContent = 'Szervizdíj (' + totals.serviceFeeRate + '%)';
      el('[data-service]').textContent = money(totals.serviceFeeAmount);
      el('[data-service-row]').hidden = false;
    }

    el('[data-total]').textContent = money(totals.total);

    if (restaurant.apCode) {
      el('[data-ap-code]').textContent = restaurant.apCode;
      el('[data-ap-row]').hidden = false;
    }
    el('[data-issued-at]').textContent = dateTime(receipt.issuedAt);
    el('[data-footer-message]').textContent = restaurant.receiptFooterMessage;

    el('[data-status]').hidden = true;
    el('[data-receipt]').hidden = false;
    document.title = 'Blokk ' + order.receiptNumber;

    applyPageHeight();
  }

  /**
   * A lap hossza a blokk tenyleges magassaga.
   *
   * Folytonos tekercsen a `@page { size: 80mm auto }` lenne a termeszetes, de a
   * Chrome az `auto` magassagot nem fogadja el, es ilyenkor Letter meretre esik
   * vissza - vagyis minden blokk fel lap papirt vinne el. Ezert a kirajzolt
   * blokkot megmerjuk, es abbol irjuk be a lap hosszat (kis ravagasi
   * rahagyassal).
   */
  function applyPageHeight() {
    var box = el('[data-receipt]').getBoundingClientRect();
    if (!box.height) return;

    // CSS-ben 1 hüvelyk = 96 px, 1 hüvelyk = 25,4 mm.
    var heightMm = Math.ceil((box.height / 96) * 25.4) + 4;

    var style = document.getElementById('page-size') || document.createElement('style');
    style.id = 'page-size';
    style.textContent = '@page { size: 80mm ' + heightMm + 'mm; margin: 0; }';
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------- nyomtatas */

  /**
   * A nyomtatas elinditasa. Csak akkor fut le, ha az adat mar a kepernyon van -
   * ures vagy hianyos blokk sosem megy a nyomtatora.
   */
  function print() {
    if (!state.receipt) return;
    state.printed = true;
    window.print();
  }

  /**
   * TODO (16. szegmens): ide kerul a nyomtato-hiba kezelese.
   *
   * A bongeszo nem arulja el, hogy a nyomtatas tenylegesen sikerult-e (csak
   * azt, hogy a parbeszed bezarult), ezert a 16. szegmensben itt fogjuk
   * felajanlani a PDF-mentest alternativakent - ugyanebbol a nezetbol, a
   * "Nyomtatas celja: Mentes PDF-be" uttal, illetve az ujraprobalkozast.
   */
  function handlePrintFallback() {
    /* egyelore nincs teendo - a hely a 16. szegmensnek van elokeszitve */
  }

  /* ------------------------------------------------------------ indulas */

  /** Vissza a pincér felületre: a nyomtatási lap bezárul. */
  function close() {
    // A window.open-nel nyitott lapot be tudjuk zarni; ha kozvetlenul nyitottak
    // meg (pl. cimsorbol), a bezaras nem engedelyezett - ilyenkor visszalepunk.
    window.close();
    window.setTimeout(function () {
      if (!window.closed) window.location.href = '/waiter';
    }, 250);
  }

  function start() {
    el('[data-print-again]').addEventListener('click', print);
    el('[data-close]').addEventListener('click', close);

    // A nyomtatasi parbeszed bezarasa utan a pincer visszater a felulethez.
    window.addEventListener('afterprint', function () {
      handlePrintFallback();
      if (state.printed) close();
    });

    var orderId = new URLSearchParams(window.location.search).get('orderId');
    if (!orderId) {
      showError('Hiányzik a rendelés azonosítója. Nyisd meg a blokkot a pincér felület áttekintő nézetéből.');
      return;
    }

    // A nyomtatasi lap a pincer felulet mellett nyilik: a mar tarolt tokent
    // hasznalja, bejelentkezo urlap nelkul.
    var token = window.AndOrderAuth.configure({ interface: 'waiter', storage: 'local' });
    if (!token) {
      showError('Nincs érvényes munkamenet. Jelentkezz be a pincér felületen, majd nyisd meg újra a blokkot.');
      return;
    }

    window.AndOrderAuth
      .request('/api/waiter/orders/' + orderId + '/receipt', { skipAuthRedirect: true })
      .then(function (data) {
        state.receipt = data.receipt;
        render(data.receipt);
        // Csak a sikeres betoltes utan indul a nyomtatasi parbeszed.
        window.setTimeout(print, 250);
      })
      .catch(function (err) {
        showError(err.message || 'A blokk adatai nem tölthetők be.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Fejlesztoi konzolbol es automatizalt ellenorzeskor is lekerdezheto allapot.
  window.AndOrderReceipt = { state: state, print: print };
})(window, document);
