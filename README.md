# And Order Here — étteremkezelő rendszer

**Egy étterem, egy rendszer, egy szerver.** A pincér, a konyha, a logisztika, a
vezetőség és az online rendelő vendég ugyanazt az adatot látja — ugyanabban a
pillanatban.

- **Minden felület egy helyen.** Rendelésfelvétel az asztalnál, konyhai sor a
  szakácsnak, készlet a logisztikának, kimutatások a vezetőségnek, önkiszolgáló
  rendelés a vendégnek — nem öt külön rendszer, hanem öt nézet ugyanarra.
- **Valós idejű, várakozás nélkül.** Ha az admin átrendezi a termet vagy egy
  tétel elfogy, az a pincér tabletjén azonnal látszik. Nincs frissítés gomb,
  nincs „nálam még a régi van".
- **Élő asztaltérkép.** A terem alaprajza pontosan úgy néz ki, ahogy a valóság:
  látszik, melyik asztal rendel, melyik kért számlát, melyik van lefoglalva, és
  hány online rendelés vár átvételre.
- **Üzemeltetni is öröm.** Egyetlen `npm start`, egyetlen Node.js folyamat,
  egyetlen port. Nincs adatbázis-szerver, nincs Redis, nincs üzenetsor — az
  adatok egy JSON fájlban élnek, ami menteni is egyszerű.
- **Tableten, telefonon, gépen.** Érintésre tervezett kezelés, PIN-kódos
  gyorsbelépés a pultnál, jelszavas belépés az irodában.

Technikailag: Node.js + Express + Socket.io, fájlalapú (lowdb/JSON) tárolás,
JWT-alapú bejelentkezés, natív HTML/CSS/JavaScript kliensek — külső frontend
keretrendszer nélkül. Eddig a projektváz, az adattárolási réteg, az
autentikáció, a valós idejű réteg, az admin menükezelés, az asztaltérkép-
szerkesztő, a pincér élő asztaltérképe, a rendelésfelvétel, az élő
státuszkövetés, a konyhai munkapult, a blokknyomtatás, az online vendégfelület,
a fizetési folyamat, a logisztikai pénzügyi áttekintő (forgalmi összesítő,
blokk-archívum, napi kasszazárás), a vezetőségi riportok, valamint a teljes
reszponzív és design-finomhangolás készült el; a készletkezelés és a beszerzés a
következő szegmensekben jön.

## Indítás

```bash
npm install
cp .env.example .env   # a .env nincs verziókezelve
npm start
```

Nincs szükség külön adatbázis-szerverre: az adatok egyetlen JSON fájlban élnek,
ami első indításkor automatikusan létrejön, és ha üres, a teszt adatok is
betöltődnek. A szerver alapértelmezés szerint a `http://localhost:3000` címen
fut (`npm run dev` ugyanez, `node --watch` automatikus újraindítással).

## npm scriptek

| Parancs | Leírás |
| --- | --- |
| `npm start` | szerver indítása |
| `npm run dev` | indítás fájlfigyeléssel (`node --watch`) |
| `npm run seed` | teszt adatok betöltése, ha még üres az adatbázis |
| `npm run seed:reset` | adatbázis ürítése és újratöltése |

## Felületek

| Útvonal      | Belépés | Szín |
| ------------ | ------- | ---- |
| `/`          | — (felületválasztó nyitólap) | sötét |
| `/waiter`    | PIN-kód (teszt: `1234`) | zöld |
| `/kitchen`   | PIN-kód (teszt: `2345`) | sárga |
| `/admin`     | email + jelszó | kék |
| `/logistics` | email + jelszó | világos |
| `/online`    | **nincs**, publikus felület | sötét |

## API végpontok

| Végpont | Jogosultság |
| --- | --- |
| `GET /health` | publikus, `{"status":"ok"}` |
| `POST /api/auth/login` | publikus — email + jelszó |
| `POST /api/auth/login-pin` | publikus — PIN-kód (`restaurantId` elhagyható, ha egy étterem van) |
| `POST /api/auth/logout` | publikus — JWT esetén szerver oldalon nincs teendő |
| `GET /api/auth/me` | bejelentkezés szükséges |
| `GET /api/auth/restaurants` | publikus — étteremválasztó a PIN-es képernyőhöz |
| `GET /api/waiter/tables` | csak `waiter` — az elrendezés (csak olvasás) |
| `GET /api/waiter/zones` | csak `waiter` — zónák |
| `GET /api/waiter/table-states` | csak `waiter` — szerveren számolt állapotok + online összesítő |
| `POST /api/waiter/reservations` | csak `waiter` — foglalás, `table:reserved` eseménnyel |
| `GET /api/waiter/tables/:id/reservations` | csak `waiter` |
| `GET /api/waiter/menu` | csak `waiter` — kategóriák, elérhető tételek, extrák |
| `GET /api/waiter/tables/:id/order` | csak `waiter` — az asztal nyitott rendelése |
| `GET /api/waiter/orders/:id` | csak `waiter` |
| `GET /api/waiter/online-orders` | csak `waiter` |
| `POST /api/waiter/orders` | csak `waiter` — rendelés leadása / bővítése |
| `PATCH /api/waiter/order-items/:id/served` | csak `waiter` — kiszolgálás jelölése (csak `ready` tételre) |
| `PATCH /api/waiter/orders/:id/serve-all-ready` | csak `waiter` — „Mindet kiszolgáltam" |
| `GET /api/waiter/orders/:id/receipt` | csak `waiter` — a vendégblokk adatai (csak kiszolgált rendelésre) |
| `GET /api/kitchen/orders` | csak `cook` — a munkapult (asztalonkénti blokkok, csak ételek) |
| `PATCH /api/kitchen/order-items/:id/status` | csak `cook` — leadva → készül → elkészült |
| `PATCH /api/kitchen/orders/:id/items-status` | csak `cook` — egy blokk tételei egyszerre |
| `GET /api/admin/restaurant` | csak `admin` — étterem alapadatok |
| `PUT /api/admin/restaurant` | csak `admin` — alapadatok mentése |
| `GET/POST /api/admin/menu-categories` | csak `admin` |
| `PUT/DELETE /api/admin/menu-categories/:id` | csak `admin` (törlés csak üres kategóriára) |
| `POST /api/admin/menu-categories/:id/move` | csak `admin` — sorrend fel/le |
| `GET/POST /api/admin/menu-items` | csak `admin` (`?categoryId=` szűrés) |
| `PUT/DELETE /api/admin/menu-items/:id` | csak `admin` |
| `PATCH /api/admin/menu-items/:id/availability` | csak `admin` — socket eseményt is küld |
| `GET/POST /api/admin/extras` | csak `admin` |
| `PUT/DELETE /api/admin/extras/:id` | csak `admin` |
| `GET/POST /api/admin/tables` | csak `admin` — asztalok |
| `PUT/DELETE /api/admin/tables/:id` | csak `admin` (`?force=true` a megerősített törléshez) |
| `GET/POST /api/admin/zones` | csak `admin` — zónák |
| `PUT/DELETE /api/admin/zones/:id` | csak `admin` |
| `GET /api/admin/users` | csak `admin` |
| `GET /api/admin/reports/top-items` | csak `admin` — legnépszerűbb tételek (`categoryId`, `limit`) |
| `GET /api/admin/reports/peak-hours` | csak `admin` — óránkénti forgalom |
| `GET /api/admin/reports/waiter-performance` | csak `admin` — pincérenkénti teljesítmény |
| `GET /api/admin/reports/kitchen-times` | csak `admin` — átlagos elkészítési idő (`categoryId`, `menuItemId`) |
| `GET /api/admin/reports/filter-options` | csak `admin` — kategóriák és tételek a szűrőkhöz |
| `GET /api/logistics/summary` | `logistics` vagy `admin` — forgalmi összesítő (`dateFrom`, `dateTo`) |
| `GET /api/logistics/orders` | ugyanaz — blokk-archívum, szűrhető és lapozható |
| `GET /api/logistics/orders/:id` | ugyanaz — a blokk olvasható változata + fizetések |
| `GET /api/logistics/filter-options` | ugyanaz — asztalok, pincérek, fizetési módok a szűrőhöz |
| `GET /api/logistics/cash-closing` | ugyanaz — korábbi kasszazárások |
| `GET /api/logistics/cash-closing/preview` | ugyanaz — a rendszer által várt készpénz |
| `POST /api/logistics/cash-closing` | ugyanaz — zárás rögzítése |
| `GET /api/online/restaurant` | publikus — a vendégnek szóló alapadatok (név, cím, telefon) |
| `GET /api/online/menu` | publikus — kategóriák és csak elérhető tételek |
| `GET /api/online/extras` | publikus — kiegészítők |
| `POST /api/online/orders` | publikus — vendég rendelés (`guestName` + kosár) |
| `GET /api/orders/:id/payments` | pincér/admin, vagy vendég **online** rendelésre — fizetési állapot |
| `POST /api/orders/:id/payments` | ugyanaz — fizetés rögzítése |

