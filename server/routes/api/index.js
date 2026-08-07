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

const router = express.Router();

/**
 * API belepesi pont, szerepkor szerinti vedelemmel.
 *
 *   /api/auth/*       publikus (a /me kiveletelevel, ott requireAuth van)
 *   /api/waiter/*     csak waiter
 *   /api/kitchen/*    csak cook
 *   /api/admin/*      csak admin
 *   /api/logistics/*  csak logistics
 *   /api/online/*     publikus - az online rendeles bejelentkezes nelkul is megy
 *
 * A vedelem itt, kozponti helyen dol el, igy egy uj route fajlban nem lehet
 * elfelejteni felrakni.
 */
router.use('/auth', authRouter);
router.use('/online', onlineRouter);

router.use('/waiter', requireAuth, requireRole([ROLES.WAITER]), waiterRouter);
router.use('/kitchen', requireAuth, requireRole([ROLES.COOK]), kitchenRouter);
router.use('/admin', requireAuth, requireRole([ROLES.ADMIN]), adminRouter);
router.use('/logistics', requireAuth, requireRole([ROLES.LOGISTICS]), logisticsRouter);

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

module.exports = router;
