const http = require('http');
const express = require('express');

const { config, warnMissing } = require('./config');
const { registerRoutes } = require('./routes');
const { initSockets } = require('./sockets');
const db = require('./db');
const { INTERFACES } = require('../shared/constants');

warnMissing();

const app = express();
app.disable('x-powered-by');
app.use(express.json());

registerRoutes(app);

const httpServer = http.createServer(app);
const io = initSockets(httpServer);

// A kesobbi route-ok innen erik el a Socket.io peldanyt: req.app.get('io')
app.set('io', io);

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] A ${config.port} port foglalt. Allitsd at a PORT valtozot a .env fajlban.`);
  } else {
    console.error('[server] Szerver hiba:', err);
  }
  process.exit(1);
});

async function start() {
  await db.connect();

  httpServer.listen(config.port, () => {
    console.log(`[server] Fut: http://localhost:${config.port} (${config.env})`);
    console.log(`[server] Allapot: http://localhost:${config.port}/health`);
    for (const ui of INTERFACES) {
      console.log(`[server] ${ui.title}: http://localhost:${config.port}${ui.path}`);
    }
  });
}

function shutdown(signal) {
  console.log(`\n[server] ${signal} - leallas...`);
  io.close();
  httpServer.close(async () => {
    await db.disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('[server] Indulasi hiba:', err);
  process.exit(1);
});

module.exports = { app, httpServer, io };
