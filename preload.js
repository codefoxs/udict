const path = require('path');
const { createApp } = require('./src/server');

const PORT = 7219;
const configPath = path.join(__dirname, 'config.json');
const uiDir = path.join(__dirname, 'ui');

let app = null;
let mgr = null;

function start() {
  if (app) return;
  try {
    app = createApp(configPath, uiDir);
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
  openExternal(url) {
    try {
      if (window.utools && window.utools.shellOpenExternal) return window.utools.shellOpenExternal(url);
      if (window.require) {
        const { shell } = window.require('electron');
        if (shell && shell.openExternal) return shell.openExternal(url);
      }
    } catch {}
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

