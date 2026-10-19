import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULTS,normalizeDocument,analyze} from '../model.mjs';
import {createDiagram} from '../diagram.mjs';
import {orderTablePeople,renderGenealogyTable} from '../table.mjs';
const sample=()=>normalizeDocument(JSON.parse(fs.readFileSync(new URL('../data/smith-family.json',import.meta.url)))).tables[0];
const family=people=>normalizeDocument({name:'Layout test',people}).tables[0];
const edgeAttributes=svg=>[...svg.matchAll(/<path class="parent-edge"[^>]*>/g)].map(([tag])=>Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([,key,value])=>[key,value])));
test('parent styles remain distinct while every child has one mother-colored arrow',()=>{
  const f=sample(),d=createDiagram(f,DEFAULTS),edges=edgeAttributes(d.svg);
  assert.equal(edges.length,f.people.filter(p=>p.parents.length).length);
  assert.equal(new Set(d.parentStyles.map(s=>s.color)).size,d.parentStyles.length);
  assert.equal(new Set(d.parentStyles.map(s=>s.weight)).size,d.parentStyles.length);
  for(const child of f.people.filter(p=>p.parents.length)){
    const paths=edges.filter(e=>e['data-child']===child.id);assert.equal(paths.length,1);
    const mothers=child.parents.filter(id=>f.people.find(p=>p.id===id).gender==='F'),source=mothers.length===1?mothers[0]:child.parents[0],style=d.parentStyles.find(s=>s.id===source);
    assert.equal(paths[0]['data-parent'],source);assert.equal(paths[0].stroke,style.color);assert.equal(Number(paths[0]['stroke-width']),style.weight);assert.equal(paths[0]['marker-end'],`url(#${style.marker})`);
  }
  for(const style of d.parentStyles)assert.equal(style.children,f.people.filter(p=>p.parents.includes(style.id)).length);
  assert.equal((d.svg.match(/class="parent-swatch"/g)||[]).length,d.parentStyles.length);
});
test('couples merge beside their cards and siblings share one trunk in either orientation',()=>{
  const f=sample();for(const direction of ['down','right']){
    const d=createDiagram(f,{...DEFAULTS,direction}),edges=edgeAttributes(d.svg),joins=[...d.svg.matchAll(/<path class="parent-join"[^>]*>/g)];
    assert.equal(joins.length,d.connections.filter(c=>c.parents.length===2).length*2);
    assert.equal((d.svg.match(/class="family-branch"/g)||[]).length,d.connections.length);
    for(const connection of d.connections.filter(c=>c.parents.length===2)){
      const positions=connection.parents.map(id=>d.positions.get(id));
      const near=direction==='down'?connection.junction.y-Math.max(...positions.map(p=>p.y+130)):connection.junction.x-Math.max(...positions.map(p=>p.x+202));assert.equal(near,10);
      const children=edges.filter(e=>connection.children.includes(e['data-child']));assert.equal(children.length,connection.children.length);assert.equal(new Set(children.map(e=>e['data-track'])).size,1);
    }
  }
});
test('half-siblings use their own biological mother color and never share a couple junction',()=>{
  const f=sample(),d=createDiagram(f,DEFAULTS),edges=edgeAttributes(d.svg),id=name=>f.people.find(p=>p.name===name).id;
  const william=edges.find(e=>e['data-child']===id('William Smith')),george=edges.find(e=>e['data-child']===id('George Smith'));
  assert.equal(william['data-parent'],id('Mary Brown'));assert.equal(george['data-parent'],id('Anna White'));assert.notEqual(william.stroke,george.stroke);assert.notEqual(william['data-union'],george['data-union']);
  const emmaChild=edges.find(e=>e['data-child']===id('Hari Thapa'));assert.equal(emmaChild['data-parent'],id('Emma Smith'));
});
test('single or unidentified parents keep one arrow without assuming a spouse is the mother',()=>{
  const f=family([{id:'p',name:'Parent',gender:'M',spouses:['a','b']},{id:'a',name:'Partner A',gender:'F',spouses:['p']},{id:'b',name:'Partner B',gender:'F',spouses:['p']},{id:'c',name:'Child',parents:['p']},{id:'u',name:'Unknown parent',gender:'U'},{id:'d',name:'Other child',parents:['p','u']}]);
  const d=createDiagram(f,DEFAULTS),edges=edgeAttributes(d.svg);assert.equal(edges.length,2);assert.ok(edges.every(e=>e['data-parent']==='p'));assert.equal(d.connections.find(c=>c.children.includes('c')).parents.length,1);
});
test('two wives flank their husband, retain marriage order, and every person appears once',()=>{
  const f=sample(),byName=name=>f.people.find(p=>p.name===name);
  for(const direction of ['down','right']){const d=createDiagram(f,{...DEFAULTS,direction}),at=name=>d.positions.get(byName(name).id),axis=direction==='down'?'x':'y';assert.ok(at('Mary Brown')[axis]<at('John Smith')[axis]);assert.ok(at('John Smith')[axis]<at('Anna White')[axis]);assert.equal((d.svg.match(/data-person=/g)||[]).length,f.people.length);assert.ok(!/NaN|undefined/.test(d.svg));}
});
test('connector weights and namespaces survive customized line styles and standalone SVG export',()=>{
  const f=sample();for(const lineStyle of ['solid','dashed','dotted']){const d=createDiagram(f,{...DEFAULTS,lineStyle},{namespace:'family0'});assert.ok(d.parentStyles.every(s=>s.marker.startsWith('arrowfamily0')));assert.ok(edgeAttributes(d.svg).every(e=>e['stroke-dasharray']===(lineStyle==='solid'?'':lineStyle==='dashed'?'7 4':'2 4')));assert.ok(d.svg.includes('fill="'+d.parentStyles[0].color+'"'));}
});
test('siblings stay with the same parents, elder first, without renumbering or changing saved records',()=>{
  const f=family([{id:'p',name:'Parent',spouses:['a','b']},{id:'a',name:'First spouse',spouses:['p']},{id:'b',name:'Second spouse',spouses:['p']},{id:'young',name:'Younger',parents:['p','a'],order:2},{id:'other',name:'Other marriage',parents:['p','b'],order:3},{id:'old',name:'Elder',parents:['p','a'],order:1},{id:'g',name:'Grandchild',parents:['old']}]),before=JSON.stringify(f),info=analyze(f),number=new Map([...info.meta].map(([id,m])=>[id,m.number]));
  assert.deepEqual(orderTablePeople(f,info).filter(p=>p.parents[0]==='p').map(p=>p.id),['old','young','other']);
  assert.equal(JSON.stringify(f),before);assert.deepEqual(new Map([...analyze(f).meta].map(([id,m])=>[id,m.number])),number);
});
test('missing sibling order falls back to comparable Nepali or Gregorian dates including compact dates',()=>{
  const f=family([{id:'p',name:'Parent'},{id:'c',name:'Youngest',parents:['p'],birth:'२०५०/०१/०१'},{id:'a',name:'Eldest',parents:['p'],birth:'२०४००२०३'},{id:'b',name:'Middle',parents:['p'],birth:'२०४५-०३-०१'}]);
  assert.deepEqual(orderTablePeople(f).filter(p=>p.parents.length).map(p=>p.id),['a','b','c']);
  const unknown=family([{id:'p',name:'Parent'},{id:'a',name:'First',parents:['p'],birth:'2050 BS'},{id:'b',name:'Second',parents:['p'],birth:'1990 AD'}]);
  assert.deepEqual(orderTablePeople(unknown).filter(p=>p.parents.length).map(p=>p.id),['a','b']);
});
test('table generation bullets increase with depth and spouses retain their generation when shown separately',()=>{
  const f=sample(),info=analyze(f),html=renderGenealogyTable(f,DEFAULTS,info).html;
  for(const [name,generation] of [['John Smith',1],['William Smith',2],['Peter Smith',3]]){const id=f.people.find(p=>p.name===name).id;assert.ok(html.includes(`data-row-person="${id}" data-generation="${generation}"`));assert.ok(html.includes(`aria-label="Generation ${generation}"`));}
  const sara=f.people.find(p=>p.name==='Sara Lee'),separate=renderGenealogyTable(f,{...DEFAULTS,showSpouses:false},info).html;assert.ok(separate.includes(`data-row-person="${sara.id}" data-generation="2"`));assert.equal((html.match(/<th scope="col">/g)||[]).length,4);
});
test('complex spouse groups and single parents never lose people or produce invalid coordinates',()=>{
  const f=family([{id:'a',name:'Hub',spouses:['b','c','d']},{id:'b',name:'Partner B',spouses:['a','e']},{id:'c',name:'Partner C',spouses:['a']},{id:'d',name:'Partner D',spouses:['a']},{id:'e',name:'Partner E',spouses:['b']},{id:'child',name:'Child',parents:['b']},{id:'single',name:'Single parent'},{id:'s',name:'Single child',parents:['single']}]);
  const d=createDiagram(f,DEFAULTS);assert.equal(d.positions.size,f.people.length);assert.ok([...d.positions.values()].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.equal(new Set([...d.positions.values()].map(p=>p.x+','+p.y)).size,f.people.length);assert.equal((d.svg.match(/data-person=/g)||[]).length,f.people.length);
});