Hitelesítés: `Authorization: Bearer <token>` fejléc. Token nélkül `401`,
rossz szerepkörrel `403` a válasz.

## Autentikáció

- **Jelszó és PIN**: mindkettő bcrypt hash-ként tárolódik, nyílt érték sehol nem
  marad. A PIN 4–6 számjegy; mivel hashelve van, a belépés az étterem PIN-es
  felhasználóin megy végig hash-összehasonlítással.
- **Munkamenet**: JWT token, `userId` + `role` + `restaurantId` payloaddal,
  a `JWT_SECRET`-tel aláírva. Nincs szerver oldali session-tároló.
- **Élettartam**: pincér/szakács `JWT_EXPIRES_STAFF` (alapértelmezés 12 óra,
  tableten ritkább újrabelépés), admin/logisztika `JWT_EXPIRES_ADMIN` (2 óra).
- **Token tárolás**: pincér/szakács `localStorage`, admin/logisztika
  `sessionStorage` (a lap bezárásával törlődik).
- **Szerepkör a tárolt adatból jön**: a token payloadja nem írja felül, és
  minden kérésnél ellenőrizzük, hogy a fiók még létezik és aktív — egy
  deaktivált felhasználó tokene azonnal érvénytelen.
- **Brute force ellen**: memóriában tartott próbálkozás-korlátozás
  (5 rossz jelszó, illetve 8 rossz PIN után átmeneti tiltás, `429` válasszal).

Rétegzés: az `authService` kizárólag a repository rétegen keresztül ér adatot,
így SQL adatbázisra váltáskor csak a repository réteget kell lecserélni — a
jelszó-ellenőrzés, a token-kezelés és a middleware változatlan marad.

## Admin felület

A `/admin` hét fülre bomlik:

