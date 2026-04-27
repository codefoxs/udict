const path = require('path');
const { createApp } = require('./src/server');

const PORT = 7219;
const STORE_KEY = 'udict.config';
const uiDir = path.join(__dirname, 'ui');

const storage = {
  load() {
    try {
      if (window.utools && window.utools.dbStorage) {
        return window.utools.dbStorage.getItem(STORE_KEY) || { dictionaries: [] };
      }
    } catch {}
    return { dictionaries: [] };
  },
  save(cfg) {
    try {
      if (window.utools && window.utools.dbStorage) {
        window.utools.dbStorage.setItem(STORE_KEY, cfg);
      }
    } catch (e) { console.error('[udict] save config failed:', e); }
  }
};

let app = null;
let mgr = null;

function start() {
  if (app) return;
  try {
    app = createApp(storage, uiDir);
    mgr = app.manager;
    app.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        console.warn('[udict] port in use, reusing external instance');
        app = null;
      } else {
        console.error('[udict] server error:', err);
      }
    });
    app.listen(PORT, '127.0.0.1');
  } catch (e) {
    console.error('[udict] preload start failed:', e);
  }
}

start();

window.udict = {
  base: `http://127.0.0.1:${PORT}`,
  onEnter(cb) {
    if (window.utools && window.utools.onPluginEnter) {
      window.utools.onPluginEnter(({ payload }) => {
        let word = '';
        if (typeof payload === 'string') word = payload;
        else if (payload && typeof payload === 'object') word = payload.text || payload.description || '';
        cb(word);
      });
    }
  },
  exit() {
    try { window.utools && window.utools.outPlugin && window.utools.outPlugin(); }
    catch {}
  },
  pickDirectory() {
    if (!window.utools || !window.utools.showOpenDialog) return null;
    const r = window.utools.showOpenDialog({
      title: 'Pick dictionary directory',
      properties: ['openDirectory']
    });
    return Array.isArray(r) && r.length ? r[0] : null;
  }
};

