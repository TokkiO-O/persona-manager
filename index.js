/**
 * Persona Manager v1.6.1
 * SillyTavern third-party extension
 *
 * Native Persona data only. No aliases, no data mutation, no API/Extras.
 * v1.6.1: official update hook (auto-reload), CN/EN entry heading support.
 */

import { power_user } from '../../../power-user.js';

const EXT = 'Persona Manager';
const VERSION = '1.6.1';
const ROOT_ID = 'pmp14-root';
const BUTTON_ID = 'pmp14-entry';
const ENTRY_MARK = 'pmp14-entry-installed';

const state = {
    active: false,
    tab: 'all',
    query: '',
    selected: new Set(),
    compareIds: [],
};

const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const normalizeText = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

function getPersonaDescription(raw) {
    if (raw == null) return '';
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    if (Array.isArray(raw)) return raw.map(getPersonaDescription).filter(Boolean).join('\n');
    if (typeof raw === 'object') {
        for (const key of ['description', 'text', 'content', 'value', 'persona_description']) {
            if (raw[key] != null) {
                const text = getPersonaDescription(raw[key]);
                if (text) return text;
            }
        }
    }
    return '';
}

function getPersonaData() {
    const personas = power_user?.personas || {};
    const descriptions = power_user?.persona_descriptions || {};

    return Object.entries(personas).map(([id, rawName]) => {
        const name = String(rawName ?? id);
        const description = getPersonaDescription(descriptions?.[id]);
        return {
            id,
            name,
            description,
            nameKey: normalizeText(name),
            descriptionKey: normalizeText(description),
        };
    });
}

function groupBy(items, keyFn) {
    const map = new Map();
    for (const item of items) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    }
    return [...map.values()];
}

function getSameNameGroups(personas) {
    return groupBy(personas, p => p.nameKey).filter(group => group.length > 1);
}

function getExactDuplicateGroups(personas) {
    return groupBy(personas, p => `${p.nameKey}\u0000${p.descriptionKey}`).filter(group => group.length > 1);
}

function bigrams(text) {
    const value = normalizeText(text);
    if (!value) return new Set();
    if (value.length === 1) return new Set([value]);
    const result = new Set();
    for (let i = 0; i < value.length - 1; i++) result.add(value.slice(i, i + 2));
    return result;
}

