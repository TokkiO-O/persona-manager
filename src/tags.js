import { TAG_COLOR_PRESETS } from './constants.js';
import { state, saveSettingsLocal } from './state.js';

function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getTagDefs() {
    if (!Array.isArray(state.settings.tagDefs)) state.settings.tagDefs = [];
    return state.settings.tagDefs;
}

export function getTagMap() {
    if (!state.settings.tagMap || typeof state.settings.tagMap !== 'object') state.settings.tagMap = {};
    return state.settings.tagMap;
}

export function getTagById(id) {
    return getTagDefs().find(t => t.id === id) || null;
}

export function getTagsForPersona(personaId) {
    const ids = getTagMap()[String(personaId)] || [];
    return ids.map(getTagById).filter(Boolean);
}

export function createTag(name, color) {
    const n = String(name || '').trim().slice(0, 24);
    if (!n) return null;
    const defs = getTagDefs();
    if (defs.some(t => t.name === n)) return null;
    const c = color || TAG_COLOR_PRESETS[defs.length % TAG_COLOR_PRESETS.length];
    const tag = { id: uid(), name: n, color: c };
    defs.push(tag);
    saveSettingsLocal();
    return tag;
}

export function updateTag(id, patch) {
    const t = getTagById(id);
    if (!t) return false;
    if (patch.name != null) t.name = String(patch.name).trim().slice(0, 24) || t.name;
    if (patch.color != null) t.color = String(patch.color);
    saveSettingsLocal();
    return true;
}

export function deleteTagDef(id) {
    state.settings.tagDefs = getTagDefs().filter(t => t.id !== id);
    const map = getTagMap();
    for (const k of Object.keys(map)) {
        map[k] = (map[k] || []).filter(x => x !== id);
        if (!map[k].length) delete map[k];
    }
    saveSettingsLocal();
}

export function setPersonaTags(personaId, tagIds) {
    const id = String(personaId);
    const map = getTagMap();
    const uniq = [...new Set((tagIds || []).map(String))];
    if (!uniq.length) delete map[id];
    else map[id] = uniq;
    saveSettingsLocal();
}

export function togglePersonaTag(personaId, tagId) {
    const id = String(personaId);
    const map = getTagMap();
    const cur = new Set(map[id] || []);
    if (cur.has(tagId)) cur.delete(tagId);
    else cur.add(tagId);
    setPersonaTags(id, [...cur]);
}

export function personasWithTag(tagId, allIds) {
    const map = getTagMap();
    return (allIds || Object.keys(map)).filter(pid => (map[pid] || []).includes(tagId));
}

export function renderTagChipsHtml(personaId, { editable = false } = {}) {
    const tags = getTagsForPersona(personaId);
    if (!tags.length && !editable) return '';
    const chips = tags.map(t =>
        `<span class="pmp18-tag-chip" data-tag-id="${t.id}" style="--pmp-tag:${t.color}" title="${t.name}">${escape(t.name)}</span>`
    ).join('');
    return `<div class="pmp18-tag-row" data-persona-id="${escape(String(personaId))}">${chips}</div>`;
}

function escape(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
