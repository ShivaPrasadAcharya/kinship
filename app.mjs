import {DEFAULTS,RELATIONS,KINSHIP,uid,text,cleanSettings,cleanPerson,blankFamily,normalizeDocument,validateFamily,analyze,applyRelative,deletePerson,exportDocument} from './model.mjs';
import {createDiagram} from './diagram.mjs';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='kinsips-workspace-v2';
const published=new Map(), history=[];
let disk={custom:[],edits:{},hidden:[],settings:null,active:'',view:null},settings={...DEFAULTS},families=[],selected=null,editing=null,pendingImport=[],zoom=1,diagram=null,loading=true,storageError=false;
try {const raw=localStorage.getItem(STORAGE);if(raw){const d=JSON.parse(raw);disk={custom:Array.isArray(d.custom)?d.custom:[],edits:d.edits&&typeof d.edits==='object'?d.edits:{},hidden:Array.isArray(d.hidden)?d.hidden:[],settings:d.settings||null,active:text(d.active),view:d.view==='diagram'?'diagram':d.view==='table'?'table':null};
  for(const item of disk.custom)item.family=normalizeDocument({tables:[item.family]}).tables[0];
  for(const k of Object.keys(disk.edits))disk.edits[k]=normalizeDocument({tables:[disk.edits[k]]}).tables[0];
}}catch{disk={custom:[],edits:{},hidden:[],settings:null,active:'',view:null};storageError=true;}
settings=cleanSettings(disk.settings||{});
function notice(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(disk));storageError=false;$('saveState').textContent='Edits are saved on this browser. Export to keep a copy.';}catch{storageError=true;$('saveState').textContent='Browser storage is unavailable or full. Export JSON to keep your changes.';notice('Could not save in this browser. Export JSON to keep your changes.',true);}}
function checkpoint(){history.push(JSON.stringify(disk));if(history.length>30)history.shift();$('undoButton').disabled=false;}
function rebuild(){families=[];for(const [id,item] of published)if(!disk.hidden.includes(id))families.push({...item,key:id,family:disk.edits[id]||item.family});for(const item of disk.custom)families.push({...item,source:'Local family',family:item.family});selected=families.find(f=>f.key===disk.active)||families[0]||null;if(selected)disk.active=selected.key;}
function current(){return selected?.family;}
function saveFamily(f){
  validateFamily(f);const custom=disk.custom.find(x=>x.key===selected.key);
  if(custom)custom.family=f;else disk.edits[selected.key]=f;
  persist();rebuild();render();
}
function saveView(view){disk.view=view;persist();render();}
function setOptions(id,options,value){const el=$(id);el.replaceChildren(...options.map(([v,label])=>{const o=document.createElement('option');o.value=v;o.textContent=label;return o;}));el.value=value??'';}
function setStyle(){
  const root=document.documentElement;for(const k of ['accent','male','female','unknown'])root.style.setProperty('--'+k,settings[k]);
  root.style.setProperty('--text-size',settings.fontSize+'px');root.style.setProperty('--family-font',settings.font==='serif'?'Georgia,"Noto Serif Devanagari",serif':settings.font==='nepali'?'"Noto Sans Devanagari","Nirmala UI",Mangal,sans-serif':'ui-sans-serif,system-ui,"Segoe UI",Arial,sans-serif');
  document.body.classList.toggle('compact',settings.density==='compact');$('siteTitle').textContent=settings.title;$('siteSubtitle').textContent=settings.subtitle;document.title=(settings.title||'Kinship')+' · Family genealogy';
  for(const [k,v] of Object.entries(settings)){const el=$('customizeForm').elements.namedItem(k);if(el){if(el.type==='checkbox')el.checked=v;else el.value=v;}}
}
function matches(p,query){return !query||[p.name,p.label,p.notes,p.birth,p.death].join(' ').toLocaleLowerCase().includes(query);}
function numHtml(p,m){const classes=['number',p.gender,settings.daughterLine&&m.viaDaughter?'daughter':'',settings.marriageBars&&m.marriage?(m.marriage===1?'bar1':'bar2'):''].filter(Boolean).join(' ');return `<span class="${classes}">${esc(m.number||'—')}</span>`;}
function renderTable(f,info,q){
  const headers=[settings.nameLabel,...(settings.showNumbers?[settings.numberLabel]:[]),...(settings.showRelations?[settings.relationLabel]:[]),...(settings.showParents?[settings.parentsLabel]:[]),...(settings.showSpouses?[settings.spouseLabel]:[]),...(settings.showDates?[settings.datesLabel]:[]),...(settings.showNotes?[settings.notesLabel]:[])];
  const names=ids=>ids.map(id=>info.by.get(id)?.name).filter(Boolean).map(esc).join('<br>');
  const rows=info.ordered.filter(p=>matches(p,q)).map(p=>{
    const m=info.meta.get(p.id),dates=[p.birth?'Born '+p.birth:'',p.death?'Died '+p.death:''].filter(Boolean).map(esc).join('<br>');
    return `<tr><td><button class="person-link" data-person="${esc(p.id)}" style="margin-left:${Math.min(6,m.depth)*12}px" title="Edit ${esc(p.name)}"><span class="person-dot ${p.gender}"></span><span>${esc(p.name)}${p.dead?' <span class="muted">'+esc(settings.deceasedSymbol)+'</span>':''}</span></button>${settings.showGender?'<span class="gender-text">'+(p.gender==='M'?'M':p.gender==='F'?'F':'U')+'</span>':''}</td>${settings.showNumbers?'<td>'+numHtml(p,m)+'</td>':''}${settings.showRelations?'<td>'+(p.label?'<span class="tag">'+esc(p.label)+'</span>':'<span class="muted">—</span>')+'</td>':''}${settings.showParents?'<td>'+names(p.parents)+'</td>':''}${settings.showSpouses?'<td>'+names(p.spouses)+'</td>':''}${settings.showDates?'<td><small>'+dates+'</small></td>':''}${settings.showNotes?'<td><small>'+esc(p.notes)+'</small></td>':''}</tr>`;
  });
  $('tablePanel').innerHTML=`<table><caption class="sr-only">${esc(f.name)} genealogy. Select a name to edit.</caption><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${headers.length}" class="muted">No people match this search.</td></tr>`}</tbody></table>`;
  $('matchCount').textContent=q?`${rows.length} of ${f.people.length}`:'';
}
function setZoom(value){zoom=Math.min(2.5,Math.max(.15,value));const svg=$('diagramCanvas').querySelector('svg');if(svg&&diagram){svg.setAttribute('width',diagram.width*zoom);svg.setAttribute('height',diagram.height*zoom);}$('zoomValue').textContent=Math.round(zoom*100)+'%';}
function fit(){if(!diagram)return;const viewport=$('diagramViewport');setZoom(Math.min(1,(viewport.clientWidth-45)/diagram.width,(viewport.clientHeight-40)/diagram.height));}
function render(){
  setStyle();rebuild();
  setOptions('familySelect',families.length?families.map(f=>[f.key,f.family.name+(f.source==='Local family'?' · local':'')]):[['','No family selected']],disk.active);
  const f=current(),view=disk.view||settings.view,q=$('search').value.trim().toLocaleLowerCase();
  $('tableView').setAttribute('aria-pressed',view==='table');$('diagramView').setAttribute('aria-pressed',view==='diagram');
  $('tablePanel').hidden=view!=='table'||!f?.people.length;$('diagramPanel').hidden=view!=='diagram'||!f?.people.length;$('downloadSvg').hidden=view!=='diagram'||!f?.people.length;
  $('emptyState').hidden=!!f?.people.length;$('familySettings').hidden=!f;$('familySettingsButton').disabled=!f;$('exportFamily').disabled=!f;$('exportButton').disabled=!families.length;
  $('familyTitle').textContent=f?.name||'Start your family story';$('familyDescription').textContent=f?.description||'';$('familySource').textContent=selected?.source||'FAMILY COLLECTION';$('familyName').value=f?.name||'';$('familyDesc').value=f?.description||'';
  $('resetFamily').hidden=!selected||!published.has(selected.key)||!disk.edits[selected.key];
  $('warnings').replaceChildren();
  if(f){
    const info=analyze(f,settings);$('familyStats').innerHTML=`<div><b>${f.people.length}</b><span>people</span></div><div><b>${info.generations}</b><span>generations</span></div><div><b>${families.length}</b><span>families</span></div>`;
    renderTable(f,info,q);
    let extra=[];
    if(view==='diagram'&&f.people.length){diagram=createDiagram(f,settings,{query:q});$('diagramCanvas').innerHTML=diagram.svg;extra=diagram.warnings;setZoom(zoom);$('matchCount').textContent=q?`${f.people.filter(p=>matches(p,q)).length} of ${f.people.length}`:'';}
    const warnings=[...new Set([...(f.warnings||[]),...validateFamily(structuredClone(f)),...extra])];
    if(warnings.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`Check ${warnings.length} relationship note${warnings.length===1?'':'s'}`;details.append(summary);for(const message of warnings){const p=document.createElement('p');p.textContent=message;details.append(p);}$('warnings').append(details);}
  }else{$('familyStats').textContent='';$('tablePanel').replaceChildren();$('diagramCanvas').replaceChildren();$('matchCount').textContent='';}
  $('legend').hidden=!settings.showLegend||!f?.people.length;
  $('legend').innerHTML=`<span><i class="person-dot M"></i>Male</span><span><i class="person-dot F"></i>Female</span><span><i class="person-dot U"></i>Unknown</span><span>${esc(settings.deceasedSymbol)} Deceased</span>${settings.daughterLine?'<span><b class="number daughter">123</b> Daughter’s line</span>':''}${settings.marriageBars?'<span><b class="number bar1">123</b> 2nd marriage · double bar: 3rd or later</span>':''}`;
  $('undoButton').disabled=!history.length;
  if(storageError)$('saveState').textContent='Browser storage unavailable. Export JSON to keep changes.';
}
async function fetchJSON(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(`Could not load ${path} (${r.status}).`);const str=await r.text();if(str.length>10000000)throw Error(`${path} exceeds the 10 MB file limit.`);return JSON.parse(str);}
async function loadPublished(){
  let errors=[];
  try{
    const manifest=await fetchJSON('./data/index.json');
    if(!Array.isArray(manifest.files))throw Error('The family catalog is invalid.');
    const results=await Promise.allSettled(manifest.files.map(async name=>{
      if(typeof name!=='string'||!/\.json$/i.test(name)||name.split('/').some(x=>x==='..'||x==='')||name.startsWith('/'))throw Error('Invalid catalog path.');
      const d=normalizeDocument(await fetchJSON('./data/'+name.split('/').map(encodeURIComponent).join('/')),name.replace(/\.json$/i,''));
      d.tables.forEach((family,i)=>published.set('repo:'+name+'#'+i,{family,source:name}));
    }));
    errors=results.filter(x=>x.status==='rejected').map(x=>x.reason.message);
  }catch(e){errors.push(e.message+' Import JSON or use Add .json files to add a family.');}
  try{const s=await fetchJSON('./site-settings.json');if(!disk.settings)settings=cleanSettings(s);}catch{}
  loading=false;rebuild();render();
  if(errors.length)notice(errors.join(' '),true);
  else if(storageError)notice('Browser storage is unavailable. Export JSON to keep changes.',true);
  else if(disk.custom.length||Object.keys(disk.edits).length)notice('Your saved browser edits have been restored. Published families are loaded alongside them.');
  else notice('Choose a family to explore. Select a name to edit, or switch to Diagram.');
}
function createFamily(){checkpoint();const f=blankFamily();const item={key:'local:'+uid(),family:f};disk.custom.push(item);disk.active=item.key;persist();rebuild();render();$('familySettings').open=true;$('familyName').focus();$('familyName').select();}
function download(content,name,mime){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function filename(name){return name.normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,80)||'family';}
function exportJSON(all=false){const tables=all?families.map(f=>f.family):[current()].filter(Boolean);download(JSON.stringify(exportDocument(tables,settings),null,2),all?'kinship-collection.json':filename(current()?.name||'family')+'.json','application/json');notice('Exported JSON. To publish it, choose Add .json files and commit it to data/.');}
function optionsForPeople(exclude=''){return current().people.filter(p=>p.id!==exclude).map((p,i)=>[p.id,p.name+' · '+(p.gender||'U')+(current().people.some(other=>other.id!==p.id&&other.name===p.name)?' · '+p.id.slice(-6):'')]);}
function openPerson(id=null){
  if(!current()){createFamily();}
  editing=id;const f=current(),p=id?f.people.find(p=>p.id===id):cleanPerson({name:'',gender:'M'});
  $('personDialogTitle').textContent=id?'Edit person':'Add a person';$('personName').value=p.name;$('personGender').value=p.gender;$('personOrder').value=p.order||'';$('personDead').checked=p.dead;$('personBirth').value=p.birth;$('personDeath').value=p.death;$('personLabel').value=p.label;$('personNotes').value=p.notes;$('personError').textContent='';
  $('deletePerson').hidden=!id;$('addRelationFields').hidden=!!id;$('parentFields').hidden=!id;$('personSpousesDetails').open=false;
  const choices=optionsForPeople(id),blank=[['','— None —'],...choices];
  setOptions('personRelation',Object.entries(RELATIONS),f.people.length?'son':'ancestor');setOptions('personTarget',blank,f.people[0]?.id||'');setOptions('personParent1',blank,p.parents[0]);setOptions('personParent2',blank,p.parents[1]);setOptions('personOtherParent',blank,'');
  $('personSpouses').replaceChildren();for(const [val,name] of choices){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=val;input.checked=p.spouses.includes(val);label.append(input,document.createTextNode(name));$('personSpouses').append(label);}
  if(!choices.length)$('personSpouses').textContent='Add another person before connecting spouses.';
  updateRelation();$('personDialog').showModal();$('personName').focus();
}
function updateRelation(){const rel=$('personRelation').value;const child=['son','daughter','child'].includes(rel);$('targetField').hidden=rel==='ancestor';$('otherParentField').hidden=!!editing||!child;if(!editing){const g={son:'M',daughter:'F',father:'M',mother:'F',brother:'M',sister:'F',wife:'F',husband:'M'}[rel];if(g)$('personGender').value=g;
  const target=current().people.find(p=>p.id===$('personTarget').value);setOptions('personOtherParent',[['','— None —'],...optionsForPeople().filter(([id])=>id!==target?.id)],target?.spouses[0]||'');}}
function savePerson(ev){
  ev.preventDefault();const f=structuredClone(current());const original=editing?f.people.find(p=>p.id===editing):null;
  const p=cleanPerson({id:original?.id||uid(),name:$('personName').value,gender:$('personGender').value,dead:$('personDead').checked,order:Number($('personOrder').value)||null,birth:$('personBirth').value,death:$('personDeath').value,label:$('personLabel').value,notes:$('personNotes').value,
    parents:editing?[$('personParent1').value,$('personParent2').value].filter(Boolean):[],spouses:[...$('personSpouses').querySelectorAll('input:checked')].map(el=>el.value)});
  try{
    if(!p.name)throw Error('Enter a name.');if(editing&&$('personParent1').value&&$('personParent1').value===$('personParent2').value)throw Error('Choose two different parents.');
    if(editing)f.people[f.people.findIndex(x=>x.id===editing)]=p;else f.people.push(p);
    for(const other of f.people)if(other.id!==p.id){other.spouses=other.spouses.filter(id=>id!==p.id);if(p.spouses.includes(other.id))other.spouses.push(p.id);}
    if(!editing)applyRelative(f,p,{relation:$('personRelation').value,target:$('personTarget').value,otherParent:$('personOtherParent').value});
    f.warnings=[];validateFamily(f);checkpoint();saveFamily(f);$('personDialog').close();notice(p.name+' saved. Export JSON when you are ready to publish.');
  }catch(e){$('personError').textContent=e.message;}
}
async function readImports(files){
  const collected=[],errors=[];
  for(const file of files){try{if(file.size>10000000)throw Error('File exceeds 10 MB.');const d=normalizeDocument(JSON.parse(await file.text()),file.name);collected.push(...d.tables.map(f=>({family:f,filename:file.name,settings:d.settings})));}catch(e){errors.push(file.name+': '+e.message);}}
  if(errors.length){notice('Import cancelled. '+errors.join(' '),true);return;}
  if(!collected.length)return;pendingImport=collected;$('importSummary').textContent=`${files.length} file(s), ${collected.length} family/families, ${collected.reduce((n,x)=>n+x.family.people.length,0)} people. Existing families will be kept.`;$('importDialog').showModal();
}
$('familySelect').addEventListener('change',()=>{disk.active=$('familySelect').value;persist();$('search').value='';rebuild();render();if((disk.view||settings.view)==='diagram')requestAnimationFrame(fit);});
$('tableView').addEventListener('click',()=>saveView('table'));$('diagramView').addEventListener('click',()=>{saveView('diagram');requestAnimationFrame(fit);});
for(const id of ['addPersonButton','emptyAdd'])$(id).addEventListener('click',()=>openPerson());
$('familySettingsButton').addEventListener('click',()=>{$('familySettings').open=!$('familySettings').open;});
$('customizeButton').addEventListener('click',()=>{$('customize').open=!$('customize').open;if($('customize').open)$('customize').scrollIntoView({behavior:'smooth',block:'nearest'});});
$('helpButton').addEventListener('click',()=>{$('help').open=!$('help').open;if($('help').open)$('help').scrollIntoView({behavior:'smooth',block:'start'});});
$('saveFamily').addEventListener('click',()=>{const name=$('familyName').value.trim();if(!name){$('familyName').focus();return;}checkpoint();const f=structuredClone(current());f.name=name;f.description=$('familyDesc').value;saveFamily(f);notice('Family details saved.');});
$('newFamily').addEventListener('click',createFamily);
$('duplicateFamily').addEventListener('click',()=>{checkpoint();const f=structuredClone(current());f.id=uid();f.name+=' (copy)';const item={key:'local:'+uid(),family:f};disk.custom.push(item);disk.active=item.key;persist();rebuild();render();notice('Family duplicated. You can rename and edit the copy.');});
$('deleteFamily').addEventListener('click',()=>{if(!confirm('Delete “'+current().name+'” from this browser? You can undo this.'))return;checkpoint();if(published.has(selected.key))disk.hidden.push(selected.key);else disk.custom=disk.custom.filter(x=>x.key!==selected.key);delete disk.edits[selected.key];disk.active='';persist();rebuild();render();notice('Family removed from this browser. The published JSON is unchanged.');});
$('resetFamily').addEventListener('click',()=>{if(!confirm('Replace local edits with this family’s published version? You can undo this.'))return;checkpoint();delete disk.edits[selected.key];persist();rebuild();render();notice('Published family restored.');});
$('customizeForm').addEventListener('submit',ev=>{ev.preventDefault();checkpoint();const next={...settings};for(const k of Object.keys(DEFAULTS)){const el=ev.currentTarget.elements.namedItem(k);if(el)next[k]=el.type==='checkbox'?el.checked:typeof DEFAULTS[k]==='number'?Number(el.value):el.value;}settings=cleanSettings(next);disk.settings=settings;disk.view=settings.view;persist();render();notice('Customization applied. Included in your next JSON export.');if((disk.view||settings.view)==='diagram')requestAnimationFrame(fit);});
$('resetStyle').addEventListener('click',()=>{checkpoint();settings={...DEFAULTS};disk.settings=settings;disk.view=settings.view;persist();render();notice('Default appearance restored.');});
$('search').addEventListener('input',render);
$('undoButton').addEventListener('click',()=>{if(!history.length)return;disk=JSON.parse(history.pop());settings=cleanSettings(disk.settings||settings);persist();rebuild();render();notice('Last change undone.');});
$('tablePanel').addEventListener('click',ev=>{const b=ev.target.closest('[data-person]');if(b)openPerson(b.dataset.person);});
$('diagramCanvas').addEventListener('click',ev=>{const b=ev.target.closest('[data-person]');if(b)openPerson(b.dataset.person);});
$('diagramCanvas').addEventListener('keydown',ev=>{if(['Enter',' '].includes(ev.key)){const b=ev.target.closest('[data-person]');if(b){ev.preventDefault();openPerson(b.dataset.person);}}});
$('personForm').addEventListener('submit',savePerson);$('personRelation').addEventListener('change',updateRelation);$('personTarget').addEventListener('change',updateRelation);
for(const id of ['closePerson','cancelPerson'])$(id).addEventListener('click',()=>$('personDialog').close());
$('deletePerson').addEventListener('click',()=>{const f=current(),p=f.people.find(p=>p.id===editing),count=f.people.filter(x=>x.parents.includes(p.id)||x.spouses.includes(p.id)).length;if(!confirm(`Delete ${p.name}? ${count} linked record(s) will be disconnected. You can undo this.`))return;checkpoint();const copy=structuredClone(f);deletePerson(copy,p.id);copy.warnings=[];saveFamily(copy);$('personDialog').close();notice('Person deleted; references were removed.');});
$('importButton').addEventListener('click',()=>$('importFiles').click());$('importFiles').addEventListener('change',ev=>{readImports([...ev.target.files]);ev.target.value='';});
$('cancelImport').addEventListener('click',()=>{pendingImport=[];$('importDialog').close();});
$('confirmImport').addEventListener('click',()=>{if(!pendingImport.length)return;checkpoint();for(const item of pendingImport){const added={key:'local:'+uid(),family:item.family};disk.custom.push(added);disk.active=added.key;}settings=cleanSettings(pendingImport[0].settings);disk.settings=settings;disk.view=settings.view;const count=pendingImport.length;pendingImport=[];persist();rebuild();render();$('importDialog').close();notice(`Imported ${count} family/families. Existing families were kept.`);});
$('exportButton').addEventListener('click',()=>exportJSON(true));$('exportFamily').addEventListener('click',()=>exportJSON(false));$('printButton').addEventListener('click',()=>window.print());
$('zoomIn').addEventListener('click',()=>setZoom(zoom+.15));$('zoomOut').addEventListener('click',()=>setZoom(zoom-.15));$('fitDiagram').addEventListener('click',fit);
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('diagramPanel').requestFullscreen();setTimeout(fit,100);}catch{notice('Full screen is unavailable in this browser. Use the zoom controls instead.',true);}});
$('downloadSvg').addEventListener('click',()=>{if(diagram)download(diagram.svg,filename(current().name)+'-kinship.svg','image/svg+xml');});
document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key==='s'&&!$('personDialog').open){ev.preventDefault();if(current())exportJSON(false);}});
for(const term of [...new Set(Object.values(KINSHIP).flat())]){const option=document.createElement('option');option.value=term;$('kinshipLabels').append(option);}
render();loadPublished();
