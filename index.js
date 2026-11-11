/**
 * Persona Manager — persona library, comparison and editing
 */

import { EXT, VERSION } from './src/constants.js';
import { ensureRoot, openManager, closeManager, renderManager, scheduleRender } from './src/ui/render.js';
import { scheduleAutoUpdateCheck } from './src/update.js';
import { setEditorAfterSave } from './src/ui/editor.js';
import { setUpdateUiRefresh } from './src/update.js';
import { installEntryObserver, setEntryOpenManager } from './src/entry.js';
import { installPersonaListener, setPersonaListenerRefresh } from './src/persona-listener.js';
import { state } from './src/state.js';
import { initializeHostBridge } from './power-user-bridge.js';
import { refreshUpdateIndicators } from './src/ui/render.js';

const refresh = () => {
    if (!state.active) return;
    try {
        if (typeof scheduleRender === 'function') scheduleRender();
        else renderManager();
    } catch (e) {
        console.error(`[${EXT}] refresh failed`, e);
    }
};
setUpdateUiRefresh(refreshUpdateIndicators);
setPersonaListenerRefresh(refresh);
setEditorAfterSave(refresh);
setEntryOpenManager((tab) => openManager(tab || 'all'));
window.openPersonaManager = () => openManager('all');
if(window.__pmp18WorkspaceRefresh)window.removeEventListener('pmp18-workspace-saved',window.__pmp18WorkspaceRefresh);
window.__pmp18WorkspaceRefresh=refresh;
window.addEventListener('pmp18-workspace-saved',refresh);

function installKeyboardHandler() {
    if (window.__pmp18Keyboard) return;
    window.__pmp18Keyboard = true;
    document.addEventListener('keydown', event => {
        if (!state.active) return;
        if (event.key === 'Escape' && !document.querySelector('.pmp18-editor-overlay')) closeManager();
    });
}

async function init() {
    await initializeHostBridge();
    ensureRoot();
    installKeyboardHandler();
    installEntryObserver();
    installPersonaListener();
    scheduleAutoUpdateCheck();
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

