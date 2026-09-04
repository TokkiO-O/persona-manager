import { getContext } from '../../../../script.js';
import { power_user } from '../../../power-user.js';

const EXT = 'Persona Manager';
const VERSION = '1.5.3';
let mounted = false;
let managerOpen = false;
let selected = new Set();
let compareIds = [];
let compareMode = 'overview';
let cache = [];

const normalize = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim();
const flat = (s) => normalize(s).replace(/\s+/g, ' ').toLowerCase();

function getDescription(id) {
    const raw = power_user?.persona_descriptions?.[id];
    if (raw == null) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw !== 'object') return String(raw);
    if (typeof raw.description === 'string') return raw.description;
    if (typeof raw.text === 'string') return raw.text;
    if (typeof raw.content === 'string') return raw.content;
    return '';
}

function getPersonas() {
    const personas = power_user?.personas || {};
    return Object.entries(personas).map(([id, name]) => ({
        id,
        name: String(name ?? id),
        description: getDescription(id),
    }));
}

function similarity(a, b) {
    const A = new Set(flat(a).split(/(?=.{2})/u).filter(Boolean));
    const B = new Set(flat(b).split(/(?=.{2})/u).filter(Boolean));
    if (!A.size && !B.size) return 1;
    if (!A.size || !B.size) return 0;
    let common = 0;
    for (const x of A) if (B.has(x)) common++;
    return common / (A.size + B.size - common);
}

function pairScore(a, b) {
    return similarity(a.description, b.description);
}

function tokenize(text) {
    const s = normalize(text);
    if (!s) return [];
    const lines = s.split('\n');
    const units = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const m = line.match(/^(\s*(?:[-*•]\s+|\d+[.)]\s+|[^:：]{1,80}[:：]))/u);
        if (m) {
            units.push({ text: line.trim(), key: flat(line), line: i });
        } else {
            const sentences = line.split(/(?<=[。！？!?；;])/u).map(x => x.trim()).filter(Boolean);
            for (const sentence of sentences.length ? sentences : [line.trim()]) {
                units.push({ text: sentence, key: flat(sentence), line: i });
            }
        }
    }
    return units;
}

function matchUnits(aText, bText) {
    const A = tokenize(aText), B = tokenize(bText);
    const used = new Set(), matches = [];
    for (let i = 0; i < A.length; i++) {
        let best = { j: -1, score: 0 };
        for (let j = 0; j < B.length; j++) {
            if (used.has(j)) continue;
            const score = similarity(A[i].text, B[j].text);
            if (score > best.score) best = { j, score };
        }
        if (best.j >= 0 && best.score >= 0.28) {
            used.add(best.j);
            matches.push({ a: A[i], b: B[best.j], score: best.score });
        } else {
            matches.push({ a: A[i], b: null, score: 0 });
        }
    }
    for (let j = 0; j < B.length; j++) {
        if (!used.has(j)) matches.push({ a: null, b: B[j], score: 0 });
    }
    return matches;
}

