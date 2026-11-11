import { getHostContext } from '../power-user-bridge.js';

const KEY = 'pmp18_library_v1';
const MAX_CHARACTERS = 8_000_000;
let backendFlight = null;
let queue = Promise.resolve();
const clone = value => structuredClone(value);
export const newRecordId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
export const emptyLibrary = () => ({ version: 1, sequence: 0, drafts: [], revisions: [], provenance: [], updatedAt: Date.now() });

function announce() { window.dispatchEvent(new CustomEvent('pmp18-library-changed')); }
function normalize(value) {
    if (value == null) return emptyLibrary();
    if (value.version !== 1 || !['drafts','revisions','provenance'].every(key => Array.isArray(value[key]))) throw new Error('本地资料格式无法读取，请先导出备份后再处理。');
    return value;
}

function storage() {
    const account = getHostContext().accountStorage;
    return account?.getItem && account?.setItem ? account : localStorage;
}

async function backend() {
    if (backendFlight) return backendFlight;
    backendFlight = new Promise(resolve => {
        const account = getHostContext().accountStorage;
        let scope = 'default';
        if (account?.getItem && account?.setItem) {
            try { scope=account.getItem('pmp18_library_scope');if(!scope){scope=newRecordId('account');account.setItem('pmp18_library_scope',scope);if(account.getItem('pmp18_library_scope')!==scope)throw new Error('Account scope was not retained');} } catch { resolve(null);return; }
        }
        if (typeof indexedDB === 'undefined') { resolve(null); return; }
        let settled = false;
        const timer = setTimeout(() => { settled=true;resolve(null); },2000);
        try {
            const request=indexedDB.open(`${KEY}-${scope}`,1);
            request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('library'))request.result.createObjectStore('library');};
            request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;request.result.onversionchange=()=>request.result.close();resolve(request.result);};
            request.onerror=request.onblocked=()=>{clearTimeout(timer);if(!settled){settled=true;resolve(null);}};
        } catch { clearTimeout(timer);settled=true;resolve(null); }
    });
    return backendFlight;
}

async function readRaw() {
    const db=await backend();
    if(!db){const raw=storage().getItem(KEY);return normalize(raw?JSON.parse(raw):null);}
    return new Promise((resolve,reject)=>{const tx=db.transaction('library','readonly'),request=tx.objectStore('library').get('data');request.onsuccess=()=>{try{resolve(normalize(request.result));}catch(error){reject(error);}};request.onerror=()=>reject(request.error);tx.onabort=()=>reject(tx.error||new Error('读取本地资料失败'));});
}

function prune(data) {
    const counts=new Map();
    data.revisions=data.revisions.sort((a,b)=>(b.order||0)-(a.order||0)).filter(revision=>{const count=counts.get(revision.personaId)||0;counts.set(revision.personaId,count+1);return revision.status==='pending'||count<40;}).slice(0,1000).sort((a,b)=>(a.order||0)-(b.order||0));
    data.provenance=data.provenance.slice(-1000);
    let total=JSON.stringify(data).length;
    const latest=new Map();data.revisions.forEach(revision=>latest.set(revision.personaId,revision.id));
    while(total>MAX_CHARACTERS){const index=data.revisions.findIndex(revision=>revision.status!=='pending'&&latest.get(revision.personaId)!==revision.id);if(index<0)break;const [removed]=data.revisions.splice(index,1);total-=JSON.stringify(removed).length;}
    if(total>MAX_CHARACTERS)throw new Error('本地资料空间不足，请先导出备份、清理旧版本或已完成的草稿。');
    data.updatedAt=Date.now();
}

export function updateLibrary(mutator) {
    const operation=queue.then(async()=>{
        const db=await backend();
        if(!db){const data=clone(await readRaw()),result=mutator(data);prune(data);try{storage().setItem(KEY,JSON.stringify(data));}catch{throw new Error('浏览器未能保存资料，请导出备份或释放空间后重试。');}announce();return result;}
        const result=await new Promise((resolve,reject)=>{
            const tx=db.transaction('library','readwrite'),store=tx.objectStore('library'),request=store.get('data');let result,error;
            request.onsuccess=()=>{try{const data=normalize(request.result);result=mutator(data);if(result?.then)throw new Error('本地资料更新必须同步完成');prune(data);store.put(data,'data');}catch(cause){error=cause;tx.abort();}};
            request.onerror=()=>{error=request.error;};
            tx.oncomplete=()=>resolve(result);
            tx.onerror=()=>{};
            tx.onabort=()=>reject(error||new Error('浏览器未能保存资料，请导出备份或释放空间后重试。'));
        });
        announce();return result;
    });
    queue=operation.catch(()=>{});
    return operation;
}

