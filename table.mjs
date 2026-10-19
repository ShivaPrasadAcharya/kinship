import {analyze,createSearch} from './model.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const matchesPerson=(p,query,info)=>createSearch(query).matches(p,info);
function highlighted(value,field,search){const str=String(value??'');if(!search.options.highlight)return esc(str);let at=0,out='';for(const r of search.ranges(str,field)){out+=esc(str.slice(at,r.start))+'<mark>'+esc(str.slice(r.start,r.end))+'</mark>';at=r.end;}return out+esc(str.slice(at));}

function birthParts(value){
  const source=String(value||'').trim().replace(/[०-९]/g,ch=>String(ch.charCodeAt(0)-0x0966));
  const calendar=/\b(?:B\.?S\.?)\b|वि[.\s]*सं|विक्रम/i.test(source)?'BS':/\b(?:A\.?D\.?|C\.?E\.?)\b|ईस्वी|इस्वी/i.test(source)?'AD':'unspecified';
  const digits=source.replace(/\b(?:B\.?S\.?|A\.?D\.?|C\.?E\.?)\b|वि[.\s]*सं[.\s]*|विक्रम\s*संवत्?|ईस्वी|इस्वी/gi,'').replace(/[.\s]+$/,'').trim();
  const match=digits.match(/^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?$/)||digits.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(!match||match[2]&&(Number(match[2])<1||Number(match[2])>12)||match[3]&&(Number(match[3])<1||Number(match[3])>32))return null;
  return {calendar,parts:match.slice(1).map(n=>n===undefined?null:Number(n))};
}
function compareSiblings(a,b,index){
  const explicit=(a.order??9999)-(b.order??9999);if(explicit)return explicit;
  const first=birthParts(a.birth),second=birthParts(b.birth);
  if(first&&second&&first.calendar===second.calendar){for(let i=0;i<3;i++){if(first.parts[i]===null||second.parts[i]===null)break;const diff=first.parts[i]-second.parts[i];if(diff)return diff;}}
  return index.get(a.id)-index.get(b.id);
}
export function orderTablePeople(f,info=analyze(f)){
  const index=new Map(f.people.map((p,i)=>[p.id,i])),children=new Map();
  for(const [parent,list] of info.children){
    const groups=new Map();for(const person of list){const key=JSON.stringify([...person.parents].sort());if(!groups.has(key))groups.set(key,[]);groups.get(key).push(person);}
    const partnerOrder=members=>{const other=members[0].parents.find(id=>id!==parent),n=info.by.get(parent).spouses.indexOf(other);return n<0?9999:n;};
    const ordered=[...groups.values()].sort((a,b)=>partnerOrder(a)-partnerOrder(b)||Math.min(...a.map(p=>index.get(p.id)))-Math.min(...b.map(p=>index.get(p.id))));
    children.set(parent,ordered.flatMap(group=>group.sort((a,b)=>compareSiblings(a,b,index))));
  }
  const result=[],seen=new Set();function walk(person){if(seen.has(person.id))return;seen.add(person.id);result.push(person);for(const child of children.get(person.id)||[])walk(child);}
  for(const person of info.roots)walk(person);for(const person of info.ordered)walk(person);
  return result;
}
export function groupTablePeople(f,info=analyze(f),withSpouses=true){
  const ordered=orderTablePeople(f,info);
  if(!withSpouses)return ordered.map(person=>({person,spouses:[]}));
  const owner=new Map();
  for(const person of ordered)if(info.meta.get(person.id).number){
    for(const id of person.spouses)if(!info.meta.get(id)?.number&&!owner.has(id))owner.set(id,person.id);
  }
  return ordered.filter(p=>!owner.has(p.id)).map(person=>({person,spouses:person.spouses.map((id,index)=>({person:info.by.get(id),marriage:index+1})).filter(s=>s.person)}));
}
function numberHtml(p,m,s,search){
  const classes=['number',p.gender,s.daughterLine&&m.viaDaughter?'daughter':'',s.marriageBars&&m.marriage?(m.marriage===1?'bar1':'bar2'):''].filter(Boolean).join(' ');
  return `<span class="${classes}">${highlighted(s.showNumbers?(m.number||'—'):'—','number',search)}</span>`;
}
function personLine(p,s,search,info,{marriage=null,generation=1}={}){
  return `<div class="${marriage?'family-spouse-line':'family-person-line'}${search.active&&search.matches(p,info)&&search.options.highlight?' search-hit':''}" data-search-person="${esc(p.id)}" tabindex="-1"${marriage?' data-spouse="'+esc(p.id)+'"':''}><div class="entry-title">${marriage?'<span class="marriage-tag">m.'+marriage+'</span>':'<span class="generation-badge '+p.gender+'" title="Generation '+generation+'" aria-label="Generation '+generation+'">'+generation+'</span>'}<button class="person-link" data-person="${esc(p.id)}" title="Edit ${esc(p.name)}">${highlighted(p.name,'name',search)}${p.dead?' <span class="muted">'+esc(s.deceasedSymbol)+'</span>':''}</button>${s.showGender?'<span class="gender-text">'+esc(p.gender)+'</span>':''}<span class="entry-actions noprint"><button data-person="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">Edit</button><button class="danger" data-delete-person="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button></span></div>${s.showRelations&&p.label?'<small class="entry-relation">'+highlighted(p.label,'relation',search)+'</small>':''}</div>`;
}
function dates(p,s,search){return s.showDates?[p.birth?'Born '+highlighted(p.birth,'dates',search):'',p.death?'Died '+highlighted(p.death,'dates',search):''].filter(Boolean).join('<br>'):'';}
function comments(p,info,s,search){
  const parents=p.parents.map(id=>info.by.get(id)?.name).filter(Boolean);
  return `${p.notes?'<div class="entry-comments">'+highlighted(p.notes,'comments',search)+'</div>':''}${s.showParents&&parents.length?'<small class="parent-detail">'+esc(s.parentsLabel)+': '+parents.map(value=>highlighted(value,'relation',search)).join(' · ')+'</small>':''}`;
}
function generationOf(person,info){
  const own=info.meta.get(person.id);if(own.number)return own.depth+1;
  const seen=new Set([person.id]),todo=[...person.spouses];let generation=Infinity;
  while(todo.length){const id=todo.shift();if(seen.has(id))continue;seen.add(id);const partner=info.by.get(id),meta=info.meta.get(id);if(meta?.number)generation=Math.min(generation,meta.depth+1);else if(partner)todo.push(...partner.spouses);}
  return Number.isFinite(generation)?generation:own.depth+1;
}
export function renderGenealogyTable(f,s,info=analyze(f,s),query=''){
  const search=typeof query==='string'?createSearch(query):query;
  const groups=groupTablePeople(f,info,s.showSpouses).filter(g=>!search.active||!search.options.filter||search.matches(g.person,info)||g.spouses.some(x=>search.matches(x.person,info)));
  const headers=[s.nameLabel,s.numberLabel,s.datesLabel,s.notesLabel];
  const rows=groups.map(({person:p,spouses})=>{
    const m=info.meta.get(p.id),generation=generationOf(p,info),members=[{person:p,marriage:null},...spouses];
    const extra=(render)=>members.map(({person,marriage})=>{const content=render(person);return content?'<div class="member-detail">'+(marriage?'<small class="member-caption">m.'+marriage+' '+esc(person.name)+'</small>':'')+content+'</div>':'';}).join('');
    return `<tr data-row-person="${esc(p.id)}" data-generation="${generation}"><td><div class="family-name-group" style="--depth:${Math.min(12,generation-1)}">${personLine(p,s,search,info,{generation})}${spouses.map(({person,marriage})=>personLine(person,s,search,info,{marriage})).join('')}</div></td><td>${numberHtml(p,m,s,search)}</td><td>${extra(person=>dates(person,s,search))||'<span class="muted">—</span>'}</td><td>${extra(person=>comments(person,info,s,search))||'<span class="muted">—</span>'}</td></tr>`;
  });
  return {html:`<table class="genealogy-table"><caption class="sr-only">${esc(f.name)} genealogy. Numbered badges show generations. Siblings are grouped by parents, elder to younger. Spouses appear beneath names. Every record can be edited or deleted.</caption><colgroup><col class="name-column"><col class="number-column"><col class="dates-column"><col class="comments-column"></colgroup><thead><tr>${headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.join('')||'<tr><td colspan="4" class="muted">No people match this search.</td></tr>'}</tbody></table>`,matches:f.people.filter(p=>search.matches(p,info)).length};
}
