const fs = require('fs');
const path = require('path');
const { MDX, MDD } = require('js-mdict');
const cache = require('./cache');

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

class Dictionary {
  constructor({ name, mdx }) {
    this.name = name;
    this.mdxPath = mdx;
    this.baseDir = path.dirname(mdx);
    this.mdx = null;
    this.mdds = null;
    this._loading = null;

    this.cachedKeys = cache.loadKeys(mdx);
    this.cachedKeysSorted = this.cachedKeys
      ? [...this.cachedKeys].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      : null;
  }

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
    const results = this.mdx.lookupAll(word).filter(r => r.definition);
    const out = [];
    for (const r of results) {
      const m = /^@@@LINK=([^\r\n]+)/.exec(r.definition.trim());
      if (m) {
        for (const sub of await this.lookup(m[1].trim(), depth + 1)) out.push(sub);
      } else {
        out.push(r);
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
}

class DictManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.reload();
  }

  reload() {
    const cfg = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    this.dicts = (cfg.dictionaries || [])
      .filter(d => d && d.mdx && fs.existsSync(d.mdx))
      .map(d => new Dictionary(d));
  }

  saveConfig(dictionaries) {
    const cfg = { dictionaries };
    fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2), 'utf8');
    this.reload();
  }

  getConfig() {
    return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
  }

  async lookup(word) {
    const out = [];
    for (const d of this.dicts) {
      for (const entry of await d.lookup(word)) {
        out.push({ dict: d.name, keyText: entry.keyText, html: entry.definition });
      }
    }
    return out;
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
