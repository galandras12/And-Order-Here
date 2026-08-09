const { Server } = require('socket.io');

const { config } = require('../config');
const authService = require('../services/authService');
const { restaurantRepository } = require('../db/repositories');
const { bindIo } = require('./emitters');
const {
  LIFECYCLE_EVENTS,
  SESSION_EVENT,
  ROOM_KEYS,
  ROLE_ROOM,
  roomName
} = require('../../shared/socketEvents');

/**
 * Socket.io szerver - ugyanabban a Node folyamatban es ugyanazon a porton,
 * mint az Express API (a meglevo http.Server peldanyra csatlakozik).
 *
 * Kapcsolodas:
 *   - a kliens a bejelentkezeskor kapott JWT tokent kuldi: socket.handshake.auth.token,
 *   - a szerver az authService.verifyToken()-nel ellenorzi,
 *   - ervenytelen token eseten a kapcsolat elutasitasra kerul,
 *   - token nelkul csak a publikus online felulet csatlakozhat (vendeg).
 *
 * A kliens a szerepkore alapjan automatikusan a megfelelo szoba(k)ba kerul:
 *   restaurant:{restaurantId}:waiters | kitchen | admin | logistics | online
 */

/** A vendeg (online) kliens ettermenek meghatarozasa. */
function resolveGuestRestaurantId(handshake) {
  const requested = handshake.auth && handshake.auth.restaurantId;
  if (requested && restaurantRepository.exists(requested)) return requested;

  const fallback = restaurantRepository.getDefaultRestaurant();
  return fallback ? fallback.id : null;
}

/**
 * Handshake ellenorzese. Sikeres esetben a socket.data-ba kerul a
 * felhasznalo, az etterem es a szobak listaja.
 */
function authenticate(socket, next) {
  const token = socket.handshake.auth && socket.handshake.auth.token;

  // Token nelkul: publikus online vendeg, csak az online szobaba kerul.
  if (!token) {
    const restaurantId = resolveGuestRestaurantId(socket.handshake);
    if (!restaurantId) {
      next(new Error('Nincs etterem, a kapcsolodas nem lehetseges.'));
      return;
    }

    socket.data.user = null;
    socket.data.guest = true;
    socket.data.restaurantId = restaurantId;
    socket.data.rooms = [roomName(restaurantId, ROOM_KEYS.ONLINE)];
    next();
    return;
  }

  try {
    const { user } = authService.verifyToken(token);
    const roomKey = ROLE_ROOM[user.role];
    if (!roomKey) {
      next(new Error('Ehhez a szerepkorhoz nincs valos ideju csatorna.'));
      return;
    }

    socket.data.user = user;
    socket.data.guest = false;
    socket.data.restaurantId = user.restaurantId;
    socket.data.rooms = [roomName(user.restaurantId, roomKey)];
    next();
  } catch (err) {
    // Az AuthError uzenete (lejart / ervenytelen token) eljut a klienshez,
    // hogy az ujra tudjon jelentkezni.
    const error = new Error(err.message || 'Ervenytelen token.');
    error.data = { code: err.code || 'unauthorized' };
    next(error);
  }
}

/**
 * @param {import('http').Server} httpServer
 * @returns {Server} az inicializalt Socket.io szerver
 */
function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin }
  });

  io.use(authenticate);

  io.on(LIFECYCLE_EVENTS.CONNECTION, (socket) => {
    const { user, guest, rooms, restaurantId } = socket.data;

    socket.join(rooms);

    const who = guest ? 'vendeg (online)' : `${user.name} [${user.role}]`;
    console.log(`[socket] kapcsolodott: ${socket.id} - ${who} -> ${rooms.join(', ')}`);

    // A kliens visszajelzest kap arrol, hogy sikerult a beleptetes es hova.
    socket.emit(SESSION_EVENT, {
      socketId: socket.id,
      restaurantId,
      rooms,
      user: user || null
    });

    socket.on(LIFECYCLE_EVENTS.DISCONNECT, (reason) => {
      console.log(`[socket] bontva: ${socket.id} - ${who} (${reason})`);
    });
  });

  // Az emitter reteg innen kapja meg a peldanyt, igy a service/route reteg
  // sosem hivja kozvetlenul a Socket.io API-t.
  bindIo(io);

  return io;
}

module.exports = { initSockets };
