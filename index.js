/**
 * Persona Manager v1.9.0 — ES module entry
 *
 * Directory:
 *   index.js
 *   style.css
 *   manifest.json
 *   src/constants.js state.js util.js
 *   src/persona-data.js similarity.js diff.js
 *   src/update.js entry.js persona-listener.js
 *   src/ui/components.js compare.js editor.js render.js
 */

import { EXT, VERSION } from './src/constants.js';
import { ensureRoot, openManager, closeManager, renderManager, scheduleRender } from './src/ui/render.js';
import { setEditorAfterSave } from './src/ui/editor.js';
import { setUpdateUiRefresh } from './src/update.js';
import { installEntryObserver } from './src/entry.js';
import { installPersonaListener, setPersonaListenerRefresh } from './src/persona-listener.js';
import { state } from './src/state.js';

// Wire refresh callbacks (avoid circular imports between ui / update / listener)
const refresh = () => {
    try {
        if (typeof scheduleRender === 'function') scheduleRender();
        else renderManager();
    } catch (e) {
        console.error(`[${EXT}] refresh failed`, e);
    }
};
setUpdateUiRefresh(refresh);
setPersonaListenerRefresh(refresh);
setEditorAfterSave(refresh);

function installKeyboardHandler() {
    if (window.__pmp18Keyboard) return;
    window.__pmp18Keyboard = true;
    document.addEventListener('keydown', event => {
        if (!state.active) return;
        if (event.key === 'Escape' && !document.querySelector('.pmp18-editor-overlay')) closeManager();
    });
}

async function init() {
    ensureRoot();
    installKeyboardHandler();
    installEntryObserver();
    installPersonaListener();
    window.openPersonaManager = () => openManager('all');
    console.log(`[${EXT}] v${VERSION} loaded (modular)`);
}

(async () => {
    try {
        await init();
    } catch (error) {
        console.error(`[${EXT}] 初始化失败`, error);
        if (typeof toastr !== 'undefined') toastr.error(`${EXT} 初始化失败：${error?.message || error}`);
    }
})();

export function onUpdate() {
    location.reload();
}
