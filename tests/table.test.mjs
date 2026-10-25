import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULTS,analyze,cleanSettings,normalizeDocument,exportDocument,deletePerson,validateFamily} from '../model.mjs';
import {groupTablePeople,renderGenealogyTable} from '../table.mjs';
const sample=()=>normalizeDocument(JSON.parse(fs.readFileSync(new URL('./fixtures/smith-family.json',import.meta.url)))).tables[0];
test('spouses appear immediately under their partner and keep marriage order',()=>{
  const f=sample(),groups=groupTablePeople(f),john=groups.find(g=>g.person.name==='John Smith'),emma=groups.find(g=>g.person.name==='Emma Smith');
  assert.deepEqual(john.spouses.map(s=>[s.person.name,s.marriage]),[['Mary Brown',1],['Anna White',2]]);
  assert.deepEqual(emma.spouses.map(s=>s.person.name),['Ram Thapa']);
  assert.ok(!groups.some(g=>['Mary Brown','Anna White','Ram Thapa','Sara Lee'].includes(g.person.name)));
  assert.equal(new Set(groups.flatMap(g=>[g.person.id,...g.spouses.map(s=>s.person.id)])).size,f.people.length);
});
test('four table columns are retained with all display preferences',()=>{
  const f=sample();
  for(const settings of [DEFAULTS,{...DEFAULTS,showNumbers:false,showDates:false,showParents:false,showRelations:false,showSpouses:false}]){
    const {html}=renderGenealogyTable(f,settings);assert.equal((html.match(/<th scope="col">/g)||[]).length,4);
    const headings=[...html.matchAll(/<th scope="col">(.*?)<\/th>/g)].map(x=>x[1]);assert.deepEqual(headings,['Name','Henry No.','Dates','Comments']);
    assert.ok(!/<th[^>]*>(Parents|Spouse\(s\)|Relation to root)<\/th>/.test(html));
  }
});
test('saved spouses have their own visible edit and delete controls',()=>{
  const f=sample(),mary=f.people.find(p=>p.name==='Mary Brown'),{html}=renderGenealogyTable(f,DEFAULTS);
  assert.ok(html.includes(`data-spouse="${mary.id}"`));assert.ok(html.includes(`data-delete-person="${mary.id}"`));
  assert.ok(html.includes('aria-label="Edit Mary Brown"'));assert.ok(html.includes('aria-label="Delete Mary Brown"'));
  assert.ok(html.indexOf('m.1')<html.indexOf('m.2'));
});
test('searching a spouse keeps the couple together and reports people matched',()=>{
  const f=sample(),result=renderGenealogyTable(f,DEFAULTS,analyze(f),'anna white');
  assert.equal(result.matches,1);assert.equal((result.html.match(/<tr data-row-person=/g)||[]).length,1);assert.ok(result.html.includes('John Smith'));assert.ok(result.html.includes('Anna White'));
});
test('comments are visible, escaped, and retained independently of diagram preferences',()=>{
  const f=sample();f.people[0].notes='Family comment <script>alert(1)</script>\nSecond line';
  const {html}=renderGenealogyTable(f,{...DEFAULTS,showNotes:false});assert.ok(html.includes('Family comment &lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Second line'));
});
test('each export contains exactly one editable family',()=>{
  const f=sample(),document=exportDocument([f],DEFAULTS);assert.equal(document.tables.length,1);assert.equal(normalizeDocument(document).tables[0].people.length,12);
  assert.throws(()=>exportDocument([f,structuredClone(f)],DEFAULTS),/exactly one family/);assert.throws(()=>exportDocument([],DEFAULTS),/exactly one family/);
});
test('wrong saved entries can be renamed or removed and remain corrected after JSON reload',()=>{
  const f=sample(),john=f.people[0],mary=f.people.find(p=>p.name==='Mary Brown');john.name='Corrected name';john.notes='Corrected comment';deletePerson(f,mary.id);validateFamily(f);
  const restored=normalizeDocument(JSON.parse(JSON.stringify(exportDocument([f],DEFAULTS)))).tables[0];
  assert.equal(restored.people.find(p=>p.id===john.id).name,'Corrected name');assert.ok(!restored.people.some(p=>p.id===mary.id));assert.ok(restored.people.every(p=>!p.parents.includes(mary.id)&&!p.spouses.includes(mary.id)));
  const {html}=renderGenealogyTable(restored,DEFAULTS);assert.ok(html.includes('Corrected comment'));assert.ok(!html.includes('Mary Brown'));
});
test('single-family JSON files and legacy comments load without a collection wrapper',()=>{
  const modern=normalizeDocument({name:'Single family',settings:null,people:[{id:'p',name:'Person',comments:'Comment from JSON'}]});assert.equal(modern.tables.length,1);assert.equal(modern.tables[0].people[0].notes,'Comment from JSON');
  const legacy=normalizeDocument({name:'Legacy family',entries:[{name:'Root',rel:'ancestor',gender:'M',birth:'२०००',comments:'Older comment'}]});assert.equal(legacy.tables[0].people[0].birth,'२०००');assert.equal(legacy.tables[0].people[0].notes,'Older comment');
  assert.equal(cleanSettings({notesLabel:'Notes',numberLabel:'Henry no.'}).notesLabel,'Comments');
});
