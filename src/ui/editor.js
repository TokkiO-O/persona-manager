import { getPersonaData, persistPersonaFull } from '../persona-data.js';
import { escapeHtml, computeReadableInk } from '../util.js';
import { EXT } from '../constants.js';
import { state } from '../state.js';

let _afterSave = () => {};
export function setEditorAfterSave(fn) { _afterSave = typeof fn === 'function' ? fn : () => {}; }

export function openFullEditor(rawId) {
    const id = String(rawId || '');
    const p = getPersonaData().find(x => x.id === id);
    if (!p) {
        console.error(`[${EXT}] editor: persona not found`, rawId);
        return;
    }
    const lockedId = p.id;
    const theme = state.settings?.uiTheme || 'sakura';
    const mode = state.settings?.editorMode === 'fullscreen' ? 'fullscreen' : 'popup';

    const overlay = document.createElement('div');
    overlay.className = `pmp18-editor-overlay is-${mode} pmp18-theme-${theme}`;
    overlay.dataset.editId = lockedId;

    overlay.innerHTML = `
        <div class="pmp18-editor pmp18-editor--flex pmp18-editor--wide pmp18-theme-${theme}">
            <div class="pmp18-lace-edge pmp18-lace-top" aria-hidden="true"></div>
            <div class="pmp18-float-stickers" aria-hidden="true">
              <span class="pmp18-fs">♡</span><span class="pmp18-fs">✦</span><span class="pmp18-fs">✿</span><span class="pmp18-fs">❀</span>
            </div>
            <div class="pmp18-editor-head">
                <strong>编辑 Persona</strong>
                <span class="pmp18-muted">${escapeHtml(lockedId)}</span>
                <button type="button" class="pmp18-close pmp18-editor-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="pmp18-editor-body">
                <label class="pmp18-editor-label">显示名称</label>
                <input type="text" class="pmp18-editor-name" value="${escapeHtml(p.name)}" autocomplete="off">
                <label class="pmp18-editor-label">描述</label>
                <textarea class="pmp18-editor-ta" spellcheck="false">${escapeHtml(p.description)}</textarea>
            </div>
            <div class="pmp18-editor-actions">
                <button type="button" class="pmp18-small-btn pmp18-editor-cancel">取消</button>
                <button type="button" class="pmp18-primary-btn pmp18-editor-save">保存</button>
            </div>
            <p class="pmp18-editor-note">仅写入此 ID，不会改其他人设。</p>
            <div class="pmp18-lace-edge pmp18-lace-bottom" aria-hidden="true"></div>
        </div>`;

    const ed = overlay.querySelector('.pmp18-editor');
    const ta = overlay.querySelector('.pmp18-editor-ta');
    ed.style.setProperty('--pmp18-ink', computeReadableInk('#fff5f8'));

    // 用内联样式压过历史 CSS，保证居中 + 大描述区
    const applySize = () => {
        const vv = window.visualViewport;
        const vh = vv ? vv.height : window.innerHeight;
        const vw = vv ? vv.width : window.innerWidth;
        if (mode === 'fullscreen') {
            Object.assign(overlay.style, {
                position: 'fixed', inset: '0', display: 'flex',
                alignItems: 'stretch', justifyContent: 'stretch',
                padding: '0', zIndex: '2147483000', boxSizing: 'border-box',
            });
            Object.assign(ed.style, {
                width: '100%', height: '100%', maxHeight: '100dvh',
                borderRadius: '0', margin: '0',
            });
            if (ta) ta.style.minHeight = Math.max(240, vh - 200) + 'px';
            return;
        }
        const pad = Math.max(12, Math.min(24, vw * 0.04));
        const maxH = Math.min(vh * 0.92, 900);
        const maxW = Math.min(680, vw - pad * 2);
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            width: '100%', height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: pad + 'px',
            boxSizing: 'border-box',
            zIndex: '2147483000',
            margin: '0',
        });
        Object.assign(ed.style, {
            width: maxW + 'px',
            maxWidth: '100%',
            maxHeight: maxH + 'px',
            height: 'auto',
            margin: '0',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxSizing: 'border-box',
        });
        // 描述区至少占弹窗可用高度的 55%
        const taMin = Math.max(320, Math.floor(maxH * 0.55));
        if (ta) {
            ta.style.minHeight = taMin + 'px';
            ta.style.flex = '1 1 auto';
            ta.style.height = 'auto';
            ta.style.maxHeight = 'none';
            ta.style.overflowY = 'auto';
        }
    };
    applySize();

    let cleanup = () => {};
    if (window.visualViewport) {
        const onResize = () => applySize();
        window.visualViewport.addEventListener('resize', onResize);
        window.addEventListener('resize', onResize);
        cleanup = () => {
            window.visualViewport.removeEventListener('resize', onResize);
            window.removeEventListener('resize', onResize);
        };
    }

    const close = () => { cleanup(); overlay.remove(); };
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.pmp18-editor-save').onclick = () => {
        const newName = overlay.querySelector('.pmp18-editor-name').value.trim() || p.name;
        const newDesc = overlay.querySelector('.pmp18-editor-ta').value;
        if (overlay.dataset.editId !== lockedId) {
            if (typeof toastr !== 'undefined') toastr.error('保存中止：目标 ID 异常');
            return;
        }
        if (newName === p.name && newDesc === p.description) { close(); return; }
        if (!window.confirm(`确认写回「${p.name}」？`)) return;
        const ok = persistPersonaFull(lockedId, newName, newDesc);
        close();
        if (ok && typeof toastr !== 'undefined') toastr.success(`已保存：${newName}`);
        _afterSave();
    };
    document.body.appendChild(overlay);
    requestAnimationFrame(applySize);
}
