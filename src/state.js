import { STORAGE_KEY, defaultSettings, normalizeThemeId } from './constants.js';

export function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const settings = { ...structuredClone(defaultSettings), ...(raw ? JSON.parse(raw) : {}) };
        settings.uiTheme = normalizeThemeId(settings.uiTheme);
        return settings;
    } catch {
        return structuredClone(defaultSettings);
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
    viewMode: 'side',      // 'stacked' | 'side' — 默认左右；窄屏仍强制上下
    showToc: false,
    tocQuery: '',
    compareChromeOpen: false, // 工具区是否展开
    listDensity: 'comfy', // 'comfy' | 'compact'
    groupFold: {}, // groupKey -> true if folded
    filterTagId: null,
    filterCategoryId: null,
};

export function saveSettingsLocal() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
        return true;
    } catch { return false; }
}

