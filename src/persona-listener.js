/**
 * 原版 Persona：「创建」旁一个「归类」按钮 → 展开分类+标签（均可多选）筛选
 */
import { EXT, BUTTON_ID } from './constants.js';
import { getTagDefs, getTagsForPersona, getTagMap } from './tags.js';
import { getCategoryDefs, getCategoryMap } from './categories.js';
import { state } from './state.js';

const BAR_ID = 'pmp18-native-beside-create';
const PANEL_ID = 'pmp18-native-expand-panel';
const META = 'data-pmp18-meta';
const ROW_ID = 'data-pmp18-pid';

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
        if (f) return decodeURIComponent(f);
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
    block.querySelectorAll(
        'img[src*="thumbnail"], img[src*="avatar"], img[src*="persona"], .avatar img, img.avatar'
    ).forEach(img => {
        const id = idFromSrc(img.getAttribute('src') || img.src || '')
            || img.closest('[data-avatar-id]')?.getAttribute('data-avatar-id')
            || '';
        if (!id || seen.has(id)) return;
        let row = img.closest('.avatar')?.parentElement
            || img.closest('.flex-container')
            || img.parentElement;
        let best = row;
        let cur = row;
        for (let i = 0; i < 6 && cur && cur !== block; i++) {
            const hasImg = cur.querySelector('img');
            const textLen = (cur.textContent || '').replace(/\s+/g, ' ').trim().length;
            if (hasImg && textLen >= 1 && textLen < 500 && cur.children.length < 30) best = cur;
            cur = cur.parentElement;
        }
        row = best;
        if (!row || row === block) return;
        seen.add(id);
        row.setAttribute(ROW_ID, id);
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
    let selCat = new Set(parseJsonArr(panel.dataset.cats));
    let selTag = new Set(parseJsonArr(panel.dataset.tags));

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
function applyFilter(block, catIds, tagIds) {
    const tmap = getTagMap();
    findRows(block).forEach(({ id, row }) => {
        let ok = true;
        const pc = catIdsOf(id);
        const pt = tmap[id] || [];
        if (catIds.length && !catIds.every(c => pc.includes(c))) ok = false;
        if (tagIds.length && !tagIds.every(t => pt.includes(t))) ok = false;
        row.style.display = ok ? '' : 'none';
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
        if (!meta) {
            meta = document.createElement('span');
            meta.setAttribute(META, '1');
            meta.className = 'pmp18-native-meta';
            row.appendChild(meta);
        }
        meta.textContent = text;
        meta.title = text;
    });
}

export function refreshNativeTags() {
    if (state.settings?.injectTagsToNative === false) {
        document.getElementById(BAR_ID)?.remove();
        document.getElementById(PANEL_ID)?.remove();
        document.querySelectorAll(`[${META}]`).forEach(el => el.remove());
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
        applyFilter(block, parseJsonArr(panel.dataset.cats), parseJsonArr(panel.dataset.tags));
    }
}

export function installPersonaListener() {
    window.__pmp18NativeTags = { refresh: refreshNativeTags };
    const tick = () => {
        try { refreshNativeTags(); } catch (e) {
            console.warn(`[${EXT}] native`, e);
        }
    };
    let t = 0;
    const obs = new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(tick, 450);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(tick, 700);
    setTimeout(tick, 2000);
    document.getElementById('persona-management-button')?.addEventListener('click', () => {
        setTimeout(tick, 250);
        setTimeout(tick, 900);
    });
}

export function setPersonaListenerRefresh() {}
