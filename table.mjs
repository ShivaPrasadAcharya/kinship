import {analyze,createSearch} from './model.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const matchesPerson=(p,query,info)=>createSearch(query).matches(p,info);
function highlighted(value,field,search){const str=String(value??'');if(!search.options.highlight)return esc(str);let at=0,out='';for(const r of search.ranges(str,field)){out+=esc(str.slice(at,r.start))+'<mark>'+esc(str.slice(r.start,r.end))+'</mark>';at=r.end;}return out+esc(str.slice(at));}

export function groupTablePeople(f,info=analyze(f),withSpouses=true){
  if(!withSpouses)return info.ordered.map(person=>({person,spouses:[]}));
  const owner=new Map();
  for(const person of info.ordered)if(info.meta.get(person.id).number){
    for(const id of person.spouses)if(!info.meta.get(id)?.number&&!owner.has(id))owner.set(id,person.id);
  }
  return info.ordered.filter(p=>!owner.has(p.id)).map(person=>({person,spouses:person.spouses.map((id,index)=>({person:info.by.get(id),marriage:index+1})).filter(s=>s.person)}));
}
function numberHtml(p,m,s,search){
  const classes=['number',p.gender,s.daughterLine&&m.viaDaughter?'daughter':'',s.marriageBars&&m.marriage?(m.marriage===1?'bar1':'bar2'):''].filter(Boolean).join(' ');
  return `<span class="${classes}">${highlighted(s.showNumbers?(m.number||'—'):'—','number',search)}</span>`;
}
function personLine(p,s,search,info,{marriage=null}={}){
  return `<div class="${marriage?'family-spouse-line':'family-person-line'}${search.active&&search.matches(p,info)&&search.options.highlight?' search-hit':''}" data-search-person="${esc(p.id)}" tabindex="-1"${marriage?' data-spouse="'+esc(p.id)+'"':''}><div class="entry-title">${marriage?'<span class="marriage-tag">m.'+marriage+'</span>':'<span class="person-dot '+p.gender+'"></span>'}<button class="person-link" data-person="${esc(p.id)}" title="Edit ${esc(p.name)}">${highlighted(p.name,'name',search)}${p.dead?' <span class="muted">'+esc(s.deceasedSymbol)+'</span>':''}</button>${s.showGender?'<span class="gender-text">'+esc(p.gender)+'</span>':''}<span class="entry-actions noprint"><button data-person="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">Edit</button><button class="danger" data-delete-person="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button></span></div>${s.showRelations&&p.label?'<small class="entry-relation">'+highlighted(p.label,'relation',search)+'</small>':''}</div>`;
}
function dates(p,s,search){return s.showDates?[p.birth?'Born '+p.birth:'',p.death?'Died '+p.death:''].filter(Boolean).map(value=>highlighted(value,'dates',search)).join('<br>'):'';}
function comments(p,info,s,search){
  const parents=p.parents.map(id=>info.by.get(id)?.name).filter(Boolean);
  return `${p.notes?'<div class="entry-comments">'+highlighted(p.notes,'comments',search)+'</div>':''}${s.showParents&&parents.length?'<small class="parent-detail">'+esc(s.parentsLabel)+': '+parents.map(value=>highlighted(value,'relation',search)).join(' · ')+'</small>':''}`;
}
export function renderGenealogyTable(f,s,info=analyze(f,s),query=''){
  const search=typeof query==='string'?createSearch(query):query;
  const groups=groupTablePeople(f,info,s.showSpouses).filter(g=>!search.active||!search.options.filter||search.matches(g.person,info)||g.spouses.some(x=>search.matches(x.person,info)));
  const headers=[s.nameLabel,s.numberLabel,s.datesLabel,s.notesLabel];
  const rows=groups.map(({person:p,spouses})=>{
    const m=info.meta.get(p.id),members=[{person:p,marriage:null},...spouses];
    const extra=(render)=>members.map(({person,marriage})=>{const content=render(person);return content?'<div class="member-detail">'+(marriage?'<small class="member-caption">m.'+marriage+' '+esc(person.name)+'</small>':'')+content+'</div>':'';}).join('');
    return `<tr data-row-person="${esc(p.id)}"><td><div class="family-name-group" style="--depth:${Math.min(12,m.depth)}">${personLine(p,s,search,info)}${spouses.map(({person,marriage})=>personLine(person,s,search,info,{marriage})).join('')}</div></td><td>${numberHtml(p,m,s,search)}</td><td>${extra(person=>dates(person,s,search))||'<span class="muted">—</span>'}</td><td>${extra(person=>comments(person,info,s,search))||'<span class="muted">—</span>'}</td></tr>`;
  });
  return {html:`<table class="genealogy-table"><caption class="sr-only">${esc(f.name)} genealogy. Spouses appear beneath names. Every record can be edited or deleted.</caption><colgroup><col class="name-column"><col class="number-column"><col class="dates-column"><col class="comments-column"></colgroup><thead><tr>${headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.join('')||'<tr><td colspan="4" class="muted">No people match this search.</td></tr>'}</tbody></table>`,matches:f.people.filter(p=>search.matches(p,info)).length};
}
