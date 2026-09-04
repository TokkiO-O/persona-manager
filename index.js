/**
 * Persona Manager v1.8.6
 * Clean rebuild: one entry path, correct persona_descriptions write-back,
 * low-overhead observers, multi-column compare, list edit, update check.
 */

import { power_user } from '../../../power-user.js';

const EXT = 'Persona Manager';
const VERSION = '1.8.6';
const ROOT_ID = 'pmp18-root';
const BUTTON_ID = 'pmp18-entry';
const ENTRY_MARK = 'pmp18-entry-installed';
const STORAGE_KEY = 'pmp18_settings';

const CHANGELOG = `## v1.8.6
- 修复入口被重复代码覆盖导致按钮消失
- 修复写回描述后原生界面变空白（兼容 string/object 结构）
- 大幅降低常驻观察与轮询，减轻换人设卡顿
- 保留多列横滑对比、列表编辑、相似阈值、更新检查

## v1.8.5 / 1.8.3
- 更新检测、同名可参与相似、列表编辑等`;

const defaultSettings = {
    similarityThreshold: 0.55,
    includeSameNameInSimilar: true,
    compareLayout: 'revision',
    showDiffOnly: false,
    softMatchThreshold: 0.35,
};

const state = {
    active: false,
    tab: 'all',
    query: '',
    selected: new Set(),
    compareIds: [],
    baselineId: null,
    settings: loadSettings(),
    updateInfo: null,
};

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...defaultSettings };
        return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
        return { ...defaultSettings };
    }
}

function saveSettingsLocal() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch { /* ignore */ }
}

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

/* ---------- Persona data (ST-compatible) ---------- */

/** Read description text whether stored as string or { description } */
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

/**
 * Write description while preserving ST object shape:
 * { description, position, depth, role, title, ... }
 * Also handles legacy string values.
 */
function persistPersonaDescription(id, description) {
    if (!power_user) return false;
    if (!power_user.persona_descriptions) power_user.persona_descriptions = {};

    const prev = power_user.persona_descriptions[id];
    let base = {};
    if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
        base = { ...prev };
    } else if (typeof prev === 'string') {
        base = { description: prev };
    }

    const nextText = String(description ?? '');
    power_user.persona_descriptions[id] = {
        ...base,
        description: nextText,
    };

    // Sync visible ST persona description field if present
    try {
        const ta = document.querySelector('#persona_description, textarea[name="persona_description"], #persona-description-textarea');
        if (ta && typeof ta.value === 'string') {
            const activeId = power_user.user_avatar || window.user_avatar;
            if (!activeId || String(activeId) === String(id)) {
                ta.value = nextText;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    } catch { /* ignore */ }

    savePowerUserSettings();
    emitPersonaUpdated(id);
    return true;
}

function persistPersonaFull(id, name, description) {
    if (!power_user) return false;
    if (!power_user.personas) power_user.personas = {};
    power_user.personas[id] = String(name ?? id);
    persistPersonaDescription(id, description);
    return true;
}

function savePowerUserSettings() {
    try {
        if (typeof window.saveSettingsDebounced === 'function') {
            window.saveSettingsDebounced();
            return;
        }
    } catch { /* ignore */ }
    try {
        if (typeof window.saveSettings === 'function') {
            window.saveSettings();
        }
    } catch { /* ignore */ }
}

function emitPersonaUpdated(id) {
    try {
        const ctx = window.SillyTavern?.getContext?.();
        const es = ctx?.eventSource;
        const types = ctx?.eventTypes || ctx?.event_types;
        if (es?.emit && types?.PERSONA_UPDATED) {
            es.emit(types.PERSONA_UPDATED, id);
            return;
        }
        if (es?.emit) {
            es.emit('PERSONA_UPDATED', id);
        }
    } catch { /* ignore */ }
    try {
        document.dispatchEvent(new CustomEvent('pmp18-persona-updated', { detail: { id } }));
    } catch { /* ignore */ }
}

/* ---------- Grouping / similarity ---------- */

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
    return groupBy(personas, p => p.nameKey).filter(g => g.length > 1);
}

