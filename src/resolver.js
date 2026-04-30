const path = require('path');

const MIME_BY_EXT = {
  '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.spx': 'audio/ogg', '.m4a': 'audio/mp4'
};

function mimeOf(p) {
  const i = p.indexOf('?'); if (i >= 0) p = p.slice(0, i);
  const j = p.indexOf('#'); if (j >= 0) p = p.slice(0, j);
  return MIME_BY_EXT[path.extname(p).toLowerCase()] || 'application/octet-stream';
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

async function asyncReplace(str, regex, fn) {
  const matches = [...str.matchAll(regex)];
  if (!matches.length) return str;
  const replacements = await Promise.all(
    matches.map(m => Promise.resolve(fn(m[0], ...m.slice(1))))
  );
  let out = '', last = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    out += str.slice(last, m.index) + replacements[i];
    last = m.index + m[0].length;
  }
  out += str.slice(last);
  return out;
}

function dataUri(refUrl, dict) {
  if (!refUrl) return Promise.resolve(null);
  const clean = refUrl.split(/[?#]/)[0];
  if (dict.getCachedResUri) {
    const hit = dict.getCachedResUri(clean);
    if (hit !== undefined) return Promise.resolve(hit);
  }
  const p = (async () => {
    if (dict.getResourceB64) {
      const b64 = await dict.getResourceB64(clean);
      return b64 ? `data:${mimeOf(clean)};base64,${b64}` : null;
    }
    const buf = await dict.getResource(clean);
    return buf ? `data:${mimeOf(clean)};base64,${buf.toString('base64')}` : null;
  })();
  if (dict.setCachedResUri) dict.setCachedResUri(clean, p);
  return p;
}

async function inlineCss(cssText, dict) {
  cssText = stripDarkMedia(cssText);
  return asyncReplace(cssText, /url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi,
    async (full, _q, url) => {
      url = url.trim();
      if (/^(data:|https?:|#)/i.test(url)) return full;
      const uri = await dataUri(url, dict);
      return uri ? `url(${uri})` : full;
    });
}

async function inlineEntry(html, dict) {
  html = html.replace(/sound:\/\/+([^"'\s<>)]+)/gi,
    (_, key) => `javascript:void(0)" data-udict-sound="${decodeURIComponent(key)}`);

  html = html.replace(/entry:\/\/+([^"'\s<>)]+)/gi,
    (_, key) => `javascript:void(0)" data-udict-entry="${decodeURIComponent(key)}`);

  html = await asyncReplace(html, /<link\b[^>]*\brel\s*=\s*["']?stylesheet["']?[^>]*>/gi,
    async (tag) => {
      const m = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (!m) return tag;
      if (/^(https?:|data:)/i.test(m[1])) return '';
      const key = m[1].split(/[?#]/)[0];
      let cssPromise = dict.getCachedInlinedCss && dict.getCachedInlinedCss(key);
      if (cssPromise === undefined) {
        cssPromise = (async () => {
          const buf = await dict.getResource(key);
          if (!buf) return '';
          return await inlineCss(buf.toString('utf8'), dict);
        })();
        if (dict.setCachedInlinedCss) dict.setCachedInlinedCss(key, cssPromise);
      }
      const css = await cssPromise;
      if (!css) return '';
      return `<style>${css}</style>`;
    });

  html = await asyncReplace(html, /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    async (full, css) => {
      const newCss = await inlineCss(css, dict);
      if (newCss === css) return full;
      return full.slice(0, full.indexOf(css)) + newCss + full.slice(full.indexOf(css) + css.length);
    });

  html = await asyncReplace(html, /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    async (full, src) => {
      if (/^(https?:|data:)/i.test(src)) return '';
      const buf = await dict.getResource(src.split(/[?#]/)[0]);
      if (!buf) return '';
      return `<script>${buf.toString('utf8')}</script>`;
    });

  html = await asyncReplace(html, /file:\/\/+([^"'\s<>)]+)/gi,
    async (full, key) => (await dataUri(decodeURIComponent(key), dict)) || full);

  html = await asyncReplace(html, /\s(src|href|data-src|poster)\s*=\s*(["'])([^"']+)\2/gi,
    async (full, attr, q, val) => {
      if (/^(data:|https?:|blob:|javascript:|#|\/\/|mailto:)/i.test(val)) return full;
      const uri = await dataUri(val, dict);
      return uri ? ` ${attr}=${q}${uri}${q}` : full;
    });

  html = await asyncReplace(html, /\bstyle\s*=\s*"([^"]*url\([^)]*\)[^"]*)"/gi,
    async (full, styleVal) => {
      const newStyle = await inlineCss(styleVal, dict);
      if (newStyle === styleVal) return full;
      return full.replace(styleVal, newStyle);
    });

  return html;
}

module.exports = { inlineEntry, mimeOf, stripDarkMedia };
