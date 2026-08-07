# And Order Here — étteremkezelő rendszer

Node.js + Express + Socket.io alapú étteremkezelő rendszer, fájlalapú (JSON)
adattárolással, JWT-alapú bejelentkezéssel és valós idejű szinkronizációval.
Eddig a projektváz, az adattárolási réteg, az autentikáció és a valós idejű
kommunikációs réteg készült el — az üzleti funkciók (rendelésfelvétel, konyhai
sor, készlet) a következő szegmensekben jönnek.

Az egész egyetlen `npm start` paranccsal, egyetlen Node folyamatként és egyetlen
porton fut (HTTP API + WebSocket együtt): nincs külön adatbázis-szerver,
auth-szerver, socket-szerver, session-tároló, Redis adapter vagy üzenetsor.

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
| `GET /api/waiter/*` | csak `waiter` |
| `GET /api/kitchen/*` | csak `cook` |
| `GET /api/admin/*` | csak `admin` (pl. `GET /api/admin/users`) |
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
    authService.js  bejelentkezés, token kiadás és ellenőrzés (csak repositoryt hív)
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
  config.js     .env alapú konfiguráció
  index.js      belépési pont
public/
  waiter/ admin/ logistics/ kitchen/ online/   felületenkénti statikus fájlok
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