function similarityLabel(score) {
    if (score >= .9) return '高度相似 · 重点查看差异';
    if (score >= .7) return '较为相似 · 平衡查看';
    if (score >= .4) return '部分相似 · 重点查看共同点与差异';
    return '相似度较低 · 重点查看共同内容';
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function diffWords(a, b) {
    const aa = normalize(a), bb = normalize(b);
    if (aa === bb) return { a: escapeHtml(aa), b: escapeHtml(bb), same: true };
    const aChars = [...aa], bChars = [...bb];
    const common = new Set();
    for (const ch of aChars) if (bChars.includes(ch) && ch.trim()) common.add(ch);
    const mark = (chars) => chars.map(ch => common.has(ch) ? escapeHtml(ch) : `<mark>${escapeHtml(ch)}</mark>`).join('');
    return { a: mark(aChars), b: mark(bChars), same: false };
}

function personaImageUrl(id) {
    return `/thumbnail?type=persona&file=${encodeURIComponent(id)}`;
}

function getPersonaGlobalSettings() {
    // Current SillyTavern Persona panel: use the real structural selectors first.
    return document.querySelector(
        '#persona-management-button .persona_management_global_settings, ' +
        '#PersonaManagement .persona_management_global_settings, ' +
        '.persona_management_global_settings'
    );
}

function createEntry() {
    let entry = document.querySelector('#persona-manager-entry');
    if (entry) return entry;

    entry = document.createElement('div');
    entry.id = 'persona-manager-entry';
    entry.className = 'persona-manager-entry';
    entry.innerHTML = `
      <button type="button" class="persona-manager-entry-btn">
        <span class="persona-manager-entry-icon">▦</span>
        <span><strong>Persona Manager</strong><small>管理、搜索、比较 Persona</small></span>
      </button>`;
    entry.querySelector('button').addEventListener('click', openManager);
    return entry;
}

function mountEntry() {
    const target = getPersonaGlobalSettings();
    const entry = createEntry();
    if (!target || !target.parentElement) return false;

    // Insert directly above the native "global settings" block.
    if (entry.parentElement !== target.parentElement || entry.nextElementSibling !== target) {
        target.parentElement.insertBefore(entry, target);
    }

    entry.classList.add('mounted');
    mounted = true;
    return true;
}

function boot() {
    createEntry();

    // Try immediately, then keep watching because ST can rebuild the Persona panel.
    if (mountEntry()) return;

    const observer = new MutationObserver(() => {
        mountEntry();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Fallback for UI rebuilds/visibility transitions that don't give us a useful mutation.
    const timer = setInterval(() => mountEntry(), 500);

    window.addEventListener('beforeunload', () => {
        observer.disconnect();
        clearInterval(timer);
    }, { once: true });
}

function startVersionWatcher() {
    // Poll the installed extension manifest. If the extension manager replaces the
    // files and changes the version, reload exactly once into the new JS.
    const manifestUrl = new URL('./manifest.json', import.meta.url).href;
    let currentVersion = VERSION;
    let reloading = false;

    const check = async () => {
        if (reloading) return;
        try {
            const response = await fetch(manifestUrl + '?_pm=' + Date.now(), {
                cache: 'no-store',
                credentials: 'same-origin',
            });
            if (!response.ok) return;
            const manifest = await response.json();
            const installedVersion = String(manifest?.version || '');
            if (installedVersion && installedVersion !== currentVersion) {
                reloading = true;
                location.reload();
            }
        } catch (error) {
            console.debug('[Persona Manager] version check skipped', error);
        }
    };

    // Don't wait for a full interval after the extension manager has updated files.
    setTimeout(check, 2000);
    const timer = setInterval(check, 10000);
    window.addEventListener('beforeunload', () => clearInterval(timer), { once: true });
}

function refreshData() {
    cache = getPersonas();
    return cache;
}

function renderCard(p) {
    const checked = selected.has(p.id);
    return `<article class="pm-card ${checked ? 'selected' : ''}" data-id="${escapeHtml(p.id)}">
      <button class="pm-check" title="${checked ? '取消选择' : '选择'}">${checked ? '✓' : ''}</button>
      <img class="pm-avatar" src="${personaImageUrl(p.id)}" onerror="this.style.display='none'">
      <div class="pm-card-body">
        <h3>${escapeHtml(p.name)}</h3>
        <div class="pm-id">${escapeHtml(p.id)}</div>
        <p>${escapeHtml(p.description || '暂无描述')}</p>
      </div>
    </article>`;
}

function renderManager() {
    const data = refreshData();
    const groups = new Map();
    for (const p of data) {
        const key = p.name.trim().toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
    }
    const duplicates = data.filter((p, i) => data.some((q, j) => i !== j && flat(p.name) === flat(q.name) && flat(p.description) === flat(q.description)));
    const cards = data.map(renderCard).join('');
    const same = [...groups.values()].filter(g => g.length > 1).reduce((n,g)=>n+g.length,0);
    return `
      <div class="pm-shell">
        <header class="pm-header">
          <div><div class="pm-kicker">PERSONA MANAGER ${VERSION}</div><h1>Persona 管理中心</h1><p>搜索、分组、查重与全文对比，不改变 Persona 数据结构。</p></div>
          <button class="pm-close" data-action="close">×</button>
        </header>
        <div class="pm-toolbar">
          <input id="pm-search" placeholder="搜索 Persona 名称或描述…" />
          <div class="pm-stats"><span>全部 ${data.length}</span><span>同名 ${same}</span><span>完全重复 ${duplicates.length}</span></div>
          <button class="pm-compare-btn" ${selected.size < 2 ? 'disabled' : ''}>对比 ${selected.size || ''}</button>
        </div>
        <div class="pm-grid">${cards || '<div class="pm-empty">暂无 Persona</div>'}</div>
      </div>`;
}

function openManager() {
    refreshData();
    managerOpen = true;
    const overlay = document.createElement('div');
    overlay.id = 'persona-manager-overlay';
    overlay.innerHTML = renderManager();
    document.body.appendChild(overlay);
    bindManager();
}

function closeManager() {
    document.querySelector('#persona-manager-overlay')?.remove();
    managerOpen = false;
    compareIds = [];
    compareMode = 'overview';
}

function bindManager() {
    const root = document.querySelector('#persona-manager-overlay');
    root.querySelector('[data-action="close"]')?.addEventListener('click', closeManager);
    root.querySelectorAll('.pm-card').forEach(card => {
        card.addEventListener('click', e => {
            if (e.target.closest('.pm-check')) return;
            const id = card.dataset.id;
            if (selected.has(id)) selected.delete(id); else selected.add(id);
            rerenderManager();
        });
    });
    root.querySelectorAll('.pm-check').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.closest('.pm-card').dataset.id;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        rerenderManager();
    }));
    root.querySelector('#pm-search')?.addEventListener('input', e => filterCards(e.target.value));
    root.querySelector('.pm-compare-btn')?.addEventListener('click', () => openCompare([...selected]));
}

