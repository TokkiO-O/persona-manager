import { reviewDraft } from './draft-session.js';

export function openSavedWorkspace(draft) {
    return reviewDraft(draft,async({draft:record,bases,changedBase})=>{
        const resumed={...record,currentBases:bases,changedBase};
        if(record.type==='editor'){const {openFullEditor}=await import('./editor.js');openFullEditor(record.personaIds[0],{resumeDraft:resumed});}
        else if(record.type==='merge'){const {openMergeDialog}=await import('./merge.js');openMergeDialog(record.payload.ids.left,record.payload.ids.right,()=>window.dispatchEvent(new CustomEvent('pmp18-workspace-saved')),{resumeDraft:resumed});}
        else {const {openAdoptDialog}=await import('./adopt.js');openAdoptDialog({baselineId:record.personaIds[0],snippet:record.payload.source||record.payload.description,sourceId:record.payload.sourceId,sourceName:record.payload.sourceName,resumeDraft:resumed,onDone:()=>window.dispatchEvent(new CustomEvent('pmp18-workspace-saved'))});}
    });
}
