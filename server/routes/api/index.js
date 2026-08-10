const express = require('express');

const { config } = require('../../config');
const { requireAuth, requireRole } = require('../../middleware');
const { ROLES } = require('../../../shared/constants');

const authRouter = require('./auth');
const waiterRouter = require('./waiter');
const kitchenRouter = require('./kitchen');
const adminRouter = require('./admin');
const logisticsRouter = require('./logistics');
const onlineRouter = require('./online');
const ordersRouter = require('./orders');

const router = express.Router();

/**
 * API belepesi pont, szerepkor szerinti vedelemmel.
 *
 *   /api/auth/*       publikus (a /me kiveletelevel, ott requireAuth van)
 *   /api/waiter/*     csak waiter
 *   /api/kitchen/*    csak cook
 *   /api/admin/*      csak admin
 *   /api/logistics/*  logistics es admin
 *   /api/online/*     publikus - az online rendeles bejelentkezes nelkul is megy
 *   /api/orders/*     vegyes - a fizetest a pincer es a vendeg is rogzitheti
 *
 * A vedelem itt, kozponti helyen dol el, igy egy uj route fajlban nem lehet
 * elfelejteni felrakni.
 */
router.use('/auth', authRouter);
router.use('/online', onlineRouter);
// Feluleteken atnyulo, rendeles szintu muveletek (fizetes): a jogosultsagot a
// router maga donti el, mert a pincer es a vendeg is ugyanezt hivja.
router.use('/orders', ordersRouter);

router.use('/waiter', requireAuth, requireRole([ROLES.WAITER]), waiterRouter);
router.use('/kitchen', requireAuth, requireRole([ROLES.COOK]), kitchenRouter);
router.use('/admin', requireAuth, requireRole([ROLES.ADMIN]), adminRouter);
// A penzugyi attekintot (13. szegmens) a vezetoi feluletrol is meg kell tudni
// nezni, ezert az admin is jogosult ra - a szurok tovabbra is a bejelentkezett
// felhasznalo etteremere vonatkoznak.
router.use('/logistics', requireAuth, requireRole([ROLES.LOGISTICS, ROLES.ADMIN]), logisticsRouter);

// TODO: remove - ideiglenes teszt vegpontok a valos ideju reteg ellenorzesehez.
// Csak fejlesztoi modban elerheto, eles kornyezetben fel sem kerul.
if (config.env !== 'production') {
  router.use('/_test', require('./_test'));
  console.log('[api] Teszt vegpontok bekapcsolva: POST /api/_test/emit-order-created, /api/_test/emit');
}

// Ismeretlen API utvonal: JSON valasz (nem a HTML 404).
router.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Ismeretlen API vegpont.' });
});

/**
 * A service reteg tipizalt hibai (ValidationError, NotFoundError, ConflictError)
 * HTTP valaszra forditva. A validacios hibak mezonkenti listaval jonnek, hogy a
 * felulet a megfelelo mezonel tudja megmutatni.
 *
 * Minden mas hiba a kozponti hibakezelohoz megy tovabb (500).
 */
router.use((err, req, res, next) => {
  if (!err || !err.status || !err.code) {
    next(err);
    return;
  }

  res.status(err.status).json({
    error: err.code,
    message: err.message,
    ...(err.fields && err.fields.length ? { fields: err.fields } : {}),
    ...(err.details ? { details: err.details } : {})
  });
});

module.exports = router;
