export const DEFAULTS = Object.freeze({
  title:'Kinship', subtitle:'A place for every generation.', accent:'#356653', male:'#315a9a', female:'#a34369', unknown:'#66736d',
  font:'system', fontSize:15, density:'comfortable', direction:'down', lineStyle:'solid', nodeStyle:'rounded',
  nameLabel:'Name', numberLabel:'Henry no.', relationLabel:'Relation to root', parentsLabel:'Parents', spouseLabel:'Spouse(s)', datesLabel:'Dates', notesLabel:'Notes',
  showNumbers:true, showRelations:true, showDates:true, showNotes:false, showGender:true, showSpouses:true, showParents:true, showLegend:true,
  view:'table', rootNumber:'1', deceasedSymbol:'✝', daughterLine:true, marriageBars:true
});
export const RELATIONS = {ancestor:'Root / separate person',son:'Son of',daughter:'Daughter of',child:'Child of',brother:'Brother of',sister:'Sister of',father:'Father of',mother:'Mother of',wife:'Wife of',husband:'Husband of',spouse:'Spouse of'};
export const KINSHIP = {sm:['श्रीमान','श्रीमती'],db:['दाजु','बहिनी'],hn:['हजुरबा','नाति'],hnn:['हजूरबा','नातिनि'],st:['सोल्टा','सोल्टी'],bc:['बाबु','छोरा'],bd:['बाबु','छोरी'],dd:['दिदी','बहिनी']};
const GENDERS = {son:'M',daughter:'F',brother:'M',sister:'F',father:'M',mother:'F',wife:'F',husband:'M'};
export const uid=()=>globalThis.crypto?.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const key=s=>String(s??'').normalize('NFC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
export const text=(v,max=10000)=>typeof v==='string'?v.slice(0,max):'';
export function cleanSettings(s={}) {
  const o={...DEFAULTS};
  for(const k of Object.keys(o)) if(typeof s[k]===typeof o[k]) o[k]=typeof s[k]==='string'?s[k].slice(0,250):s[k];
  for(const k of ['accent','male','female','unknown']) if(!/^#[a-f\d]{6}$/i.test(o[k])) o[k]=DEFAULTS[k];
  o.fontSize=Math.min(22,Math.max(12,Number(o.fontSize)||15));
  for(const [k,choices] of Object.entries({font:['system','serif','nepali'],density:['compact','comfortable'],direction:['down','right'],lineStyle:['solid','dashed','dotted'],nodeStyle:['rounded','square'],view:['table','diagram']})) if(!choices.includes(o[k])) o[k]=DEFAULTS[k];
  return o;
}
export function blankFamily(name='Untitled family') { return {id:uid(),name,description:'',people:[],warnings:[]}; }
export function cleanPerson(p) {
  return {id:text(p.id,100)||uid(),name:text(p.name,250).trim(),gender:['M','F','U'].includes(p.gender)?p.gender:'U',dead:!!p.dead,
    parents:[...new Set((Array.isArray(p.parents)?p.parents:[]).filter(x=>typeof x==='string'))].slice(0,2),
    spouses:[...new Set((Array.isArray(p.spouses)?p.spouses:[]).filter(x=>typeof x==='string'))],
    order:Number.isInteger(Number(p.order))&&Number(p.order)>0?Math.min(999,Number(p.order)):null,
    birth:text(p.birth,80),death:text(p.death,80),label:text(p.label,250),notes:text(p.notes,5000)};
}
export function validateFamily(f) {
  const warnings=[], ids=new Set();
  for(const p of f.people) { if(!p.name) throw Error('Every person needs a name.'); if(ids.has(p.id)) throw Error('Duplicate person ID: '+p.id); ids.add(p.id); }
  const by=new Map(f.people.map(p=>[p.id,p]));
  for(const p of f.people) {
    for(const id of [...p.parents,...p.spouses]) if(!ids.has(id)) throw Error(`${p.name} refers to a person who is missing (${id}).`);
    if(p.parents.includes(p.id)||p.spouses.includes(p.id)) throw Error(`${p.name} cannot be their own parent or spouse.`);
    if(p.parents.some(id=>p.spouses.includes(id))) throw Error(`${p.name} has the same person as parent and spouse.`);
  }
  const done=new Set(), visiting=new Set();
  function visit(id) { if(visiting.has(id)) throw Error('Circular parent relationship involving '+by.get(id).name+'.'); if(done.has(id))return; visiting.add(id);by.get(id).parents.forEach(visit);visiting.delete(id);done.add(id); }
  f.people.forEach(p=>visit(p.id));
  // Make reciprocal spouse links explicit without changing their order.
  for(const p of f.people) for(const id of p.spouses) if(!by.get(id).spouses.includes(p.id)) by.get(id).spouses.push(p.id);
  for(const parent of f.people) {
    const orders=new Set();
    for(const p of f.people.filter(p=>p.parents[0]===parent.id&&p.order)) {if(orders.has(p.order))warnings.push(`Children of ${parent.name} share birth order ${p.order}.`);orders.add(p.order);}
  }
  return warnings;
}
export function legacyFamily(t) {
  const f=blankFamily(text(t.name,250)||'Family'), by=new Map(), entries=t.entries;
  const get=n=>{const k=key(n);if(!k)throw Error('A legacy relationship is missing a name.');if(!by.has(k)){const p=cleanPerson({id:uid(),name:n});by.set(k,p);f.people.push(p);}return by.get(k);};
  const marry=(a,b)=>{if(!a.spouses.includes(b.id))a.spouses.push(b.id);if(!b.spouses.includes(a.id))b.spouses.push(a.id);};
  for(const e of entries) {
    if(!e||!text(e.name).trim()||!RELATIONS[e.rel])throw Error('Invalid legacy person entry.');
    const p=get(e.name); p.gender=GENDERS[e.rel]||(['M','F','U'].includes(e.gender)?e.gender:p.gender);p.dead=!!e.dead;p.order=Number(e.ord)||null;
    p.label=e.rr?.key==='custom'?text(e.rr.custom,250):(KINSHIP[e.rr?.key]?.[(e.rr.role||2)-1]||'');
    if(e.rel!=='ancestor')get(e.who);
  }
  for(const e of entries) if(['wife','husband','spouse'].includes(e.rel))marry(get(e.who),get(e.name));
  for(const p of f.people)p.spouses.sort((a,b)=>(f.people.find(x=>x.id===a).order??999)-(f.people.find(x=>x.id===b).order??999));
  const parent=(p,a)=>{if(!p.parents.includes(a.id))p.parents.push(a.id);};
  for(const e of entries) {
    const p=get(e.name),a=e.rel==='ancestor'?null:get(e.who);
    if(['son','daughter','child'].includes(e.rel)) {
      parent(p,a);
      let partner=e.wife?by.get(key(e.wife)):f.people.find(x=>x.id===a.spouses[0]);
      if(e.wife&&!partner){partner=get(e.wife);marry(a,partner);}
      if(partner)parent(p,partner);
    } else if(['father','mother'].includes(e.rel))parent(a,p);
  }
  // Resolve siblings after all direct parents, including sibling chains.
  for(let pass=0;pass<entries.length;pass++) {
    let changed=false;
    for(const e of entries) if(['brother','sister'].includes(e.rel)) {
      const p=get(e.name),a=get(e.who);
      if(!p.parents.length&&a.parents.length){p.parents=[...a.parents];changed=true;}
      if(e.wife&&p.parents.length){const partner=by.get(key(e.wife));if(partner)p.parents=[p.parents[0],partner.id];}
    }
    if(!changed)break;
  }
  for(const e of entries) {
    const p=get(e.name);
    if(['brother','sister'].includes(e.rel)&&!p.parents.length)f.warnings.push(`${p.name}: add a parent to connect this sibling relationship with ${e.who}.`);
    if(!e.shift)continue;
    const old=get(e.shift.former),k=e.rr?.key,role=e.rr?.role||1;
    if(k==='sm')marry(p,old);
    else if(['bc','bd','hn','hnn'].includes(k)) {
      let top=role===1?p:old,bottom=role===1?old:p;
      if(['hn','hnn'].includes(k)){const middle=get(`Unknown parent of ${bottom.name}`);parent(middle,top);top=middle;}
      parent(bottom,top);
    } else if(['db','dd'].includes(k)) {
      if(old.parents.length)p.parents=[...old.parents];
      else {const unknown=get(`Unknown parent of ${old.name}`);parent(old,unknown);parent(p,unknown);}
    }
  }
  for(const p of f.people)if(p.parents.length>2)throw Error(`${p.name} has more than two parents in the legacy file; correct the relationships before importing.`);
  f.warnings.push(...validateFamily(f));return f;
}
export function normalizeDocument(d,filename='Family') {
  if(Array.isArray(d))d={tables:d};
  if(d&&Array.isArray(d.people))d={tables:[{...d,name:d.name||filename}],settings:d.settings};
  if(!d||!Array.isArray(d.tables)||!d.tables.length||d.tables.length>200)throw Error('Use a JSON object with a non-empty tables array (up to 200 families).');
  const tables=d.tables.map(t=>{
    if(!t||typeof t.name!=='string')throw Error('Every family needs a name.');
    if(Array.isArray(t.entries)){if(t.entries.length>2000)throw Error('A family can contain up to 2,000 entries.');const f=legacyFamily(t);if(f.people.length>2000)throw Error('A family can contain up to 2,000 people.');return f;}
    if(!Array.isArray(t.people)||t.people.length>2000)throw Error('Every family needs a people array (up to 2,000 people).');
    const f={id:text(t.id,100)||uid(),name:t.name.slice(0,250),description:text(t.description,2000),people:t.people.map(cleanPerson),warnings:[]};
    f.warnings=validateFamily(f);return f;
  });
  const ids=new Set();for(const f of tables){if(ids.has(f.id))f.id=uid();ids.add(f.id);}
  return {format:'kinsips',version:2,settings:cleanSettings(d.settings),tables};
}
export const henryDigit=n=>n<=9?String(n):n===10?'X':n<=36?String.fromCharCode(65+n-11):`[${n}]`;
export function analyze(f,settings=DEFAULTS) {
  const by=new Map(f.people.map(p=>[p.id,p])), children=new Map(f.people.map(p=>[p.id,[]])), meta=new Map();
  for(const p of f.people)if(p.parents[0]&&by.has(p.parents[0]))children.get(p.parents[0]).push(p);
  for(const list of children.values())list.sort((a,b)=>(a.order??9999)-(b.order??9999)||f.people.indexOf(a)-f.people.indexOf(b));
  const roots=f.people.filter(p=>!p.parents.length && (children.get(p.id).length ||
    (!p.spouses.some(s=>by.get(s)?.parents.length||children.get(s)?.length) && p.spouses.every(s=>f.people.indexOf(p)<f.people.indexOf(by.get(s))))));
  const ordered=[], seen=new Set();let rootCount=0;
  function walk(p,num,depth,via=false) {
    if(seen.has(p.id))return;seen.add(p.id);
    const par=by.get(p.parents[0]),other=p.parents[1],bar=par&&other?Math.max(0,par.spouses.indexOf(other)):0;
    meta.set(p.id,{number:num,depth,viaDaughter:via,marriage:bar});ordered.push(p);
    const used=new Set();let next=1;
    for(const c of children.get(p.id)) {
      let n=c.order;if(!n||used.has(n)){while(used.has(next))next++;n=next;}used.add(n);
      walk(c,num+henryDigit(n),depth+1,via||p.gender==='F');
    }
  }
  for(const p of roots){if(seen.has(p.id))continue;rootCount++;walk(p,rootCount===1?settings.rootNumber:`${settings.rootNumber}[${rootCount}]`,0);}
  // Unnumbered partners remain visible; their children must never disappear.
  for(const p of f.people)if(!seen.has(p.id)&&p.parents.length){rootCount++;walk(p,`${settings.rootNumber}[${rootCount}]`,0);}
  for(const p of f.people)if(!seen.has(p.id)){seen.add(p.id);meta.set(p.id,{number:'',depth:0,viaDaughter:false,marriage:0});ordered.push(p);}
  return {by,children,meta,ordered,roots,generations:Math.max(0,...[...meta.values()].map(m=>m.depth+1))};
}
export function applyRelative(f,person,{relation='ancestor',target='',otherParent=''}={}) {
  const by=new Map(f.people.map(p=>[p.id,p])),a=by.get(target);
  if(relation==='ancestor')return;
  if(!a)throw Error('Choose an existing related person.');
  if(a.id===person.id)throw Error('Choose someone other than this person.');
  if(GENDERS[relation])person.gender=GENDERS[relation];
  if(['son','daughter','child'].includes(relation))person.parents=[a.id,...(otherParent?[otherParent]:[])];
  else if(['father','mother'].includes(relation)) {
    if(a.parents.length===2&&!a.parents.includes(person.id))throw Error('This person already has two parents. Edit their record first.');
    if(!a.parents.includes(person.id))a.parents.push(person.id);
  } else if(['brother','sister'].includes(relation)) {
    if(!a.parents.length)throw Error('Add a parent to the selected sibling first, or choose a parent directly.');
    person.parents=[...a.parents];
  } else if(['wife','husband','spouse'].includes(relation)) {
    if(!person.spouses.includes(a.id))person.spouses.push(a.id);
    if(!a.spouses.includes(person.id))a.spouses.push(person.id);
  }
}
export function deletePerson(f,id) { f.people=f.people.filter(p=>p.id!==id);for(const p of f.people){p.parents=p.parents.filter(x=>x!==id);p.spouses=p.spouses.filter(x=>x!==id);} }
export function exportDocument(tables,settings) {return {format:'kinsips',version:2,exported:new Date().toISOString(),settings:cleanSettings(settings),tables:tables.map(({warnings,...t})=>structuredClone(t))};}
