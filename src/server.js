const http = require('http');
const path = require('path');
const fs = require('fs');
const { DictManager } = require('./dict');
const { rewriteHtml } = require('./resolver');
const cache = require('./cache');

const MIME = {
  '.css': 'text/css', '.js': 'application/javascript', '.html': 'text/html',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.spx': 'audio/ogg', '.m4a': 'audio/mp4',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.json': 'application/json'
};

function mimeOf(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

function stripDarkMedia(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const rest = css.slice(i);
    const m = rest.match(/@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/i);
    if (!m) { out += rest; break; }
    out += rest.slice(0, m.index);
    let depth = 1, j = m.index + m[0].length;
    while (j < rest.length && depth > 0) {
      const c = rest[j++];
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    i += j;
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => buf += c);
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}

function sendFile(res, fp) {
  fs.readFile(fp, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': mimeOf(fp) });
    res.end(data);
  });
}

function createApp(configPath, uiDir) {
  const mgr = new DictManager(configPath);

  const app = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;

      if (p === '/' || p === '/index.html') return sendFile(res, path.join(uiDir, 'index.html'));
      if (p === '/settings' || p === '/settings.html') return sendFile(res, path.join(uiDir, 'settings.html'));
      if (p === '/app.js' || p === '/app.css' || p === '/settings.js') {
        return sendFile(res, path.join(uiDir, p.slice(1)));
      }

      if (p === '/api/lookup') {
        const word = url.searchParams.get('q') || '';
        const resBase = `${url.protocol}//${req.headers.host}/res`;
        const results = (await mgr.lookup(word)).map(r => ({
          dict: r.dict, keyText: r.keyText,
          html: rewriteHtml(r.html, r.dict, resBase)
        }));
        return json(res, 200, { results });
      }

      if (p === '/api/prefix') {
        const word = url.searchParams.get('q') || '';
        return json(res, 200, { words: await mgr.prefix(word, 20) });
      }

      if (p === '/api/config' && req.method === 'GET') {
        return json(res, 200, { config: mgr.getConfig(), status: mgr.status() });
      }
      if (p === '/api/config' && req.method === 'POST') {
        const body = await readBody(req);
        if (!Array.isArray(body.dictionaries)) return json(res, 400, { error: 'dictionaries array required' });
        mgr.saveConfig(body.dictionaries);
        return json(res, 200, { ok: true, status: mgr.status() });
      }

      if (p === '/api/scan') {
        const dir = url.searchParams.get('path') || '';
        if (!dir || !fs.existsSync(dir)) return json(res, 400, { error: 'path not found' });
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch (e) { return json(res, 400, { error: e.message }); }
        const files = entries
          .filter(e => e.isFile())
          .map(e => {
            const fp = path.join(dir, e.name);
            let size = 0;
            try { size = fs.statSync(fp).size; } catch {}
            return { name: e.name, path: fp, size, ext: path.extname(e.name).toLowerCase() };
          });
        const mdxs = files.filter(f => f.ext === '.mdx');
        return json(res, 200, { dir, files, mdxs });
      }

      if (p === '/api/cache' && req.method === 'GET') {
        return json(res, 200, cache.stats());
      }
      if (p === '/api/cache' && req.method === 'DELETE') {
        const r = cache.clearAll();
        return json(res, 200, { ok: true, ...r, stats: cache.stats() });
      }

      if (p.startsWith('/res/')) {
        const rest = p.slice('/res/'.length);
        const slash = rest.indexOf('/');
        if (slash < 0) return notFound(res);
        const dictName = decodeURIComponent(rest.slice(0, slash));
        const key = decodeURIComponent(rest.slice(slash + 1));
        const buf = await mgr.getResource(dictName, key);
        if (!buf) return notFound(res);
        const mime = mimeOf(key);
        let out = buf;
        if (mime === 'text/css') {
          out = Buffer.from(stripDarkMedia(buf.toString('utf8')), 'utf8');
        }
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' });
        return res.end(out);
      }

      notFound(res);
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(e && e.stack || e));
    }
  });

  app.manager = mgr;
  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 7219;
  const app = createApp(
    path.join(__dirname, '..', 'config.json'),
    path.join(__dirname, '..', 'ui')
  );
  app.listen(port, '127.0.0.1', () => {
    console.log(`udict dev server at http://127.0.0.1:${port}`);
  });
}
