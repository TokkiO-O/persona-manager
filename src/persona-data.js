import { power_user, getHostAvatarId, getHostContext, getHostSave, initializeHostBridge, syncHostPersonaName } from '../power-user-bridge.js';
import { EXT } from './constants.js';
import { state } from './state.js';
import { normalizeText } from './util.js';
import { invalidateGroupMemo } from './similarity.js';
import { getStRequestHeaders } from './update.js';
import { stageRevisionBatch, finishRevisionBatch } from './library-store.js';

function hasPowerUser() {
    try {
        return !!(getLivePowerUser());
    } catch {
        return false;
    }
}

/** Prefer live module binding; fall back to getContext().powerUserSettings */
export function getLivePowerUser() {
    try {
        if (power_user && typeof power_user === 'object' && power_user.personas) return power_user;
    } catch { /* ignore */ }
    try {
        const ctx = window.SillyTavern?.getContext?.();
        if (ctx?.powerUserSettings) return ctx.powerUserSettings;
        if (ctx?.powerUser) return ctx.powerUser;
    } catch { /* ignore */ }
    try {
        if (power_user && typeof power_user === 'object') return power_user;
    } catch { /* ignore */ }
    return null;
}

/* ---------- 人设读写（按 id 安全更新） ---------- */

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
    try { return getHostAvatarId() || String(getLivePowerUser()?.user_avatar || ''); }
    catch { return ''; }
}

/* ---------- 人设数据：读 / 写 / 删（带缓存） ---------- */

export let _personaCache = null;     // { version, items }
export let _personaVersion = 0;

// Bump whenever the underlying power_user data is mutated through this module,
// or any external write that we know about (PERSONA_UPDATED / PERSONA_DELETED
// event).
export function invalidatePersonaCache(reason) {
    _personaCache = null;
    try { invalidateGroupMemo(); } catch { /* ignore */ }
}

/**
 * ST keeps persona avatars on disk; power_user.personas can lag behind.
 * Pull /api/avatars/get and merge missing ids into the live store so the
 * manager sees newly created personas without a full page reload.
 */
/**
 * Refresh persona visibility from disk WITHOUT writing placeholder names
 * into power_user (writing "[未命名]" / letting ST call addMissingPersonas
 * produces leftover "[Unnamed Persona]" entries).
 *
 * ST already registers new personas in power_user when you create them in UI.
 * We only invalidate caches and optionally note disk file ids for debug.
 */
export async function syncPersonasFromAvatarFiles() {
    const pu = getLivePowerUser();
    if (!pu) return false;
    try {
        const headers = await getStRequestHeaders();
        const res = await fetch('/api/avatars/get', {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({}),
        });
        if (!res.ok) {
            console.warn(`[${EXT}] /api/avatars/get HTTP`, res.status);
            invalidatePersonaCache('syncAvatars-fail');
            return false;
        }
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.images || data?.avatars || []);
        const diskIds = new Set();
        if (Array.isArray(list)) {
            for (const item of list) {
                const id = String(typeof item === 'string' ? item : (item?.filename || item?.name || item?.avatar || '')).trim();
                if (id) diskIds.add(id);
            }
        }
        // If power_user has entries whose avatar file is gone, drop them (stale)
        let removed = 0;
        if (pu.personas && diskIds.size) {
            for (const id of Object.keys(pu.personas)) {
                if (!diskIds.has(id)) {
                    // Only auto-remove obvious placeholders left by old sync / ST
                    const name = String(pu.personas[id] || '');
                    if (name === '[未命名]' || name === '[Unnamed Persona]' || name === 'Unnamed Persona') {
                        delete pu.personas[id];
                        if (pu.persona_descriptions) delete pu.persona_descriptions[id];
                        removed += 1;
                    }
                }
            }
            if (removed) {
                await savePowerUserSettings();
                console.log(`[${EXT}] removed ${removed} stale Unnamed placeholder(s)`);
            }
        }
        invalidatePersonaCache(`syncAvatars:disk=${diskIds.size},removed=${removed}`);
        return removed > 0;
    } catch (e) {
        console.warn(`[${EXT}] syncPersonasFromAvatarFiles failed`, e);
        invalidatePersonaCache('syncAvatars-error');
        return false;
    }
}

