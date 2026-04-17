const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function cacheRoot() {
  if (process.env.UDICT_CACHE_DIR) return process.env.UDICT_CACHE_DIR;
  return path.join(os.homedir(), '.udict-cache');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function fingerprint(mdxPath) {
  const st = fs.statSync(mdxPath);
  const tag = `${path.resolve(mdxPath)}|${st.size}|${Math.floor(st.mtimeMs)}`;
  return crypto.createHash('sha1').update(tag).digest('hex').slice(0, 16);
}

function keysFile(mdxPath) {
  return path.join(cacheRoot(), `${fingerprint(mdxPath)}.keys.txt`);
}

function loadKeys(mdxPath) {
  try {
    const fp = keysFile(mdxPath);
    if (!fs.existsSync(fp)) return null;
    const data = fs.readFileSync(fp, 'utf8');
    return data.length ? data.split('\n') : [];
  } catch { return null; }
}

function saveKeys(mdxPath, keys) {
  try {
    ensureDir(cacheRoot());
    fs.writeFileSync(keysFile(mdxPath), keys.join('\n'), 'utf8');
    return true;
  } catch (e) {
    console.error('[udict cache] saveKeys failed:', e.message);
    return false;
  }
}

function dirSize(dir) {
  let total = 0, files = 0;
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try { total += fs.statSync(p).size; files++; } catch {}
      }
    }
  }
  walk(dir);
  return { bytes: total, files };
}

function stats() {
  const root = cacheRoot();
  if (!fs.existsSync(root)) return { dir: root, bytes: 0, files: 0 };
  const s = dirSize(root);
  return { dir: root, ...s };
}

function clearAll() {
  const root = cacheRoot();
  if (!fs.existsSync(root)) return { removed: 0 };
  let removed = 0;
  for (const f of fs.readdirSync(root)) {
    try { fs.unlinkSync(path.join(root, f)); removed++; } catch {}
  }
  return { removed };
}

module.exports = { cacheRoot, loadKeys, saveKeys, stats, clearAll, keysFile };
