import { escapeHtml } from '../util.js';
import { getPersonaData, persistPersonaBatch } from '../persona-data.js';
import { textUnits, selectedText, applyTextEdit, textFromTextarea } from '../text-edit.js';
import { personaImageUrl } from './components.js';
import { createStudioDialog, renderResultPreview } from './dialog.js';
import { createDraftSession } from './draft-session.js';

export function openMergeDialog(idA, idB, onDone, {resumeDraft=null} = {}) {
    const all = getPersonaData();
    const originals = { left: all.find(p => p.id === idA), right: all.find(p => p.id === idB) };
    if (!originals.left || !originals.right || idA === idB) return;
    let drafts = { left: originals.left.description, right: originals.right.description };
    let audit={left:[],right:[]},session=null,draftSignature='';
    const selected = { left: new Set(), right: new Set() };
    const unitModes = { left: 'paragraph', right: 'paragraph' };
    const views = { left: 'fragments', right: 'fragments' };
    const history = [], future = [];
    let mode = 'append', previewSide = 'right', diff = false, busy = false;
    let message = '先选片段，再用箭头写入另一侧。';
    let lastPreview = null;
    const dirtySides = () => ['left','right'].filter(side => drafts[side] !== originals[side].description);
    const dialog = createStudioDialog({
        className: 'pmp18-stitch-overlay',
        title: '缝合工作台',
        subtitle: '把两份人设里的好灵感，组合成更完整的版本。',
        body: `<div class="pmp18-stitch-toolbar"><div class="pmp18-studio-instruction"><span class="pmp18-step">01</span><span>选片段</span><span aria-hidden="true">→</span><span class="pmp18-step">02</span><span>预览</span><span aria-hidden="true">→</span><span class="pmp18-step">03</span><span>保存</span></div><div class="pmp18-history-actions"><button type="button" class="pmp18-small-btn" data-open-fields>字段缝合</button><button type="button" class="pmp18-small-btn" data-history="undo" title="撤销上一步">↶ 撤销</button><button type="button" class="pmp18-small-btn" data-history="redo" title="重做">↷ 重做</button></div></div>
        <div class="pmp18-stitch-board"><section class="pmp18-stitch-col" data-side="left"></section><div class="pmp18-stitch-mid"><label class="pmp18-mobile-placement"><select class="pmp18-stitch-mode" aria-label="写入方式"><option value="append">追加末尾</option><option value="before">选中前</option><option value="after">选中后</option><option value="replace">替换选中</option></select></label><button type="button" class="pmp18-stitch-arrow" data-dir="to-right" title="将第一份的片段写入第二份" aria-label="将第一份的片段写入第二份"><span class="pmp18-desktop-direction">→</span><span class="pmp18-mobile-direction">↓</span><small class="pmp18-desktop-direction">写入右侧</small><small class="pmp18-mobile-direction">写入下方</small></button><button type="button" class="pmp18-stitch-arrow" data-dir="to-left" title="将第二份的片段写入第一份" aria-label="将第二份的片段写入第一份"><span class="pmp18-desktop-direction">←</span><span class="pmp18-mobile-direction">↑</span><small class="pmp18-desktop-direction">写入左侧</small><small class="pmp18-mobile-direction">写入上方</small></button></div><section class="pmp18-stitch-col" data-side="right"></section></div>
        <div class="pmp18-stitch-operation"><label>写入方式 <select class="pmp18-stitch-mode" aria-label="缝合写入方式"><option value="append">追加到末尾</option><option value="before">插入到选中片段前</option><option value="after">插入到选中片段后</option><option value="replace">替换选中片段</option></select></label><p class="pmp18-stitch-message" aria-live="polite"></p><button type="button" class="pmp18-text-btn pmp18-danger-btn" data-delete-selection>删除选中</button></div>
        <section class="pmp18-preview-panel pmp18-stitch-preview"><div class="pmp18-preview-heading"><div><span class="pmp18-eyebrow">BEFORE YOU SAVE</span><h3>确认你的新版本</h3></div><div class="pmp18-preview-tools"><select data-preview-side aria-label="选择预览的人设"><option value="right">右侧 · ${escapeHtml(originals.right.name)}</option><option value="left">左侧 · ${escapeHtml(originals.left.name)}</option></select><div class="pmp18-segment"><button type="button" data-preview="result" class="is-on">完整结果</button><button type="button" data-preview="diff">修改对照</button></div></div></div><div class="pmp18-preview-content" tabindex="0"></div></section>`,
        footer: '<span class="pmp18-save-status" aria-live="polite"></span><div class="pmp18-footer-actions"><button type="button" class="pmp18-small-btn pmp18-mobile-result" data-open-result>结果预览</button><button type="button" class="pmp18-small-btn pmp18-stitch-close" data-close>暂存关闭</button><button type="button" class="pmp18-primary-btn pmp18-stitch-confirm">保存修改</button></div>',
        canClose: () => !busy && (session ? session.beforeClose() : true),
        onClose: () => session?.dispose(),
    });
    const { overlay } = dialog;
    const head=overlay.querySelector('.pmp18-studio-head');
    const draftHost=document.createElement('div');draftHost.className='pmp18-stitch-head-meta';head.firstElementChild.append(draftHost);
    const recoveryHost=document.createElement('div');recoveryHost.className='pmp18-stitch-recovery';head.after(recoveryHost);
    const tools=overlay.querySelector('.pmp18-stitch-toolbar');tools.id='pmp18-stitch-tools-'+Math.random().toString(36).slice(2);
    const toolsToggle=document.createElement('button');toolsToggle.type='button';toolsToggle.className='pmp18-small-btn pmp18-stitch-tools-toggle';toolsToggle.dataset.toggleStitchTools='';toolsToggle.textContent='工具';toolsToggle.setAttribute('aria-expanded','false');toolsToggle.setAttribute('aria-controls',tools.id);head.insertBefore(toolsToggle,head.lastElementChild);
    const mobileDelete=document.createElement('button');mobileDelete.type='button';mobileDelete.className='pmp18-small-btn pmp18-danger-btn pmp18-mobile-delete';mobileDelete.dataset.deleteSelection='';mobileDelete.textContent='删除选中';tools.querySelector('.pmp18-history-actions').append(mobileDelete);
    const save = overlay.querySelector('.pmp18-stitch-confirm');
    const unitsFor = side => textUnits(drafts[side], unitModes[side]);
    const clearSelection = () => { selected.left.clear(); selected.right.clear(); };
    const snapshot=()=>({drafts:{...drafts},audit:structuredClone(audit)});
    const remember = () => { history.push(snapshot()); if (history.length > 40) history.shift(); future.length = 0; };
    const paneHtml = side => {
        const p = originals[side], isDirty = drafts[side] !== p.description;
        const units = unitsFor(side);
        return `<header class="pmp18-stitch-col-head"><img class="pmp18-avatar" src="${escapeHtml(personaImageUrl(p.id))}" alt=""><div class="pmp18-stitch-person"><span class="pmp18-eyebrow"><span class="pmp18-desktop-direction">${side==='left'?'第一份':'第二份'}</span><span class="pmp18-mobile-direction">${side==='left'?'上方人设':'下方人设'}</span></span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.title || p.id)}</small></div><span class="pmp18-mobile-pane-count" data-pane-count ${selected[side].size?'':'hidden'}>选 ${selected[side].size}</span><div class="pmp18-mobile-pane-tools"><select data-pane-mode data-side="${side}" aria-label="${escapeHtml(p.name)}的显示方式"><option value="paragraph" ${views[side]==='fragments'&&unitModes[side]==='paragraph'?'selected':''}>段落</option><option value="line" ${views[side]==='fragments'&&unitModes[side]==='line'?'selected':''}>逐行</option><option value="text" ${views[side]==='text'?'selected':''}>全文</option></select><button type="button" class="pmp18-small-btn" data-expand-pane="${side}" aria-label="放大选择或编辑${escapeHtml(p.name)}">放大</button></div><span class="pmp18-draft-badge ${isDirty ? 'is-dirty' : ''}" data-dirty-badge>${isDirty ? '已修改' : '原始版本'}</span></header>
        <div class="pmp18-stitch-pane-tools"><div class="pmp18-segment"><button type="button" data-view="fragments" data-side="${side}" class="${views[side] === 'fragments' ? 'is-on' : ''}">选择片段</button><button type="button" data-view="text" data-side="${side}" class="${views[side] === 'text' ? 'is-on' : ''}">编辑全文</button></div>${views[side] === 'fragments' ? `<select data-unit-mode data-side="${side}" aria-label="片段划分方式"><option value="paragraph" ${unitModes[side] === 'paragraph' ? 'selected' : ''}>按段落</option><option value="line" ${unitModes[side] === 'line' ? 'selected' : ''}>按行</option></select>` : '<span class="pmp18-field-hint">即时更新预览</span>'}</div>
        ${views[side] === 'text' ? `<textarea class="pmp18-stitch-text-editor" data-side="${side}" aria-label="${escapeHtml(p.name)}的全文" spellcheck="false">${escapeHtml(drafts[side])}</textarea>` : `<div class="pmp18-stitch-units" data-side="${side}">${units.map((unit, i) => `<button type="button" class="pmp18-stitch-unit ${selected[side].has(i) ? 'is-on' : ''}" data-side="${side}" data-i="${i}" aria-pressed="${selected[side].has(i)}"><span class="pmp18-unit-index">${String(i + 1).padStart(2, '0')}</span><pre class="pmp18-stitch-unit-body">${escapeHtml(unit.label || '（空行）')}</pre><span class="pmp18-unit-check" aria-hidden="true">✓</span></button>`).join('') || '<div class="pmp18-pane-empty">这份人设还没有描述<br><small>可以把另一侧的片段放到这里</small></div>'}</div>`}
        <div class="pmp18-stitch-pane-foot"><span>已选 ${selected[side].size} / ${units.length} 个片段</span><span>${drafts[side].length.toLocaleString()} 字</span></div>`;
    };
    const paint = skipSide => {
        for (const side of ['left','right']) {
            const pane = overlay.querySelector(`.pmp18-stitch-col[data-side="${side}"]`);
            const scroll = pane.querySelector('.pmp18-stitch-units')?.scrollTop || 0;
            const active = pane.contains(document.activeElement) ? document.activeElement : null;
            const focusKey = active?.matches('[data-pane-mode]') ? '[data-pane-mode]' : active?.matches('[data-i]') ? `[data-i="${active.dataset.i}"]` : active?.matches('[data-unit-mode]') ? '[data-unit-mode]' : active?.matches('[data-view]') ? `[data-view="${active.dataset.view}"]` : null;
            if (skipSide !== side) {
                pane.innerHTML = paneHtml(side);
                const textarea=pane.querySelector('textarea');if(textarea)textarea.value=drafts[side];
                const list = pane.querySelector('.pmp18-stitch-units');
                if (list) list.scrollTop = scroll;
                if (focusKey) pane.querySelector(focusKey)?.focus({ preventScroll: true });
            }
            else {
                const badge = pane.querySelector('[data-dirty-badge]');
                badge.textContent = drafts[side] !== originals[side].description ? '已修改' : '原始版本';
                badge.classList.toggle('is-dirty', drafts[side] !== originals[side].description);
                pane.querySelector('.pmp18-stitch-pane-foot').lastElementChild.textContent = `${drafts[side].length.toLocaleString()} 字`;
                const count=pane.querySelector('[data-pane-count]');count.hidden=!selected[side].size;count.textContent='选 '+selected[side].size;
                pane.querySelector('.pmp18-stitch-pane-foot').firstElementChild.textContent = `已选 ${selected[side].size} / ${unitsFor(side).length} 个片段`;
            }
        }
        overlay.querySelector('[data-dir="to-right"]').disabled = busy || !selected.left.size;
        overlay.querySelector('[data-dir="to-left"]').disabled = busy || !selected.right.size;
        overlay.querySelector('[data-history="undo"]').disabled = busy || !history.length;
        overlay.querySelector('[data-history="redo"]').disabled = busy || !future.length;
        overlay.querySelectorAll('[data-delete-selection]').forEach(button=>{button.disabled=busy||(!selected.left.size&&!selected.right.size);});
        overlay.querySelectorAll('.pmp18-stitch-mode').forEach(select=>{select.value=mode;});
        overlay.querySelector('.pmp18-stitch-message').textContent = message;
        overlay.querySelector('[data-preview-side]').value = previewSide;
        const dirty = dirtySides();
        overlay.querySelector('.pmp18-save-status').textContent = dirty.length ? `将保存${dirty.map(side => side === 'left' ? '左侧' : '右侧').join('和')} · 原文格式保留` : '尚无改动 · 两份原文均已保留';
        save.disabled = busy || !dirty.length;
        save.textContent = busy ? '正在保存…' : dirty.length === 2 ? '保存两侧修改' : '保存修改';
        if (!lastPreview || lastPreview.side !== previewSide || lastPreview.text !== drafts[previewSide] || lastPreview.diff !== diff) {
            renderResultPreview(overlay.querySelector('.pmp18-preview-content'), originals[previewSide].description, drafts[previewSide], diff);
            lastPreview = { side: previewSide, text: drafts[previewSide], diff };
        }
        const signature=JSON.stringify([drafts,audit,[...selected.left],[...selected.right],mode,unitModes,views,previewSide,diff]);
        if(signature!==draftSignature){draftSignature=signature;session?.touch();}
    };
    const transfer = dir => {
        const from = dir === 'to-right' ? 'left' : 'right', to = from === 'left' ? 'right' : 'left';
        const insert = selectedText(unitsFor(from), selected[from]);
        if (!insert) return;
        if (mode !== 'append' && !selected[to].size) {
            paint(); dialog.error(`请在${to === 'left' ? '第一份人设' : '第二份人设'}选择写入位置，再点箭头。`); return;
        }
        try {
            const next = applyTextEdit(drafts[to], insert, mode, [...selected[to]].map(i => unitsFor(to)[i]));
            if (next === drafts[to]) return;
            remember();audit[to].push({kind:'缝合片段',sourceId:originals[from].id,sourceName:originals[from].name,sourceDraft:drafts[from]!==originals[from].description,mode:({append:'追加末尾',before:'插入之前',after:'插入之后',replace:'替换选中'})[mode],snippet:insert});drafts[to] = next;
            selected[to].clear(); selected[from].clear();
            previewSide = to;
            message = `已将片段写入「${originals[to].name}」，可以继续调整或撤销。`;
            dialog.error(); paint();
        } catch (error) { dialog.error(error.message); }
    };
    const openFocus=side=>{
        const focus=createStudioDialog({className:'pmp18-stitch-focus-overlay',title:originals[side].name,subtitle:'放大选择片段或编辑全文，返回后继续缝合。',body:'<div class="pmp18-focus-tools"><label>显示方式 <select data-focus-mode aria-label="放大区域显示方式"><option value="paragraph">按段落选择</option><option value="line">按行选择</option><option value="text">编辑全文</option></select></label><button type="button" class="pmp18-small-btn" data-focus-clear>清除选择</button></div><div class="pmp18-focus-content"></div>',footer:'<span class="pmp18-save-status" data-focus-status></span><div class="pmp18-footer-actions"><button type="button" class="pmp18-primary-btn" data-close>返回缝合</button></div>',onClose:()=>{paint();overlay.querySelector(`[data-expand-pane="${side}"]`)?.focus({preventScroll:true});}});
        const content=focus.overlay.querySelector('.pmp18-focus-content'),modeSelect=focus.overlay.querySelector('[data-focus-mode]'),clear=focus.overlay.querySelector('[data-focus-clear]');
        const updateFocus=()=>{
            const editing=views[side]==='text';modeSelect.value=editing?'text':unitModes[side];clear.disabled=editing||!selected[side].size;
            focus.overlay.querySelector('[data-focus-status]').textContent=editing?'改动自动保留到缝合草稿，返回后保存。':`已选 ${selected[side].size} 个片段 · 返回后用箭头写入另一份`;
        };
        const paintFocus=()=>{
            const scroll=content.firstElementChild?.scrollTop||0;
            content.innerHTML=views[side]==='text'?'<textarea class="pmp18-stitch-text-editor" data-focus-editor spellcheck="false" aria-label="放大编辑人设全文"></textarea>':`<div class="pmp18-stitch-units" data-focus-units>${unitsFor(side).map((unit,i)=>`<button type="button" class="pmp18-stitch-unit ${selected[side].has(i)?'is-on':''}" data-focus-index="${i}" aria-pressed="${selected[side].has(i)}"><span class="pmp18-unit-index">${i+1}</span><pre class="pmp18-stitch-unit-body">${escapeHtml(unit.label||'（空行）')}</pre><span class="pmp18-unit-check" aria-hidden="true">✓</span></button>`).join('')||'<div class="pmp18-pane-empty">这份人设还没有描述，可切换为全文编辑。</div>'}</div>`;
            const textarea=content.querySelector('textarea');if(textarea)textarea.value=drafts[side];content.firstElementChild.scrollTop=scroll;updateFocus();
        };
        modeSelect.onchange=()=>{const value=modeSelect.value;views[side]=value==='text'?'text':'fragments';if(value!=='text'&&unitModes[side]!==value){unitModes[side]=value;selected[side].clear();}paint();paintFocus();};
        clear.onclick=()=>{selected[side].clear();paint();paintFocus();};
        content.onclick=event=>{const button=event.target.closest('[data-focus-index]');if(!button)return;const index=Number(button.dataset.focusIndex);if(selected[side].has(index))selected[side].delete(index);else selected[side].add(index);button.classList.toggle('is-on',selected[side].has(index));button.setAttribute('aria-pressed',String(selected[side].has(index)));paint();updateFocus();};
        content.oninput=event=>{if(!event.target.matches('[data-focus-editor]'))return;const next=textFromTextarea(event.target.value,drafts[side]);if(next===drafts[side])return;remember();drafts[side]=next;selected[side].clear();previewSide=side;message='放大编辑的改动已保留到草稿。';paint();updateFocus();};
        paintFocus();return focus.overlay;
    };
    overlay.addEventListener('click', async e => {
        if (busy) return;
        if(e.target.closest('[data-toggle-stitch-tools]')){const open=overlay.classList.toggle('is-tools-open');toolsToggle.setAttribute('aria-expanded',String(open));return;}
        const expand=e.target.closest('[data-expand-pane]');if(expand){openFocus(expand.dataset.expandPane);return;}
        if(e.target.closest('[data-open-fields]')){
            const button=e.target.closest('[data-open-fields]');button.disabled=true;
            try{const {openFieldMergeDialog}=await import('./field-merge.js');if(!overlay.isConnected)return;openFieldMergeDialog({left:{id:originals.left.id,name:originals.left.name,text:drafts.left},right:{id:originals.right.id,name:originals.right.name,text:drafts.right},onApply:result=>{remember();drafts[result.targetSide]=result.text;audit[result.targetSide].push(...result.audit);selected[result.targetSide].clear();previewSide=result.targetSide;message='字段选择已应用到草稿，可以继续调整或撤销。';paint();}});}catch(error){dialog.error(error.message);}finally{button.disabled=false;}return;
        }
        if(e.target.closest('[data-open-result]')){
            const result=createStudioDialog({className:'pmp18-result-overlay',title:'缝合结果预览',subtitle:'分别核对双方的完整结果，再返回保存。',body:`<label class="pmp18-result-person">查看人设 <select data-result-side><option value="left">${escapeHtml(originals.left.name)}（第一份）</option><option value="right">${escapeHtml(originals.right.name)}（第二份）</option></select></label><div class="pmp18-preview-content" data-full-result></div>`,footer:'<div class="pmp18-footer-actions"><button type="button" class="pmp18-primary-btn" data-close>返回缝合</button></div>'});
            const person=result.overlay.querySelector('[data-result-side]');person.value=previewSide;
            const paintResult=()=>{const side=person.value;renderResultPreview(result.overlay.querySelector('[data-full-result]'),originals[side].description,drafts[side],true);};
            person.onchange=paintResult;paintResult();return;
        }
        const unit = e.target.closest('.pmp18-stitch-unit');
        if (unit) {
            const side = unit.dataset.side, index = Number(unit.dataset.i);
            if (selected[side].has(index)) selected[side].delete(index); else selected[side].add(index);
            paint(); return;
        }
        const view = e.target.closest('[data-view]');
        if (view) { views[view.dataset.side] = view.dataset.view; paint(); return; }
        const arrow = e.target.closest('[data-dir]');
        if (arrow) { transfer(arrow.dataset.dir); return; }
        const historyButton = e.target.closest('[data-history]');
        if (historyButton) {
            const undo = historyButton.dataset.history === 'undo', from = undo ? history : future, to = undo ? future : history;
            if (!from.length) return;
            to.push(snapshot());const restored=from.pop();drafts=restored.drafts;audit=restored.audit;clearSelection();
            message = undo ? '已撤销上一步。' : '已重做。'; dialog.error(); paint(); return;
        }
        if (e.target.closest('[data-delete-selection]')) {
            if (!selected.left.size && !selected.right.size) return;
            remember();
            for (const side of ['left','right']) if (selected[side].size) {audit[side].push({kind:'删除片段',sourceId:originals[side].id,sourceName:originals[side].name,sourceDraft:true,mode:'从草稿删除',snippet:selectedText(unitsFor(side),selected[side])});drafts[side] = applyTextEdit(drafts[side], '', 'delete', [...selected[side]].map(i => unitsFor(side)[i]));}
            clearSelection(); message = '已删除选中片段，可以撤销。'; paint(); return;
        }
        const preview = e.target.closest('[data-preview]');
        if (preview) { diff = preview.dataset.preview === 'diff'; overlay.querySelectorAll('[data-preview]').forEach(b => b.classList.toggle('is-on', b === preview)); paint(); }
    });
    overlay.addEventListener('change', e => {
        if(e.target.matches('[data-pane-mode]')){const side=e.target.dataset.side,value=e.target.value;views[side]=value==='text'?'text':'fragments';if(value!=='text'&&unitModes[side]!==value){unitModes[side]=value;selected[side].clear();}paint();return;}
        if (e.target.matches('[data-unit-mode]')) { const side = e.target.dataset.side; unitModes[side] = e.target.value; selected[side].clear(); paint(); }
        if (e.target.matches('.pmp18-stitch-mode')) { mode = e.target.value;overlay.querySelectorAll('.pmp18-stitch-mode').forEach(select=>{select.value=mode;}); dialog.error();session?.touch(); }
        if (e.target.matches('[data-preview-side]')) { previewSide = e.target.value; paint(); }
    });
    overlay.addEventListener('input', e => {
        if (!e.target.matches('.pmp18-stitch-text-editor') || busy) return;
        const side = e.target.dataset.side;
        const next=textFromTextarea(e.target.value,drafts[side]);if(next===drafts[side])return;
        remember(); drafts[side] = next; selected[side].clear(); previewSide = side;
        message = '全文草稿已更新，确认后才会写回。'; paint(side);
    });
    save.onclick = async () => {
        if (busy || !dirtySides().length) return;
        const changes = dirtySides().map(side => ({ id: originals[side].id, name: originals[side].name, description: drafts[side], expected: originals[side], reason:'缝合保存', audit:audit[side] }));
        busy = true; dialog.error(); paint();
        overlay.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
        try {
            await session.flush();
            await persistPersonaBatch(changes);
            await session.saved();
            dialog.close(true);
            if (typeof toastr !== 'undefined') toastr.success(`已保存 ${changes.length} 份人设的修改`);
            onDone?.();
        } catch (error) { dialog.error(error?.message || '保存失败，缝合草稿仍保留。'); }
        finally {
            busy = false;
            overlay.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; });
            paint();
        }
    };
    paint();
    session=createDraftSession({type:'merge',personaIds:[idA,idB],label:`缝合 · ${originals.left.name} / ${originals.right.name}`,dialog,toolbarHost:draftHost,actionsHost:tools.querySelector('.pmp18-history-actions'),recoveryHost,initialDraft:resumeDraft,isDirty:()=>dirtySides().length>0||selected.left.size>0||selected.right.size>0,capture:()=>({base:{[originals.left.id]:originals.left,[originals.right.id]:originals.right},payload:{ids:{left:originals.left.id,right:originals.right.id},drafts:{...drafts},audit:structuredClone(audit),selected:{left:[...selected.left],right:[...selected.right]},unitModes:{...unitModes},views:{...views},mode,previewSide,diff}}),onRestore:({payload,bases})=>{
        for(const side of ['left','right']){const id=originals[side].id,savedSide=payload.ids.left===id?'left':'right';originals[side]=bases[id]||originals[side];drafts[side]=payload.drafts[savedSide];audit[side]=payload.audit?.[savedSide]||[];unitModes[side]=payload.unitModes?.[savedSide]==='line'?'line':'paragraph';views[side]=payload.views?.[savedSide]==='text'?'text':'fragments';selected[side].clear();(payload.selected?.[savedSide]||[]).filter(index=>unitsFor(side)[index]).forEach(index=>selected[side].add(index));}
        mode=['append','before','after','replace'].includes(payload.mode)?payload.mode:'append';overlay.querySelector('.pmp18-stitch-mode').value=mode;previewSide=originals.left.id===payload.ids[payload.previewSide||'right']?'left':'right';diff=Boolean(payload.diff);overlay.querySelectorAll('[data-preview]').forEach(button=>button.classList.toggle('is-on',button.dataset.preview===(diff?'diff':'result')));history.length=0;future.length=0;message='工作草稿已恢复，保存前可以再次核对。';paint();
    }});
    return overlay;
}
