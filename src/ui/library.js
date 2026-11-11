import { readLibrary, removeDraft, deferredDraftCount } from '../library-store.js';
import { getPersonaData } from '../persona-data.js';
import { createBackup,downloadBackup,parseBackup,importBackup } from '../backup.js';
import { escapeHtml } from '../util.js';
import { openHistoryDialog } from './history.js';
import { openSavedWorkspace } from './workspace.js';

export function renderLibraryPanel() {
    return `<section class="pmp18-library-panel"><header class="pmp18-library-heading"><div><h2>草稿、版本与备份</h2><p>未完成的灵感，和每一次写回，都有迹可循。</p></div><button type="button" class="pmp18-primary-btn" data-library-export>导出完整备份</button></header><div class="pmp18-library-summary" aria-live="polite">正在读取本地资料…</div><div class="pmp18-library-sections"><section class="pmp18-library-section"><div class="pmp18-section-heading"><h3>工作草稿</h3><span class="pmp18-field-hint">最多保留 30 份</span></div><div data-draft-list></div></section><section class="pmp18-library-section"><div class="pmp18-section-heading"><h3>历史版本与来源</h3><input type="search" data-version-search placeholder="查找人设…" aria-label="查找历史人设"></div><div data-version-list></div></section><section class="pmp18-library-section pmp18-library-import"><h3>导入备份</h3><p class="pmp18-field-hint">包含标签、分类、回收站、草稿、历史、片段来源和配色。备份中的人设文字会作为历史快照保留，恢复时再逐份确认；头像图片不包含在内。</p><input type="file" data-library-file accept="application/json,.json" aria-label="选择 Persona Manager 备份"><div data-import-preview class="pmp18-import-preview" hidden></div><div class="pmp18-import-options"><label><input type="radio" name="pmp-import-mode" value="merge" checked> 合并资料</label><label><input type="radio" name="pmp-import-mode" value="replace"> 替换本地资料</label><label><input type="checkbox" data-import-appearance> 同时导入主题与界面配置</label></div><button type="button" class="pmp18-small-btn" data-library-import disabled>确认导入</button></section></div><div class="pmp18-library-message" role="status"></div></section>`;
}

