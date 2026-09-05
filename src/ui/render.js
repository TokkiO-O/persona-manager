import { EXT, VERSION, ROOT_ID } from '../constants.js';
import { state, saveSettingsLocal } from '../state.js';
import { escapeHtml } from '../util.js';
import {
    getPersonaData, deletePersonaById, confirmDeletePersona
} from '../persona-data.js';
import {
    getSameNameGroups, getExactDuplicateGroups, getSimilarPairs
} from '../similarity.js';
import { checkForUpdates, showUpdateModal } from '../update.js';
import {
    renderAllView, renderSameNameView, renderDuplicateView, renderSimilarView, renderCard
} from './components.js';
import { renderCompareWorkspace } from './compare.js';
import { openFullEditor } from './editor.js';

export function tabButton(key, label, icon, count) {
    const extra = key === 'settings' && state.updateInfo?.available
        ? '<em class="pmp18-new">NEW</em>'
        : (typeof count === 'number' ? `<em>${count}</em>` : '');
    return `<button class="pmp18-tab ${state.tab === key ? 'is-active' : ''}" type="button" data-action="tab" data-tab="${key}"><i class="fa-solid ${icon}"></i><span>${label}</span>${extra}</button>`;
}

export function renderSettingsPanel() {
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
                <div class="pmp18-muted" style="word-break:break-all;font-size:11px">${escapeHtml(String(upd.message || '网络错误'))}</div>
                <div class="pmp18-muted" style="font-size:11px;margin-top:4px">${escapeHtml(String(upd.hint || '扩展可正常使用；请到 GitHub 手动下载覆盖。'))}</div>
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

export function renderManagerContent(personas) {
    if (state.tab === 'settings') return renderSettingsPanel();
    if (state.tab === 'all') return renderAllView(personas);
    if (state.tab === 'same-name') return renderSameNameView(personas);
    if (state.tab === 'duplicates') return renderDuplicateView(personas);
    return renderSimilarView(personas);
}

/** In-place update of the bottom selection hint. No full re-render, so the
 *  page never scrolls. Insert the bar if missing, remove it if no longer needed. */
export function updateSelectionHint(root) {
    if (!root) return;
    const windowEl = root.querySelector('.pmp18-window');
    if (!windowEl) return;
    let bar = windowEl.querySelector('.pmp18-selection-bar');
    const n = state.selected.size;
    const html = n >= 2
        ? `<div class="pmp18-selection-bar">
            <div><strong>已选 ${n} 个</strong><span>对比时一次细比一个对方，可切换</span></div>
            <button class="pmp18-primary-btn" data-action="compare-selected">开始对比</button>
            <button class="pmp18-small-btn pmp18-danger-btn" data-action="delete-selected">删除所选</button>
            <button class="pmp18-small-btn" data-action="clear-selection">清除</button>
           </div>`
        : n === 1
            ? `<div class="pmp18-selection-bar"><div><strong>已选 1 个</strong><span>可再选以对比，或直接删除</span></div>
            <button class="pmp18-small-btn pmp18-danger-btn" data-action="delete-selected">删除所选</button>
            <button class="pmp18-small-btn" data-action="clear-selection">清除</button></div>`
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

// rAF-coalesced render: many events in the same frame collapse to one render.
// Critical for native persona dropdown opening (PERSONA_UPDATED may fire a
// burst of events when ST refreshes its UI).
let _renderScheduled = false;
export function scheduleRender() {
    if (_renderScheduled) return;
    _renderScheduled = true;
    requestAnimationFrame(() => {
        _renderScheduled = false;
        renderManager();
    });
}

export function renderManager() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    try {
        renderManagerInner();
    } catch (e) {
        // Render errors must NEVER leave the manager in a half-rendered state
        // (frozen page, no UI, body scroll locked). Fall back to a minimal
        // error screen so the user can close it.
        console.error(`[${EXT}] render failed`, e);
        try {
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
                    <main class="pmp18-content" style="padding:24px">
                        <div class="pmp18-empty" style="min-height:200px;text-align:left;align-items:flex-start">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <strong>渲染失败</strong>
                            <span style="font-size:12px;opacity:.6;white-space:pre-wrap">${escapeHtml((e && e.stack) || String(e))}</span>
                            <button class="pmp18-primary-btn" data-action="close" style="margin-top:8px">关闭</button>
                        </div>
                    </main>
                </section>`;
        } catch (_) {
            // Last resort: blank the root and restore body scroll
            root.innerHTML = '';
            document.body.classList.remove('pmp18-open');
        }
    }
}

export function renderManagerInner() {
    const root = document.getElementById(ROOT_ID);
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
            <button class="pmp18-small-btn pmp18-danger-btn" data-action="delete-selected">删除所选</button>
            <button class="pmp18-small-btn" data-action="clear-selection">清除</button>
           </div>`
        : state.selected.size === 1
            ? `<div class="pmp18-selection-bar"><div><strong>已选 1 个</strong><span>可再选以对比，或直接删除</span></div>
            <button class="pmp18-small-btn pmp18-danger-btn" data-action="delete-selected">删除所选</button>
            <button class="pmp18-small-btn" data-action="clear-selection">清除</button></div>`
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


/* ---------- Root events ---------- */

export function ensureRoot() {
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
            (async () => {
                const ok = await confirmDeletePersona(label, id);
                if (!ok) return;
                try {
                    const done = await deletePersonaById(id);
                    if (done) {
                        if (typeof toastr !== 'undefined') toastr.success(`已删除：${label}`);
                    } else if (typeof toastr !== 'undefined') {
                        toastr.error('删除失败');
                    }
                } catch (e) {
                    console.error(e);
                    if (typeof toastr !== 'undefined') toastr.error(`删除失败：${e?.message || e}`);
                } finally {
                    // Always keep manager open and refresh list
                    state.active = true;
                    ensureRoot();
                    const root = document.getElementById(ROOT_ID);
                    if (root) {
                        root.hidden = false;
                        document.body.classList.add('pmp18-open');
                    }
                    renderManager();
                }
            })();
            return;
        }
        if (action === 'delete-selected') {
            const ids = [...state.selected].map(String);
            if (!ids.length) return;
            (async () => {
                const label = `已选 ${ids.length} 个人设`;
                const ok = await confirmDeletePersona(label, ids.slice(0, 5).join(', ') + (ids.length > 5 ? '…' : ''));
                if (!ok) return;
                let okN = 0;
                let failN = 0;
                for (const id of ids) {
                    try {
                        const done = await deletePersonaById(id);
                        if (done) okN += 1;
                        else failN += 1;
                    } catch (e) {
                        console.error(e);
                        failN += 1;
                    }
                }
                state.selected.clear();
                if (typeof toastr !== 'undefined') {
                    if (okN) toastr.success(`已删除 ${okN} 个` + (failN ? `，失败 ${failN} 个` : ''));
                    else toastr.error(`删除失败（${failN}）`);
                }
                state.active = true;
                ensureRoot();
                const root = document.getElementById(ROOT_ID);
                if (root) {
                    root.hidden = false;
                    document.body.classList.add('pmp18-open');
                }
                renderManager();
            })();
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

export function openManager(tab = 'all') {
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

export function closeManager() {
    state.active = false;
    state.selected.clear();
    state.compareIds = [];
    state.baselineId = null;
    state.focusOtherId = null;
    const root = document.getElementById(ROOT_ID);
    if (root) root.hidden = true;
    document.body.classList.remove('pmp18-open');
}

