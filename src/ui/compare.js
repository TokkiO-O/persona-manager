import { state } from '../state.js';
import { escapeHtml } from '../util.js';
import { similarity } from '../similarity.js';
import {
    unorderedDiff, countPairStats, diffModeClass, shouldUseFragmentMode,
    isShortText, extractSharedSnippets, renderFragmentCompare, renderFocusBlocks, renderCompareLegend
} from '../diff.js';
import { formatPersonaSubline } from '../persona-data.js';
import { renderAvatar, emptyState } from './components.js';
import { renderManagerContent } from './render.js';

// v1.9.15: renderCompareWorkspace now uses sticky top + bottom strips
// and the diff body sits between them. The view mode (stacked / side) is
// controlled by state.viewMode (null = auto by width).
export function renderCompareWorkspace(personas) {
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
    const shortMode = isShortText(base.description, other.description);
    const fragmentMode = shouldUseFragmentMode(base.description, other.description, score);
    const stats = fragmentMode
        ? { same: extractSharedSnippets(base.description, other.description, { shortMode }).length, replace: 0, remove: 0, add: 0 }
        : countPairStats(unorderedDiff(base.description, other.description));
    const mode = diffModeClass(score);
    const showDiffOnly = state.settings.showDiffOnly;
    const frag = fragmentMode ? renderFragmentCompare(base.description, other.description, { shortMode }) : null;

    const baseBody = fragmentMode
        ? frag.baseHtml
        : renderFocusBlocks(base.description, other.description, 'base', showDiffOnly, { shortMode });
    const otherBody = fragmentMode
        ? frag.otherHtml
        : renderFocusBlocks(base.description, other.description, 'other', showDiffOnly, { shortMode });

    const metaLine = fragmentMode
        ? `${Math.round(score * 100)}% · ${shortMode ? '短人设' : '跨结构'}模式 · 共同片段 ${stats.same}`
        : `${Math.round(score * 100)}% · 同 ${stats.same} · 改 ${stats.replace} · 仅基准 ${stats.remove} · 仅对方 ${stats.add}`;

    // baseline cards (click to set baseline, dblclick to edit)
    const baselineCards = ids.map(id => {
        const p = personas.find(x => x.id === id);
        if (!p) return '';
        const sub = formatPersonaSubline(p);
        return `<button type="button" class="pmp18-base-card ${id === state.baselineId ? 'is-active' : ''}" data-action="set-baseline" data-id="${escapeHtml(id)}" data-dblaction="edit-full" data-id2="${escapeHtml(id)}" title="${escapeHtml(p.name)} · ${escapeHtml(sub)} · 双击编辑">
            ${renderAvatar(p)}
            <span class="pmp18-base-card-meta"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(sub)}</small></span>
        </button>`;
    }).join('');

    // object cards (click = focus, dblclick = edit)
    const objectCards = others.map(id => {
        const p = personas.find(x => x.id === id);
        if (!p) return '';
        const sc = Math.round(similarity(base.description, p.description) * 100);
        const on = id === state.focusOtherId;
        const sub = formatPersonaSubline(p);
        return `<button type="button" class="pmp18-obj-card ${on ? 'is-active' : ''}" data-action="set-focus-other" data-id="${escapeHtml(id)}" data-dblaction="edit-full" data-id2="${escapeHtml(id)}" title="${escapeHtml(p.name)} · ${escapeHtml(sub)} · 双击编辑">
            ${renderAvatar(p)}
            <span class="pmp18-obj-card-meta"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(sub)} · ${sc}%</small></span>
        </button>`;
    }).join('');

    // diff metadata strip (compact, sits above the body)
    const detailMeta = `
        <div class="pmp18-detail-meta">
            <div class="pmp18-detail-pair">
                <span class="pmp18-muted">基准</span>
                <strong>${escapeHtml(base.name)}</strong>
                <span class="pmp18-muted">${escapeHtml(formatPersonaSubline(base))}</span>
            </div>
            <span class="pmp18-detail-vs">↔</span>
            <div class="pmp18-detail-pair">
                <span class="pmp18-muted">对方</span>
                <strong>${escapeHtml(other.name)}</strong>
                <span class="pmp18-muted">${escapeHtml(formatPersonaSubline(other))}</span>
            </div>
            <span class="pmp18-detail-score">${metaLine}</span>
        </div>`;

    return `
        <div class="pmp18-compare-workspace ${state.viewMode ? `is-${state.viewMode}` : ''}">
            <div class="pmp18-compare-topbar">
                <button type="button" class="pmp18-back-btn" data-action="exit-compare"><i class="fa-solid fa-arrow-left"></i> 返回</button>
                <div class="pmp18-compare-title">
                    <strong>对比</strong>
                    <span>点选对象卡切对比 · 双击编辑 · 基准/对象栏始终在屏</span>
                </div>
                <div class="pmp18-compare-tools">
                    <button type="button" class="pmp18-small-btn ${state.showToc ? 'is-on' : ''}" data-action="toggle-toc" title="目录与搜索"><i class="fa-solid fa-list"></i></button>
                    ${fragmentMode ? '' : `<button type="button" class="pmp18-small-btn ${showDiffOnly ? 'is-on' : ''}" data-action="toggle-diff-only">只看差异</button>`}
                    <button type="button" class="pmp18-small-btn" data-action="set-view-mode" data-mode="${state.viewMode === 'side' ? 'stacked' : 'side'}" title="切换上下/左右">${state.viewMode === 'side' ? '↕ 上下' : '↔ 左右'}</button>
                    <button type="button" class="pmp18-small-btn" data-action="edit-full" data-id="${escapeHtml(base.id)}">编辑基准</button>
                    <button type="button" class="pmp18-small-btn" data-action="edit-full" data-id="${escapeHtml(other.id)}">编辑对方</button>
                </div>
            </div>

            <div class="pmp18-baseline-strip">
                <span class="pmp18-strip-label">基准</span>
                <div class="pmp18-baseline-scroll">${baselineCards}</div>
            </div>

            ${detailMeta}

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

            <div class="pmp18-objects-strip">
                <span class="pmp18-strip-label">对象</span>
                <div class="pmp18-objects-scroll">${objectCards}</div>
            </div>

            ${renderCompareLegend(fragmentMode, shortMode)}
            ${fragmentMode ? frag.sharePanel : ''}

            ${renderTocPanel(fragmentMode, shortMode, base.description, other.description)}
        </div>`;
}