function getExactDuplicateGroups(personas) {
    return groupBy(personas, p => `${p.nameKey}\u0000${p.descriptionKey}`).filter(g => g.length > 1);
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

function getSimilarPairs(personas, threshold = state.settings.similarityThreshold) {
    const pairs = [];
    const allowSameName = state.settings.includeSameNameInSimilar;
    for (let i = 0; i < personas.length; i++) {
        for (let j = i + 1; j < personas.length; j++) {
            const a = personas[i];
            const b = personas[j];
            if (!allowSameName && a.nameKey === b.nameKey) continue;
            if (!a.descriptionKey || !b.descriptionKey) continue;
            if (a.descriptionKey === b.descriptionKey && a.nameKey === b.nameKey) continue;
            const score = similarity(a.description, b.description);
            if (score >= threshold) pairs.push({ a, b, score });
        }
    }
    return pairs.sort((x, y) => y.score - x.score);
}

function personaImageUrl(id) {
    if (!id) return '';
    return `/thumbnail?type=persona&file=${encodeURIComponent(id)}`;
}

function renderAvatar(persona) {
    const url = personaImageUrl(persona.id);
    return url
        ? `<img class="pmp18-avatar" src="${escapeHtml(url)}" alt="" loading="lazy">`
        : `<div class="pmp18-avatar pmp18-avatar-fallback"><i class="fa-solid fa-user"></i></div>`;
}

function isInGroup(persona, groups) {
    return groups.some(g => g.some(item => item.id === persona.id));
}

function statusBadge(persona, all) {
    if (isInGroup(persona, getExactDuplicateGroups(all))) return '<span class="pmp18-badge pmp18-badge-danger">完全重复</span>';
    if (isInGroup(persona, getSameNameGroups(all))) return '<span class="pmp18-badge">同名</span>';
    return '';
}

/* ---------- Diff: field-aware units + unordered + inline (A+C) ---------- */

function splitUnits(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n');
    if (!raw.trim()) return [];

    const lines = raw.split('\n');
    const fieldLine = /^\s*[\w\u4e00-\u9fff./_-]+\s*[:：]/.test.bind(/^\s*[\w\u4e00-\u9fff./_-]+\s*[:：]/);
    const fieldCount = lines.filter(l => fieldLine(l)).length;
    const useFields = fieldCount >= 3 && fieldCount / Math.max(lines.filter(l => l.trim()).length, 1) >= 0.35;

    if (useFields) {
        const units = [];
        let buf = [];
        const flush = () => {
            const t = buf.join('\n').trim();
            if (t) units.push(t);
            buf = [];
        };
        for (const line of lines) {
            if (fieldLine(line) && buf.length) flush();
            buf.push(line);
        }
        flush();
        return units.length ? units : [raw.trim()];
    }

    let parts = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) parts = lines.map(s => s.trim()).filter(Boolean);
    return parts;
}

function tokenize(text) {
    return String(text).match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) || [];
}

