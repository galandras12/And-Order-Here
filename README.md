# And Order Here — étteremkezelő rendszer

Node.js + Express + Socket.io alapú projektváz, fájlalapú (JSON) adattárolással.
Eddig a struktúra, a statikus kiszolgálás, a Socket.io alapinicializálás és a
teljes adattárolási réteg készült el — üzleti logika (autentikáció,
rendelésfelvétel) még nincs.

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

## Elérhető végpontok

| Útvonal      | Leírás                       |
| ------------ | ---------------------------- |
| `/`          | felületválasztó nyitólap     |
| `/waiter`    | pincér felület               |
| `/admin`     | admin / vezetői felület      |
| `/logistics` | logisztikai felület          |
| `/kitchen`   | szakács / konyhai felület    |
| `/online`    | online rendelés              |
| `/health`    | állapotjelző: `{"status":"ok"}` |

Mind az 5 felület jelenleg egy üres, sötét témájú placeholder oldalt jelenít meg.

## Környezeti változók

A `.env.example` tartalmazza az összes változót:

| Változó        | Leírás                                        |
| -------------- | --------------------------------------------- |
| `NODE_ENV`      | futtatási környezet (`development` / `production`) |
| `PORT`          | HTTP port (alapértelmezés: 3000)              |
| `DATA_FILE`     | a JSON adatfájl útvonala (alapértelmezés: `server/db/data.json`) |
| `SEED_ON_EMPTY` | üres adatbázisnál induláskor betölti a teszt adatokat (alapértelmezés: `true`) |
| `JWT_SECRET`    | JWT aláíró kulcs (még nincs használatban)     |
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
| logisztika | PIN `3456` (vagy `logisztika@andorderhere.local` / `logi123`) |

## Mappastruktúra

```
server/
  routes/       Express route-ok (health + statikus felületek)
  sockets/      Socket.io inicializálás
  db/
    db.js           lowdb példány, in-memory cache, mutexszel védett mentés
    defaultData.js  üres séma + hiányzó kollekciók pótlása
    ids.js          nanoid alapú id-generálás entitás-előtagokkal
    seed.js         teszt adatok
    repositories/   entitásonként egy modul (soha nem nyers JSON)
    index.js        connect/disconnect + repository export
  utils/
    password.js   scrypt jelszó hash (a seed felhasználókhoz)
  config.js     .env alapú konfiguráció
  index.js      belépési pont
public/
  waiter/ admin/ logistics/ kitchen/ online/   felületenkénti statikus fájlok
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
