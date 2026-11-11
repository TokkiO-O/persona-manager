/**
 * 原版 Persona：「创建」旁一个「归类」按钮 → 展开分类+标签（均可多选）筛选
 */
import { EXT } from './constants.js';
import { getHostContext, getNativePersonaFilter } from '../power-user-bridge.js';
import { invalidatePersonaCache, getPersonaData } from './persona-data.js';
import { getTagDefs, getTagsForPersona, getTagMap } from './tags.js';
import { getCategoryDefs, getCategoryMap } from './categories.js';
import { state } from './state.js';
import { applyTheme } from './themes.js';

const BAR_ID = 'pmp18-native-beside-create';
const PANEL_ID = 'pmp18-native-expand-panel';
const META = 'data-pmp18-meta';
const ROW_ID = 'data-pmp18-pid';
const FILTER_KEY = 'pmp18-organize';
let afterPersonaChange = () => {};
let selectedCats = [], selectedTags = [], filterKey = '[[],[]]', nativeFilter = null;

function escape(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function idFromSrc(src) {
    if (!src) return '';
    try {
        const u = new URL(src, location.origin);
        const f = u.searchParams.get('file');
        if (f) return f;
    } catch { /* ignore */ }
    const m = String(src).match(/file=([^&]+)/);
    if (m) {
        try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
    const m2 = String(src).match(/\/([^/?#]+\.(?:png|jpe?g|webp|gif|svg))(?:\?|#|$)/i);
    return m2 ? m2[1] : '';
}

function getBlock() {
    return document.getElementById('persona-management-block')
        || document.querySelector('#persona-management-block-content')
        || document.querySelector('.persona_management_left_column');
}

function findCreateButton(block) {
    if (!block) return null;
    const candidates = block.querySelectorAll('button, .menu_button, .menu_button_icon, a.menu_button, div.menu_button');
    for (const el of candidates) {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^(创建|Create)$/i.test(t) || (/创建/.test(t) && t.length <= 8)) return el;
    }
    const search = block.querySelector('input[type="search"], input[placeholder*="搜索"], input[placeholder*="Search"]');
    if (search) {
        const row = search.closest('.flex-container, .form_group, div') || search.parentElement;
        const btn = row?.querySelector('button, .menu_button');
        if (btn) return btn;
    }
    return null;
}

function findRows(block) {
    if (!block) return [];
    const seen = new Set();
    const out = [];
    block.querySelectorAll('.avatar-container, .persona_block[data-avatar-id]').forEach(row => {
        const img = row.querySelector('img');
        const id = row.getAttribute('data-avatar-id') || img?.closest('[data-avatar-id]')?.getAttribute('data-avatar-id') || idFromSrc(img?.getAttribute('src'));
        if (!id || seen.has(id) || row.querySelector('.avatar-container')) return;
        seen.add(id);
        if (row.getAttribute(ROW_ID) !== id) row.setAttribute(ROW_ID, id);
        out.push({ id, row });
    });
    return out;
}

function catIdsOf(id) {
    const v = getCategoryMap()[id];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v) return [v];
    return [];
}

function ensureBesideCreate(block) {
    document.getElementById('pmp18-native-tag-filter')?.remove();
    const createBtn = findCreateButton(block);
    let bar = document.getElementById(BAR_ID);
    if (!bar) {
        bar = document.createElement('span');
        bar.id = BAR_ID;
        bar.className = 'pmp18-native-beside';
        bar.innerHTML = `
          <button type="button" class="menu_button menu_button_icon pmp18-native-st-btn" data-panel="org" title="分类与标签">
            <i class="fa-solid fa-bookmark"></i><span>归类</span>
          </button>`;
    }
    if (createBtn) {
        const parent = createBtn.parentElement;
        if (parent && bar.parentElement !== parent) {
            if (createBtn.nextSibling) parent.insertBefore(bar, createBtn.nextSibling);
            else parent.appendChild(bar);
        }
    } else if (!bar.parentElement) {
        block.insertBefore(bar, block.firstChild);
    }

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'pmp18-native-expand';
        panel.hidden = true;
        panel.dataset.cats = '[]';
        panel.dataset.tags = '[]';
        if (bar.parentElement?.parentElement) {
            const host = bar.parentElement.parentElement;
            if (bar.parentElement.nextSibling) host.insertBefore(panel, bar.parentElement.nextSibling);
            else host.appendChild(panel);
        }
        if (!panel.parentElement) block.appendChild(panel);
    }

    applyTheme(bar);
    applyTheme(panel);
    bar.onclick = (e) => {
        const btn = e.target.closest('[data-panel]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        if (!panel.hidden) {
            panel.hidden = true;
            btn.classList.remove('is-on');
            applyFilter(block, [], []);
            return;
        }
        panel.hidden = false;
        btn.classList.add('is-on');
        renderOrgPanel(panel, block);
        applyFilter(block, parseJsonArr(panel.dataset.cats), parseJsonArr(panel.dataset.tags));
    };
    return { bar, panel };
}

function parseJsonArr(s) {
    try {
        const a = JSON.parse(s || '[]');
        return Array.isArray(a) ? a.map(String) : [];
    } catch { return []; }
}

function renderOrgPanel(panel, block) {
    const catDefs = getCategoryDefs();
    const tagDefs = getTagDefs();
    let selCat = new Set(parseJsonArr(panel.dataset.cats).filter(id => catDefs.some(item => item.id === id)));
    let selTag = new Set(parseJsonArr(panel.dataset.tags).filter(id => tagDefs.some(item => item.id === id)));
    const cats = JSON.stringify([...selCat]), tags = JSON.stringify([...selTag]);
    if (panel.dataset.cats !== cats) panel.dataset.cats = cats;
    if (panel.dataset.tags !== tags) panel.dataset.tags = tags;
    panel.dataset.definitions = JSON.stringify([catDefs, tagDefs]);

    panel.innerHTML = `
      <div class="pmp18-native-expand-title">分类（可多选）</div>
      <div class="pmp18-native-expand-chips" data-kind="cat">
        ${catDefs.length ? catDefs.map(c => `
          <button type="button" class="pmp18-native-chip ${selCat.has(c.id) ? 'is-on' : ''}" data-id="${escape(c.id)}">${escape(c.name)}</button>
        `).join('') : '<span class="pmp18-muted">暂无分类</span>'}
      </div>
      <div class="pmp18-native-expand-title" style="margin-top:10px">标签（可多选）</div>
      <div class="pmp18-native-expand-chips" data-kind="tag">
        ${tagDefs.length ? tagDefs.map(t => `
          <button type="button" class="pmp18-native-chip ${selTag.has(t.id) ? 'is-on' : ''}" data-id="${escape(t.id)}">${escape(t.name)}</button>
        `).join('') : '<span class="pmp18-muted">暂无标签</span>'}
      </div>
      <div class="pmp18-native-expand-foot">
        <button type="button" class="menu_button pmp18-native-clear" data-act="clear">清除筛选</button>
        ${getNativePersonaFilter()?.filterFunctions ? '' : '<small class="pmp18-native-filter-note">当前页筛选 · 可切换分页继续查看</small>'}
      </div>`;

    panel.onclick = (e) => {
        const clear = e.target.closest('[data-act="clear"]');
        if (clear) {
            e.preventDefault();
            panel.dataset.cats = '[]';
            panel.dataset.tags = '[]';
            renderOrgPanel(panel, block);
            applyFilter(block, [], []);
            return;
        }
        const chip = e.target.closest('.pmp18-native-chip[data-id]');
        if (!chip) return;
        e.preventDefault();
        const kind = chip.parentElement?.dataset?.kind;
        const id = chip.getAttribute('data-id');
        const set = kind === 'cat' ? selCat : selTag;
        if (set.has(id)) set.delete(id);
        else set.add(id);
        panel.dataset.cats = JSON.stringify([...selCat]);
        panel.dataset.tags = JSON.stringify([...selTag]);
        renderOrgPanel(panel, block);
        applyFilter(block, [...selCat], [...selTag]);
    };
}

/** 多选：人设需包含所选分类中的全部？或任一？——用「同时满足」更精确；空则不过滤该维 */
function matchesOrganize(id, catIds, tagIds) {
    const tmap = getTagMap();
    const pc = catIdsOf(String(id));
    const pt = tmap[String(id)] || [];
    return catIds.every(c => pc.includes(c)) && tagIds.every(t => pt.includes(t));
}

function applyFilter(block, catIds, tagIds, force = false) {
    selectedCats = catIds.filter(id => getCategoryDefs().some(c => c.id === id));
    selectedTags = tagIds.filter(id => getTagDefs().some(t => t.id === id));
    const key = JSON.stringify([selectedCats, selectedTags]);
    const helper = getNativePersonaFilter();
    if (helper?.filterFunctions && typeof helper.onDataChanged === 'function') {
        const newHelper = nativeFilter !== helper;
        if (nativeFilter && nativeFilter !== helper) delete nativeFilter.filterFunctions[FILTER_KEY];
        nativeFilter = helper;
        helper.filterFunctions[FILTER_KEY] = data => data.filter(id => matchesOrganize(id, selectedCats, selectedTags));
        if (filterKey !== key || ((force || newHelper) && (selectedCats.length || selectedTags.length))) {
            filterKey = key;
            helper.onDataChanged();
        }
    }
    findRows(block).forEach(({ id, row }) => {
        row.classList.toggle('pmp18-native-filtered-out', !matchesOrganize(id, selectedCats, selectedTags));
    });
}

function injectMeta(block) {
    block.querySelectorAll('[data-pmp18-tags]').forEach(el => el.remove());
    findRows(block).forEach(({ id, row }) => {
        const catNames = catIdsOf(id)
            .map(cid => getCategoryDefs().find(c => c.id === cid)?.name)
            .filter(Boolean);
        const tags = getTagsForPersona(id);
        const parts = [];
        if (catNames.length) parts.push(catNames.join('、'));
        if (tags.length) parts.push(tags.map(t => t.name).join('、'));
        let meta = row.querySelector(`[${META}]`);
        if (!parts.length) {
            meta?.remove();
            return;
        }
        const text = parts.join(' · ');
        const metaHost = row.querySelector('.character_select_container, .flex-container') || row;
        if (!meta) {
            meta = document.createElement('span');
            meta.setAttribute(META, '1');
            meta.className = 'pmp18-native-meta';
            metaHost.appendChild(meta);
        }
        if (meta.parentElement !== metaHost) metaHost.appendChild(meta);
        if (meta.textContent !== text) meta.textContent = text;
        if (meta.title !== text) meta.title = text;
    });
}

export function refreshNativeTags({ forceFilter = true } = {}) {
    if (state.settings?.injectTagsToNative === false) {
        document.getElementById(BAR_ID)?.remove();
        document.getElementById(PANEL_ID)?.remove();
        document.querySelectorAll(`[${META}]`).forEach(el => el.remove());
        document.querySelectorAll('.pmp18-native-filtered-out').forEach(el => el.classList.remove('pmp18-native-filtered-out'));
        selectedCats = []; selectedTags = [];
        if (nativeFilter) { delete nativeFilter.filterFunctions[FILTER_KEY]; nativeFilter.onDataChanged?.(); nativeFilter = null; }
        filterKey = '';
        return;
    }
    const block = getBlock();
    if (!block) return;
    try {
        if (block.classList?.contains('closedDrawer')) return;
    } catch { /* ignore */ }

    const { panel } = ensureBesideCreate(block) || {};
    injectMeta(block);
    if (panel && !panel.hidden) {
        const definitions = JSON.stringify([getCategoryDefs(), getTagDefs()]);
        if (panel.dataset.definitions !== definitions) renderOrgPanel(panel, block);
        applyFilter(block, parseJsonArr(panel.dataset.cats), parseJsonArr(panel.dataset.tags), forceFilter);
    }
}

export function installPersonaListener() {
    window.__pmp18PersonaCleanup?.();
    window.__pmp18NativeTags = { refresh: refreshNativeTags };
    let timer = 0, observedBlock = null, renderFrame = 0;
    const obs = new MutationObserver(records => {
        const own = node => node.nodeType === 1 && node.matches?.(`[${META}],#${BAR_ID},#${PANEL_ID},.pmp18-native-expand`);
        if (records.every(record => record.target.closest?.(`[${META}],#${BAR_ID},#${PANEL_ID}`) || (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(own)))) return;
        schedule();
    });
    const tick = () => {
        timer = 0;
        try {
            const block = getBlock();
            if (block !== observedBlock) {
                obs.disconnect(); observedBlock = block;
                if (block) obs.observe(block, { childList: true, subtree: true, attributes: true, attributeFilter: ['src','data-avatar-id'] });
            }
            refreshNativeTags({ forceFilter: false });
        } catch (error) { console.warn(`[${EXT}] native`, error); }
    };
    function schedule() { clearTimeout(timer); timer = setTimeout(tick, 80); }
    const onOpen = e => { if (e.target.closest?.('#persona-management-button,#user-settings-button')) schedule(); };
    document.addEventListener('click', onOpen);
    const ctx = getHostContext(), es = ctx.eventSource, types = ctx.eventTypes || ctx.event_types || {};
    const eventNames = [...new Set(['PERSONA_CREATED','PERSONA_CHANGED','PERSONA_UPDATED','PERSONA_RENAMED','PERSONA_DELETED'].map(key => types[key] || key.toLowerCase()))];
    const onChange = () => {
        invalidatePersonaCache('host-persona-event');
        const valid = new Set(getPersonaData().map(p => p.id));
        state.selected.forEach(id => { if (!valid.has(id)) state.selected.delete(id); });
        schedule();
        if (state.active && !renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = 0; afterPersonaChange(); });
    };
    eventNames.forEach(name => es?.on?.(name, onChange));
    window.__pmp18PersonaCleanup = () => {
        obs.disconnect(); clearTimeout(timer); cancelAnimationFrame(renderFrame);
        document.removeEventListener('click', onOpen);
        eventNames.forEach(name => { if (es?.off) es.off(name, onChange); else es?.removeListener?.(name, onChange); });
        if (nativeFilter) { delete nativeFilter.filterFunctions[FILTER_KEY]; nativeFilter = null; filterKey = ''; }
    };
    tick();
}

export function setPersonaListenerRefresh(fn) { afterPersonaChange = typeof fn === 'function' ? fn : () => {}; }