const JOURNALS = 'pmp18_draft_journal_index_v1';
const journalKey = id => `pmp18_draft_journal_v1:${id}`;
function journalIds() { try {const value=JSON.parse(storage().getItem(JOURNALS)||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string').slice(0,60):[];}catch{return [];} }
export function writeDraftJournal(draft) {
    const ids=journalIds();
    if(!ids.includes(draft.id)){ids.push(draft.id);storage().setItem(JOURNALS,JSON.stringify(ids));}
    storage().setItem(journalKey(draft.id),JSON.stringify(draft));
}
export function clearDraftJournal(id,token) {
    const raw=storage().getItem(journalKey(id));
    if(token&&raw&&JSON.parse(raw).journalToken!==token)return;
    storage().removeItem(journalKey(id));
    storage().setItem(JOURNALS,JSON.stringify(journalIds().filter(value=>value!==id)));
}
export async function recoverDraftJournals() {
    const drafts=[];
    for(const id of journalIds()){try{const draft=JSON.parse(storage().getItem(journalKey(id))||'null');if(draft?.id===id&&(draft.deleted||['editor','adopt','merge'].includes(draft.type)&&Array.isArray(draft.personaIds)&&draft.payload))drafts.push(draft);else clearDraftJournal(id);}catch{ /* Keep unreadable records available for manual inspection. */ }}
    if(!drafts.length)return;
    const current=await readRaw();
    if(!drafts.some(draft=>draft.deleted||current.drafts.some(item=>item.id===draft.id)||current.drafts.length<30))return;
    const recovered=await updateLibrary(data=>{const applied=[];for(const draft of drafts){const index=data.drafts.findIndex(item=>item.id===draft.id);if(draft.deleted){if(index>=0)data.drafts.splice(index,1);applied.push(draft);continue;}if(index<0){if(data.drafts.length>=30)continue;data.drafts.push(clone(draft));}else if(data.drafts[index].updatedAt<=draft.updatedAt)data.drafts[index]=clone(draft);applied.push(draft);}return applied;});
    recovered.forEach(draft=>{try{clearDraftJournal(draft.id,draft.journalToken);}catch{}});
}
export function deferredDraftCount() {return journalIds().filter(id=>{try{return !JSON.parse(storage().getItem(journalKey(id))||'null')?.deleted;}catch{return false;}}).length;}
export async function readLibrary() { await queue;await recoverDraftJournals();return clone(await readRaw()); }
export async function findDrafts(type,personaIds) { const signature=JSON.stringify([...personaIds].sort());return (await readLibrary()).drafts.filter(draft=>draft.type===type&&JSON.stringify([...draft.personaIds].sort())===signature).sort((a,b)=>b.updatedAt-a.updatedAt); }
export function saveDraft(draft) {return updateLibrary(data=>{if(!draft.id||!['editor','adopt','merge'].includes(draft.type))throw new Error('草稿格式无效');const index=data.drafts.findIndex(item=>item.id===draft.id);if(index<0&&data.drafts.length>=30)throw new Error('草稿已满 30 份，请先清理或导出已完成的草稿。');const next={...clone(draft),updatedAt:Number(draft.updatedAt)||Date.now()};if(index<0)data.drafts.push(next);else data.drafts[index]=next;return next.id;});}
export async function removeDraft(id) {const journalToken=newRecordId('delete');writeDraftJournal({id,deleted:true,updatedAt:Date.now(),journalToken});await updateLibrary(data=>{data.drafts=data.drafts.filter(draft=>draft.id!==id);});clearDraftJournal(id,journalToken);}

function sameSnapshot(a,b) {return a.name===b.name&&a.description===b.description&&JSON.stringify(a.metadata||{})===JSON.stringify(b.metadata||{});}
export function stageRevisionBatch(entries) {
    const batchId=newRecordId('batch');
    return updateLibrary(data=>{
        const at=Date.now();
        for(const entry of entries){
            const records=data.revisions.filter(record=>record.personaId===entry.personaId&&record.status!=='pending');
            if(entry.before&&(!records.length||!sameSnapshot(records[records.length-1],entry.before)))data.revisions.push({id:newRecordId('version'),personaId:entry.personaId,...clone(entry.before),at,order:++data.sequence,status:'saved',reason:'修改前快照',auditIds:[]});
            const revisionId=newRecordId('version'),auditIds=[];
            for(const source of entry.audit||[]){const event={...clone(source),id:newRecordId('source'),personaId:entry.personaId,revisionId,batchId,at,status:'pending'};data.provenance.push(event);auditIds.push(event.id);}
            data.revisions.push({id:revisionId,personaId:entry.personaId,...clone(entry.after),at,order:++data.sequence,status:'pending',batchId,reason:entry.reason||'编辑保存',auditIds});
        }
        return batchId;
    });
}

export function finishRevisionBatch(batchId,saved) {return updateLibrary(data=>{if(saved){data.revisions.forEach(record=>{if(record.batchId===batchId)record.status='saved';});data.provenance.forEach(record=>{if(record.batchId===batchId)record.status='saved';});}else{data.revisions=data.revisions.filter(record=>record.batchId!==batchId);data.provenance=data.provenance.filter(record=>record.batchId!==batchId);}});}

export async function reconcilePending(personas,metadata={}) {
    const current=new Map(personas.map(persona=>[persona.id,persona]));
    const data=await readLibrary();
    if(!data.revisions.some(record=>record.status==='pending'))return;
    await updateLibrary(library=>{
        for(const record of library.revisions.filter(item=>item.status==='pending')){
            const persona=current.get(record.personaId);
            if(persona?.name===record.name&&persona.description===record.description&&Object.prototype.hasOwnProperty.call(metadata,record.personaId)&&JSON.stringify(metadata[record.personaId])===JSON.stringify(record.metadata)){record.status='saved';library.provenance.forEach(event=>{if(event.revisionId===record.id)event.status='saved';});}
        }
    });
}

export function replaceLibrary(value) {return updateLibrary(data=>{const next=normalize(clone(value));for(const key of Object.keys(data))delete data[key];Object.assign(data,next);});}
