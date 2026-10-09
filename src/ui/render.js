import { EXT, VERSION, ROOT_ID, UI_THEMES } from '../constants.js';
import { state, saveSettingsLocal } from '../state.js';
import { escapeHtml, computeReadableInk } from '../util.js';
import {
    getPersonaData, deletePersonaById, confirmDeletePersona, invalidatePersonaCache, syncPersonasFromAvatarFiles
} from '../persona-data.js';
import {
    getSameNameGroups, getExactDuplicateGroups, getSimilarPairs
} from '../similarity.js';
import { checkForUpdates, showUpdateModal, scheduleAutoUpdateCheck } from '../update.js';
import {
    renderAllView, renderSameNameView, renderDuplicateView, renderSimilarView, renderUnclassifiedView, renderCard
} from './components.js';
import { renderCompareWorkspace } from './compare.js';
import { openFullEditor } from './editor.js';
import { openMergeDialog } from './merge.js';
import { openAdoptDialog } from './adopt.js';
import { getTagDefs, createTag, deleteTagDef, togglePersonaTag, getTagsForPersona, setPersonaTags, updateTag } from '../tags.js';
import {
    getCategoryDefs, createCategory, deleteCategoryDef, setPersonaCategories, getCategoriesForPersona,
    getCategoryForPersona, getCategoryMap
} from '../categories.js';
import { listTrash, pushToTrash, snapshotPersona, restoreFromTrash, purgeTrashItem, emptyTrash } from '../trash.js';
import { getActiveAvatarId } from '../persona-data.js';
import { TAG_COLOR_PRESETS } from '../constants.js';


function openTagPicker(personaId) {
    const defs = getTagDefs();
    const cur = new Set(getTagsForPersona(personaId).map(x => x.id));
    let draftColor = TAG_COLOR_PRESETS[0];
    const pick = document.createElement('div');
    pick.className = 'pmp18-editor-overlay is-popup';
    const paint = () => {
        const list = getTagDefs();
        const body = pick.querySelector('.pmp18-tag-picker-body');
        if (!body) return;
        body.innerHTML = `
          <div class="pmp18-tag-pick-list">
            ${list.length ? list.map(d => `
              <label class="pmp18-tag-pick">
                <input type="checkbox" data-tid="${d.id}" ${cur.has(d.id) ? 'checked' : ''}>
                <span class="pmp18-tag-chip" style="--pmp-tag:${d.color}">${escapeHtml(d.name)}</span>
              </label>`).join('') : '<p class="pmp18-muted">还没有标签，在下方直接输入创建</p>'}
          </div>
          <div class="pmp18-tag-inline-create">
            <div class="pmp18-tag-inline-row">
              <input type="text" class="pmp18-tag-new-input" placeholder="新标签名（回车或点添加）" maxlength="24">
              <button type="button" class="pmp18-primary-btn pmp18-tag-add-btn">添加</button>
            </div>
            <div class="pmp18-tag-colors">
              ${TAG_COLOR_PRESETS.map((c, i) =>
                `<button type="button" class="pmp18-tag-color ${c === draftColor ? 'is-on' : ''}" data-color="${c}" style="background:${c}"></button>`
              ).join('')}
            </div>
          </div>`;
        body.querySelectorAll('input[data-tid]').forEach(inp => {
            inp.onchange = () => {
                if (inp.checked) cur.add(inp.dataset.tid);
                else cur.delete(inp.dataset.tid);
            };
        });
        body.querySelectorAll('.pmp18-tag-color').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                draftColor = btn.dataset.color;
                body.querySelectorAll('.pmp18-tag-color').forEach(b => b.classList.toggle('is-on', b === btn));
            };
        });
        const input = body.querySelector('.pmp18-tag-new-input');
        const addNew = () => {
            const name = (input?.value || '').trim();
            if (!name) {
                if (typeof toastr !== 'undefined') toastr.warning('请输入标签名');
                return false;
            }
            const tag = createTag(name, draftColor);
            if (!tag) {
                // 已存在则勾选已有
                const exist = getTagDefs().find(t => t.name === name);
                if (exist) {
                    cur.add(exist.id);
                    if (input) input.value = '';
                    paint();
                    if (typeof toastr !== 'undefined') toastr.info(`已勾选已有标签「${name}」`);
                    return true;
                }
                if (typeof toastr !== 'undefined') toastr.warning('标签无效');
                return false;
            }
            cur.add(tag.id);
            if (input) input.value = '';
            paint();
            try { window.__pmp18NativeTags?.refresh?.(); } catch {}
            if (typeof toastr !== 'undefined') toastr.success(`已创建「${tag.name}」`);
            return true;
        };
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addNew(); }
        });
        body.querySelector('.pmp18-tag-add-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            addNew();
        });
    };
    pick.innerHTML = `<div class="pmp18-editor pmp18-tag-picker" role="dialog" aria-modal="true">
        <div class="pmp18-editor-head">
          <strong>设置标签</strong>
          <button type="button" class="pmp18-close" data-x><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="pmp18-tag-picker-body"></div>
        <div class="pmp18-editor-actions">
          <button type="button" class="pmp18-small-btn" data-x>取消</button>
          <button type="button" class="pmp18-primary-btn" data-save>保存</button>
        </div>
      </div>`;
    const close = () => pick.remove();
    pick.addEventListener('click', e => { if (e.target === pick || e.target.closest('[data-x]')) close(); });
    pick.querySelector('[data-save]').onclick = () => {
        // 保存前：若输入框还有未添加的名字，先创建并勾选
        const input = pick.querySelector('.pmp18-tag-new-input');
        const pending = (input?.value || '').trim();
        if (pending) {
            const tag = createTag(pending, draftColor);
            if (tag) cur.add(tag.id);
            else {
                const exist = getTagDefs().find(t => t.name === pending);
                if (exist) cur.add(exist.id);
            }
        }
        setPersonaTags(personaId, [...cur]);
        try { window.__pmp18NativeTags?.refresh?.(); } catch {}
        close();
        renderManager();
        if (typeof toastr !== 'undefined') toastr.success('标签已保存');
    };
    document.body.appendChild(pick);
    paint();
    pick.querySelector('.pmp18-tag-new-input')?.focus();
}

