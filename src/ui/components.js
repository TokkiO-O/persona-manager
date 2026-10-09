import { state } from '../state.js';
import { escapeHtml, normalizeText } from '../util.js';
import {
    getSameNameGroups, getExactDuplicateGroups, getSimilarPairs
} from '../similarity.js';
import { formatPersonaSubline, getActiveAvatarId } from '../persona-data.js';
import { renderTagChipsHtml, getTagsForPersona, getTagById } from '../tags.js';
import { getCategoriesForPersona, getCategoryDefs, getCategoryMap, getCategoryForPersona } from '../categories.js';

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
    const parts = [];
    const active = getActiveAvatarId();
    if (active && String(active) === String(persona.id)) {
        parts.push('<span class="pmp18-badge pmp18-badge-active">使用中</span>');
    }
    if (isInGroup(persona, getExactDuplicateGroups(all))) {
        parts.push('<span class="pmp18-badge pmp18-badge-danger">完全重复</span>');
    } else if (isInGroup(persona, getSameNameGroups(all))) {
        parts.push('<span class="pmp18-badge">同名</span>');
    }
    return parts.join('');
}

export function renderCard(persona, all) {
    const checked = state.selected.has(persona.id);
    const sub = formatPersonaSubline(persona);
    const dens = state.listDensity === 'compact';
    const maxLen = dens ? 64 : 120;
    const raw = String(persona.description || '').replace(/\s+/g, ' ').trim();
    const desc = raw
        ? escapeHtml(raw.slice(0, maxLen)) + (raw.length > maxLen ? '…' : '')
        : '<span class="pmp18-muted">暂无描述</span>';
    const id = escapeHtml(persona.id);
    const cats = getCategoriesForPersona(persona.id);
    const tagsHtml = renderTagChipsHtml(persona.id);
    const metaChips = [
        ...cats.map(c => `<span class="pmp18-meta-chip pmp18-meta-chip--cat">${escapeHtml(c.name)}</span>`),
        // tags already rendered as chips; keep one row
    ].join('');
    return `
        <article class="pmp18-card ${checked ? 'is-selected' : ''} density-${state.listDensity || 'comfy'}" data-persona-id="${id}">
            <label class="pmp18-check">
                <input type="checkbox" data-action="select" data-id="${id}" ${checked ? 'checked' : ''}>
            </label>
            ${renderAvatar(persona)}
            <div class="pmp18-card-main">
                <div class="pmp18-card-title-row">
                    <div class="pmp18-card-name">${escapeHtml(persona.name || '未命名')}</div>
                    ${statusBadge(persona, all)}
                </div>
                <div class="pmp18-card-sub" title="${escapeHtml(persona.title ? `备注：${persona.title}` : `ID：${persona.id}`)}">${escapeHtml(sub)}</div>
                ${(metaChips || tagsHtml) ? `<div class="pmp18-card-meta">${metaChips}${tagsHtml}</div>` : ''}
                <div class="pmp18-card-description">${desc}</div>
            </div>
            <div class="pmp18-card-actions">
                <button type="button" class="pmp18-icon-btn" data-action="organize-persona" data-id="${id}" title="分类与标签"><i class="fa-solid fa-bookmark"></i></button>
                <button type="button" class="pmp18-icon-btn" data-action="edit-full" data-id="${id}" title="编辑"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="pmp18-icon-btn pmp18-danger-icon" data-action="delete-persona" data-id="${id}" title="删除"><i class="fa-solid fa-trash"></i></button>
            </div>
        </article>`;
}

export function renderGroup(group, title, all) {
    const key = `g-${title}`;
    const folded = !!state.groupFold[key] && group.length > 4;
    const show = folded ? group.slice(0, 4) : group;
    return `<section class="pmp18-group">
        <div class="pmp18-group-head">
            <div>
                <div class="pmp18-group-title">${escapeHtml(title)}</div>
                <div class="pmp18-group-count">${group.length} 个</div>
            </div>
            <div class="pmp18-group-actions">
                <button type="button" class="pmp18-small-btn" data-action="select-group" data-ids="${group.map(p => escapeHtml(p.id)).join('|')}">全选</button>
                ${group.length > 4 ? `<button type="button" class="pmp18-small-btn" data-action="toggle-group-fold" data-key="${escapeHtml(key)}">${folded ? '展开全部' : '收起'}</button>` : ''}
            </div>
        </div>
        <div class="pmp18-group-grid">${show.map(p => renderCard(p, all)).join('')}</div>
    </section>`;
}

