(function () {
  const dictList = document.getElementById('dict-list');
  const scanSection = document.getElementById('scan-section');
  const scanDir = document.getElementById('scan-dir');
  const scanList = document.getElementById('scan-list');
  const cacheInfo = document.getElementById('cache-info');

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  let currentDicts = [];

  async function loadConfig() {
    const r = await fetch('/api/config');
    const { config, status } = await r.json();
    currentDicts = config.dictionaries || [];
    renderDicts(status);
  }

  function renderDicts(status) {
    if (!currentDicts.length) {
      dictList.innerHTML = '<li class="empty">No dictionaries configured. Pick a directory to add one.</li>';
      return;
    }
    dictList.innerHTML = currentDicts.map((d, i) => {
      const st = status.find(s => s.mdx === d.mdx) || {};
      return `<li>
        <div class="row">
          <div class="info">
            <div class="name">${esc(d.name)}</div>
            <div class="path">${esc(d.mdx)}</div>
            <div class="meta">${st.loaded ? 'loaded' : 'lazy'} · ${st.cachedKeys || 0} keys${st.mddCount != null ? ' · ' + st.mddCount + ' mdd' : ''}</div>
          </div>
          <button data-idx="${i}" class="danger remove">Remove</button>
        </div>
      </li>`;
    }).join('');
    dictList.querySelectorAll('button.remove').forEach(b => {
      b.addEventListener('click', () => removeDict(+b.dataset.idx));
    });
  }

  async function saveDicts() {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dictionaries: currentDicts })
    });
    const j = await r.json();
    renderDicts(j.status || []);
  }

  async function removeDict(idx) {
    currentDicts.splice(idx, 1);
    await saveDicts();
  }

  async function addDict(mdxPath) {
    const name = mdxPath.split(/[\\/]/).pop().replace(/\.mdx$/i, '');
    if (currentDicts.find(d => d.mdx === mdxPath)) return;
    currentDicts.push({ name, mdx: mdxPath });
    await saveDicts();
  }

  document.getElementById('btn-pick').addEventListener('click', () => {
    // Ask parent (plugin host) for directory via utools dialog.
    // Fallback: prompt.
    parent.postMessage({ type: 'udict-pick-dir' }, '*');
  });

  window.addEventListener('message', async e => {
    if (!e.data) return;
    if (e.data.type === 'udict-dir-picked' && e.data.path) {
      await scanDirectory(e.data.path);
    }
  });

  // Fallback if not running inside the plugin host: prompt
  let picked = false;
  window.addEventListener('message', () => { picked = true; });
  document.getElementById('btn-pick').addEventListener('click', () => {
    setTimeout(() => {
      if (picked) return;
      const p = prompt('Dictionary directory path:');
      if (p) scanDirectory(p);
    }, 300);
  });

  async function scanDirectory(dir) {
    const r = await fetch('/api/scan?path=' + encodeURIComponent(dir));
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert('Scan failed: ' + (j.error || r.status));
      return;
    }
    const { files, mdxs } = await r.json();
    scanSection.style.display = '';
    scanDir.textContent = dir;
    scanList.innerHTML = files.slice(0, 200).map(f => {
      const isMdx = f.ext === '.mdx';
      return `<li class="${isMdx ? 'mdx' : ''}" data-path="${esc(f.path)}" data-mdx="${isMdx ? 1 : 0}">
        <span class="fn">${esc(f.name)}</span>
        <span class="sz">${fmtBytes(f.size)}</span>
      </li>`;
    }).join('');
    scanList.querySelectorAll('li.mdx').forEach(li => {
      li.addEventListener('click', () => addDict(li.dataset.path));
    });
    if (!mdxs.length) {
      scanList.insertAdjacentHTML('afterbegin', '<li class="empty">No .mdx files in this directory.</li>');
      return;
    }
    // Auto-add any mdx files not already configured
    let added = 0;
    for (const m of mdxs) {
      if (!currentDicts.find(d => d.mdx === m.path)) {
        const name = m.name.replace(/\.mdx$/i, '');
        currentDicts.push({ name, mdx: m.path });
        added++;
      }
    }
    if (added) await saveDicts();
  }

  async function loadCache() {
    const r = await fetch('/api/cache');
    const s = await r.json();
    cacheInfo.innerHTML = `<div><strong>Dir:</strong> <code>${esc(s.dir)}</code></div>
      <div><strong>Files:</strong> ${s.files} · <strong>Size:</strong> ${fmtBytes(s.bytes)}</div>`;
  }

  document.getElementById('btn-clear-cache').addEventListener('click', async () => {
    if (!confirm('Clear udict cache?')) return;
    await fetch('/api/cache', { method: 'DELETE' });
    loadCache();
  });

  loadConfig();
  loadCache();
})();
