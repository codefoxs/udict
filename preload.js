const fs = require('fs');
const path = require('path');
const { DictManager } = require('./src/dict');
const cache = require('./src/cache');

const STORE_KEY = 'udict.config';
const PREF_PREFIX = 'udict.pref.';

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

let mgr = null;
function ensure() {
  if (!mgr) mgr = new DictManager(storage);
  return mgr;
}

function prewarm() {
  try {
    const m = ensure();
    Promise.resolve().then(() => m.warmup()).catch(() => {});
  } catch (e) { console.error('[udict] prewarm failed:', e); }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prewarm, { once: true });
  } else {
    prewarm();
  }
}

window.udict = {
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
  isDark() {
    try { return !!(window.utools && window.utools.isDarkColors && window.utools.isDarkColors()); }
    catch { return false; }
  },
  pickDirectory() {
    if (!window.utools || !window.utools.showOpenDialog) return null;
    const r = window.utools.showOpenDialog({
      title: 'Pick dictionary directory',
      properties: ['openDirectory']
    });
    return Array.isArray(r) && r.length ? r[0] : null;
  },
  async lookup(word) {
    return await ensure().lookup(word);
  },
  async prefix(word, limit = 20) {
    return await ensure().prefix(word, limit);
  },
  config() {
    const m = ensure();
    return { config: m.getConfig(), status: m.status() };
  },
  saveConfig(dictionaries) {
    const m = ensure();
    m.saveConfig(dictionaries);
    return { status: m.status() };
  },
  scan(dir) {
    if (!dir || !fs.existsSync(dir)) throw new Error('path not found');
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries.filter(e => e.isFile()).map(e => {
      const fp = path.join(dir, e.name);
      let size = 0;
      try { size = fs.statSync(fp).size; } catch {}
      return { name: e.name, path: fp, size, ext: path.extname(e.name).toLowerCase() };
    });
    return { dir, files, mdxs: files.filter(f => f.ext === '.mdx') };
  },
  async getSound(dictName, key) {
    return await ensure().getResourceDataUri(dictName, key);
  },
  cacheStats() { return cache.stats(); },
  clearCache() { return cache.clearAll(); },
  getPref(key, def) {
    try {
      if (window.utools && window.utools.dbStorage) {
        const v = window.utools.dbStorage.getItem(PREF_PREFIX + key);
        return v == null ? def : v;
      }
    } catch {}
    return def;
  },
  setPref(key, val) {
    try {
      if (window.utools && window.utools.dbStorage) {
        if (val == null) window.utools.dbStorage.removeItem(PREF_PREFIX + key);
        else window.utools.dbStorage.setItem(PREF_PREFIX + key, val);
      }
    } catch (e) { console.error('[udict] setPref failed:', e); }
  }
};