function similarity(a, b) {
    const x = normalizeText(a);
    const y = normalizeText(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const ax = bigrams(x);
    const by = bigrams(y);
    let intersection = 0;
    for (const gram of ax) if (by.has(gram)) intersection++;
    const union = ax.size + by.size - intersection;
    return union ? intersection / union : 0;
}

function getSimilarPairs(personas, threshold = 0.55) {
    const pairs = [];
    for (let i = 0; i < personas.length; i++) {
        for (let j = i + 1; j < personas.length; j++) {
            const a = personas[i];
            const b = personas[j];
            if (a.nameKey === b.nameKey) continue;
            if (!a.descriptionKey || !b.descriptionKey) continue;
            const score = similarity(a.description, b.description);
            if (score >= threshold) pairs.push({ a, b, score });
        }
    }
    return pairs.sort((a, b) => b.score - a.score);
}

function personaImageUrl(id) {
    if (!id) return '';
    return `/thumbnail?type=persona&file=${encodeURIComponent(id)}`;
}

function renderAvatar(persona, large = false) {
    const cls = large ? 'pmp14-avatar pmp14-avatar-large' : 'pmp14-avatar';
    const url = personaImageUrl(persona.id);
    return url
        ? `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy">`
        : `<div class="${cls} pmp14-avatar-fallback"><i class="fa-solid fa-user"></i></div>`;
}

function isInGroup(persona, groups) {
    return groups.some(group => group.some(item => item.id === persona.id));
}

function statusBadge(persona, all) {
    if (isInGroup(persona, getExactDuplicateGroups(all))) return '<span class="pmp14-badge pmp14-badge-danger">完全重复</span>';
    if (isInGroup(persona, getSameNameGroups(all))) return '<span class="pmp14-badge">同名</span>';
    return '';
}

function renderCard(persona, all) {
    const checked = state.selected.has(persona.id);
    return `
        <article class="pmp14-card ${checked ? 'is-selected' : ''}" data-persona-id="${escapeHtml(persona.id)}">
            <label class="pmp14-check"><input type="checkbox" data-action="select" ${checked ? 'checked' : ''}></label>
            ${renderAvatar(persona)}
            <div class="pmp14-card-main">
                <div class="pmp14-card-title-row">
                    <div class="pmp14-card-name" title="${escapeHtml(persona.name)}">${escapeHtml(persona.name)}</div>
                    ${statusBadge(persona, all)}
                </div>
                <div class="pmp14-card-id">ID：${escapeHtml(persona.id)}</div>
                <div class="pmp14-card-description">${persona.description ? escapeHtml(persona.description) : '<span class="pmp14-muted">暂无 Persona 描述 / 备注</span>'}</div>
            </div>
        </article>`;
}

function renderGroup(group, title, all) {
    return `
        <section class="pmp14-group">
            <div class="pmp14-group-head">
                <div><div class="pmp14-group-title">${escapeHtml(title)}</div><div class="pmp14-group-count">${group.length} 个 Persona</div></div>
                <button class="pmp14-small-btn" type="button" data-action="select-group" data-ids="${escapeHtml(group.map(x => x.id).join('|'))}">全选此组</button>
            </div>
            <div class="pmp14-group-grid">${group.map(persona => renderCard(persona, all)).join('')}</div>
        </section>`;
}

function emptyState(title, text) {
    return `<div class="pmp14-empty"><i class="fa-solid fa-magnifying-glass"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function searchMatch(persona, query) {
    const q = normalizeText(query);
    return !q || persona.nameKey.includes(q) || persona.descriptionKey.includes(q);
}

function renderAllView(personas) {
    const filtered = personas.filter(p => searchMatch(p, state.query));
    return filtered.length
        ? `<div class="pmp14-card-grid">${filtered.map(p => renderCard(p, personas)).join('')}</div>`
        : emptyState(state.query ? '没有找到匹配的 Persona' : '这里还没有可显示的 Persona', state.query ? '试试搜索名称或描述。' : 'SillyTavern 当前没有读取到 Persona 数据。');
}

function renderSameNameView(personas) {
    const groups = getSameNameGroups(personas).map(group => group.filter(p => searchMatch(p, state.query))).filter(group => group.length > 1);
    return groups.length ? groups.map(group => renderGroup(group, group[0].name, personas)).join('') : emptyState('没有发现同名 Persona', '同名检测使用 Persona 原始名称，不使用额外别名。');
}

function renderDuplicateView(personas) {
    const groups = getExactDuplicateGroups(personas).map(group => group.filter(p => searchMatch(p, state.query))).filter(group => group.length > 1);
    return groups.length ? groups.map((group, i) => renderGroup(group, `重复组 ${i + 1}`, personas)).join('') : emptyState('没有发现完全重复的 Persona', '判定条件：名称和 Persona 描述都完全一致。');
}

function renderMiniPersona(persona) {
    return `<div class="pmp14-mini">${renderAvatar(persona)}<div><strong>${escapeHtml(persona.name)}</strong><p>${persona.description ? escapeHtml(persona.description.slice(0, 180)) : '暂无描述'}</p></div></div>`;
}

function renderSimilarView(personas) {
    const q = normalizeText(state.query);
    const pairs = getSimilarPairs(personas).filter(({ a, b }) => !q || searchMatch(a, q) || searchMatch(b, q));
    if (!pairs.length) return emptyState('没有发现高度相似 Persona', '这是本地文本相似度提示，不会自动修改或删除 Persona。');
    return `<div class="pmp14-similar-list">${pairs.map(({ a, b, score }) => `
        <section class="pmp14-similar-pair">
            <div class="pmp14-similar-head"><div><span class="pmp14-score">${Math.round(score * 100)}%</span><span>描述相似度</span></div><button class="pmp14-small-btn" data-action="compare-pair" data-a="${escapeHtml(a.id)}" data-b="${escapeHtml(b.id)}">对比</button></div>
            <div class="pmp14-compare-mini">${renderMiniPersona(a)}${renderMiniPersona(b)}</div>
        </section>`).join('')}</div>`;
}

function diffMode(score) {
    if (score >= 0.9) return { key: 'focus-different', title: '高相似：突出差异', desc: '大部分内容相同，重点标出版本之间真正不同的部分。' };
    if (score >= 0.7) return { key: 'balanced', title: '中高相似：平衡差异', desc: '同时保留共同点，并强调新增、删除和修改。' };
    if (score >= 0.4) return { key: 'balanced', title: '中等相似：平衡阅读', desc: '共同内容与差异内容使用不同层级的视觉强调。' };
    return { key: 'focus-common', title: '低相似：突出共同点', desc: '两份描述差别较大，优先帮助你找到真正重合的内容。' };
}

function tokenize(text) {
    return String(text).match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) || [];
}

function lcsDiff(aTokens, bTokens, equalFn = (a, b) => a === b) {
    const n = aTokens.length;
    const m = bTokens.length;
    if (n * m > 9000) return [{ type: 'replace', a: aTokens, b: bTokens }];
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) dp[i][j] = equalFn(aTokens[i], bTokens[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
    const out = [];
    let i = 0, j = 0;
    const push = (type, a, b) => {
        if (!a.length && !b.length) return;
        const last = out[out.length - 1];
        if (last && last.type === type) { last.a.push(...a); last.b.push(...b); }
        else out.push({ type, a: [...a], b: [...b] });
    };
    while (i < n && j < m) {
        if (equalFn(aTokens[i], bTokens[j])) { push('same', [aTokens[i]], [bTokens[j]]); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { push('remove', [aTokens[i]], []); i++; }
        else { push('add', [], [bTokens[j]]); j++; }
    }
    if (i < n) push('remove', aTokens.slice(i), []);
    if (j < m) push('add', [], bTokens.slice(j));
    return out;
}

function inlineDiff(a, b) {
    const aTokens = tokenize(a);
    const bTokens = tokenize(b);
    return lcsDiff(aTokens, bTokens).map(part => {
        const left = escapeHtml(part.a.join(''));
        const right = escapeHtml(part.b.join(''));
        if (part.type === 'same') return { left, right, type: 'same' };
        if (part.type === 'remove') return { left: `<mark class="pmp14-diff-remove">${left}</mark>`, right: '', type: 'remove' };
        if (part.type === 'add') return { left: '', right: `<mark class="pmp14-diff-add">${right}</mark>`, type: 'add' };
        return { left: `<mark class="pmp14-diff-remove">${left}</mark>`, right: `<mark class="pmp14-diff-add">${right}</mark>`, type: 'replace' };
    });
}

function compareLines(aText, bText) {
    const aLines = String(aText || '').replace(/\r\n?/g, '\n').split('\n');
    const bLines = String(bText || '').replace(/\r\n?/g, '\n').split('\n');
    const diff = lcsDiff(aLines, bLines, (a, b) => normalizeText(a) === normalizeText(b));
    const rows = [];
    for (let i = 0; i < diff.length; i++) {
        const part = diff[i];
        if (part.type === 'same') {
            for (let k = 0; k < part.a.length; k++) rows.push({ a: part.a[k], b: part.b[k], type: 'same' });
        } else if (part.type === 'remove') {
            for (const line of part.a) rows.push({ a: line, b: '', type: 'remove' });
        } else if (part.type === 'add') {
            for (const line of part.b) rows.push({ a: '', b: line, type: 'add' });
        } else {
            const count = Math.max(part.a.length, part.b.length);
            for (let k = 0; k < count; k++) {
                const left = part.a[k] ?? '';
                const right = part.b[k] ?? '';
                const pieces = inlineDiff(left, right);
                rows.push({ a: pieces.map(p => p.left).join(''), b: pieces.map(p => p.right).join(''), type: left && right ? 'replace' : (left ? 'remove' : 'add') });
            }
        }
    }
    return rows;
}

function countChanges(rows) {
    return {
        common: rows.filter(r => r.type === 'same').length,
        changed: rows.filter(r => r.type === 'replace').length,
        onlyA: rows.filter(r => r.type === 'remove').length,
        onlyB: rows.filter(r => r.type === 'add').length,
    };
}

function renderCompareWorkspace(personas) {
    const chosen = state.compareIds.map(id => personas.find(p => p.id === id)).filter(Boolean).slice(0, 2);
    if (chosen.length < 2) return renderManagerContent(personas);

    const [a, b] = chosen;
    const score = similarity(a.description, b.description);
    const mode = diffMode(score);
    const rows = compareLines(a.description, b.description);
    const counts = countChanges(rows);
    const total = Math.max(rows.length, 1);
    const commonPct = Math.round((counts.common / total) * 100);

    return `
        <div class="pmp14-compare-workspace ${mode.key}">
            <div class="pmp14-compare-topbar">
                <button class="pmp14-back-btn" data-action="exit-compare"><i class="fa-solid fa-arrow-left"></i> 返回列表</button>
                <div class="pmp14-compare-title"><strong>Persona 对比</strong><span>${escapeHtml(mode.title)}</span></div>
                <button class="pmp14-small-btn" data-action="swap-compare"><i class="fa-solid fa-right-left"></i> 交换</button>
            </div>
            <div class="pmp14-compare-summary">
                <div class="pmp14-score-block"><div class="pmp14-big-score">${Math.round(score * 100)}<small>%</small></div><div><strong>描述相似度</strong><span>${escapeHtml(mode.desc)}</span></div></div>
                <div class="pmp14-metrics">
                    <div><b>${commonPct}%</b><span>共同行</span></div>
                    <div><b>${counts.changed}</b><span>修改</span></div>
                    <div><b>${counts.onlyA}</b><span>A 独有</span></div>
                    <div><b>${counts.onlyB}</b><span>B 独有</span></div>
                </div>
            </div>
            <div class="pmp14-compare-legend"><span><i class="common"></i>共同</span><span><i class="changed"></i>修改</span><span><i class="removed"></i>A 独有</span><span><i class="added"></i>B 独有</span></div>
            <div class="pmp14-compare-panels">
                <section class="pmp14-side-panel" data-scroll="compare">
                    <header>${renderAvatar(a, true)}<div><strong>${escapeHtml(a.name)}</strong><span>ID：${escapeHtml(a.id)}</span></div><em>A</em></header>
                    <div class="pmp14-diff-body" id="pmp14-left-diff">${rows.map((row, i) => `<div class="pmp14-diff-row ${row.type}" data-row="${i}"><span class="pmp14-line-no">${i + 1}</span><code>${row.a || '<span class="pmp14-placeholder">—</span>'}</code></div>`).join('')}</div>
                </section>
                <div class="pmp14-diff-rail">${rows.map((row, i) => `<button class="${row.type}" data-action="jump-row" data-row="${i}" title="${row.type}">${row.type === 'same' ? '=' : row.type === 'replace' ? '≠' : row.type === 'remove' ? '−' : '+'}</button>`).join('')}</div>
                <section class="pmp14-side-panel" data-scroll="compare">
                    <header>${renderAvatar(b, true)}<div><strong>${escapeHtml(b.name)}</strong><span>ID：${escapeHtml(b.id)}</span></div><em>B</em></header>
                    <div class="pmp14-diff-body" id="pmp14-right-diff">${rows.map((row, i) => `<div class="pmp14-diff-row ${row.type}" data-row="${i}"><span class="pmp14-line-no">${i + 1}</span><code>${row.b || '<span class="pmp14-placeholder">—</span>'}</code></div>`).join('')}</div>
                </section>
            </div>
        </div>`;
}

function tabButton(key, label, icon, count) {
    return `<button class="pmp14-tab ${state.tab === key ? 'is-active' : ''}" type="button" data-action="tab" data-tab="${key}"><i class="fa-solid ${icon}"></i><span>${label}</span>${typeof count === 'number' ? `<em>${count}</em>` : ''}</button>`;
}

function renderManagerContent(personas) {
    return state.tab === 'all' ? renderAllView(personas)
        : state.tab === 'same-name' ? renderSameNameView(personas)
        : state.tab === 'duplicates' ? renderDuplicateView(personas)
        : renderSimilarView(personas);
}

function renderManager() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const personas = getPersonaData();
    const sameNameGroups = getSameNameGroups(personas);
    const duplicateGroups = getExactDuplicateGroups(personas);
    const similarPairs = getSimilarPairs(personas);

    root.innerHTML = `
        <div class="pmp14-backdrop" data-action="close"></div>
        <section class="pmp14-window" role="dialog" aria-modal="true" aria-label="Persona Manager">
            <header class="pmp14-header">
                <div class="pmp14-brand"><div class="pmp14-brand-icon"><i class="fa-solid fa-users-viewfinder"></i></div><div><h1>Persona Manager</h1><span>整理、识别与对比你的 Persona</span></div></div>
                <button class="pmp14-close" type="button" data-action="close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </header>
            ${state.compareIds.length >= 2 ? renderCompareWorkspace(personas) : `
            <div class="pmp14-toolbar">
                <div class="pmp14-search"><i class="fa-solid fa-magnifying-glass"></i><input id="pmp14-search" type="search" value="${escapeHtml(state.query)}" placeholder="搜索 Persona 名称或描述…" autocomplete="off">${state.query ? '<button data-action="clear-search"><i class="fa-solid fa-xmark"></i></button>' : ''}</div>
                <div class="pmp14-stats"><span><b>${personas.length}</b> 全部</span><span><b>${sameNameGroups.length}</b> 同名组</span><span><b>${duplicateGroups.length}</b> 重复组</span><span><b>${similarPairs.length}</b> 相似对</span></div>
            </div>
            <nav class="pmp14-tabs">${tabButton('all', '全部 Persona', 'fa-layer-group')}${tabButton('same-name', '同名 Persona', 'fa-people-group', sameNameGroups.length)}${tabButton('duplicates', '完全重复', 'fa-copy', duplicateGroups.length)}${tabButton('similar', '高度相似', 'fa-clone', similarPairs.length)}</nav>
            <main class="pmp14-content">${renderManagerContent(personas)}</main>
            ${state.selected.size >= 2 ? `<div class="pmp14-selection-bar"><div><strong>已选择 ${state.selected.size} 个 Persona</strong><span>对比时会自动取前两个，建议选择 2 个</span></div><button class="pmp14-primary-btn" data-action="compare-selected"><i class="fa-solid fa-code-compare"></i> 开始对比</button><button class="pmp14-small-btn" data-action="clear-selection">清除选择</button></div>` : ''}`}
        </section>`;

    const input = document.getElementById('pmp14-search');
    if (input && document.activeElement !== input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
    bindCompareScroll();
}

function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.hidden = true;
        document.body.appendChild(root);
    }
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.addEventListener('click', event => {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (action === 'close') {
            if (target.classList.contains('pmp14-backdrop') || target.classList.contains('pmp14-close')) closeManager();
            return;
        }
        if (action === 'tab') { state.tab = target.dataset.tab || 'all'; state.selected.clear(); state.compareIds = []; renderManager(); return; }
        if (action === 'clear-search') { state.query = ''; renderManager(); return; }
        if (action === 'clear-selection') { state.selected.clear(); renderManager(); return; }
        if (action === 'select-group') { for (const id of (target.dataset.ids || '').split('|').filter(Boolean)) state.selected.add(id); renderManager(); return; }
        if (action === 'compare-pair') { state.compareIds = [target.dataset.a, target.dataset.b]; state.selected.clear(); renderManager(); return; }
        if (action === 'compare-selected') { state.compareIds = [...state.selected].slice(0, 2); state.selected.clear(); renderManager(); return; }
        if (action === 'exit-compare') { state.compareIds = []; renderManager(); return; }
        if (action === 'swap-compare') { state.compareIds.reverse(); renderManager(); return; }
        if (action === 'jump-row') {
            const row = target.dataset.row;
            document.querySelectorAll(`#pmp14-left-diff [data-row="${row}"], #pmp14-right-diff [data-row="${row}"]`).forEach(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        }
    });

    root.addEventListener('change', event => {
        const input = event.target.closest('input[data-action="select"]');
        if (!input) return;
        const card = input.closest('[data-persona-id]');
        if (!card) return;
        if (input.checked) state.selected.add(card.dataset.personaId); else state.selected.delete(card.dataset.personaId);
        renderManager();
    });

    root.addEventListener('input', event => {
        if (event.target.id !== 'pmp14-search') return;
        state.query = event.target.value;
        const caret = event.target.selectionStart;
        renderManager();
        const next = document.getElementById('pmp14-search');
        if (next) next.setSelectionRange(caret, caret);
    });
}

