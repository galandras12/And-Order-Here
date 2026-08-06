const db = require('./db');
const repositories = require('./repositories');
const { hashPassword, hashPin } = require('../utils/password');
const {
  ROLES,
  MENU_CATEGORY_NAMES,
  DEFAULT_RECEIPT_FOOTER
} = require('../../shared/constants');

const {
  restaurantRepository,
  userRepository,
  tableRepository,
  zoneRepository,
  menuCategoryRepository,
  menuItemRepository,
  extraRepository
} = repositories;

/**
 * Teszt adatok betoltese: egy etterem asztalokkal, etlappal es felhasznalokkal.
 *
 * Futtatas:
 *   npm run seed          - csak akkor tolt, ha meg ures az adatbazis
 *   npm run seed:reset    - mindent torol, majd ujratolt
 *
 * A szerver indulaskor is meghivja (SEED_ON_EMPTY=true), igy az `npm install`
 * es `npm start` utan azonnal van mivel dolgozni.
 */

const TABLES = [
  { label: 'A1', posX: 80, posY: 80, rotation: 0, width: 90, height: 90, comment: 'Ablak melletti' },
  { label: 'A2', posX: 220, posY: 80, rotation: 0, width: 90, height: 90, comment: '' },
  { label: 'A3', posX: 360, posY: 80, rotation: 0, width: 120, height: 90, comment: '6 fos' },
  { label: 'B1', posX: 80, posY: 240, rotation: 90, width: 90, height: 90, comment: '' },
  { label: 'B2', posX: 220, posY: 240, rotation: 0, width: 90, height: 90, comment: 'Bejarat melletti' },
  { label: 'T1', posX: 420, posY: 300, rotation: 45, width: 110, height: 110, comment: 'Terasz' }
];

const ZONES = [
  {
    label: 'Belso ter',
    shapeCoordinates: [
      { x: 40, y: 40 },
      { x: 520, y: 40 },
      { x: 520, y: 200 },
      { x: 40, y: 200 }
    ]
  },
  {
    label: 'Terasz',
    shapeCoordinates: [
      { x: 360, y: 240 },
      { x: 560, y: 240 },
      { x: 560, y: 400 },
      { x: 360, y: 400 }
    ]
  }
];

const MENU = {
  [MENU_CATEGORY_NAMES.FOOD]: [
    { name: 'Ujhazi tyukhusleves', price: 1890, allergens: ['glutén', 'zeller', 'tojás'] },
    { name: 'Gulyasleves', price: 2190, allergens: ['zeller'] },
    { name: 'Rantott sajt koretttel', price: 3290, allergens: ['glutén', 'tej', 'tojás'] },
    { name: 'Marhaporkolt galuskaval', price: 4590, allergens: ['glutén', 'tojás'] },
    { name: 'Grillezett csirkemell', price: 3890, allergens: [] },
    { name: 'Cezar salata', price: 3190, allergens: ['glutén', 'tej', 'hal', 'tojás'] },
    { name: 'Vegetarianus lasagne', price: 3490, allergens: ['glutén', 'tej'] },
    { name: 'Somloi galuska', price: 1990, allergens: ['glutén', 'tej', 'tojás', 'diófélék'] }
  ],
  [MENU_CATEGORY_NAMES.DRINK]: [
    { name: 'Asvanyviz 0,33 l', price: 590, allergens: [] },
    { name: 'Kola 0,5 l', price: 890, allergens: [] },
    { name: 'Csapolt sor 0,5 l', price: 1290, allergens: ['glutén'] },
    { name: 'Hazi limonade', price: 1190, allergens: [] },
    { name: 'Espresso', price: 790, allergens: [] }
  ],
  [MENU_CATEGORY_NAMES.OTHER]: [
    { name: 'Kenyerkosar', price: 490, allergens: ['glutén'] },
    { name: 'Elviteli csomagolas', price: 250, allergens: [] }
  ]
};

const EXTRAS = [
  { name: 'Extra sajt', price: 450 },
  { name: 'Extra koret', price: 890 },
  { name: 'Tejszinhab', price: 350 },
  { name: 'Citrom karika', price: 150 }
];

