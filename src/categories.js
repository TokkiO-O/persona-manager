import { state, saveSettingsLocal } from './state.js';
import { applyOrganizeBatch } from './organize.js';

function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getCategoryDefs() {
    if (!Array.isArray(state.settings.categoryDefs)) state.settings.categoryDefs = [];
    return state.settings.categoryDefs;
}

/** personaId -> categoryId[] （多选；兼容旧的单 string） */
export function getCategoryMap() {
    if (!state.settings.categoryMap || typeof state.settings.categoryMap !== 'object') {
        state.settings.categoryMap = {};
    }
    const map = state.settings.categoryMap;
    // migrate string -> array once
    Object.keys(map).forEach(pid => {
        const v = map[pid];
        if (typeof v === 'string') map[pid] = v ? [v] : [];
        if (!Array.isArray(map[pid])) map[pid] = [];
    });
    return map;
}

export function getCategoryById(id) {
    return getCategoryDefs().find(c => c.id === id) || null;
}

export function getCategoriesForPersona(personaId) {
    const ids = getCategoryMap()[String(personaId)] || [];
    return ids.map(getCategoryById).filter(Boolean);
}

/** @deprecated 兼容旧调用：返回第一个 */
export function getCategoryForPersona(personaId) {
    const list = getCategoriesForPersona(personaId);
    return list[0] || null;
}

export function createCategory(name) {
    const n = String(name || '').trim().slice(0, 24);
    if (!n) return null;
    const defs = getCategoryDefs();
    if (defs.some(c => c.name === n)) return null;
    const cat = { id: uid(), name: n };
    defs.push(cat);
    if (!saveSettingsLocal()) {
        defs.pop();
        throw new Error('分类未能保存，请检查浏览器存储空间后重试。');
    }
    return cat;
}

export function deleteCategoryDef(id) {
    const key = String(id);
    if (!getCategoryById(key)) return false;
    const previousDefs = getCategoryDefs(), previousMap = state.settings.categoryMap;
    const hadMap = Object.prototype.hasOwnProperty.call(state.settings, 'categoryMap');
    const nextMap = { ...(previousMap || {}) };
    for (const [person, raw] of Object.entries(previousMap || {})) {
        const values = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [];
        if (!values.includes(key)) continue;
        const kept = values.filter(value => value !== key);
        if (kept.length) nextMap[person] = kept; else delete nextMap[person];
    }
    state.settings.categoryDefs = previousDefs.filter(item => item.id !== key);
    state.settings.categoryMap = nextMap;
    if (!saveSettingsLocal()) {
        state.settings.categoryDefs = previousDefs;
        if (hadMap) state.settings.categoryMap = previousMap; else delete state.settings.categoryMap;
        throw new Error('分类未能保存，请检查浏览器存储空间后重试。');
    }
    if (state.filterCategoryId === key) state.filterCategoryId = null;
    return true;
}

export function setPersonaCategories(personaId, categoryIds) {
    const map = getCategoryMap();
    const pid = String(personaId);
    const ids = [...new Set((categoryIds || []).map(String).filter(Boolean))];
    if (!ids.length) delete map[pid];
    else map[pid] = ids;
    saveSettingsLocal();
}

/** Commit a batch once so every selected persona keeps its own existing groups. */
export function applyCategoryBatch(personaIds, categoryIds, mode = 'add') {
    return applyOrganizeBatch(personaIds, { categories: { ids: categoryIds, mode } }).changed;
}

/** @deprecated */
export function setPersonaCategory(personaId, categoryId) {
    if (!categoryId) setPersonaCategories(personaId, []);
    else setPersonaCategories(personaId, [categoryId]);
}

export function personasInCategory(categoryId) {
    const map = getCategoryMap();
    return Object.keys(map).filter(pid => (map[pid] || []).includes(categoryId));
}

