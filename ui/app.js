(function () {
  const qInput = document.getElementById('q');
  const sugList = document.getElementById('suggest');
  const results = document.getElementById('results');
  const dictJump = document.getElementById('dict-jump');
  const fontVal = document.getElementById('font-val');
  const sideToggle = document.getElementById('side-toggle');

  let sugTimer = 0;
  let activeIdx = -1;
  let currentSug = [];
  let currentIframe = null;
  let currentWord = '';

  const getPref = (window.udict && window.udict.getPref) ? window.udict.getPref : (k, d) => d;
  const setPref = (window.udict && window.udict.setPref) ? window.udict.setPref : () => {};
  // one-time migrate from legacy localStorage
  const SCALAR_KEYS = ['fontScale', 'theme', 'sideCollapsed'];
  const JSON_KEYS = ['wordbooks', 'words', 'history'];
  SCALAR_KEYS.forEach(k => {
    if (getPref(k, undefined) === undefined) {
      const v = localStorage.getItem('udict.' + k);
      if (v != null) { setPref(k, v); localStorage.removeItem('udict.' + k); }
    }
  });
  JSON_KEYS.forEach(k => {
    if (getPref(k, undefined) === undefined) {
      const raw = localStorage.getItem('udict.' + k);
      if (raw != null) {
        try { setPref(k, JSON.parse(raw)); localStorage.removeItem('udict.' + k); } catch {}
      }
    }
  });

  let fontScale = Number(getPref('fontScale', 100)) || 100;

  // ── Theme ────────────────────────────────────
  let themeMode = getPref('theme', 'system');
  const darkMql = window.matchMedia('(prefers-color-scheme: dark)');
  function resolveTheme() {
    if (themeMode === 'dark') return 'dark';
    if (themeMode === 'light') return 'light';
    if (window.udict && typeof window.udict.isDark === 'function') {
      try { return window.udict.isDark() ? 'dark' : 'light'; } catch {}
    }
    return darkMql.matches ? 'dark' : 'light';
  }
  let activeTheme = resolveTheme();
  function applyTheme() {
    activeTheme = resolveTheme();
    document.documentElement.setAttribute('data-theme', activeTheme);
    document.querySelectorAll('#theme-ctrl button').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === themeMode);
    });
    if (currentIframe && currentIframe.contentWindow) {
      try { currentIframe.contentWindow.postMessage({ type: 'udict-theme', theme: activeTheme }, '*'); } catch {}
    }
  }
  function setThemeMode(mode) {
    themeMode = mode;
    setPref('theme', mode);
    applyTheme();
  }
  darkMql.addEventListener('change', () => { if (themeMode === 'system') applyTheme(); });

  // ── Wordbook data ────────────────────────────
  const DEFAULT_BOOK_ID = 'default';
  let wordbooks = getPref('wordbooks', null);
  let words = getPref('words', null);
  if (!Array.isArray(wordbooks)) wordbooks = [];
  if (!words || typeof words !== 'object') words = {};
  if (!wordbooks.length) wordbooks = [{ id: DEFAULT_BOOK_ID, name: '默认生词本' }];
  if (!wordbooks.some(b => b.id === DEFAULT_BOOK_ID)) wordbooks.unshift({ id: DEFAULT_BOOK_ID, name: '默认生词本' });
  function saveBooks() { setPref('wordbooks', wordbooks); }
  function saveWords() { setPref('words', words); }
  function wordsInBook(bookId) {
    const entries = Object.entries(words).filter(([w, m]) => m && Array.isArray(m.books) && m.books.length);
    if (bookId === DEFAULT_BOOK_ID) return entries;
    return entries.filter(([w, m]) => m.books.includes(bookId));
  }
  function isCollected(w) { return !!(w && words[w] && words[w].books && words[w].books.length); }
  const historyEl = document.getElementById('history');
  let history = getPref('history', null);
  if (!Array.isArray(history)) history = [];

  function getHistoryMax() {
    const n = parseInt(getPref('historyMax', 50), 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 1000) : 50;
  }
  function renderHistory() {
    const max = getHistoryMax();
    const display = history.slice(0, max);
    if (!display.length) { historyEl.innerHTML = '<li class="muted">（暂无）</li>'; return; }
    historyEl.innerHTML = display.map(w =>
      `<li data-word="${escapeHtml(w)}"><span class="dj-key">${escapeHtml(w)}</span><button class="hist-del" title="删除此记录">✕</button></li>`
    ).join('');
    historyEl.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', e => {
        if (e.target.closest('.hist-del')) return;
        qInput.value = li.dataset.word; doLookup(li.dataset.word);
      });
      const del = li.querySelector('.hist-del');
      if (del) del.addEventListener('click', e => {
        e.stopPropagation();
        const w = li.dataset.word;
        history = history.filter(x => x !== w);
        setPref('history', history);
        renderHistory();
      });
    });
  }
  function pushHistory(w) {
    w = w.trim(); if (!w) return;
    const max = getHistoryMax();
    history = [w, ...history.filter(x => x !== w)].slice(0, max);
    setPref('history', history);
    renderHistory();
  }
  window.addEventListener('udict-prefs-changed', () => {
    const max = getHistoryMax();
    if (history.length > max) { history = history.slice(0, max); setPref('history', history); }
    renderHistory();
  });
  document.getElementById('hist-clear').addEventListener('click', e => {
    e.stopPropagation();
    history = []; setPref('history', null); renderHistory();
  });
  renderHistory();

  // Sidebar toggle
  if (String(getPref('sideCollapsed', '0')) === '1') document.body.classList.add('side-collapsed');
  sideToggle.addEventListener('click', () => {
    document.body.classList.toggle('side-collapsed');
    setPref('sideCollapsed', document.body.classList.contains('side-collapsed') ? '1' : '0');
  });

  // Font scale
  function applyFont() {
    fontVal.textContent = fontScale + '%';
    setPref('fontScale', String(fontScale));
    if (currentIframe && currentIframe.contentWindow) {
      currentIframe.contentWindow.postMessage({ type: 'udict-font-scale', scale: fontScale }, '*');
    }
  }
  document.getElementById('font-inc').addEventListener('click', () => { fontScale = Math.min(250, fontScale + 10); applyFont(); });
  document.getElementById('font-dec').addEventListener('click', () => { fontScale = Math.max(60, fontScale - 10); applyFont(); });
  document.getElementById('font-reset').addEventListener('click', () => { fontScale = 100; applyFont(); });
  fontVal.textContent = fontScale + '%';

  document.getElementById('theme-ctrl').addEventListener('click', e => {
    const btn = e.target.closest('button[data-theme]');
    if (!btn) return;
    setThemeMode(btn.dataset.theme);
  });
  applyTheme();

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
    }
  });

  const settingsView = document.getElementById('settings-view');
  function showSettings() {
    settingsView.hidden = false;
    window.dispatchEvent(new CustomEvent('udict-settings-open'));
  }
  function hideSettings() {
    settingsView.hidden = true;
    qInput.focus();
  }
  document.getElementById('settings-link').addEventListener('click', e => {
    e.preventDefault();
    showSettings();
  });
  document.getElementById('settings-back').addEventListener('click', e => {
    e.preventDefault();
    hideSettings();
  });

  function handleEscape() {
    if (!settingsView.hidden) { hideSettings(); return; }
    if (currentSug.length) { hideSuggest(); return; }
    if (qInput.value.length) {
      qInput.value = '';
      qInput.focus();
    } else {
      if (window.udict && window.udict.exit) window.udict.exit();
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!settingsView.hidden) { hideSettings(); return; }
    handleEscape();
  }, true);

  async function doSuggest() {
    const q = qInput.value.trim();
    if (!q) return hideSuggest();
    const words = await window.udict.prefix(q, 20);
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
    if (word.trim().toLowerCase() === 'udict') return showAbout();
    results.innerHTML = '<div class="empty">Looking up...</div>';
    const lookupResults = await window.udict.lookup(word);
    const data = { results: lookupResults };
    if (!data.results || !data.results.length) {
      results.innerHTML = '<div class="empty">No results for "' + escapeHtml(word) + '"</div>';
      return;
    }
    pushHistory(word);
    currentWord = word;
    updateStarBtn();
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
    currentIframe = iframe;

    const parts = data.results.map((r, i) =>
      `<section class="udict-entry" id="udict-sec-${i}" data-dict="${escapeHtml(r.dict)}">
         <header class="udict-entry-head">【${escapeHtml(r.dict)}】${escapeHtml(r.keyText)}</header>
         <div class="udict-entry-body">${r.html}</div>
       </section>`
    ).join('<hr class="udict-sep"/>');
    iframe.srcdoc = wrapHtml(parts, fontScale);

    // Populate dict-jump sidebar
    dictJump.innerHTML = data.results.map((r, i) =>
      `<li data-sec="udict-sec-${i}">
         <span class="dj-name">${escapeHtml(r.dict)}</span>
         <span class="dj-key">${escapeHtml(r.keyText)}</span>
       </li>`
    ).join('');
    dictJump.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        if (!currentIframe || !currentIframe.contentWindow) return;
        currentIframe.contentWindow.postMessage({ type: 'udict-scroll-to', id: li.dataset.sec }, '*');
      });
    });
  }

  function wrapHtml(bodyHtml, scale) {
    const theme = activeTheme;
    return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"/><meta name="color-scheme" content="${theme}"/>
<style>
  :root{color-scheme:${theme};--udict-bg:#fff;--udict-fg:#1F1E1D;--udict-soft:#5C5B57;--udict-muted:#8E8C85;--udict-accent:#D97757;--udict-accent-soft:#F5DCD0;--udict-border:#E8E6DC;--udict-sep:#D9D6CB;--udict-panel:#F5F4EF;}
  html[data-theme="dark"]{--udict-bg:#1F1E1D;--udict-fg:#EDEAE0;--udict-soft:#B5B1A5;--udict-muted:#7F7C73;--udict-accent:#E4A177;--udict-accent-soft:#4A3326;--udict-border:#3A3835;--udict-sep:#4A4844;--udict-panel:#252421;}
  html,body{background:var(--udict-bg)!important;color:var(--udict-fg)!important;}
  html{font-size:${scale}%;overflow-x:hidden!important;}
  body{margin:0;padding:14px 18px;font-family:"Segoe UI",-apple-system,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;word-wrap:break-word;}
  img,video,table{max-width:100%!important;height:auto;}
  .udict-entry-head{font:600 12px "Segoe UI",system-ui,sans-serif;color:var(--udict-accent);padding:6px 0;border-bottom:1px solid var(--udict-border);margin-bottom:10px;letter-spacing:0.3px;}
  .udict-sep{border:0;border-top:1px dashed var(--udict-sep);margin:20px 0;}
  html[data-theme="dark"] body :is(h1,h2,h3,h4,h5,h6,p,div,span,li,dt,dd,td,th,em,strong,i,b,u){color:var(--udict-fg);}
  html[data-theme="dark"] body a,html[data-theme="dark"] body a:link,html[data-theme="dark"] body a:visited{color:var(--udict-accent);}
  /* Oxford collapse / unbox / body containers */
  html[data-theme="dark"] body :is(.collapse,.unbox,.body,[class*="-box"],[class*="_box"]){background-color:var(--udict-panel)!important;border-color:var(--udict-border)!important;}
  html[data-theme="dark"] body :is(.box_title,.box_title>span,.closed,.closedT){color:var(--udict-fg)!important;}
</style>
</head><body>${bodyHtml}
<script>
function findDict(node){
  while (node && node !== document.body) {
    if (node.dataset && node.dataset.dict) return node.dataset.dict;
    node = node.parentNode;
  }
  return '';
}
document.addEventListener('click', function(e){
  var t = e.target;
  while (t && t !== document.body) {
    if (t.dataset && t.dataset.udictSound) {
      e.preventDefault();
      parent.postMessage({type:'udict-sound', dict:findDict(t), key:t.dataset.udictSound}, '*');
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
window.addEventListener('message', function(e){
  if (!e.data) return;
  if (e.data.type === 'udict-font-scale') {
    document.documentElement.style.fontSize = e.data.scale + '%';
  } else if (e.data.type === 'udict-scroll-to') {
    var el = document.getElementById(e.data.id);
    if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
  } else if (e.data.type === 'udict-theme') {
    document.documentElement.setAttribute('data-theme', e.data.theme);
    var m = document.querySelector('meta[name="color-scheme"]'); if (m) m.setAttribute('content', e.data.theme);
  }
});
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape') {
    e.preventDefault();
    parent.postMessage({type:'udict-escape'}, '*');
  }
}, true);
<\/script></body></html>`;
  }

  function hookEntryClicks() { /* handled via postMessage */ }

  window.addEventListener('message', async e => {
    if (!e.data) return;
    if (e.data.type === 'udict-entry' || e.data.type === 'udict-query') {
      const w = e.data.word || '';
      qInput.value = w;
      qInput.focus();
      if (w) doLookup(w);
    } else if (e.data.type === 'udict-escape') {
      qInput.focus();
      handleEscape();
    } else if (e.data.type === 'udict-sound') {
      try {
        const uri = await window.udict.getSound(e.data.dict, e.data.key);
        if (uri) new Audio(uri).play().catch(() => {});
      } catch (err) { console.warn('[udict] sound load failed:', err); }
    }
  });

  function showAbout() {
    results.innerHTML = '';
    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent = '✦ About udict';
    results.appendChild(meta);
    const iframe = document.createElement('iframe');
    iframe.className = 'entry-frame';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-popups';
    results.appendChild(iframe);
    currentIframe = iframe;
    const code = 'background:var(--udict-panel);padding:1px 6px;border-radius:3px;font-size:13px;font-family:Consolas,monospace;';
    const h3 = 'font-size:13px;text-transform:uppercase;letter-spacing:0.8px;color:var(--udict-muted);margin:24px 0 10px;font-weight:600;';
    const about = `
      <div style="max-width:640px;margin:30px auto;padding:28px 32px;font-family:'Segoe UI',-apple-system,system-ui,'PingFang SC',sans-serif;color:var(--udict-fg);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="var(--udict-accent)"><path d="M12 2 L13.2 8.5 L19.5 6 L15 11.3 L22 12 L15 12.7 L19.5 18 L13.2 15.5 L12 22 L10.8 15.5 L4.5 18 L9 12.7 L2 12 L9 11.3 L4.5 6 L10.8 8.5 Z"/></svg>
          <h1 style="margin:0;font-size:24px;font-weight:600;">udict</h1>
          <span style="background:var(--udict-accent-soft);color:var(--udict-accent);padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">uTools plugin</span>
        </div>
        <p style="font-size:15px;line-height:1.7;color:var(--udict-soft);margin:0 0 18px;">
          一个离线 MDX/MDD 词典查询插件，内置生词本。所有查询均在本地运行，无需联网。
        </p>
        <h3 style="${h3}">特性</h3>
        <ul style="margin:0;padding-left:20px;line-height:1.9;font-size:14px;color:var(--udict-fg);">
          <li>直接解析本地 <code style="${code}">.mdx / .mdd</code>，自动发现 <code style="${code}">.1.mdd / .2.mdd</code> 分卷</li>
          <li>多词典同时查询，按来源分区展示；发音 / 图片 / 交叉引用全支持</li>
          <li>前缀建议 + 持久化 key 索引缓存，冷启动 0ms</li>
          <li>生词本：多本管理、1–5 星难度、自定义备注、默认本自动汇总</li>
          <li>可折叠侧栏：词典跳转、字号调节、历史记录、生词本</li>
        </ul>
        <h3 style="${h3}">致谢</h3>
        <ul style="margin:0;padding-left:20px;line-height:1.9;font-size:14px;color:var(--udict-fg);">
          <li><b>js-mdict</b> — 纯 JS 的 MDX/MDD 解析器，查词引擎核心 <span style="color:var(--udict-muted);">· github.com/terasum/js-mdict</span></li>
          <li><b>uTools</b> — 键盘优先的插件宿主 <span style="color:var(--udict-muted);">· u.tools</span></li>
          <li>感谢 LDOCE、Oxford Advanced Learner's 等词典作者及 <code style="${code}">.mdx</code> 社区维护者</li>
        </ul>
        <h3 style="${h3}">项目地址</h3>
        <p style="margin:0;font-size:14px;font-family:Consolas,'SF Mono',monospace;background:var(--udict-panel);padding:10px 14px;border-radius:6px;user-select:all;color:var(--udict-accent);">
          https://github.com/codefoxs/udict
        </p>
        <p style="margin:28px 0 0;font-size:12px;color:var(--udict-muted);">
          由 CodeFox 和 Claude Code 共同编写 · MIT License</p>
      </div>`;
    iframe.srcdoc = wrapHtml(about, fontScale);
    dictJump.innerHTML = '<li class="muted">（关于页面）</li>';
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  // ── Wordbook sidebar rendering ───────────────
  const wbListEl = document.getElementById('wordbooks');
  function renderWordbooks() {
    wbListEl.innerHTML = wordbooks.map(b => {
      const count = wordsInBook(b.id).length;
      const fixed = b.id === DEFAULT_BOOK_ID;
      return `<li data-id="${escapeHtml(b.id)}" class="${fixed ? 'wb-fixed' : ''}" draggable="${fixed ? 'false' : 'true'}">
        <span class="wb-drag" title="拖动排序">≡</span>
        <span class="wb-name" title="${escapeHtml(b.name)}">${escapeHtml(b.name)}</span>
        <span class="wb-count">${count}</span>
        <button class="wb-del" title="删除">✕</button>
      </li>`;
    }).join('');
    wbListEl.querySelectorAll('li').forEach(li => {
      const id = li.dataset.id;
      li.addEventListener('click', e => {
        if (e.target.closest('.wb-del') || e.target.closest('.wb-drag') || e.target.closest('.wb-name-edit')) return;
        openWordbookPage(id);
      });
      const nameEl = li.querySelector('.wb-name');
      if (id !== DEFAULT_BOOK_ID && nameEl) {
        nameEl.addEventListener('dblclick', e => {
          e.stopPropagation();
          startRename(li, id);
        });
      }
      const delBtn = li.querySelector('.wb-del');
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (id === DEFAULT_BOOK_ID) return;
        const book = wordbooks.find(b => b.id === id);
        if (!confirm(`删除生词本"${book.name}"？`)) return;
        wordbooks = wordbooks.filter(b => b.id !== id);
        Object.values(words).forEach(m => { if (m.books) m.books = m.books.filter(x => x !== id); });
        saveBooks(); saveWords(); renderWordbooks();
      });
      li.addEventListener('dragstart', e => {
        if (id === DEFAULT_BOOK_ID) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragover', e => {
        e.preventDefault();
        if (id === DEFAULT_BOOK_ID) return;
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', e => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const srcId = e.dataTransfer.getData('text/plain');
        if (!srcId || srcId === id || id === DEFAULT_BOOK_ID) return;
        const srcIdx = wordbooks.findIndex(b => b.id === srcId);
        const dstIdx = wordbooks.findIndex(b => b.id === id);
        if (srcIdx < 0 || dstIdx < 0) return;
        const [moved] = wordbooks.splice(srcIdx, 1);
        wordbooks.splice(dstIdx, 0, moved);
        saveBooks(); renderWordbooks();
      });
    });
  }
  function startRename(li, id) {
    const nameEl = li.querySelector('.wb-name');
    const book = wordbooks.find(b => b.id === id);
    if (!nameEl || !book) return;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'wb-new-input';
    inp.maxLength = 40;
    inp.value = book.name;
    nameEl.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const name = inp.value.trim();
      if (name && name !== book.name) { book.name = name; saveBooks(); }
      renderWordbooks();
    };
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done = true; renderWordbooks(); }
    });
    inp.addEventListener('blur', commit);
  }

  document.getElementById('wb-add').addEventListener('click', e => {
    e.stopPropagation();
    if (wbListEl.querySelector('.wb-new')) return;
    const li = document.createElement('li');
    li.className = 'wb-new wb-fixed';
    li.innerHTML = `<span class="wb-drag">+</span><input class="wb-new-input" type="text" placeholder="新生词本名称，回车确认" maxlength="40"/>`;
    wbListEl.appendChild(li);
    const inp = li.querySelector('.wb-new-input');
    inp.focus();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const name = inp.value.trim();
      if (!name) { li.remove(); return; }
      const id = 'wb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      wordbooks.push({ id, name });
      saveBooks(); renderWordbooks();
    };
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); li.remove(); }
    });
    inp.addEventListener('blur', commit);
  });
  renderWordbooks();

  // ── Star / collect button ───────────────────
  const collectBtn = document.getElementById('collect-btn');
  function updateStarBtn() {
    if (isCollected(currentWord)) collectBtn.classList.add('collected');
    else collectBtn.classList.remove('collected');
  }
  collectBtn.addEventListener('click', () => {
    if (!currentWord) return;
    openCollectModal(currentWord);
  });

  // ── Collect modal ────────────────────────────
  const modalEl = document.getElementById('collect-modal');
  const modalWordEl = document.getElementById('collect-word');
  const modalBooksEl = document.getElementById('collect-books');
  function openCollectModal(word) {
    modalWordEl.innerHTML = `<b>${escapeHtml(word)}</b>`;
    const cur = (words[word] && words[word].books) || [];
    modalBooksEl.innerHTML = wordbooks.map(b => {
      const checked = cur.includes(b.id) ? 'checked' : '';
      return `<li><label><input type="checkbox" value="${escapeHtml(b.id)}" ${checked}/> ${escapeHtml(b.name)}</label></li>`;
    }).join('');
    modalEl.hidden = false;
  }
  function closeCollectModal() { modalEl.hidden = true; }
  document.getElementById('collect-close').addEventListener('click', closeCollectModal);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) closeCollectModal(); });
  document.getElementById('collect-save').addEventListener('click', () => {
    const word = currentWord;
    if (!word) return closeCollectModal();
    const picked = Array.from(modalBooksEl.querySelectorAll('input[type=checkbox]:checked')).map(x => x.value);
    if (!picked.length) {
      delete words[word];
    } else {
      const prev = words[word] || {};
      words[word] = {
        addedAt: prev.addedAt || Date.now(),
        difficulty: prev.difficulty || 1,
        note: prev.note || '',
        books: picked
      };
    }
    saveWords(); renderWordbooks(); updateStarBtn();
    closeCollectModal();
  });
  document.getElementById('collect-remove').addEventListener('click', () => {
    if (!currentWord) return closeCollectModal();
    delete words[currentWord];
    saveWords(); renderWordbooks(); updateStarBtn();
    closeCollectModal();
  });

  // ── Note modal ───────────────────────────────
  const noteModal = document.getElementById('note-modal');
  const noteWordEl = document.getElementById('note-word');
  const noteTextEl = document.getElementById('note-text');
  let noteCtx = { word: '', bookId: '' };
  function openNoteModal(word, bookId) {
    noteCtx = { word, bookId };
    noteWordEl.innerHTML = `<b>${escapeHtml(word)}</b>`;
    noteTextEl.value = (words[word] && words[word].note) || '';
    noteModal.hidden = false;
    setTimeout(() => noteTextEl.focus(), 0);
  }
  function closeNoteModal() { noteModal.hidden = true; }
  document.getElementById('note-close').addEventListener('click', closeNoteModal);
  document.getElementById('note-cancel').addEventListener('click', closeNoteModal);
  noteModal.addEventListener('click', e => { if (e.target === noteModal) closeNoteModal(); });
  document.getElementById('note-confirm').addEventListener('click', () => {
    const { word, bookId } = noteCtx;
    if (word && words[word]) {
      words[word].note = noteTextEl.value;
      saveWords();
    }
    closeNoteModal();
    if (bookId) openWordbookPage(bookId);
  });

  // ── CSV helpers ──────────────────────────────
  function csvEscape(s) {
    s = s == null ? '' : String(s);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCsv(rows) {
    return '﻿' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  }
  function parseCsv(text) {
    if (!text) return [];
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = []; let cur = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { cur.push(field); field = ''; }
        else if (c === '\r') { /* skip */ }
        else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
        else field += c;
      }
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    return rows;
  }

  // ── Transfer modal ───────────────────────────
  const transferModal = document.getElementById('transfer-modal');
  const transferInfo = document.getElementById('transfer-info');
  const transferBooks = document.getElementById('transfer-books');
  let transferCtx = { words: [], fromBookId: '', resolve: null };
  function openTransferModal(wordList, fromBookId) {
    return new Promise(resolve => {
      transferCtx = { words: wordList, fromBookId, resolve };
      transferInfo.innerHTML = `将 <b>${wordList.length}</b> 个生词转移到：`;
      const candidates = wordbooks.filter(b => b.id !== fromBookId && b.id !== DEFAULT_BOOK_ID);
      if (!candidates.length) {
        transferBooks.innerHTML = '<li class="muted" style="font-style:italic;color:var(--text-muted);padding:8px 10px">没有可转移到的生词本（先新建一个）</li>';
      } else {
        transferBooks.innerHTML = candidates.map((b, i) =>
          `<li><label><input type="radio" name="xfer-book" value="${escapeHtml(b.id)}" ${i === 0 ? 'checked' : ''}/> ${escapeHtml(b.name)}</label></li>`
        ).join('');
      }
      transferModal.hidden = false;
    });
  }
  function closeTransferModal(picked) {
    transferModal.hidden = true;
    const r = transferCtx.resolve;
    transferCtx = { words: [], fromBookId: '', resolve: null };
    if (r) r(picked || null);
  }
  document.getElementById('transfer-close').addEventListener('click', () => closeTransferModal(null));
  document.getElementById('transfer-cancel').addEventListener('click', () => closeTransferModal(null));
  transferModal.addEventListener('click', e => { if (e.target === transferModal) closeTransferModal(null); });
  document.getElementById('transfer-confirm').addEventListener('click', () => {
    const sel = transferBooks.querySelector('input[name=xfer-book]:checked');
    closeTransferModal(sel ? sel.value : null);
  });

  // ── Wordbook page ────────────────────────────
  let wbSort = { field: 'time', dir: 'desc' };
  let wbSelected = new Set();
  let wbCurrentBookId = null;
  function openWordbookPage(bookId) {
    const book = wordbooks.find(b => b.id === bookId);
    if (!book) return;
    currentIframe = null;
    dictJump.innerHTML = '<li class="muted">（生词本视图）</li>';
    const isDefault = bookId === DEFAULT_BOOK_ID;
    if (wbCurrentBookId !== bookId) { wbSelected = new Set(); wbCurrentBookId = bookId; }
    const entries = wordsInBook(bookId).slice();
    const cmp = (a, b) => {
      const [wa, ma] = a, [wb, mb] = b;
      let r = 0;
      if (wbSort.field === 'word') r = wa.localeCompare(wb);
      else if (wbSort.field === 'time') r = (ma.addedAt || 0) - (mb.addedAt || 0);
      else if (wbSort.field === 'diff') r = (ma.difficulty || 0) - (mb.difficulty || 0);
      return wbSort.dir === 'asc' ? r : -r;
    };
    entries.sort(cmp);
    const bookNameById = id => (wordbooks.find(b => b.id === id) || {}).name || id;
    const rows = entries.map(([w, m]) => {
      const d = m.difficulty || 1;
      const opts = [1, 2, 3, 4, 5].map(i => `<option value="${i}" ${i === d ? 'selected' : ''}>${i}</option>`).join('');
      const time = m.addedAt ? new Date(m.addedAt).toLocaleString() : '';
      const noteText = (m.note || '').trim();
      const noteDisp = noteText
        ? `<span class="note-text" title="${escapeHtml(noteText)}">${escapeHtml(noteText)}</span>`
        : `<span class="note-text empty">（无备注）</span>`;
      const srcCell = isDefault
        ? `<td class="cell-src">${escapeHtml((m.books || []).map(bookNameById).join('；'))}</td>`
        : '';
      const checked = wbSelected.has(w) ? 'checked' : '';
      return `<tr data-word="${escapeHtml(w)}" class="${checked ? 'row-selected' : ''}">
        <td class="cell-sel"><input type="checkbox" class="wb-sel" ${checked}/></td>
        <td class="cell-word">${escapeHtml(w)}</td>
        <td class="cell-time">${escapeHtml(time)}</td>
        <td class="cell-diff"><select class="diff-sel">${opts}</select></td>
        <td class="cell-note"><div class="note-row">${noteDisp}<button class="note-edit" type="button">编辑</button></div></td>
        ${srcCell}
        <td class="cell-op"><button class="wb-row-del" title="移出生词本">✕</button></td>
      </tr>`;
    }).join('');
    const arrow = f => wbSort.field === f ? (wbSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    const allChecked = entries.length && entries.every(([w]) => wbSelected.has(w));
    const headers = `
      <th class="cell-sel"><input type="checkbox" id="wb-sel-all" ${allChecked ? 'checked' : ''} title="全选"/></th>
      <th class="sortable" data-sort="word">生词${arrow('word')}</th>
      <th class="sortable" data-sort="time">收录时间${arrow('time')}</th>
      <th class="sortable" data-sort="diff">难度${arrow('diff')}</th>
      <th>备注</th>
      ${isDefault ? '<th>来源</th>' : ''}
      <th></th>`;
    const selCount = wbSelected.size;
    results.innerHTML = `
      <div class="wb-page">
        <div class="wb-page-head">
          <h2>${escapeHtml(book.name)}</h2>
          <span class="count">${entries.length} 词</span>
        </div>
        <div class="wb-toolbar">
          <button id="wb-import" title="从 CSV 导入到本生词本">导入 CSV</button>
          <button id="wb-export" title="导出本生词本为 CSV">导出 CSV</button>
          <span class="wb-sep"></span>
          <span class="wb-sel-info">已选 <b>${selCount}</b></span>
          <button id="wb-bulk-del" class="danger" ${selCount ? '' : 'disabled'}>批量删除</button>
          <button id="wb-bulk-xfer" ${selCount ? '' : 'disabled'}>批量转移</button>
          <button id="wb-bulk-export" ${selCount ? '' : 'disabled'}>导出选中</button>
        </div>
        ${entries.length ? `<table class="wb-table">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>` : '<div class="wb-empty">暂无生词 — 在查词页面点击右侧 ☆ 收录</div>'}
      </div>`;

    // Toolbar handlers
    document.getElementById('wb-import').addEventListener('click', () => importCsvToBook(bookId));
    document.getElementById('wb-export').addEventListener('click', () => exportBookCsv(bookId, null));
    const bulkDel = document.getElementById('wb-bulk-del');
    const bulkXfer = document.getElementById('wb-bulk-xfer');
    const bulkExp = document.getElementById('wb-bulk-export');
    if (bulkDel) bulkDel.addEventListener('click', () => bulkDelete(bookId));
    if (bulkXfer) bulkXfer.addEventListener('click', () => bulkTransfer(bookId));
    if (bulkExp) bulkExp.addEventListener('click', () => exportBookCsv(bookId, Array.from(wbSelected)));

    const selAll = document.getElementById('wb-sel-all');
    if (selAll) selAll.addEventListener('change', () => {
      if (selAll.checked) entries.forEach(([w]) => wbSelected.add(w));
      else wbSelected.clear();
      openWordbookPage(bookId);
    });
    results.querySelectorAll('.wb-sel').forEach(cb => {
      cb.addEventListener('change', () => {
        const w = cb.closest('tr').dataset.word;
        if (cb.checked) wbSelected.add(w); else wbSelected.delete(w);
        openWordbookPage(bookId);
      });
    });
    results.querySelectorAll('.wb-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.dataset.sort;
        if (wbSort.field === f) wbSort.dir = wbSort.dir === 'asc' ? 'desc' : 'asc';
        else { wbSort.field = f; wbSort.dir = f === 'word' ? 'asc' : 'desc'; }
        openWordbookPage(bookId);
      });
    });
    results.querySelectorAll('.wb-table .cell-word').forEach(td => {
      td.addEventListener('click', () => {
        const w = td.parentElement.dataset.word;
        qInput.value = w; doLookup(w);
      });
    });
    results.querySelectorAll('.diff-sel').forEach(sel => {
      sel.addEventListener('change', () => {
        const w = sel.closest('tr').dataset.word;
        if (!words[w]) return;
        words[w].difficulty = Number(sel.value);
        saveWords();
      });
    });
    results.querySelectorAll('.note-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = btn.closest('tr').dataset.word;
        openNoteModal(w, bookId);
      });
    });
    results.querySelectorAll('.wb-row-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        const w = tr.dataset.word;
        if (!words[w]) return;
        if (bookId === DEFAULT_BOOK_ID) {
          if (!confirm(`从所有生词本移除"${w}"？`)) return;
          delete words[w];
        } else {
          words[w].books = (words[w].books || []).filter(x => x !== bookId);
          if (!words[w].books.length) delete words[w];
        }
        saveWords(); renderWordbooks(); updateStarBtn();
        openWordbookPage(bookId);
      });
    });
  }

  // ── Bulk + CSV operations ────────────────────
  function bulkDelete(bookId) {
    if (!wbSelected.size) return;
    const list = Array.from(wbSelected);
    const isDefault = bookId === DEFAULT_BOOK_ID;
    const msg = isDefault
      ? `从所有生词本移除选中的 ${list.length} 个生词？`
      : `从当前生词本移除选中的 ${list.length} 个生词？`;
    if (!confirm(msg)) return;
    for (const w of list) {
      if (!words[w]) continue;
      if (isDefault) {
        delete words[w];
      } else {
        words[w].books = (words[w].books || []).filter(x => x !== bookId);
        if (!words[w].books.length) delete words[w];
      }
    }
    wbSelected.clear();
    saveWords(); renderWordbooks(); updateStarBtn();
    openWordbookPage(bookId);
  }

  async function bulkTransfer(bookId) {
    if (!wbSelected.size) return;
    const list = Array.from(wbSelected);
    const targetId = await openTransferModal(list, bookId);
    if (!targetId) return;
    for (const w of list) {
      if (!words[w]) continue;
      let books = words[w].books || [];
      if (bookId === DEFAULT_BOOK_ID) {
        books = [targetId];
      } else {
        books = books.filter(x => x !== bookId);
        if (!books.includes(targetId)) books.push(targetId);
      }
      words[w].books = books;
    }
    wbSelected.clear();
    saveWords(); renderWordbooks(); updateStarBtn();
    openWordbookPage(bookId);
  }

  function exportBookCsv(bookId, onlyWords) {
    const book = wordbooks.find(b => b.id === bookId);
    if (!book) return;
    const isDefault = bookId === DEFAULT_BOOK_ID;
    let entries = wordsInBook(bookId);
    if (Array.isArray(onlyWords) && onlyWords.length) {
      const sel = new Set(onlyWords);
      entries = entries.filter(([w]) => sel.has(w));
    }
    if (!entries.length) { alert('没有可导出的生词'); return; }
    const bookNameById = id => (wordbooks.find(b => b.id === id) || {}).name || id;
    const header = isDefault
      ? ['word', 'addedAt', 'difficulty', 'note', 'books']
      : ['word', 'addedAt', 'difficulty', 'note'];
    const rows = [header];
    for (const [w, m] of entries) {
      const row = [
        w,
        m.addedAt ? new Date(m.addedAt).toISOString() : '',
        String(m.difficulty || 1),
        m.note || ''
      ];
      if (isDefault) row.push((m.books || []).map(bookNameById).join(';'));
      rows.push(row);
    }
    const ts = new Date().toISOString().slice(0, 10);
    const fname = `udict-${book.name.replace(/[\\/:*?"<>|]/g, '_')}-${ts}.csv`;
    const text = toCsv(rows);
    if (window.udict && window.udict.saveFile) {
      const fp = window.udict.saveFile(text, fname);
      if (fp) alert('已导出：' + fp);
    } else {
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function importCsvToBook(bookId) {
    if (!window.udict || !window.udict.readFile) { alert('当前环境不支持文件导入'); return; }
    const text = window.udict.readFile();
    if (text == null) return;
    const rows = parseCsv(text).filter(r => r.length && r.some(c => c !== ''));
    if (!rows.length) { alert('CSV 文件为空'); return; }
    // Detect header
    const first = rows[0].map(c => c.trim().toLowerCase());
    let header = null, dataRows = rows;
    if (first.includes('word') || first[0] === 'word') {
      header = first; dataRows = rows.slice(1);
    }
    const col = name => header ? header.indexOf(name) : -1;
    const wIdx = header ? Math.max(0, col('word')) : 0;
    const tIdx = col('addedat');
    const dIdx = col('difficulty');
    const nIdx = col('note');
    let added = 0, updated = 0;
    for (const r of dataRows) {
      const w = (r[wIdx] || '').trim();
      if (!w) continue;
      const addedAt = (() => {
        if (tIdx < 0) return null;
        const v = r[tIdx]; if (!v) return null;
        const t = Date.parse(v); return Number.isFinite(t) ? t : null;
      })();
      const difficulty = (() => {
        if (dIdx < 0) return null;
        const n = parseInt(r[dIdx], 10);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
      })();
      const note = nIdx >= 0 ? (r[nIdx] || '') : '';
      const exists = !!words[w];
      const prev = words[w] || {};
      const books = new Set(prev.books || []);
      books.add(bookId);
      words[w] = {
        addedAt: prev.addedAt || addedAt || Date.now(),
        difficulty: difficulty || prev.difficulty || 1,
        note: note || prev.note || '',
        books: Array.from(books)
      };
      if (exists) updated++; else added++;
    }
    saveWords(); renderWordbooks(); updateStarBtn();
    openWordbookPage(bookId);
    alert(`导入完成：新增 ${added}，更新 ${updated}`);
  }

  if (window.udict && window.udict.onEnter) {
    window.udict.onEnter(word => {
      if (!word) return;
      qInput.value = word;
      qInput.focus();
      doLookup(word);
    });
  }
})();
