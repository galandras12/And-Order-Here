const path = require('path');
const express = require('express');

const healthRouter = require('./health');
const { INTERFACES } = require('../../shared/constants');

const ROOT_DIR = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

/**
 * Minden route felregisztralasa az Express alkalmazasra.
 *
 * - /health          -> allapot API
 * - /shared          -> kozos konstansok a bongeszo szamara
 * - /assets          -> kozos statikus fajlok (CSS, kesobb kepek/JS)
 * - /waiter, /admin, /logistics, /kitchen, /online -> feluletenkenti statikus mappa
 * - /                -> nyitolap a felulet valasztoval
 */
function registerRoutes(app) {
  app.use('/health', healthRouter);

  app.use('/shared', express.static(path.join(ROOT_DIR, 'shared')));
  app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));

  for (const ui of INTERFACES) {
    const dir = path.join(PUBLIC_DIR, ui.key);
    // Perjel nelkuli alak (/waiter) is kozvetlenul az index.html-t adja vissza,
    // atiranyitas nelkul; minden mas fajlt a statikus kiszolgalo ad.
    app.get(ui.path, (req, res) => res.sendFile(path.join(dir, 'index.html')));
    app.use(ui.path, express.static(dir));
  }

  app.use('/', express.static(PUBLIC_DIR, { index: 'index.html' }));

  // 404 - JSON a /api es /health kereseknek, egyebkent egyszeru szoveg.
  app.use((req, res) => {
    res.status(404);
    if (req.accepts('html')) {
      res.type('html').send('<h1>404 - Nem talalhato</h1>');
      return;
    }
    res.json({ error: 'not_found' });
  });

  // Kozponti hibakezelo.
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('[error]', err);
    res.status(err.status || 500).json({ error: 'internal_server_error' });
  });
}

module.exports = { registerRoutes, PUBLIC_DIR };
