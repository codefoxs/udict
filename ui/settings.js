(function () {
  const BASE = (window.udict && window.udict.base) || '';
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
    const r = await fetch(BASE + '/api/config');
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
      return `<li draggable="true" data-idx="${i}">
        <div class="row">
          <span class="dict-drag" title="拖动排序">≡</span>
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
    dictList.querySelectorAll('li').forEach(li => {
      li.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', li.dataset.idx);
        e.dataTransfer.effectAllowed = 'move';
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drag-over'); });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', async e => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const src = +e.dataTransfer.getData('text/plain');
        const dst = +li.dataset.idx;
        if (isNaN(src) || src === dst) return;
        const [m] = currentDicts.splice(src, 1);
        currentDicts.splice(dst, 0, m);
        await saveDicts();
      });
    });
  }


  async function saveDicts() {
    const r = await fetch(BASE + '/api/config', {
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
    const dir = window.udict && window.udict.pickDirectory && window.udict.pickDirectory();
    if (dir) scanDirectory(dir);
    else if (!(window.udict && window.udict.pickDirectory)) {
      const p = prompt('Dictionary directory path:');
      if (p) scanDirectory(p);
    }
  });

  async function scanDirectory(dir) {
    const r = await fetch(BASE + '/api/scan?path=' + encodeURIComponent(dir));
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
    const r = await fetch(BASE + '/api/cache');
    const s = await r.json();
    cacheInfo.innerHTML = `<div><strong>Dir:</strong> <code>${esc(s.dir)}</code></div>
      <div><strong>Files:</strong> ${s.files} · <strong>Size:</strong> ${fmtBytes(s.bytes)}</div>`;
  }

  document.getElementById('btn-clear-cache').addEventListener('click', async () => {
    if (!confirm('Clear udict cache?')) return;
    await fetch(BASE + '/api/cache', { method: 'DELETE' });
    loadCache();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); location.href = 'index.html'; }
  });

  loadConfig();
  loadCache();
})();