export function mountLibraryPanel(root) {
    root.__pmp18LibraryCleanup?.();root.__pmp18LibraryCleanup=null;
    const panel=root.querySelector('.pmp18-library-panel');if(!panel)return;
    let library=null,plan=null,generation=0,busy=false;
    const message=(text,error=false)=>{const el=panel.querySelector('.pmp18-library-message');el.textContent=text;el.classList.toggle('is-error',error);};
    const renderLists=()=>{
        if(!library)return;
        const people=getPersonaData();
        const drafts=[...library.drafts].sort((a,b)=>b.updatedAt-a.updatedAt);
        panel.querySelector('.pmp18-library-summary').innerHTML=`<span><b>${drafts.length}</b> 工作草稿</span><span><b>${library.revisions.length}</b> 版本快照</span><span><b>${library.provenance.length}</b> 来源记录</span>`;
        panel.querySelector('[data-draft-list]').innerHTML=drafts.length?drafts.map(draft=>`<article class="pmp18-library-item"><div><strong>${escapeHtml(draft.label||'工作草稿')}</strong><small>${escapeHtml(new Date(draft.updatedAt).toLocaleString())} · ${draft.type==='merge'?'缝合':draft.type==='adopt'?'采纳':'编辑'}</small></div><div><button type="button" class="pmp18-small-btn" data-resume-draft="${escapeHtml(draft.id)}">恢复</button><button type="button" class="pmp18-text-btn pmp18-danger-btn" data-delete-draft="${escapeHtml(draft.id)}">删除</button></div></article>`).join(''):'<div class="pmp18-library-empty">没有未完成的草稿</div>';
        const ids=[...new Set([...people.map(persona=>persona.id),...library.revisions.map(record=>record.personaId)])];
        const query=panel.querySelector('[data-version-search]').value.trim().toLocaleLowerCase();
        panel.querySelector('[data-version-list]').innerHTML=ids.map(id=>{const person=people.find(item=>item.id===id),records=library.revisions.filter(record=>record.personaId===id),name=person?.name||records[records.length-1]?.name||id;if(query&&!`${name} ${id}`.toLocaleLowerCase().includes(query))return '';return `<article class="pmp18-library-item"><div><strong>${escapeHtml(name)}</strong><small>${records.length} 个保留版本 · ${library.provenance.filter(event=>event.personaId===id).length} 条来源记录${person?'':' · 人设已删除'}</small></div><button type="button" class="pmp18-small-btn" data-open-history="${escapeHtml(id)}">查看与回退</button></article>`;}).join('')||'<div class="pmp18-library-empty">没有匹配的记录</div>';
    };
    const refresh=async()=>{const token=++generation;try{const value=await readLibrary();if(!panel.isConnected||token!==generation)return;library=value;renderLists();if(deferredDraftCount())message('草稿已满，还有临时草稿等待恢复。请删除一份已完成草稿，恢复后再导出完整备份。',true);}catch(error){message(error.message,true);}};
    const onChange=()=>refresh();window.addEventListener('pmp18-library-changed',onChange);
    root.__pmp18LibraryCleanup=()=>{generation++;window.removeEventListener('pmp18-library-changed',onChange);};
    panel.querySelector('[data-version-search]').addEventListener('input',renderLists);
    panel.addEventListener('click',async event=>{
        const resume=event.target.closest('[data-resume-draft]');if(resume){const draft=library?.drafts.find(item=>item.id===resume.dataset.resumeDraft);if(draft)openSavedWorkspace(draft);return;}
        const history=event.target.closest('[data-open-history]');if(history){openHistoryDialog(history.dataset.openHistory);return;}
        const remove=event.target.closest('[data-delete-draft]');if(remove&&window.confirm('删除这份未完成的草稿？')){try{await removeDraft(remove.dataset.deleteDraft);await refresh();}catch(error){message(error.message,true);}return;}
    });
    panel.querySelector('[data-library-export]').onclick=async()=>{if(busy)return;busy=true;const button=panel.querySelector('[data-library-export]');button.disabled=true;try{downloadBackup(await createBackup());message('备份已生成，请保存下载的 JSON 文件。');}catch(error){message(error.message,true);}finally{busy=false;button.disabled=false;}};
    panel.querySelector('[data-library-file]').onchange=async event=>{plan=null;panel.querySelector('[data-library-import]').disabled=true;const file=event.target.files?.[0],preview=panel.querySelector('[data-import-preview]');if(!file)return;try{if(file.size>50_000_000)throw new Error('备份文件不能超过 50MB。');plan=parseBackup(await file.text());preview.hidden=false;preview.textContent=`已读取：${plan.counts.tags} 个标签、${plan.counts.categories} 个分类、${plan.counts.drafts} 份草稿、${plan.counts.versions} 个版本、${plan.counts.sources} 条来源及 ${plan.counts.personas} 份人设快照。`;panel.querySelector('[data-library-import]').disabled=false;message('请确认合并方式后导入。');}catch(error){preview.hidden=true;message(error.message,true);}};
    panel.querySelector('[data-library-import]').onclick=async()=>{
        if(!plan||busy)return;
        const mode=panel.querySelector('[name="pmp-import-mode"]:checked').value;
        if(mode==='replace'&&!window.confirm('将替换本地标签、分类、草稿、历史和回收站资料。确认已保留需要的备份后继续？'))return;
        busy=true;const button=panel.querySelector('[data-library-import]');button.disabled=true;
        try{await importBackup(plan,{mode,includeAppearance:panel.querySelector('[data-import-appearance]').checked});await refresh();message('资料已导入。人设文字可在历史版本中逐份查看和恢复。');}
        catch(error){message(error.message,true);}finally{busy=false;button.disabled=!plan;}
    };
    refresh();
}
