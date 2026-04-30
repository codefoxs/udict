const fs = require('fs');
const path = require('path');
const { MDX, MDD } = require('js-mdict');
const cache = require('./cache');
const { inlineEntry, mimeOf } = require('./resolver');

function extractAllKeys(mdx) {
  const out = [];
  for (let b = 0; b < 100000; b++) {
    let list;
    try { list = mdx.lookupPartialKeyBlockListByKeyInfoId(b); } catch { break; }
    if (!list || !list.length) break;
    for (const it of list) out.push(it.keyText);
  }
  return out;
}

function prefixScan(sortedKeys, word, limit) {
  const out = [];
  const w = word.toLowerCase();
  for (const k of sortedKeys) {
    if (k.toLowerCase().startsWith(w)) {
      out.push(k);
      if (out.length >= limit) break;
    }
  }
  return out;
}

const RES_CACHE_MAX = 200;
const CSS_CACHE_MAX = 64;

function lruSet(map, key, value, max) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size > max) {
    const first = map.keys().next().value;
    map.delete(first);
  }
}

class Dictionary {
  constructor({ name, mdx }) {
    this.name = name;
    this.mdxPath = mdx;
    this.baseDir = path.dirname(mdx);
    this.mdx = null;
    this.mdds = null;
    this._loading = null;

    this._resCache = new Map();
    this._cssCache = new Map();

    this.cachedKeys = cache.loadKeys(mdx);
    this.cachedKeysSorted = this.cachedKeys
      ? [...this.cachedKeys].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      : null;
  }

  getCachedResUri(key) { return this._resCache.get(key); }
  setCachedResUri(key, uri) { lruSet(this._resCache, key, uri, RES_CACHE_MAX); }
  getCachedInlinedCss(key) { return this._cssCache.get(key); }
  setCachedInlinedCss(key, css) { lruSet(this._cssCache, key, css, CSS_CACHE_MAX); }

  async ensureLoaded() {
    if (this.mdx) return;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const t0 = Date.now();
      this.mdx = new MDX(this.mdxPath);

      const base = path.basename(this.mdxPath, path.extname(this.mdxPath));
      const siblings = fs.readdirSync(this.baseDir);
      const mddNames = siblings.filter(f => {
        const ext = path.extname(f).toLowerCase();
        if (ext !== '.mdd') return false;
        const stem = path.basename(f, ext);
        return stem === base || stem.startsWith(base + '.');
      });
      this.mddPaths = mddNames.map(n => path.join(this.baseDir, n));
      this.mdds = this.mddPaths.map(p => new MDD(p));

      if (!this.cachedKeys) {
        try {
          const keys = extractAllKeys(this.mdx);
          this.cachedKeys = keys;
          this.cachedKeysSorted = [...keys].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
          cache.saveKeys(this.mdxPath, keys);
        } catch (e) {
          console.error('[udict] key extraction failed:', e.message);
        }
      }
      this.loadMs = Date.now() - t0;
      console.log(`[udict] loaded ${this.name} in ${this.loadMs}ms (${this.cachedKeys ? this.cachedKeys.length : '?'} keys, ${this.mdds.length} mdd)`);
    })();
    return this._loading;
  }

  loaded() { return !!this.mdx; }

  async lookup(word, depth = 0) {
    if (depth > 5) return [];
    await this.ensureLoaded();
    let results = this.mdx.lookupAll(word).filter(r => r.definition);
    if (!results.length && depth === 0 && this.cachedKeys) {
      const lower = word.toLowerCase();
      const tried = new Set([word]);
      for (const k of this.cachedKeys) {
        if (tried.has(k)) continue;
        if (k.toLowerCase() !== lower) continue;
        tried.add(k);
        const r = this.mdx.lookupAll(k).filter(x => x.definition);
        for (const item of r) results.push(item);
      }
    }
    const out = [];
    const seen = new Set();
    for (const r of results) {
      const m = /^@@@LINK=([^\r\n]+)/.exec(r.definition.trim());
      if (m) {
        for (const sub of await this.lookup(m[1].trim(), depth + 1)) {
          const sig = sub.keyText + '\0' + sub.definition.length;
          if (!seen.has(sig)) { seen.add(sig); out.push(sub); }
        }
      } else {
        const sig = r.keyText + '\0' + r.definition.length;
        if (!seen.has(sig)) { seen.add(sig); out.push(r); }
      }
    }
    return out;
  }

  prefixFast(word, limit = 20) {
    if (this.cachedKeysSorted) {
      return prefixScan(this.cachedKeysSorted, word, limit);
    }
    return null;
  }

  async prefix(word, limit = 20) {
    const fast = this.prefixFast(word, limit);
    if (fast) return fast;
    await this.ensureLoaded();
    try {
      return this.mdx.prefix(word).slice(0, limit).map(k => k.keyText);
    } catch {
      return [];
    }
  }

  async getResource(resKey) {
    await this.ensureLoaded();
    for (const mdd of this.mdds) {
      const r = mdd.locate(resKey);
      if (r.definition) return Buffer.from(r.definition, 'base64');
    }
    const candidate = path.join(this.baseDir, resKey.replace(/^[\\/]+/, '').replace(/\\/g, '/'));
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return fs.readFileSync(candidate);
      }
    } catch {}
    return null;
  }

  async getResourceB64(resKey) {
    await this.ensureLoaded();
    if (this.mdds) {
      for (const mdd of this.mdds) {
        const r = mdd.locate(resKey);
        if (r && r.definition) return r.definition;
      }
    }
    const candidate = path.join(this.baseDir, resKey.replace(/^[\\/]+/, '').replace(/\\/g, '/'));
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return fs.readFileSync(candidate).toString('base64');
      }
    } catch {}
    return null;
  }
}

