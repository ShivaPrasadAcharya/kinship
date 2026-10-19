import {analyze} from './model.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const matchesPerson=(p,query)=>!query||[p.name,p.label,p.notes,p.birth,p.death].join(' ').toLocaleLowerCase().includes(query);

export function groupTablePeople(f,info=analyze(f),withSpouses=true){
  if(!withSpouses)return info.ordered.map(person=>({person,spouses:[]}));
  const owner=new Map();
  for(const person of info.ordered)if(info.meta.get(person.id).number){
    for(const id of person.spouses)if(!info.meta.get(id)?.number&&!owner.has(id))owner.set(id,person.id);
  }
  return info.ordered.filter(p=>!owner.has(p.id)).map(person=>({person,spouses:person.spouses.map((id,index)=>({person:info.by.get(id),marriage:index+1})).filter(s=>s.person)}));
}
function numberHtml(p,m,s){
  const classes=['number',p.gender,s.daughterLine&&m.viaDaughter?'daughter':'',s.marriageBars&&m.marriage?(m.marriage===1?'bar1':'bar2'):''].filter(Boolean).join(' ');
  return `<span class="${classes}">${esc(s.showNumbers?(m.number||'—'):'—')}</span>`;
}
function personLine(p,s,{marriage=null}={}){
  return `<div class="${marriage?'family-spouse-line':'family-person-line'}"${marriage?' data-spouse="'+esc(p.id)+'"':''}><div class="entry-title">${marriage?'<span class="marriage-tag">m.'+marriage+'</span>':'<span class="person-dot '+p.gender+'"></span>'}<button class="person-link" data-person="${esc(p.id)}" title="Edit ${esc(p.name)}">${esc(p.name)}${p.dead?' <span class="muted">'+esc(s.deceasedSymbol)+'</span>':''}</button>${s.showGender?'<span class="gender-text">'+esc(p.gender)+'</span>':''}<span class="entry-actions noprint"><button data-person="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">Edit</button><button class="danger" data-delete-person="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button></span></div>${s.showRelations&&p.label?'<small class="entry-relation">'+esc(p.label)+'</small>':''}</div>`;
}
function dates(p,s){return s.showDates?[p.birth?'Born '+p.birth:'',p.death?'Died '+p.death:''].filter(Boolean).map(esc).join('<br>'):'';}
function comments(p,info,s){
  const parents=p.parents.map(id=>info.by.get(id)?.name).filter(Boolean);
  return `${p.notes?'<div class="entry-comments">'+esc(p.notes)+'</div>':''}${s.showParents&&parents.length?'<small class="parent-detail">'+esc(s.parentsLabel)+': '+parents.map(esc).join(' · ')+'</small>':''}`;
}
export function renderGenealogyTable(f,s,info=analyze(f,s),query=''){
  const groups=groupTablePeople(f,info,s.showSpouses).filter(g=>matchesPerson(g.person,query)||g.spouses.some(x=>matchesPerson(x.person,query)));
  const headers=[s.nameLabel,s.numberLabel,s.datesLabel,s.notesLabel];
  const rows=groups.map(({person:p,spouses})=>{
    const m=info.meta.get(p.id),members=[{person:p,marriage:null},...spouses];
    const extra=(render)=>members.map(({person,marriage})=>{const content=render(person);return content?'<div class="member-detail">'+(marriage?'<small class="member-caption">m.'+marriage+' '+esc(person.name)+'</small>':'')+content+'</div>':'';}).join('');
    return `<tr data-row-person="${esc(p.id)}"><td><div class="family-name-group" style="--depth:${Math.min(12,m.depth)}">${personLine(p,s)}${spouses.map(({person,marriage})=>personLine(person,s,{marriage})).join('')}</div></td><td>${numberHtml(p,m,s)}</td><td>${extra(person=>dates(person,s))||'<span class="muted">—</span>'}</td><td>${extra(person=>comments(person,info,s))||'<span class="muted">—</span>'}</td></tr>`;
  });
  return {html:`<table class="genealogy-table"><caption class="sr-only">${esc(f.name)} genealogy. Spouses appear beneath names. Every record can be edited or deleted.</caption><colgroup><col class="name-column"><col class="number-column"><col class="dates-column"><col class="comments-column"></colgroup><thead><tr>${headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.join('')||'<tr><td colspan="4" class="muted">No people match this search.</td></tr>'}</tbody></table>`,matches:f.people.filter(p=>matchesPerson(p,query)).length};
}
