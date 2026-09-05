import { state } from '../state.js';
import { escapeHtml } from '../util.js';
import { similarity } from '../similarity.js';
import {
    unorderedDiff, countPairStats, diffModeClass, shouldUseFragmentMode,
    extractSharedSnippets, renderFragmentCompare, renderFocusBlocks, renderCompareLegend
} from '../diff.js';
import { formatPersonaSubline } from '../persona-data.js';
import { renderAvatar, emptyState } from './components.js';

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
        return `<button type="button" class="pmp18-base-btn ${id === state.baselineId ? 'is-active' : ''}" data-action="set-baseline" data-id="${escapeHtml(id)}" title="${escapeHtml(sub)}">${renderAvatar(p)}<span class="pmp18-base-btn-meta"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(sub)}</small></span></button>`;
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