function bindCompareScroll() {
    const panels = [...document.querySelectorAll('#pmp14-root [data-scroll="compare"] .pmp14-diff-body')];
    if (panels.length !== 2) return;
    let syncing = false;
    panels.forEach(panel => panel.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        const other = panels.find(p => p !== panel);
        if (other) other.scrollTop = panel.scrollTop;
        requestAnimationFrame(() => { syncing = false; });
    }));
}

function openManager(tab = 'all') {
    ensureRoot();
    state.active = true;
    state.tab = tab;
    state.selected.clear();
    state.compareIds = [];
    const root = document.getElementById(ROOT_ID);
    root.hidden = false;
    document.body.classList.add('pmp14-open');
    renderManager();
}

function closeManager() {
    state.active = false;
    state.selected.clear();
    state.compareIds = [];
    const root = document.getElementById(ROOT_ID);
    if (root) root.hidden = true;
    document.body.classList.remove('pmp14-open');
}

function findGlobalSettingsHeading() {
    const elements = document.querySelectorAll(
        'h1,h2,h3,h4,h5,h6,legend,.inline-drawer-header,.menu_section_header,.setting-item-label,div,span'
    );
    for (const element of elements) {
        if (element.dataset.pmp14 === ENTRY_MARK) continue;
        if (element.children.length > 3) continue;
        const text = element.textContent?.trim();
        // 同时兼容中文界面与英文界面
        if (text !== '全局设置' && text !== 'Global Settings') continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        return element;
    }
    return null;
}

