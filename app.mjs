import {DEFAULTS,RELATIONS,KINSHIP,uid,text,cleanSettings,cleanPerson,blankFamily,normalizeDocument,validateFamily,analyze,applyRelative,deletePerson,exportDocument} from './model.mjs';
import {createDiagram} from './diagram.mjs';
import {renderGenealogyTable,matchesPerson} from './table.mjs';
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
function renderTable(f,info,q){
  const table=renderGenealogyTable(f,settings,info,q);$('tablePanel').innerHTML=table.html;
  $('matchCount').textContent=q?`${table.matches} of ${f.people.length}`:'';
}
function setZoom(value){zoom=Math.min(2.5,Math.max(.15,value));const svg=$('diagramCanvas').querySelector('svg');if(svg&&diagram){svg.setAttribute('width',diagram.width*zoom);svg.setAttribute('height',diagram.height*zoom);}$('zoomValue').textContent=Math.round(zoom*100)+'%';scheduleChartScroll();}
function fit(){if(!diagram)return;const viewport=$('diagramViewport');setZoom(Math.min(1,(viewport.clientWidth-45)/diagram.width,(viewport.clientHeight-40)/diagram.height));}
let scrollFrame=null;
function scheduleChartScroll(){if(scrollFrame!==null)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=null;updateChartScroll();});}
function updateChartScroll(){
  const viewport=$('diagramViewport'),dock=$('chartScrollDock'),scroll=$('chartFloatScroll'),rect=viewport.getBoundingClientRect();
  const overflow=Math.max(0,viewport.scrollWidth-viewport.clientWidth);
  dock.hidden=$('diagramPanel').hidden||overflow<2||rect.bottom<=0||rect.top>=window.innerHeight;
  if(dock.hidden)return;
  $('chartFloatWidth').style.width=(scroll.clientWidth+overflow)+'px';
  if(Math.abs(scroll.scrollLeft-viewport.scrollLeft)>.5)scroll.scrollLeft=viewport.scrollLeft;
  $('chartLeft').disabled=viewport.scrollLeft<1;$('chartRight').disabled=viewport.scrollLeft>=overflow-1;
}
function render(){
  setStyle();rebuild();
  setOptions('familySelect',families.length?families.map(f=>[f.key,f.family.name+(f.source==='Local family'?' · local':'')]):[['','No family selected']],disk.active);
  const f=current(),view=disk.view||settings.view,q=$('search').value.trim().toLocaleLowerCase();
  $('tableView').setAttribute('aria-pressed',view==='table');$('diagramView').setAttribute('aria-pressed',view==='diagram');
  $('tablePanel').hidden=view!=='table'||!f?.people.length;$('diagramPanel').hidden=view!=='diagram'||!f?.people.length;$('downloadSvg').hidden=view!=='diagram'||!f?.people.length;
  $('emptyState').hidden=!!f?.people.length;$('familySettings').hidden=!f;$('familySettingsButton').disabled=!f;$('exportFamily').disabled=!f;$('exportButton').disabled=!f;
  $('familyTitle').textContent=f?.name||'Start your family story';$('familyDescription').textContent=f?.description||'';$('familySource').textContent=selected?.source||'FAMILY COLLECTION';$('familyName').value=f?.name||'';$('familyDesc').value=f?.description||'';
  $('resetFamily').hidden=!selected||!published.has(selected.key)||!disk.edits[selected.key];
  $('warnings').replaceChildren();
  if(f){
    const info=analyze(f,settings);$('familyStats').innerHTML=`<div><b>${f.people.length}</b><span>people</span></div><div><b>${info.generations}</b><span>generations</span></div><div><b>${families.length}</b><span>families</span></div>`;
    renderTable(f,info,q);
    let extra=[];
    if(view==='diagram'&&f.people.length){diagram=createDiagram(f,settings,{query:q});$('diagramCanvas').innerHTML=diagram.svg;extra=diagram.warnings;setZoom(zoom);$('matchCount').textContent=q?`${f.people.filter(p=>matchesPerson(p,q)).length} of ${f.people.length}`:'';}
    const warnings=[...new Set([...(f.warnings||[]),...validateFamily(structuredClone(f)),...extra])];
    if(warnings.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`Check ${warnings.length} relationship note${warnings.length===1?'':'s'}`;details.append(summary);for(const message of warnings){const p=document.createElement('p');p.textContent=message;details.append(p);}$('warnings').append(details);}
  }else{$('familyStats').textContent='';$('tablePanel').replaceChildren();$('diagramCanvas').replaceChildren();$('matchCount').textContent='';}
  $('legend').hidden=!settings.showLegend||!f?.people.length;
  $('legend').innerHTML=`<span><i class="person-dot M"></i>Male</span><span><i class="person-dot F"></i>Female</span><span><i class="person-dot U"></i>Unknown</span><span>${esc(settings.deceasedSymbol)} Deceased</span>${settings.daughterLine?'<span><b class="number daughter">123</b> Daughter’s line</span>':''}${settings.marriageBars?'<span><b class="number bar1">123</b> 2nd marriage · double bar: 3rd or later</span>':''}`;
  $('undoButton').disabled=!history.length;
  if(storageError)$('saveState').textContent='Browser storage unavailable. Export JSON to keep changes.';
  scheduleChartScroll();
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
      return {name,tables:d.tables};
    }));
    for(const result of results)if(result.status==='fulfilled'){
      const {name,tables}=result.value;
      tables.forEach((family,i)=>published.set('repo:'+name+'#'+i,{family,source:name,sourceCount:tables.length}));
    }
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
function exportJSON(){
  if(!current())return;
  const source=published.get(selected.key),name=source?.sourceCount===1?source.source.split('/').pop():selected.exportName||filename(current().name)+'.json';
  download(JSON.stringify(exportDocument([current()],settings),null,2),name,'application/json');
  notice(source?.sourceCount===1?`Exported ${name} (one family). Replace data/${source.source} with this file to publish your corrections.`:`Exported ${name} (one family). Use Add .json files to publish it.`);
}
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
    f.warnings=[];validateFamily(f);checkpoint();saveFamily(f);$('personDialog').close();notice(p.name+' saved on this browser. Export this family and replace its JSON file to publish the correction.');
  }catch(e){$('personError').textContent=e.message;}
}
function removePerson(id){
  const f=current(),p=f?.people.find(p=>p.id===id);if(!p)return;
  const count=f.people.filter(x=>x.parents.includes(id)||x.spouses.includes(id)).length;
  if(!confirm(`Delete ${p.name}? ${count} linked record(s) will be disconnected. You can undo this.`))return;
  checkpoint();const copy=structuredClone(f);deletePerson(copy,id);copy.warnings=[];saveFamily(copy);$('personDialog').close();
  notice('Entry deleted and saved on this browser. Export this family and replace its JSON file to publish the correction.');
}
async function readImports(files){
  const collected=[],errors=[];
  for(const file of files){try{if(file.size>10000000)throw Error('File exceeds 10 MB.');const d=normalizeDocument(JSON.parse(await file.text()),file.name);collected.push(...d.tables.map(f=>({family:f,filename:d.tables.length===1?file.name:filename(f.name)+'.json',settings:d.settings})));}catch(e){errors.push(file.name+': '+e.message);}}
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
$('tablePanel').addEventListener('click',ev=>{const del=ev.target.closest('[data-delete-person]');if(del){removePerson(del.dataset.deletePerson);return;}const b=ev.target.closest('[data-person]');if(b)openPerson(b.dataset.person);});
$('diagramCanvas').addEventListener('click',ev=>{const b=ev.target.closest('[data-person]');if(b)openPerson(b.dataset.person);});
$('diagramCanvas').addEventListener('keydown',ev=>{if(['Enter',' '].includes(ev.key)){const b=ev.target.closest('[data-person]');if(b){ev.preventDefault();openPerson(b.dataset.person);}}});
$('personForm').addEventListener('submit',savePerson);$('personRelation').addEventListener('change',updateRelation);$('personTarget').addEventListener('change',updateRelation);
for(const id of ['closePerson','cancelPerson'])$(id).addEventListener('click',()=>$('personDialog').close());
$('deletePerson').addEventListener('click',()=>removePerson(editing));
$('importButton').addEventListener('click',()=>$('importFiles').click());$('importFiles').addEventListener('change',ev=>{readImports([...ev.target.files]);ev.target.value='';});
$('cancelImport').addEventListener('click',()=>{pendingImport=[];$('importDialog').close();});
$('confirmImport').addEventListener('click',()=>{if(!pendingImport.length)return;checkpoint();for(const item of pendingImport){const added={key:'local:'+uid(),family:item.family,exportName:item.filename};disk.custom.push(added);disk.active=added.key;}settings=cleanSettings(pendingImport[0].settings);disk.settings=settings;disk.view=settings.view;const count=pendingImport.length;pendingImport=[];persist();rebuild();render();$('importDialog').close();notice(`Imported ${count} family/families. Existing families were kept.`);});
$('exportButton').addEventListener('click',exportJSON);$('exportFamily').addEventListener('click',exportJSON);$('printButton').addEventListener('click',()=>window.print());
$('zoomIn').addEventListener('click',()=>setZoom(zoom+.15));$('zoomOut').addEventListener('click',()=>setZoom(zoom-.15));$('fitDiagram').addEventListener('click',fit);
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('diagramPanel').requestFullscreen();setTimeout(fit,100);}catch{notice('Full screen is unavailable in this browser. Use the zoom controls instead.',true);}});
$('downloadSvg').addEventListener('click',()=>{if(diagram)download(diagram.svg,filename(current().name)+'-kinship.svg','image/svg+xml');});
document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key==='s'&&!$('personDialog').open){ev.preventDefault();if(current())exportJSON();}});
$('goTop').addEventListener('click',ev=>{ev.preventDefault();window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
$('goBottom').addEventListener('click',ev=>{ev.preventDefault();window.scrollTo({top:document.documentElement.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
$('diagramViewport').addEventListener('scroll',scheduleChartScroll,{passive:true});
$('chartFloatScroll').addEventListener('scroll',()=>{const main=$('diagramViewport'),floating=$('chartFloatScroll');if(Math.abs(main.scrollLeft-floating.scrollLeft)>.5)main.scrollLeft=floating.scrollLeft;scheduleChartScroll();},{passive:true});
$('chartLeft').addEventListener('click',()=>$('diagramViewport').scrollBy({left:-Math.max(150,$('diagramViewport').clientWidth*.6),behavior:'smooth'}));
$('chartRight').addEventListener('click',()=>$('diagramViewport').scrollBy({left:Math.max(150,$('diagramViewport').clientWidth*.6),behavior:'smooth'}));
window.addEventListener('scroll',scheduleChartScroll,{passive:true});window.addEventListener('resize',scheduleChartScroll);
document.addEventListener('fullscreenchange',scheduleChartScroll);
if('ResizeObserver' in window){const observer=new ResizeObserver(scheduleChartScroll);observer.observe($('diagramViewport'));observer.observe($('diagramCanvas'));}
for(const term of [...new Set(Object.values(KINSHIP).flat())]){const option=document.createElement('option');option.value=term;$('kinshipLabels').append(option);}
render();loadPublished();
