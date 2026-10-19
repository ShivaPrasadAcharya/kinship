import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULTS,cleanSettings,normalizeDocument,cleanPerson,validateFamily,analyze,applyRelative,deletePerson,exportDocument,henryDigit} from '../model.mjs';
import {createDiagram} from '../diagram.mjs';
const sample=()=>normalizeDocument(JSON.parse(fs.readFileSync(new URL('../data/smith-family.json',import.meta.url)))).tables[0];
const person=(id,name,extra={})=>cleanPerson({id,name,...extra});
const family=(people)=>({id:'test',name:'Test family',description:'',people,warnings:[]});
test('original JSON preserves people, two marriages and Henry numbering',()=>{
  const f=sample(),a=analyze(f),byName=n=>f.people.find(p=>p.name===n),number=n=>a.meta.get(byName(n).id).number;
  assert.equal(f.people.length,12);assert.equal(number('John Smith'),'1');assert.equal(number('Peter Smith'),'111');assert.equal(number('Emma Smith'),'12');assert.equal(number('Hari Thapa'),'121');assert.equal(number('George Smith'),'13');assert.equal(a.meta.get(byName('George Smith').id).marriage,1);assert.equal(number('Anna White'),'');
  assert.equal(a.meta.get(byName('Hari Thapa').id).viaDaughter,true);assert.equal(byName('Hari Thapa').parents.length,2);assert.equal(byName('Hari Thapa').parents[0],byName('Emma Smith').id);
});
test('single mother can be root and parent without a husband',()=>{const f=family([person('m','Mother',{gender:'F'}),person('c','Child',{parents:['m']})]);validateFamily(f);const a=analyze(f);assert.equal(a.meta.get('c').number,'11');assert.equal(a.meta.get('c').viaDaughter,true);});
test('renaming a person leaves relationships attached by ID',()=>{const f=sample(),p=f.people[0],id=p.id;p.name='नयाँ नाम';validateFamily(f);assert.ok(f.people.some(x=>x.parents.includes(id)));assert.ok(createDiagram(f,DEFAULTS).svg.includes('नयाँ नाम'));});
test('duplicate names are distinct records',()=>{const f=family([person('a','Same'),person('b','Same',{parents:['a']})]);assert.doesNotThrow(()=>validateFamily(f));assert.equal(analyze(f).meta.get('b').number,'11');});
test('all people including spouses appear once in table and diagram',()=>{const f=sample(),a=analyze(f),d=createDiagram(f,DEFAULTS);assert.equal(new Set(a.ordered.map(p=>p.id)).size,f.people.length);assert.equal((d.svg.match(/data-person=/g)||[]).length,f.people.length);assert.ok(d.svg.includes('spouse-edge'));assert.ok(d.svg.includes('parent-edge'));});
test('recorded parents and spouses remain connected in either direction',()=>{const f=sample();for(const direction of ['down','right']){const d=createDiagram(f,{...DEFAULTS,direction});assert.ok(Number.isFinite(d.width)&&d.width>0);assert.ok(Number.isFinite(d.height)&&d.height>0);assert.ok(!/NaN|undefined/.test(d.svg));assert.equal((d.svg.match(/class="parent-edge"/g)||[]).length,f.people.filter(p=>p.parents.length).length);for(const p of f.people.filter(p=>p.parents.length))assert.ok(d.connections.some(c=>c.children.includes(p.id)&&JSON.stringify([...c.parents].sort())===JSON.stringify([...p.parents].sort())));}});
test('different couples and marriages use separate connector tracks',()=>{
  const f=sample(),id=name=>f.people.find(p=>p.name===name).id;
  for(const direction of ['down','right']){
    const svg=createDiagram(f,{...DEFAULTS,direction}).svg,track=name=>svg.match(new RegExp(`data-child="${id(name)}" data-track="([^"]+)"`))[1];
    assert.equal(track('Peter Smith'),track('Linda Smith'));
    assert.notEqual(track('Peter Smith'),track('Hari Thapa'));
    assert.notEqual(track('William Smith'),track('George Smith'));
  }
});
test('cyclic ancestry, self relations and missing IDs are rejected',()=>{
  assert.throws(()=>validateFamily(family([person('a','A',{parents:['b']}),person('b','B',{parents:['a']})])),/Circular/);
  assert.throws(()=>validateFamily(family([person('a','A',{spouses:['a']})])),/own/);
  assert.throws(()=>validateFamily(family([person('a','A',{parents:['x']})])),/missing/);
});
test('deletion removes every dangling reference',()=>{const f=sample(),id=f.people[0].id;deletePerson(f,id);assert.doesNotThrow(()=>validateFamily(f));assert.ok(f.people.every(p=>!p.parents.includes(id)&&!p.spouses.includes(id)));});
test('relative shortcuts add children, mothers, siblings and partners',()=>{
  const f=family([person('a','A'),person('b','B'),person('c','C'),person('d','D')]);
  applyRelative(f,f.people[1],{relation:'son',target:'a'});applyRelative(f,f.people[2],{relation:'sister',target:'b'});applyRelative(f,f.people[3],{relation:'mother',target:'b'});
  assert.deepEqual(f.people[1].parents,['a','d']);assert.deepEqual(f.people[2].parents,['a']);assert.equal(f.people[1].gender,'M');assert.equal(f.people[2].gender,'F');assert.equal(f.people[3].gender,'F');validateFamily(f);
  assert.throws(()=>applyRelative(f,f.people[0],{relation:'son',target:'a'}),/other than/);
});
test('sibling shortcut refuses unplaceable siblings',()=>{const f=family([person('a','A'),person('b','B')]);assert.throws(()=>applyRelative(f,f.people[1],{relation:'brother',target:'a'}),/parent/);});
test('import and export round-trip settings, names, dates, notes and links',()=>{const f=sample();f.people[0].notes='नेपाली टिप्पणी <script>';f.people[0].birth='२०००';const d=normalizeDocument(exportDocument([f],{...DEFAULTS,title:'हाम्रो वंशावली',nameLabel:'नाम',showNotes:true}));assert.equal(d.settings.title,'हाम्रो वंशावली');assert.equal(d.settings.showNotes,true);assert.deepEqual(d.tables[0].people,f.people);});
test('arbitrary JSON strings are escaped in diagram text and attributes',()=>{const f=family([person('p"<>','<script>alert(1)</script>',{notes:'<img src=x onerror=1>'})]);const d=createDiagram(f,{...DEFAULTS,showNotes:true});assert.ok(!d.svg.includes('<script>'));assert.ok(!d.svg.includes('<img'));assert.ok(d.svg.includes('&lt;script&gt;'));});
test('empty family, long labels and remarriages create finite diagrams',()=>{for(const people of [[],[person('a','A'.repeat(250),{label:'B'.repeat(250),notes:'C'.repeat(5000)})],[person('a','A',{spouses:['b','c']}),person('b','B',{spouses:['a']}),person('c','C',{spouses:['a']})]]){const d=createDiagram(family(people),{...DEFAULTS,showNotes:true});assert.ok(!/NaN|undefined/.test(d.svg));}});
test('ordering and large Henry child digits remain unique',()=>{const f=family([person('a','A'),person('b','B',{parents:['a'],order:10}),person('c','C',{parents:['a'],order:11}),person('d','D',{parents:['a'],order:10})]);assert.equal(validateFamily(f).length,1);const a=analyze(f);assert.equal(new Set([...a.meta.values()].map(m=>m.number)).size,4);assert.equal(henryDigit(10),'X');assert.equal(henryDigit(11),'A');assert.equal(henryDigit(36),'Z');assert.equal(henryDigit(37),'[37]');});
test('legacy added-root grandparent and custom label are retained',()=>{const d=normalizeDocument({tables:[{name:'Older root',entries:[{name:'Child',rel:'ancestor',gender:'M'},{name:'Grandma',rel:'ancestor',gender:'F',shift:{former:'Child'},rr:{key:'hn',role:1}}]}]});const f=d.tables[0],a=analyze(f),grandma=f.people.find(p=>p.name==='Grandma'),child=f.people.find(p=>p.name==='Child');assert.equal(a.meta.get(grandma.id).number,'1');assert.equal(a.meta.get(child.id).number,'111');assert.equal(grandma.label,'हजुरबा');});
test('invalid document shapes and duplicate IDs are rejected',()=>{for(const d of [{tables:[]},{tables:[{name:'Bad'}]},{tables:[{name:'Bad',entries:[{}]}]},{tables:[{name:'Bad',people:[{id:'a',name:'A'},{id:'a',name:'B'}]}]}])assert.throws(()=>normalizeDocument(d));});
test('settings accept custom labels and reject unsafe style values',()=>{const s=cleanSettings({font:'url(x)',male:'red;display:none',fontSize:999,numberLabel:'वंश नं.',title:'<script>'});assert.equal(s.font,'system');assert.equal(s.male,DEFAULTS.male);assert.equal(s.fontSize,22);assert.equal(s.numberLabel,'वंश नं.');});
