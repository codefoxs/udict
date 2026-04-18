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
  let fontScale = Number(localStorage.getItem('udict.fontScale')) || 100;
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
    if (word.trim().toLowerCase() === 'udict') return showAbout();
    results.innerHTML = '<div class="empty">Looking up...</div>';
    const r = await fetch('/api/lookup?q=' + encodeURIComponent(word));
    const data = await r.json();
    if (!data.results || !data.results.length) {
      results.innerHTML = '<div class="empty">No results for "' + escapeHtml(word) + '"</div>';
      return;
    }
    pushHistory(word);
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
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="color-scheme" content="light"/><base href="/"/>
<style>
  :root{color-scheme:light!important;}
  html,body{background:#fff!important;color:#1F1E1D!important;}
  html{font-size:${scale}%;overflow-x:hidden;}
  body{margin:0;padding:14px 18px;font-family:"Segoe UI",-apple-system,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;overflow-x:hidden;word-wrap:break-word;}
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
    const about = `
      <div style="max-width:640px;margin:30px auto;padding:28px 32px;font-family:'Segoe UI',-apple-system,system-ui,'PingFang SC',sans-serif;color:#1F1E1D;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="#D97757"><path d="M12 2 L13.2 8.5 L19.5 6 L15 11.3 L22 12 L15 12.7 L19.5 18 L13.2 15.5 L12 22 L10.8 15.5 L4.5 18 L9 12.7 L2 12 L9 11.3 L4.5 6 L10.8 8.5 Z"/></svg>
          <h1 style="margin:0;font-size:24px;font-weight:600;">udict</h1>
          <span style="background:#F5DCD0;color:#D97757;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">uTools plugin</span>
        </div>
        <p style="font-size:15px;line-height:1.7;color:#5C5B57;margin:0 0 18px;">
          一个离线 MDX/MDD 词典查询插件，支持多词典、多音频/图片资源、前缀建议、索引缓存、
         均在本地运行，无需联网。
        </p>
        <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.8px;color:#8E8C85;margin:24px 0 10px;font-weight:600;">特性</h3>
        <ul style="margin:0;padding-left:20px;line-height:1.9;font-size:14px;color:#1F1E1D;">
          <li>基于 <code style="background:#F5F4EF;padding:1px 6px;border-radius:3px;font-size:13px;">js-mdict</code> 直接解析 MDX/MDD</li>
          <li>自动发现 <code style="background:#F5F4EF;padding:1px 6px;border-radius:3px;font-size:13px;">.mdd / .1.mdd / .2.mdd</code> 等分卷</li>
          <li>内嵌 HTTP 服务统一解析 sound:// / entry:// / 相对资源</li>
          <li>持久化 key 索引，冷启动前缀建议 0ms</li>
          <li>可折叠侧栏：词典跳转、字号调节、历史记录</li>
        </ul>
        <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.8px;color:#8E8C85;margin:24px 0 10px;font-weight:600;">项目地址</h3>
        <p style="margin:0;font-size:14px;font-family:Consolas,'SF Mono',monospace;background:#F5F4EF;padding:10px 14px;border-radius:6px;user-select:all;color:#D97757;">
          https://github.com/codefoxs/udict
        </p>
        <p style="margin:28px 0 0;font-size:12px;color:#8E8C85;">
          由 CodeFox 和 Claude Code 共同编写</p>
      </div>`;
    iframe.srcdoc = wrapHtml(about, fontScale);
    dictJump.innerHTML = '<li class="muted">（关于页面）</li>';
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  try { parent.postMessage({ type: 'udict-ready' }, '*'); } catch {}
})();
