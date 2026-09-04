/**
 * Persona Manager v1.8.3
 * SillyTavern third-party extension
 *
 * - Multi-persona compare (≥2) with switchable baseline
 * - Unordered content matching + text-level highlighting
 * - Adaptive highlight by similarity
 * - Side-by-side / revision layouts (switchable)
 * - Edit description in compare → write back to power_user + refresh
 * - Configurable similarity threshold
 * - Edit confirmation
 * - Stable entry (CN/EN) + official update hook auto-reload
 * - NEW: Version update check with NEW badge and modal
 * - NEW: Allow same-name personas in similarity detection (toggle)
 * - NEW: Full edit (name+description) from card list
 * - NEW: Adjustable diff sensitivity (soft threshold)
 * - FIX: Save delay and refresh to prevent description loss and lag
 * - FIX: Update check fallback when GitHub API fails (raw manifest)
 * - FIX: Show local changelog even when already up-to-date
 */

import { power_user } from '../../../power-user.js';

const EXT = 'Persona Manager';
const VERSION = '1.8.3';
const ROOT_ID = 'pmp18-root';
const BUTTON_ID = 'pmp18-entry';
const ENTRY_MARK = 'pmp18-entry-installed';
const STORAGE_KEY = 'pmp18_settings';
const UPDATE_STORAGE_KEY = 'pmp18_update_status';

// 内置更新日志（即使 API 无法获取也会显示）
const CHANGELOG = `## v1.8.3 (2026-09-05)
- 新增版本更新检测及 NEW 角标
- 允许同名 Persona 参与相似度检测（开关）
- 列表页直接编辑 Persona（名称 + 描述）
- 差异检测敏感度调节（段落匹配阈值）
- 修复编辑后原生界面描述为空的问题
- 修复切换 Persona 卡顿问题
- 更新检测支持备用方案（raw manifest）`;

const defaultSettings = {
    similarityThreshold: 0.55,
    compareLayout: 'side', // 'side' | 'revision'
    showDiffOnly: false,
    allowSameNameSimilarity: false,
    diffSoftThreshold: 0.35,
};

const state = {
    active: false,
    tab: 'all',
    query: '',
    selected: new Set(),
    compareIds: [],
    baselineId: null,
    settings: loadSettings(),
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

function getSimilarPairs(personas, threshold = state.settings.similarityThreshold) {
    const pairs = [];
    const allowSame = state.settings.allowSameNameSimilarity;
    for (let i = 0; i < personas.length; i++) {
        for (let j = i + 1; j < personas.length; j++) {
            const a = personas[i];
            const b = personas[j];
            if (a.nameKey === b.nameKey && !allowSame) continue;
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
    const cls = large ? 'pmp18-avatar pmp18-avatar-large' : 'pmp18-avatar';
    const url = personaImageUrl(persona.id);
    return url
        ? `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy">`
        : `<div class="${cls} pmp18-avatar-fallback"><i class="fa-solid fa-user"></i></div>`;
}

function isInGroup(persona, groups) {
    return groups.some(group => group.some(item => item.id === persona.id));
}

function statusBadge(persona, all) {
    if (isInGroup(persona, getExactDuplicateGroups(all))) return '<span class="pmp18-badge pmp18-badge-danger">完全重复</span>';
    if (isInGroup(persona, getSameNameGroups(all))) return '<span class="pmp18-badge">同名</span>';
    return '';
}

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
                    <button class="pmp18-icon-btn" data-action="edit-full" data-id="${escapeHtml(persona.id)}" title="编辑名称与描述"><i class="fa-solid fa-pen"></i></button>
                </div>
                <div class="pmp18-card-id">ID：${escapeHtml(persona.id)}</div>
                <div class="pmp18-card-description">${persona.description ? escapeHtml(persona.description) : '<span class="pmp18-muted">暂无 Persona 描述 / 备注</span>'}</div>
            </div>
        </article>`;
}

function renderGroup(group, title, all) {
    return `
        <section class="pmp18-group">
            <div class="pmp18-group-head">
                <div><div class="pmp18-group-title">${escapeHtml(title)}</div><div class="pmp18-group-count">${group.length} 个 Persona</div></div>
                <button class="pmp18-small-btn" type="button" data-action="select-group" data-ids="${escapeHtml(group.map(x => x.id).join('|'))}">全选此组</button>
            </div>
            <div class="pmp18-group-grid">${group.map(persona => renderCard(persona, all)).join('')}</div>
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
    return `<div class="pmp18-mini">${renderAvatar(persona)}<div><strong>${escapeHtml(persona.name)}</strong><p>${persona.description ? escapeHtml(persona.description.slice(0, 180)) : '暂无描述'}</p></div></div>`;
}

function renderSimilarView(personas) {
    const q = normalizeText(state.query);
    const pairs = getSimilarPairs(personas).filter(({ a, b }) => !q || searchMatch(a, q) || searchMatch(b, q));
    if (!pairs.length) return emptyState('没有发现高度相似 Persona', `当前阈值 ${Math.round(state.settings.similarityThreshold * 100)}%，可在设置中调整。`);
    return `<div class="pmp18-similar-list">${pairs.map(({ a, b, score }) => `
        <section class="pmp18-similar-pair">
            <div class="pmp18-similar-head">
                <div><span class="pmp18-score">${Math.round(score * 100)}%</span><span>描述相似度</span></div>
                <button class="pmp18-small-btn" data-action="compare-pair" data-a="${escapeHtml(a.id)}" data-b="${escapeHtml(b.id)}">对比</button>
            </div>
            <div class="pmp18-compare-mini">${renderMiniPersona(a)}${renderMiniPersona(b)}</div>
        </section>`).join('')}</div>`;
}

/* ---------- Diff engine ---------- */

function splitUnits(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!raw) return [];
    let parts = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) parts = raw.split('\n').map(s => s.trim()).filter(Boolean);
    return parts;
}