| Fül | Mit tud |
| --- | --- |
| Étterem beállításai | név, cím, telefon, ÁFA %, szervizdíj %, AP kód, nyugta lábléc — mezőnkénti hibajelzéssel |
| Kategóriák | hozzáadás, átnevezés, típus (étel / ital / egyéb), sorrend fel/le, törlés (csak üres kategória) |
| Menütételek | kategóriánként csoportosítva; név, ár, kategória, allergének (14 EU-s allergén checkboxként), elérhető/elfogyott kapcsoló; hozzáadás, szerkesztés, törlés |
| Extrák | kiegészítők hozzáadása, szerkesztése, törlése |
| Asztaltérkép | vizuális szerkesztő: asztalok mozgatása, méretezése, forgatása, zónák kijelölése |
| Felhasználók | lista (szerkesztés későbbi szegmensben) + valós idejű eseménynapló |
| Riportok | vezetőségi statisztikák: legnépszerűbb tételek, forgalmi csúcsidőszakok, pincérenkénti teljesítmény, konyhai elkészítési idők — lásd a [Vezetőségi riportok](#vezetőségi-riportok) szakaszt |

Az elérhetőség kapcsoló váltása `menu_item:availability_changed` socket eseményt
küld a `server/sockets/emitters.js`-en keresztül, így a pincér és az online
felület azonnal értesül róla. Ugyanez történik, ha a tétel szerkesztésekor
változik az elérhetőség.

Rétegzés: a route-ok vékonyak, minden üzleti szabály és validáció a
`server/services/restaurantService.js` és `menuService.js` fájlokban van, amik
kizárólag a repository interfészen keresztül érnek adatot.

### Asztaltérkép szerkesztő

Rácsos vászon, amin az asztalok egérrel és érintéssel (tableten is) mozgathatók,
a sarkukkal méretezhetők, a felső fogantyúval forgathatók; a címke és a komment
az oldalsó panelen szerkeszthető. Minden művelet a lezárásakor (`pointerup`)
mentődik a szerverre, nem minden pixelnyi mozgásnál. Nyílbillentyűkkel
finomhangolható a pozíció, `Delete` töröl, `Escape` megszünteti a kijelölést.
A rácsra illesztés (10 px, forgatásnál 15°) `Shift` lenyomásával kikapcsolható.

A „Zóna kijelölés” móddal a vászonra húzva jelölhető ki egy terület — ide kerül
majd az online rendelések autó ikonja. A zónák félig átlátszó, szaggatott
körvonalú területként jelennek meg, jól elkülönülve az asztaloktól.

Megvalósítás: **DOM + CSS transform**, nem Canvas — az indoklás a
`public/admin/floorPlan.js` fejlécében olvasható (találat-vizsgálat, szöveges
címkék, fogantyúk, billentyűzet-elérhetőség mind ingyen jön a DOM-mal, és pár
tucat asztalnál a canvas rajzolási előnye nem számít). A zónák tetszőleges
sokszögek lehetnek, ezért azok egy SVG rétegen jelennek meg az asztalok alatt.
Külső drag-and-drop könyvtár nincs: az egeret és az érintést közös Pointer
Events kezeli.

Minden asztal- és zónaváltozás `table:layout_changed` socket eseményt küld a
pincér és az admin szobába, hogy a nyitva lévő asztaltérkép frissülhessen.

Asztal törlésekor, ha van hozzá nyitott rendelés vagy jövőbeli foglalás, a
szerver `409`-cel válaszol a részletekkel; a felület ebből kérdez rá, és
megerősítés után `?force=true`-val törli (a foglalások is vele mennek).

**ÁFA és szervizdíj százalékban tárolódik** (27 = 27%), 0 és 100 közötti érték
lehet. Régebbi, arányként (0.27) tárolt adatot a séma-migráció induláskor
automatikusan átszámol — lásd `server/db/defaultData.js`.

## Környezeti változók

A `.env.example` tartalmazza az összes változót:

| Változó        | Leírás                                        |
| -------------- | --------------------------------------------- |
| `NODE_ENV`      | futtatási környezet (`development` / `production`) |
| `PORT`          | HTTP port (alapértelmezés: 3000)              |
| `DATA_FILE`     | a JSON adatfájl útvonala (alapértelmezés: `server/db/data.json`) |
| `SEED_ON_EMPTY` | üres adatbázisnál induláskor betölti a teszt adatokat (alapértelmezés: `true`) |
| `JWT_SECRET`    | a JWT tokenek aláírókulcsa — enélkül a bejelentkezés nem működik |
| `JWT_EXPIRES_STAFF` | pincér/szakács token élettartama (alapértelmezés: `12h`) |
| `JWT_EXPIRES_ADMIN` | admin/logisztika token élettartama (alapértelmezés: `2h`) |
| `CORS_ORIGIN`   | engedélyezett origin az API / Socket.io számára |
| `DATABASE_URL`  | későbbi külső adatbázishoz fenntartva, a JSON tárolás nem használja |

## Adattárolás

Fájlalapú (JSON) tárolás [lowdb](https://github.com/typicode/lowdb)-vel, külön
adatbázis-szerver nélkül. A teljes adathalmaz induláskor memóriába kerül, az
olvasások onnan mennek, és minden módosítás azonnal fájlba is mentődik — az
írások egy mutexen keresztül, hogy párhuzamos kérések se sértsék meg a fájlt.

A route-ok és socket handlerek soha nem nyúlnak közvetlenül a JSON-hoz, csak a
repository rétegen keresztül:

```js
const { orderRepository } = require('../db');

const { order, items } = await orderRepository.createOrderWithItems(
  { restaurantId, tableId, waiterId },
  [{ menuItemId, quantity: 2, comment: 'csípősen', extraIds: [extraId] }]
);
```

A kollekciók, mezők és kapcsolatok leírása: [SCHEMA.md](SCHEMA.md).

### Teszt adatok

`npm start` (vagy `npm run seed`) üres adatbázisnál betölt egy teszt éttermet:
6 asztal, 2 zóna, 3 kategória, 15 menütétel allergénekkel, 4 extra és 4
felhasználó.

| Belépés | Adat |
| --- | --- |
| admin | `admin@andorderhere.local` / `admin123` |
| pincér | PIN `1234` |
| szakács | PIN `2345` |
| logisztika | `logisztika@andorderhere.local` / `logi123` (PIN: `3456`) |

## Mappastruktúra

```
server/
  routes/
    health.js     állapotjelző
    api/          JSON API: auth + felületenkénti, szerepkörhöz kötött routerek
    index.js      route regisztráció, statikus mountok, hibakezelő
  services/
    authService.js        bejelentkezés, token kiadás és ellenőrzés
    restaurantService.js  étterem alapadatok + validáció
    menuService.js        kategóriák, étlap tételek, extrák + üzleti szabályok
    floorPlanService.js   asztalok és zónák + törlésvédelem
    floorStateService.js  asztalállapotok és online összesítő (pincér nézet)
    reservationService.js foglalás validációval és ütközés-ellenőrzéssel
    orderService.js       rendelésfelvétel: étlap, kosár validáció, leadás
    kitchenService.js     konyhai munkapult: ételblokkok, állapotléptetés
    receiptService.js     vendégblokk összeállítása (ÁFA, szervizdíj, végösszeg)
    paymentService.js     fizetés rögzítése, fizetettségi állapot, lezárás
    logisticsService.js   forgalmi összesítő, blokk-archívum, kasszazárás
    reportService.js      vezetőségi riportok: top tételek, csúcsórák, teljesítmény
  middleware/
    requireAuth.js  JWT ellenőrzés az Authorization fejlécből
    requireRole.js  szerepkör szerinti szűrés
  sockets/
    index.js      Socket.io init, JWT handshake, szobába sorolás
    emitters.js   kibocsátó réteg (a route/service ezt hívja)
  db/
    db.js           lowdb példány, in-memory cache, mutexszel védett mentés
    defaultData.js  üres séma + hiányzó kollekciók pótlása
    ids.js          nanoid alapú id-generálás entitás-előtagokkal
    seed.js         teszt adatok
    repositories/   entitásonként egy modul (soha nem nyers JSON)
    index.js        connect/disconnect + repository export
  utils/
    password.js     bcrypt jelszó- és PIN-hash
    rateLimiter.js  memóriában tartott próbálkozás-korlátozás
    dateRange.js    közös időszak-feloldás (helyi idő szerinti naphatárok)
    validation.js   mezőnkénti validáció, tipizált hibák (400/404/409)
  config.js     .env alapú konfiguráció
  index.js      belépési pont
public/
  logistics/
    index.html  fülek: áttekintés, blokk-archívum, napi zárás
    app.js      közös mag: fülek, API hívás, dátum- és pénzformázás
    dashboard.js  forgalmi összesítő kártyák és mód szerinti bontás
    orders.js     szűrhető archívum + olvasható blokk oldalsó panelen
    closing.js    kasszazárás: várt egyenleg, eltérés, korábbi zárások
    logistics.css fehér-fekete, adatközpontú stílus
  online/
    index.html  vendég étlap, kosár, visszaigazolás
    app.js      menü, kosár, leadás, téma váltás
    online.css  mobil-first, világos/sötét témás vendég stílus
  kitchen/
    index.html  konyhai munkapult (blokkok, léptető gombok)
    app.js      betöltés, valós idejű frissülés, állapotléptetés
    kitchen.css sárga-fekete, nagy elemes konyhai stílus
  waiter/
    index.html  asztaltérkép, menü, foglalás
    floorMap.js Canvas rajzoló (nagyítás, pásztázás, találat-vizsgálat)
    app.js      betöltés, valós idejű frissítés, foglalás
    order.js    rendelésfelvétel: étlap, kosár, testreszabás, leadás
    orderStatus.js  rendelés-áttekintő: állapotkövetés, kiszolgálás jelölése
    receipt-print.html / receipt-print.js / receipt.css   nyomtatható vendégblokk
    waiter.css  pincér-specifikus stílus
  admin/
    index.html  fülek: étterem, kategóriák, tételek, extrák, felhasználók
    app.js      közös mag: fülek, API hívás, űrlap- és hibakezelés
    restaurant.js  menu.js  extras.js  users.js   nézetenkénti modulok
    reports.js     vezetőségi riportok natív SVG diagramokkal
    floorPlan.js   vizuális asztaltérkép szerkesztő
    admin.css  floor-plan.css   admin-specifikus stílus
  shared/
    auth.js         bejelentkezés, token tárolás, fetch wrapper
    socketClient.js Socket.io kapcsolat, újracsatlakozás, állapotjelző
    eventLog.js     beérkező események megjelenítése a felületen
    uiState.js      közös betöltési és hibaállapot újrapróbálkozással
  assets/     közös CSS
  index.html  felületválasztó
shared/
  constants.js      szerver és böngésző által is használt konstansok
  socketEvents.js   Socket.io esemény- és szobakatalógus
```

## Pincér felület — élő asztaltérkép

A `/waiter` felületen a pincér ugyanazt az elrendezést látja, amit az admin
kialakított, **natív HTML5 Canvas**-ra rajzolva (külső könyvtár nélkül):

| Jelzés | Jelentés |
| --- | --- |
| semleges szürke | szabad asztal |
| zöld | rendelés alatt (nyitott, még nem fizetett rendelés) |
| borostyán | számlát kért (a 8. szegmens előkészítése) |
| óra ikon | lefoglalva — a foglalás ideje a menüben |
| autó ikon a zónában | feldolgozásra váró online rendelés, darabszámmal |

**Az állapotot mindig a szerver számolja** (`GET /api/waiter/table-states`) a
nyitott rendelésekből és a foglalásokból — a kliens nem találgat.

Asztalra koppintva menü nyílik: *Rendelés felvétele* (a 7. szegmensben készül
el) és *Asztal lefoglalása* — utóbbi dátum- és időpontválasztóval, a végét a
választott időtartamból számolva. A foglalás `table:reserved` eseményt küld, így
minden nyitva lévő pincér-nézet azonnal látja.

A térkép **egérrel és ujjal is kezelhető**: húzással pásztázható, két ujjal
(pinch) vagy a +/− gombokkal nagyítható, az „Illesztés" gomb a teljes termet a
képernyőre igazítja. A `table:status_changed`, `table:reserved`, `order:created`
és `table:layout_changed` eseményekre a nézet magától frissül — oldalfrissítés
nélkül, kis adatú újralekérdezéssel.

### Rendelésfelvétel

Az asztalra (vagy az online autó ikonra) koppintva a *Rendelés felvétele*
teljes képernyős, tablet-barát nézetet nyit:

- **kategória-fülek** (Ételek / Italok / Egyéb) és nagy tételkártyák névvel,
  árral és allergén jelzéssel — csak az `isAvailable: true` tételek,
- **testreszabó panel** minden tételhez: mennyiség ± gombokkal, szabad szöveges
  megjegyzés és kiegészítők a saját felárukkal — az ár azonnal frissül,
- **kosár**, amiben a tételek szerkeszthetők és törölhetők a leadásig,
- **„Már leadva" lista**: a rendelés meglévő tételei, mindegyiknél **ki adta le
  és mikor**, az aktuális állapotával (leadva / készül / kész / kiszolgálva).

Leadáskor a szerver **nem nyit párhuzamos rendelést** ugyanahhoz az asztalhoz:
ha van nyitott rendelés, az új tételek ahhoz kerülnek. Új rendelésnél
`order:created`, meglévő bővítésénél `order_item:added` esemény megy a pincér-,
konyhai és admin szobába — erre épül majd a konyhai felület. Minden új tétel
`pending` állapotban indul.

A kosár a leadásig a böngészőben (`localStorage`) is megmarad: hálózati hiba
esetén nem vész el, a leadás egy gombnyomással újrapróbálható.

### Élő státuszkövetés és kiszolgálás

Az asztal menüjéből (*Rendelés áttekintése*), vagy a rendelésfelvételből az
*Áttekintés* gombbal nyílik a rendelés-áttekintő. Itt az asztal **minden eddig
leadott tétele** szerepel, állapot szerint csoportosítva — elöl az, amivel
dolga van a pincérnek:

| Állapot | Jelölés |
| --- | --- |
| `pending` — leadva | semleges szürke, óra ikon |
| `preparing` — készül | borostyán kiemelés, főzőkalap ikon |
| `ready` — elkészült | élénkzöld sáv és csengő ikon, rövid felvillanás |
| `served` — kiszolgálva | elhalványított, lezárt tétel |

Minden soron látszik a név, a mennyiség, az extrák (`+` jelöléssel), a
megjegyzés, a **leadó pincér neve és a leadás ideje**, kiszolgálás után pedig a
kivitel időpontja is.

A tételek állapotát **a konyha állítja** (9. szegmens) — a pincér felület csak
megjeleníti. Az `order_item:status_changed` eseményre a nyitott nézetek azonnal
frissülnek, újratöltés nélkül. Ha egy tétel elkészül, a pincér akkor is
észreveszi, ha épp az asztaltérképet nézi:

- az asztalon **csengő jelvény** jelenik meg a várakozó tételek számával,
- rövid, tágulú gyűrű villan fel az asztal körül a Canvas térképen,
- értesítés (toast) írja ki, mi készült el és melyik asztalhoz,
- diszkrét hangjelzés szól — a fejlécben ki-be kapcsolható, a beállítás a
  készüléken marad.

Elkészült tételnél megjelenik a **Kiszolgálva** gomb, több készétel esetén a
**Mindet kiszolgáltam** gyorsgomb. A szerver csak `ready` állapotú tételt enged
kiszolgáltnak jelölni (különben `409 item_not_ready`), rögzíti a `servedAt`
időbélyeget, és tételenként küldi az `order_item:served` eseményt.

Amikor a rendelés **minden tétele kiszolgált**, a *Nyomtatás* gomb aktívvá
válik. Ezt a szerver számolja (`allItemsServed` mező a rendelés válaszában és az
asztal állapotában), nem a kliens találgatja a listából.

### Vendégblokk nyomtatása

A *Nyomtatás* gomb új lapon nyitja meg a nyomtatási nézetet
(`/waiter/receipt-print.html?orderId=…`), az betölti a blokk adatait, és — ha
minden rendben — magától elindítja a böngésző nyomtatási párbeszédét. A
párbeszéd bezárása után a lap bezárul, a pincér ott folytatja, ahol abbahagyta.

Nincs nyomtató-driver és nincs szerver oldali PDF-generálás: `window.print()`
fut, így bármelyik nyomtatóval működik, amit az operációs rendszer lát —
hálózati vagy USB hőnyomtatóval éppúgy, mint egy A4-es lézernyomtatóval.

A blokk tartalma (`GET /api/waiter/orders/:id/receipt`):

- **fejléc**: étterem neve, címe, telefonszáma (admin felület, 4. szegmens),
  a rendelés azonosítója, az asztal és a kiszolgáló pincér neve,
- **törzs**: tételenként mennyiség, név, egységár és tételösszeg, alatta az
  extrák `+` jellel, saját árral — **konyhai kommentek nélkül**,
- **összesítés**: részösszeg, ÁFA, szervizdíj (mindkettő a beállított kulccsal
  felirtatva), majd a fizetendő,
- **lábléc**: AP kód, a kiállítás dátuma és pontos ideje, és a beállított záró
  üzenet (alapérték: `– And-Order-Here –`).

**A rendelés azonosítója** (`orders.receiptNumber`) a rendelés létrehozásakor
születik, hatjegyű, és nem változik: az újranyomtatott blokkon is ugyanaz
szerepel. A pincér az áttekintő fejlécében is látja (`#123456`).

**Csak kiszolgált rendelésre**: amíg van készülő vagy kint lévő tétel, a végösszeg
még változhat, ezért a végpont `409 order_not_served` hibát ad. A gomb is tiltott
ilyenkor, de a szerver a lekéréskor újra ellenőrzi.

**Árak értelmezése**: az étlapon szereplő ár a **nettó** egységár, az ÁFA és a
szervizdíj erre rakódik rá (`részösszeg + ÁFA + szervizdíj = fizetendő`), a
szervizdíj alapja a nettó részösszeg. Mindkét kulcsot az admin állítja.

**Papírméret**: a blokk 72 mm széles (80 mm-es tekercsen ennyi a nyomtatható
sáv; 203 dpi-n 576 pont, CSS-ben ≈272 px). A lap hosszát a nézet a kirajzolt
tartalomból számolja és írja be a `@page` szabályba — így egy rövid blokk nem
visz el fél lap papírt.

**Hibakezelés**: hálózati hiba, lejárt munkamenet vagy ki nem szolgált rendelés
esetén beszédes üzenet jelenik meg, és a nyomtatási párbeszéd **el sem indul** —
üres vagy hiányos blokk nem mehet a nyomtatóra.

## Konyhai munkapult

A `/kitchen` felület a szakács munkapultja: kártyarácsban mutatja a még
elkészítendő ételeket, blokkonként (egy asztal = egy kártya).

**Csak ételek.** A munkapultra kizárólag azoknak a tételeknek kell kikerülniük,
amelyek étel kategóriába tartoznak — az italokkal és az egyéb tételekkel a
konyhán nincs teendő. A szűrés a kategória `kind` mezőjén megy (`food` / `drink`
/ `other`), **nem a kategória nevén**: így egy átnevezés vagy egy új
étel-kategória (például „Levesek") nem hagyja ki az ételeket a konyhai sorból. A
típus az admin felület Kategóriák fülén állítható, új kategória alapértelmezetten
étel.

**A blokk felépítése**: felül a jelölés és a rendelés kora, alatta soronként a
tétel neve és mennyisége (`Hamburger ×2`), a kiegészítők `+` jellel, majd a blokk
alján a vendégkommentek — soronként, idézőjelben. Az állapotot szín és ikon is
jelöli: leadva semleges szürke (óra), készül sárga (fazék), elkészült zöld
(csengő), kiszolgálva elhalványítva (pipa).

**Az online rendelés ugyanolyan blokk, mint bármelyik asztalé**: a szakács
szemszögéből nincs jelentősége, hogy honnan jött. A válaszban nincs `type` mező,
és a felirat is ugyanolyan formátumú rövid kód (`R-01`, naponta újrainduló
sorszámmal), mint az asztaljelölés — semmi nem utal az online eredetre.

**Állapotléptetés**: tételenként egy nagy gomb (*Indítás*, majd *Kész*), illetve
blokk szinten *Mind indítása* / *Mind elkészült*. A tömeges léptetés csak előre
lép: a már elkészült tétel nem esik vissza a tűzhelyre. Minden váltás
`order_item:status_changed` eseményt küld, amit a pincér felület már fogad —
ezzel a konyha → pincér lánc élesben zárul: az „elkészült” jelzés azonnal
megjelenik a pincér asztaltérképén.

**Élő frissülés**: új rendelés (`order:created`) és új tétel (`order_item:added`)
magától megjelenik a munkapulton, a kiszolgált tétel (`order_item:served`)
elhalványodik, majd az utolsó tétel kiszolgálásával a blokk elfogy a nézetből.

**Időbélyeg**: `preparing` állapotba lépéskor rögzül a tétel
`preparingStartedAt` mezője, a felület pedig diszkréten kiírja („5 perce
készül"). Erre épül majd a 16. szegmens időtúllépés-riasztása.

A felület tablet és fali monitor méretre is optimalizált: kártyarács, nagy
betűk, legalább 48 px magas gombok — párás, mozgás közbeni pillantásra tervezve.

## Online rendelés (vendégfelület)

A `/online` **bejelentkezés nélkül**, bárki számára elérhető. A vendég
kategóriák szerint böngészi az étlapot, kosárba tesz, majd a nevét megadva
leadja a rendelést.

**Ugyanaz az étlap, egy forrásból.** A `GET /api/online/menu` a
`menuService.getAvailableMenu()` függvényt hívja — ugyanazt, amit a pincér
felület rendelésfelvétele is —, így nem tud szétcsúszni, hogy melyik felületen
mi számít elérhető tételnek. Az admin által elfogyottra állított tétel azonnal
eltűnik a vendég étlapjáról is (`menu_item:availability_changed` socket
eseményre, újratöltés nélkül).

**Kosár**: mennyiség, szabad szöveges megjegyzés és kiegészítők felárral —
ugyanaz a logika, mint a pincér kosarában, vendégbarát felülettel. A kosár a
leadásig `localStorage`-ban is megmarad, és a lebegő kosárgomb mindig mutatja a
tételszámot és az összeget.

**Vendégadat**: csak a **név** kötelező, hogy a kiszolgáló kollégának legyen
mihez kötnie a rendelést. E-mail és telefonszám bekérése — és a hozzá tartozó
adatkezelési tájékoztató — a 16. szegmens GDPR alpontjában készül el; a kódban
ez `TODO` kommenttel jelölve van.

**Leadás után** a rendelés `type: online`, `tableId: null`, a tételek `pending`
állapotban, és ugyanaz az `order:created` esemény megy ki, mint a pincéri
leadásnál. Ezért a térkép autó ikonja (6. szegmens) és a konyhai munkapult
(9. szegmens) **változtatás nélkül** kezeli az online rendelést — a szakács
pedig nem látja, hogy online eredetű. A vendég visszaigazoló képernyőt kap: a
rendelés összegzését, a **hatjegyű azonosítót** (ugyanaz, ami a blokkra kerül) és
a várakozásról szóló üzenetet.

**Fizetés**: a visszaigazoláson ott a *Tovább a fizetéshez* gomb; a tényleges
fizetési folyamat a 12. szegmensben készül el, itt egyelőre a helyét jelzi.

**Design**: mobil-first (a vendégek jellemzően telefonról nyitják meg),
világos/sötét témaváltóval — a választás `localStorage`-ba kerül, és már a
rajzolás előtt érvényre jut, hogy ne villanjon fel a másik téma. Az
érintőfelületek legalább 44 px magasak, a kosár pedig alulról felcsúszó lapon
érhető el.

**Publikus írás korlátozva**: a `POST /api/online/orders` kliensenként (IP)
korlátozott (5 percenként 12 rendelés), hogy egy kliens ne tudja elárasztani a
konyhát.

## Fizetés

A fizetés **rendelés szintű**, mindkét oldalról ugyanaz a végpont:
`POST /api/orders/:id/payments`. Ezért nem a `/api/waiter` vagy `/api/online` alá
került — a pincér (bejelentkezve) és a vendég (az online pénztárból,
bejelentkezés nélkül) is ezt hívja, így a fizetés egy helyen, egyfajta szabály
szerint rögzül.

**Nincs valódi fizetési szolgáltató bekötve.** A kártyás / SZÉP kártyás /
kuponos fizetés itt annyit jelent, hogy rögzítjük a **fizetés módját és
összegét** — a tényleges tranzakció a helyszínen, kártyaterminálon történik. A
hely elő van készítve: egy későbbi szegmensben a `paymentService.recordPayment`
elé kerülhet a szolgáltató (SimplePay, Barion, Stripe) hívása, és csak a sikeres
tranzakció után kell menteni a rekordot.

**Adatmodell.** A `payments` kollekció rekordjai (`orderId`, `method`, `amount`,
`paidAt`). Egy rendeléshez **több fizetés is tartozhat** — részben kártya,
részben készpénz —, ezért az összegeket mindig összegezve nézzük. A rendelés
`paymentStatus` mezője akkor vált `paid`-re, ha a befizetések elérik a
végösszeget (ÁFÁ-val és szervizdíjjal együtt, ugyanabból a számításból, amiből a
blokk készül). Az összeg elhagyható a kérésben — alapértelmezésben a teljes
hátralék —, de megadható kevesebb (részfizetés) és több is (a borravaló későbbi
kezeléséhez).

**A fizetettség külön a rendelés életciklusától.** A `paymentStatus` nem
ugyanaz, mint az `order.status`: egy online rendelést a vendég már a leadáskor
kifizethet, miközben a konyhának még dolga van vele. A rendelés akkor zárul le
(`status: paid`, az asztal felszabadul, a nyitottak közül kikerül), ha
**kifizették és minden tételét kiszolgálták** — ezt a `closeIfSettled` figyeli,
és a fizetés, illetve az utolsó kiszolgálás egyaránt kiválthatja.

**Jogosultság.** Bejelentkezett pincér és admin a saját étterme bármelyik
rendelését fizettetheti. Bejelentkezés nélkül **kizárólag online rendelés**
érhető el, és csak a rendelés azonosítójának ismeretében — az azonosító nanoid
(kitalálhatatlan), és a vendég a saját leadása után kapja meg, vagyis maga az id
a belépő. A publikus írás IP-nként korlátozott.

### Pincér oldal

A rendelés-áttekintőben jelvény mutatja a fizetettséget (*Fizetésre vár · összeg*
vagy *Kifizetve · összeg · mód*), mellette a **Fizetés rögzítése** gomb. A
választó nagy, egyértelmű gombokkal kínálja az öt módot (bankkártya, SZÉP kártya,
kupon, készpénz, utólagos ATM), az összeg pedig előre kitöltve, de átírható.

**Nyomtatás előtti emlékeztető**: ha a rendelés még nincs kifizetve, a
*Nyomtatás* gomb először figyelmeztet — de nem tilt: onnan lehet fizetést
rögzíteni, vagy „Nyomtatás mindenképp" gombbal továbbmenni. Életszerű, hogy néha
fordított a sorrend.

### Online pénztár

A *Tovább a fizetéshez* gomb a **Pénztár** nézetet nyitja: a rendelés
összegzése, a szerverről kért végösszeg (részösszeg + ÁFA + szervizdíj), és a
fizetési módok — bankkártya, SZÉP kártya, kupon, valamint egy egyértelműen
jelölt **„Fizetés a helyszínen (készpénz vagy ATM)"** opció. Kártyás/SZÉP/kupon
választásnál a felület jelzi, hogy **szimulált** visszaigazolásról van szó.
Sikeres rögzítés után a vendég visszaigazolást lát: rendelés azonosító, fizetett
összeg és fizetési mód.

## Vezetőségi riportok

Az admin felület **Riportok** füle négy kérdésre válaszol egy nézetben, **közös
dátumtartomány-választóval** (alapértelmezés: az elmúlt 7 nap, gyors gombok:
*Ma*, *Tegnap*, *7 nap*, *30 nap*). A négy lekérdezés párhuzamosan indul és
együtt frissül — a vezetőnek egy dátumot kell beállítania.

**Nincs külön riport-tábla.** Minden szám a már meglévő `orders`, `orderItems`,
`menuItems` és `users` kollekciókból számolódik ki, a lekérdezés pillanatában, a
repository rétegen keresztül. Ezen az adatmennyiségen ez gyorsabb és egyszerűbb,
mint előre számolt összesítőket karbantartani — és nem tud elavulni.

Két döntés minden riportra érvényes:

- a **sztornózott** rendelések mindenhonnan kimaradnak (nem fogytak el, nem
  hoztak bevételt, a konyhai idejük sem érvényes);
- a **bevétel bruttó** — ugyanaz a szám, amit a vendég fizet, és amit a blokk,
  illetve a logisztikai összesítő mutat. A számítás a
  `receiptService.calculateTotals`-ból jön, hogy egyetlen helyen legyen
  definiálva. Az ÁFA- és szervizdíj-kulcs az étterem **aktuális** beállítása, így
  egy kulcsváltoztatás visszamenőleg is átszámolja a régi időszakokat — a
  rendszer nem tárol kulcs-történetet.

### Legnépszerűbb tételek

Menütételenként az eladott darabszám és a bevétel, csökkenő sorrendben, opcionális
kategóriaszűrővel. Rangsorolt lista vízszintes sávokkal; a sorok alatt a
kategória, az egységár és az is, hány **külön rendelésben** szerepelt a tétel —
ebből látszik, hogy tényleg széles körben népszerű-e, vagy csak egy nagy rendelés
vitte fel.

### Forgalmi csúcsidőszakok

Óránkénti bontás (0–23) a rendelés felvételének **helyi idő** szerinti órája
alapján — ez a személyzet beosztásának tervezéséhez használható érték. Mind a 24
óra megjelenik akkor is, ha üres, így látszik a zárva tartás, és a tengely nem
csúszik össze két nap között. A csúcsóra ki van emelve és névvel szerepel a
fejlécben; egy kapcsolóval a rendelésszám és a bevétel között lehet váltani
(újabb kérés nélkül, a válasz mindkettőt tartalmazza).

### Pincérenkénti teljesítmény

Kiszolgált rendelések száma, tételszám, bevétel, átlagos kosárérték és átlagos
rendelés-lezárási idő (a rendelés felvétele és az **utolsó** tétel kiszolgálása
között eltelt idő). A táblázat oszlopfejlécre kattintva rendezhető.

A lezárási idő csak a **teljesen kiszolgált** rendelésekből számol: egy még
nyitott asztal ideje folyamatosan nőne, és elhúzná az átlagot. A cella
buboréksúgója megmutatja, hány lezárt rendelésből jött az átlag — mintaszám
nélkül egy átlag félreérthető. Az online rendelésekhez nem tartozik pincér, ezért
nem szerepelnek ebben a riportban.

### Átlagos konyhai elkészítési idő

A `preparingStartedAt` és a `readyAt` közötti idő menütételenként és
kategóriánként, mintaszámmal, leggyorsabb és leglassabb méréssel — a leglassabb
tétel van elöl, mert azt kell optimalizálni.

Csak azok a tételek adnak mintát, amelyeknél **mindkét** időbélyeg megvan: a
mérés bevezetése előtt felvett tételekhez nincs `readyAt` (nem állítható helyre),
és a még készülő tétel ideje sem végleges. A válasz `missingSampleCount` mezője
megmutatja, hány eladott tételsor maradt így ki — a felület ezt ki is írja, hogy
az átlag megbízhatósága látszódjon. Egy perc alatti mérés másodpercben jelenik
meg: a „0 perc" úgy nézne ki, mintha nem lenne adat.

### Diagramok külső könyvtár nélkül

A projekt egyetlen kliens oldali függőséget sem tölt be CDN-ről, és nincs
bundler sem. Egy diagram-könyvtár bevezetése vagy új CDN-függést, vagy egy
~200 KB-os vendor fájlt jelentene a repóban — négy egyszerű ábráért. Az
adatmennyiség pici (24 oszlop az óradiagramon, 10 sor a rangsorban), ehhez nem
kell rajzolómotor: az óradiagram natív `<svg>` téglalapokból áll, a rangsor pedig
tiszta HTML + CSS sávokból. Így a diagram az admin felület témáját (kék-fekete,
CSS változók) közvetlenül örökli, és nagyítva is éles marad.

Egy részlet, ami könnyen elromlik: az oszlopok nyújtott koordinátarendszerben
rajzolódnak (`preserveAspectRatio="none"`), hogy kitöltsék a szélességet — ez a
szöveget is vízszintesen nyújtaná, ezért az óratengely feliratai HTML-ben
készülnek az SVG alatt.

### Teljesítmény

Minden riport először **időszakra szűr a repository rétegben**
(`orderRepository.getBetween`, `orderItemRepository.getBetween`), és csak a
találatokhoz tölti be a kapcsolódó rekordokat (`getByIds`). Egy heti riport így
nem olvassa végig a teljes historikus adatot, és a szűrési logika változatlanul
átvihető egy SQL `WHERE` feltételbe, ha a tárolás később adatbázisra vált.

Az időszak feloldása (naphatárok helyi idő szerint, validáció, maximális
hossz) a közös `server/utils/dateRange.js`-ben van — a logisztikai összesítő és
a riportok ugyanazt a szabályt használják, csak más alapértelmezéssel (a
logisztikánál a mai nap, a riportoknál az elmúlt 7 nap). Két felület nem
mutathat mást ugyanarra a dátumra.

## Logisztika — pénzügyi áttekintő

A `/logistics` felület három fület kapott: **Áttekintés**, **Blokk-archívum**,
**Napi zárás**. Fehér-fekete, adatközpontú megjelenés — a hangsúly az
olvashatóságon van, nem a látványon. Fő használati eset asztali gép/tablet, de
kisebb kijelzőn is használható marad (a táblázatok vízszintesen görgethetők).

A felület **nem tárol új pénzügyi adatot**: minden szám a meglévő `orders`,
`orderItems` és `payments` kollekciókból számolódik, a repository rétegen
keresztül. A végösszegek ugyanazzal a `receiptService` logikával készülnek, mint
a kinyomtatott blokk — így egy utólagos ellenőrzésnél biztosan ugyanaz jön ki.

**Két időbélyeg, két kérdés.** Az időszak szűrése szándékosan nem egyetlen
dátumra épül:

- a **pénzügyi** számok (bevétel, fizetési mód szerinti bontás, kasszazárás) a
  fizetés rögzítésének időpontja (`payments.paidAt`) szerint — ez az, ami aznap
  ténylegesen befolyt;
- a **darabszámok** (rendelések típus szerint, kifizetetlenek) a rendelés
  felvételének időpontja (`orders.createdAt`) szerint — ez az, amit aznap
  felvettek.

Egy előző nap felvett, de ma kifizetett rendelés így a mai bevételben, de a
tegnapi rendelésszámban jelenik meg. A felület a fejlécben kiírja ezt, hogy ne
lehessen félreérteni. A napok határai **helyi idő** szerint képződnek (nem UTC):
a „mai nap" az étteremben dolgozó ember napja.

### Áttekintés

Összesítő kártyák (bevétel, rendelésszám, helyszíni/online bontás, kifizetetlen
összeg) és a fizetési mód szerinti bontás táblázatban, egyszerű sávdiagrammal —
rajzoló könyvtár nélkül, hogy nyomtatásban és nagyítva is olvasható maradjon. A
dátumtartomány-választó mellett gyors gombok: *Ma*, *Tegnap*, *7 nap*, *30 nap*.

A kifizetetlen kártya csak akkor kap piros kiemelést, ha tényleg van behajtani
való; az összeg a **hátralékot** mutatja, nem a teljes végösszeget (részfizetés
esetén ez nem ugyanaz). Tétel nélküli rendelés nem kerül a figyelmeztetésbe.

A logisztikai felület megkapja a fizetéskor kiváltott `order:payment_recorded`
eseményt, így a nyitva hagyott áttekintő újratöltés nélkül frissül.

### Blokk-archívum

Szűrhető, lapozható rendeléslista: időszak, típus (helyszíni/online), asztal,
pincér, fizetési mód, fizetettség, sor/oldal. Egy sorra kattintva (vagy Enterrel)
oldalsó panelen nyílik a rendelés részletes nézete: a **10. szegmens nyomtatási
sablonjának olvasható változata** — ugyanaz az adat és felépítés (fejléc,
tételek extrákkal, összesítés, lábléc), de képernyőre szánva, nyomtatás nélkül.
Alatta a rögzített fizetések listája, és — ha van — a hátralék.

Itt a kiszolgálási feltétel nem érvényes: egy még le sem zárt rendelés blokkja is
megnézhető (a `receiptService.getReceiptView` ugyanazt állítja össze, mint a
`getReceipt`, csak az ellenőrzés nélkül). Nyomtatni innen nem kell — ez az
utólagos ellenőrzés nézete.

### Napi zárás

A rendszer kiszámolja a **várt készpénz-egyenleget** (a `cash` és `atm_later`
módú fizetésekből az adott időszakra), a munkatárs beírja a **ténylegesen
leszámolt** összeget, az eltérés pedig gépelés közben, azonnal látszik —
egyezésnél zölden, hiánynál pirosan, többletnél külön jelöléssel.

A várt összeget **mindig a szerver számolja újra**: a kliens csak a leszámolt
összeget és a jegyzetet küldi, így a rögzített eltérés nem hamisítható. A zárás
a `cashClosings` kollekcióba kerül, és nem módosítja a rendeléseket vagy a
fizetéseket — csak egy pillanatkép az egyeztetésről. Ugyanarra a napra több
zárás is rögzíthető (délelőtti és délutáni műszak); ha már van, a felület jelzi,
de nem tiltja. A korábbi zárások lent, teljes történettel listázódnak.

Egy megjegyzés a számításról: a várt egyenleg a **rögzített fizetésekből** dolgozik,
nem a „teljesen kifizetett rendelésekből". Ha egy asztal felig kártyával, felig
készpénzzel fizetett, a készpénzes rész akkor is a fiókban van, ha a rendelés
maga még nincs teljesen rendezve.

## Design és reszponzivitás

A rendszer öt felülete **egy termék**: közös alapra épülnek, és csak a
szerepkörhöz tartozó színkód különbözteti meg őket. Ezt a
`public/assets/base.css` fogja össze — mind az öt felület ezt tölti be először,
és utána teszi hozzá a sajátját.

### Design-tokenek

A base.css `:root` blokkja adja a **teljes skálát**: színek, tipográfia
(`--text-xs` … `--text-2xl`), négyes léptékű térköz (`--space-1` … `--space-10`),
lekerekítés (`--radius-sm` / `--radius` / `--radius-lg` / `--radius-pill`),
árnyékok (`--shadow-sm` / `-md` / `-lg`) és az érintési célméret (`--tap-min`).
A felületek a `data-interface` attribútumon keresztül csak a színeket írják
felül:

| Felület | Kiemelőszín | Téma |
| --- | --- | --- |
| pincér | zöld `#35c46a` | sötét |
| szakács | sárga `#f2c744` | sötét |
| admin | kék `#4a9eff` | sötét |
| logisztika | grafit `#1f2937` | világos |
| online | arany `#e0a340` | sötét, világos váltóval |

A világos felületek az árnyék-tokeneket is felülírják: a sötét témára hangolt
árnyék fehér háttéren piszkosnak látszana.

### Töréspontok

Egységesen három (plusz egy speciális). A CSS nem enged változót a `@media`
feltételben, ezért ezek szó szerinti értékek — a base.css fejléce sorolja fel
őket, hogy egy helyen legyen a hivatkozás:

| Töréspont | Mire |
| --- | --- |
| `max-width: 480px` | mobil (álló telefon) |
| `max-width: 768px` | tablet álló / nagy telefon |
| `max-width: 1024px` | kis laptop / tablet fekvő |
| `min-width: 1600px` | fali kijelző (csak a konyhai munkapult) |

A felületek többsége mobil-first, **két kivétellel**: a pincér és a szakács
felület alapesete a tablet, mert az a napi munkaeszköz — ott a mobil a szűkítés.

Amit a töréspontok érdemben átrendeznek:

- **Pincér** — 1024 px alatt a kosár a menü alá kerül; 480 px alatt alsó lebegő
  sávvá zsugorodik: a tétellista magán belül görgethető, a végösszeg és a
  „Rendelés leadása" gomb mindig látszik. A kategóriafülek vízszintesen
  görgethetők.
- **Szakács** — 768 px alatt egyoszlopos blokk-lista; 1600 px felett szélesebb
  oszlopok és nagyobb betűk, hogy 2–3 méterről is olvasható legyen.
- **Admin** — 1024 px alatt az asztaltérkép-szerkesztő és az oldalsó panel
  egymás alá kerül. Keskeny **és érintős** kijelzőn figyelmeztetés jelenik meg,
  hogy a pontos pozicionálás asztali gépen kényelmesebb — de a szerkesztő
  használható marad, semmi nincs letiltva.
- **Logisztika** — 480 px alatt a blokk-archívum táblázata **kártyás nézetre
  vált**: minden sor egy kártya, a cellák a saját fejlécüket viszik magukkal
  (`data-label`). A számokat összehasonlító táblázatok maradnak vízszintesen
  görgethetők, mert ott az oszlopos olvasás a lényeg.
- **Online** — 768 px felett az étlap több hasábra bomlik, a felcsúszó lap
  párbeszédablakká szelídül; 1024 px felett a tartalom 1100 px-nél megáll (a
  túl hosszú sor olvashatatlan), a lebegő kosár pedig a jobb alsó sarokba
  húzódik.

### Érintésbarát kezelés

Ahol nincs pontos mutató (`@media (pointer: coarse)`), **minden** kattintható
elem felhúzódik a 44 px-es ajánlott célméretre — gombok, legördülők, beviteli
mezők egyaránt. Egérrel dolgozó gépen a sűrű admin- és logisztikai táblázatok
megtarthatják a tömörebb sorokat.

A Canvas-alapú nézetek saját gesztuskezelést kapnak: a pincér asztaltérképe
egy ujjal pásztázható, két ujjal nagyítható (`touch-action: none`, mert ott a
pásztázás az elsődleges művelet), az admin szerkesztőjében viszont a vászon
fölött a lap görgethető marad (`pan-x pan-y`), és csak a megfogott asztal
kapcsolja ki a görgetést. A belül görgethető panelek (kosár, felcsúszó lap,
oldalsó panel) `overscroll-behavior: contain`-nel nem húzzák magukkal a lapot.

### Betöltés, hiba, visszajelzés

- **Betöltés**: skeleton helyőrzők (`.skeleton`) és `.spinner`, hogy ne ugráljon
  az elrendezés az adat megérkezésekor. Csökkentett mozgás beállításnál az
  animáció kikapcsol, de a helyőrző látszik.
- **Hálózati hiba**: a `public/shared/uiState.js` egységes hibadobozt ad
  **újrapróbálkozás gombbal**. Korábban minden felület máshogy jelzett — volt,
  ahol csak egy pár másodpercre felvillanó toast, volt, ahol semmi. A hibaüzenet
  most megmarad, amíg meg nem szűnik a hiba, és nem kell újratölteni a lapot.
- **Kapcsolat-állapot**: ugyanaz a jelző mind az öt felületen. A személyzeti
  felületeken folyamatosan látszik; a vendégoldalon **csak akkor jelenik meg, ha
  megszakadt** a kapcsolat — az „élő kapcsolat" felirat a vendégnek nem mond
  semmit, a megszakadt viszont igen. Mobilon a jelző ponttá zsugorodik, hogy ne
  takarja a képernyő alján lévő fő gombot; hiba esetén viszont kiírja a szöveget.
- **Űrlaphibák**: a `.field--error` / `.field__error` / `.field__hint` a
  base.css-ben van, egy helyen — egy hibás ár az adminban ugyanúgy néz ki, mint
  egy hibás összeg a kasszazárásnál.

### Teljesítmény

A socket-események **összevontan** frissítenek: a pincér felület 150 ms-on belül
érkező eseményeit egyetlen újratöltéssé vonja össze (a konyhai munkapult
ugyanígy), különben egy asztalnál több egyidejű eseményből minden egyes darab
külön hálózati kérést és teljes Canvas-újrarajzolást indítana. Az ablak
átméretezése `requestAnimationFrame`-re van kötve, így képkockánként legfeljebb
egyszer rajzol újra.

### Kézi tesztelés

A `TESTING-CHECKLIST.md` eszközkategóriánként (mobil / tablet / asztali gép /
fali kijelző) és felületenként sorolja fel a végleges átadás előtt
végigjátszandó forgatókönyveket — beleértve a hálózati hiba és a valós idejű
frissülés ellenőrzését is.

## Valós idejű réteg (Socket.io)

A Socket.io ugyanarra a `http.Server` példányra csatlakozik, mint az Express —
ugyanaz a folyamat, ugyanaz a port. A böngésző a szervertől kapja a klienst is
(`/socket.io/socket.io.js`), nincs CDN.

### Belépés a csatornára

A kliens a bejelentkezéskor kapott JWT tokent küldi a handshake-ben
(`socket.handshake.auth.token`), a szerver az `authService.verifyToken()`-nel
ellenőrzi. Érvénytelen token esetén a kapcsolat elutasításra kerül. Token nélkül
csak a publikus online felület csatlakozhat, vendégként.

### Szobák

A kliens a szerepköre alapján automatikusan a megfelelő szobába kerül, és
kapcsolódás után egy `session:ready` eseményben vissza is kapja, hova:

| Szoba | Ki kerül bele |
| --- | --- |
| `restaurant:{id}:waiters` | `waiter` |
| `restaurant:{id}:kitchen` | `cook` |
| `restaurant:{id}:admin` | `admin` |
| `restaurant:{id}:logistics` | `logistics` |
| `restaurant:{id}:online` | bejelentkezés nélküli vendég |

### Események

A katalógus egy helyen van (`shared/socketEvents.js`), szerver és kliens is
onnan olvassa, így nem lehet elgépelni az eseményneveket:

| Esemény | Célszobák |
| --- | --- |
| `order:created` | waiters, kitchen, admin (+ online, ha online rendelés) |
| `order_item:added` | waiters, kitchen, admin (+ online, ha online rendelés) |
| `order:payment_recorded` | waiters, admin, logistics — fizetés rögzült |
| `order_item:status_changed` | waiters, kitchen, admin, logistics |
| `order_item:served` | waiters, kitchen, admin, logistics |
| `table:status_changed` | waiters, admin |
| `table:reserved` | waiters, admin |
| `menu_item:availability_changed` | mind, az online felülettel együtt |
| `table:layout_changed` | waiters, admin — az admin átrendezte a termet |

A tétel-események (`order_item:status_changed`, `order_item:served`) a tétel
mellé a rendelés rövid kísérőadatát is viszik
(`{ orderItem, order: { id, tableId, tableLabel, type, allItemsServed } }`), így
a fogadó felület a teljes rendelés újratöltése nélkül is meg tudja mutatni,
melyik asztalról van szó.

Kibocsátani mindig a `server/sockets/emitters.js` függvényeivel kell, sosem
közvetlenül a Socket.io API-val — így egy helyen van, melyik esemény hova megy:

```js
const { emitOrderCreated } = require('../sockets/emitters');
emitOrderCreated(order, items);
```

Kliens oldalon a `public/shared/socketClient.js` csatlakozik a tárolt tokennel,
kezeli az automatikus újracsatlakozást, és a felület sarkában megjelenít egy
kapcsolat-állapot jelzőt (zöld: élő kapcsolat, piros: kapcsolat megszakadt).
A beérkező események a böngésző konzoljába és a felület eseménynaplójába is
bekerülnek.

### Ideiglenes teszt végpontok

<!-- TODO: remove - a valos ideju reteg kezi ellenorzesehez -->

Csak fejlesztői módban (`NODE_ENV !== 'production'`) élnek, és a végleges
rendszerből törlendők a `server/routes/api/_test.js` fájllal együtt:

```bash
# order:created kiváltása (dine_in)
curl -X POST http://localhost:3000/api/_test/emit-order-created \
  -H 'Content-Type: application/json' -d '{}'

# bármelyik katalógus-esemény kiváltása
curl -X POST http://localhost:3000/api/_test/emit \
  -H 'Content-Type: application/json' -d '{"event":"menu_item:availability_changed"}'
```

Nyiss meg több felületet külön böngészőablakban, és nézd a konzolt: az esemény
csak a megfelelő szobák klienseihez jut el.

## Licenc

**Minden jog fenntartva.**

A projekt kódja és minden hozzá tartozó fájl a szerző tulajdona. A forráskód
megtekintése ebben a nyilvános tárolóban **nem jogosít fel** a felhasználásra:
a kód nem másolható, nem módosítható, nem terjeszthető és nem használható fel
sem egészben, sem részben, a szerző előzetes írásbeli engedélye nélkül.

A teljes szöveg a [LICENSE](LICENSE) fájlban olvasható.

## Kapcsolat / Közreműködés

Ha módosítást, továbbfejlesztést szeretnél javasolni, vagy engedélyt kérnél a
kód felhasználására, keresd a fejlesztőt:

**https://github.com/galandras12**
