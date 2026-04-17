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
    // Render first result in iframe for style isolation
    const first = data.results[0];
    results.innerHTML = '';
    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent = `[${first.dict}] ${first.keyText}` + (data.results.length > 1 ? `  (+${data.results.length - 1} more)` : '');
    results.appendChild(meta);
    const iframe = document.createElement('iframe');
    iframe.className = 'entry-frame';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-popups';
    results.appendChild(iframe);
    iframe.srcdoc = wrapHtml(first.html);

    iframe.addEventListener('load', () => hookEntryClicks(iframe));
  }

  function wrapHtml(bodyHtml) {
    return `<!doctype html><html><head><meta charset="utf-8"/><base href="/"/>
<style>body{margin:0;padding:10px;font-family:-apple-system,"Segoe UI",system-ui,sans-serif;}</style>
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