// Build the optional table-of-contents panel. Drawn into the DOM but hidden
// by CSS unless state.showToc is true. Search input lives here.
function renderTocPanel(fragmentMode, shortMode, baseText, otherText) {
    if (!state.showToc) return '';
    const query = String(state.tocQuery || '').trim().toLowerCase();

    let listHtml = '';
    if (fragmentMode) {
        const shared = extractSharedSnippets(baseText, otherText, { shortMode });
        const filtered = query
            ? shared.filter(s => s.toLowerCase().includes(query))
            : shared;
        listHtml = filtered.length
            ? `<div class="pmp18-toc-chips">${filtered.map((s, i) => `<span class="pmp18-toc-chip" data-toc-jump="share-${i}">${escapeHtml(s)}</span>`).join('')}</div>`
            : `<div class="pmp18-muted">${query ? '无匹配片段' : '无共同片段'}</div>`;
    } else {
        const rows = unorderedDiff(baseText, otherText);
        const filtered = query
            ? rows.filter(r => (String(r.a || '') + ' ' + String(r.b || '')).toLowerCase().includes(query))
            : rows;
        const items = filtered.slice(0, 60).map((r, i) => {
            const t = r.type;
            const label = t === 'same' ? '同' : t === 'replace' ? '改' : t === 'remove' ? '仅基准' : t === 'add' ? '仅对方' : t;
            const preview = String(r.a || r.b || '').replace(/\s+/g, ' ').slice(0, 28);
            return `<button type="button" class="pmp18-toc-item pmp18-toc-${t}" data-toc-jump="row-${i}"><span class="pmp18-toc-badge">${label}</span><span class="pmp18-toc-preview">${escapeHtml(preview)}</span></button>`;
        });
        listHtml = items.length
            ? items.join('')
            : `<div class="pmp18-muted">${query ? '无匹配段' : '无段落'}</div>`;
        if (filtered.length > 60) listHtml += `<div class="pmp18-muted" style="padding:6px">仅显示前 60 条（共 ${filtered.length} 条）</div>`;
    }
    return `
        <aside class="pmp18-toc-panel">
            <div class="pmp18-toc-head">
                <input type="search" id="pmp18-toc-search" class="pmp18-toc-search" placeholder="搜索段/片段…" value="${escapeHtml(state.tocQuery || '')}" data-pmp18-keep-focus="toc" autocomplete="off">
                <button type="button" class="pmp18-small-btn" data-action="close-toc"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="pmp18-toc-body">${listHtml}</div>
        </aside>`;
}
