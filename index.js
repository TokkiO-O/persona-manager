/**
 * Persona Manager v1.8.15
 * - Mobile CSS: viewport/100dvh + tap target sizes
 * - Entry z-index/pointer-events fix (fullscreen mobile)
 * - Compare workspace stacks vertically on narrow screens
 * - Update: fallback to several install paths; clear manual instructions if all fail
 * - Mobile compare: shrink baseline/other buttons, scrollable workspace, capped share panel
 * - Mobile editor: fullscreen flex layout so textarea stays visible
 * - Preserve scroll position across re-renders (compare page no longer jumps to top)
 * - Select checkbox: in-place DOM update (no full re-render), so scroll never resets

import { power_user } from '../../../power-user.js';

const EXT = 'Persona Manager';
const VERSION = '1.8.15';
const ROOT_ID = 'pmp18-root';
const BUTTON_ID = 'pmp18-entry';
const ENTRY_MARK = 'pmp18-entry-installed';
const STORAGE_KEY = 'pmp18_settings';
const REMOTE_MANIFEST = 'https://raw.githubusercontent.com/xingx121/persona-manager/main/manifest.json';
const REMOTE_CHANGELOG = 'https://raw.githubusercontent.com/xingx121/persona-manager/main/CHANGELOG.md';

const defaultSettings = {
    similarityThreshold: 0.55,
    includeSameNameInSimilar: true,
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
    focusOtherId: null,
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

const escapeHtml = (v = '') => String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const normalizeText = (v = '') => String(v)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

/* ---------- Persona read / write (id-safe) ---------- */

function getPersonaDescription(raw) {
    if (raw == null) return '';
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    if (Array.isArray(raw)) return raw.map(getPersonaDescription).filter(Boolean).join('\n');
    if (typeof raw === 'object') {
        for (const key of ['description', 'text', 'content', 'value', 'persona_description']) {
            if (raw[key] != null) {
                const t = getPersonaDescription(raw[key]);
                if (t) return t;
            }
        }
    }
    return '';
}

/** ST Persona Title / 备注 */
function getPersonaTitle(raw) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return '';
    for (const key of ['title', 'memo', 'note', '备注', 'persona_title']) {
        if (raw[key] != null && String(raw[key]).trim()) return String(raw[key]).trim();
    }
    return '';
}

function getActiveAvatarId() {
    try {
        if (power_user?.user_avatar) return String(power_user.user_avatar);
    } catch { /* ignore */ }
    try {
        if (window.user_avatar) return String(window.user_avatar);
    } catch { /* ignore */ }
    return '';
}

function getPersonaData() {
    const personas = power_user?.personas || {};
    const descriptions = power_user?.persona_descriptions || {};
    return Object.entries(personas).map(([id, rawName]) => {
        const name = String(rawName ?? id);
        const rawDesc = descriptions?.[id];
        const description = getPersonaDescription(rawDesc);
        const title = getPersonaTitle(rawDesc);
        return {
            id: String(id),
            name,
            title,
            description,
            nameKey: normalizeText(name),
            descriptionKey: normalizeText(description),
        };
    });
}