export function tabButton(key, label, icon, count) {
    const extra = key === 'settings' && state.updateInfo?.available
        ? '<em class="pmp18-new">NEW</em>'
        : (typeof count === 'number' ? `<em>${count}</em>` : '');
    return `<button class="pmp18-tab ${state.tab === key ? 'is-active' : ''}" type="button" data-action="tab" data-tab="${key}"><i class="fa-solid ${icon}"></i><span>${label}</span>${extra}</button>`;
}

export function renderSettingsPanel() {
    const t = Math.round(state.settings.similarityThreshold * 100);
    const soft = Math.round((state.settings.softMatchThreshold ?? 0.35) * 100);
    const editorMode = state.settings.editorMode === 'fullscreen' ? 'fullscreen' : 'popup';
    const upd = state.updateInfo;
    let tip = '';
    if (upd?.available) {
        tip = `<div class="pmp18-muted" style="margin-bottom:10px">发现新版本 v${escapeHtml(String(upd.remoteVersion))} — 点击左上角版本号查看并更新</div>`;
    } else if (upd?.error) {
        tip = `<div class="pmp18-muted" style="margin-bottom:10px">无法检查更新（不影响使用）。可点左上角版本号重试。</div>`;
    }

    return `
        <div class="pmp18-settings">
            ${tip}
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
            <div class="pmp18-settings-row">
                <label>编辑框样式</label>
                <div class="pmp18-mode-switch" role="group" aria-label="编辑框样式">
                    <button type="button" class="pmp18-mode-opt ${editorMode === 'popup' ? 'is-on' : ''}" data-action="set-editor-mode" data-mode="popup">弹窗</button>
                    <button type="button" class="pmp18-mode-opt ${editorMode === 'fullscreen' ? 'is-on' : ''}" data-action="set-editor-mode" data-mode="fullscreen">全屏</button>
                </div>
                <div class="pmp18-muted" style="margin-top:6px;font-size:12px">弹窗：居中圆角留白 · 全屏：铺满屏幕</div>
            </div>
            <div class="pmp18-settings-row">
                <label>界面主题</label>
                <div class="pmp18-theme-grid">
                    ${UI_THEMES.map(th => `
                      <button type="button" class="pmp18-theme-card ${(state.settings.uiTheme || 'minimal') === th.id ? 'is-on' : ''}"
                        data-action="set-ui-theme" data-theme="${th.id}" title="${escapeHtml(th.desc)}">
                        <span class="pmp18-theme-swatch pmp18-theme-swatch--${th.id}"></span>
                        <span class="pmp18-theme-name">${escapeHtml(th.name)}</span>
                      </button>`).join('')}
                </div>
            </div>
        </div>`;
}

export function renderManagerContent(personas) {
    if (state.tab === 'settings') return renderSettingsPanel();
    if (state.tab === 'trash') return renderTrashView();
    if (state.tab === 'tags') return renderTagsManageView();
    if (state.tab === 'categories') {
        return renderCategoriesManageView() + renderUnclassifiedView(personas);
    }
    if (state.tab === 'all') return renderAllView(personas);
    if (state.tab === 'same-name') return renderSameNameView(personas);
    if (state.tab === 'duplicates') return renderDuplicateView(personas);
    return renderSimilarView(personas);
}

function renderTrashView() {
    const items = listTrash();
    if (!items.length) {
        return `<div class="pmp18-empty"><strong>回收站为空</strong><span>删除的人设会暂存在这里，可恢复或彻底删除</span></div>`;
    }
    return `<div class="pmp18-trash-toolbar">
        <button type="button" class="pmp18-small-btn pmp18-danger-btn" data-action="empty-trash">清空回收站</button>
        <span class="pmp18-muted">${items.length} 条 · 超过 ${state.settings.trashMaxDays || 30} 天将自动清理</span>
      </div>
      <div class="pmp18-trash-list">${items.map(it => `
        <div class="pmp18-trash-item" data-id="${escapeHtml(it.id)}">
          <div class="pmp18-trash-main">
            <strong>${escapeHtml(it.name)}</strong>
            <span class="pmp18-muted">${new Date(it.deletedAt || 0).toLocaleString()}</span>
            <div class="pmp18-trash-desc">${escapeHtml(String(it.description || '').slice(0, 120))}</div>
          </div>
          <div class="pmp18-trash-actions">
            <button type="button" class="pmp18-small-btn" data-action="restore-trash" data-id="${escapeHtml(it.id)}">恢复</button>
            <button type="button" class="pmp18-small-btn pmp18-danger-btn" data-action="purge-trash" data-id="${escapeHtml(it.id)}">彻底删除</button>
          </div>
        </div>`).join('')}</div>`;
}


