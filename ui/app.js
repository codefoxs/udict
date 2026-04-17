(function () {
  const qInput = document.getElementById('q');
  const sugList = document.getElementById('suggest');
  const results = document.getElementById('results');

  let sugTimer = 0;
  let activeIdx = -1;
  let currentSug = [];

  qInput.addEventListener('input', () => {
    clearTimeout(sugTimer);
    sugTimer = setTimeout(doSuggest, 120);
  });

  qInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (activeIdx >= 0 && currentSug[activeIdx]) {
        qInput.value = currentSug[activeIdx];
      }
      hideSuggest();
      doLookup(qInput.value.trim());
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentSug.length) { activeIdx = (activeIdx + 1) % currentSug.length; renderSugActive(); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentSug.length) { activeIdx = (activeIdx - 1 + currentSug.length) % currentSug.length; renderSugActive(); }
    } else if (e.key === 'Escape') {
      hideSuggest();
    }
  });

  async function doSuggest() {
    const q = qInput.value.trim();
    if (!q) return hideSuggest();
    const r = await fetch('/api/prefix?q=' + encodeURIComponent(q));
    const { words } = await r.json();
    currentSug = words || [];
    activeIdx = -1;
    if (!currentSug.length) return hideSuggest();
    sugList.innerHTML = currentSug.map(w => `<li>${escapeHtml(w)}</li>`).join('');
    sugList.classList.add('show');
    Array.from(sugList.children).forEach((li, i) => {
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        qInput.value = currentSug[i];
        hideSuggest();
        doLookup(currentSug[i]);
      });
    });
  }

  function renderSugActive() {
    Array.from(sugList.children).forEach((li, i) => li.classList.toggle('active', i === activeIdx));
  }

  function hideSuggest() {
    sugList.classList.remove('show');
    currentSug = [];
    activeIdx = -1;
  }

  async function doLookup(word) {
    if (!word) return;
    results.innerHTML = '<div class="empty">Looking up...</div>';
    const r = await fetch('/api/lookup?q=' + encodeURIComponent(word));
    const data = await r.json();
    if (!data.results || !data.results.length) {
      results.innerHTML = '<div class="empty">No results for "' + escapeHtml(word) + '"</div>';
      return;
    }
    results.innerHTML = '';
    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    const dictNames = [...new Set(data.results.map(r => r.dict))];
    meta.textContent = `${data.results.length} entries from ${dictNames.length} dict(s): ${dictNames.join(', ')}`;
    results.appendChild(meta);
    const iframe = document.createElement('iframe');
    iframe.className = 'entry-frame';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-popups';
    results.appendChild(iframe);

    const parts = data.results.map(r =>
      `<section class="udict-entry" data-dict="${escapeHtml(r.dict)}">
         <header class="udict-entry-head">【${escapeHtml(r.dict)}】${escapeHtml(r.keyText)}</header>
         <div class="udict-entry-body">${stripDarkMedia(r.html)}</div>
       </section>`
    ).join('<hr class="udict-sep"/>');
    iframe.srcdoc = wrapHtml(parts);
  }

  function stripDarkMedia(css) {
    let out = '', i = 0;
    while (i < css.length) {
      const m = css.slice(i).match(/@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/i);
      if (!m) { out += css.slice(i); break; }
      out += css.slice(i, i + m.index);
      let depth = 1, j = i + m.index + m[0].length;
      while (j < css.length && depth > 0) {
        const c = css[j++];
        if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      i = j;
    }
    return out;
  }

  function wrapHtml(bodyHtml) {
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="color-scheme" content="light"/><base href="/"/>
<style>
  :root{color-scheme:light!important;}
  html,body{background:#fff!important;color:#222!important;}
  body{margin:0;padding:10px;font-family:-apple-system,"Segoe UI",system-ui,sans-serif;}
  .udict-entry-head{font:600 13px -apple-system,"Segoe UI",sans-serif;color:#4a90e2;padding:6px 0;border-bottom:1px solid #eee;margin-bottom:8px;}
  .udict-sep{border:0;border-top:2px dashed #ccd;margin:18px 0;}
</style>
</head><body>${bodyHtml}
<script>
document.addEventListener('click', function(e){
  var t = e.target;
  while (t && t !== document.body) {
    if (t.dataset && t.dataset.udictSound) {
      e.preventDefault();
      try { new Audio(t.dataset.udictSound).play(); } catch(err){}
      return;
    }
    if (t.dataset && t.dataset.udictEntry) {
      e.preventDefault();
      parent.postMessage({type:'udict-entry', word:t.dataset.udictEntry}, '*');
      return;
    }
    t = t.parentNode;
  }
}, true);
<\/script></body></html>`;
  }

  function hookEntryClicks() { /* handled via postMessage */ }

  window.addEventListener('message', e => {
    if (!e.data) return;
    if (e.data.type === 'udict-entry' || e.data.type === 'udict-query') {
      const w = e.data.word || '';
      qInput.value = w;
      qInput.focus();
      if (w) doLookup(w);
    }
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
})();
