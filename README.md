# And Order Here — étteremkezelő rendszer

Node.js + Express + Socket.io alapú projektváz. Ez az első fejezet: csak a
struktúra, a statikus kiszolgálás és a Socket.io alapinicializálás készült el —
üzleti logika még nincs.

## Indítás

```bash
npm install
cp .env.example .env   # a .env nincs verziókezelve
npm start
```

A szerver alapértelmezés szerint a `http://localhost:3000` címen fut
(`npm run dev` ugyanez, `node --watch` automatikus újraindítással).

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
| `NODE_ENV`     | futtatási környezet (`development` / `production`) |
| `PORT`         | HTTP port (alapértelmezés: 3000)              |
| `DATABASE_URL` | adatbázis kapcsolati string (még nincs használatban) |
| `JWT_SECRET`   | JWT aláíró kulcs (még nincs használatban)     |
| `CORS_ORIGIN`  | engedélyezett origin az API / Socket.io számára |

## Mappastruktúra

```
server/
  routes/     Express route-ok (health + statikus felületek)
  sockets/    Socket.io inicializálás
  db/         adatbázis réteg (egyelőre helyőrző)
  config.js   .env alapú konfiguráció
  index.js    belépési pont
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