const ENTRY_CACHE_MAX = 200;

class DictManager {
  constructor(storage) {
    this.storage = storage;
    this._entryCache = new Map();
    this.reload();
  }

  reload() {
    const cfg = this.storage.load() || {};
    this.cfg = { dictionaries: cfg.dictionaries || [] };
    this.dicts = this.cfg.dictionaries
      .filter(d => d && d.mdx && fs.existsSync(d.mdx))
      .map(d => new Dictionary(d));
    this._entryCache.clear();
  }

  async warmup() {
    await Promise.all(this.dicts.map(d => d.ensureLoaded().catch(e => {
      console.error('[udict] warmup failed for', d.name, e.message);
    })));
  }

  saveConfig(dictionaries) {
    this.storage.save({ dictionaries });
    this.reload();
  }

  getConfig() {
    return this.cfg;
  }

  async lookup(word) {
    const perDict = await Promise.all(this.dicts.map(async d => {
      const entries = await d.lookup(word);
      const items = await Promise.all(entries.map(async entry => {
        const cacheKey = d.name + '\0' + entry.keyText + '\0' + entry.definition.length;
        let html = this._entryCache.get(cacheKey);
        if (html === undefined) {
          html = await inlineEntry(entry.definition, d);
          lruSet(this._entryCache, cacheKey, html, ENTRY_CACHE_MAX);
        } else {
          this._entryCache.delete(cacheKey);
          this._entryCache.set(cacheKey, html);
        }
        return { dict: d.name, keyText: entry.keyText, html };
      }));
      return items;
    }));
    return perDict.flat();
  }

  async getResourceDataUri(dictName, resKey) {
    const d = this.dicts.find(x => x.name === dictName) || this.dicts[0];
    if (!d) return null;
    const buf = await d.getResource(resKey);
    if (!buf) return null;
    return `data:${mimeOf(resKey)};base64,${buf.toString('base64')}`;
  }

  async prefix(word, limit = 20) {
    const seen = new Set();
    const out = [];
    for (const d of this.dicts) {
      for (const k of await d.prefix(word, limit)) {
        if (!seen.has(k)) { seen.add(k); out.push(k); }
      }
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
  }

  prefixSync(word, limit = 20) {
    const seen = new Set();
    const out = [];
    for (const d of this.dicts) {
      const fast = d.prefixFast(word, limit);
      if (!fast) continue;
      for (const k of fast) {
        if (!seen.has(k)) { seen.add(k); out.push(k); }
      }
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
  }

  async getResource(dictName, resKey) {
    const d = this.dicts.find(x => x.name === dictName) || this.dicts[0];
    return d ? await d.getResource(resKey) : null;
  }

  status() {
    return this.dicts.map(d => ({
      name: d.name,
      mdx: d.mdxPath,
      loaded: d.loaded(),
      cachedKeys: d.cachedKeys ? d.cachedKeys.length : 0,
      mddCount: d.mdds ? d.mdds.length : null
    }));
  }
}

module.exports = { Dictionary, DictManager };