function rerenderManager() {
    const old = document.querySelector('#persona-manager-overlay');
    if (!old) return;
    old.innerHTML = renderManager();
    bindManager();
}

function filterCards(q) {
    const query = flat(q);
    document.querySelectorAll('.pm-card').forEach(card => {
        const p = cache.find(x => x.id === card.dataset.id);
        card.hidden = !!query && !(flat(p?.name).includes(query) || flat(p?.description).includes(query));
    });
}

function openCompare(ids) {
    compareIds = ids;
    if (ids.length < 2) return;
    const root = document.querySelector('#persona-manager-overlay');
    root.innerHTML = renderCompare(ids);
    bindCompare(root);
}

function renderCompare(ids) {
    const people = ids.map(id => cache.find(p => p.id === id)).filter(Boolean);
    const base = people[0];
    const scores = people.slice(1).map(p => similarity(base.description, p.description));
    const avg = scores.reduce((a,b)=>a+b,0)/(scores.length||1);
    return `
      <div class="pm-compare-workspace">
        <header class="pm-compare-header">
          <button class="pm-back" data-action="back">← 返回</button>
          <div><div class="pm-kicker">COMPARE WORKSPACE</div><h1>Persona 对比</h1><p>${people.length} 个 Persona · 基准：${escapeHtml(base.name)}</p></div>
          <button class="pm-close" data-action="close">×</button>
        </header>
        <div class="pm-compare-summary">
          <div class="pm-score">${Math.round(avg*100)}%</div>
          <div><strong>${similarityLabel(avg)}</strong><small>全文扫描匹配，不按原始前后顺序比较</small></div>
          <div class="pm-compare-tabs">
            <button class="active" data-mode="overview">全部</button>
            <button data-mode="same">相同</button>
            <button data-mode="diff">差异</button>
          </div>
        </div>
        <div class="pm-people-strip">
          ${people.map((p,i)=>`<div class="pm-person-chip"><img src="${personaImageUrl(p.id)}"><span>${escapeHtml(p.name)}${i===0?' · 基准':''}</span></div>`).join('')}
        </div>
        <div class="pm-match-list">
          ${renderMatches(people)}
        </div>
      </div>`;
}