function unitSimilarity(a, b) {
    return similarity(a, b);
}

function unorderedDiff(aText, bText) {
    const aUnits = splitUnits(aText);
    const bUnits = splitUnits(bText);
    const usedB = new Set();
    const pairs = [];
    const soft = state.settings.diffSoftThreshold;

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
            const s = unitSimilarity(p.a, bUnits[j]);
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

function tokenize(text) {
    return String(text).match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) || [];
}

function lcsDiff(aTokens, bTokens, equalFn = (a, b) => a === b) {
    const n = aTokens.length;
    const m = bTokens.length;
    if (n * m > 12000) return [{ type: 'replace', a: aTokens, b: bTokens }];
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = equalFn(aTokens[i], bTokens[j])
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
        if (equalFn(aTokens[i], bTokens[j])) {
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

function diffModeClass(score) {
    if (score >= 0.85) return 'mode-high';
    if (score >= 0.5) return 'mode-mid';
    return 'mode-low';
}

function countPairStats(rows) {
    return {
        same: rows.filter(r => r.type === 'same').length,
        replace: rows.filter(r => r.type === 'replace').length,
        remove: rows.filter(r => r.type === 'remove').length,
        add: rows.filter(r => r.type === 'add').length,
    };
}

function renderDiffBlock(row, layout, showDiffOnly) {
    if (showDiffOnly && row.type === 'same') return '';

    if (layout === 'revision') {
        if (row.type === 'same') {
            return `<div class="pmp18-rev-block same"><div class="pmp18-rev-text">${escapeHtml(row.a)}</div></div>`;
        }
        if (row.type === 'remove') {
            return `<div class="pmp18-rev-block remove"><div class="pmp18-rev-text"><mark class="pmp18-del">${escapeHtml(row.a)}</mark></div></div>`;
        }
        if (row.type === 'add') {
            return `<div class="pmp18-rev-block add"><div class="pmp18-rev-text"><mark class="pmp18-add">${escapeHtml(row.b)}</mark></div></div>`;
        }
        const { left, right } = inlineDiffHtml(row.a, row.b);
        return `<div class="pmp18-rev-block replace">
            <div class="pmp18-rev-label">修改</div>
            <div class="pmp18-rev-text">${left}</div>
            <div class="pmp18-rev-arrow">→</div>
            <div class="pmp18-rev-text">${right}</div>
        </div>`;
    }

    if (row.type === 'same') {
        return `<div class="pmp18-side-row same">
            <div class="pmp18-side-cell">${escapeHtml(row.a)}</div>
            <div class="pmp18-side-cell">${escapeHtml(row.b)}</div>
        </div>`;
    }
    if (row.type === 'remove') {
        return `<div class="pmp18-side-row remove">
            <div class="pmp18-side-cell"><mark class="pmp18-del">${escapeHtml(row.a)}</mark></div>
            <div class="pmp18-side-cell pmp18-empty-cell">—</div>
        </div>`;
    }
    if (row.type === 'add') {
        return `<div class="pmp18-side-row add">
            <div class="pmp18-side-cell pmp18-empty-cell">—</div>
            <div class="pmp18-side-cell"><mark class="pmp18-add">${escapeHtml(row.b)}</mark></div>
        </div>`;
    }
    const { left, right } = inlineDiffHtml(row.a, row.b);
    return `<div class="pmp18-side-row replace">
        <div class="pmp18-side-cell">${left}</div>
        <div class="pmp18-side-cell">${right}</div>
    </div>`;
}

function renderColumnBody(baseText, otherText, layout, showDiffOnly, isBaselineOnly) {
    if (isBaselineOnly) {
        const units = splitUnits(baseText);
        if (!units.length) return '<div class="pmp18-muted" style="padding:12px">（无描述）</div>';
        return units.map(u => `<div class="pmp18-col-block">${escapeHtml(u)}</div>`).join('');
    }
    const rows = unorderedDiff(baseText, otherText);
    const parts = [];
    for (const row of rows) {
        if (showDiffOnly && row.type === 'same') continue;
        if (row.type === 'same') {
            parts.push(`<div class="pmp18-col-block same">${escapeHtml(row.b || row.a)}</div>`);
        } else if (row.type === 'remove') {
            parts.push(`<div class="pmp18-col-block remove"><span class="pmp18-tag">基准有</span><mark class="pmp18-del">${escapeHtml(row.a)}</mark></div>`);
        } else if (row.type === 'add') {
            parts.push(`<div class="pmp18-col-block add"><span class="pmp18-tag">对方有</span><mark class="pmp18-add">${escapeHtml(row.b)}</mark></div>`);
        } else {
            const { left, right } = inlineDiffHtml(row.a, row.b);
            if (layout === 'revision') {
                parts.push(`<div class="pmp18-col-block replace">
                    <div class="pmp18-rev-line"><span class="pmp18-tag">基准</span>${left}</div>
                    <div class="pmp18-rev-line"><span class="pmp18-tag">对方</span>${right}</div>
                </div>`);
            } else {
                parts.push(`<div class="pmp18-col-block replace">${right || left}</div>`);
            }
        }
    }
    return parts.join('') || '<div class="pmp18-muted" style="padding:12px">无差异或已全部过滤</div>';
}

function renderCompareWorkspace(personas) {
    const ids = state.compareIds.filter(id => personas.some(p => p.id === id));
    if (ids.length < 2) {
        state.compareIds = [];
        state.baselineId = null;
        return renderManagerContent(personas);
    }

    if (!state.baselineId || !ids.includes(state.baselineId)) {
        state.baselineId = ids[0];
    }

    const base = personas.find(p => p.id === state.baselineId);
    const others = ids.filter(id => id !== state.baselineId).map(id => personas.find(p => p.id === id)).filter(Boolean);
    const layout = state.settings.compareLayout;
    const showDiffOnly = state.settings.showDiffOnly;

    const baselineButtons = ids.map(id => {
        const p = personas.find(x => x.id === id);
        if (!p) return '';
        const active = id === state.baselineId ? 'is-active' : '';
        return `<button type="button" class="pmp18-base-btn ${active}" data-action="set-baseline" data-id="${escapeHtml(id)}">${escapeHtml(p.name)}</button>`;
    }).join('');

    const otherCols = others.map(o => {
        const score = similarity(base.description, o.description);
        const rows = unorderedDiff(base.description, o.description);
        const stats = countPairStats(rows);
        const mode = diffModeClass(score);
        return `
            <section class="pmp18-hcol pmp18-hcol-other ${mode}" data-pair-other="${escapeHtml(o.id)}">
                <div class="pmp18-hcol-head">
                    <div class="pmp18-pair-person">
                        ${renderAvatar(o)}
                        <div>
                            <strong title="${escapeHtml(o.name)}">${escapeHtml(o.name)}</strong>
                            <span>对比 · ${Math.round(score * 100)}%</span>
                        </div>
                        <button type="button" class="pmp18-icon-btn" data-action="edit-persona" data-id="${escapeHtml(o.id)}" title="编辑描述"><i class="fa-solid fa-pen"></i></button>
                    </div>
                    <div class="pmp18-pair-stats">
                        <span>同 ${stats.same}</span>
                        <span>改 ${stats.replace}</span>
                        <span>− ${stats.remove}</span>
                        <span>+ ${stats.add}</span>
                    </div>
                </div>
                <div class="pmp18-hcol-body">${renderColumnBody(base.description, o.description, layout, showDiffOnly, false)}</div>
            </section>`;
    }).join('');

    return `
        <div class="pmp18-compare-workspace">
            <div class="pmp18-compare-topbar">
                <button type="button" class="pmp18-back-btn" data-action="exit-compare"><i class="fa-solid fa-arrow-left"></i> 返回列表</button>
                <div class="pmp18-compare-title">
                    <strong>Persona 对比</strong>
                    <span>共 ${ids.length} 个 · 左侧基准固定 · 右侧可左右滑动</span>
                </div>
                <div class="pmp18-compare-tools">
                    <button type="button" class="pmp18-small-btn ${layout === 'side' ? 'is-on' : ''}" data-action="set-layout" data-layout="side">并排高亮</button>
                    <button type="button" class="pmp18-small-btn ${layout === 'revision' ? 'is-on' : ''}" data-action="set-layout" data-layout="revision">修订高亮</button>
                    <button type="button" class="pmp18-small-btn ${showDiffOnly ? 'is-on' : ''}" data-action="toggle-diff-only">只看差异</button>
                    <button type="button" class="pmp18-small-btn" data-action="edit-persona" data-id="${escapeHtml(base.id)}"><i class="fa-solid fa-pen"></i> 编辑基准</button>
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
                            <div>
                                <strong title="${escapeHtml(base.name)}">${escapeHtml(base.name)}</strong>
                                <span>基准（固定）</span>
                            </div>
                        </div>
                    </div>
                    <div class="pmp18-hcol-body">${renderColumnBody(base.description, '', layout, false, true)}</div>
                </section>
                <div class="pmp18-hscroll">
                    ${otherCols}
                </div>
            </div>
        </div>`;
}

function tabButton(key, label, icon, count) {
    return `<button class="pmp18-tab ${state.tab === key ? 'is-active' : ''}" type="button" data-action="tab" data-tab="${key}"><i class="fa-solid ${icon}"></i><span>${label}</span>${typeof count === 'number' ? `<em>${count}</em>` : ''}</button>`;
}

/* ---------- Version update ---------- */
async function checkForUpdates() {
    // 备用方案：直接从 raw 读取 manifest.json 获取版本
    async function fetchVersionFromManifest() {
        const resp = await fetch('https://raw.githubusercontent.com/xingx121/persona-manager/main/manifest.json');
        if (!resp.ok) throw new Error('Raw manifest fetch failed');
        const data = await resp.json();
        return data.version || '0.0.0';
    }

    try {
        // 主方案：GitHub API（必须带 User-Agent）
        const response = await fetch('https://api.github.com/repos/xingx121/persona-manager/releases/latest', {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': `Persona-Manager-Extension/${VERSION}`
            }
        });

        if (!response.ok) {
            // API 失败（403 速率限制 / 404），自动切换到备用方案
            if (response.status === 403 || response.status === 404) {
                console.warn('[Persona Manager] API failed, falling back to raw manifest...');
                const latestVersion = await fetchVersionFromManifest();
                const hasUpdate = latestVersion !== VERSION;
                const updateInfo = {
                    latestVersion,
                    hasUpdate,
                    // 如果版本相同，显示本地日志；否则提示无法获取日志
                    releaseNotes: hasUpdate
                        ? '由于 GitHub API 限制，无法获取详细更新日志。请前往 Release 页面查看。'
                        : CHANGELOG,
                    checkedAt: Date.now()
                };
                localStorage.setItem(UPDATE_STORAGE_KEY, JSON.stringify(updateInfo));
                return updateInfo;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const latestVersion = data.tag_name.replace(/^v/, '');
        const hasUpdate = latestVersion !== VERSION;
        const updateInfo = {
            latestVersion,
            hasUpdate,
            // 如果有更新，使用 API 日志；否则使用本地日志（展示当前版本已更新的内容）
            releaseNotes: hasUpdate
                ? (data.body || '暂无更新日志')
                : CHANGELOG,
            checkedAt: Date.now()
        };
        localStorage.setItem(UPDATE_STORAGE_KEY, JSON.stringify(updateInfo));
        return updateInfo;

    } catch (e) {
        // 网络错误 / CORS 拦截，尝试备用方案
        try {
            console.warn('[Persona Manager] Network error, trying raw manifest fallback...', e);
            const latestVersion = await fetchVersionFromManifest();
            const hasUpdate = latestVersion !== VERSION;
            const updateInfo = {
                latestVersion,
                hasUpdate,
                releaseNotes: hasUpdate
                    ? '无法连接 GitHub API（可能网络限制或 CORS），请手动前往 Release 页面查看。'
                    : CHANGELOG,
                checkedAt: Date.now()
            };
            localStorage.setItem(UPDATE_STORAGE_KEY, JSON.stringify(updateInfo));
            return updateInfo;
        } catch (_) {
            console.warn('[Persona Manager] 检查更新彻底失败:', e);
            return null;
        }
    }
}

function getUpdateStatus() {
    try {
        const raw = localStorage.getItem(UPDATE_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (Date.now() - data.checkedAt > 3600000) return { ...data, stale: true };
        return data;
    } catch { return null; }
}

function showUpdateModal(updateInfo) {
    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay pmp18-update-modal';
    const notes = updateInfo?.releaseNotes || CHANGELOG;
    const latest = updateInfo?.latestVersion || VERSION;
    const hasUpdate = updateInfo?.hasUpdate ?? false;

    let titleHtml, buttonHtml;
    if (hasUpdate) {
        titleHtml = `<strong>📦 版本更新</strong><span>当前 v${VERSION} → 最新 v${latest}</span>`;
        buttonHtml = `
            <button type="button" class="pmp18-small-btn pmp18-editor-cancel">稍后</button>
            <a href="https://github.com/xingx121/persona-manager/releases/latest" target="_blank" rel="noopener noreferrer" class="pmp18-primary-btn" style="text-decoration:none;">前往下载</a>
        `;
    } else {
        titleHtml = `<strong>✅ 已是最新版本</strong><span>当前 v${VERSION}</span>`;
        buttonHtml = `<button type="button" class="pmp18-primary-btn pmp18-editor-cancel">确定</button>`;
    }

    overlay.innerHTML = `
        <div class="pmp18-editor">
            <div class="pmp18-editor-head">
                ${titleHtml}
                <button type="button" class="pmp18-close pmp18-editor-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="pmp18-editor-body">
                <div class="pmp18-release-notes">${escapeHtml(notes)}</div>
            </div>
            <div class="pmp18-editor-actions">
                ${buttonHtml}
            </div>
            ${hasUpdate ? '<p class="pmp18-editor-note">点击“前往下载”跳转到 GitHub Release 页面，手动安装或使用扩展管理器更新。</p>' : ''}
        </div>`;

    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
}

function showNetworkErrorModal() {
    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay pmp18-update-modal';
    overlay.innerHTML = `
        <div class="pmp18-editor">
            <div class="pmp18-editor-head">
                <strong>⚠️ 网络错误</strong>
                <button type="button" class="pmp18-close pmp18-editor-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="pmp18-editor-body">
                <p>无法连接 GitHub 服务器，可能是网络限制或跨域问题。</p>
                <p style="font-size:13px;opacity:.7;">请手动访问以下地址查看最新版本：</p>
                <div style="background:rgba(127,127,127,.08);padding:8px;border-radius:6px;word-break:break-all;font-size:13px;">
                    https://github.com/xingx121/persona-manager/releases
                </div>
            </div>
            <div class="pmp18-editor-actions">
                <button type="button" class="pmp18-small-btn pmp18-editor-cancel">关闭</button>
                <a href="https://github.com/xingx121/persona-manager/releases" target="_blank" rel="noopener noreferrer" class="pmp18-primary-btn" style="text-decoration:none;">前往 GitHub</a>
            </div>
        </div>`;
    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
}

/* ---------- Edit functions ---------- */
function persistPersonaDescription(id, description) {
    if (!power_user) return false;
    if (!power_user.persona_descriptions) power_user.persona_descriptions = {};
    power_user.persona_descriptions[id] = description;
    try {
        if (typeof window.saveSettingsDebounced === 'function') {
            window.saveSettingsDebounced();
            return true;
        }
    } catch { /* ignore */ }
    try {
        if (typeof window.saveSettings === 'function') {
            window.saveSettings();
            return true;
        }
    } catch { /* ignore */ }
    try {
        document.dispatchEvent(new CustomEvent('pmp18-persona-updated', { detail: { id, description } }));
    } catch { /* ignore */ }
    return true;
}

function persistPersonaFull(id, name, description) {
    if (!power_user) return false;
    if (power_user.personas) {
        power_user.personas[id] = name;
    }
    if (!power_user.persona_descriptions) power_user.persona_descriptions = {};
    power_user.persona_descriptions[id] = description;

    try {
        if (typeof window.saveSettingsDebounced === 'function') {
            window.saveSettingsDebounced();
            return true;
        }
    } catch { /* ignore */ }
    try {
        if (typeof window.saveSettings === 'function') {
            window.saveSettings();
            return true;
        }
    } catch { /* ignore */ }
    try {
        document.dispatchEvent(new CustomEvent('pmp18-persona-updated', { detail: { id, name, description } }));
    } catch { /* ignore */ }
    return true;
}

function openEditor(id) {
    const personas = getPersonaData();
    const p = personas.find(x => x.id === id);
    if (!p) return;

    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay';
    overlay.innerHTML = `
        <div class="pmp18-editor">
            <div class="pmp18-editor-head">
                <strong>编辑 Persona 描述</strong>
                <span>${escapeHtml(p.name)}</span>
                <button type="button" class="pmp18-close pmp18-editor-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <textarea class="pmp18-editor-ta" rows="16" spellcheck="false">${escapeHtml(p.description)}</textarea>
            <div class="pmp18-editor-actions">
                <button type="button" class="pmp18-small-btn pmp18-editor-cancel">取消</button>
                <button type="button" class="pmp18-primary-btn pmp18-editor-save">保存并更新对比</button>
            </div>
            <p class="pmp18-editor-note">保存后会写入原 Persona 数据，并立即刷新当前对比结果。</p>
        </div>`;

    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('.pmp18-editor-save').onclick = () => {
        const next = overlay.querySelector('.pmp18-editor-ta').value;
        if (next === p.description) {
            close();
            return;
        }
        const ok = window.confirm('确认将修改写回原 Persona？此操作会更新 SillyTavern 中的描述数据。');
        if (!ok) return;
        persistPersonaDescription(id, next);
        close();
        if (typeof toastr !== 'undefined') toastr.success('已写回 Persona 描述');
        renderManager();
    };

    document.body.appendChild(overlay);
    overlay.querySelector('.pmp18-editor-ta').focus();
}

function openFullEditor(id) {
    const personas = getPersonaData();
    const p = personas.find(x => x.id === id);
    if (!p) return;

    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay pmp18-full-editor';
    overlay.innerHTML = `
        <div class="pmp18-editor">
            <div class="pmp18-editor-head">
                <strong>编辑 Persona</strong>
                <span>ID: ${escapeHtml(p.id)}</span>
                <button type="button" class="pmp18-close pmp18-editor-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <label style="margin: 8px 16px 0; font-size:12px; opacity:.6;">名称</label>
            <input class="pmp18-editor-input" type="text" value="${escapeHtml(p.name)}" spellcheck="false">
            <label style="margin: 8px 16px 0; font-size:12px; opacity:.6;">描述</label>
            <textarea class="pmp18-editor-ta" rows="12" spellcheck="false">${escapeHtml(p.description)}</textarea>
            <div class="pmp18-editor-actions">
                <button type="button" class="pmp18-small-btn pmp18-editor-cancel">取消</button>
                <button type="button" class="pmp18-primary-btn pmp18-editor-save" id="pmp18-full-save-btn">保存</button>
            </div>
            <p class="pmp18-editor-note">修改后立即生效，刷新当前列表。</p>
        </div>`;

    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const saveBtn = overlay.querySelector('#pmp18-full-save-btn');
    saveBtn.onclick = () => {
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';

        const newName = overlay.querySelector('.pmp18-editor-input').value.trim() || p.id;
        const newDesc = overlay.querySelector('.pmp18-editor-ta').value;
        if (newName === p.name && newDesc === p.description) {
            close();
            return;
        }
        const ok = window.confirm('确认修改？将更新名称和描述。');
        if (!ok) {
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
            return;
        }

        const success = persistPersonaFull(id, newName, newDesc);
        if (!success) {
            alert('保存失败，请检查控制台错误。');
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
            return;
        }

        close();

        setTimeout(() => {
            renderManager();
            try {
                document.dispatchEvent(new CustomEvent('settingsUpdated'));
            } catch (_) {}
            if (typeof toastr !== 'undefined') {
                toastr.success('Persona 已更新');
            }
        }, 300);
    };

    document.body.appendChild(overlay);
    overlay.querySelector('.pmp18-editor-input').focus();
}

/* ---------- Settings panel ---------- */
function renderSettingsPanel() {
    const t = Math.round(state.settings.similarityThreshold * 100);
    const soft = Math.round(state.settings.diffSoftThreshold * 100);
    const allowSame = state.settings.allowSameNameSimilarity || false;

    const updateStatus = getUpdateStatus();
    const hasUpdate = updateStatus?.hasUpdate || false;
    const latestVer = updateStatus?.latestVersion || '';

    return `
        <div class="pmp18-settings">
            <div class="pmp18-settings-row">
                <div class="pmp18-version-info">
                    <span style="font-weight:600;">当前版本：v${VERSION}</span>
                    ${hasUpdate ? `<span class="pmp18-version-badge pmp18-version-new">NEW</span>` : ''}
                    ${latestVer ? `<span style="font-size:12px;opacity:.6;">最新：v${latestVer}</span>` : ''}
                    <button class="pmp18-version-btn" data-action="check-update"><i class="fa-solid fa-rotate"></i> 检查更新</button>
                </div>
                <span class="pmp18-muted" style="font-size:12px;">点击“检查更新”可获取最新版本信息。</span>
            </div>
            <div class="pmp18-settings-row">
                <label>相似检测阈值 <b id="pmp18-th-val">${t}%</b></label>
                <input type="range" id="pmp18-threshold" min="30" max="90" step="5" value="${t}" data-action="threshold">
                <span class="pmp18-muted">低于此值的相似对不会出现在「高度相似」标签</span>
            </div>
            <div class="pmp18-settings-row" style="border-top:1px solid rgba(127,127,127,.12);padding-top:12px;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;">
                    <input type="checkbox" id="pmp18-allow-same-name" ${allowSame ? 'checked' : ''} data-action="toggle-same-name-similarity">
                    允许同名 Persona 参与相似度检测
                </label>
                <span class="pmp18-muted" style="font-size:12px;">开启后，即使 Persona 名称相同，也会依据描述内容进行相似度比对</span>
            </div>
            <div class="pmp18-settings-row" style="border-top:1px solid rgba(127,127,127,.12);padding-top:12px;">
                <label>差异检测敏感度 <b id="pmp18-soft-val">${soft}%</b></label>
                <input type="range" id="pmp18-soft-threshold" min="10" max="60" step="5" value="${soft}" data-action="soft-threshold">
                <span class="pmp18-muted" style="font-size:12px;">控制段落匹配的宽松程度，值越低差异越容易被标注（推荐 30% ~ 45%）</span>
            </div>
        </div>`;
}

function renderManagerContent(personas) {
    if (state.tab === 'settings') return renderSettingsPanel();
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
    const inCompare = state.compareIds.length >= 2;

    const selectionHint = state.selected.size >= 2
        ? `<div class="pmp18-selection-bar">
            <div>
                <strong>已选择 ${state.selected.size} 个 Persona</strong>
                <span>开始对比后，可随时切换基准（默认以选择顺序第一个为基准）</span>
            </div>
            <button class="pmp18-primary-btn" data-action="compare-selected"><i class="fa-solid fa-code-compare"></i> 开始对比</button>
            <button class="pmp18-small-btn" data-action="clear-selection">清除选择</button>
           </div>`
        : state.selected.size === 1
            ? `<div class="pmp18-selection-bar"><div><strong>已选择 1 个</strong><span>请再选至少 1 个以开始对比</span></div><button class="pmp18-small-btn" data-action="clear-selection">清除</button></div>`
            : '';

    root.innerHTML = `
        <div class="pmp18-backdrop" data-action="close"></div>
        <section class="pmp18-window" role="dialog" aria-modal="true" aria-label="Persona Manager">
            <header class="pmp18-header">
                <div class="pmp18-brand">
                    <div class="pmp18-brand-icon"><i class="fa-solid fa-users-viewfinder"></i></div>
                    <div><h1>Persona Manager</h1><span>整理、识别与对比你的 Persona · v${VERSION}</span></div>
                </div>
                <button class="pmp18-close" type="button" data-action="close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </header>
            ${inCompare ? renderCompareWorkspace(personas) : `
            <div class="pmp18-toolbar">
                <div class="pmp18-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="pmp18-search" type="search" value="${escapeHtml(state.query)}" placeholder="搜索 Persona 名称或描述…" autocomplete="off">
                    ${state.query ? '<button data-action="clear-search"><i class="fa-solid fa-xmark"></i></button>' : ''}
                </div>
                <div class="pmp18-stats">
                    <span><b>${personas.length}</b> 全部</span>
                    <span><b>${sameNameGroups.length}</b> 同名组</span>
                    <span><b>${duplicateGroups.length}</b> 重复组</span>
                    <span><b>${similarPairs.length}</b> 相似对</span>
                </div>
            </div>
            <nav class="pmp18-tabs">
                ${tabButton('all', '全部 Persona', 'fa-layer-group')}
                ${tabButton('same-name', '同名 Persona', 'fa-people-group', sameNameGroups.length)}
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
        if (action === 'set-layout') {
            state.settings.compareLayout = target.dataset.layout === 'revision' ? 'revision' : 'side';
            saveSettingsLocal();
            renderManager();
            return;
        }
        if (action === 'toggle-diff-only') {
            state.settings.showDiffOnly = !state.settings.showDiffOnly;
            saveSettingsLocal();
            renderManager();
            return;
        }
        if (action === 'edit-persona') {
            openEditor(target.dataset.id);
            return;
        }
        if (action === 'edit-full') {
            openFullEditor(target.dataset.id);
            return;
        }
        if (action === 'check-update') {
            const btn = target;
            btn.disabled = true;
            btn.textContent = '检查中...';
            checkForUpdates().then(info => {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-rotate"></i> 检查更新';
                if (info) {
                    showUpdateModal(info);
                } else {
                    showNetworkErrorModal();
                }
            }).catch(() => {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-rotate"></i> 检查更新';
                if (typeof toastr !== 'undefined') toastr.error('检查更新失败');
            });
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
        if (event.target.id === 'pmp18-allow-same-name') {
            state.settings.allowSameNameSimilarity = event.target.checked;
            saveSettingsLocal();
            renderManager();
            return;
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
            const v = Number(event.target.value) / 100;
            state.settings.similarityThreshold = Math.min(0.9, Math.max(0.3, v));
            saveSettingsLocal();
            const label = document.getElementById('pmp18-th-val');
            if (label) label.textContent = `${Math.round(state.settings.similarityThreshold * 100)}%`;
            return;
        }
        if (event.target.id === 'pmp18-soft-threshold') {
            const v = Number(event.target.value) / 100;
            state.settings.diffSoftThreshold = Math.min(0.6, Math.max(0.1, v));
            saveSettingsLocal();
            const label = document.getElementById('pmp18-soft-val');
            if (label) label.textContent = `${Math.round(state.settings.diffSoftThreshold * 100)}%`;
            return;
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
    if (!window.__pmp18UpdateChecked) {
        window.__pmp18UpdateChecked = true;
        checkForUpdates().then(info => {
            if (info?.hasUpdate && typeof toastr !== 'undefined') {
                toastr.info(`有新版本 v${info.latestVersion} 可用！`, EXT, { timeOut: 8000 });
            }
        }).catch(() => {});
    }
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

const ENTRY_TEXTS = [
    '全局设置',
    'Global Settings',
    'Persona Management',
    'Persona 管理',
    '用户设置',
    'User Settings',
    'Personas',
];

function findEntryAnchor() {
    const hardIds = [
        'persona-management-block',
        'user-settings-block-content',
        'user-settings-block',
    ];
    for (const id of hardIds) {
        const node = document.getElementById(id);
        if (node) return { type: 'container', node, id };
    }

    const hardClass = document.querySelector(
        '.persona_management_left_column, .persona_management_global_settings, #persona-management-block'
    );
    if (hardClass) return { type: 'container', node: hardClass };

    const headings = document.querySelectorAll('h3,h2,h4,.inline-drawer-header');
    for (const el of headings) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text === '用户设置' || text === 'User Settings' || text === '全局设置' || text === 'Global Settings') {
            return { type: 'heading', node: el };
        }
    }

    const elements = document.querySelectorAll(
        'h1,h2,h3,h4,h5,h6,legend,label,.inline-drawer-header,.menu_section_header,span,div'
    );
    for (const element of elements) {
        if (element.dataset?.pmp18 === ENTRY_MARK) continue;
        if (element.children.length > 5) continue;
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 24) continue;
        if (!ENTRY_TEXTS.some(t => text === t || text.includes(t))) continue;
        return { type: 'heading', node: element };
    }

    return null;
}

function makeEntry(floating = false) {
    const entry = document.createElement('button');
    entry.id = BUTTON_ID;
    entry.type = 'button';
    entry.className = floating ? 'menu_button pmp18-entry pmp18-entry-float' : 'menu_button pmp18-entry';
    entry.dataset.pmp18 = ENTRY_MARK;
    entry.title = 'Persona Manager';
    entry.innerHTML = floating
        ? '<i class="fa-solid fa-users-viewfinder"></i><span>Persona Manager</span>'
        : '<i class="fa-solid fa-users-viewfinder"></i><span>Persona Manager</span><small>管理 / 对比 / 重复检测</small>';
    entry.addEventListener('click', () => openManager('all'));
    return entry;
}

function injectEntry() {
    if (document.getElementById(BUTTON_ID)) return true;

    const anchor = findEntryAnchor();
    if (anchor?.node) {
        const btn = makeEntry(false);
        if (anchor.type === 'heading' && anchor.node.parentNode) {
            anchor.node.parentNode.insertBefore(btn, anchor.node);
        } else {
            anchor.node.insertBefore(btn, anchor.node.firstChild);
        }
        console.log(`[${EXT}] 入口已挂载 (${anchor.type}${anchor.id ? ' #' + anchor.id : ''})`);
        return true;
    }
    return false;
}

function injectFloatingEntry() {
    if (document.getElementById(BUTTON_ID)) return true;
    const btn = makeEntry(true);
    document.body.appendChild(btn);
    console.warn(`[${EXT}] 未找到面板挂载点，已使用右下角浮动入口。也可在控制台执行 openPersonaManager()`);
    if (typeof toastr !== 'undefined') {
        toastr.info('Persona Manager 使用浮动入口（右下角）。也可在控制台输入 openPersonaManager()', EXT, { timeOut: 5000 });
    }
    return true;
}

function installEntryObserver() {
    if (window.__pmp18Observer) return;

    window.openPersonaManager = () => openManager('all');

    let ticks = 0;
    let floatingDone = false;

    const tryInject = () => {
        const existing = document.getElementById(BUTTON_ID);
        if (existing && !existing.classList.contains('pmp18-entry-float')) return true;
        if (existing?.classList.contains('pmp18-entry-float')) {
            const anchor = findEntryAnchor();
            if (anchor?.node) {
                existing.remove();
            } else {
                return true;
            }
        }
        if (injectEntry()) {
            return true;
        }
        return false;
    };

    if (tryInject()) return;

    const observer = new MutationObserver(() => { tryInject(); });
    window.__pmp18Observer = observer;
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', () => {
        setTimeout(tryInject, 150);
        setTimeout(tryInject, 500);
    }, true);

    window.__pmp18EntryTimer = setInterval(() => {
        ticks += 1;
        if (tryInject()) {
            return;
        }
        if (!floatingDone && ticks >= 20) {
            floatingDone = true;
            injectFloatingEntry();
        }
    }, 500);
}

function installKeyboardHandler() {
    if (window.__pmp18Keyboard) return;
    const handler = event => {
        if (!state.active) return;
        if (event.key === 'Escape') {
            if (document.querySelector('.pmp18-editor-overlay')) return;
            closeManager();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            const input = document.getElementById('pmp18-search');
            if (input && state.compareIds.length < 2) {
                event.preventDefault();
                input.focus();
            }
        }
    };
    window.__pmp18Keyboard = handler;
    document.addEventListener('keydown', handler);
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
