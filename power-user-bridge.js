/** Keep host-version differences at the extension boundary. */
export { power_user } from '../../../power-user.js';
import * as script from '../../../../script.js';

let personas = null;
let ready = null;

export function initializeHostBridge() {
    if (!ready) ready = import('../../../personas.js').then(module => { personas = module; }).catch(() => {});
    return ready;
}

export function getHostContext() {
    return window.SillyTavern?.getContext?.() || {};
}

export function getHostAvatarId() {
    const ctx = getHostContext();
    return String(personas?.user_avatar || script.user_avatar || ctx.userAvatar || ctx.user_avatar || window.user_avatar || '');
}

export function getHostSave() {
    const ctx = getHostContext();
    for (const [owner, name] of [[ctx, 'saveSettingsDebounced'], [script, 'saveSettingsDebounced'], [window, 'saveSettingsDebounced'], [script, 'saveSettings'], [window, 'saveSettings']]) {
        if (typeof owner?.[name] === 'function') return owner[name].bind(owner);
    }
    throw new Error('酒馆保存接口暂不可用，请保留内容后重试。');
}

export function syncHostPersonaName(name) {
    const setName = script.setUserName || getHostContext().setUserName;
    if (typeof setName === 'function') setName(name, { toastPersonaNameChange: false });
}

export function getNativePersonaFilter() {
    return personas?.personasFilter || script.personasFilter || getHostContext().personasFilter || null;
}

