# Adatséma

Az adatok egyetlen JSON fájlban élnek (alapértelmezés: `server/db/data.json`,
felülírható a `DATA_FILE` környezeti változóval). A fájl minden felső szintű
kulcsa egy **kollekció** — egy rekordokból álló tömb —, kivéve a `schemaVersion`
mezőt.

```json
{
  "schemaVersion": 2,
  "restaurants": [],
  "users": [],
  "tables": [],
  "zones": [],
  "menuCategories": [],
  "menuItems": [],
  "extras": [],
  "reservations": [],
  "orders": [],
  "orderItems": [],
  "payments": []
}
```

Nincs SQL join, ezért a kapcsolatokat mezőkben tárolt id-k (és egy helyen
id-tömb) írják le. Minden rekord `id` mezője egyedi, nanoid-dal generált, és
entitásonként előtagot kap (pl. `ord_9KdA...`), hogy a JSON kézzel is olvasható
maradjon.

## Kapcsolatok

```
restaurants
├── users            (users.restaurantId)
├── tables           (tables.restaurantId)
│   ├── reservations (reservations.tableId)
│   └── orders       (orders.tableId, online rendelésnél null)
├── zones            (zones.restaurantId)
├── extras           (extras.restaurantId)
└── menuCategories   (menuCategories.restaurantId)
    └── menuItems    (menuItems.categoryId)

orders
├── orderItems       (orderItems.orderId)
│   ├── menuItems    (orderItems.menuItemId)
│   └── extras       (orderItems.extraIds[] — id-tömb, nem kapcsolótábla)
└── payments         (payments.orderId)
```

## Kollekciók

### restaurants

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | egyedi azonosító (`res_…`) |
| `name` | string | étterem neve |
| `address` | string | cím |
| `phone` | string | telefonszám |
| `vatRate` | number | áfakulcs százalékban (27 = 27%), 0–100 |
| `serviceFeeRate` | number | szervizdíj százalékban (10 = 10%), 0–100 |
| `apCode` | string | pénztárgép AP kód |
| `receiptFooterMessage` | string | nyugta lábléc, alapérték: `– And-Order-Here –` |

### users

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `usr_…` |
| `restaurantId` | string → `restaurants.id` | melyik étteremhez tartozik |
| `name` | string | megjelenített név |
| `role` | string | `waiter` \| `cook` \| `admin` \| `logistics` (\| `customer`) |
| `pinCodeHash` | string \| null | pincér/szakács belépéshez, bcrypt hash (4–6 jegyű PIN-ből) |
| `email` | string \| null | admin/logisztika belépéshez |
| `passwordHash` | string \| null | bcrypt hash |
| `isActive` | boolean | inaktiválás törlés helyett, hogy a régi rendelések hivatkozása megmaradjon |

Sem a jelszó, sem a PIN nem tárolódik nyílt szövegként, és egyik hash sem hagyja
el a szervert: az API mindig szűrt felhasználó-nézetet ad vissza
(`id`, `restaurantId`, `name`, `role`, `email`, `isActive`, `hasPin`).

Mivel a PIN hashelve van, nem lehet rá közvetlenül keresni: a belépés az étterem
PIN-nel rendelkező aktív felhasználóin megy végig hash-összehasonlítással
(`userRepository.getPinCandidates`), a próbálkozásokat pedig korlátozás védi.

### tables

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `tbl_…` |
| `restaurantId` | string → `restaurants.id` | |
| `label` | string | asztal felirata (pl. `A1`) |
| `posX`, `posY` | number | pozíció az asztaltérképen |
| `rotation` | number | elforgatás fokban |
| `width`, `height` | number | méret a térképen |
| `comment` | string | megjegyzés (pl. „ablak melletti”) |

### zones

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `zon_…` |
| `restaurantId` | string → `restaurants.id` | |
| `label` | string | zóna neve (pl. „Terasz”) |
| `shapeCoordinates` | `{x:number,y:number}[]` | a zónát határoló sokszög pontjai |

### menuCategories

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `mcat_…` |
| `restaurantId` | string → `restaurants.id` | |
| `name` | string | `Etelek` \| `Italok` \| `Egyeb` |
| `sortOrder` | number | megjelenítési sorrend |

### menuItems

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `item_…` |
| `categoryId` | string → `menuCategories.id` | az étteremhez a kategórián keresztül tartozik |
| `name` | string | tétel neve |
| `price` | number | egységár (Ft) |
| `isAvailable` | boolean | elérhető-e most |
| `allergens` | string[] | allergén kulcsok a `shared/constants.js` `ALLERGENS` listájából, pl. `["gluten", "tej"]` |

### extras

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `ext_…` |
| `restaurantId` | string → `restaurants.id` | |
| `name` | string | kiegészítő neve |
| `price` | number | felár (Ft) |

### reservations

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `rsv_…` |
| `tableId` | string → `tables.id` | |
| `reservedFrom` | string (ISO 8601) | foglalás kezdete |
| `reservedTo` | string (ISO 8601) | foglalás vége |
| `comment` | string | megjegyzés |

