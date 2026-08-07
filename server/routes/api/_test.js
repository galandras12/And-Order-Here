// TODO: remove - ideiglenes teszt vegpontok a valos ideju reteg kezi
// ellenorzesehez. A vegleges rendszerbol torlendo: a fajl, a mountolasa a
// server/routes/api/index.js-ben, es a hozzatartozo README szakasz.
const express = require('express');

const emitters = require('../../sockets/emitters');
const orderService = require('../../services/orderService');
const { optionalAuth } = require('../../middleware');
const { restaurantRepository, tableRepository, menuItemRepository } = require('../../db/repositories');
const { ORDER_TYPE, ORDER_STATUS, ORDER_ITEM_STATUS } = require('../../../shared/constants');
const { SOCKET_EVENTS } = require('../../../shared/socketEvents');

const router = express.Router();

/**
 * A vizsgalt etterem: a bejelentkezett felhasznaloe, a body-ban kapott, vagy az elso.
 */
function resolveRestaurantId(req) {
  if (req.body && req.body.restaurantId) return req.body.restaurantId;
  if (req.user) return req.user.restaurantId;
  const restaurant = restaurantRepository.getDefaultRestaurant();
  return restaurant ? restaurant.id : null;
}

/** Nem mentett, csak kikuldott teszt rendeles. */
function buildTestOrder(restaurantId, body = {}) {
  const table = tableRepository.getByRestaurant(restaurantId)[0];
  const type = body.type === ORDER_TYPE.ONLINE ? ORDER_TYPE.ONLINE : ORDER_TYPE.DINE_IN;

  return {
    id: `ord_TEST${Date.now()}`,
    restaurantId,
    tableId: type === ORDER_TYPE.ONLINE ? null : (table ? table.id : null),
    tableLabel: type === ORDER_TYPE.ONLINE ? null : (table ? table.label : null),
    type,
    waiterId: body.waiterId || null,
    status: ORDER_STATUS.NEW,
    createdAt: new Date().toISOString(),
    isTest: true
  };
}

/**
 * POST /api/_test/emit-order-created
 * Body (mind elhagyhato): { restaurantId, type: 'dine_in' | 'online' }
 *
 * Kivalt egy order:created esemenyt, hogy tobb bongeszoablakban egyszerre
 * ellenorizheto legyen, hogy az esemeny celba er.
 */
router.post('/emit-order-created', optionalAuth, (req, res) => {
  const restaurantId = resolveRestaurantId(req);
  if (!restaurantId) {
    res.status(400).json({ error: 'no_restaurant', message: 'Nincs etterem az adatbazisban.' });
    return;
  }

  const order = buildTestOrder(restaurantId, req.body || {});
  const delivered = emitters.emitOrderCreated(order, []);

  res.json({ emitted: delivered, event: SOCKET_EVENTS.ORDER_CREATED, order });
});

/**
 * POST /api/_test/emit
 * Body: { event, restaurantId? }  - a katalogus barmelyik esemenye kikuldheto,
 * igy a szoba-szures is ellenorizheto (pl. menu_item:availability_changed
 * az online feluletre is megy, a table:reserved nem).
 */
router.post('/emit', optionalAuth, (req, res) => {
  const restaurantId = resolveRestaurantId(req);
  const event = req.body && req.body.event;

  if (!restaurantId) {
    res.status(400).json({ error: 'no_restaurant', message: 'Nincs etterem az adatbazisban.' });
    return;
  }

  const table = tableRepository.getByRestaurant(restaurantId)[0] || { id: 'tbl_TEST', label: 'A1' };
  const menuItem = menuItemRepository.all()[0] || { id: 'item_TEST', name: 'Teszt tetel' };

  const handlers = {
    [SOCKET_EVENTS.ORDER_CREATED]: () =>
      emitters.emitOrderCreated(buildTestOrder(restaurantId, req.body || {}), []),

    [SOCKET_EVENTS.ORDER_ITEM_STATUS_CHANGED]: () =>
      emitters.emitOrderItemStatusChanged(restaurantId, {
        id: `oit_TEST${Date.now()}`,
        orderId: 'ord_TEST',
        status: ORDER_ITEM_STATUS.PREPARING,
        isTest: true
      }),

    [SOCKET_EVENTS.ORDER_ITEM_SERVED]: () =>
      emitters.emitOrderItemServed(restaurantId, {
        id: `oit_TEST${Date.now()}`,
        orderId: 'ord_TEST',
        status: ORDER_ITEM_STATUS.SERVED,
        servedAt: new Date().toISOString(),
        isTest: true
      }),

    [SOCKET_EVENTS.TABLE_STATUS_CHANGED]: () =>
      emitters.emitTableStatusChanged(restaurantId, { ...table, status: 'occupied', isTest: true }),

    [SOCKET_EVENTS.TABLE_RESERVED]: () =>
      emitters.emitTableReserved(restaurantId, {
        id: `rsv_TEST${Date.now()}`,
        tableId: table.id,
        reservedFrom: new Date().toISOString(),
        reservedTo: new Date(Date.now() + 3600000).toISOString(),
        isTest: true
      }),

    [SOCKET_EVENTS.MENU_ITEM_AVAILABILITY_CHANGED]: () =>
      emitters.emitMenuItemAvailabilityChanged(restaurantId, {
        ...menuItem,
        isAvailable: false,
        isTest: true
      })
  };

  const handler = handlers[event];
  if (!handler) {
    res.status(400).json({
      error: 'unknown_event',
      message: 'Ismeretlen esemeny.',
      knownEvents: Object.keys(handlers)
    });
    return;
  }

  res.json({ emitted: handler(), event, restaurantId });
});

/**
 * POST /api/_test/set-item-status
 * Body: { orderItemId, status, restaurantId? }
 *
 * Egy valodi rendelesi tetel allapotat allitja at, es kikuldi a hozza tartozo
 * esemenyt. Amig a konyhai felulet (9. szegmens) nincs kesz, ezzel probalhato
 * ki, hogy a pinceri nezet valos idoben koveti-e a "készül" / "elkészült"
 * allapotokat. A konyhai vegpont elkeszultevel ez a vegpont torlendo.
 */
router.post('/set-item-status', optionalAuth, async (req, res, next) => {
  const restaurantId = resolveRestaurantId(req);
  const { orderItemId, status } = req.body || {};

  if (!restaurantId) {
    res.status(400).json({ error: 'no_restaurant', message: 'Nincs etterem az adatbazisban.' });
    return;
  }

  try {
    res.json(await orderService.updateItemStatus(restaurantId, orderItemId, status));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
