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
        cb(typeof payload === 'string' ? payload : '');
      });
    }
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

// uTools main-input suggestions. onMainPush is called as user types after keyword.
if (window.utools && window.utools.onMainPush) {
  window.utools.onMainPush(
    ({ code, type, payload }) => {
      if (!mgr) return [];
      const q = (typeof payload === 'string' ? payload : '').trim();
      if (!q) return [];
      const words = mgr.prefixSync(q, 8);
      if (!words.length) return [{ icon: 'logo.png', text: q, title: 'udict', description: 'Look up "' + q + '"' }];
      return words.map(w => ({ icon: 'logo.png', text: w, title: 'udict', description: w }));
    },
    ({ code, type, payload, option }) => {
      return { text: (option && option.text) || payload || '' };
    }
  );
}