/** Igaz, ha meg egyetlen etterem sincs az adatbazisban. */
function isEmpty() {
  return restaurantRepository.count() === 0;
}

/**
 * Teszt adatok letrehozasa.
 * @param {{ reset?: boolean }} [options] reset eseten elobb torlunk mindent
 */
async function seed(options = {}) {
  await db.init();

  if (options.reset) {
    await db.clear();
    console.log('[seed] Adatbazis kiuritve.');
  } else if (!isEmpty()) {
    console.log('[seed] Az adatbazis mar tartalmaz adatot, a seed kihagyva.');
    return { skipped: true };
  }

  const restaurant = await restaurantRepository.createRestaurant({
    name: 'And Order Here Bisztro',
    address: '1052 Budapest, Petofi Sandor utca 12.',
    phone: '+36 1 234 5678',
    vatRate: 0.27,
    serviceFeeRate: 0.1,
    apCode: 'AP-A123XY45',
    receiptFooterMessage: DEFAULT_RECEIPT_FOOTER
  });

  for (const zone of ZONES) {
    await zoneRepository.createZone({ restaurantId: restaurant.id, ...zone });
  }

  for (const table of TABLES) {
    await tableRepository.createTable({ restaurantId: restaurant.id, ...table });
  }

  let sortOrder = 0;
  let menuItemCount = 0;
  for (const [categoryName, items] of Object.entries(MENU)) {
    const category = await menuCategoryRepository.createCategory({
      restaurantId: restaurant.id,
      name: categoryName,
      sortOrder: sortOrder++
    });

    for (const item of items) {
      await menuItemRepository.createItem({
        categoryId: category.id,
        name: item.name,
        price: item.price,
        isAvailable: true,
        allergens: item.allergens
      });
      menuItemCount += 1;
    }
  }

  for (const extra of EXTRAS) {
    await extraRepository.createExtra({ restaurantId: restaurant.id, ...extra });
  }

  // A jelszo es a PIN is hashelve kerul be (bcrypt), nyilt ertek sehol nem tarolodik.
  const users = [
    {
      name: 'Kovacs Anna (admin)',
      role: ROLES.ADMIN,
      email: 'admin@andorderhere.local',
      passwordHash: hashPassword('admin123'),
      pinCodeHash: null
    },
    {
      name: 'Nagy Peter (pincer)',
      role: ROLES.WAITER,
      email: null,
      passwordHash: null,
      pinCodeHash: hashPin('1234')
    },
    {
      name: 'Szabo Gabor (szakacs)',
      role: ROLES.COOK,
      email: null,
      passwordHash: null,
      pinCodeHash: hashPin('2345')
    },
    {
      name: 'Toth Eva (logisztika)',
      role: ROLES.LOGISTICS,
      email: 'logisztika@andorderhere.local',
      passwordHash: hashPassword('logi123'),
      pinCodeHash: hashPin('3456')
    }
  ];

  for (const user of users) {
    await userRepository.createUser({ restaurantId: restaurant.id, ...user });
  }

  const summary = {
    restaurant: restaurant.name,
    zones: ZONES.length,
    tables: TABLES.length,
    categories: Object.keys(MENU).length,
    menuItems: menuItemCount,
    extras: EXTRAS.length,
    users: users.length
  };

  console.log('[seed] Teszt adatok betoltve:', summary);
  console.log('[seed] Belepesi adatok - admin: admin@andorderhere.local / admin123,');
  console.log('[seed]                   pincer PIN: 1234, szakacs PIN: 2345, logisztika PIN: 3456');

  return { skipped: false, summary };
}

/** Csak akkor seedel, ha meg ures az adatbazis (szerver indulaskor ez fut). */
async function seedIfEmpty() {
  await db.init();
  if (!isEmpty()) return { skipped: true };
  return seed();
}

module.exports = { seed, seedIfEmpty, isEmpty };

// Kozvetlen futtatas: node server/db/seed.js [--reset]
if (require.main === module) {
  const reset = process.argv.includes('--reset');
  seed({ reset })
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] Hiba:', err);
      process.exit(1);
    });
}
