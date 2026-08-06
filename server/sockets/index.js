const { Server } = require('socket.io');

const { config } = require('../config');
const { SOCKET_EVENTS } = require('../../shared/constants');

/**
 * Socket.io alapinicializalas.
 *
 * Ebben a fejezetben meg nincsenek uzleti esemenyek: csak a kapcsolodast es a
 * bontast logoljuk, hogy a valos ideju csatorna kesobb erre epulhessen.
 *
 * @param {import('http').Server} httpServer
 * @returns {Server} az inicializalt Socket.io szerver
 */
function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin }
  });

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    console.log(`[socket] kapcsolodott: ${socket.id}`);

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      console.log(`[socket] bontva: ${socket.id} (${reason})`);
    });
  });

  return io;
}

module.exports = { initSockets };
