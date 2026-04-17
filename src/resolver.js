function rewriteHtml(html, dictName, resBase) {
  const prefix = `${resBase}/${encodeURIComponent(dictName)}/`;

  html = html.replace(/sound:\/\/+([^"'\s<>)]+)/gi,
    (_, key) => `javascript:void(0)" data-udict-sound="${prefix}${encodeURI(key)}`);

  html = html.replace(/entry:\/\/+([^"'\s<>)]+)/gi,
    (_, key) => `javascript:void(0)" data-udict-entry="${decodeURIComponent(key)}`);

  html = html.replace(/file:\/\/+([^"'\s<>)]+)/gi,
    (_, key) => `${prefix}${encodeURI(key)}`);

  html = html.replace(/\s(src|href)\s*=\s*(["'])([^"'>]+)\2/gi, (m, attr, q, val) => {
    if (/^(https?:|data:|blob:|javascript:|#|\/\/|mailto:)/i.test(val)) return m;
    if (val.startsWith(prefix) || val.startsWith(resBase)) return m;
    if (val.startsWith('/')) return m;
    return ` ${attr}=${q}${prefix}${encodeURI(val)}${q}`;
  });

  return html;
}

module.exports = { rewriteHtml };