function makeEntry() {
    const entry = document.createElement('button');
    entry.id = BUTTON_ID;
    entry.type = 'button';
    entry.className = 'menu_button pmp14-entry';
    entry.dataset.pmp14 = ENTRY_MARK;
    entry.innerHTML = '<i class="fa-solid fa-users-viewfinder"></i><span>Persona Manager</span><small>管理 / 对比 / 重复检测</small>';
    entry.addEventListener('click', () => openManager('all'));
    return entry;
}

function injectEntry() {
    if (document.getElementById(BUTTON_ID)) return true;
    const heading = findGlobalSettingsHeading();
    if (!heading?.parentNode) return false;
    heading.parentNode.insertBefore(makeEntry(), heading);
    return true;
}

function installEntryObserver() {
    if (window.__pmp14Observer) return;
    const observer = new MutationObserver(() => {
        if (injectEntry()) {
            observer.disconnect();
            window.__pmp14Observer = null;
        }
    });
    window.__pmp14Observer = observer;
    observer.observe(document.body, { childList: true, subtree: true });
    if (injectEntry()) {
        observer.disconnect();
        window.__pmp14Observer = null;
    }
}

function installKeyboardHandler() {
    if (window.__pmp14Keyboard) return;
    const handler = event => {
        if (!state.active) return;
        if (event.key === 'Escape') { closeManager(); return; }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            const input = document.getElementById('pmp14-search');
            if (input && !state.compareIds.length) { event.preventDefault(); input.focus(); }
        }
    };
    window.__pmp14Keyboard = handler;
    document.addEventListener('keydown', handler);
}

async function init() {
    ensureRoot();
    installKeyboardHandler();
    installEntryObserver();
    console.log(`[${EXT}] v${VERSION} loaded`);
}

(async () => {
    try { await init(); }
    catch (error) {
        console.error(`[${EXT}] 初始化失败`, error);
        if (typeof toastr !== 'undefined') toastr.error(`${EXT} 初始化失败：${error?.message || error}`);
    }
})();

/**
 * SillyTavern 官方扩展管理器更新成功后调用（manifest.hooks.update）
 * 在弹出 “Reload the page to apply updates” 之前触发，直接刷新使新代码生效。
 */
export function onUpdate() {
    location.reload();
}
