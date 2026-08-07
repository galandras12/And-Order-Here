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
szerkesztő és a pincér élő asztaltérképe készült el; a rendelésfelvétel, a
konyhai sor és a készletkezelés a következő szegmensekben jön.

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
| `GET /api/kitchen/*` | csak `cook` |
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
| `GET /api/logistics/*` | csak `logistics` |
| `GET /api/online/*` | publikus |

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

A `/admin` hat fülre bomlik:

| Fül | Mit tud |
| --- | --- |
| Étterem beállításai | név, cím, telefon, ÁFA %, szervizdíj %, AP kód, nyugta lábléc — mezőnkénti hibajelzéssel |
| Kategóriák | hozzáadás, átnevezés, sorrend fel/le, törlés (csak üres kategória) |
| Menütételek | kategóriánként csoportosítva; név, ár, kategória, allergének (14 EU-s allergén checkboxként), elérhető/elfogyott kapcsoló; hozzáadás, szerkesztés, törlés |
| Extrák | kiegészítők hozzáadása, szerkesztése, törlése |
| Asztaltérkép | vizuális szerkesztő: asztalok mozgatása, méretezése, forgatása, zónák kijelölése |
| Felhasználók | lista (szerkesztés későbbi szegmensben) + valós idejű eseménynapló |

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
    validation.js   mezőnkénti validáció, tipizált hibák (400/404/409)
  config.js     .env alapú konfiguráció
  index.js      belépési pont
public/
  logistics/ kitchen/ online/   felületenkénti statikus fájlok
  waiter/
    index.html  asztaltérkép, menü, foglalás
    floorMap.js Canvas rajzoló (nagyítás, pásztázás, találat-vizsgálat)
    app.js      betöltés, valós idejű frissítés, foglalás
    waiter.css  pincér-specifikus stílus
  admin/
    index.html  fülek: étterem, kategóriák, tételek, extrák, felhasználók
    app.js      közös mag: fülek, API hívás, űrlap- és hibakezelés
    restaurant.js  menu.js  extras.js  users.js   nézetenkénti modulok
    floorPlan.js   vizuális asztaltérkép szerkesztő
    admin.css  floor-plan.css   admin-specifikus stílus
  shared/
    auth.js         bejelentkezés, token tárolás, fetch wrapper
    socketClient.js Socket.io kapcsolat, újracsatlakozás, állapotjelző
    eventLog.js     beérkező események megjelenítése a felületen
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
| `order_item:status_changed` | waiters, kitchen, admin, logistics |
| `order_item:served` | waiters, kitchen, admin, logistics |
| `table:status_changed` | waiters, admin |
| `table:reserved` | waiters, admin |
| `menu_item:availability_changed` | mind, az online felülettel együtt |
| `table:layout_changed` | waiters, admin — az admin átrendezte a termet |

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