function renderCategoriesManageView() {
    const defs = getCategoryDefs();
    return `<div class="pmp18-cat-page">
      <div class="pmp18-cat-create-bar">
        <input type="text" id="pmp18-new-cat-name" placeholder="新建分类名" maxlength="24">
        <button type="button" class="pmp18-primary-btn" data-action="create-category">添加</button>
      </div>
      ${defs.length ? `<div class="pmp18-cat-chips-row">${defs.map(t => `
        <span class="pmp18-cat-chip-item">
          <span class="pmp18-meta-chip pmp18-meta-chip--cat">${escapeHtml(t.name)}</span>
          <button type="button" class="pmp18-cat-chip-del" data-action="delete-category" data-id="${t.id}" title="删除">×</button>
        </span>`).join('')}</div>` : '<p class="pmp18-muted pmp18-cat-hint">创建分类后，点人设卡片上的书签图标即可归类（可多选）</p>'}
      <div class="pmp18-cat-section-label">按分类浏览</div>
    </div>`;
}

function openOrganizePicker(personaId) {
    const catDefs = getCategoryDefs();
    const tagDefs = getTagDefs();
    const curCat = new Set(getCategoriesForPersona(personaId).map(x => x.id));
    const curTag = new Set(getTagsForPersona(personaId).map(x => x.id));
    let draftColor = (typeof TAG_COLOR_PRESETS !== 'undefined' && TAG_COLOR_PRESETS[0]) || '#e8a0b4';
    const pick = document.createElement('div');
    pick.className = 'pmp18-editor-overlay is-popup';
    const paint = () => {
        const body = pick.querySelector('.pmp18-org-body');
        if (!body) return;
        body.innerHTML = `
          <div class="pmp18-org-section">
            <div class="pmp18-org-section-title">分类 <span class="pmp18-muted">可多选</span></div>
            <div class="pmp18-org-list">
              ${catDefs.length ? catDefs.map(d => `
                <label class="pmp18-tag-pick">
                  <input type="checkbox" data-kind="cat" data-id="${d.id}" ${curCat.has(d.id) ? 'checked' : ''}>
                  <span class="pmp18-meta-chip pmp18-meta-chip--cat">${escapeHtml(d.name)}</span>
                </label>`).join('') : '<p class="pmp18-muted">暂无分类，请到「分类」页创建</p>'}
            </div>
          </div>
          <div class="pmp18-org-section">
            <div class="pmp18-org-section-title">标签 <span class="pmp18-muted">可多选</span></div>
            <div class="pmp18-org-list">
              ${tagDefs.length ? tagDefs.map(d => `
                <label class="pmp18-tag-pick">
                  <input type="checkbox" data-kind="tag" data-id="${d.id}" ${curTag.has(d.id) ? 'checked' : ''}>
                  <span class="pmp18-tag-chip" style="--pmp-tag:${d.color}">${escapeHtml(d.name)}</span>
                </label>`).join('') : '<p class="pmp18-muted">暂无标签</p>'}
            </div>
            <div class="pmp18-tag-inline-create">
              <div class="pmp18-tag-inline-row">
                <input type="text" class="pmp18-tag-new-input" placeholder="快速新建标签" maxlength="24">
                <button type="button" class="pmp18-primary-btn pmp18-tag-add-btn">添加</button>
              </div>
            </div>
          </div>`;
        body.querySelectorAll('input[data-kind]').forEach(inp => {
            inp.onchange = () => {
                const set = inp.dataset.kind === 'cat' ? curCat : curTag;
                if (inp.checked) set.add(inp.dataset.id);
                else set.delete(inp.dataset.id);
            };
        });
        const input = body.querySelector('.pmp18-tag-new-input');
        const addNew = () => {
            const name = (input?.value || '').trim();
            if (!name) return;
            const tag = createTag(name, draftColor);
            if (tag) { curTag.add(tag.id); input.value = ''; paint(); }
            else if (typeof toastr !== 'undefined') toastr.warning('标签无效或已存在');
        };
        body.querySelector('.pmp18-tag-add-btn')?.addEventListener('click', e => { e.preventDefault(); addNew(); });
        input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } });
    };
    pick.innerHTML = `<div class="pmp18-editor pmp18-org-dialog" role="dialog">
      <div class="pmp18-editor-head"><strong>分类与标签</strong>
        <button type="button" class="pmp18-close" data-x><i class="fa-solid fa-xmark"></i></button></div>
      <div class="pmp18-org-body pmp18-editor-body"></div>
      <div class="pmp18-editor-actions">
        <button type="button" class="pmp18-small-btn" data-x>取消</button>
        <button type="button" class="pmp18-primary-btn" data-save>保存</button>
      </div>
    </div>`;
    const close = () => pick.remove();
    pick.addEventListener('click', e => { if (e.target === pick || e.target.closest('[data-x]')) close(); });
    pick.querySelector('[data-save]').onclick = () => {
        setPersonaCategories(personaId, [...curCat]);
        setPersonaTags(personaId, [...curTag]);
        try { window.__pmp18NativeTags?.refresh?.(); } catch {}
        close();
        renderManager();
        if (typeof toastr !== 'undefined') toastr.success('已保存');
    };
    document.body.appendChild(pick);
    paint();
}

function openCategoryPicker(personaId) {
    openOrganizePicker(personaId);
}

