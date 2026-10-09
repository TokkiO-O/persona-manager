import { state, saveSettingsLocal } from './state.js';

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
    saveSettingsLocal();
    return cat;
}

export function deleteCategoryDef(id) {
    state.settings.categoryDefs = getCategoryDefs().filter(c => c.id !== id);
    const map = getCategoryMap();
    Object.keys(map).forEach(pid => {
        map[pid] = (map[pid] || []).filter(x => x !== id);
        if (!map[pid].length) delete map[pid];
    });
    saveSettingsLocal();
}

export function setPersonaCategories(personaId, categoryIds) {
    const map = getCategoryMap();
    const pid = String(personaId);
    const ids = [...new Set((categoryIds || []).map(String).filter(Boolean))];
    if (!ids.length) delete map[pid];
    else map[pid] = ids;
    saveSettingsLocal();
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
