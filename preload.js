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
        let word = window._udictPending || '';
        window._udictPending = '';
        if (!word) {
          if (typeof payload === 'string') word = payload;
          else if (payload && typeof payload === 'object') word = payload.text || payload.description || '';
        }
        cb(word);
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
    (action, option) => {
      const opt = option || (action && action.option) || {};
      const word = opt.text || opt.description || (action && action.payload) || '';
      window._udictPending = String(word);
      // Returning nothing lets uTools enter the plugin; onPluginEnter reads _udictPending.
    }
  );
}