function renderTagsManageView() {
    const defs = getTagDefs();
    const colors = TAG_COLOR_PRESETS.map((c, i) =>
        `<button type="button" class="pmp18-tag-color ${i === 0 ? 'is-on' : ''}" data-action="pick-tag-color" data-color="${c}" style="background:${c}"></button>`
    ).join('');
    return `<div class="pmp18-tags-manage">
      <div class="pmp18-settings-row">
        <label>新建标签</label>
        <div class="pmp18-tag-create">
          <div class="pmp18-tag-create-row">
            <input type="text" id="pmp18-new-tag-name" placeholder="标签名，回车添加" maxlength="24">
            <button type="button" class="pmp18-primary-btn" data-action="create-tag">添加</button>
          </div>
          <div class="pmp18-tag-colors" id="pmp18-new-tag-colors">${colors}</div>
        </div>
        <div class="pmp18-muted" style="margin-top:6px;font-size:12px">标签独立于备注；可在卡片上打标，原版 Persona 页可筛选</div>
      </div>
      <div class="pmp18-tag-def-list">${defs.length ? defs.map(t => `
        <div class="pmp18-tag-def" data-id="${t.id}">
          <span class="pmp18-tag-chip" style="--pmp-tag:${t.color}">${escapeHtml(t.name)}</span>
          <span class="pmp18-tag-def-actions">
            <button type="button" class="pmp18-small-btn" data-action="filter-tag" data-id="${t.id}">筛选</button>
            <button type="button" class="pmp18-small-btn pmp18-danger-btn" data-action="delete-tag-def" data-id="${t.id}">删除</button>
          </span>
        </div>`).join('') : '<p class="pmp18-muted">还没有标签，在上方创建</p>'}
      </div>
    </div>`;
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
            ${n === 2 ? '<button class="pmp18-small-btn" data-action="merge-selected">缝合</button>' : ''}
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

function applyUiTheme(root) {
    if (!root) return;
    const th = state.settings?.uiTheme || 'sakura';
    root.setAttribute('data-theme', th);
    root.classList.remove('pmp18-theme-sakura', 'pmp18-theme-peach', 'pmp18-theme-minimal', 'pmp18-theme-y2k');
    root.classList.add(`pmp18-theme-${th}`);
}

export function renderManager() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    try {
        applyUiTheme(root);
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
                    <div class="pmp18-lace-edge pmp18-lace-top" aria-hidden="true"></div>
                    <header class="pmp18-header">
                        <div class="pmp18-brand">
                            <div class="pmp18-brand-icon"><i class="fa-solid fa-users-viewfinder"></i></div>
                            <div>
                                <h1>Persona Manager</h1>
                                <button type="button" class="pmp18-version-btn" data-action="open-update-modal" title="更新日志 / 检查更新">v${VERSION}</button>
                            </div>
                        </div>
                        <div class="pmp18-header-actions">
                            <button class="pmp18-icon-btn pmp18-close" type="button" data-action="close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
                        </div>
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
            ${state.selected.size === 2 ? '<button class="pmp18-small-btn" data-action="merge-selected">缝合</button>' : ''}
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
            <div class="pmp18-lace-edge pmp18-lace-top" aria-hidden="true"></div>
            <div class="pmp18-float-stickers" aria-hidden="true"><span class="pmp18-fs">♡</span><span class="pmp18-fs">✦</span><span class="pmp18-fs">✿</span><span class="pmp18-fs">❀</span><span class="pmp18-fs">★</span><span class="pmp18-fs">✧</span></div>
            <header class="pmp18-header">
                <div class="pmp18-brand">
                    <div class="pmp18-brand-icon"><i class="fa-solid fa-users-viewfinder"></i></div>
                    <div>
                        <h1>Persona Manager</h1>
                        <button type="button" class="pmp18-version-btn" data-action="open-update-modal" title="更新日志 / 检查更新">v${VERSION}${state.updateInfo?.available ? '<em class="pmp18-new">NEW</em>' : ''}</button>
                    </div>
                </div>
                <div class="pmp18-header-actions">
                    <button class="pmp18-icon-btn" type="button" data-action="refresh-list" title="刷新人设列表" aria-label="刷新"><i class="fa-solid fa-rotate"></i></button>
                    <button class="pmp18-icon-btn pmp18-close" type="button" data-action="close" title="关闭" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </header>
            ${inCompare ? `<main class="pmp18-content pmp18-content--compare">${renderCompareWorkspace(personas)}</main>` : `
            <div class="pmp18-toolbar">
                <div class="pmp18-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="pmp18-search" data-pmp18-keep-focus="search" type="search" value="${escapeHtml(state.query)}" placeholder="搜索…" autocomplete="off">
                    ${state.query ? '<button data-action="clear-search"><i class="fa-solid fa-xmark"></i></button>' : ''}
                </div>
                <div class="pmp18-stats">
                    <span class="pmp18-stat"><b>${personas.length}</b> 全部</span>
                    <span class="pmp18-stat"><b>${sameNameGroups.length}</b> 同名</span>
                    <span class="pmp18-stat"><b>${duplicateGroups.length}</b> 重复</span>
                    ${state.tab === 'similar' ? `<span class="pmp18-stat"><b>${similarCount}</b> 相似</span>` : ''}
                    <button type="button" class="pmp18-density-btn" data-action="toggle-density" title="列表疏密">${state.listDensity === 'compact' ? '紧凑' : '舒适'}</button>
                </div>
</div>
            <nav class="pmp18-tabs">
                ${tabButton('all', '全部', 'fa-layer-group')}
                ${tabButton('same-name', '同名', 'fa-people-group', sameNameGroups.length)}
                ${tabButton('duplicates', '完全重复', 'fa-copy', duplicateGroups.length)}
                ${tabButton('similar', '高度相似', 'fa-clone')}
                ${tabButton('categories', '分类', 'fa-folder')}
                ${tabButton('tags', '标签', 'fa-tags')}
                ${tabButton('trash', '回收站', 'fa-trash-can', listTrash().length || undefined)}
                ${tabButton('settings', '设置', 'fa-sliders')}
            </nav>
            <main class="pmp18-content">${renderManagerContent(personas)}</main>
            ${selectionHint}`}
            <div class="pmp18-lace-edge pmp18-lace-bottom" aria-hidden="true"></div>
        </section>`;

    // Restore scroll positions. Use rAF so the browser has finished layout.
    requestAnimationFrame(() => {
        const newContent = root.querySelector('.pmp18-content');
        if (newContent) newContent.scrollTop = savedScroll.content;
        const newCompare = root.querySelector('.pmp18-compare-workspace');
        if (newCompare) newCompare.scrollTop = savedScroll.compare;
        const newTabBar = root.querySelector('.pmp18-tabs');
        if (newTabBar) newTabBar.scrollLeft = savedTabScroll;
        // v1.9.15: fold long same blocks for mobile reading
        applyFoldDefaults(root);
        bindGlobalKeys(root);
        applyAdaptiveInk(root);
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

/**
 * Guarantee readable text on surfaces whose background comes from ST theme
 * variables. ST pairs --SmartThemeBodyColor with --SmartThemeBlurTintColor
 * only for well-formed themes; when the blur tint is missing (falls back to
 * white) while BodyColor is white (dark theme), text vanishes. Compute the
 * actual rendered background luminance and pin the ink color (dark on light,
 * light on dark), mirroring ST's own --SmartThemeCheckboxTickColor approach.
 */
function applyAdaptiveInk(root) {
    const windowEl = root.querySelector('.pmp18-window');
    const windowBg = windowEl ? getComputedStyle(windowEl).backgroundColor : null;
    const fallbackBg = windowBg || '#ffffff';
    const ink = computeReadableInk(windowBg, fallbackBg);
    root.style.setProperty('--pmp18-ink', ink);
    // 列表文字被主题盖成白字时，渲染后强制改回深色
    root.querySelectorAll('.pmp18-card-name').forEach(el => {
        el.style.setProperty('color', '#1a1a1f', 'important');
        el.style.setProperty('-webkit-text-fill-color', '#1a1a1f', 'important');
    });
    root.querySelectorAll('.pmp18-card-description').forEach(el => {
        el.style.setProperty('color', '#333333', 'important');
        el.style.setProperty('-webkit-text-fill-color', '#333333', 'important');
    });
    root.querySelectorAll('.pmp18-card-sub').forEach(el => {
        el.style.setProperty('color', '#666666', 'important');
        el.style.setProperty('-webkit-text-fill-color', '#666666', 'important');
    });
}


// v1.9.15: fold long same blocks for mobile reading. Walk each hcol-body,
// find runs of 3+ same-class blocks, mark all but the first as folded.
// Idempotent: marks are reset on each render.

function bindGlobalKeys(root) {
    if (root.dataset.pmp18Keys) return;
    root.dataset.pmp18Keys = '1';
    document.addEventListener('keydown', (e) => {
        if (!state.active) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
        if (e.key === 'Escape') {
            if (state.compareIds.length >= 2) {
                state.compareIds = [];
                state.baselineId = null;
                state.focusOtherId = null;
                renderManager();
            } else {
                closeManager();
            }
            e.preventDefault();
            return;
        }
        if (state.compareIds.length >= 2 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            const ids = state.compareIds.filter(id => id !== state.baselineId);
            if (!ids.length) return;
            let idx = ids.indexOf(state.focusOtherId);
            if (idx < 0) idx = 0;
            else idx = e.key === 'ArrowRight' ? (idx + 1) % ids.length : (idx - 1 + ids.length) % ids.length;
            state.focusOtherId = ids[idx];
            renderManager();
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter' && state.selected.size >= 2 && state.compareIds.length < 2) {
            state.compareIds = [...state.selected];
            state.baselineId = state.compareIds[0];
            state.focusOtherId = null;
            state.compareChromeOpen = false;
            renderManager();
            e.preventDefault();
        }
    });
}

function applyFoldDefaults(root) {
    const FOLD_MIN = 3;
    const bodies = root.querySelectorAll('.pmp18-hcol-body');
    bodies.forEach(body => {
        const blocks = body.querySelectorAll('.pmp18-col-block.same');
        blocks.forEach(b => b.classList.remove('is-folded'));
        let run = [];
        for (const b of blocks) {
            if (run.length === 0) { run.push(b); continue; }
            const prev = run[run.length - 1];
            if (prev.nextElementSibling === b) { run.push(b); continue; }
            // Run ended — apply fold if length >= FOLD_MIN
            if (run.length >= FOLD_MIN) {
                for (let i = 1; i < run.length; i++) run[i].classList.add('is-folded');
            }
            run = [b];
        }
        // tail
        if (run.length >= FOLD_MIN) {
            for (let i = 1; i < run.length; i++) run[i].classList.add('is-folded');
        }
    });
    // One-time global click handler for fold toggle
    if (!root.dataset.boundFold) {
        root.dataset.boundFold = '1';
        root.addEventListener('click', (e) => {
            const block = e.target.closest('.pmp18-col-block.same');
            if (!block) return;
            if (window.getSelection && String(window.getSelection()) !== '') return;
            block.classList.toggle('is-folded');
        });
    }
}


/* ---------- 根节点事件委托 ---------- */

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

    // dblclick on compare cards: open editor for the card's persona
    root.addEventListener('dblclick', event => {
        const target = event.target.closest('[data-dblaction]');
        if (!target) return;
        const action = target.dataset.dblaction;
        const id = String(target.dataset.id2 || target.dataset.id || '');
        if (!id) return;
        if (action === 'edit-full') {
            // Cancel any pending deferred focus-reorder so it never fires after the editor opens
            clearTimeout(root._pmp18FocusTimer);
            clearTimeout(root._pmp18BaselineTimer);
            // Don't bubble to click handler (which would set baseline / focus other)
            event.preventDefault();
            event.stopPropagation();
            openFullEditor(id);
        }
    });

    root.addEventListener('pointerup', event => {
        const vbtn = event.target.closest('[data-action="open-update-modal"]');
        if (!vbtn || !root.contains(vbtn)) return;
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            event.preventDefault();
            event.stopPropagation();
            root.dataset.pmp18SkipVersionClick = '1';
            try { showUpdateModal(); } catch (err) { console.error(err); }
            setTimeout(() => { delete root.dataset.pmp18SkipVersionClick; }, 400);
        }
    }, { passive: false });

    root.addEventListener('click', event => {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;

        if (action === 'close') {
            if (target.classList.contains('pmp18-backdrop') || target.closest('[data-action="close"]')) closeManager();
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
        if (action === 'refresh-list') {
            invalidatePersonaCache('manual-refresh');
            if (typeof toastr !== 'undefined') toastr.info('已刷新人设列表');
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
            state.showToc = false;
            state.compareChromeOpen = false;
            renderManager();
            return;
        }
        if (action === 'compare-selected') {
            const ids = [...state.selected].map(String);
            if (ids.length < 2) return;
            state.compareIds = ids;
            state.baselineId = ids[0];
            state.focusOtherId = null;
            state.selected.clear();
            state.showToc = false;
            state.compareChromeOpen = false;
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
            // A real double-click reorders the DOM on the first click, which would
            // make the second click land on a different element and suppress the
            // browser's dblclick. Defer the re-render so a fast second click can
            // still be recognized as a double-click (handled by the dblclick path).
            if (event.detail >= 2) {
                clearTimeout(root._pmp18BaselineTimer);
                return;
            }
            clearTimeout(root._pmp18BaselineTimer);
            root._pmp18BaselineTimer = setTimeout(() => {
                delete root._pmp18BaselineTimer;
                if (!state.active || root.hidden) return;
                state.baselineId = id;
                if (state.focusOtherId === id) state.focusOtherId = null;
                // focus may still be valid if it remains in others
                if (state.focusOtherId && state.focusOtherId === id) state.focusOtherId = null;
                renderManager();
            }, 280);
            return;
        }
        if (action === 'set-focus-other') {
            const id = String(target.dataset.id);
            // Cards that also carry data-dblaction must defer the focus-toggle +
            // re-render, otherwise the first click reorders the DOM under the
            // cursor and the browser's native dblclick never fires on the second
            // click (it lands on a different element). Mobile thumbs have no
            // dblaction, so keep their single-click focus immediate.
            if (target.closest('[data-dblaction]')) {
                if (event.detail >= 2) {
                    clearTimeout(root._pmp18FocusTimer);
                    return;
                }
                clearTimeout(root._pmp18FocusTimer);
                root._pmp18FocusTimer = setTimeout(() => {
                    delete root._pmp18FocusTimer;
                    if (!state.active || root.hidden) return;
                    state.focusOtherId = (state.focusOtherId === id) ? null : id;
                    renderManager();
                }, 280);
            } else {
                state.focusOtherId = (state.focusOtherId === id) ? null : id;
                renderManager();
            }
            return;
        }
        if (action === 'set-view-mode') {
            state.viewMode = target.dataset.mode === 'stacked' ? 'stacked' : 'side';
            renderManager();
            return;
        }
        if (action === 'toggle-compare-chrome') {
            state.compareChromeOpen = !state.compareChromeOpen;
            renderManager();
            return;
        }
        if (action === 'toggle-toc') {
            state.showToc = !state.showToc;
            if (!state.showToc) state.tocQuery = '';
            renderManager();
            return;
        }
        if (action === 'close-toc') {
            state.showToc = false;
            state.tocQuery = '';
            renderManager();
            return;
        }
        if (action === 'toc-jump') {
            handleTocJump(target);
            return;
        }
        
        if (action === 'set-ui-theme') {
            const th = String(target.dataset.theme || 'minimal');
            state.settings.uiTheme = th;
            saveSettingsLocal();
            applyUiTheme(root);
            renderManager();
            return;
        }
        if (action === 'set-editor-mode') {
            const mode = String(target.getAttribute('data-mode') || target.dataset.mode || 'popup') === 'fullscreen' ? 'fullscreen' : 'popup';
            state.settings.editorMode = mode;
            saveSettingsLocal();
            renderManager();
            return;
        }
        if (action === 'toggle-density') {
            state.listDensity = state.listDensity === 'compact' ? 'comfy' : 'compact';
            renderManager();
            return;
        }
        if (action === 'toggle-group-fold') {
            const key = String(target.dataset.key || '');
            state.groupFold[key] = !state.groupFold[key];
            renderManager();
            return;
        }
        if (action === 'jump-share') {
            let snip = String(target.dataset.snippet || '').trim();
            try { snip = decodeURIComponent(snip); } catch {}
            if (!snip) return;
            const rootEl = document.getElementById(ROOT_ID);
            if (!rootEl) return;
            const marks = Array.from(rootEl.querySelectorAll('mark.pmp18-share, mark'));
            const matched = marks.filter(m => {
                const t = (m.textContent || '').replace(/\s+/g, ' ').trim();
                return t === snip || t.includes(snip) || snip.includes(t);
            });
            if (!matched.length) return;
            matched.forEach(m => {
                m.classList.add('pmp18-toc-flash');
                m.classList.add('pmp18-flash');
                setTimeout(() => {
                    m.classList.remove('pmp18-toc-flash');
                    m.classList.remove('pmp18-flash');
                }, 3200);
            });
            const inOther = matched.find(m => m.closest('.pmp18-multi-other-card, .pmp18-other-col, .pmp18-obj-card'));
            const inBase = matched.find(m => m.closest('.pmp18-multi-base-fixed, .pmp18-base-col, .pmp18-base-card'));
            (inOther || matched[matched.length - 1]).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            if (inBase && inBase !== inOther) {
                try { inBase.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch { /* ignore */ }
            }
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
                const active = getActiveAvatarId();
                if (active && String(active) === id) {
                    if (!confirm('这是当前「使用中」的人设，确定删除并移入回收站？')) return;
                }
                const ok = await confirmDeletePersona(label + '（将进入回收站）', id);
                if (!ok) return;
                try {
                    pushToTrash(snapshotPersona(id));
                    const done = await deletePersonaById(id);
                    if (done) {
                        if (typeof toastr !== 'undefined') toastr.success(`已移入回收站：${label}`);
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
                        pushToTrash(snapshotPersona(id));
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
                    if (okN) toastr.success(`已移入回收站 ${okN} 个` + (failN ? `，失败 ${failN} 个` : ''));
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
        if (action === 'merge-selected') {
            const ids = [...state.selected].map(String);
            if (ids.length !== 2) {
                if (typeof toastr !== 'undefined') toastr.info('请选择恰好 2 个人设再缝合');
                return;
            }
            openMergeDialog(ids[0], ids[1], () => {
                state.selected.clear();
                renderManager();
            });
            return;
        }
        if (action === 'restore-trash') {
            const id = String(target.dataset.id || '');
            if (restoreFromTrash(id)) {
                if (typeof toastr !== 'undefined') toastr.success('已恢复');
                renderManager();
            } else if (typeof toastr !== 'undefined') toastr.error('恢复失败');
            return;
        }
        if (action === 'purge-trash') {
            const id = String(target.dataset.id || '');
            if (!confirm('彻底删除后无法恢复，确定？')) return;
            purgeTrashItem(id);
            renderManager();
            return;
        }
        if (action === 'empty-trash') {
            if (!confirm('清空回收站？此操作不可恢复')) return;
            emptyTrash();
            renderManager();
            return;
        }
        if (action === 'create-category') {
            event.preventDefault();
            const input = root.querySelector('#pmp18-new-cat-name');
            const name = (input?.value || '').trim();
            if (!name) {
                if (typeof toastr !== 'undefined') toastr.warning('请输入分类名');
                return;
            }
            const cat = createCategory(name);
            if (!cat) {
                if (typeof toastr !== 'undefined') toastr.warning('分类已存在或无效');
                return;
            }
            if (typeof toastr !== 'undefined') toastr.success(`已创建分类「${cat.name}」`);
            try { window.__pmp18NativeTags?.refresh?.(); } catch {}
            state.tab = 'categories';
            renderManager();
            return;
        }
        if (action === 'delete-category') {
            const id = String(target.dataset.id || '');
            if (!confirm('删除该分类？人设上的分类标记会清除')) return;
            deleteCategoryDef(id);
            try { window.__pmp18NativeTags?.refresh?.(); } catch {}
            renderManager();
            return;
        }
        if (action === 'category-persona' || action === 'organize-persona') {
            openOrganizePicker(String(target.dataset.id || ''));
            return;
        }
        if (action === 'create-tag') {
            event.preventDefault();
            event.stopPropagation();
            const input = root.querySelector('#pmp18-new-tag-name');
            const name = (input?.value || '').trim();
            if (!name) {
                if (typeof toastr !== 'undefined') toastr.warning('请输入标签名');
                input?.focus();
                return;
            }
            const colorBtn = root.querySelector('.pmp18-tag-color.is-on') || root.querySelector('.pmp18-tag-color');
            const color = colorBtn?.dataset?.color || TAG_COLOR_PRESETS[0];
            const tag = createTag(name, color);
            if (!tag) {
                if (typeof toastr !== 'undefined') toastr.warning('标签已存在或无效');
                return;
            }
            if (typeof toastr !== 'undefined') toastr.success(`已创建「${tag.name}」`);
            try { window.__pmp18NativeTags?.refresh?.(); } catch {}
            state.tab = 'tags';
            renderManager();
            return;
        }
        if (action === 'pick-tag-color') {
            root.querySelectorAll('.pmp18-tag-color').forEach(b => b.classList.remove('is-on'));
            target.classList.add('is-on');
            return;
        }
        if (action === 'delete-tag-def') {
            const id = String(target.dataset.id || '');
            if (!confirm('删除该标签定义？人设上的此标签也会移除')) return;
            deleteTagDef(id);
            if (state.filterTagId === id) state.filterTagId = null;
            try { window.__pmp18NativeTags?.refresh?.(); } catch {}
            renderManager();
            return;
        }
        if (action === 'clear-tag-filter') {
            state.filterTagId = null;
            renderManager();
            return;
        }
        if (action === 'filter-tag') {
            const id = String(target.dataset.id || '');
            state.filterTagId = state.filterTagId === id ? null : id;
            state.tab = 'all';
            renderManager();
            return;
        }
        if (action === 'tag-persona') {
            openOrganizePicker(String(target.dataset.id || ''));
            return;
        }
        if (action === 'adopt-snippet') {
            let snip = String(target.dataset.snippet || target.closest('[data-snippet]')?.dataset?.snippet || '').trim();
            try { snip = decodeURIComponent(snip); } catch { /* keep raw */ }
            if (!snip) {
                if (typeof toastr !== 'undefined') toastr.warning('没有可采纳的内容');
                return;
            }
            const baselineId = state.baselineId || state.compareIds[0];
            if (!baselineId) {
                if (typeof toastr !== 'undefined') toastr.warning('请先进入对比并选定基准');
                return;
            }
            openAdoptDialog({
                baselineId,
                snippet: snip,
                onDone: () => renderManager(),
            });
            return;
        }
        if (action === 'open-update-modal') {

            if (root.dataset.pmp18SkipVersionClick) return;
            event.preventDefault();
            event.stopPropagation();
            try {
                showUpdateModal();
            } catch (err) {
                console.error('[Persona Manager] open update modal failed', err);
                if (typeof toastr !== 'undefined') toastr.error('无法打开更新窗口');
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
        if (event.target.id === 'pmp18-toc-search') {
            state.tocQuery = event.target.value;
            // In-place: just refresh the toc body, don't re-render the whole manager
            const root = document.getElementById(ROOT_ID);
            const panel = root?.querySelector('.pmp18-toc-panel .pmp18-toc-body');
            if (panel) {
                // Re-derive list using the same logic as renderTocPanel
                // but cheaper: just toggle visibility via a re-render of toc body.
                // Easiest: schedule a render and let the new HTML replace.
                scheduleRender();
            }
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

// TOC click handler — scroll the matching block into view and flash it.
function handleTocJump(target) {
    const jump = String(target.dataset.tocJump || '');
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    let sel = null;
    if (jump.startsWith('row-')) {
        // The TOC index and the rendered block index may not align because the
        // TOC was built from unorderedDiff rows but the rendered blocks are
        // post-processed (ghost + showDiffOnly filters). We do a best-effort
        // match by counting block tags that match the type from the dataset.
        const idx = parseInt(jump.slice(4), 10) || 0;
        const blocks = root.querySelectorAll('.pmp18-hcol-body .pmp18-col-block');
        // Use the visible blocks only (skip pmp18-ghost)
        const visible = Array.from(blocks).filter(b => !b.classList.contains('pmp18-ghost'));
        // The TOC was built from full rows; visible might differ — fall back
        // to a best-effort by walking all blocks.
        const candidates = Array.from(blocks);
        sel = candidates[idx] || null;
    } else if (jump.startsWith('share-')) {
        // 按芯片文案匹配两侧所有 mark（不能只用 document 序的第 idx 个——那往往只在基准里）
        const snippet = (target.textContent || '').replace(/\s+/g, ' ').trim();
        const allMarks = Array.from(root.querySelectorAll('mark.pmp18-share'));
        const matched = snippet
            ? allMarks.filter(m => (m.textContent || '').replace(/\s+/g, ' ').trim() === snippet)
            : [];
        const idx = parseInt(jump.slice(6), 10) || 0;
        if (matched.length) {
            matched.forEach(m => {
                m.classList.add('pmp18-toc-flash');
                setTimeout(() => m.classList.remove('pmp18-toc-flash'), 3200);
            });
            // 优先滚到对象侧，再保证基准侧也在视野内
            const inOther = matched.find(m => m.closest('.pmp18-multi-other-card, .pmp18-other-col, .pmp18-obj-card, [data-side="other"]'));
            const inBase = matched.find(m => m.closest('.pmp18-multi-base-fixed, .pmp18-base-col, .pmp18-base-card, [data-side="base"]'));
            (inOther || matched[matched.length - 1])?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            if (inBase && inBase !== inOther) {
                try { inBase.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ }
            }
            return;
        }
        sel = allMarks[idx] || null;
    }
    if (!sel) return;
    sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    sel.classList.add('pmp18-toc-flash');
    setTimeout(() => sel.classList.remove('pmp18-toc-flash'), 3200);
    // Also try to highlight search matches if any
    if (state.tocQuery) {
        const q = state.tocQuery.toLowerCase();
        root.querySelectorAll('.pmp18-hcol-body mark.pmp18-search-hit').forEach(m => {
            m.outerHTML = m.innerHTML;
        });
        const walker = document.createTreeWalker(root.querySelector('.pmp18-hcol-body') || root, NodeFilter.SHOW_TEXT, null);
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        for (const node of nodes) {
            const lower = node.nodeValue.toLowerCase();
            const i = lower.indexOf(q);
            if (i < 0) continue;
            const before = node.nodeValue.slice(0, i);
            const hit = node.nodeValue.slice(i, i + q.length);
            const after = node.nodeValue.slice(i + q.length);
            const span = document.createElement('mark');
            span.className = 'pmp18-search-hit';
            span.textContent = hit;
            const parent = node.parentNode;
            parent.insertBefore(document.createTextNode(before), node);
            parent.insertBefore(span, node);
            parent.insertBefore(document.createTextNode(after), node);
            parent.removeChild(node);
        }
    }
}

export function openManager(tab = 'all') {
    ensureRoot();
    state.active = true;
    scheduleAutoUpdateCheck();
    if (state.viewMode !== 'stacked' && state.viewMode !== 'side') state.viewMode = 'side';
    state.tab = tab;
    state.selected.clear();
    state.compareIds = [];
    state.baselineId = null;
    state.focusOtherId = null;
    invalidatePersonaCache('openManager');
    const root = document.getElementById(ROOT_ID);
    root.hidden = false;
    document.body.classList.add('pmp18-open');
    renderManager();
    // Merge any new avatar files ST created while we were closed
    syncPersonasFromAvatarFiles().then(changed => {
        if (!state.active) return;
        invalidatePersonaCache('openManager-sync');
        renderManager();
    }).catch(() => {});
}

export function closeManager() {
    state.active = false;
    state.selected.clear();
    state.compareIds = [];
    state.baselineId = null;
    state.focusOtherId = null;
    const root = document.getElementById(ROOT_ID);
    if (root) {
        clearTimeout(root._pmp18FocusTimer);
        clearTimeout(root._pmp18BaselineTimer);
        root.hidden = true;
    }
    document.body.classList.remove('pmp18-open');
}

