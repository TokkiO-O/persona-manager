// power-user.js lives at /scripts/power-user.js (public/scripts/ in the
// SillyTavern repo). Our extension sits at
// /scripts/extensions/third-party/Persona Manager/, so from
// src/persona-data.js we need to climb out 4 levels then down into
// scripts/. Earlier builds used a wrong relative path and the import
// errored, which aborted the whole module graph and prevented the entry
// button from being injected.
import { power_user } from '../../../../scripts/power-user.js';
import { EXT } from './constants.js';
import { state } from './state.js';
import { normalizeText } from './util.js';

/* ---------- Persona read / write (id-safe) ---------- */

export function getPersonaDescription(raw) {
    if (raw == null) return '';
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    if (Array.isArray(raw)) return raw.map(getPersonaDescription).filter(Boolean).join('\n');
    if (typeof raw === 'object') {
        for (const key of ['description', 'text', 'content', 'value', 'persona_description']) {
            if (raw[key] != null) {
                const t = getPersonaDescription(raw[key]);
                if (t) return t;
            }
        }
    }
    return '';
}

/** ST Persona Title / 备注 */
export function getPersonaTitle(raw) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return '';
    for (const key of ['title', 'memo', 'note', '备注', 'persona_title']) {
        if (raw[key] != null && String(raw[key]).trim()) return String(raw[key]).trim();
    }
    return '';
}

export function getActiveAvatarId() {
    try {
        if (power_user?.user_avatar) return String(power_user.user_avatar);
    } catch { /* ignore */ }
    try {
        if (window.user_avatar) return String(window.user_avatar);
    } catch { /* ignore */ }
    return '';
}

/* ---------- §3 Persona data — read / write / delete (with memo cache) ---------- */

export let _personaCache = null;     // { version, items }
export let _personaVersion = 0;

// Bump whenever the underlying power_user data is mutated through this module,
// or any external write that we know about (PERSONA_UPDATED / PERSONA_DELETED
// event).
export function invalidatePersonaCache(reason) {
    _personaCache = null;
}

/**
 * Returns parsed persona list, with shape:
 *   { id, name, title, description, nameKey, descriptionKey }.
 * Memoized: re-renders don't re-parse descriptions. Invalidated by
 * PERSONA_UPDATED / PERSONA_DELETED events and by our own writes.
 */
export function getPersonaData() {
    if (_personaCache) return _personaCache.items;

    const personas = power_user?.personas || {};
    const descriptions = power_user?.persona_descriptions || {};
    const items = Object.entries(personas).map(([id, rawName]) => {
        const name = String(rawName ?? id);
        const rawDesc = descriptions?.[id];
        const description = getPersonaDescription(rawDesc);
        const title = getPersonaTitle(rawDesc);
        return {
            id: String(id),
            name,
            title,
            description,
            nameKey: normalizeText(name),
            descriptionKey: normalizeText(description),
        };
    });
    _personaCache = { items, version: ++_personaVersion };
    return items;
}

export function formatPersonaSubline(persona) {
    // 备注优先，没有则退回短 ID，用于同名同头像区分
    if (persona.title) return persona.title;
    const id = String(persona.id || '');
    if (id.length <= 18) return id;
    return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export function savePowerUserSettings() {
    try {
        if (typeof window.saveSettingsDebounced === 'function') {
            window.saveSettingsDebounced();
            return;
        }
    } catch { /* ignore */ }
    try {
        if (typeof window.saveSettings === 'function') window.saveSettings();
    } catch { /* ignore */ }
}

export function emitPersonaUpdated(id) {
    try {
        const ctx = window.SillyTavern?.getContext?.();
        const es = ctx?.eventSource;
        const types = ctx?.eventTypes || ctx?.event_types;
        if (es?.emit && types?.PERSONA_UPDATED) {
            es.emit(types.PERSONA_UPDATED, id);
            return;
        }
        if (es?.emit) es.emit('PERSONA_UPDATED', id);
    } catch { /* ignore */ }
}

/**
 * Write ONLY this avatar id.
 * Never copy edited text onto the currently selected persona unless ids match.
 */
export function persistPersonaDescription(targetId, description) {
    const id = String(targetId || '');
    if (!id || !power_user) {
        console.error(`[${EXT}] persist blocked: invalid id`, targetId);
        return false;
    }
    if (!power_user.persona_descriptions) power_user.persona_descriptions = {};

    const prev = power_user.persona_descriptions[id];
    let base = {};
    if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
        base = { ...prev };
    } else if (typeof prev === 'string') {
        base = { description: prev };
    }

    const nextText = String(description ?? '');
    power_user.persona_descriptions[id] = {
        ...base,
        description: nextText,
    };

    // Only touch the native textarea when editing the ACTIVE persona
    const activeId = getActiveAvatarId();
    if (activeId && activeId === id) {
        try {
            const ta = document.querySelector('#persona_description, textarea[name="persona_description"], #persona-description-textarea');
            if (ta && typeof ta.value === 'string') {
                ta.value = nextText;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
            }
            // Keep global "current description" field in sync only for active
            if (typeof power_user.persona_description === 'string') {
                power_user.persona_description = nextText;
            }
        } catch { /* ignore */ }
    }

    console.log(`[${EXT}] wrote description for id=${id} (active=${activeId || 'none'}) len=${nextText.length}`);
    savePowerUserSettings();
    invalidatePersonaCache('persistPersonaDescription');
    emitPersonaUpdated(id);
    return true;
}

export function persistPersonaFull(targetId, name, description) {
    const id = String(targetId || '');
    if (!id || !power_user) {
        console.error(`[${EXT}] persistFull blocked: invalid id`, targetId);
        return false;
    }
    if (!power_user.personas) power_user.personas = {};
    power_user.personas[id] = String(name ?? id);
    console.log(`[${EXT}] wrote name for id=${id}`);
    return persistPersonaDescription(id, description);
}

export function deletePersonaById(targetId) {
    const id = String(targetId || '');
    if (!id || !power_user) return false;
    if (!power_user.personas || !(id in power_user.personas)) {
        console.error(`[${EXT}] delete: id not found`, id);
        return false;
    }
    const name = power_user.personas[id];
    delete power_user.personas[id];
    if (power_user.persona_descriptions && id in power_user.persona_descriptions) {
        delete power_user.persona_descriptions[id];
    }
    // If deleted was default / active, clear lightly (ST may also handle via event)
    try {
        if (power_user.default_persona === id) power_user.default_persona = null;
    } catch { /* ignore */ }

    state.selected.delete(id);
    state.compareIds = state.compareIds.filter(x => x !== id);
    if (state.baselineId === id) state.baselineId = state.compareIds[0] || null;
    if (state.focusOtherId === id) state.focusOtherId = state.compareIds.find(x => x !== state.baselineId) || null;

    savePowerUserSettings();
    invalidatePersonaCache('deletePersonaById');
    try {
        const ctx = window.SillyTavern?.getContext?.();
        const es = ctx?.eventSource;
        const types = ctx?.eventTypes || ctx?.event_types;
        if (es?.emit && types?.PERSONA_DELETED) es.emit(types.PERSONA_DELETED, id);
        else if (es?.emit) es.emit('PERSONA_DELETED', id);
    } catch { /* ignore */ }
    console.log(`[${EXT}] deleted persona id=${id} name=${name}`);
    return true;
}

