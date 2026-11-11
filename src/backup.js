import { state } from './state.js';
import { STORAGE_KEY, normalizeThemeId } from './constants.js';
import { readLibrary, updateLibrary, emptyLibrary, newRecordId, deferredDraftCount } from './library-store.js';
import { getLivePowerUser, getPersonaDescription } from './persona-data.js';
import { isHexColor, refreshThemes } from './themes.js';

const clone=value=>structuredClone(value);
const array=value=>Array.isArray(value)?value:[];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const validString=(value,max=2_000_000)=>typeof value==='string'&&value.length<=max;

function validateTree(value,depth=0,counter={n:0}) {
    if(depth>80||++counter.n>150000)throw new Error('备份结构过大或嵌套过深。');
    if(typeof value==='string'&&!validString(value))throw new Error('备份中有过长的文本字段。');
    if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('备份包含不支持的属性名称。');validateTree(child,depth+1,counter);}
}
function requireStrings(record,keys) {if(!record||!keys.every(key=>validString(record[key],key==='description'?2_000_000:2000)))throw new Error('备份中存在不完整的记录。');}
function uniqueRecords(records) {const ids=records.map(record=>record?.id);if(ids.some(id=>!validString(id,2000))||new Set(ids).size!==ids.length)throw new Error('备份包含重复或无效的记录 ID。');}

export async function createBackup() {
    const library=await readLibrary(),pu=getLivePowerUser();
    if(deferredDraftCount())throw new Error('还有临时草稿等待恢复，请先在资料页删除一份已完成草稿，再导出完整备份。');
    return {format:'persona-manager-backup',version:1,exportedAt:new Date().toISOString(),settings:clone(state.settings),library,personas:{names:clone(pu?.personas||{}),descriptions:clone(pu?.persona_descriptions||{})}};
}