function lcsDiff(aTokens, bTokens) {
    const n = aTokens.length;
    const m = bTokens.length;
    if (n * m > 12000) return [{ type: 'replace', a: aTokens, b: bTokens }];
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = aTokens[i] === bTokens[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out = [];
    let i = 0, j = 0;
    const push = (type, a, b) => {
        if (!a.length && !b.length) return;
        const last = out[out.length - 1];
        if (last && last.type === type) {
            last.a.push(...a);
            last.b.push(...b);
        } else out.push({ type, a: [...a], b: [...b] });
    };
    while (i < n && j < m) {
        if (aTokens[i] === bTokens[j]) {
            push('same', [aTokens[i]], [bTokens[j]]);
            i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            push('remove', [aTokens[i]], []);
            i++;
        } else {
            push('add', [], [bTokens[j]]);
            j++;
        }
    }
    if (i < n) push('remove', aTokens.slice(i), []);
    if (j < m) push('add', [], bTokens.slice(j));
    return out;
}

function inlineDiffHtml(a, b) {
    const parts = lcsDiff(tokenize(a), tokenize(b));
    let left = '';
    let right = '';
    for (const part of parts) {
        const L = escapeHtml(part.a.join(''));
        const R = escapeHtml(part.b.join(''));
        if (part.type === 'same') {
            left += L;
            right += R;
        } else if (part.type === 'remove') {
            left += L ? `<mark class="pmp18-del">${L}</mark>` : '';
        } else if (part.type === 'add') {
            right += R ? `<mark class="pmp18-add">${R}</mark>` : '';
        } else {
            left += L ? `<mark class="pmp18-del">${L}</mark>` : '';
            right += R ? `<mark class="pmp18-add">${R}</mark>` : '';
        }
    }
    return { left, right };
}

function unorderedDiff(aText, bText) {
    const aUnits = splitUnits(aText);
    const bUnits = splitUnits(bText);
    const usedB = new Set();
    const pairs = [];
    const soft = state.settings.softMatchThreshold ?? 0.35;

    for (let i = 0; i < aUnits.length; i++) {
        const na = normalizeText(aUnits[i]);
        let matched = false;
        for (let j = 0; j < bUnits.length; j++) {
            if (usedB.has(j)) continue;
            if (normalizeText(bUnits[j]) === na) {
                pairs.push({ type: 'same', a: aUnits[i], b: bUnits[j], ai: i, bj: j });
                usedB.add(j);
                matched = true;
                break;
            }
        }
        if (!matched) pairs.push({ type: 'pending', a: aUnits[i], b: null, ai: i, bj: -1 });
    }

    for (const p of pairs) {
        if (p.type !== 'pending') continue;
        let bestJ = -1;
        let bestScore = 0;
        for (let j = 0; j < bUnits.length; j++) {
            if (usedB.has(j)) continue;
            const s = similarity(p.a, bUnits[j]);
            if (s > bestScore) {
                bestScore = s;
                bestJ = j;
            }
        }
        if (bestJ >= 0 && bestScore >= soft) {
            p.type = bestScore >= 0.92 ? 'same' : 'replace';
            p.b = bUnits[bestJ];
            p.bj = bestJ;
            usedB.add(bestJ);
        } else {
            p.type = 'remove';
            p.b = '';
        }
    }

    for (let j = 0; j < bUnits.length; j++) {
        if (usedB.has(j)) continue;
        pairs.push({ type: 'add', a: '', b: bUnits[j], ai: -1, bj: j });
    }

    pairs.sort((x, y) => {
        if (x.ai >= 0 && y.ai >= 0) return x.ai - y.ai;
        if (x.ai >= 0) return -1;
        if (y.ai >= 0) return 1;
        return x.bj - y.bj;
    });
    return pairs;
}

function countPairStats(rows) {
    return {
        same: rows.filter(r => r.type === 'same').length,
        replace: rows.filter(r => r.type === 'replace').length,
        remove: rows.filter(r => r.type === 'remove').length,
        add: rows.filter(r => r.type === 'add').length,
    };
}

function diffModeClass(score) {
    if (score >= 0.85) return 'mode-high';
    if (score >= 0.5) return 'mode-mid';
    return 'mode-low';
}

/** Always run inline on same/replace so small wording diffs are visible (scheme A) */
function renderColumnBlocks(baseText, otherText, showDiffOnly, isBaselineOnly) {
    if (isBaselineOnly) {
        const units = splitUnits(baseText);
        if (!units.length) return '<div class="pmp18-muted" style="padding:12px">（无描述）</div>';
        return units.map(u => `<div class="pmp18-col-block">${escapeHtml(u)}</div>`).join('');
    }

    const rows = unorderedDiff(baseText, otherText);
    const parts = [];
    for (const row of rows) {
        if (showDiffOnly && row.type === 'same') {
            // still show same-blocks that have internal wording diffs
            if (row.a && row.b && normalizeText(row.a) === normalizeText(row.b)) continue;
        }
        if (row.type === 'same') {
            if (row.a === row.b || normalizeText(row.a) === normalizeText(row.b)) {
                if (showDiffOnly) continue;
                parts.push(`<div class="pmp18-col-block same">${escapeHtml(row.b || row.a)}</div>`);
            } else {
                const { right } = inlineDiffHtml(row.a, row.b);
                parts.push(`<div class="pmp18-col-block replace">${right}</div>`);
            }
        } else if (row.type === 'remove') {
            parts.push(`<div class="pmp18-col-block remove"><span class="pmp18-tag">基准有</span><mark class="pmp18-del">${escapeHtml(row.a)}</mark></div>`);
        } else if (row.type === 'add') {
            parts.push(`<div class="pmp18-col-block add"><span class="pmp18-tag">对方有</span><mark class="pmp18-add">${escapeHtml(row.b)}</mark></div>`);
        } else {
            const { left, right } = inlineDiffHtml(row.a, row.b);
            parts.push(`<div class="pmp18-col-block replace">
                <div class="pmp18-rev-line"><span class="pmp18-tag">基准</span>${left}</div>
                <div class="pmp18-rev-line"><span class="pmp18-tag">对方</span>${right}</div>
            </div>`);
        }
    }
    return parts.join('') || '<div class="pmp18-muted" style="padding:12px">无差异或已全部过滤</div>';
}

/* ---------- UI: cards / lists ---------- */

function renderCard(persona, all) {
    const checked = state.selected.has(persona.id);
    return `
        <article class="pmp18-card ${checked ? 'is-selected' : ''}" data-persona-id="${escapeHtml(persona.id)}">
            <label class="pmp18-check" title="选择以参与对比">
                <input type="checkbox" data-action="select" ${checked ? 'checked' : ''}>
            </label>
            ${renderAvatar(persona)}
            <div class="pmp18-card-main">
                <div class="pmp18-card-title-row">
                    <div class="pmp18-card-name" title="${escapeHtml(persona.name)}">${escapeHtml(persona.name)}</div>
                    ${statusBadge(persona, all)}
                </div>
                <div class="pmp18-card-id">ID：${escapeHtml(persona.id)}</div>
                <div class="pmp18-card-description">${persona.description ? escapeHtml(persona.description) : '<span class="pmp18-muted">暂无描述</span>'}</div>
                <div class="pmp18-card-actions">
                    <button type="button" class="pmp18-small-btn" data-action="edit-full" data-id="${escapeHtml(persona.id)}"><i class="fa-solid fa-pen"></i> 编辑</button>
                </div>
            </div>
        </article>`;
}

function renderGroup(group, title, all) {
    return `
        <section class="pmp18-group">
            <div class="pmp18-group-head">
                <div><div class="pmp18-group-title">${escapeHtml(title)}</div><div class="pmp18-group-count">${group.length} 个</div></div>
                <button class="pmp18-small-btn" type="button" data-action="select-group" data-ids="${escapeHtml(group.map(x => x.id).join('|'))}">全选此组</button>
            </div>
            <div class="pmp18-group-grid">${group.map(p => renderCard(p, all)).join('')}</div>
        </section>`;
}

function emptyState(title, text) {
    return `<div class="pmp18-empty"><i class="fa-solid fa-magnifying-glass"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function searchMatch(persona, query) {
    const q = normalizeText(query);
    return !q || persona.nameKey.includes(q) || persona.descriptionKey.includes(q);
}

function renderAllView(personas) {
    const filtered = personas.filter(p => searchMatch(p, state.query));
    return filtered.length
        ? `<div class="pmp18-card-grid">${filtered.map(p => renderCard(p, personas)).join('')}</div>`
        : emptyState(state.query ? '没有匹配' : '没有 Persona', '检查是否已创建用户设定中的 Persona。');
}

function renderSameNameView(personas) {
    const groups = getSameNameGroups(personas).map(g => g.filter(p => searchMatch(p, state.query))).filter(g => g.length > 1);
    return groups.length ? groups.map(g => renderGroup(g, g[0].name, personas)).join('') : emptyState('没有同名 Persona', '');
}

function renderDuplicateView(personas) {
    const groups = getExactDuplicateGroups(personas).map(g => g.filter(p => searchMatch(p, state.query))).filter(g => g.length > 1);
    return groups.length ? groups.map((g, i) => renderGroup(g, `重复组 ${i + 1}`, personas)).join('') : emptyState('没有完全重复', '名称与描述均一致才会列入。');
}

function renderSimilarView(personas) {
    const q = normalizeText(state.query);
    const pairs = getSimilarPairs(personas).filter(({ a, b }) => !q || searchMatch(a, q) || searchMatch(b, q));
    if (!pairs.length) {
        return emptyState('没有高度相似', `阈值 ${Math.round(state.settings.similarityThreshold * 100)}% · 同名${state.settings.includeSameNameInSimilar ? '已纳入' : '已排除'}`);
    }
    return `<div class="pmp18-similar-list">${pairs.map(({ a, b, score }) => `
        <section class="pmp18-similar-pair">
            <div class="pmp18-similar-head">
                <div><span class="pmp18-score">${Math.round(score * 100)}%</span>
                ${a.nameKey === b.nameKey ? '<span class="pmp18-badge">同名</span>' : ''}</div>
                <button class="pmp18-small-btn" data-action="compare-pair" data-a="${escapeHtml(a.id)}" data-b="${escapeHtml(b.id)}">对比</button>
            </div>
            <div class="pmp18-compare-mini">
                <div class="pmp18-mini">${renderAvatar(a)}<div><strong>${escapeHtml(a.name)}</strong><p>${escapeHtml((a.description || '').slice(0, 160))}</p></div></div>
                <div class="pmp18-mini">${renderAvatar(b)}<div><strong>${escapeHtml(b.name)}</strong><p>${escapeHtml((b.description || '').slice(0, 160))}</p></div></div>
            </div>
        </section>`).join('')}</div>`;
}

function renderCompareWorkspace(personas) {
    const ids = state.compareIds.filter(id => personas.some(p => p.id === id));
    if (ids.length < 2) {
        state.compareIds = [];
        state.baselineId = null;
        return renderManagerContent(personas);
    }
    if (!state.baselineId || !ids.includes(state.baselineId)) state.baselineId = ids[0];

    const base = personas.find(p => p.id === state.baselineId);
    const others = ids.filter(id => id !== state.baselineId).map(id => personas.find(p => p.id === id)).filter(Boolean);
    const showDiffOnly = state.settings.showDiffOnly;

    const baselineButtons = ids.map(id => {
        const p = personas.find(x => x.id === id);
        if (!p) return '';
        return `<button type="button" class="pmp18-base-btn ${id === state.baselineId ? 'is-active' : ''}" data-action="set-baseline" data-id="${escapeHtml(id)}">${escapeHtml(p.name)}</button>`;
    }).join('');

    const otherCols = others.map(o => {
        const score = similarity(base.description, o.description);
        const stats = countPairStats(unorderedDiff(base.description, o.description));
        const mode = diffModeClass(score);
        return `
            <section class="pmp18-hcol pmp18-hcol-other ${mode}">
                <div class="pmp18-hcol-head">
                    <div class="pmp18-pair-person">
                        ${renderAvatar(o)}
                        <div>
                            <strong title="${escapeHtml(o.name)}">${escapeHtml(o.name)}</strong>
                            <span>对比 · ${Math.round(score * 100)}%</span>
                        </div>
                        <button type="button" class="pmp18-icon-btn" data-action="edit-full" data-id="${escapeHtml(o.id)}"><i class="fa-solid fa-pen"></i></button>
                    </div>
                    <div class="pmp18-pair-stats">
                        <span>同 ${stats.same}</span><span>改 ${stats.replace}</span><span>− ${stats.remove}</span><span>+ ${stats.add}</span>
                    </div>
                </div>
                <div class="pmp18-hcol-body">${renderColumnBlocks(base.description, o.description, showDiffOnly, false)}</div>
            </section>`;
    }).join('');

    return `
        <div class="pmp18-compare-workspace">
            <div class="pmp18-compare-topbar">
                <button type="button" class="pmp18-back-btn" data-action="exit-compare"><i class="fa-solid fa-arrow-left"></i> 返回</button>
                <div class="pmp18-compare-title">
                    <strong>Persona 对比</strong>
                    <span>共 ${ids.length} 个 · 左基准固定 · 右可横滑</span>
                </div>
                <div class="pmp18-compare-tools">
                    <button type="button" class="pmp18-small-btn ${showDiffOnly ? 'is-on' : ''}" data-action="toggle-diff-only">只看差异</button>
                    <button type="button" class="pmp18-small-btn" data-action="edit-full" data-id="${escapeHtml(base.id)}"><i class="fa-solid fa-pen"></i> 编辑基准</button>
                </div>
            </div>
            <div class="pmp18-baseline-bar">
                <span class="pmp18-baseline-label">基准：</span>
                <div class="pmp18-baseline-list">${baselineButtons}</div>
            </div>
            <div class="pmp18-hscroll-wrap">
                <section class="pmp18-hcol pmp18-hcol-base">
                    <div class="pmp18-hcol-head">
                        <div class="pmp18-pair-person">
                            ${renderAvatar(base)}
                            <div><strong>${escapeHtml(base.name)}</strong><span>基准（固定）</span></div>
                        </div>
                    </div>
                    <div class="pmp18-hcol-body">${renderColumnBlocks(base.description, '', false, true)}</div>
                </section>
                <div class="pmp18-hscroll">${otherCols}</div>
            </div>
        </div>`;
}

function tabButton(key, label, icon, count) {
    const extra = key === 'settings' && state.updateInfo?.available ? '<em class="pmp18-new">NEW</em>' : (typeof count === 'number' ? `<em>${count}</em>` : '');
    return `<button class="pmp18-tab ${state.tab === key ? 'is-active' : ''}" type="button" data-action="tab" data-tab="${key}"><i class="fa-solid ${icon}"></i><span>${label}</span>${extra}</button>`;
}

function renderSettingsPanel() {
    const t = Math.round(state.settings.similarityThreshold * 100);
    const soft = Math.round((state.settings.softMatchThreshold ?? 0.35) * 100);
    const upd = state.updateInfo;
    let updateBlock = `<div class="pmp18-update-box"><span>当前版本 v${VERSION}</span><button type="button" class="pmp18-small-btn" data-action="check-update">检查更新</button></div>`;
    if (upd?.available) {
        updateBlock = `<div class="pmp18-update-box is-new">
            <div><b>发现新版本</b> v${escapeHtml(String(upd.remoteVersion || ''))}</div>
            <button type="button" class="pmp18-primary-btn" data-action="show-update-modal">查看更新</button>
        </div>`;
    } else if (upd && upd.checked) {
        updateBlock = `<div class="pmp18-update-box"><span>已是最新版本 v${VERSION}</span><button type="button" class="pmp18-small-btn" data-action="check-update">重新检查</button></div>`;
    }

    return `
        <div class="pmp18-settings">
            ${updateBlock}
            <div class="pmp18-settings-row">
                <label>相似检测阈值 <b id="pmp18-th-val">${t}%</b></label>
                <input type="range" id="pmp18-threshold" min="30" max="90" step="5" value="${t}">
            </div>
            <div class="pmp18-settings-row">
                <label>段落匹配敏感度 <b id="pmp18-soft-val">${soft}%</b></label>
                <input type="range" id="pmp18-soft" min="20" max="70" step="5" value="${soft}">
                <span class="pmp18-muted">越低越容易把不同段落判为「修改」而非「删除+新增」</span>
            </div>
            <div class="pmp18-settings-row">
                <label class="pmp18-check-label">
                    <input type="checkbox" id="pmp18-same-name" ${state.settings.includeSameNameInSimilar ? 'checked' : ''}>
                    同名 Persona 也参与「高度相似」检测
                </label>
            </div>
            <pre class="pmp18-changelog">${escapeHtml(CHANGELOG)}</pre>
        </div>`;
}

function renderManagerContent(personas) {
    if (state.tab === 'settings') return renderSettingsPanel();
    if (state.tab === 'all') return renderAllView(personas);
    if (state.tab === 'same-name') return renderSameNameView(personas);
    if (state.tab === 'duplicates') return renderDuplicateView(personas);
    return renderSimilarView(personas);
}

function renderManager() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const personas = getPersonaData();
    const sameNameGroups = getSameNameGroups(personas);
    const duplicateGroups = getExactDuplicateGroups(personas);
    const similarPairs = getSimilarPairs(personas);
    const inCompare = state.compareIds.length >= 2;

    const selectionHint = state.selected.size >= 2
        ? `<div class="pmp18-selection-bar">
            <div><strong>已选 ${state.selected.size} 个</strong><span>默认以选择顺序第一个为基准，对比中可切换</span></div>
            <button class="pmp18-primary-btn" data-action="compare-selected"><i class="fa-solid fa-code-compare"></i> 开始对比</button>
            <button class="pmp18-small-btn" data-action="clear-selection">清除</button>
           </div>`
        : state.selected.size === 1
            ? `<div class="pmp18-selection-bar"><div><strong>已选 1 个</strong><span>请再选至少一个</span></div><button class="pmp18-small-btn" data-action="clear-selection">清除</button></div>`
            : '';

    root.innerHTML = `
        <div class="pmp18-backdrop" data-action="close"></div>
        <section class="pmp18-window" role="dialog" aria-modal="true">
            <header class="pmp18-header">
                <div class="pmp18-brand">
                    <div class="pmp18-brand-icon"><i class="fa-solid fa-users-viewfinder"></i></div>
                    <div><h1>Persona Manager</h1><span>v${VERSION}</span></div>
                </div>
                <button class="pmp18-close" type="button" data-action="close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </header>
            ${inCompare ? renderCompareWorkspace(personas) : `
            <div class="pmp18-toolbar">
                <div class="pmp18-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="pmp18-search" type="search" value="${escapeHtml(state.query)}" placeholder="搜索名称或描述…" autocomplete="off">
                    ${state.query ? '<button data-action="clear-search"><i class="fa-solid fa-xmark"></i></button>' : ''}
                </div>
                <div class="pmp18-stats">
                    <span><b>${personas.length}</b> 全部</span>
                    <span><b>${sameNameGroups.length}</b> 同名</span>
                    <span><b>${duplicateGroups.length}</b> 重复</span>
                    <span><b>${similarPairs.length}</b> 相似</span>
                </div>
            </div>
            <nav class="pmp18-tabs">
                ${tabButton('all', '全部', 'fa-layer-group')}
                ${tabButton('same-name', '同名', 'fa-people-group', sameNameGroups.length)}
                ${tabButton('duplicates', '完全重复', 'fa-copy', duplicateGroups.length)}
                ${tabButton('similar', '高度相似', 'fa-clone', similarPairs.length)}
                ${tabButton('settings', '设置', 'fa-sliders')}
            </nav>
            <main class="pmp18-content">${renderManagerContent(personas)}</main>
            ${selectionHint}`}
        </section>`;

    const input = document.getElementById('pmp18-search');
    if (input && document.activeElement !== input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

/* ---------- Editors ---------- */

function openFullEditor(id) {
    const p = getPersonaData().find(x => x.id === id);
    if (!p) return;

    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay';
    overlay.innerHTML = `
        <div class="pmp18-editor">
            <div class="pmp18-editor-head">
                <strong>编辑 Persona</strong>
                <button type="button" class="pmp18-close pmp18-editor-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <label class="pmp18-editor-label">显示名称</label>
            <input type="text" class="pmp18-editor-name" value="${escapeHtml(p.name)}">
            <label class="pmp18-editor-label">描述</label>
            <textarea class="pmp18-editor-ta" rows="14" spellcheck="false">${escapeHtml(p.description)}</textarea>
            <div class="pmp18-editor-actions">
                <button type="button" class="pmp18-small-btn pmp18-editor-cancel">取消</button>
                <button type="button" class="pmp18-primary-btn pmp18-editor-save">保存</button>
            </div>
            <p class="pmp18-editor-note">将写回酒馆 Persona 数据（保留 position 等字段）。</p>
        </div>`;

    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.pmp18-editor-save').onclick = () => {
        const newName = overlay.querySelector('.pmp18-editor-name').value.trim() || p.name;
        const newDesc = overlay.querySelector('.pmp18-editor-ta').value;
        if (newName === p.name && newDesc === p.description) {
            close();
            return;
        }
        if (!window.confirm('确认写回原 Persona？')) return;
        persistPersonaFull(id, newName, newDesc);
        close();
        if (typeof toastr !== 'undefined') toastr.success('已保存 Persona');
        renderManager();
    };
    document.body.appendChild(overlay);
    overlay.querySelector('.pmp18-editor-name').focus();
}

/* ---------- Update check ---------- */

async function checkForUpdates() {
    try {
        const r = await fetch('https://raw.githubusercontent.com/xingx121/persona-manager/main/manifest.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const remote = await r.json();
        const rv = String(remote.version || '');
        const available = Boolean(rv && rv !== VERSION);
        state.updateInfo = { checked: true, available, remoteVersion: rv, description: remote.description || '' };
        return state.updateInfo;
    } catch {
        state.updateInfo = { checked: true, available: false, error: true };
        return state.updateInfo;
    }
}

function showUpdateModal() {
    const info = state.updateInfo;
    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay';
    overlay.innerHTML = `
        <div class="pmp18-editor" style="max-width:520px">
            <div class="pmp18-editor-head">
                <strong>版本更新</strong>
                <button type="button" class="pmp18-close pmp18-editor-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p>当前 <b>v${VERSION}</b>${info?.remoteVersion ? ` → 最新 <b>v${escapeHtml(info.remoteVersion)}</b>` : ''}</p>
            <pre class="pmp18-changelog">${escapeHtml(info?.description || CHANGELOG)}</pre>
            <div class="pmp18-editor-actions">
                <button type="button" class="pmp18-small-btn pmp18-editor-cancel">稍后</button>
                <button type="button" class="pmp18-primary-btn pmp18-do-update">立即更新</button>
            </div>
            <p class="pmp18-editor-note">将调用扩展更新接口；若失败请到「管理扩展」中手动更新。</p>
        </div>`;
    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.pmp18-do-update').onclick = async () => {
        const btn = overlay.querySelector('.pmp18-do-update');
        btn.disabled = true;
        btn.textContent = '更新中…';
        try {
            if (typeof window.updateExtension === 'function') {
                await window.updateExtension('persona-manager');
            } else {
                const res = await fetch('/api/extensions/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ extensionName: 'persona-manager', global: false }),
                });
                if (!res.ok) throw new Error(await res.text());
            }
            btn.textContent = '完成，刷新中…';
            setTimeout(() => location.reload(), 600);
        } catch (e) {
            btn.disabled = false;
            btn.textContent = '立即更新';
            if (typeof toastr !== 'undefined') toastr.error(`更新失败：${e?.message || e}`);
        }
    };
    document.body.appendChild(overlay);
}

/* ---------- Root / events ---------- */

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
            if (target.classList.contains('pmp18-backdrop') || target.classList.contains('pmp18-close')) closeManager();
            return;
        }
        if (action === 'tab') {
            state.tab = target.dataset.tab || 'all';
            state.selected.clear();
            state.compareIds = [];
            state.baselineId = null;
            renderManager();
            return;
        }
        if (action === 'clear-search') { state.query = ''; renderManager(); return; }
        if (action === 'clear-selection') { state.selected.clear(); renderManager(); return; }
        if (action === 'select-group') {
            for (const id of (target.dataset.ids || '').split('|').filter(Boolean)) state.selected.add(id);
            renderManager();
            return;
        }
        if (action === 'compare-pair') {
            state.compareIds = [target.dataset.a, target.dataset.b];
            state.baselineId = target.dataset.a;
            state.selected.clear();
            renderManager();
            return;
        }
        if (action === 'compare-selected') {
            const ids = [...state.selected];
            if (ids.length < 2) return;
            state.compareIds = ids;
            state.baselineId = ids[0];
            state.selected.clear();
            renderManager();
            return;
        }
        if (action === 'exit-compare') {
            state.compareIds = [];
            state.baselineId = null;
            renderManager();
            return;
        }
        if (action === 'set-baseline') {
            state.baselineId = target.dataset.id;
            renderManager();
            return;
        }
        if (action === 'toggle-diff-only') {
            state.settings.showDiffOnly = !state.settings.showDiffOnly;
            saveSettingsLocal();
            renderManager();
            return;
        }
        if (action === 'edit-full') {
            openFullEditor(target.dataset.id);
            return;
        }
        if (action === 'check-update') {
            checkForUpdates().then(() => renderManager());
            return;
        }
        if (action === 'show-update-modal') {
            showUpdateModal();
            return;
        }
    });

    root.addEventListener('change', event => {
        const input = event.target.closest('input[data-action="select"]');
        if (input) {
            const card = input.closest('[data-persona-id]');
            if (!card) return;
            if (input.checked) state.selected.add(card.dataset.personaId);
            else state.selected.delete(card.dataset.personaId);
            renderManager();
            return;
        }
        if (event.target.id === 'pmp18-same-name') {
            state.settings.includeSameNameInSimilar = event.target.checked;
            saveSettingsLocal();
            renderManager();
        }
    });

    root.addEventListener('input', event => {
        if (event.target.id === 'pmp18-search') {
            state.query = event.target.value;
            const caret = event.target.selectionStart;
            renderManager();
            const next = document.getElementById('pmp18-search');
            if (next) next.setSelectionRange(caret, caret);
            return;
        }
        if (event.target.id === 'pmp18-threshold') {
            state.settings.similarityThreshold = Math.min(0.9, Math.max(0.3, Number(event.target.value) / 100));
            saveSettingsLocal();
            const label = document.getElementById('pmp18-th-val');
            if (label) label.textContent = `${Math.round(state.settings.similarityThreshold * 100)}%`;
            return;
        }
        if (event.target.id === 'pmp18-soft') {
            state.settings.softMatchThreshold = Math.min(0.7, Math.max(0.2, Number(event.target.value) / 100));
            saveSettingsLocal();
            const label = document.getElementById('pmp18-soft-val');
            if (label) label.textContent = `${Math.round(state.settings.softMatchThreshold * 100)}%`;
        }
    });
}

function openManager(tab = 'all') {
    ensureRoot();
    state.active = true;
    state.tab = tab;
    state.selected.clear();
    state.compareIds = [];
    state.baselineId = null;
    const root = document.getElementById(ROOT_ID);
    root.hidden = false;
    document.body.classList.add('pmp18-open');
    renderManager();
}

function closeManager() {
    state.active = false;
    state.selected.clear();
    state.compareIds = [];
    state.baselineId = null;
    const root = document.getElementById(ROOT_ID);
    if (root) root.hidden = true;
    document.body.classList.remove('pmp18-open');
}

/* ---------- Entry (single path, low overhead) ---------- */

const ENTRY_TEXTS = ['用户设置', 'User Settings', '全局设置', 'Global Settings', 'Persona Management', 'Persona 管理'];

function findEntryAnchor() {
    for (const id of ['persona-management-block', 'user-settings-block-content', 'user-settings-block']) {
        const node = document.getElementById(id);
        if (node) return { type: 'container', node, id };
    }
    const col = document.querySelector('.persona_management_left_column, .persona_management_global_settings');
    if (col) return { type: 'container', node: col };

    for (const el of document.querySelectorAll('h3,h2,h4,.inline-drawer-header')) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (ENTRY_TEXTS.some(t => text === t)) return { type: 'heading', node: el };
    }
    return null;
}

function makeEntry(floating = false) {
    const entry = document.createElement('button');
    entry.id = BUTTON_ID;
    entry.type = 'button';
    entry.className = floating ? 'menu_button pmp18-entry pmp18-entry-float' : 'menu_button pmp18-entry';
    entry.dataset.pmp18 = ENTRY_MARK;
    entry.innerHTML = floating
        ? '<i class="fa-solid fa-users-viewfinder"></i><span>Persona Manager</span>'
        : '<i class="fa-solid fa-users-viewfinder"></i><span>Persona Manager</span><small>管理 / 对比 / 重复检测</small>';
    entry.addEventListener('click', () => openManager('all'));
    return entry;
}

function injectEntry() {
    if (document.getElementById(BUTTON_ID)) return true;
    const anchor = findEntryAnchor();
    if (!anchor?.node) return false;
    const btn = makeEntry(false);
    if (anchor.type === 'heading' && anchor.node.parentNode) {
        anchor.node.parentNode.insertBefore(btn, anchor.node);
    } else {
        anchor.node.insertBefore(btn, anchor.node.firstChild);
    }
    console.log(`[${EXT}] 入口已挂载 (${anchor.type}${anchor.id ? ' #' + anchor.id : ''})`);
    return true;
}

function injectFloatingEntry() {
    if (document.getElementById(BUTTON_ID)) return true;
    document.body.appendChild(makeEntry(true));
    console.warn(`[${EXT}] 使用浮动入口。也可执行 openPersonaManager()`);
    return true;
}

function installEntryObserver() {
    if (window.__pmp18EntryInstalled) return;
    window.__pmp18EntryInstalled = true;
    window.openPersonaManager = () => openManager('all');

    if (injectEntry()) return;

    let ticks = 0;
    const observer = new MutationObserver(() => {
        if (injectEntry()) {
            observer.disconnect();
            if (window.__pmp18EntryTimer) {
                clearInterval(window.__pmp18EntryTimer);
                window.__pmp18EntryTimer = null;
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__pmp18Observer = observer;

    // Limited retries only (no perpetual click capture)
    window.__pmp18EntryTimer = setInterval(() => {
        ticks += 1;
        if (injectEntry()) {
            observer.disconnect();
            clearInterval(window.__pmp18EntryTimer);
            window.__pmp18EntryTimer = null;
            return;
        }
        if (ticks >= 30) {
            clearInterval(window.__pmp18EntryTimer);
            window.__pmp18EntryTimer = null;
            observer.disconnect();
            injectFloatingEntry();
        }
    }, 400);

    // One-shot retry when user opens persona / user-settings drawers
    document.getElementById('persona-management-button')?.addEventListener('click', () => {
        setTimeout(() => injectEntry(), 200);
    });
    document.getElementById('user-settings-button')?.addEventListener('click', () => {
        setTimeout(() => injectEntry(), 200);
    });
}

function installKeyboardHandler() {
    if (window.__pmp18Keyboard) return;
    window.__pmp18Keyboard = true;
    document.addEventListener('keydown', event => {
        if (!state.active) return;
        if (event.key === 'Escape') {
            if (document.querySelector('.pmp18-editor-overlay')) return;
            closeManager();
        }
    });
}

async function init() {
    ensureRoot();
    installKeyboardHandler();
    installEntryObserver();
    checkForUpdates().catch(() => {});
    console.log(`[${EXT}] v${VERSION} loaded`);
}

(async () => {
    try {
        await init();
    } catch (error) {
        console.error(`[${EXT}] 初始化失败`, error);
        if (typeof toastr !== 'undefined') toastr.error(`${EXT} 初始化失败：${error?.message || error}`);
    }
})();

export function onUpdate() {
    location.reload();
}
