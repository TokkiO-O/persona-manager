import { load, CORE_SCHEMA } from './vendor/js-yaml.mjs';
import { lineRanges } from './text-edit.js';

const unsafe=new Set(['__proto__','constructor','prototype']);
const eolOf=text=>text.includes('\r\n')?'\r\n':'\n';
export const fieldKey=(path,fold=false)=>JSON.stringify(path.map(key=>fold?String(key).trim().toLocaleLowerCase():String(key)));
export function comparable(value) {
    if(Array.isArray(value))return '['+value.map(comparable).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+comparable(value[key])).join(',')+'}';
    if(typeof value==='number'&&!Number.isFinite(value))return String(value);
    return JSON.stringify(value);
}
export const displayFieldValue=value=>typeof value==='string'?value:JSON.stringify(value,null,2);

function markdown(text) {
    const nodes=[],stack=[];let fence=null;
    for(const line of lineRanges(text)){
        const marker=line.label.match(/^\s*(`{3,}|~{3,})/);
        if(marker){if(!fence)fence={char:marker[1][0],length:marker[1].length};else if(marker[1][0]===fence.char&&marker[1].length>=fence.length)fence=null;continue;}
        if(fence)continue;
        const match=line.label.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);if(!match)continue;
        const level=match[1].length,title=match[2].trim();
        while(stack.length&&stack[stack.length-1].level>=level)stack.pop();
        const parent=stack[stack.length-1]||null;
        const node={path:[...(parent?.path||[]),title],title,level,start:line.start,bodyStart:line.end,end:text.length,parent,children:[]};
        parent?.children.push(node);nodes.push(node);stack.push(node);if(nodes.length>1500)throw new Error('章节超过 1500 个，请先按部分处理。');
    }
    for(let i=0;i<nodes.length;i++){const next=nodes.slice(i+1).find(node=>node.level<=nodes[i].level);nodes[i].end=next?.start??text.length;}
    const fields=nodes.filter(node=>!node.children.length||text.slice(node.bodyStart,node.children[0].start).trim()).map(node=>({...node,bodyEnd:node.children[0]?.start??node.end,value:text.slice(node.bodyStart,node.children[0]?.start??node.end).replace(/[\r\n]+$/,''),key:fieldKey(node.path,true)}));
    if(new Set(fields.map(field=>field.key)).size!==fields.length)throw new Error('有同名同层章节，无法确定字段位置，请先区分标题。');
    return {kind:'markdown',text,fields,nodes};
}

export function parseFields(value,format='auto') {
    const text=String(value??'');
    if(text.length>2_000_000)throw new Error('文本过长，请先使用段落模式。');
    const md=markdown(text);
    const kind=format==='auto'?(text.trimStart().startsWith('{')?'json':md.nodes.length?'markdown':'yaml'):format;
    if(kind==='markdown'){if(!md.nodes.length)throw new Error('没有找到 Markdown 章节标题。');return md;}
    if(kind==='json')JSON.parse(text);
    const roots=[],stack=[];
    const result=load(text,{schema:CORE_SCHEMA,json:false,listener:(event,state)=>{
        if(event==='open'){const node={start:state.position,children:[]};if(stack.length)stack[stack.length-1].children.push(node);else roots.push(node);stack.push(node);}
        else{const node=stack.pop();Object.assign(node,{end:state.position,kind:state.kind,value:state.result,anchor:state.anchor,raw:text.slice(node.start,state.position)});}
    }});
    const unwrap=node=>{while(node?.kind==='mapping'&&node.children.length===1&&node.children[0].kind==='mapping'&&node.children[0].value===node.value)node=node.children[0];return node;};
    const root=unwrap(roots[0]);
    if(!root||root.kind!=='mapping'||!result||typeof result!=='object'||Array.isArray(result))throw new Error('字段模式需要 JSON/YAML 对象或 Markdown 章节。');
    const fields=[],maps=[];
    const visit=(node,path=[],parentKey=null)=>{
        node=unwrap(node);
        if(node.anchor||/^\s*\*/.test(node.raw))throw new Error('这份 YAML 使用了锚点或别名，请用段落或全文模式保留其关联。');
        if(node.kind==='mapping'){
            maps.push({path,node,parentKey});
            if(node.children.length%2)throw new Error('此映射包含复杂键，请使用全文模式。');
            if(!node.children.length&&path.length)fields.push({path,key:fieldKey(path),node,value:node.value,parentKey});
            for(let i=0;i<node.children.length;i+=2){const key=node.children[i],child=node.children[i+1];if(!['string','number','boolean'].includes(typeof key.value)||unsafe.has(String(key.value)))throw new Error('字段名称不支持自动处理。');visit(child,[...path,String(key.value)],key);}
        }else{for(const child of node.children)if(child.anchor||/^\s*\*/.test(child.raw))throw new Error('字段含有锚点或别名，请使用全文模式。');fields.push({path,key:fieldKey(path),node,value:node.value,parentKey});}
    };
    visit(root);
    if(fields.length>1500)throw new Error('字段超过 1500 个，请先按章节处理。');
    return {kind,text,value:result,root,fields,maps};
}

function jsonSafe(value) {
    if(typeof value==='number'&&!Number.isFinite(value))return false;
    if(value&&typeof value==='object')return Object.entries(value).every(([key,child])=>!unsafe.has(key)&&jsonSafe(child));
    return ['string','number','boolean'].includes(typeof value)||value===null;
}
function nested(path,value) {let result=structuredClone(value);for(let i=path.length-1;i>=0;i--){if(unsafe.has(path[i]))throw new Error('字段名称不支持自动处理。');result={ [path[i]]: result };}return result;}
function setExpected(object,path,value) {let current=object;for(let i=0;i<path.length-1;i++){if(unsafe.has(path[i]))throw new Error('字段名称无效');if(!current[path[i]]||typeof current[path[i]]!=='object'||Array.isArray(current[path[i]]))current[path[i]]={};current=current[path[i]];}current[path[path.length-1]]=structuredClone(value);}

export function writeField(document,path,value) {
    const {text,kind}=document,eol=eolOf(text),existing=document.fields.find(field=>field.key===fieldKey(path,kind==='markdown'));
    const actualPath=existing?.path||path;
    if(kind==='markdown'){
        const rendered=typeof value==='string'?value:'```json'+eol+JSON.stringify(value,null,2)+eol+'```';
        if(existing){const suffix=text.slice(existing.bodyEnd);const addition=rendered+(suffix||text.slice(existing.bodyStart,existing.bodyEnd).endsWith('\n')?eol+eol:'');return text.slice(0,existing.bodyStart)+addition+suffix;}
        const parent=document.nodes.filter(node=>node.path.length<path.length&&node.path.every((key,i)=>fieldKey([key],true)===fieldKey([path[i]],true))).sort((a,b)=>b.path.length-a.path.length)[0];
        const remaining=path.slice(parent?.path.length||0),baseLevel=parent?.level||Math.min(...document.nodes.map(node=>node.level),2)-1;
        const headers=remaining.map((name,i)=>'#'.repeat(Math.min(6,baseLevel+i+1))+' '+name).join(eol+eol);
        const at=parent?.end??text.length,addition=(at&&!text.slice(0,at).endsWith(eol+eol)?eol:'')+headers+eol+rendered+eol+eol;
        return text.slice(0,at)+addition+text.slice(at);
    }
    if(!jsonSafe(value))throw new Error('此字段含特殊 YAML 值，请使用全文模式。');
    let next;
    if(existing){
        const node=existing.node,raw=text.slice(node.start,node.end);
        if(kind==='json'){
            const lead=raw.match(/^\s*/)[0].length,tail=raw.match(/\s*$/)[0].length;
            next=text.slice(0,node.start+lead)+JSON.stringify(value)+text.slice(Math.max(node.start+lead,node.end-tail));
        }else{
            const lead=raw.match(/^[ \t]*/)[0]||' ',tail=!/[\r\n]/.test(raw)?raw.match(/[ \t]*$/)[0]:'';
            const after=text.slice(node.end),lineEnd=/[\r\n]$/.test(raw)&&(!after||!after.startsWith('\n')&&!after.startsWith('\r'))?eol:'';
            next=text.slice(0,node.start)+lead+JSON.stringify(value)+tail+lineEnd+after;
        }
    }else{
        const parents=document.maps.filter(map=>map.path.length<path.length&&map.path.every((key,i)=>fieldKey([key])===fieldKey([path[i]]))).sort((a,b)=>b.path.length-a.path.length);
        const parent=parents[0]||document.maps[0],remaining=path.slice(parent.path.length),key=remaining[0],newValue=nested(remaining.slice(1),value),raw=text.slice(parent.node.start,parent.node.end),flow=raw.trimStart().startsWith('{');
        if(flow){
            let close=parent.node.end-1;while(close>=parent.node.start&&/\s/.test(text[close]))close--;if(text[close]!=='}')throw new Error('未找到字段容器边界。');
            let at=close;while(at>parent.node.start&&/\s/.test(text[at-1]))at--;
            const multiline=raw.includes('\n'),firstKey=parent.node.children[0],indent=firstKey?firstKey.start-(text.lastIndexOf('\n',firstKey.start-1)+1):2;
            const before=parent.node.children.length?',':'',spacing=multiline?eol+' '.repeat(indent):before?' ':'';
            next=text.slice(0,at)+before+spacing+JSON.stringify(key)+': '+JSON.stringify(newValue)+text.slice(at);
        }else{
            const first=parent.node.children[0],indent=first?first.start-(text.lastIndexOf('\n',first.start-1)+1):parent.parentKey?parent.parentKey.start-(text.lastIndexOf('\n',parent.parentKey.start-1)+1)+2:0;
            const at=parent.node.end,prefix=text.slice(0,at),addition=(prefix&&!/[\r\n]$/.test(prefix)?eol:'')+' '.repeat(indent)+JSON.stringify(key)+': '+JSON.stringify(newValue)+eol;
            next=prefix+addition+text.slice(at);
        }
    }
    const parsed=parseFields(next,kind),expected=structuredClone(document.value);
    setExpected(expected,actualPath,value);
    if(comparable(parsed.value)!==comparable(expected))throw new Error('字段变更影响了其他结构，已停止应用。请使用全文模式核对。');
    return next;
}

export function applyFieldChanges(text,changes,format='auto') {
    let document=parseFields(text,format),next=text;
    for(const change of changes){next=writeField(document,change.path,change.value);document=parseFields(next,document.kind);}
    return {text:next,format:document.kind};
}
