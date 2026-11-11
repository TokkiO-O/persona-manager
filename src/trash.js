import { state, saveSettingsLocal } from './state.js';
import { getPersonaDescription, getPersonaTitle, getPersonaData, getLivePowerUser, persistPersonaBatch, invalidatePersonaCache } from './persona-data.js';
import { power_user } from '../power-user-bridge.js';

function getTrash() {
    if (!Array.isArray(state.settings.trash)) state.settings.trash = [];
    return state.settings.trash;
}

export function pushToTrash(snapshot) {
    const trash = getTrash();
    const id = String(snapshot.id || '');
    if (!id) return;
    // dedupe by id — keep latest
    const next = trash.filter(x => x.id !== id);
    next.unshift({
        id,
        name: String(snapshot.name || id),
        description: String(snapshot.description || ''),
        title: String(snapshot.title || ''),
        deletedAt: Date.now(),
    });
    // cap 50
    state.settings.trash = next.slice(0, 50);
    saveSettingsLocal();
}

export function snapshotPersona(personaOrId) {
    if (personaOrId && typeof personaOrId === 'object') {
        return {
            id: personaOrId.id,
            name: personaOrId.name,
            description: personaOrId.description || '',
            title: personaOrId.title || '',
        };
    }
    const id = String(personaOrId || '');
    const all = getPersonaData();
    const p = all.find(x => x.id === id);
    if (p) return snapshotPersona(p);
    // fallback live
    try {
        const name = power_user?.personas?.[id] || id;
        const raw = power_user?.persona_descriptions?.[id];
        return {
            id,
            name: String(name),
            description: getPersonaDescription(raw),
            title: getPersonaTitle(raw),
        };
    } catch {
        return { id, name: id, description: '', title: '' };
    }
}

export function listTrash() {
    const maxDays = Number(state.settings.trashMaxDays) || 0;
    const trash = getTrash();
    if (maxDays > 0) {
        const cut = Date.now() - maxDays * 86400000;
        const kept = trash.filter(x => (x.deletedAt || 0) >= cut);
        if (kept.length !== trash.length) {
            state.settings.trash = kept;
            saveSettingsLocal();
        }
        return kept;
    }
    return trash;
}

export function purgeTrashItem(id) {
    state.settings.trash = getTrash().filter(x => x.id !== id);
    saveSettingsLocal();
}

export function emptyTrash() {
    state.settings.trash = [];
    saveSettingsLocal();
}

/** Restore into power_user.personas (avatar file may be gone — name/desc still restored) */
export async function restoreFromTrash(id) {
    const item = getTrash().find(x => x.id === id);
    if (!item) return false;
    try {
        if (Object.prototype.hasOwnProperty.call(getLivePowerUser()?.personas || {}, item.id)) throw new Error('同 ID 的人设已存在，已停止恢复。');
        const ok = await persistPersonaBatch([{ id: item.id, name: item.name || item.id, description: item.description || '', metadata: { title: item.title || '' } }], { allowCreate: true });
        purgeTrashItem(id);
        invalidatePersonaCache('restoreFromTrash');
        return ok;
    } catch (e) {
        console.error('[Persona Manager] restore failed', e);
        return false;
    }
}

