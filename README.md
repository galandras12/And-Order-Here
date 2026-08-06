# And Order Here — étteremkezelő rendszer

Node.js + Express + Socket.io alapú étteremkezelő rendszer, fájlalapú (JSON)
adattárolással és JWT-alapú bejelentkezéssel. Eddig a projektváz, az adattárolási
réteg, valamint az autentikáció és a jogosultságkezelés készült el — az üzleti
funkciók (rendelésfelvétel, konyhai sor, készlet) a következő szegmensekben
jönnek.

Az egész egyetlen `npm start` paranccsal, egyetlen Node folyamatként fut: nincs
külön adatbázis-szerver, auth-szerver, session-tároló vagy más háttérszolgáltatás.

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
  sockets/      Socket.io inicializálás
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
  shared/auth.js  közös kliens oldali auth (bejelentkezés, token, fetch wrapper)
  assets/     közös CSS
  index.html  felületválasztó
shared/
  constants.js  szerver és böngésző által is használt konstansok
```

## Socket.io

A szerver oldali Socket.io példány elindul és konzolra logolja a kapcsolódást
és a bontást. Üzleti események (rendelés létrehozás, státuszváltás stb.) a
`shared/constants.js` `SOCKET_EVENTS` listájában elő vannak készítve, a kezelőik
egy későbbi fejezetben készülnek el.