Ütköző időszakra a repository nem enged foglalást; az egymáshoz érő idősávok
(18:00–20:00 és 20:00–22:00) nem számítanak ütközésnek.

### orders

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `ord_…` |
| `restaurantId` | string → `restaurants.id` | |
| `tableId` | string → `tables.id` \| null | online rendelésnél `null` |
| `type` | string | `dine_in` \| `online` |
| `waiterId` | string → `users.id` \| null | felvevő pincér, online rendelésnél `null` |
| `status` | string | `new` → `accepted` → `in_preparation` → `ready` → `served` → `bill_requested` → `paid`, illetve `cancelled` |
| `createdAt` | string (ISO 8601) | felvétel ideje |

### orderItems

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `oit_…` |
| `orderId` | string → `orders.id` | |
| `menuItemId` | string → `menuItems.id` | |
| `quantity` | number | darabszám |
| `comment` | string | pl. „csípősen” |
| `extraIds` | string[] → `extras.id` | kapcsolótábla helyett közvetlen id-tömb |
| `status` | string | `pending` \| `preparing` \| `ready` \| `served` |
| `servedAt` | string (ISO 8601) \| null | `served` állapotnál automatikusan kitöltődik |

### payments

| Mező | Típus | Leírás |
| --- | --- | --- |
| `id` | string | `pay_…` |
| `orderId` | string → `orders.id` | |
| `method` | string | `card` \| `szep_card` \| `coupon` \| `cash` \| `atm_later` |
| `amount` | number | fizetett összeg (Ft) |
| `paidAt` | string (ISO 8601) | fizetés ideje |

Egy rendeléshez több fizetés is tartozhat (részfizetés, megosztott számla),
ezért az összeget mindig összegezve kell nézni:
`paymentRepository.getTotalPaid(orderId)`.

A `paid` és a `cancelled` állapot zárja a rendelést; minden más — a
`bill_requested` is — nyitottnak számít. Az asztaltérkép állapotát ebből
számolja a `floorStateService`: `bill_requested` → „számlát kért",
egyéb nyitott rendelés → „rendelés alatt", nyitott rendelés nélkül → „szabad".

## Használat a kódban

A felsőbb rétegek (route-ok, socket handlerek) soha nem nyúlnak közvetlenül a
JSON-hoz, csak a repository rétegen keresztül:

```js
const { orderRepository, orderItemRepository } = require('../db');

const { order, items } = await orderRepository.createOrderWithItems(
  { restaurantId, tableId, waiterId },
  [{ menuItemId, quantity: 2, comment: 'csípősen', extraIds: [extraId] }]
);

await orderItemRepository.updateOrderItemStatus(items[0].id, 'ready');
const open = orderRepository.getOpenOrdersByTable(tableId);
```

Olvasás szinkron (memóriából), írás `async` (mentés fájlba). Az olvasó
függvények mindig másolatot adnak vissza, így a visszakapott objektum
módosítása nem írja felül a tárolt adatot — menteni csak repository hívással
lehet.

Az `id` mezőt nem kell megadni, a repository generálja; ha mégis megadod (pl.
importnál), ütközés esetén hibát dob.

## Konzisztencia és párhuzamosság

- Minden írás egy `async-mutex` mutexen megy keresztül, és a mutexen belül
  történik a fájl mentése is — így párhuzamos kérések nem tudják csonkolni vagy
  összekeverni a JSON fájlt.
- A lowdb `JSONFile` adapter atomikusan ír (ideiglenes fájl + átnevezés).
- A teljes adathalmaz indulás után memóriában van (`server/db/db.js`), az
  olvasások onnan mennek; minden módosítás után azonnali fájlmentés történik.

## Séma bővítése

Új kollekció felvételekor:

1. vedd fel a nevét a `shared/constants.js` `COLLECTIONS` objektumába,
2. adj neki id-előtagot a `server/db/ids.js` `ID_PREFIX` térképében,
3. hozz létre hozzá repositoryt a `server/db/repositories/` mappában, és
   exportáld az `index.js`-ből.

A hiányzó kollekciók induláskor automatikusan létrejönnek a meglévő fájlban is
(`server/db/defaultData.js` → `normalizeData`), tehát meglévő adat mellett sem
kell újraseedelni.

## Séma verziók

A fájl `schemaVersion` mezője jelzi, melyik séma szerint készült. Induláskor a
`normalizeData` lefuttatja a hiányzó migrációkat, és menti a fájlt.

| Verzió | Változás |
| --- | --- |
| 1 | kiinduló séma |
| 2 | `vatRate` / `serviceFeeRate` arányról (0.27) százalékra (27); `menuItems.allergens` magyar címkéről kulcsra (`glutén` → `gluten`) |

Új migrációhoz: emeld a `SCHEMA_VERSION` értékét, és vedd fel a hozzá tartozó
függvényt a `MIGRATIONS` objektumba.