export function downloadBackup(value) {
    const date=new Date(),stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=`Persona-Manager-${stamp}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function parseBackup(text) {
    if(typeof text!=='string'||text.length>50_000_000)throw new Error('请选择小于 50MB 的 JSON 备份。');
    let data;try{data=JSON.parse(text);}catch{throw new Error('文件不是有效的 JSON 备份。');}
    validateTree(data);
    if(data?.format!=='persona-manager-backup'||data.version!==1)throw new Error('此文件不是受支持的 Persona Manager 备份。');
    const settings=object(data.settings),library=data.library;
    if(library?.version!==1||!['drafts','revisions','provenance'].every(key=>Array.isArray(library[key])))throw new Error('备份中的资料库格式不完整。');
    [array(settings.tagDefs),array(settings.categoryDefs),library.drafts,library.revisions,library.provenance].forEach(uniqueRecords);
    for(const tag of array(settings.tagDefs)){requireStrings(tag,['id','name']);if(!isHexColor(tag.color))throw new Error('标签颜色格式不正确。');}
    for(const category of array(settings.categoryDefs))requireStrings(category,['id','name']);
    for(const record of library.revisions){requireStrings(record,['id','personaId','name','description']);if(!['saved','pending'].includes(record.status)||!Number.isFinite(record.at)||record.metadata!=null&&(typeof record.metadata!=='object'||Array.isArray(record.metadata))||record.auditIds!=null&&(!Array.isArray(record.auditIds)||!record.auditIds.every(id=>validString(id,2000))))throw new Error('版本记录格式不正确。');}
    for(const draft of library.drafts){
        requireStrings(draft,['id','label']);
        if(!['editor','adopt','merge'].includes(draft.type)||!Array.isArray(draft.personaIds)||!draft.personaIds.every(id=>validString(id,1000))||!draft.payload||!draft.base||!Number.isFinite(draft.updatedAt))throw new Error('草稿记录格式不正确。');
        const expectedCount=draft.type==='merge'?2:1;if(draft.personaIds.length!==expectedCount||new Set(draft.personaIds).size!==expectedCount)throw new Error('草稿对应的人设 ID 不完整。');
        for(const id of draft.personaIds){const base=draft.base[id];requireStrings(base,['name','description']);if(base.id!=null&&base.id!==id)throw new Error('草稿人设 ID 不一致。');}
        if(draft.type==='merge'&&(!draft.payload.ids||!['left','right'].every(side=>draft.personaIds.includes(draft.payload.ids[side]))||draft.payload.ids.left===draft.payload.ids.right||!validString(draft.payload.drafts?.left)||!validString(draft.payload.drafts?.right)))throw new Error('缝合草稿的人设或内容不一致。');
        if(draft.type==='merge')for(const side of ['left','right']){
            const audit=draft.payload.audit?.[side],selected=draft.payload.selected?.[side];
            if(audit!=null&&(!Array.isArray(audit)||audit.some(event=>!event||typeof event!=='object'||event.snippet!=null&&!validString(event.snippet)))||selected!=null&&(!Array.isArray(selected)||selected.some(index=>!Number.isInteger(index)||index<0)))throw new Error('缝合草稿的选择或来源记录格式不正确。');
        }
        if(['editor','adopt'].includes(draft.type)&&!validString(draft.payload.description))throw new Error('草稿描述不完整。');
        if(draft.type==='editor'&&!validString(draft.payload.name,2000))throw new Error('编辑草稿名称不完整。');
        if(draft.type==='adopt'&&!validString(draft.payload.source))throw new Error('采纳草稿片段不完整。');
        if(draft.type==='adopt'&&draft.payload.anchors!=null&&(!Array.isArray(draft.payload.anchors)||draft.payload.anchors.some(index=>!Number.isInteger(index)||index<0)))throw new Error('采纳草稿行号格式不正确。');
    }
    for(const event of library.provenance){requireStrings(event,['id','personaId']);if(!['saved','pending'].includes(event.status)||!Number.isFinite(event.at)||event.snippet!=null&&!validString(event.snippet))throw new Error('来源片段格式不正确。');}
    const names=object(data.personas?.names),descriptions=object(data.personas?.descriptions);
    for(const [id,name] of Object.entries(names)){if(!validString(id,1000)||!validString(name,2000))throw new Error('人设快照格式不正确。');}
    for(const raw of Object.values(descriptions)){if(typeof raw==='string')continue;if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.description!=null&&!validString(raw.description)||raw.title!=null&&!validString(raw.title,2000))throw new Error('人设描述快照格式不正确。');}
    return {data:{...data,settings,personas:{names,descriptions}},counts:{tags:array(settings.tagDefs).length,categories:array(settings.categoryDefs).length,drafts:library.drafts.length,versions:library.revisions.length,sources:library.provenance.length,personas:Object.keys(names).length}};
}

function mergeDefinitions(existing,incoming,prefix) {
    const defs=clone(existing),map=new Map();
    for(const item of incoming){const byName=defs.find(current=>current.name.trim().toLocaleLowerCase()===item.name.trim().toLocaleLowerCase());if(byName){map.set(item.id,byName.id);continue;}const next={...clone(item),id:defs.some(current=>current.id===item.id)?newRecordId(prefix):item.id};defs.push(next);map.set(item.id,next.id);}
    return {defs,map};
}
function mergeMap(existing,incoming,remap,validIds) {
    const result=clone(existing);
    for(const [id,raw] of Object.entries(object(incoming))){const ids=(Array.isArray(raw)?raw:typeof raw==='string'?[raw]:[]).map(value=>remap.get(value)).filter(value=>validIds.has(value));result[id]=[...new Set([...(Array.isArray(result[id])?result[id]:result[id]?[result[id]]:[]),...ids])];}
    return result;
}

export async function importBackup(plan,{mode='merge',includeAppearance=false}={}) {
    if(!plan?.data)throw new Error('请先选择并预览备份文件。');
    // Validate again so callers cannot replace the reviewed plan with unchecked data.
    const {data}=parseBackup(JSON.stringify(plan.data));
    const previousRaw=localStorage.getItem(STORAGE_KEY),existing=clone(state.settings),incoming=data.settings;
    const settings=mode==='replace'?{...clone(existing),tagDefs:[],tagMap:{},categoryDefs:[],categoryMap:{},trash:[]}:clone(existing);
    const tags=mergeDefinitions(array(settings.tagDefs),array(incoming.tagDefs),'tag'),categories=mergeDefinitions(array(settings.categoryDefs),array(incoming.categoryDefs),'category');
    settings.tagDefs=tags.defs;settings.categoryDefs=categories.defs;
    settings.tagMap=mergeMap(object(settings.tagMap),incoming.tagMap,tags.map,new Set(tags.defs.map(tag=>tag.id)));
    settings.categoryMap=mergeMap(object(settings.categoryMap),incoming.categoryMap,categories.map,new Set(categories.defs.map(category=>category.id)));
    const trash=new Map(array(settings.trash).map(item=>[item.id,item]));for(const item of array(incoming.trash)){requireStrings(item,['id','name','description']);const current=trash.get(item.id);if(!current||(item.deletedAt||0)>(current.deletedAt||0))trash.set(item.id,clone(item));}settings.trash=[...trash.values()].sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0)).slice(0,50);
    if(includeAppearance){settings.uiTheme=normalizeThemeId(incoming.uiTheme);settings.themeColors={};for(const [id,palette]of Object.entries(object(incoming.themeColors))){const clean={};for(const key of ['accent','bg','surface','ink'])if(isHexColor(palette?.[key]))clean[key]=palette[key];settings.themeColors[normalizeThemeId(id)]=clean;}for(const key of ['similarityThreshold','softMatchThreshold'])if(Number.isFinite(incoming[key]))settings[key]=Math.max(.1,Math.min(.95,incoming[key]));for(const key of ['includeSameNameInSimilar','showDiffOnly','injectTagsToNative'])if(typeof incoming[key]==='boolean')settings[key]=incoming[key];if(['popup','fullscreen'].includes(incoming.editorMode))settings.editorMode=incoming.editorMode;}
    await readLibrary();
    try {
        await updateLibrary(library=>{
            if(mode==='replace'){const blank=emptyLibrary();Object.assign(library,blank);}
            const revisionIds=new Map(),sourceIds=new Map();
            for(const record of data.library.revisions){const origin=record.originRecordId||record.id,same=library.revisions.find(current=>(current.id===record.id||current.originRecordId===origin)&&current.name===record.name&&current.description===record.description&&current.personaId===record.personaId&&JSON.stringify(current.metadata||{})===JSON.stringify(record.metadata||{}));revisionIds.set(record.id,same?.id||(library.revisions.some(current=>current.id===record.id)?newRecordId('version'):record.id));}
            for(const event of data.library.provenance){const origin=event.originEventId||event.id,same=library.provenance.find(current=>(current.id===event.id||current.originEventId===origin)&&current.personaId===event.personaId&&current.sourceId===event.sourceId&&current.mode===event.mode&&current.snippet===event.snippet);sourceIds.set(event.id,same?.id||(library.provenance.some(current=>current.id===event.id)?newRecordId('source'):event.id));}
            for(const record of data.library.revisions){const id=revisionIds.get(record.id);if(!library.revisions.some(current=>current.id===id))library.revisions.push({...clone(record),id,originRecordId:record.originRecordId||record.id,auditIds:array(record.auditIds).map(source=>sourceIds.get(source)).filter(Boolean)});}
            for(const event of data.library.provenance){const id=sourceIds.get(event.id);if(!library.provenance.some(current=>current.id===id))library.provenance.push({...clone(event),id,originEventId:event.originEventId||event.id,revisionId:revisionIds.get(event.revisionId)||event.revisionId});}
            for(const draft of data.library.drafts){const origin=draft.originDraftId||draft.id,same=library.drafts.find(current=>(current.id===draft.id||current.originDraftId===origin)&&JSON.stringify(current.payload)===JSON.stringify(draft.payload));if(same)continue;library.drafts.push({...clone(draft),id:library.drafts.some(current=>current.id===draft.id)?newRecordId('draft'):draft.id,originDraftId:origin});}
            if(library.drafts.length>30)throw new Error('合并后草稿超过 30 份，请先清理本地草稿。');
            for(const [id,name]of Object.entries(data.personas.names)){const raw=data.personas.descriptions[id],description=getPersonaDescription(raw),metadata=clone(object(raw));if(library.revisions.some(record=>record.personaId===id&&record.name===name&&record.description===description&&JSON.stringify(record.metadata||{})===JSON.stringify(metadata)))continue;library.revisions.push({id:newRecordId('version'),personaId:id,name,description,metadata,at:Date.parse(data.exportedAt)||Date.now(),status:'saved',reason:'备份中的人设快照',auditIds:[]});}
            library.revisions.sort((a,b)=>(a.at||0)-(b.at||0));library.sequence=0;library.revisions.forEach(record=>record.order=++library.sequence);
            localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));
        });
    }catch(error){try{if(previousRaw===null)localStorage.removeItem(STORAGE_KEY);else localStorage.setItem(STORAGE_KEY,previousRaw);}catch{}throw error;}
    state.settings=settings;refreshThemes();window.__pmp18NativeTags?.refresh?.();
    return {settings,counts:plan.counts};
}
