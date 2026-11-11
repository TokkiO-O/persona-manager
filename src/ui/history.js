import { readLibrary, updateLibrary, reconcilePending } from '../library-store.js';
import { getPersonaData, persistPersonaBatch, getLivePowerUser } from '../persona-data.js';
import { escapeHtml } from '../util.js';
import { createStudioDialog, renderResultPreview } from './dialog.js';

export function openHistoryDialog(personaId) {
    let library=null,current=null,selected='current',view='versions',busy=false;
    const dialog=createStudioDialog({className:'pmp18-history-overlay',title:'版本与片段来源',subtitle:'对照已保存的版本，或查看内容的来处。',body:'<div class="pmp18-history-toolbar"><div class="pmp18-segment"><button type="button" data-history-view="versions" class="is-on">历史版本</button><button type="button" data-history-view="sources">片段来源</button></div><span class="pmp18-field-hint">每个人设保留最近 40 个版本</span></div><div class="pmp18-history-layout"><aside class="pmp18-version-list"></aside><section class="pmp18-version-preview pmp18-preview-content">正在读取…</section></div>',footer:'<span class="pmp18-save-status" data-version-status></span><div class="pmp18-footer-actions"><button type="button" class="pmp18-small-btn" data-close>关闭</button><button type="button" class="pmp18-primary-btn" data-restore-version disabled>恢复此版本</button></div>',canClose:()=>!busy});
    const {overlay}=dialog;
    const currentRecord=()=>current?{id:'current',personaId,name:current.name,description:current.description,metadata:current.rawMetadata||{},reason:'当前版本',status:'saved'}:null;
    const records=()=>[currentRecord(),...(library?.revisions||[]).filter(record=>record.personaId===personaId).sort((a,b)=>(b.order||0)-(a.order||0))].filter(Boolean);
    const paint=()=>{
        if(!library||!overlay.isConnected)return;
        const list=overlay.querySelector('.pmp18-version-list'),preview=overlay.querySelector('.pmp18-version-preview'),restore=overlay.querySelector('[data-restore-version]');
        overlay.querySelectorAll('[data-history-view]').forEach(button=>button.classList.toggle('is-on',button.dataset.historyView===view));
        if(view==='sources'){
            list.hidden=true;
            const events=library.provenance.filter(event=>event.personaId===personaId).reverse();
            preview.innerHTML=events.length?`<div class="pmp18-source-list">${events.map(event=>`<article class="pmp18-source-record"><header><strong>${escapeHtml(event.sourceName||event.sourceId||'手动调整')}</strong><span>${escapeHtml(new Date(event.at).toLocaleString())}</span></header><p>${escapeHtml(event.kind||'片段写入')}${event.field?` · ${escapeHtml(event.field)}`:''} · ${escapeHtml(event.mode||'')} ${event.status==='pending'?' · 待核对':''}</p><small>来源 ID：${escapeHtml(event.sourceId||'未记录')}${event.sourceDraft?' · 来自当时的缝合草稿':''}</small><pre>${escapeHtml(event.snippet||'（字段值或片段未记录）')}</pre></article>`).join('')}</div>`:'<div class="pmp18-pane-empty">尚无片段来源记录<br><small>此版本起的采纳和缝合操作会自动记录。</small></div>';
            restore.disabled=true;overlay.querySelector('[data-version-status]').textContent=`${events.length} 条来源记录`;return;
        }
        list.hidden=false;
        const versions=records();if(!versions.some(record=>record.id===selected))selected=versions[0]?.id;
        list.innerHTML=versions.length?versions.map(record=>`<button type="button" class="pmp18-version-item ${record.id===selected?'is-on':''}" data-version-id="${escapeHtml(record.id)}"><strong>${escapeHtml(record.reason||'历史版本')}</strong><span>${record.id==='current'?'正在使用的内容':escapeHtml(new Date(record.at).toLocaleString())}</span><small>${record.description.length.toLocaleString()} 字${record.status==='pending'?' · 待核对':''}</small></button>`).join(''):'<p class="pmp18-field-hint">还没有保留的版本。</p>';
        const revision=versions.find(record=>record.id===selected);
        if(revision)renderResultPreview(preview,current?.description||'',revision.description,true);else preview.textContent='暂无版本记录';
        restore.disabled=busy||!revision||selected==='current'||revision.status==='pending';
        overlay.querySelector('[data-version-status]').textContent=revision?`${revision.name} · ${revision.reason}${!current?' · 对应人设已删除，恢复时将重建文字资料':''}`:'';
    };
    const load=async()=>{try{current=getPersonaData().find(persona=>persona.id===personaId)||null;if(current)current={...current,rawMetadata:structuredClone(getLivePowerUser()?.persona_descriptions?.[personaId])};await reconcilePending(current?[current]:[],getLivePowerUser()?.persona_descriptions||{});library=await readLibrary();paint();}catch(error){dialog.error(error.message);}};
    overlay.addEventListener('click',event=>{const version=event.target.closest('[data-version-id]');if(version){selected=version.dataset.versionId;paint();}const tab=event.target.closest('[data-history-view]');if(tab){view=tab.dataset.historyView;paint();}});
    overlay.querySelector('[data-restore-version]').onclick=async()=>{
        const revision=records().find(record=>record.id===selected);
        if(busy||!revision||revision.id==='current'||revision.status!=='saved')return;
        busy=true;dialog.error();paint();
        try{await persistPersonaBatch([{id:personaId,name:revision.name,description:revision.description,metadata:revision.metadata,expected:current||undefined,reason:'恢复历史版本',audit:[{kind:'版本回退',sourceId:personaId,sourceName:revision.name,mode:revision.reason,snippet:revision.description,revisionSourceId:revision.id}]}],{allowCreate:!current});selected='current';await load();if(typeof toastr!=='undefined')toastr.success('已恢复版本，回退前的内容也保留在历史中');}
        catch(error){dialog.error(error.message);}finally{busy=false;paint();}
    };
    load();return overlay;
}
