import { getPersonaData, persistPersonaFull } from '../persona-data.js';
import { escapeHtml } from '../util.js';
import { state, saveSettingsLocal } from '../state.js';
import { createStudioDialog } from './dialog.js';
import { createDraftSession } from './draft-session.js';
import { openHistoryDialog } from './history.js';
import { textFromTextarea } from '../text-edit.js';

let afterSave = () => {};
export function setEditorAfterSave(fn) { afterSave = typeof fn === 'function' ? fn : () => {}; }

export function openFullEditor(rawId, { resumeDraft = null } = {}) {
    const persona = getPersonaData().find(p => p.id === String(rawId || ''));
    if (!persona) return;
    let dirty = false, busy = false, session = null, expected = persona, descriptionRaw=persona.description;
    const dialog = createStudioDialog({
        className: 'pmp18-full-editor-overlay',
        title: '编辑人设',
        subtitle: persona.title || persona.name,
        body: `<div class="pmp18-editor-body"><div class="pmp18-editor-details" id="pmp18-editor-details"><label class="pmp18-editor-label" for="pmp18-edit-name">显示名称</label><input id="pmp18-edit-name" class="pmp18-editor-name" value="${escapeHtml(persona.name)}" autocomplete="off"></div><div class="pmp18-field-heading"><label class="pmp18-editor-label" for="pmp18-edit-description">人设描述</label><span data-char-count></span></div><textarea id="pmp18-edit-description" class="pmp18-editor-ta" spellcheck="false">${escapeHtml(persona.description)}</textarea><p class="pmp18-field-hint">保留原文缩进与空行 · ID ${escapeHtml(persona.id)}</p></div>`,
        footer: '<div class="pmp18-editor-footer-info"><span class="pmp18-save-status">尚未修改</span><button type="button" class="pmp18-text-btn" data-open-persona-history>历史与来源</button></div><div class="pmp18-footer-actions"><button type="button" class="pmp18-small-btn pmp18-editor-cancel" data-close>暂存并关闭</button><button type="button" class="pmp18-primary-btn pmp18-editor-save">保存修改</button></div>',
        canClose: () => !busy && (session ? session.beforeClose() : true),
        onClose: () => session?.dispose(),
    });
    const { overlay } = dialog;
    overlay.dataset.editId = persona.id;
    overlay.querySelector('[data-close]').classList.add('pmp18-editor-close');
    const name = overlay.querySelector('.pmp18-editor-name');
    const description = overlay.querySelector('.pmp18-editor-ta');
    const close = overlay.querySelector('.pmp18-studio-close');
    const actions = document.createElement('div');
    actions.className = 'pmp18-editor-head-actions';
    actions.innerHTML = '<button type="button" class="pmp18-small-btn" data-editor-details aria-controls="pmp18-editor-details">名称</button><button type="button" class="pmp18-small-btn" data-editor-mode-toggle></button>';
    close.before(actions); actions.append(close);
    const details = actions.querySelector('[data-editor-details]');
    const mode = actions.querySelector('[data-editor-mode-toggle]');
    const setDetails = open => {
        overlay.classList.toggle('is-details-open', open);
        details.setAttribute('aria-expanded', String(open));
    };
    const setMode = fullscreen => {
        const focused = document.activeElement;
        const selection = [description.selectionStart, description.selectionEnd, description.selectionDirection];
        const scroll = description.scrollTop;
        overlay.classList.toggle('is-fullscreen', fullscreen);
        overlay.classList.toggle('is-popup', !fullscreen);
        mode.textContent = fullscreen ? '弹窗' : '全屏';
        mode.setAttribute('aria-label', fullscreen ? '切换为弹窗编辑' : '切换为全屏编辑');
        setDetails(!fullscreen && !overlay.classList.contains('is-keyboard-open'));
        // Change the frame without replacing the textarea or losing its selection/undo.
        if (focused === description) { description.focus({ preventScroll: true }); description.setSelectionRange(...selection); }
        else if (focused === name && fullscreen) description.focus({ preventScroll: true });
        description.scrollTop = scroll;
    };
    setMode(state.settings.editorMode === 'fullscreen');
    mode.addEventListener('pointerdown', event => { if (document.activeElement === description) event.preventDefault(); });
    mode.onclick = () => {
        const fullscreen = !overlay.classList.contains('is-fullscreen');
        setMode(fullscreen);
        state.settings.editorMode = fullscreen ? 'fullscreen' : 'popup';
        if (!saveSettingsLocal()) dialog.error('本次显示方式已切换，下次打开时可能需要重新选择。');
    };
    details.onclick = () => {
        const open = !overlay.classList.contains('is-details-open') || (overlay.classList.contains('is-keyboard-open') && overlay.classList.contains('is-editing-description'));
        setDetails(open);
        if (open) overlay.classList.remove('is-editing-description');
        (open ? name : description).focus({ preventScroll: true });
    };
    overlay.addEventListener('focusin', event => {
        if (event.target === description || event.target === name) overlay.classList.toggle('is-editing-description', event.target === description);
        if (event.target === description && window.matchMedia('(max-width:700px), (max-width:1000px) and (max-height:500px)').matches) setDetails(false);
    });
    description.value=descriptionRaw;
    const save = overlay.querySelector('.pmp18-editor-save');
    const update = () => {
        descriptionRaw=textFromTextarea(description.value,descriptionRaw);
        dirty = name.value !== expected.name || descriptionRaw !== expected.description;
        overlay.querySelector('[data-char-count]').textContent = `${description.value.length.toLocaleString()} 字`;
        overlay.querySelector('.pmp18-save-status').textContent = dirty ? '有未保存的修改' : '尚未修改';
        session?.touch();
    };
    name.addEventListener('input', update);
    description.addEventListener('input', update);
    update();
    overlay.querySelector('[data-open-persona-history]').onclick=()=>openHistoryDialog(persona.id);
    session=createDraftSession({type:'editor',personaIds:[persona.id],label:`编辑 · ${persona.name}`,dialog,isDirty:()=>dirty,capture:()=>({base:{[persona.id]:expected},payload:{name:name.value,description:descriptionRaw}}),initialDraft:resumeDraft,onRestore:({payload,bases})=>{expected=bases[persona.id]||expected;name.value=payload.name;descriptionRaw=payload.description;description.value=descriptionRaw;update();}});
    save.onclick = async () => {
        if (busy) return;
        if (overlay.dataset.editId !== persona.id) { dialog.error('目标 ID 异常，保存已停止。'); return; }
        const nextName = name.value.trim() || persona.name;
        const nextDescription = descriptionRaw;
        if (nextName === expected.name && nextDescription === expected.description) { await session.saved();dialog.close(true); return; }
        busy = true;
        save.disabled = true;
        save.textContent = '正在保存…';
        name.disabled = description.disabled = true;
        dialog.error();
        try {
            await session.flush();
            await persistPersonaFull(persona.id, nextName, nextDescription, { expected, reason:'编辑人设' });
            await session.saved();
            dirty = false;
            dialog.close(true);
            if (typeof toastr !== 'undefined') toastr.success(`已保存：${nextName}`);
            afterSave();
        } catch (error) { dialog.error(error?.message || '保存失败，内容仍保留在编辑器中。'); }
        finally {
            busy = false;
            save.disabled = false;
            name.disabled = description.disabled = false;
            save.textContent = '保存修改';
        }
    };
    return overlay;
}
