import { STORAGE_KEY, defaultSettings } from './constants.js';

export function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...defaultSettings };
        return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
        return { ...defaultSettings };
    }
}

/** Mutable UI + app state (single source of truth) */
export const state = {
    active: false,
    tab: 'all',
    query: '',
    selected: new Set(),
    compareIds: [],
    baselineId: null,
    focusOtherId: null,
    settings: loadSettings(),
    updateInfo: null,
    // v1.9.15: compare view UI state (not persisted, session-only)
    viewMode: null,        // 'stacked' | 'side' | null (auto)
    showToc: false,        // diff table-of-contents drawer
    tocQuery: '',          // search within diff
};

export function saveSettingsLocal() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch { /* ignore */ }
}
