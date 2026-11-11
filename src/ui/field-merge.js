import { parseFields,applyFieldChanges,comparable,fieldKey,displayFieldValue } from '../semantic.js';
import { escapeHtml } from '../util.js';
import { createStudioDialog,renderResultPreview } from './dialog.js';

export function openFieldMergeDialog({left,right,onApply}) {
    const people={left,right},formats={left:'auto',right:'auto'},choices={left:new Map(),right:new Map()};
    let targetSide='right',rows=[],sourceDocument=null,targetDocument=null,next='',valid=false,query='',onlyConflict=false;
    const dialog=createStudioDialog({className:'pmp18-field-merge-overlay',title:'字段级缝合',subtitle:'按章节或字段逐项决定，冲突内容不会自动覆盖。',body:`<div class="pmp18-field-controls"><label>写入目标 <select data-field-target><option value="right">${escapeHtml(right.name)}（第二份）</option><option value="left">${escapeHtml(left.name)}（第一份）</option></select></label><label>第一份格式 <select data-field-format="left"><option value="auto">自动识别</option><option value="markdown">Markdown</option><option value="yaml">YAML</option><option value="json">JSON</option></select></label><label>第二份格式 <select data-field-format="right"><option value="auto">自动识别</option><option value="markdown">Markdown</option><option value="yaml">YAML</option><option value="json">JSON</option></select></label></div><div class="pmp18-field-layout"><section class="pmp18-field-picker"><div class="pmp18-field-filter"><input type="search" data-field-search placeholder="查找字段或章节…" aria-label="查找字段"><label><input type="checkbox" data-only-conflicts> 只看冲突</label></div><div class="pmp18-field-bulk"><button type="button" class="pmp18-text-btn" data-pick-new>采用新增字段</button><button type="button" class="pmp18-text-btn" data-keep-all>保留全部目标</button></div><div class="pmp18-field-rows"></div></section><section class="pmp18-preview-panel"><div class="pmp18-preview-heading"><div><h3>变更结果</h3><span data-field-summary class="pmp18-field-hint"></span></div></div><div class="pmp18-field-result pmp18-preview-content"></div></section></div>`,footer:'<span class="pmp18-save-status" data-field-status>选择字段后预览</span><div class="pmp18-footer-actions"><button type="button" class="pmp18-small-btn" data-close>返回</button><button type="button" class="pmp18-primary-btn" data-apply-fields disabled>应用到缝合草稿</button></div>',canClose:()=>!valid||window.confirm('字段选择还没有应用到草稿，确定关闭？')});
    const {overlay}=dialog,container=overlay.querySelector('.pmp18-field-rows');
    const sourceSide=()=>targetSide==='left'?'right':'left';
    const selectedChanges=()=>rows.filter(row=>choices[targetSide].get(row.key)?.choice!=='keep'&&choices[targetSide].has(row.key)).map(row=>{
        const option=choices[targetSide].get(row.key);let value=row.source.value;
        if(option.choice==='manual'){try{value=targetDocument.kind==='markdown'?option.manual:JSON.parse(option.manual);}catch{throw new Error(`「${row.path.join(' / ')}」的手动值不是有效 JSON。`);}}
        return {path:row.target?.path||row.path,value,row,choice:option.choice};
    }).filter(change=>!change.row.target||comparable(change.value)!==comparable(change.row.target.value));
    const preview=()=>{
        valid=false;dialog.error();
        try{const changes=selectedChanges();next=changes.length?applyFieldChanges(targetDocument.text,changes,targetDocument.kind).text:targetDocument.text;valid=changes.length>0&&next!==targetDocument.text;renderResultPreview(overlay.querySelector('.pmp18-field-result'),targetDocument.text,next,true);overlay.querySelector('[data-field-summary]').textContent=`${people[targetSide].name} · ${changes.length} 个字段变更`;overlay.querySelector('[data-field-status]').textContent=valid?'应用后仍可撤销，点击主窗口保存才会写回。':'目标保持原样';}
        catch(error){dialog.error(error.message);overlay.querySelector('[data-field-status]').textContent='请先处理字段格式或冲突。';}
        overlay.querySelector('[data-apply-fields]').disabled=!valid;
    };
    const paintRows=()=>{
        const scroll=container.scrollTop;
        const filtered=rows.filter(row=>(!onlyConflict||row.status==='conflict')&&(!query||row.path.join(' / ').toLocaleLowerCase().includes(query)));
        container.innerHTML=filtered.map(row=>{
            const option=choices[targetSide].get(row.key)||{choice:'keep',manual:targetDocument.kind==='markdown'?displayFieldValue(row.source.value):JSON.stringify(row.source.value,null,2)};
            return `<article class="pmp18-field-row" data-field-key="${escapeHtml(row.key)}"><header><strong>${escapeHtml(row.path.join(' / '))}</strong><span class="pmp18-field-state is-${row.status}">${row.status==='conflict'?'冲突':row.status==='new'?'新增':'相同'}</span></header><div class="pmp18-field-values"><div><small>来源 · ${escapeHtml(people[sourceSide()].name)}</small><pre>${escapeHtml(displayFieldValue(row.source.value))}</pre></div><div><small>目标 · ${escapeHtml(people[targetSide].name)}</small><pre>${row.target?escapeHtml(displayFieldValue(row.target.value)):'（没有此字段）'}</pre></div></div><select data-field-choice aria-label="${escapeHtml(row.path.join(' / '))}的处理方式"><option value="keep" ${option.choice==='keep'?'selected':''}>保留目标</option><option value="source" ${option.choice==='source'?'selected':''}>采用来源</option><option value="manual" ${option.choice==='manual'?'selected':''}>手动值${targetDocument.kind==='markdown'?'':'（JSON）'}</option></select>${option.choice==='manual'?`<textarea data-field-manual spellcheck="false" aria-label="手动字段值">${escapeHtml(option.manual)}</textarea>`:''}</article>`;
        }).join('')||'<div class="pmp18-pane-empty">没有匹配的字段</div>';
        container.scrollTop=scroll;
    };
    const parse=()=>{
        try{sourceDocument=parseFields(people[sourceSide()].text,formats[sourceSide()]);targetDocument=parseFields(people[targetSide].text,formats[targetSide]);const targetMap=new Map(targetDocument.fields.map(field=>[field.key,field]));rows=sourceDocument.fields.map(source=>{const target=targetMap.get(source.key);return {key:source.key,path:source.path,source,target,status:!target?'new':comparable(source.value)===comparable(target.value)?'same':'conflict'};});paintRows();preview();}
        catch(error){rows=[];valid=false;container.innerHTML='<div class="pmp18-pane-empty">请检查格式，或返回使用段落 / 全文模式。</div>';overlay.querySelector('[data-apply-fields]').disabled=true;dialog.error(error.message);}
    };
    overlay.addEventListener('change',event=>{
        if(event.target.matches('[data-field-target]')){targetSide=event.target.value;parse();return;}
        if(event.target.matches('[data-field-format]')){formats[event.target.dataset.fieldFormat]=event.target.value;choices.left.clear();choices.right.clear();parse();return;}
        if(event.target.matches('[data-only-conflicts]')){onlyConflict=event.target.checked;paintRows();return;}
        if(event.target.matches('[data-field-choice]')){const key=event.target.closest('[data-field-key]').dataset.fieldKey,row=rows.find(item=>item.key===key),old=choices[targetSide].get(key);choices[targetSide].set(key,{choice:event.target.value,manual:old?.manual??(targetDocument.kind==='markdown'?displayFieldValue(row.source.value):JSON.stringify(row.source.value,null,2))});paintRows();preview();}
    });
    overlay.querySelector('[data-field-search]').oninput=event=>{query=event.target.value.trim().toLocaleLowerCase();paintRows();};
    container.addEventListener('input',event=>{if(!event.target.matches('[data-field-manual]'))return;const key=event.target.closest('[data-field-key]').dataset.fieldKey;choices[targetSide].set(key,{choice:'manual',manual:event.target.value});preview();});
    overlay.querySelector('[data-pick-new]').onclick=()=>{rows.filter(row=>row.status==='new').forEach(row=>choices[targetSide].set(row.key,{choice:'source'}));paintRows();preview();};
    overlay.querySelector('[data-keep-all]').onclick=()=>{choices[targetSide].clear();paintRows();preview();};
    overlay.querySelector('[data-apply-fields]').onclick=()=>{if(!valid)return;const source=people[sourceSide()],changes=selectedChanges();onApply({targetSide,text:next,audit:changes.map(change=>({kind:'字段缝合',sourceId:source.id,sourceName:source.name,sourceDraft:true,field:change.path.join(' / '),mode:change.choice==='manual'?'手动合并':'采用来源',snippet:displayFieldValue(change.value)}))});valid=false;dialog.close(true);};
    parse();return overlay;
}
