/**
 * Persona Manager v1.4.0
 * SillyTavern third-party extension
 *
 * Native Persona data only. No aliases, no data mutation, no API/Extras.
 * v1.4: fast entry mounting, adaptive comparison workspace, diff summary,
 * synchronized scrolling, line/word/character level highlighting.
 */

import { power_user } from '../../../power-user.js';

const EXT = 'Persona Manager';
const VERSION = '1.7.1';
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

function splitCompareUnits(text) {
    const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) return [];
    const lines = normalized.split('\n');
    const units = [];
    for (const line of lines) {
        const value = line.trimEnd();
        if (!value.trim()) {
            units.push('');
            continue;
        }
        // Persona 描述通常是“字段/条目”式文本。只有超长单行才进一步按句子拆分，
        // 避免因为原始条目顺序变化而被错误地判定成删除+新增。
        if (value.length > 140) {
            const pieces = value.split(/(?<=[。！？.!?；;])\s+/u).filter(Boolean);
            if (pieces.length > 1) units.push(...pieces);
            else units.push(value);
        } else {
            units.push(value);
        }
    }
    return units;
}

function unitSimilarity(a, b) {
    const x = normalizeText(a);
    const y = normalizeText(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const shorter = Math.min(x.length, y.length);
    const longer = Math.max(x.length, y.length);
    if (!shorter || shorter / longer < 0.12) return 0;
    return similarity(x, y);
}

function compareUnordered(aText, bText) {
    const aUnits = splitCompareUnits(aText);
    const bUnits = splitCompareUnits(bText);
    const usedB = new Set();
    const rows = [];

    // 先精确匹配，完全忽略原始顺序。
    const exactMap = new Map();
    bUnits.forEach((unit, index) => {
        const key = normalizeText(unit);
        if (!exactMap.has(key)) exactMap.set(key, []);
        exactMap.get(key).push(index);
    });

    const unmatchedA = [];
    for (let ai = 0; ai < aUnits.length; ai++) {
        const key = normalizeText(aUnits[ai]);
        const candidates = exactMap.get(key) || [];
        const bi = candidates.find(index => !usedB.has(index));
        if (bi !== undefined) {
            usedB.add(bi);
            rows.push({ a: aUnits[ai], b: bUnits[bi], type: 'same', score: 1, ai, bi });
        } else {
            unmatchedA.push(ai);
        }
    }

    // 再对剩余条目做“无序最佳匹配”。这样“同一字段但内容修改”会作为修改，
    // 而不会因为字段位置不同被判成 A 独有 / B 独有。
    for (const ai of unmatchedA) {
        let best = -1;
        let bestScore = 0;
        for (let bi = 0; bi < bUnits.length; bi++) {
            if (usedB.has(bi)) continue;
            const score = unitSimilarity(aUnits[ai], bUnits[bi]);
            if (score > bestScore) {
                bestScore = score;
                best = bi;
            }
        }
        if (best >= 0 && bestScore >= 0.30) {
            usedB.add(best);
            const left = aUnits[ai];
            const right = bUnits[best];
            const pieces = inlineDiff(left, right);
            rows.push({
                a: pieces.map(part => part.left).join(''),
                b: pieces.map(part => part.right).join(''),
                type: 'replace',
                score: bestScore,
                ai,
                bi: best,
            });
        } else {
            rows.push({ a: escapeHtml(aUnits[ai]), b: '', type: 'remove', score: 0, ai, bi: -1 });
        }
    }

    // B 中尚未匹配的内容是 B 独有。排序按 B 原始位置，便于阅读。
    for (let bi = 0; bi < bUnits.length; bi++) {
        if (usedB.has(bi)) continue;
        rows.push({ a: '', b: escapeHtml(bUnits[bi]), type: 'add', score: 0, ai: -1, bi });
    }

    // 以 A 的原始顺序为主，新增项放在对应的 B 顺序区域；最重要的是匹配本身不再依赖位置。
    rows.sort((x, y) => {
        const xa = x.ai >= 0 ? x.ai : Number.MAX_SAFE_INTEGER;
        const ya = y.ai >= 0 ? y.ai : Number.MAX_SAFE_INTEGER;
        if (xa !== ya) return xa - ya;
        return (x.bi ?? Number.MAX_SAFE_INTEGER) - (y.bi ?? Number.MAX_SAFE_INTEGER);
    });
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

function renderComparePair(a, b, pairIndex, totalPairs) {
    const score = similarity(a.description, b.description);
    const rows = compareUnordered(a.description, b.description);
    const counts = countChanges(rows);
    const total = Math.max(rows.length, 1);
    const commonPct = Math.round((counts.common / total) * 100);
    const mode = diffMode(score);

    return `
        <section class="pmp14-multi-pair ${mode.key}" data-compare-pair="${pairIndex}">
            <div class="pmp14-multi-pair-head">
                <div class="pmp14-pair-label"><strong>比较 ${pairIndex + 1}${totalPairs > 1 ? ` / ${totalPairs}` : ''}</strong><span>基准 Persona ↔ 对比 Persona</span></div>
                <div class="pmp14-pair-score"><b>${Math.round(score * 100)}%</b><span>描述相似度</span></div>
                <div class="pmp14-pair-metrics"><span>共同 ${commonPct}%</span><span>修改 ${counts.changed}</span><span>A 独有 ${counts.onlyA}</span><span>B 独有 ${counts.onlyB}</span></div>
            </div>
            <div class="pmp14-compare-panels">
                <section class="pmp14-side-panel" data-scroll="compare" data-scroll-group="${pairIndex}">
                    <header>${renderAvatar(a, true)}<div><strong>${escapeHtml(a.name)}</strong><span>ID：${escapeHtml(a.id)}</span></div><em>A 基准</em></header>
                    <div class="pmp14-diff-body">${rows.map((row, i) => `<div class="pmp14-diff-row ${row.type}" data-row="${i}"><span class="pmp14-line-no">${i + 1}</span><code>${row.a || '<span class="pmp14-placeholder">—</span>'}</code></div>`).join('')}</div>
                </section>
                <div class="pmp14-diff-rail">${rows.map((row, i) => `<button class="${row.type}" data-action="jump-row" data-row="${i}" data-group="${pairIndex}" title="${row.type}">${row.type === 'same' ? '=' : row.type === 'replace' ? '≠' : row.type === 'remove' ? '−' : '+'}</button>`).join('')}</div>
                <section class="pmp14-side-panel" data-scroll="compare" data-scroll-group="${pairIndex}">
                    <header>${renderAvatar(b, true)}<div><strong>${escapeHtml(b.name)}</strong><span>ID：${escapeHtml(b.id)}</span></div><em>B 对比</em></header>
                    <div class="pmp14-diff-body">${rows.map((row, i) => `<div class="pmp14-diff-row ${row.type}" data-row="${i}"><span class="pmp14-line-no">${i + 1}</span><code>${row.b || '<span class="pmp14-placeholder">—</span>'}</code></div>`).join('')}</div>
                </section>
            </div>
        </section>`;
}


function normalizeText(text) {
    return String(text || '').replace(/\r\n/g, '\n').trim();
}
function getPersonaDescription(id) {
    const d = (power_user.persona_descriptions || {})[id];
    return typeof d === 'string' ? d : (d?.description || '');
}
function personaById(id) {
    return getAllPersonas().find(p => p.avatarId === id);
}
function splitUnits(text) {
    return normalizeText(text).split(/\n+|(?<=[。！？.!?；;])/).map(s => s.trim()).filter(Boolean);
}
function unitSimilarity(a,b) {
    a=normalizeText(a); b=normalizeText(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A=new Set(a.split(/\s+/)), B=new Set(b.split(/\s+/));
    const inter=[...A].filter(x=>B.has(x)).length;
    return inter/Math.max(1,new Set([...A,...B]).size);
}
function unorderedDiff(a,b) {
    const A=splitUnits(a), B=splitUnits(b), used=new Set(), rows=[];
    for (const x of A) {
        let bi=-1, bs=0;
        B.forEach((y,i)=>{ if(!used.has(i)){const s=unitSimilarity(x,y);if(s>bs){bs=s;bi=i;}}});
        if (bi>=0 && bs>=0.72) {
            used.add(bi);
            rows.push({type:x===B[bi]?'same':'modified',a:x,b:B[bi]});
        } else rows.push({type:'a-only',a:x,b:''});
    }
    B.forEach((x,i)=>{if(!used.has(i)) rows.push({type:'b-only',a:'',b:x});});
    return rows;
}
function renderDiffRow(r) {
    if(r.type==='same') return `<div class="pmp17-row same">${escapeHtml(r.a)}</div>`;
    if(r.type==='modified') return `<div class="pmp17-row modified"><span class="pmp17-old">${escapeHtml(r.a)}</span><span class="pmp17-arrow"> → </span><span class="pmp17-new">${escapeHtml(r.b)}</span></div>`;
    if(r.type==='a-only') return `<div class="pmp17-row a-only"><span class="pmp17-old">${escapeHtml(r.a)}</span></div>`;
    return `<div class="pmp17-row b-only"><span class="pmp17-new">${escapeHtml(r.b)}</span></div>`;
}
function savePersonaDescription(id, description) {
    const all = power_user.persona_descriptions || (power_user.persona_descriptions = {});
    const old = all[id];
    all[id] = (old && typeof old === 'object') ? {...old, description} : {description};
    try {
        const ctx = typeof getContext === 'function' ? getContext() : null;
        const fn = ctx?.saveSettingsDebounced || window.saveSettingsDebounced;
        if (typeof fn === 'function') fn();
    } catch {}
    try {
        if (typeof eventSource?.emit === 'function' && event_types?.PERSONA_CHANGED) eventSource.emit(event_types.PERSONA_CHANGED);
    } catch {}
}
function openPersonaEditor17(id, refresh) {
    const p=personaById(id); if(!p) return;
    document.querySelector('.pmp17-editor')?.remove();
    const el=document.createElement('div');
    el.className='pmp17-editor';
    el.innerHTML=`<div class="pmp17-editor-box">
      <div class="pmp17-editor-head"><b>编辑 Persona：${escapeHtml(p.displayName)}</b><button class="menu_button pmp17-close">×</button></div>
      <div class="pmp17-editor-id">${escapeHtml(p.avatarId)}</div>
      <textarea class="text_pole pmp17-text"></textarea>
      <div class="pmp17-actions"><button class="menu_button pmp17-cancel">取消</button><button class="menu_button pmp17-save">保存并重新比较</button></div>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('textarea').value=getPersonaDescription(id);
    const close=()=>el.remove();
    el.querySelector('.pmp17-close').onclick=close;
    el.querySelector('.pmp17-cancel').onclick=close;
    el.querySelector('.pmp17-save').onclick=()=>{savePersonaDescription(id,el.querySelector('textarea').value);close();refresh?.();};
}
function renderCompareWorkspace(personas) {
    const ids=state.compareIds?.length ? state.compareIds : personas.map(p=>p.avatarId);
    const baseId=state.baselineId && ids.includes(state.baselineId) ? state.baselineId : ids[0];
    state.baselineId=baseId;
    const ps=ids.map(personaById).filter(Boolean), base=personaById(baseId);
    if(!base || ps.length<2) return '<div class="pmp-empty">至少选择 2 个 Persona。</div>';
    const others=ps.filter(p=>p.avatarId!==baseId);
    return `<div class="pmp17-compare">
      <div class="pmp17-toolbar"><b>当前基准：</b>${ps.map(p=>`<button class="menu_button pmp17-base ${p.avatarId===baseId?'active':''}" data-pmp17-base="${escapeHtml(p.avatarId)}">${escapeHtml(p.displayName)}</button>`).join('')}</div>
      <div class="pmp17-originals">
        <div><h4>${escapeHtml(base.displayName)} · 完整描述</h4><pre>${escapeHtml(getPersonaDescription(base.avatarId))||'（无描述）'}</pre></div>
        ${others.map(p=>`<div><h4>${escapeHtml(p.displayName)} · 完整描述 <button class="menu_button pmp17-edit" data-pmp17-edit="${escapeHtml(p.avatarId)}">编辑</button></h4><pre>${escapeHtml(getPersonaDescription(p.avatarId))||'（无描述）'}</pre></div>`).join('')}
      </div>
      ${others.map(p=>`<section class="pmp17-pair"><div class="pmp17-pair-title">${escapeHtml(base.displayName)} ↔ ${escapeHtml(p.displayName)}</div><div class="pmp17-diff">${unorderedDiff(getPersonaDescription(base.avatarId),getPersonaDescription(p.avatarId)).map(renderDiffRow).join('')}</div></section>`).join('')}
    </div>`;
}
function installCompareHandlers17() {
    if(window.__pmp17Handlers)return;
    window.__pmp17Handlers=true;
    document.addEventListener('click',e=>{
        const b=e.target.closest?.('[data-pmp17-base]');
        if(b){state.baselineId=b.dataset.pmp17Base;renderManager();return;}
        const ed=e.target.closest?.('[data-pmp17-edit]');
        if(ed) openPersonaEditor17(ed.dataset.pmp17Edit,()=>renderManager());
    });
}

function findGlobalSettingsHeading17() {
    const elements = document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,.inline-drawer-header,.menu_section_header,.setting-item-label,div,span');
    for (const el of elements) {
        if (el.dataset?.pmp171 === 'entry') continue;
        if (el.children.length > 3) continue;
        const text = el.textContent?.trim();
        if (text !== '全局设置') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        return el;
    }
    return null;
}
function makeEntry17() {
    const b = document.createElement('button');
    b.id = 'persona-manager-entry';
    b.type = 'button';
    b.className = 'menu_button pmp17-entry';
    b.dataset.pmp171 = 'entry';
    b.innerHTML = '<i class="fa-solid fa-users-viewfinder"></i><span>Persona Manager</span><small>管理 / 对比 / 重复检测</small>';
    b.addEventListener('click', () => openManager('all'));
    return b;
}
function injectEntry17() {
    if (document.getElementById('persona-manager-entry')) return true;
    const heading = findGlobalSettingsHeading17();
    if (!heading?.parentNode) return false;
    heading.parentNode.insertBefore(makeEntry17(), heading);
    return true;
}
function installEntryObserver17() {
    if (window.__pmp171EntryObserver) return;
    const observer = new MutationObserver(() => {
        if (injectEntry17()) {
            observer.disconnect();
            window.__pmp171EntryObserver = null;
        }
    });
    window.__pmp171EntryObserver = observer;
    observer.observe(document.body, { childList: true, subtree: true });
    if (injectEntry17()) {
        observer.disconnect();
        window.__pmp171EntryObserver = null;
    }
}

async function checkForUpdate17() {
    const box = document.querySelector('#pmp17-update-box');
    if (!box) return;
    box.classList.remove('available','error');
    box.querySelector('.pmp17-update-text').textContent = '正在检查新版本…';
    try {
        const r = await fetch('https://raw.githubusercontent.com/xingx121/persona-manager/main/manifest.json', {cache:'no-store'});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const remote = await r.json();
        const rv = String(remote.version || '');
        if (rv && rv !== VERSION) {
            box.classList.add('available');
            box.dataset.remoteVersion = rv;
            box.querySelector('.pmp17-update-text').innerHTML =
                `<b>发现新版本 ${escapeHtml(rv)}</b><br><span>${escapeHtml(remote.description || 'Persona Manager 更新')}</span>`;
            const btn = box.querySelector('.pmp17-update-action');
            btn.textContent = '更新';
            btn.disabled = false;
        } else {
            box.querySelector('.pmp17-update-text').textContent = `已是最新版本（${VERSION}）`;
            box.querySelector('.pmp17-update-action').textContent = '检查更新';
        }
    } catch (e) {
        box.classList.add('error');
        box.querySelector('.pmp17-update-text').textContent = '暂时无法检查更新，请确认网络连接。';
        box.querySelector('.pmp17-update-action').textContent = '重试';
    }
}
function installUpdateUI17() {
    if (document.querySelector('#pmp17-update-box')) return;
    const root = document.querySelector('#persona-manager-root, .pmp-manager-root, #persona-manager-modal');
    if (!root) return;
    const box = document.createElement('div');
    box.id = 'pmp17-update-box';
    box.innerHTML = `<div class="pmp17-update-text">检查 Persona Manager 更新…</div>
        <button type="button" class="menu_button pmp17-update-action">检查更新</button>`;
    root.prepend(box);
    box.querySelector('button').addEventListener('click', async () => {
        const rv = box.dataset.remoteVersion;
        if (!rv || rv === VERSION) return checkForUpdate17();
        // Let the extension manager perform the actual installation. We do not
        // alter other extensions or rewrite its DOM.
        if (typeof window.updateExtension === 'function') {
            box.querySelector('button').disabled = true;
            box.querySelector('.pmp17-update-text').textContent = `正在更新到 ${rv}…`;
            try {
                await window.updateExtension('persona-manager');
                setTimeout(() => location.reload(), 1200);
            } catch (e) {
                box.querySelector('button').disabled = false;
                box.querySelector('.pmp17-update-text').textContent = `更新失败：${e?.message || e}`;
            }
        } else {
            box.querySelector('.pmp17-update-text').innerHTML =
                `发现 ${escapeHtml(rv)}，请在「管理扩展」中更新。更新完成后页面会自动刷新。`;
        }
    });
    checkForUpdate17();
}


function installUpdateUiObserver17() {
    if (window.__pmp171UpdateObserver) return;
    const observer = new MutationObserver(() => installUpdateUI17());
    window.__pmp171UpdateObserver = observer;
    observer.observe(document.body, {childList:true, subtree:true});
    installUpdateUI17();
}


function startSelfVersionWatcher17() {
    if (window.__pmp171VersionWatcher) return;
    let last = VERSION;
    window.__pmp171VersionWatcher = setInterval(async () => {
        try {
            const r = await fetch('https://raw.githubusercontent.com/xingx121/persona-manager/main/manifest.json', {cache:'no-store'});
            if (!r.ok) return;
            const remote = await r.json();
            const rv = String(remote.version || '');
            if (rv && rv !== last && rv !== VERSION) {
                clearInterval(window.__pmp171VersionWatcher);
                location.reload();
            }
        } catch {}
    }, 15000);
}

async function init() {
    ensureRoot();
    installKeyboardHandler();
    installCompareHandlers17();
    installEntryObserver17();
    installUpdateUiObserver17();
    startSelfVersionWatcher17();
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
