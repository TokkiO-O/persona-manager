import { escapeHtml } from '../util.js';
import { getPersonaData, persistPersonaFull } from '../persona-data.js';
import { lineRanges, applyTextEdit, textFromTextarea } from '../text-edit.js';
import { createStudioDialog, renderResultPreview } from './dialog.js';
import { createDraftSession } from './draft-session.js';

const MODES = [
    ['append', '追加末尾', '保留全文，在最后加入片段', '+'],
    ['before', '插入之前', '放到选中行的前面', '↑'],
    ['after', '插入之后', '放到选中行的后面', '↓'],
    ['replace', '替换选中', '只替换勾选的行，保留其他内容', '↔'],
    ['replace-all', '替换全文', '用此片段替换整个基准', '↺'],
];

export function openAdoptDialog({ baselineId, snippet, onDone, sourceId = '', sourceName = '', resumeDraft = null }) {
    const originalSnippet = String(snippet ?? '');
    if (!originalSnippet.trim()) return;
    let base = getPersonaData().find(p => p.id === baselineId);
    if (!base) return;
    let lines = lineRanges(base.description), session = null, draftSignature = '';
    const anchors = new Set();
    let mode = 'append', diff = false, busy = false, changed = false, next = base.description;
    const dialog = createStudioDialog({
        className: 'pmp18-adopt-overlay',
        title: '采纳到基准',
        subtitle: `把选中的灵感，放进「${base.name}」`,
        body: `<div class="pmp18-adopt-layout"><aside class="pmp18-adopt-controls"><div class="pmp18-section-heading"><span class="pmp18-step">01</span><h3>准备片段</h3><span data-snippet-count></span></div><textarea class="pmp18-adopt-source" aria-label="将采纳的片段" spellcheck="false">${escapeHtml(originalSnippet)}</textarea><p class="pmp18-field-hint">可以先润色片段，右侧会实时预览。</p><div class="pmp18-section-heading"><span class="pmp18-step">02</span><h3>选择写入方式</h3></div><div class="pmp18-adopt-modes">${MODES.map(([key, name, hint, icon]) => `<label class="pmp18-adopt-mode ${key === mode ? 'is-on' : ''}"><input type="radio" name="pmp-adopt-mode" value="${key}" ${key === mode ? 'checked' : ''} ${!lines.length && ['before','after','replace'].includes(key) ? 'disabled' : ''}><span class="pmp18-mode-icon" aria-hidden="true">${icon}</span><span><strong>${name}</strong><small>${hint}</small></span></label>`).join('')}</div></aside><section class="pmp18-adopt-main"><div class="pmp18-adopt-anchor-wrap" hidden><div class="pmp18-section-heading"><h3>选择基准中的行</h3><span data-anchor-count>未选中</span><button type="button" class="pmp18-text-btn" data-clear-anchors>清除</button></div><div class="pmp18-adopt-lines" role="group" aria-label="选择锚点行">${lines.map((line, i) => `<button type="button" class="pmp18-adopt-line" data-i="${i}" aria-pressed="false"><span class="pmp18-adopt-line-no">${i + 1}</span><span class="pmp18-adopt-line-text">${escapeHtml(line.label || '（空行）')}</span><span class="pmp18-line-check" aria-hidden="true">✓</span></button>`).join('')}</div></div><div class="pmp18-preview-panel"><div class="pmp18-preview-heading"><div><span class="pmp18-eyebrow">LIVE PREVIEW</span><h3>${escapeHtml(base.name)} <span class="pmp18-preview-badge">写入后</span></h3></div><div class="pmp18-segment"><button type="button" data-preview="result" class="is-on">完整结果</button><button type="button" data-preview="diff">修改对照</button></div></div><div class="pmp18-preview-content" tabindex="0"></div></div></section></div>`,
        footer: '<span class="pmp18-save-status" aria-live="polite"></span><div class="pmp18-footer-actions"><button type="button" class="pmp18-small-btn" data-reset>重置</button><button type="button" class="pmp18-small-btn pmp18-adopt-close" data-close>暂存并关闭</button><button type="button" class="pmp18-primary-btn pmp18-adopt-confirm">确认采纳</button></div>',
        canClose: () => !busy && (session ? session.beforeClose() : true),
        onClose: () => session?.dispose(),
    });
    const { overlay } = dialog;
    const source = overlay.querySelector('.pmp18-adopt-source');
    let sourceRaw=originalSnippet;source.value=sourceRaw;
    const save = overlay.querySelector('.pmp18-adopt-confirm');
    const preview = overlay.querySelector('.pmp18-preview-content');
    const refresh = () => {
        sourceRaw=textFromTextarea(source.value,sourceRaw);
        const needAnchor = ['before', 'after', 'replace'].includes(mode);
        overlay.querySelector('.pmp18-adopt-anchor-wrap').hidden = !needAnchor;
        overlay.querySelector('[data-snippet-count]').textContent = `${source.value.length} 字`;
        overlay.querySelector('[data-anchor-count]').textContent = `已选 ${anchors.size} 行`;
        overlay.querySelectorAll('.pmp18-adopt-mode').forEach(label => label.classList.toggle('is-on', label.querySelector('input').value === mode));
        let valid = Boolean(source.value.trim()) && (!needAnchor || anchors.size > 0);
        try { next = valid ? applyTextEdit(base.description, sourceRaw, mode, [...anchors].map(i => lines[i])) : base.description; }
        catch (error) { dialog.error(error.message); valid = false; }
        const delta = next.length - base.description.length;
        changed = sourceRaw !== originalSnippet || mode !== 'append' || anchors.size > 0;
        overlay.querySelector('.pmp18-save-status').textContent = !valid ? '选择片段和写入位置后，即可预览' : next === base.description ? '结果与原文相同' : `仅写入基准 · ${next.length.toLocaleString()} 字 · ${delta >= 0 ? '+' : ''}${delta} 字`;
        save.disabled = busy || !valid || next === base.description;
        renderResultPreview(preview, base.description, next, diff);
        const signature=JSON.stringify([source.value,mode,[...anchors],next]);
        if(signature!==draftSignature){draftSignature=signature;session?.touch();}
    };
    source.addEventListener('input', refresh);
    overlay.addEventListener('change', e => { if (e.target.name === 'pmp-adopt-mode') { mode = e.target.value; dialog.error(); refresh(); } });
    overlay.querySelector('.pmp18-adopt-lines').addEventListener('click', e => {
        const button = e.target.closest('[data-i]');
        if (!button || busy) return;
        const i = Number(button.dataset.i);
        if (anchors.has(i)) anchors.delete(i); else anchors.add(i);
        button.classList.toggle('is-on', anchors.has(i));
        button.setAttribute('aria-pressed', String(anchors.has(i)));
        refresh();
    });
    overlay.querySelector('[data-clear-anchors]').onclick = () => { anchors.clear(); overlay.querySelectorAll('.pmp18-adopt-line').forEach(b => { b.classList.remove('is-on'); b.setAttribute('aria-pressed','false'); }); refresh(); };
    overlay.querySelectorAll('[data-preview]').forEach(button => button.onclick = () => { diff = button.dataset.preview === 'diff'; overlay.querySelectorAll('[data-preview]').forEach(b => b.classList.toggle('is-on', b === button)); refresh(); });
    overlay.querySelector('[data-reset]').onclick = () => { sourceRaw=originalSnippet; source.value = sourceRaw; mode = 'append'; overlay.querySelector('[value="append"]').checked = true; overlay.querySelector('[data-clear-anchors]').click(); dialog.error(); refresh(); };
    save.onclick = async () => {
        if (busy || save.disabled) return;
        if (mode === 'replace-all' && !window.confirm(`确定替换「${base.name}」的全文？`)) return;
        busy = true; save.disabled = true; save.textContent = '正在保存…'; dialog.error();
        overlay.querySelectorAll('button,input,textarea').forEach(el => { el.disabled = true; });
        try {
            await session.flush();
            await persistPersonaFull(base.id, base.name, next, { expected: base, reason:'采纳片段', audit:[{kind:'采纳片段',sourceId,sourceName:sourceName||sourceId||'未记录来源',mode:MODES.find(item=>item[0]===mode)?.[1]||mode,snippet:sourceRaw,edited:sourceRaw!==originalSnippet,targetLines:[...anchors].map(index=>index+1)}] });
            await session.saved();
            dialog.close(true);
            if (typeof toastr !== 'undefined') toastr.success('已采纳到基准');
            onDone?.();
        } catch (error) { dialog.error(error?.message || '保存失败，片段仍保留。'); }
        finally {
            busy = false; save.textContent = '确认采纳';
            overlay.querySelectorAll('button,input,textarea').forEach(el => { el.disabled = false; });
            if (!lines.length) overlay.querySelectorAll('[value="before"],[value="after"],[value="replace"]').forEach(el => { el.disabled = true; });
            refresh();
        }
    };
    refresh();
    session=createDraftSession({type:'adopt',personaIds:[base.id],label:`采纳 · ${base.name}`,dialog,initialDraft:resumeDraft,isDirty:()=>next!==base.description,capture:()=>({base:{[base.id]:base},payload:{source:sourceRaw,sourceId,sourceName,mode,anchors:[...anchors],description:next}}),onRestore:({payload,bases,changedBase})=>{
        base=bases[baselineId]||base;lines=lineRanges(base.description);sourceId=payload.sourceId||'';sourceName=payload.sourceName||'';
        sourceRaw=changedBase?payload.description:payload.source;source.value=sourceRaw;
        mode=changedBase?'replace-all':(['append','before','after','replace','replace-all'].includes(payload.mode)?payload.mode:'append');
        anchors.clear();if(!changedBase)(payload.anchors||[]).filter(index=>lines[index]).forEach(index=>anchors.add(index));
        overlay.querySelector('.pmp18-adopt-lines').innerHTML=lines.map((line,i)=>`<button type="button" class="pmp18-adopt-line ${anchors.has(i)?'is-on':''}" data-i="${i}" aria-pressed="${anchors.has(i)}"><span class="pmp18-adopt-line-no">${i+1}</span><span class="pmp18-adopt-line-text">${escapeHtml(line.label||'（空行）')}</span><span class="pmp18-line-check" aria-hidden="true">✓</span></button>`).join('');
        overlay.querySelectorAll('[name="pmp-adopt-mode"]').forEach(radio=>{radio.checked=radio.value===mode;radio.disabled=!lines.length&&['before','after','replace'].includes(radio.value);});refresh();
    }});
    session.touch();
    return overlay;
}