/**
 * Returns parsed persona list, with shape:
 *   { id, name, title, description, nameKey, descriptionKey }.
 * Memoized: re-renders don't re-parse descriptions. Invalidated by
 * PERSONA_UPDATED / PERSONA_DELETED events and by our own writes.
 */
function personaStoreSig(pu) {
    if (!pu?.personas) return '';
    const ids = Object.keys(pu.personas).sort();
    const descs = pu.persona_descriptions || {};
    return JSON.stringify(ids.map(id => [id, pu.personas[id], getPersonaDescription(descs[id]), getPersonaTitle(descs[id])]));
}

export function getPersonaData() {
    const pu = getLivePowerUser();
    if (!pu) {
        console.warn(`[${EXT}] power_user unavailable — persona list empty`);
        _personaCache = null;
        return [];
    }

    const sig = personaStoreSig(pu);
    if (_personaCache && _personaCache.sig === sig) {
        return _personaCache.items;
    }

    const personas = pu.personas || {};
    const descriptions = pu.persona_descriptions || {};
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
    const frozen = Object.freeze(items.map(item => Object.freeze(item)));
    _personaCache = { items: frozen, sig, version: ++_personaVersion };
    return frozen;
}

export function formatPersonaSubline(persona) {
    // 备注优先，没有则退回短 ID，用于同名同头像区分
    if (persona.title) return persona.title;
    const id = String(persona.id || '');
    if (id.length <= 18) return id;
    return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export async function savePowerUserSettings() {
    await getHostSave()();
    return true;
}

export function emitPersonaUpdated(id) {
    try {
        const ctx = getHostContext();
        const es = ctx?.eventSource;
        const types = ctx?.eventTypes || ctx?.event_types;
        if (es?.emit && types?.PERSONA_UPDATED) {
            Promise.resolve(es.emit(types.PERSONA_UPDATED, id)).catch(console.error);
            return;
        }
        if (es?.emit) Promise.resolve(es.emit('persona_updated', id)).catch(console.error);
    } catch { /* ignore */ }
}

/**
 * Write ONLY this avatar id.
 * Never copy edited text onto the currently selected persona unless ids match.
 */
let writeQueue = Promise.resolve();

/** One settings save for the whole batch; unchanged sides are never rewritten. */
export function persistPersonaBatch(changes, options = {}) {
    const operation = writeQueue.then(() => writePersonaBatch(changes, options));
    writeQueue = operation.catch(() => {});
    return operation;
}

async function writePersonaBatch(changes, { allowCreate = false } = {}) {
    await initializeHostBridge();
    const pu = getLivePowerUser();
    if (!pu) throw new Error('暂时无法读取酒馆人设，请稍后重试。');
    const save = getHostSave();
    const seen = new Set();
    const prepared = changes.map(change => {
        const id = String(change.id || '');
        if (!id || seen.has(id)) throw new Error('目标人设 ID 无效或重复。');
        seen.add(id);
        const exists = Object.prototype.hasOwnProperty.call(pu.personas || {}, id);
        if (!exists && !allowCreate) throw new Error('此人设已被删除，保存已停止。');
        const previousName = pu.personas?.[id];
        const previous = pu.persona_descriptions?.[id];
        if (change.expected && (String(previousName ?? id) !== change.expected.name || getPersonaDescription(previous) !== change.expected.description || Object.prototype.hasOwnProperty.call(change.expected,'rawMetadata')&&JSON.stringify(previous)!==JSON.stringify(change.expected.rawMetadata))) {
            throw new Error('此人设已在别处修改。请保留当前草稿，重新打开后再合并。');
        }
        const nextName = String(change.name ?? previousName ?? id);
        const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
        const next = { ...base, ...change.metadata, description: String(change.description ?? '') };
        return { id, exists, previousName, previous, previousFingerprint: JSON.stringify([previousName,previous]), hadDescription: Object.prototype.hasOwnProperty.call(pu.persona_descriptions || {}, id), nextName, next, audit: change.audit || [], reason: change.reason || '编辑保存' };
    }).filter(item => !item.exists || item.nextName !== item.previousName || JSON.stringify(item.next) !== JSON.stringify(item.previous));
    if (!prepared.length) return true;
    const batchId = await stageRevisionBatch(prepared.map(item => ({
        personaId: item.id,
        before: item.exists ? { name: String(item.previousName ?? item.id), description: getPersonaDescription(item.previous), metadata: structuredClone(item.previous && typeof item.previous === 'object' && !Array.isArray(item.previous) ? item.previous : {}) } : null,
        after: { name: item.nextName, description: item.next.description, metadata: structuredClone(item.next) },
        audit: item.audit, reason: item.reason,
    })));
    if (getLivePowerUser() !== pu || prepared.some(item => JSON.stringify([pu.personas?.[item.id],pu.persona_descriptions?.[item.id]]) !== item.previousFingerprint)) {
        await finishRevisionBatch(batchId, false);
        throw new Error('人设在准备保存时已被修改，草稿已保留，请重新对照。');
    }
    pu.personas ||= {};
    pu.persona_descriptions ||= {};
    const activeId = getActiveAvatarId();
    const oldActive = pu.persona_description;
    const active = prepared.find(item => item.id === activeId);
    for (const item of prepared) {
        pu.personas[item.id] = item.nextName;
        pu.persona_descriptions[item.id] = item.next;
    }
    if (active) pu.persona_description = active.next.description;
    try {
        await save();
    } catch (error) {
        for (const item of prepared) {
            if (pu.persona_descriptions[item.id] !== item.next) continue;
            if (item.hadDescription) pu.persona_descriptions[item.id] = item.previous;
            else delete pu.persona_descriptions[item.id];
            if (pu.personas[item.id] === item.nextName) {
                if (item.exists) pu.personas[item.id] = item.previousName;
                else delete pu.personas[item.id];
            }
        }
        if (active && pu.persona_description === active.next.description) pu.persona_description = oldActive;
        invalidatePersonaCache('save-failed');
        await finishRevisionBatch(batchId, false).catch(console.error);
        throw new Error(`保存失败，草稿仍保留：${error?.message || error}`);
    }
    try { await finishRevisionBatch(batchId, true); }
    catch (error) {
        console.warn(`[${EXT}] history finalization`, error);
        if (typeof toastr !== 'undefined') toastr.warning('人设已写回，版本快照保留待核对。请到资料页检查。');
    }
    if (active) {
        const ta = document.querySelector('#persona_description, textarea[name="persona_description"], #persona-description-textarea');
        if (ta && ta.value !== active.next.description) {
            ta.value = active.next.description;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (active.nextName !== active.previousName) {
            try { syncHostPersonaName(active.nextName); } catch (error) { console.warn(`[${EXT}] name UI sync`, error); }
        }
    }
    invalidatePersonaCache('persistPersonaBatch');
    prepared.forEach(item => emitPersonaUpdated(item.id));
    return true;
}

export function persistPersonaDescription(targetId, description, options = {}) {
    return persistPersonaBatch([{ id: targetId, description, ...options }]);
}

export function persistPersonaFull(targetId, name, description, options = {}) {
    return persistPersonaBatch([{ id: targetId, name, description, ...options }]);
}

export async function deletePersonaById(targetId) {
    const id = String(targetId || '').trim();
    if (!id) return false;

    const pu = getLivePowerUser();
    if (!pu) {
        console.error(`[${EXT}] delete: power_user unavailable`);
        throw new Error('无法访问 power_user，删除中止');
    }

    // Normalize id (sometimes UI stores encoded names)
    let avatarKey = id;
    try {
        const decoded = decodeURIComponent(id);
        if (pu.personas && (decoded in pu.personas) && !(id in pu.personas)) avatarKey = decoded;
    } catch { /* ignore */ }

    const name = (pu.personas && pu.personas[avatarKey]) || avatarKey;

    // 1) Server: delete avatar file (ST will re-create persona from file if this fails)
    const headers = await getStRequestHeaders();
    let apiOk = false;
    let apiStatus = 0;
    let apiText = '';
    try {
        const res = await fetch('/api/avatars/delete', {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({ avatar: avatarKey }),
        });
        apiStatus = res.status;
        apiText = await res.text().catch(() => '');
        apiOk = res.ok;
        console.log(`[${EXT}] /api/avatars/delete`, apiStatus, apiText || '(empty)');
    } catch (e) {
        console.error(`[${EXT}] /api/avatars/delete network error`, e);
        throw new Error(`删除头像请求失败：${e?.message || e}`);
    }

    // 404 = file already gone — still clean settings
    if (!apiOk && apiStatus !== 404) {
        throw new Error(`删除头像失败 HTTP ${apiStatus} ${apiText}`.trim());
    }

    // 2) Settings cleanup (mirror ST deletePersona)
    if (pu.personas) delete pu.personas[avatarKey];
    if (pu.persona_descriptions) delete pu.persona_descriptions[avatarKey];
    try {
        if (pu.default_persona === avatarKey) pu.default_persona = null;
    } catch { /* ignore */ }

    // Also mutate module binding if different object
    try {
        if (power_user && power_user !== pu) {
            if (power_user.personas) delete power_user.personas[avatarKey];
            if (power_user.persona_descriptions) delete power_user.persona_descriptions[avatarKey];
            if (power_user.default_persona === avatarKey) power_user.default_persona = null;
        }
    } catch { /* ignore */ }

    state.selected.delete(id);
    state.selected.delete(avatarKey);
    state.compareIds = state.compareIds.filter(x => x !== id && x !== avatarKey);
    if (state.baselineId === id || state.baselineId === avatarKey) {
        state.baselineId = state.compareIds[0] || null;
    }
    if (state.focusOtherId === id || state.focusOtherId === avatarKey) {
        state.focusOtherId = state.compareIds.find(x => x !== state.baselineId) || null;
    }

    await savePowerUserSettings();

    invalidatePersonaCache('deletePersonaById');

    // 3) Event
    try {
        const ctx = window.SillyTavern?.getContext?.();
        const es = ctx?.eventSource;
        const types = ctx?.eventTypes || ctx?.event_types;
        const payload = { avatarId: avatarKey, name };
        if (es?.emit && types?.PERSONA_DELETED) await es.emit(types.PERSONA_DELETED, payload);
        else if (es?.emit) await es.emit('PERSONA_DELETED', payload);
    } catch { /* ignore */ }

    // 4) Refresh native persona list / remove DOM leftovers
    // Do NOT call getUserAvatars() here: ST's addMissingPersonas will recreate
    // "[Unnamed Persona]" if the filesystem/API briefly still lists the file.
    // Native panel refreshes on next open; we already removed power_user entries.

    try {
        document.querySelectorAll(`[data-avatar-id="${CSS.escape(avatarKey)}"]`).forEach(el => {
            const card = el.closest('.avatar-container, .persona_block, [class*="persona"]');
            if (card) card.remove();
            else el.remove();
        });
    } catch { /* ignore */ }

    console.log(`[${EXT}] deleted persona id=${avatarKey} name=${name} api=${apiStatus}`);
    return true;
}

export async function confirmDeletePersona(label, id) {
    const title = `删除人设：${label}`;
    const bodyHtml = `确定删除「${escapeHtmlSafe(label)}」？<br/>ID: <code>${escapeHtmlSafe(id)}</code><br/><br/>将删除头像文件与关联设定，不可自动恢复。`;
    const bodyText = `确定删除「${label}」？\nID: ${id}\n\n将删除头像文件与关联设定，不可自动恢复。`;
    try {
        const Popup = window.Popup || window.SillyTavern?.getContext?.()?.Popup;
        if (Popup?.show?.confirm) {
            const ok = await Popup.show.confirm(title, bodyHtml);
            return !!ok;
        }
    } catch { /* ignore */ }
    try {
        const ctx = window.SillyTavern?.getContext?.();
        if (typeof ctx?.callGenericPopup === 'function') {
            const type = ctx.POPUP_TYPE?.CONFIRM ?? 1;
            const result = await ctx.callGenericPopup(bodyHtml, type, title);
            if (result === 1 || result === true || result === ctx.POPUP_RESULT?.AFFIRMATIVE) return true;
            if (result === 0 || result === false || result === ctx.POPUP_RESULT?.CANCELLED) return false;
            return !!result;
        }
    } catch { /* ignore */ }
    return window.confirm(`${title}\n\n${bodyText}`);
}

function escapeHtmlSafe(v) {
    return String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}


