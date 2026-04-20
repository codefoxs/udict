(function () {
  const BASE = (window.udict && window.udict.base) || '';
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
  let fontScale = Number(localStorage.getItem('udict.fontScale')) || 100;

  // ── Wordbook data ────────────────────────────
  const DEFAULT_BOOK_ID = 'default';
  let wordbooks = [];
  let words = {};
  try { wordbooks = JSON.parse(localStorage.getItem('udict.wordbooks') || 'null') || []; } catch {}
  try { words = JSON.parse(localStorage.getItem('udict.words') || '{}'); } catch {}
  if (!Array.isArray(wordbooks) || !wordbooks.length) wordbooks = [{ id: DEFAULT_BOOK_ID, name: '默认生词本' }];
  if (!wordbooks.some(b => b.id === DEFAULT_BOOK_ID)) wordbooks.unshift({ id: DEFAULT_BOOK_ID, name: '默认生词本' });
  function saveBooks() { localStorage.setItem('udict.wordbooks', JSON.stringify(wordbooks)); }
  function saveWords() { localStorage.setItem('udict.words', JSON.stringify(words)); }
  function wordsInBook(bookId) {
    const entries = Object.entries(words).filter(([w, m]) => m && Array.isArray(m.books) && m.books.length);
    if (bookId === DEFAULT_BOOK_ID) return entries;
    return entries.filter(([w, m]) => m.books.includes(bookId));
  }
  function isCollected(w) { return !!(w && words[w] && words[w].books && words[w].books.length); }
  const historyEl = document.getElementById('history');
  let history = [];
  try { history = JSON.parse(localStorage.getItem('udict.history') || '[]'); } catch {}

  function renderHistory() {
    if (!history.length) { historyEl.innerHTML = '<li class="muted">（暂无）</li>'; return; }
    historyEl.innerHTML = history.slice(0, 30).map(w =>
      `<li data-word="${escapeHtml(w)}"><span class="dj-key">${escapeHtml(w)}</span></li>`
    ).join('');
    historyEl.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => { qInput.value = li.dataset.word; doLookup(li.dataset.word); });
    });
  }
  function pushHistory(w) {
    w = w.trim(); if (!w) return;
    history = [w, ...history.filter(x => x !== w)].slice(0, 50);
    localStorage.setItem('udict.history', JSON.stringify(history));
    renderHistory();
  }
  document.getElementById('hist-clear').addEventListener('click', e => {
    e.stopPropagation();
    history = []; localStorage.removeItem('udict.history'); renderHistory();
  });
  renderHistory();

  // Sidebar toggle
  if (localStorage.getItem('udict.sideCollapsed') === '1') document.body.classList.add('side-collapsed');
  sideToggle.addEventListener('click', () => {
    document.body.classList.toggle('side-collapsed');
    localStorage.setItem('udict.sideCollapsed', document.body.classList.contains('side-collapsed') ? '1' : '0');
  });

  // Font scale
  function applyFont() {
    fontVal.textContent = fontScale + '%';
    localStorage.setItem('udict.fontScale', String(fontScale));
    if (currentIframe && currentIframe.contentWindow) {
      currentIframe.contentWindow.postMessage({ type: 'udict-font-scale', scale: fontScale }, '*');
    }
  }
  document.getElementById('font-inc').addEventListener('click', () => { fontScale = Math.min(250, fontScale + 10); applyFont(); });
  document.getElementById('font-dec').addEventListener('click', () => { fontScale = Math.max(60, fontScale - 10); applyFont(); });
  document.getElementById('font-reset').addEventListener('click', () => { fontScale = 100; applyFont(); });
  fontVal.textContent = fontScale + '%';

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
      e.preventDefault();
      handleEscape();
    }
  });

  function handleEscape() {
    if (currentSug.length) { hideSuggest(); return; }
    if (qInput.value.length) {
      qInput.value = '';
      qInput.focus();
    } else {
      parent.postMessage({ type: 'udict-exit' }, '*');
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.activeElement !== qInput) {
      e.preventDefault();
      qInput.focus();
      handleEscape();
    }
  });

  async function doSuggest() {
    const q = qInput.value.trim();
    if (!q) return hideSuggest();
    const r = await fetch(BASE + '/api/prefix?q=' + encodeURIComponent(q));
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
    if (word.trim().toLowerCase() === 'udict') return showAbout();
    results.innerHTML = '<div class="empty">Looking up...</div>';
    const r = await fetch(BASE + '/api/lookup?q=' + encodeURIComponent(word));
    const data = await r.json();
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
         <div class="udict-entry-body">${stripDarkMedia(r.html)}</div>
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

  function wrapHtml(bodyHtml, scale) {
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="color-scheme" content="light"/><base href="${BASE}/"/>
<style>
  :root{color-scheme:light!important;}
  html,body{background:#fff!important;color:#1F1E1D!important;}
  html{font-size:${scale}%;overflow-x:hidden!important;}
  body{margin:0;padding:14px 18px;font-family:"Segoe UI",-apple-system,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;word-wrap:break-word;}
  img,video,table{max-width:100%!important;height:auto;}
  .udict-entry-head{font:600 12px "Segoe UI",system-ui,sans-serif;color:#D97757;padding:6px 0;border-bottom:1px solid #E8E6DC;margin-bottom:10px;letter-spacing:0.3px;}
  .udict-sep{border:0;border-top:1px dashed #D9D6CB;margin:20px 0;}
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
window.addEventListener('message', function(e){
  if (!e.data) return;
  if (e.data.type === 'udict-font-scale') {
    document.documentElement.style.fontSize = e.data.scale + '%';
  } else if (e.data.type === 'udict-scroll-to') {
    var el = document.getElementById(e.data.id);
    if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
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

  window.addEventListener('message', e => {
    if (!e.data) return;
    if (e.data.type === 'udict-entry' || e.data.type === 'udict-query') {
      const w = e.data.word || '';
      qInput.value = w;
      qInput.focus();
      if (w) doLookup(w);
    } else if (e.data.type === 'udict-escape') {
      qInput.focus();
      handleEscape();
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
    const code = 'background:#F5F4EF;padding:1px 6px;border-radius:3px;font-size:13px;font-family:Consolas,monospace;';
    const h3 = 'font-size:13px;text-transform:uppercase;letter-spacing:0.8px;color:#8E8C85;margin:24px 0 10px;font-weight:600;';
    const about = `
      <div style="max-width:640px;margin:30px auto;padding:28px 32px;font-family:'Segoe UI',-apple-system,system-ui,'PingFang SC',sans-serif;color:#1F1E1D;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="#D97757"><path d="M12 2 L13.2 8.5 L19.5 6 L15 11.3 L22 12 L15 12.7 L19.5 18 L13.2 15.5 L12 22 L10.8 15.5 L4.5 18 L9 12.7 L2 12 L9 11.3 L4.5 6 L10.8 8.5 Z"/></svg>
          <h1 style="margin:0;font-size:24px;font-weight:600;">udict</h1>
          <span style="background:#F5DCD0;color:#D97757;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">uTools plugin</span>
        </div>
        <p style="font-size:15px;line-height:1.7;color:#5C5B57;margin:0 0 18px;">
          一个离线 MDX/MDD 词典查询插件，内置生词本。所有查询均在本地运行，无需联网。
        </p>
        <h3 style="${h3}">特性</h3>
        <ul style="margin:0;padding-left:20px;line-height:1.9;font-size:14px;color:#1F1E1D;">
          <li>直接解析本地 <code style="${code}">.mdx / .mdd</code>，自动发现 <code style="${code}">.1.mdd / .2.mdd</code> 分卷</li>
          <li>多词典同时查询，按来源分区展示；发音 / 图片 / 交叉引用全支持</li>
          <li>前缀建议 + 持久化 key 索引缓存，冷启动 0ms</li>
          <li>生词本：多本管理、1–5 星难度、自定义备注、默认本自动汇总</li>
          <li>可折叠侧栏：词典跳转、字号调节、历史记录、生词本</li>
        </ul>
        <h3 style="${h3}">致谢</h3>
        <ul style="margin:0;padding-left:20px;line-height:1.9;font-size:14px;color:#1F1E1D;">
          <li><b>js-mdict</b> — 纯 JS 的 MDX/MDD 解析器，查词引擎核心 <span style="color:#8E8C85;">· github.com/terasum/js-mdict</span></li>
          <li><b>uTools</b> — 键盘优先的插件宿主 <span style="color:#8E8C85;">· u.tools</span></li>
          <li>感谢 LDOCE、Oxford Advanced Learner's 等词典作者及 <code style="${code}">.mdx</code> 社区维护者</li>
        </ul>
        <h3 style="${h3}">项目地址</h3>
        <p style="margin:0;font-size:14px;font-family:Consolas,'SF Mono',monospace;background:#F5F4EF;padding:10px 14px;border-radius:6px;user-select:all;color:#D97757;">
          https://github.com/codefoxs/udict
        </p>
        <p style="margin:28px 0 0;font-size:12px;color:#8E8C85;">
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

  // ── Wordbook page ────────────────────────────
  let wbSort = { field: 'time', dir: 'desc' };
  function openWordbookPage(bookId) {
    const book = wordbooks.find(b => b.id === bookId);
    if (!book) return;
    currentIframe = null;
    dictJump.innerHTML = '<li class="muted">（生词本视图）</li>';
    const isDefault = bookId === DEFAULT_BOOK_ID;
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
      return `<tr data-word="${escapeHtml(w)}">
        <td class="cell-word">${escapeHtml(w)}</td>
        <td class="cell-time">${escapeHtml(time)}</td>
        <td class="cell-diff"><select class="diff-sel">${opts}</select></td>
        <td class="cell-note"><div class="note-row">${noteDisp}<button class="note-edit" type="button">编辑</button></div></td>
        ${srcCell}
        <td class="cell-op"><button class="wb-row-del" title="移出生词本">✕</button></td>
      </tr>`;
    }).join('');
    const arrow = f => wbSort.field === f ? (wbSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    const headers = `
      <th class="sortable" data-sort="word">生词${arrow('word')}</th>
      <th class="sortable" data-sort="time">收录时间${arrow('time')}</th>
      <th class="sortable" data-sort="diff">难度${arrow('diff')}</th>
      <th>备注</th>
      ${isDefault ? '<th>来源</th>' : ''}
      <th></th>`;
    results.innerHTML = `
      <div class="wb-page">
        <div class="wb-page-head">
          <h2>${escapeHtml(book.name)}</h2>
          <span class="count">${entries.length} 词</span>
        </div>
        ${entries.length ? `<table class="wb-table">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>` : '<div class="wb-empty">暂无生词 — 在查词页面点击右侧 ☆ 收录</div>'}
      </div>`;
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

  try { parent.postMessage({ type: 'udict-ready' }, '*'); } catch {}
})();
