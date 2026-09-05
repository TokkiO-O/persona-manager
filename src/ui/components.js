import { state } from '../state.js';
import { escapeHtml, normalizeText } from '../util.js';
import {
    getSameNameGroups, getExactDuplicateGroups, getSimilarPairs, similarity
} from '../similarity.js';
import { formatPersonaSubline } from '../persona-data.js';

export function personaImageUrl(id) {
    if (!id) return '';
    return `/thumbnail?type=persona&file=${encodeURIComponent(id)}`;
}

export function renderAvatar(persona) {
    const url = personaImageUrl(persona.id);
    return url
        ? `<img class="pmp18-avatar" src="${escapeHtml(url)}" alt="" loading="lazy">`
        : `<div class="pmp18-avatar pmp18-avatar-fallback"><i class="fa-solid fa-user"></i></div>`;
}

function isInGroup(persona, groups) {
    return groups.some(g => g.some(item => item.id === persona.id));
}

export function statusBadge(persona, all) {
    if (isInGroup(persona, getExactDuplicateGroups(all))) return '<span class="pmp18-badge pmp18-badge-danger">完全重复</span>';
    if (isInGroup(persona, getSameNameGroups(all))) return '<span class="pmp18-badge">同名</span>';
    return '';
}

export function renderCard(persona, all) {
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

export function renderGroup(group, title, all) {
    return `
        <section class="pmp18-group">
            <div class="pmp18-group-head">
                <div><div class="pmp18-group-title">${escapeHtml(title)}</div><div class="pmp18-group-count">${group.length} 个</div></div>
                <button class="pmp18-small-btn" type="button" data-action="select-group" data-ids="${escapeHtml(group.map(x => x.id).join('|'))}">全选</button>
            </div>
            <div class="pmp18-group-grid">${group.map(p => renderCard(p, all)).join('')}</div>
        </section>`;
}

export function emptyState(title, text) {
    return `<div class="pmp18-empty"><i class="fa-solid fa-magnifying-glass"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text || '')}</span></div>`;
}

export function searchMatch(persona, query) {
    const q = normalizeText(query);
    return !q || persona.nameKey.includes(q) || persona.descriptionKey.includes(q);
}

export function renderAllView(personas) {
    const filtered = personas.filter(p => searchMatch(p, state.query));
    return filtered.length
        ? `<div class="pmp18-card-grid">${filtered.map(p => renderCard(p, personas)).join('')}</div>`
        : emptyState(state.query ? '没有匹配' : '没有 Persona', '');
}

export function renderSameNameView(personas) {
    const groups = getSameNameGroups(personas).map(g => g.filter(p => searchMatch(p, state.query))).filter(g => g.length > 1);
    return groups.length ? groups.map(g => renderGroup(g, g[0].name, personas)).join('') : emptyState('没有同名', '');
}

export function renderDuplicateView(personas) {
    const groups = getExactDuplicateGroups(personas).map(g => g.filter(p => searchMatch(p, state.query))).filter(g => g.length > 1);
    return groups.length ? groups.map((g, i) => renderGroup(g, `重复组 ${i + 1}`, personas)).join('') : emptyState('没有完全重复', '');
}

export function renderSimilarView(personas) {
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
