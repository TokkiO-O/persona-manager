const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function distance(start,end,min,max,align) {
    if(align==='center'&&end-start<=max-min)return (start+end-min-max)/2;
    if(start<min)return start-min;
    if(end>max)return end-max;
    return 0;
}

function setScroll(element,top,left) {
    try{element.scrollTo({top,left,behavior:'instant'});}
    catch{
        const value=element.style.getPropertyValue('scroll-behavior'),priority=element.style.getPropertyPriority('scroll-behavior');
        element.style.setProperty('scroll-behavior','auto','important');
        element.scrollTop=top;element.scrollLeft=left;
        if(value)element.style.setProperty('scroll-behavior',value,priority);else element.style.removeProperty('scroll-behavior');
    }
}

/** Only scroll user-scrollable descendants of the manager window. Never pan its frame or the host page. */
export function scrollWithinManager(target,{block='nearest'}={}) {
    const root=target?.closest?.('#pmp18-root'),frame=target?.closest?.('.pmp18-window');
    if(!root||root.hidden||!frame||!target.getClientRects().length)return false;
    for(let node=target;node&&node!==frame;node=node.parentElement){
        if(node.matches('.pmp18-col-block.is-folded'))node.classList.remove('is-folded');
    }
    let changed=false;
    for(let parent=target.parentElement;parent&&parent!==frame;parent=parent.parentElement){
        const style=getComputedStyle(parent);
        const maxY=parent.scrollHeight-parent.clientHeight,maxX=parent.scrollWidth-parent.clientWidth;
        const vertical=maxY>1&&/^(auto|scroll|overlay)$/.test(style.overflowY);
        const horizontal=maxX>1&&/^(auto|scroll|overlay)$/.test(style.overflowX);
        if(!vertical&&!horizontal)continue;
        const area=parent.getBoundingClientRect(),rect=target.getBoundingClientRect();
        const inset=parent.matches('.pmp18-content--compare')?(parent.querySelector('.pmp18-compare-compact')?.getBoundingClientRect().height||0)+8:0;
        const margin=Math.min(8,parent.clientHeight/4);
        const topEdge=area.top+parent.clientTop+inset+margin,leftEdge=area.left+parent.clientLeft;
        const top=vertical?clamp(parent.scrollTop+distance(rect.top,rect.bottom,topEdge,area.top+parent.clientTop+parent.clientHeight-margin,block),0,maxY):parent.scrollTop;
        const rtl=style.direction==='rtl';
        const left=horizontal?clamp(parent.scrollLeft+distance(rect.left,rect.right,leftEdge,leftEdge+parent.clientWidth,'nearest'),rtl?-maxX:0,rtl?0:maxX):parent.scrollLeft;
        if(Math.abs(top-parent.scrollTop)>.5||Math.abs(left-parent.scrollLeft)>.5){
            // Synchronous inner scrolling lets outer containers use the updated target rectangle.
            setScroll(parent,top,left);changed=true;
        }
    }
    return changed;
}

export function revealCompareMatches(matches) {
    const other=matches.find(mark=>mark.closest('.pmp18-multi-other-card.is-focus'))||matches.find(mark=>mark.closest('.pmp18-multi-other-card'));
    const base=matches.find(mark=>mark.closest('.pmp18-multi-base-fixed'));
    if(base)scrollWithinManager(base);
    scrollWithinManager(other||base||matches[matches.length-1],{block:'center'});
}

export function resetManagerFrame(root) {
    if(!root)return;
    for(const frame of [root,root.querySelector('.pmp18-window')]){
        if(frame&&(frame.scrollTop||frame.scrollLeft))setScroll(frame,0,0);
    }
}