function formatPersonaSubline(persona) {
    // 备注优先，没有则退回短 ID，用于同名同头像区分
    if (persona.title) return persona.title;
    const id = String(persona.id || '');
    if (id.length <= 18) return id;
    return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function savePowerUserSettings() {
    try {
        if (typeof window.saveSettingsDebounced === 'function') {
            window.saveSettingsDebounced();
            return;
        }
    } catch { /* ignore */ }
    try {
        if (typeof window.saveSettings === 'function') window.saveSettings();
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
        if (es?.emit) es.emit('PERSONA_UPDATED', id);
    } catch { /* ignore */ }
}

/**
 * Write ONLY this avatar id.
 * Never copy edited text onto the currently selected persona unless ids match.
 */
function persistPersonaDescription(targetId, description) {
    const id = String(targetId || '');
    if (!id || !power_user) {
        console.error(`[${EXT}] persist blocked: invalid id`, targetId);
        return false;
    }
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

    // Only touch the native textarea when editing the ACTIVE persona
    const activeId = getActiveAvatarId();
    if (activeId && activeId === id) {
        try {
            const ta = document.querySelector('#persona_description, textarea[name="persona_description"], #persona-description-textarea');
            if (ta && typeof ta.value === 'string') {
                ta.value = nextText;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
            }
            // Keep global "current description" field in sync only for active
            if (typeof power_user.persona_description === 'string') {
                power_user.persona_description = nextText;
            }
        } catch { /* ignore */ }
    }

    console.log(`[${EXT}] wrote description for id=${id} (active=${activeId || 'none'}) len=${nextText.length}`);
    savePowerUserSettings();
    emitPersonaUpdated(id);
    return true;
}

function persistPersonaFull(targetId, name, description) {
    const id = String(targetId || '');
    if (!id || !power_user) {
        console.error(`[${EXT}] persistFull blocked: invalid id`, targetId);
        return false;
    }
    if (!power_user.personas) power_user.personas = {};
    power_user.personas[id] = String(name ?? id);
    console.log(`[${EXT}] wrote name for id=${id}`);
    return persistPersonaDescription(id, description);
}

function deletePersonaById(targetId) {
    const id = String(targetId || '');
    if (!id || !power_user) return false;
    if (!power_user.personas || !(id in power_user.personas)) {
        console.error(`[${EXT}] delete: id not found`, id);
        return false;
    }
    const name = power_user.personas[id];
    delete power_user.personas[id];
    if (power_user.persona_descriptions && id in power_user.persona_descriptions) {
        delete power_user.persona_descriptions[id];
    }
    // If deleted was default / active, clear lightly (ST may also handle via event)
    try {
        if (power_user.default_persona === id) power_user.default_persona = null;
    } catch { /* ignore */ }

    state.selected.delete(id);
    state.compareIds = state.compareIds.filter(x => x !== id);
    if (state.baselineId === id) state.baselineId = state.compareIds[0] || null;
    if (state.focusOtherId === id) state.focusOtherId = state.compareIds.find(x => x !== state.baselineId) || null;

    savePowerUserSettings();
    try {
        const ctx = window.SillyTavern?.getContext?.();
        const es = ctx?.eventSource;
        const types = ctx?.eventTypes || ctx?.event_types;
        if (es?.emit && types?.PERSONA_DELETED) es.emit(types.PERSONA_DELETED, id);
        else if (es?.emit) es.emit('PERSONA_DELETED', id);
    } catch { /* ignore */ }
    console.log(`[${EXT}] deleted persona id=${id} name=${name}`);
    return true;
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

/* ---------- Diff engine ---------- */

/** Short heading line: section title, not a long prose sentence */
function isSectionTitleLine(line) {
    const t = String(line || '').trim();
    if (!t || t.length > 36) return false;
    if (/^#{1,6}\s/.test(t)) return true;
    if (/[:：]\s*$/.test(t) && t.length <= 24) return true;
    if (/^\s*[\w\u4e00-\u9fff./_-]{1,20}\s*[:：]/.test(t) && t.length <= 28) return true;
    // Bare short labels without ending punctuation (e.g. 五官细节 / 女)
    if (t.length <= 16 && !/[。！？；;,.!?]$/.test(t) && !/\s{2,}/.test(t)) return true;
    return false;
}

/**
 * Split into sections: title line merges with following body until next title.
 * Avoids "仅基准: 发型与发色" while body text exists on both sides unmatched.
 */
function splitUnits(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n');
    if (!raw.trim()) return [];
    const lines = raw.split('\n');

    const units = [];
    let buf = [];
    const flush = () => {
        const t = buf.join('\n').trim();
        if (t) units.push(t);
        buf = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
            // blank line: if buffer has content and next is a title, flush
            if (buf.length && i + 1 < lines.length && isSectionTitleLine(lines[i + 1])) {
                flush();
            } else if (buf.length) {
                buf.push(line);
            }
            continue;
        }
        if (isSectionTitleLine(line) && buf.length) {
            flush();
            buf.push(line);
            continue;
        }
        buf.push(line);
    }
    flush();

    if (units.length >= 2) return units;

    // Fallback: paragraphs then lines
    let parts = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) parts = lines.map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [raw.trim()];
}

/** Prefer matching units that share the same first-line title */
function unitTitleKey(unit) {
    const first = String(unit || '').split('\n').map(s => s.trim()).find(Boolean) || '';
    return normalizeText(first.replace(/[:：]\s*$/, '')).slice(0, 24);
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

    // Pass 0: same section title key (e.g. 发型与发色 / 五官细节)
    for (let i = 0; i < aUnits.length; i++) {
        const ta = unitTitleKey(aUnits[i]);
        if (!ta) continue;
        for (let j = 0; j < bUnits.length; j++) {
            if (usedB.has(j)) continue;
            if (unitTitleKey(bUnits[j]) === ta) {
                const s = similarity(aUnits[i], bUnits[j]);
                const type = s >= 0.92 || normalizeText(aUnits[i]) === normalizeText(bUnits[j]) ? 'same' : 'replace';
                pairs.push({ type, a: aUnits[i], b: bUnits[j], ai: i, bj: j, matched: true });
                usedB.add(j);
                break;
            }
        }
    }

    // Pass 1: exact full-unit match for remaining
    for (let i = 0; i < aUnits.length; i++) {
        if (pairs.some(p => p.ai === i)) continue;
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

    // Pass 2: best similarity for pending
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

function looksStructured(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) return false;
    const field = lines.filter(l => /^[\w\u4e00-\u9fff./_-]+\s*[:：]/.test(l)).length;
    return field / lines.length >= 0.4;
}

/** Shared short facts (numbers, measures, short phrases) for cross-structure compare */
function extractSharedSnippets(aText, bText) {
    const a = String(aText || '');
    const b = String(bText || '');
    if (!a || !b) return [];

    const candidates = new Set();
    const pushMatches = (text, re) => {
        const m = text.match(re) || [];
        for (const x of m) {
            const t = x.trim();
            if (t.length >= 2) candidates.add(t);
        }
    };
    // measurements / dates / short alnum
    pushMatches(a, /\d+(?:\.\d+)?\s*(?:cm|kg|m|岁|年|月|日|%|cm|CM|KG)?/gi);
    pushMatches(a, /[A-Za-z\u4e00-\u9fff]{2,12}/g);

    const shared = [];
    const bNorm = b;
    for (const c of candidates) {
        if (c.length < 2 || c.length > 24) continue;
        if (/^(的|了|和|与|或|在|是|有|我|你|他|她|它)$/.test(c)) continue;
        if (bNorm.includes(c)) shared.push(c);
    }
    // unique, longer first
    const seen = new Set();
    return shared
        .sort((x, y) => y.length - x.length)
        .filter(s => {
            const k = normalizeText(s);
            if (seen.has(k)) return false;
            // drop if contained in already kept longer snippet
            for (const keep of seen) {
                if (keep.includes(k) && keep !== k) return false;
            }
            seen.add(k);
            return true;
        })
        .slice(0, 40);
}

function shouldUseFragmentMode(baseText, otherText, score) {
    if (score < 0.15) return true;
    const aS = looksStructured(baseText);
    const bS = looksStructured(otherText);
    if (aS !== bS) return true;
    return false;
}

function highlightSnippets(text, snippets) {
    let html = escapeHtml(text);
    const sorted = [...snippets].sort((a, b) => b.length - a.length);
    for (const s of sorted) {
        const esc = escapeHtml(s);
        if (!esc) continue;
        html = html.split(esc).join(`<mark class="pmp18-share">${esc}</mark>`);
    }
    return html;
}

function renderFragmentCompare(baseText, otherText) {
    const shared = extractSharedSnippets(baseText, otherText);
    const shareHtml = shared.length
        ? `<div class="pmp18-share-list">${shared.map(s => `<span class="pmp18-share-chip">${escapeHtml(s)}</span>`).join('')}</div>`
        : `<div class="pmp18-muted">未抽出可对齐的共同短句/数字（结构差异较大时属正常）</div>`;

    return {
        legendExtra: true,
        sharedCount: shared.length,
        baseHtml: `<div class="pmp18-col-block frag">${highlightSnippets(baseText, shared)}</div>`,
        otherHtml: `<div class="pmp18-col-block frag">${highlightSnippets(otherText, shared)}</div>`,
        sharePanel: `<div class="pmp18-share-panel"><div class="pmp18-share-title">共同片段（${shared.length}）</div>${shareHtml}</div>`,
    };
}

/** Symmetric blocks: side 'base' | 'other' */
function renderFocusBlocks(baseText, otherText, side, showDiffOnly) {
    const rows = unorderedDiff(baseText, otherText);
    const parts = [];
    for (const row of rows) {
        const isPureSame = row.type === 'same' && (row.a === row.b || normalizeText(row.a) === normalizeText(row.b));
        if (showDiffOnly && isPureSame) continue;

        if (row.type === 'same') {
            if (isPureSame) {
                parts.push(`<div class="pmp18-col-block same">${escapeHtml(side === 'base' ? row.a : row.b)}</div>`);
            } else {
                const { left, right } = inlineDiffHtml(row.a, row.b);
                parts.push(`<div class="pmp18-col-block replace">${side === 'base' ? left : right}</div>`);
            }
        } else if (row.type === 'remove') {
            if (side === 'base') {
                parts.push(`<div class="pmp18-col-block remove"><span class="pmp18-tag">仅基准</span><mark class="pmp18-del">${escapeHtml(row.a)}</mark></div>`);
            } else {
                parts.push(`<div class="pmp18-col-block remove pmp18-ghost"><span class="pmp18-tag">基准有 · 对方无</span></div>`);
            }
        } else if (row.type === 'add') {
            if (side === 'other') {
                parts.push(`<div class="pmp18-col-block add"><span class="pmp18-tag">仅对方</span><mark class="pmp18-add">${escapeHtml(row.b)}</mark></div>`);
            } else {
                parts.push(`<div class="pmp18-col-block add pmp18-ghost"><span class="pmp18-tag">对方有 · 基准无</span></div>`);
            }
        } else {
            const { left, right } = inlineDiffHtml(row.a, row.b);
            parts.push(`<div class="pmp18-col-block replace">${side === 'base' ? left : right}</div>`);
        }
    }
    return parts.join('') || '<div class="pmp18-muted" style="padding:12px">无内容</div>';
}

function renderCompareLegend(fragmentMode) {
    return `
        <div class="pmp18-legend">
            <span class="pmp18-legend-title">图例</span>
            <span class="pmp18-legend-item"><i class="pmp18-leg same"></i>相同/高度重合</span>
            <span class="pmp18-legend-item"><i class="pmp18-leg replace"></i>对应段有修改</span>
            <span class="pmp18-legend-item"><i class="pmp18-leg remove"></i>仅基准有</span>
            <span class="pmp18-legend-item"><i class="pmp18-leg add"></i>仅对方有</span>
            ${fragmentMode ? '<span class="pmp18-legend-item"><i class="pmp18-leg share"></i>共同片段（跨结构）</span>' : ''}
            <span class="pmp18-legend-note">${fragmentMode ? '当前为跨结构/低相似模式：先标共同片段，再通读全文。' : '按章节对齐；粉=删、绿=增。'}</span>
        </div>`;
}

/* ---------- UI lists ---------- */

function renderCard(persona, all) {
    const checked = state.selected.has(persona.id);
    const sub = formatPersonaSubline(persona);
    return `
        <article class="pmp18-card ${checked ? 'is-selected' : ''}" data-persona-id="${escapeHtml(persona.id)}">
            <label class="pmp18-check">
                <input type="checkbox" data-action="select" data-id="${escapeHtml(persona.id)}" ${checked ? 'checked' : ''}>
            </label>
            ${renderAvatar(persona)}
            <div class="pmp18-card-main">
                <div class="pmp18-card-title-row">
                    <div class="pmp18-card-name">${escapeHtml(persona.name)}</div>
                    ${statusBadge(persona, all)}
                </div>
                <div class="pmp18-card-sub" title="${escapeHtml(persona.title ? `备注：${persona.title}` : `ID：${persona.id}`)}">${escapeHtml(sub)}</div>
                <div class="pmp18-card-description">${persona.description ? escapeHtml(persona.description) : '<span class="pmp18-muted">暂无描述</span>'}</div>
                <div class="pmp18-card-actions">
                    <button type="button" class="pmp18-small-btn" data-action="edit-full" data-id="${escapeHtml(persona.id)}"><i class="fa-solid fa-pen"></i> 编辑</button>
                    <button type="button" class="pmp18-small-btn pmp18-danger-btn" data-action="delete-persona" data-id="${escapeHtml(persona.id)}"><i class="fa-solid fa-trash"></i> 删除</button>
                </div>
            </div>
        </article>`;
}

function renderGroup(group, title, all) {
    return `
        <section class="pmp18-group">
            <div class="pmp18-group-head">
                <div><div class="pmp18-group-title">${escapeHtml(title)}</div><div class="pmp18-group-count">${group.length} 个</div></div>
                <button class="pmp18-small-btn" type="button" data-action="select-group" data-ids="${escapeHtml(group.map(x => x.id).join('|'))}">全选</button>
            </div>
            <div class="pmp18-group-grid">${group.map(p => renderCard(p, all)).join('')}</div>
        </section>`;
}

function emptyState(title, text) {
    return `<div class="pmp18-empty"><i class="fa-solid fa-magnifying-glass"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text || '')}</span></div>`;
}

function searchMatch(persona, query) {
    const q = normalizeText(query);
    return !q || persona.nameKey.includes(q) || persona.descriptionKey.includes(q);
}

function renderAllView(personas) {
    const filtered = personas.filter(p => searchMatch(p, state.query));
    return filtered.length
        ? `<div class="pmp18-card-grid">${filtered.map(p => renderCard(p, personas)).join('')}</div>`
        : emptyState(state.query ? '没有匹配' : '没有 Persona', '');
}

function renderSameNameView(personas) {
    const groups = getSameNameGroups(personas).map(g => g.filter(p => searchMatch(p, state.query))).filter(g => g.length > 1);
    return groups.length ? groups.map(g => renderGroup(g, g[0].name, personas)).join('') : emptyState('没有同名', '');
}

function renderDuplicateView(personas) {
    const groups = getExactDuplicateGroups(personas).map(g => g.filter(p => searchMatch(p, state.query))).filter(g => g.length > 1);
    return groups.length ? groups.map((g, i) => renderGroup(g, `重复组 ${i + 1}`, personas)).join('') : emptyState('没有完全重复', '');
}

function renderSimilarView(personas) {
    const q = normalizeText(state.query);
    const pairs = getSimilarPairs(personas).filter(({ a, b }) => !q || searchMatch(a, q) || searchMatch(b, q));
    if (!pairs.length) {
        return emptyState('没有高度相似', `阈值 ${Math.round(state.settings.similarityThreshold * 100)}%`);
    }
    return `<div class="pmp18-similar-list">${pairs.map(({ a, b, score }) => `
        <section class="pmp18-similar-pair">
            <div class="pmp18-similar-head">
                <div><span class="pmp18-score">${Math.round(score * 100)}%</span>
                ${a.nameKey === b.nameKey ? '<span class="pmp18-badge">同名</span>' : ''}</div>
                <button class="pmp18-small-btn" data-action="compare-pair" data-a="${escapeHtml(a.id)}" data-b="${escapeHtml(b.id)}">对比</button>
            </div>
            <div class="pmp18-compare-mini">
                <div class="pmp18-mini">${renderAvatar(a)}<div><strong>${escapeHtml(a.name)}</strong></div></div>
                <div class="pmp18-mini">${renderAvatar(b)}<div><strong>${escapeHtml(b.name)}</strong></div></div>
            </div>
        </section>`).join('')}</div>`;
}

/** Multi overview cards + in-place detail vs baseline (same screen) */
function renderCompareWorkspace(personas) {
    const ids = state.compareIds.filter(id => personas.some(p => p.id === id));
    if (ids.length < 2) {
        state.compareIds = [];
        state.baselineId = null;
        state.focusOtherId = null;
        return renderManagerContent(personas);
    }
    if (!state.baselineId || !ids.includes(state.baselineId)) state.baselineId = ids[0];
    const others = ids.filter(id => id !== state.baselineId);
    if (!state.focusOtherId || !others.includes(state.focusOtherId)) state.focusOtherId = others[0];

    const base = personas.find(p => p.id === state.baselineId);
    const other = personas.find(p => p.id === state.focusOtherId);
    if (!base || !other) return emptyState('对比数据无效', '');

    const score = similarity(base.description, other.description);
    const fragmentMode = shouldUseFragmentMode(base.description, other.description, score);
    const stats = fragmentMode
        ? { same: extractSharedSnippets(base.description, other.description).length, replace: 0, remove: 0, add: 0 }
        : countPairStats(unorderedDiff(base.description, other.description));
    const mode = diffModeClass(score);
    const showDiffOnly = state.settings.showDiffOnly;
    const frag = fragmentMode ? renderFragmentCompare(base.description, other.description) : null;

    const baselineBtns = ids.map(id => {
        const p = personas.find(x => x.id === id);
        if (!p) return '';
        const sub = formatPersonaSubline(p);
        return `<button type="button" class="pmp18-base-btn ${id === state.baselineId ? 'is-active' : ''}" data-action="set-baseline" data-id="${escapeHtml(id)}" title="${escapeHtml(sub)}">${escapeHtml(p.name)}<small>${escapeHtml(sub)}</small></button>`;
    }).join('');

    const otherCards = others.map(id => {
        const p = personas.find(x => x.id === id);
        if (!p) return '';
        const sc = Math.round(similarity(base.description, p.description) * 100);
        const on = id === state.focusOtherId;
        const sub = formatPersonaSubline(p);
        return `
            <button type="button" class="pmp18-other-card ${on ? 'is-active' : ''}" data-action="set-focus-other" data-id="${escapeHtml(id)}">
                ${renderAvatar(p)}
                <div class="pmp18-other-card-meta">
                    <strong title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</strong>
                    <span>${escapeHtml(sub)} · ${sc}%</span>
                </div>
            </button>`;
    }).join('');

    const baseBody = fragmentMode
        ? frag.baseHtml
        : renderFocusBlocks(base.description, other.description, 'base', showDiffOnly);
    const otherBody = fragmentMode
        ? frag.otherHtml
        : renderFocusBlocks(base.description, other.description, 'other', showDiffOnly);

    const metaLine = fragmentMode
        ? `${Math.round(score * 100)}% · 跨结构模式 · 共同片段 ${stats.same}`
        : `${Math.round(score * 100)}% · 同 ${stats.same} · 改 ${stats.replace} · 仅基准 ${stats.remove} · 仅对方 ${stats.add}`;

    return `
        <div class="pmp18-compare-workspace">
            <div class="pmp18-compare-topbar">
                <button type="button" class="pmp18-back-btn" data-action="exit-compare"><i class="fa-solid fa-arrow-left"></i> 返回</button>
                <div class="pmp18-compare-title">
                    <strong>对比</strong>
                    <span>点选对象卡细比 · 备注/标题用于区分同名</span>
                </div>
                <div class="pmp18-compare-tools">
                    ${fragmentMode ? '' : `<button type="button" class="pmp18-small-btn ${showDiffOnly ? 'is-on' : ''}" data-action="toggle-diff-only">只看差异</button>`}
                    <button type="button" class="pmp18-small-btn" data-action="edit-full" data-id="${escapeHtml(base.id)}">编辑基准</button>
                    <button type="button" class="pmp18-small-btn" data-action="edit-full" data-id="${escapeHtml(other.id)}">编辑对方</button>
                </div>
            </div>
            <div class="pmp18-baseline-bar">
                <span class="pmp18-baseline-label">基准</span>
                <div class="pmp18-baseline-list">${baselineBtns}</div>
            </div>
            <div class="pmp18-others-strip">
                <span class="pmp18-baseline-label">对象</span>
                <div class="pmp18-others-scroll">${otherCards}</div>
            </div>
            ${renderCompareLegend(fragmentMode)}
            ${fragmentMode ? frag.sharePanel : ''}
            <div class="pmp18-detail-meta">
                <strong>${escapeHtml(base.name)}</strong>
                <span class="pmp18-muted">${escapeHtml(formatPersonaSubline(base))}</span>
                ↔
                <strong>${escapeHtml(other.name)}</strong>
                <span class="pmp18-muted">${escapeHtml(formatPersonaSubline(other))}</span>
                <span>${metaLine}</span>
            </div>
            <div class="pmp18-focus-wrap ${mode}">
                <section class="pmp18-hcol pmp18-hcol-base">
                    <div class="pmp18-hcol-head">
                        <div class="pmp18-pair-person">
                            ${renderAvatar(base)}
                            <div>
                                <strong>${escapeHtml(base.name)}</strong>
                                <span>基准 · ${escapeHtml(formatPersonaSubline(base))}</span>
                            </div>
                        </div>
                    </div>
                    <div class="pmp18-hcol-body">${baseBody}</div>
                </section>
                <section class="pmp18-hcol pmp18-hcol-other">
                    <div class="pmp18-hcol-head">
                        <div class="pmp18-pair-person">
                            ${renderAvatar(other)}
                            <div>
                                <strong>${escapeHtml(other.name)}</strong>
                                <span>对方 · ${escapeHtml(formatPersonaSubline(other))}</span>
                            </div>
                        </div>
                    </div>
                    <div class="pmp18-hcol-body">${otherBody}</div>
                </section>
            </div>
        </div>`;
}

function tabButton(key, label, icon, count) {
    const extra = key === 'settings' && state.updateInfo?.available
        ? '<em class="pmp18-new">NEW</em>'
        : (typeof count === 'number' ? `<em>${count}</em>` : '');
    return `<button class="pmp18-tab ${state.tab === key ? 'is-active' : ''}" type="button" data-action="tab" data-tab="${key}"><i class="fa-solid ${icon}"></i><span>${label}</span>${extra}</button>`;
}

function renderSettingsPanel() {
    const t = Math.round(state.settings.similarityThreshold * 100);
    const soft = Math.round((state.settings.softMatchThreshold ?? 0.35) * 100);
    const upd = state.updateInfo;
    let updateBlock = `
        <div class="pmp18-update-box" id="pmp18-update-box">
            <div>
                <div><b>当前版本</b> v${VERSION}</div>
                <div class="pmp18-muted" id="pmp18-update-status">点击检查更新</div>
            </div>
            <button type="button" class="pmp18-small-btn" data-action="check-update" id="pmp18-check-btn">检查更新</button>
        </div>`;

    if (upd?.checking) {
        updateBlock = `
        <div class="pmp18-update-box">
            <div><b>当前版本</b> v${VERSION}<div class="pmp18-muted">正在检查…</div></div>
            <button type="button" class="pmp18-small-btn" disabled>检查中…</button>
        </div>`;
    } else if (upd?.available) {
        updateBlock = `
        <div class="pmp18-update-box is-new">
            <div>
                <div><b>发现新版本</b> v${escapeHtml(String(upd.remoteVersion || ''))}</div>
                <div class="pmp18-muted">当前 v${VERSION}</div>
            </div>
            <button type="button" class="pmp18-primary-btn" data-action="show-update-modal">查看日志并更新</button>
        </div>`;
    } else if (upd?.checked && !upd.error) {
        updateBlock = `
        <div class="pmp18-update-box">
            <div>
                <div><b>已是最新版本</b> v${VERSION}</div>
                <div class="pmp18-muted">可查看更新日志</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="pmp18-small-btn" data-action="show-update-modal">更新日志</button>
                <button type="button" class="pmp18-small-btn" data-action="check-update">重新检查</button>
            </div>
        </div>`;
    } else if (upd?.error) {
        updateBlock = `
        <div class="pmp18-update-box">
            <div>
                <div><b>当前版本</b> v${VERSION}</div>
                <div class="pmp18-muted">无法连接更新源</div>
            </div>
            <button type="button" class="pmp18-small-btn" data-action="check-update">重试</button>
        </div>`;
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
            </div>
            <div class="pmp18-settings-row">
                <label class="pmp18-check-label">
                    <input type="checkbox" id="pmp18-same-name" ${state.settings.includeSameNameInSimilar ? 'checked' : ''}>
                    同名也参与「高度相似」检测
                </label>
            </div>
        </div>`;
}

function renderManagerContent(personas) {
    if (state.tab === 'settings') return renderSettingsPanel();
    if (state.tab === 'all') return renderAllView(personas);
    if (state.tab === 'same-name') return renderSameNameView(personas);
    if (state.tab === 'duplicates') return renderDuplicateView(personas);
    return renderSimilarView(personas);
}

/** In-place update of the bottom selection hint. No full re-render, so the
 *  page never scrolls. Insert the bar if missing, remove it if no longer needed. */
function updateSelectionHint(root) {
    if (!root) return;
    const windowEl = root.querySelector('.pmp18-window');
    if (!windowEl) return;
    let bar = windowEl.querySelector('.pmp18-selection-bar');
    const n = state.selected.size;
    const html = n >= 2
        ? `<div class="pmp18-selection-bar">
            <div><strong>已选 ${n} 个</strong><span>对比时一次细比一个对方，可切换</span></div>
            <button class="pmp18-primary-btn" data-action="compare-selected">开始对比</button>
            <button class="pmp18-small-btn" data-action="clear-selection">清除</button>
           </div>`
        : n === 1
            ? `<div class="pmp18-selection-bar"><div><strong>已选 1 个</strong><span>请再选至少一个</span></div><button class="pmp18-small-btn" data-action="clear-selection">清除</button></div>`
            : '';
    if (!html) {
        if (bar) bar.remove();
        return;
    }
    if (!bar) {
        bar = document.createElement('div');
        windowEl.appendChild(bar);
    }
    bar.outerHTML = html;
}

function renderManager() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const personas = getPersonaData();
    const sameNameGroups = getSameNameGroups(personas);
    const duplicateGroups = getExactDuplicateGroups(personas);
    const similarCount = state.tab === 'similar' ? getSimilarPairs(personas).length : 0;
    const inCompare = state.compareIds.length >= 2;

    // Preserve scroll position across re-renders. innerHTML replacement resets
    // scrollTop to 0 on every click (tab switch, baseline/other change, search
    // typing, checkbox toggle, etc.). On mobile compare page this is especially
    // painful because the workspace scrolls as a whole.
    const prevContent = root.querySelector('.pmp18-content');
    const prevCompare = root.querySelector('.pmp18-compare-workspace');
    const savedScroll = {
        content: prevContent ? prevContent.scrollTop : 0,
        compare: prevCompare ? prevCompare.scrollTop : 0,
    };
    const savedTabBar = root.querySelector('.pmp18-tabs');
    const savedTabScroll = savedTabBar ? savedTabBar.scrollLeft : 0;
    const focusKey = document.activeElement?.dataset?.pmp18KeepFocus;
    const focusSel = focusKey ? document.activeElement?.selectionStart : null;
    const focusEnd = focusKey ? document.activeElement?.selectionEnd : null;

    const selectionHint = state.selected.size >= 2
        ? `<div class="pmp18-selection-bar">
            <div><strong>已选 ${state.selected.size} 个</strong><span>对比时一次细比一个对方，可切换</span></div>
            <button class="pmp18-primary-btn" data-action="compare-selected">开始对比</button>
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
                <button class="pmp18-close" type="button" data-action="close"><i class="fa-solid fa-xmark"></i></button>
            </header>
            ${inCompare ? renderCompareWorkspace(personas) : `
            <div class="pmp18-toolbar">
                <div class="pmp18-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="pmp18-search" data-pmp18-keep-focus="search" type="search" value="${escapeHtml(state.query)}" placeholder="搜索…" autocomplete="off">
                    ${state.query ? '<button data-action="clear-search"><i class="fa-solid fa-xmark"></i></button>' : ''}
                </div>
                <div class="pmp18-stats">
                    <span><b>${personas.length}</b> 全部</span>
                    <span><b>${sameNameGroups.length}</b> 同名</span>
                    <span><b>${duplicateGroups.length}</b> 重复</span>
                    ${state.tab === 'similar' ? `<span><b>${similarCount}</b> 相似</span>` : ''}
                </div>
            </div>
            <nav class="pmp18-tabs">
                ${tabButton('all', '全部', 'fa-layer-group')}
                ${tabButton('same-name', '同名', 'fa-people-group', sameNameGroups.length)}
                ${tabButton('duplicates', '完全重复', 'fa-copy', duplicateGroups.length)}
                ${tabButton('similar', '高度相似', 'fa-clone')}
                ${tabButton('settings', '设置', 'fa-sliders')}
            </nav>
            <main class="pmp18-content">${renderManagerContent(personas)}</main>
            ${selectionHint}`}
        </section>`;

    // Restore scroll positions. Use rAF so the browser has finished layout.
    requestAnimationFrame(() => {
        const newContent = root.querySelector('.pmp18-content');
        if (newContent) newContent.scrollTop = savedScroll.content;
        const newCompare = root.querySelector('.pmp18-compare-workspace');
        if (newCompare) newCompare.scrollTop = savedScroll.compare;
        const newTabBar = root.querySelector('.pmp18-tabs');
        if (newTabBar) newTabBar.scrollLeft = savedTabScroll;
        if (focusKey) {
            const el = root.querySelector(`[data-pmp18-keep-focus="${CSS.escape(focusKey)}"]`);
            if (el) {
                el.focus();
                if (focusSel != null && typeof el.setSelectionRange === 'function') {
                    try { el.setSelectionRange(focusSel, focusEnd); } catch { /* ignore */ }
                }
            }
        }
    });
}

/* ---------- Editor (id locked at open) ---------- */

function openFullEditor(rawId) {
    const id = String(rawId || '');
    const p = getPersonaData().find(x => x.id === id);
    if (!p) {
        console.error(`[${EXT}] editor: persona not found`, rawId);
        return;
    }
    // Freeze id for this editor session
    const lockedId = p.id;

    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay';
    overlay.dataset.editId = lockedId;
    overlay.innerHTML = `
        <div class="pmp18-editor">
            <div class="pmp18-editor-head">
                <strong>编辑 Persona</strong>
                <span class="pmp18-muted">${escapeHtml(lockedId)}</span>
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
            <p class="pmp18-editor-note">仅写入 ID：${escapeHtml(lockedId)}，不会修改其他人设。</p>
        </div>`;

    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.pmp18-editor-save').onclick = () => {
        const newName = overlay.querySelector('.pmp18-editor-name').value.trim() || p.name;
        const newDesc = overlay.querySelector('.pmp18-editor-ta').value;
        const stillId = overlay.dataset.editId;
        if (stillId !== lockedId) {
            console.error(`[${EXT}] editor id mismatch`, stillId, lockedId);
            if (typeof toastr !== 'undefined') toastr.error('保存中止：目标 ID 异常');
            return;
        }
        if (newName === p.name && newDesc === p.description) {
            close();
            return;
        }
        if (!window.confirm(`确认写回「${p.name}」？\nID: ${lockedId}`)) return;
        const ok = persistPersonaFull(lockedId, newName, newDesc);
        close();
        if (ok && typeof toastr !== 'undefined') toastr.success(`已保存：${newName}`);
        renderManager();
    };
    document.body.appendChild(overlay);
}

/* ---------- Updates (remote manifest + CHANGELOG.md) ---------- */

async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
}

/** ST API calls need X-CSRF-Token or ForbiddenError: Invalid CSRF token */
async function getStRequestHeaders() {
    try {
        if (typeof window.getRequestHeaders === 'function') {
            return window.getRequestHeaders();
        }
    } catch { /* ignore */ }
    try {
        const ctx = window.SillyTavern?.getContext?.();
        if (typeof ctx?.getRequestHeaders === 'function') {
            return ctx.getRequestHeaders();
        }
    } catch { /* ignore */ }
    let token = 'disabled';
    try {
        const r = await fetch('/csrf-token', { credentials: 'same-origin' });
        if (r.ok) {
            const data = await r.json();
            if (data?.token) token = data.token;
        }
    } catch { /* ignore */ }
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
    };
}

async function callExtensionUpdate() {
    const candidates = [];
    if (typeof window.updateExtension === 'function') {
        candidates.push(() => window.updateExtension('persona-manager'));
    }
    candidates.push(() => updateViaApi({ extensionName: 'persona-manager', global: false }));
    candidates.push(() => updateViaApi({ extensionName: 'persona-manager', global: true }));
    candidates.push(() => updateViaApi({ extensionName: 'third-party/Persona Manager', global: false }));
    candidates.push(() => updateViaApi({ extensionName: 'third-party/Persona-Manager', global: false }));
    candidates.push(() => updateViaApi({ extensionName: 'third-party/persona-manager', global: false }));

    let lastError = null;
    for (const run of candidates) {
        try {
            return await run();
        } catch (e) {
            lastError = e;
        }
    }
    throw new Error(
        `酒馆没找到本扩展目录，自动化更新失败。` +
        `\n请到 https://github.com/xingx121/persona-manager 手动下载 zip，` +
        `解压覆盖到 data/default-user/extensions/ 下的人设管理文件夹。` +
        `\n（最近错误：${lastError?.message || lastError || '未知'}）`
    );
}

async function updateViaApi(payload) {
    const headers = await getStRequestHeaders();
    const res = await fetch('/api/extensions/update', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return { message: text };
    }
}

async function checkForUpdates() {
    state.updateInfo = { checking: true };
    if (state.tab === 'settings') renderManager();
    try {
        const text = await fetchText(REMOTE_MANIFEST);
        const remote = JSON.parse(text);
        const rv = String(remote.version || '');
        const available = Boolean(rv && rv !== VERSION);
        let changelog = '';
        try {
            changelog = await fetchText(REMOTE_CHANGELOG);
        } catch {
            changelog = remote.description || '（无法获取 CHANGELOG.md）';
        }
        state.updateInfo = {
            checked: true,
            available,
            remoteVersion: rv,
            changelog,
            error: false,
        };
    } catch (e) {
        state.updateInfo = { checked: true, available: false, error: true, message: e?.message || String(e) };
    }
    if (state.tab === 'settings' || state.active) renderManager();
    return state.updateInfo;
}

/** Only the first ## section of CHANGELOG.md (latest version). */
function extractLatestChangelogSection(md) {
    const text = String(md || '').replace(/^\uFEFF/, '').trim();
    if (!text) return '（无日志）';
    const headingRe = /^##\s+.+$/gm;
    const matches = [...text.matchAll(headingRe)];
    if (!matches.length) {
        // No ## headings: return whole file but cap length
        return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
    }
    const start = matches[0].index;
    const end = matches[1] ? matches[1].index : text.length;
    return text.slice(start, end).trim();
}

function showUpdateModal() {
    const info = state.updateInfo || {};
    const log = extractLatestChangelogSection(info.changelog || '');
    const available = Boolean(info.available);
    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay';
    overlay.innerHTML = `
        <div class="pmp18-editor" style="max-width:560px">
            <div class="pmp18-editor-head">
                <strong>${available ? '发现新版本' : '更新日志'}</strong>
                <button type="button" class="pmp18-close pmp18-editor-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p>当前 <b>v${VERSION}</b>${info.remoteVersion ? ` · 远程 <b>v${escapeHtml(String(info.remoteVersion))}</b>` : ''}
            ${available ? '' : ' · <span style="color:#3c9764">已是最新</span>'}</p>
            <pre class="pmp18-changelog">${escapeHtml(log)}</pre>
            <div class="pmp18-editor-actions">
                <button type="button" class="pmp18-small-btn pmp18-editor-cancel">关闭</button>
                ${available ? '<button type="button" class="pmp18-primary-btn pmp18-do-update">立即更新</button>' : ''}
            </div>
        </div>`;
    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    const doBtn = overlay.querySelector('.pmp18-do-update');
    if (doBtn) {
        doBtn.onclick = async () => {
            doBtn.disabled = true;
            doBtn.textContent = '更新中…';
            try {
                await callExtensionUpdate();
                doBtn.textContent = '完成，正在刷新…';
                setTimeout(() => location.reload(), 500);
            } catch (e) {
                doBtn.disabled = false;
                doBtn.textContent = '立即更新';
                const msg = e?.message || String(e);
                if (typeof toastr !== 'undefined') toastr.error(`更新失败：${msg}`);
                console.error(`[${EXT}] update failed`, e);
            }
        };
    }
    document.body.appendChild(overlay);
}

/* ---------- Root events ---------- */

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
            state.focusOtherId = null;
            if (state.tab === 'settings' && !state.updateInfo?.checked) checkForUpdates();
            renderManager();
            return;
        }
        if (action === 'clear-search') { state.query = ''; renderManager(); return; }
        if (action === 'clear-selection') {
            state.selected.clear();
            // In-place: uncheck all cards, remove selection hint, do not re-render
            const root = document.getElementById(ROOT_ID);
            if (root) {
                root.querySelectorAll('.pmp18-card.is-selected').forEach(c => c.classList.remove('is-selected'));
                root.querySelectorAll('input[data-action="select"]').forEach(i => { i.checked = false; });
                updateSelectionHint(root);
            }
            return;
        }
        if (action === 'select-group') {
            const ids = (target.dataset.ids || '').split('|').filter(Boolean);
            let allSelected = ids.length > 0 && ids.every(id => state.selected.has(String(id)));
            for (const id of ids) {
                const sid = String(id);
                if (allSelected) state.selected.delete(sid);
                else state.selected.add(sid);
            }
            // In-place update for current visible cards; if filter changes anything,
            // a re-render is required (cards outside the filter are not in the DOM).
            const root = document.getElementById(ROOT_ID);
            if (root) {
                for (const id of ids) {
                    const sid = String(id);
                    const card = root.querySelector(`.pmp18-card[data-persona-id="${CSS.escape(sid)}"]`);
                    if (card) {
                        card.classList.toggle('is-selected', state.selected.has(sid));
                        const cb = card.querySelector('input[data-action="select"]');
                        if (cb) cb.checked = state.selected.has(sid);
                    }
                }
                updateSelectionHint(root);
            }
            return;
        }
        if (action === 'compare-pair') {
            state.compareIds = [String(target.dataset.a), String(target.dataset.b)];
            state.baselineId = String(target.dataset.a);
            state.focusOtherId = String(target.dataset.b);
            state.selected.clear();
            renderManager();
            return;
        }
        if (action === 'compare-selected') {
            const ids = [...state.selected].map(String);
            if (ids.length < 2) return;
            state.compareIds = ids;
            state.baselineId = ids[0];
            state.focusOtherId = ids[1];
            state.selected.clear();
            renderManager();
            return;
        }
        if (action === 'exit-compare') {
            state.compareIds = [];
            state.baselineId = null;
            state.focusOtherId = null;
            renderManager();
            return;
        }
        if (action === 'set-baseline') {
            const id = String(target.dataset.id);
            state.baselineId = id;
            if (state.focusOtherId === id) {
                const other = state.compareIds.find(x => x !== id);
                if (other) state.focusOtherId = other;
            }
            renderManager();
            return;
        }
        if (action === 'set-focus-other') {
            state.focusOtherId = String(target.dataset.id);
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
            openFullEditor(String(target.dataset.id || ''));
            return;
        }
        if (action === 'delete-persona') {
            const id = String(target.dataset.id || '');
            const p = getPersonaData().find(x => x.id === id);
            const label = p ? `${p.name}${p.title ? `（${p.title}）` : ''}` : id;
            if (!window.confirm(`确定删除人设「${label}」？\nID: ${id}\n\n此操作会从酒馆数据中移除该 Persona（不可自动恢复）。`)) return;
            if (deletePersonaById(id)) {
                if (typeof toastr !== 'undefined') toastr.success(`已删除：${label}`);
                renderManager();
            } else if (typeof toastr !== 'undefined') {
                toastr.error('删除失败');
            }
            return;
        }
        if (action === 'check-update') {
            checkForUpdates();
            return;
        }
        if (action === 'show-update-modal') {
            if (!state.updateInfo?.changelog && !state.updateInfo?.checking) {
                checkForUpdates().then(() => showUpdateModal());
            } else showUpdateModal();
            return;
        }
    });

    root.addEventListener('change', event => {
        const input = event.target.closest('input[data-action="select"]');
        if (input) {
            const id = String(input.dataset.id || input.closest('[data-persona-id]')?.dataset?.personaId || '');
            if (!id) return;
            if (input.checked) state.selected.add(id);
            else state.selected.delete(id);
            // In-place update: avoid full re-render so scroll position is not reset
            // on mobile, and the checkbox does not "jump" to the top of the list.
            const card = input.closest('.pmp18-card');
            if (card) card.classList.toggle('is-selected', input.checked);
            updateSelectionHint(root);
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
    state.focusOtherId = null;
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
    state.focusOtherId = null;
    const root = document.getElementById(ROOT_ID);
    if (root) root.hidden = true;
    document.body.classList.remove('pmp18-open');
}

/* ---------- Entry ---------- */

function findEntryAnchor() {
    for (const id of ['persona-management-block', 'user-settings-block-content', 'user-settings-block']) {
        const node = document.getElementById(id);
        if (node) return { type: 'container', node, id };
    }
    const col = document.querySelector('.persona_management_left_column, .persona_management_global_settings');
    if (col) return { type: 'container', node: col };
    for (const el of document.querySelectorAll('h3,h2,h4,.inline-drawer-header')) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text === '用户设置' || text === 'User Settings' || text === '全局设置' || text === 'Global Settings') {
            return { type: 'heading', node: el };
        }
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
    console.warn(`[${EXT}] 浮动入口。也可 openPersonaManager()`);
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

    document.getElementById('persona-management-button')?.addEventListener('click', () => setTimeout(injectEntry, 200));
    document.getElementById('user-settings-button')?.addEventListener('click', () => setTimeout(injectEntry, 200));
}

function installKeyboardHandler() {
    if (window.__pmp18Keyboard) return;
    window.__pmp18Keyboard = true;
    document.addEventListener('keydown', event => {
        if (!state.active) return;
        if (event.key === 'Escape' && !document.querySelector('.pmp18-editor-overlay')) closeManager();
    });
}

async function init() {
    ensureRoot();
    installKeyboardHandler();
    installEntryObserver();
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