function renderMatches(people) {
    const base = people[0];
    const baseUnits = tokenize(base.description);
    const all = [];
    const usedBy = new Map();
    for (let i=1;i<people.length;i++) {
        const matches = matchUnits(base.description, people[i].description);
        for (const m of matches) all.push({m, other: people[i]});
    }
    const grouped = new Map();
    for (const item of all) {
        const key = item.m.a ? flat(item.m.a.text) : `only-${item.other.id}-${flat(item.m.b.text)}`;
        if (!grouped.has(key)) grouped.set(key, {a:item.m.a, others:[]});
        grouped.get(key).others.push({p:item.other,b:item.m.b,score:item.m.score});
    }
    return [...grouped.values()].map(g => {
        const scores = g.others.map(x=>x.score);
        const isSame = g.a && scores.length && scores.every(s=>s>=0.92);
        const type = isSame ? 'same' : 'diff';
        const rowId = encodeURIComponent((g.a?.text||'') + '|' + g.others.map(x=>x.b?.text||'').join('|'));
        return `<section class="pm-match ${type}" data-kind="${type}" data-row="${rowId}">
          <div class="pm-match-head"><span class="pm-match-badge">${isSame ? '✓ 相同' : '≠ 差异'}</span><button class="pm-expand">查看原 Persona / 编辑</button></div>
          <div class="pm-match-grid">
            <div class="pm-match-cell ${g.a?'':'missing'}">${g.a ? escapeHtml(g.a.text) : '—'}</div>
            ${g.others.map(x=>`<div class="pm-match-cell ${x.b?'':'missing'}">${x.b ? (x.score>=.92?escapeHtml(x.b.text):diffWords(g.a?.text||'',x.b.text).b) : '—'}</div>`).join('')}
          </div>
          <div class="pm-edit-panel" hidden>${renderEditPanel(g, people)}</div>
        </section>`;
    }).join('') || '<div class="pm-empty">没有可比较的文本。</div>';
}

function renderEditPanel(group, people) {
    const entries = [];
    if (group.a) entries.push({p:people[0], text:group.a.text});
    for (const p of people.slice(1)) {
        const other = group.others.find(x=>x.p.id===p.id);
        if (other?.b) entries.push({p, text:other.b.text});
    }
    return entries.map(e=>`<div class="pm-source-edit">
      <div class="pm-source-title"><img src="${personaImageUrl(e.p.id)}"><strong>${escapeHtml(e.p.name)}</strong></div>
      <textarea data-edit-id="${escapeHtml(e.p.id)}">${escapeHtml(e.p.description)}</textarea>
      <div><button class="pm-save" data-save-id="${escapeHtml(e.p.id)}">保存并同步</button></div>
    </div>`).join('');
}

function saveDescription(id, value) {
    const target = power_user.persona_descriptions?.[id];
    if (target && typeof target === 'object') target.description = value;
    else {
        if (!power_user.persona_descriptions) power_user.persona_descriptions = {};
        power_user.persona_descriptions[id] = value;
    }
    try {
        const context = getContext();
        context?.saveSettingsDebounced?.();
        context?.saveSettings?.();
    } catch {}
    document.dispatchEvent(new CustomEvent('persona-manager:updated', { detail: { id } }));
}

function bindCompare(root) {
    root.querySelector('[data-action="close"]')?.addEventListener('click', closeManager);
    root.querySelector('[data-action="back"]')?.addEventListener('click', () => {
        root.innerHTML = renderManager();
        bindManager();
    });
    root.querySelectorAll('.pm-expand').forEach(btn => btn.addEventListener('click', e => {
        const panel = e.currentTarget.closest('.pm-match').querySelector('.pm-edit-panel');
        panel.hidden = !panel.hidden;
    }));
    root.querySelectorAll('.pm-save').forEach(btn => btn.addEventListener('click', e => {
        const id = e.currentTarget.dataset.saveId;
        const ta = e.currentTarget.closest('.pm-source-edit').querySelector('textarea');
        saveDescription(id, ta.value);
        e.currentTarget.textContent = '已保存 ✓';
        setTimeout(() => {
            const current = document.querySelector('#persona-manager-overlay');
            if (current) current.innerHTML = renderCompare(compareIds), bindCompare(current);
        }, 300);
    }));
    root.querySelectorAll('.pm-compare-tabs button').forEach(btn => btn.addEventListener('click', e => {
        root.querySelectorAll('.pm-compare-tabs button').forEach(x=>x.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const mode = e.currentTarget.dataset.mode;
        root.querySelectorAll('.pm-match').forEach(row => row.hidden = mode !== 'overview' && row.dataset.kind !== mode);
    }));
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && managerOpen) closeManager();
});

boot();
startVersionWatcher();
startVersionWatcher();