export function emptyState(title, text) {
    return `<div class="pmp18-empty"><div class="pmp18-empty-icon"><i class="fa-solid fa-users-viewfinder"></i></div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text || '换个关键词，或去「全部」看看')}</span></div>`;
}

export function searchMatch(persona, query) {
    const q = normalizeText(query);
    if (!q) return true;
    if (persona.nameKey?.includes(q) || persona.descriptionKey?.includes(q)) return true;
    if (normalizeText(persona.title || '').includes(q)) return true;
    if (normalizeText(persona.id || '').includes(q)) return true;
    return getTagsForPersona(persona.id).some(t => normalizeText(t.name).includes(q));
}

export function renderAllView(personas) {
    let filtered = personas.filter(p => searchMatch(p, state.query));
    let banner = '';
    if (state.filterTagId) {
        const t = getTagById(state.filterTagId);
        filtered = filtered.filter(p => getTagsForPersona(p.id).some(x => x.id === state.filterTagId));
        if (t) {
            banner = `<div class="pmp18-tag-filter-banner">
              <span class="pmp18-tag-chip" style="--pmp-tag:${t.color}">${escapeHtml(t.name)}</span>
              <span>下 <b>${filtered.length}</b> 人 · 仅摘要，点「编辑」看全文</span>
              <button type="button" class="pmp18-small-btn" data-action="clear-tag-filter">清除筛选</button>
            </div>`;
        }
    }
    return banner + (filtered.length
        ? `<div class="pmp18-card-grid">${filtered.map(p => renderCard(p, personas)).join('')}</div>`
        : emptyState(state.query ? '没有匹配的人设' : (state.filterTagId ? '该标签下没有人设' : '还没有 Persona'), state.query ? '换个关键词试试' : '在酒馆用户设定里创建后人设会出现在这里'));
}

export function renderSameNameView(personas) {
    const groups = getSameNameGroups(personas).map(g => g.filter(p => searchMatch(p, state.query))).filter(g => g.length > 1);
    return groups.length ? groups.map(g => renderGroup(g, g[0].name, personas)).join('') : emptyState('没有同名分组', '同名超过 1 个时会在这里聚合，方便去重');
}

export function renderDuplicateView(personas) {
    const groups = getExactDuplicateGroups(personas).map(g => g.filter(p => searchMatch(p, state.query))).filter(g => g.length > 1);
    return groups.length ? groups.map((g, i) => renderGroup(g, `重复组 ${i + 1}`, personas)).join('') : emptyState('没有完全重复', '描述文本完全一致的人设会显示在这里');
}

export function renderSimilarView(personas) {
    const q = normalizeText(state.query);
    const pairs = getSimilarPairs(personas).filter(({ a, b }) => !q || searchMatch(a, q) || searchMatch(b, q));
    if (!pairs.length) {
        return emptyState('没有高度相似', `当前阈值 ${Math.round(state.settings.similarityThreshold * 100)}% · 可在设置里调节`);
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

/** 分组：按分类折叠展示（默认收起） */
export function renderUnclassifiedView(personas) {
    const list = personas.filter(p => searchMatch(p, state.query));
    const defs = getCategoryDefs();
    const map = getCategoryMap();
    const buckets = [];
    defs.forEach(cat => {
        const items = list.filter(p => (map[p.id] || []).includes(cat.id));
        if (items.length) buckets.push({ key: cat.id, title: cat.name, items });
    });
    const uncat = list.filter(p => !(map[p.id] || []).length);
    if (uncat.length) buckets.push({ key: '_none', title: '未分类', items: uncat });
    if (!buckets.length) {
        return emptyState('暂无分组', '先在「分类」里建分类，再给人设指定分类');
    }
    return `<div class="pmp18-groups">${buckets.map(b => {
        const foldKey = `cat-${b.key}`;
        // 默认折叠：仅当显式设为 false 时展开
        const open = !!state.groupFold[foldKey]; // 默认收起，点一次展开
        return `<section class="pmp18-group ${open ? 'is-open' : 'is-folded'}">
          <button type="button" class="pmp18-group-head pmp18-group-toggle" data-action="toggle-group-fold" data-key="${escapeHtml(foldKey)}">
            <span class="pmp18-group-caret">${open ? '▼' : '▶'}</span>
            <div>
              <div class="pmp18-group-title">${escapeHtml(b.title)}</div>
              <div class="pmp18-group-count">${b.items.length} 个</div>
            </div>
          </button>
          ${open ? `<div class="pmp18-group-grid">${b.items.map(p => renderCard(p, personas)).join('')}</div>` : ''}
        </section>`;
    }).join('')}</div>`;
}
