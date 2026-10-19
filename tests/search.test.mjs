import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,NepaliNormalizer,SEARCH_DEFAULTS,createSearch,searchRanges,sortPeople,normalizeDocument,analyze} from '../model.mjs';
import {renderGenealogyTable} from '../table.mjs';
import {createDiagram} from '../diagram.mjs';
const family=()=>normalizeDocument({name:'Search family',people:[
  {id:'p',name:'शिव री वर्मा',gender:'M',birth:'२००१',notes:'Village <script>east</script>',spouses:['s']},
  {id:'s',name:'ऋता शर्मा',gender:'F',dead:true,death:'२०८०',spouses:['p']},
  {id:'c',name:'Zara',gender:'F',parents:['p','s'],label:'Daughter',notes:'East village'}
]}).tables[0];
test('provided Nepali spelling, nasal, digit and joiner mappings are enabled by default',()=>{
  assert.equal(SEARCH_DEFAULTS.normalize,true);
  for(const [source,query] of [['री','ऋ'],['रि','री'],['शिव','सिब'],['षी','सि'],['ङणञं','नननन्'],['२०८०','2080'],['क\u200Dख\u200C ग','कखग'],['शिव री वर्मा','सिबरिबर्मा']])assert.ok(NepaliNormalizer.matches(query,source),source);
});
test('normalization is optional and literal search keeps spelling and spaces',()=>{
  const f=family(),info=analyze(f);
  assert.ok(createSearch('सिबरिबर्मा').matches(f.people[0],info));
  assert.ok(!createSearch('सिबरिबर्मा',{normalize:false}).matches(f.people[0],info));
  assert.ok(!createSearch('शिवरी',{normalize:false}).matches(f.people[0],info));
  assert.ok(createSearch('zArA',{normalize:false}).matches(f.people[2],info));
  assert.equal(createSearch(' \u200D ').active,false);
});
test('normalized ranges map expansions, spaces, combining marks and overlaps to original text',()=>{
  for(const [query,text,expected] of [['रिता','ऋता शर्मा','ऋता'],['सिब','शिव री','शिव'],['सिबरि','शिव री','शिव री'],['2080','मृत्यु २०८०','२०८०']]){
    const [range]=NepaliNormalizer.search(query,text);assert.equal(text.slice(range.start,range.end),expected);
  }
  assert.deepEqual(searchRanges('ana','banana',{normalize:false}),[{start:1,end:6}]);
});
test('field, gender and living/deceased filters share consistent matching',()=>{
  const f=family(),info=analyze(f),[p,s,c]=f.people;
  assert.ok(createSearch('2001',{field:'dates'}).matches(p,info));
  assert.ok(!createSearch('2001',{field:'name'}).matches(p,info));
  assert.ok(createSearch('11',{field:'number',mode:'exact'}).matches(c,info));
  assert.ok(createSearch('',{gender:'F',status:'deceased'}).matches(s,info));
  assert.ok(!createSearch('',{gender:'F',status:'living'}).matches(s,info));
  assert.ok(createSearch('village east',{field:'comments',mode:'words'}).matches(c,info));
  assert.ok(!createSearch('village east',{field:'comments',mode:'contains'}).matches(c,info));
  assert.ok(!createSearch('Zar',{field:'name',mode:'exact'}).matches(c,info));
});
test('highlighting escapes original strings and keeps couples with matched spouses',()=>{
  const f=family(),info=analyze(f),search=createSearch('रिता',{field:'name'}),result=renderGenealogyTable(f,DEFAULTS,info,search);
  assert.equal(result.matches,1);assert.ok(result.html.includes('<mark>ऋता</mark>'));assert.ok(result.html.includes('शिव री वर्मा'));
  const comments=renderGenealogyTable(f,DEFAULTS,info,createSearch('<script>',{field:'comments'})).html;
  assert.ok(comments.includes('<mark>&lt;script&gt;</mark>'));assert.ok(!comments.includes('<script>'));
  const unfiltered=renderGenealogyTable(f,DEFAULTS,info,createSearch('रिता',{filter:false,highlight:false})).html;
  assert.ok(unfiltered.includes('Zara'));assert.ok(!unfiltered.includes('<mark>'));
});
test('diagram uses the same normalized matches, with optional highlighting and context dimming',()=>{
  const f=family(),svg=createDiagram(f,DEFAULTS,{search:createSearch('रिता'),namespace:'test'}).svg;
  assert.equal((svg.match(/class="node match"/g)||[]).length,1);assert.equal((svg.match(/class="node faded"/g)||[]).length,2);assert.ok(svg.includes('id="arrowtest"'));
  const plain=createDiagram(f,DEFAULTS,{search:createSearch('रिता',{highlight:false,filter:false})}).svg;
  assert.ok(!plain.includes('node match'));assert.ok(!plain.includes('node faded'));
});
test('related-person choices sort alphabetically without changing data or stable IDs',()=>{
  const people=[{id:'z',name:'Zara'},{id:'b',name:'Bob'},{id:'a',name:'Anna'},{id:'a2',name:'Anna'}];
  assert.deepEqual(sortPeople(people).map(p=>p.id),['a','a2','b','z']);assert.equal(people[0].id,'z');
});
