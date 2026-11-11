import { findDrafts, saveDraft, removeDraft, newRecordId, writeDraftJournal, clearDraftJournal } from '../library-store.js';
import { getPersonaData } from '../persona-data.js';
import { createStudioDialog, renderResultPreview } from './dialog.js';
import { escapeHtml } from '../util.js';

export function draftDescription(draft,id) {
    if(draft.type==='editor')return draft.payload.description;
    if(draft.type==='adopt')return draft.payload.description;
    const side=draft.payload.ids?.left===id?'left':'right';
    return draft.payload.drafts?.[side]??'';
}

export function reviewDraft(draft,onRestore) {
    const current=getPersonaData(),bases={};
    draft.personaIds.forEach(id=>{const p=current.find(item=>item.id===id);if(p)bases[id]=p;});
    let active=draft.personaIds[0];
    const missing=draft.personaIds.some(id=>!bases[id]);
    const dialog=createStudioDialog({className:'pmp18-recovery-overlay',title:'恢复工作草稿',subtitle:'先对照当前版本与保留的草稿，再继续编辑。',body:`<div class="pmp18-recovery-personas">${draft.personaIds.map(id=>`<button class="pmp18-small-btn" type="button" data-draft-persona="${escapeHtml(id)}">${escapeHtml(bases[id]?.name||draft.base?.[id]?.name||id)}</button>`).join('')}</div><p class="pmp18-field-hint">${missing?'有对应人设已被删除。草稿保留在资料页，可导出备份。':'左侧是当前人设，右侧是将恢复的草稿；恢复后仍需点击保存才会写回。'}</p><div class="pmp18-recovery-preview pmp18-preview-content"></div>`,footer:`<span class="pmp18-save-status">保留于 ${escapeHtml(new Date(draft.updatedAt).toLocaleString())}</span><div class="pmp18-footer-actions"><button type="button" class="pmp18-small-btn" data-close>返回</button><button type="button" class="pmp18-primary-btn" data-restore-draft ${missing?'disabled':''}>恢复为草稿</button></div>`});
    const paint=()=>{dialog.overlay.querySelectorAll('[data-draft-persona]').forEach(button=>button.classList.toggle('is-on',button.dataset.draftPersona===active));renderResultPreview(dialog.overlay.querySelector('.pmp18-recovery-preview'),bases[active]?.description||'',draftDescription(draft,active),true);};
    dialog.overlay.querySelectorAll('[data-draft-persona]').forEach(button=>button.onclick=()=>{active=button.dataset.draftPersona;paint();});
    dialog.overlay.querySelector('[data-restore-draft]').onclick=()=>{dialog.close(true);onRestore({draft,bases,changedBase:draft.personaIds.some(id=>draft.base?.[id]?.description!==bases[id]?.description)});};
    paint();return dialog.overlay;
}

export function createDraftSession({type,personaIds,label,dialog,capture,isDirty,onRestore,initialDraft=null,toolbarHost=null,actionsHost=null,recoveryHost=null}) {
    let id=initialDraft?.id||newRecordId('draft'),timer=0,disposed=false,generation=0,work=Promise.resolve();
    const bar=document.createElement('div');bar.className='pmp18-draft-toolbar';bar.innerHTML='<span data-draft-status role="status">编辑后自动保留草稿</span><button type="button" class="pmp18-text-btn" data-discard-draft>放弃草稿</button>';
    if(toolbarHost)toolbarHost.append(bar);else dialog.overlay.querySelector('.pmp18-studio-head').after(bar);
    const status=bar.querySelector('[data-draft-status]');
    const discard=bar.querySelector('[data-discard-draft]');if(actionsHost)actionsHost.append(discard);
    const snapshot=()=>{const data=capture();return {id,type,personaIds:[...personaIds],label,base:structuredClone(data.base),payload:structuredClone(data.payload),updatedAt:Date.now(),journalToken:newRecordId('journal')};};
    const flush=async()=>{
        clearTimeout(timer);
        if(disposed)return true;
        const token=++generation;
        if(!isDirty()){await work.catch(()=>{});await removeDraft(id);status.textContent='尚无待保存的草稿';return true;}
        const draft=snapshot();
        try{writeDraftJournal(draft);}catch{status.textContent='正在尝试保留草稿…';}
        const operation=work.catch(()=>{}).then(async()=>{if(disposed||token!==generation)return;await saveDraft(draft);clearDraftJournal(id,draft.journalToken);status.textContent='草稿已自动保留 · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});});
        work=operation;
        try{await operation;return true;}catch(error){status.textContent='草稿未能保留';dialog.error(error.message);throw error;}
    };
    const touch=()=>{
        if(disposed)return;
        generation++;
        if(isDirty()){try{writeDraftJournal(snapshot());status.textContent='正在保留草稿…';}catch{status.textContent='正在尝试保留草稿…';}}
        else removeDraft(id).catch(console.warn);
        clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),280);
    };
    const onHidden=()=>{if(document.visibilityState==='hidden')flush().catch(()=>{});};
    const onPageHide=()=>{if(!disposed&&isDirty()){try{writeDraftJournal(snapshot());}catch{}}};
    document.addEventListener('visibilitychange',onHidden);window.addEventListener('pagehide',onPageHide);
    const dispose=()=>{disposed=true;generation++;clearTimeout(timer);document.removeEventListener('visibilitychange',onHidden);window.removeEventListener('pagehide',onPageHide);};
    const saved=async()=>{generation++;clearTimeout(timer);await work.catch(()=>{});try{await removeDraft(id);}catch(error){console.warn(error);}dispose();};
    discard.onclick=async()=>{if(!window.confirm('放弃这份草稿并关闭？'))return;try{generation++;clearTimeout(timer);await work.catch(()=>{});await removeDraft(id);dispose();dialog.close(true);}catch(error){dialog.error(error.message);}};
    const ready=findDrafts(type,personaIds).then(drafts=>{
        if(disposed||initialDraft)return;
        const existing=drafts.find(draft=>draft.id!==id);
        if(!existing)return;
        const recover=document.createElement('div');recover.className='pmp18-draft-recover';recover.innerHTML='<span>找到一份未完成的草稿</span><button type="button" class="pmp18-small-btn" data-recover-draft>查看并恢复</button>';
        if(recoveryHost)recoveryHost.append(recover);else bar.after(recover);
        recover.querySelector('[data-recover-draft]').onclick=()=>reviewDraft(existing,async({draft,bases,changedBase})=>{await work.catch(()=>{});id=draft.id;onRestore({payload:structuredClone(draft.payload),bases,changedBase});recover.remove();touch();});
    }).catch(error=>{status.textContent='草稿恢复暂不可用';dialog.error(error.message);});
    if(initialDraft)onRestore({payload:structuredClone(initialDraft.payload),bases:initialDraft.currentBases||Object.fromEntries(getPersonaData().filter(p=>personaIds.includes(p.id)).map(p=>[p.id,p])),changedBase:initialDraft.changedBase||false});
    const beforeClose=()=>{
        if(disposed)return true;
        if(isDirty()){
            try{writeDraftJournal(snapshot());flush().catch(()=>{});return true;}
            catch{return flush().then(()=>true);}
        }
        removeDraft(id).catch(console.warn);return true;
    };
    return {touch,flush,dispose,saved,ready,beforeClose,get id(){return id;}};
}
