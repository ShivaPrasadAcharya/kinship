import {analyze,createSearch} from './model.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function wrap(s,size=22,maxLines=3) {
  const lines=[];let line='';
  for(const word of String(s).split(/\s+/)) {
    if([...line,...word].length>size&&line){lines.push(line);line='';}
    if([...word].length>size){if(line){lines.push(line);line='';}const chars=[...word];while(chars.length>size)lines.push(chars.splice(0,size).join(''));line=chars.join('');}
    else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);if(lines.length>maxLines){lines.length=maxLines;lines[maxLines-1]=[...lines[maxLines-1]].slice(0,size-1).join('')+'…';}return lines;
}
function arrangePartners(people,info){
  if(people.length<3)return people;
  const hub=[...people].sort((a,b)=>b.spouses.length-a.spouses.length||Number(!!info.meta.get(b.id)?.number)-Number(!!info.meta.get(a.id)?.number)||Number(b.gender==='M')-Number(a.gender==='M'))[0];
  const by=new Map(people.map(p=>[p.id,p])),partners=hub.spouses.map(id=>by.get(id)).filter(Boolean);
  if(partners.length<2)return people;
  const left=[],right=[];partners.forEach((person,i)=>i%2?right.push(person):left.unshift(person));
  const arranged=[...left,hub,...right],seen=new Set(arranged.map(p=>p.id));return [...arranged,...people.filter(p=>!seen.has(p.id))];
}
const connectorPalette=['#477e9d','#b17b45','#718b58','#9975a8','#b36f82','#498d87','#6876a6','#a38b42','#7d8d92','#9e6e55','#6f947d','#8e7b9f'];
export function createDiagram(f,s,{query='',search=createSearch(query),namespace=''}={}) {
  const arrow='arrow'+String(namespace).replace(/[^a-zA-Z0-9_-]/g,''),info=analyze(f,s), by=info.by, members=new Map(), groupOf=new Map(), groups=[];
  // Connected spouse groups keep remarriages on the same generation.
  for(const p of f.people) {
    if(groupOf.has(p.id))continue;
    const g={id:groups.length,people:[],parents:new Set(),rank:0};groups.push(g);
    const todo=[p];while(todo.length){const n=todo.shift();if(groupOf.has(n.id))continue;groupOf.set(n.id,g.id);g.people.push(n);n.spouses.forEach(id=>{if(by.has(id)&&!groupOf.has(id))todo.push(by.get(id));});}
    members.set(g.id,g);
  }
  for(const group of groups)group.people=arrangePartners(group.people,info);
  const warnings=[];
  for(const g of groups)for(const p of g.people)for(const id of p.parents) {
    const parentGroup=groupOf.get(id);if(parentGroup===g.id)warnings.push('Some partners also share a parent chain; inspect their relationships.');else g.parents.add(parentGroup);
  }
  const done=new Set(),active=new Set();
  function rank(g){if(done.has(g.id))return g.rank;if(active.has(g.id)){warnings.push('Cross-generation marriages cannot all share a row; some connectors run upwards.');return 0;}active.add(g.id);g.rank=Math.max(0,...[...g.parents].map(id=>rank(members.get(id))+1));active.delete(g.id);done.add(g.id);return g.rank;}
  groups.forEach(rank);
  const layers=new Map();for(const g of groups){if(!layers.has(g.rank))layers.set(g.rank,[]);layers.get(g.rank).push(g);}
  const branchLayers=new Map(),branchKey=(p,id)=>JSON.stringify([[...p.parents].sort(),id]);
  for(const p of f.people)for(const id of p.parents){const level=members.get(groupOf.get(p.id)).rank;if(!branchLayers.has(level))branchLayers.set(level,[]);const keys=branchLayers.get(level),key=branchKey(p,id);if(!keys.includes(key))keys.push(key);}
  const parentIds=new Set(f.people.flatMap(p=>p.parents)),parentStyles=f.people.filter(p=>parentIds.has(p.id)).map((p,i)=>({id:p.id,name:p.name,color:connectorPalette[i]||`hsl(${(i*137.508%360).toFixed(2)} 32% 44%)`,weight:Number((1.6+i*2/Math.max(1,parentIds.size-1)).toFixed(3)),marker:i?arrow+'-'+i:arrow,children:f.people.filter(c=>c.parents.includes(p.id)).length})),styleBy=new Map(parentStyles.map(style=>[style.id,style]));
  const routes=Math.max(1,...[...branchLayers.values()].map(keys=>keys.length));
  const cardW=202,cardH=s.showNotes?150:130,gap=28,groupGap=56,layerGap=Math.max(110,Math.min(280,routes*7+24)),pad=35,positions=new Map(),orderIndex=new Map(info.ordered.map((p,i)=>[p.id,i]));
  for(const list of layers.values())list.sort((a,b)=>Math.min(...a.people.map(p=>orderIndex.get(p.id)))-Math.min(...b.people.map(p=>orderIndex.get(p.id))));
  const layerWidth=list=>list.reduce((n,g)=>n+g.people.length*(cardW+gap)-gap+groupGap,0)-groupGap;
  const maxW=Math.max(cardW,...[...layers.values()].map(layerWidth));
  for(const [level,list] of [...layers].sort((a,b)=>a[0]-b[0])) {
    // Order related groups by the horizontal center of their parents.
    const center=g=>{const xs=[...g.parents].flatMap(id=>members.get(id).people.map(p=>positions.get(p.id)?.x).filter(x=>x!==undefined));return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:Infinity;};
    if(level>0)list.sort((a,b)=>center(a)-center(b));
    let x=pad+(maxW-layerWidth(list))/2;
    for(const g of list){for(const p of g.people){positions.set(p.id,{x,y:pad+level*(cardH+layerGap)});x+=cardW+gap;}x+=groupGap-gap;}
  }
  const maxRank=Math.max(0,...groups.map(g=>g.rank)),right=s.direction==='right';
  let width=maxW+pad*2,height=(maxRank+1)*cardH+maxRank*layerGap+pad*2;
  if(right){for(const pos of positions.values()){const x=pos.x,y=pos.y;pos.x=pad+(y-pad)/(cardH+layerGap)*(cardW+layerGap);pos.y=pad+(x-pad)/(cardW+gap)*(cardH+gap);}width=(maxRank+1)*cardW+maxRank*layerGap+pad*2;height=Math.max(cardH+pad*2,...[...positions.values()].map(p=>p.y+cardH+pad));}
  const font=s.font==='serif'?'Georgia, serif':s.font==='nepali'?'Noto Sans Devanagari, Nirmala UI, sans-serif':'system-ui, Segoe UI, sans-serif';
  const edgeDash=s.lineStyle==='dashed'?'7 4':s.lineStyle==='dotted'?'2 4':'';
  // Each parent has a consistent style. Each couple and parent receives a
  // separate track and child port so different lines never share a final stem.
  const markers=parentStyles.map(style=>`<marker id="${style.marker}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L8 4L0 8" fill="${style.color}"/></marker>`).join('');
  let edges='',nodes='';const spousePairs=new Set();
  for(const p of f.people){
    const pos=positions.get(p.id);
    for(const [index,id] of p.parents.entries()){
      const par=positions.get(id),style=styleBy.get(id);if(!par||!style)continue;
      const keys=branchLayers.get(members.get(groupOf.get(p.id)).rank),fraction=(keys.indexOf(branchKey(p,id))+1)/(keys.length+1);
      const start=Math.max(...p.parents.map(id=>{const parent=positions.get(id);return right?parent.x+cardW:parent.y+cardH;}));
      const track=start+((right?pos.x:pos.y)-start)*fraction;
      const port=right?pos.y+cardH*(p.parents.length===1?.5:.4+index*.2):pos.x+cardW*(p.parents.length===1?.5:.4+index*.2);
      const d=right?`M${par.x+cardW},${par.y+cardH/2} H${track} V${port} H${pos.x}`:`M${par.x+cardW/2},${par.y+cardH} V${track} H${port} V${pos.y}`;
      edges+=`<path class="parent-edge" data-child="${esc(p.id)}" data-track="${track}" data-parent="${esc(id)}" d="${d}" stroke="${style.color}" fill="none" stroke-width="${style.weight}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${edgeDash}" marker-end="url(#${style.marker})"><title>${esc(style.name)} → ${esc(p.name)}</title></path>`;
    }
    for(const id of p.spouses){const other=positions.get(id),pair=[p.id,id].sort().join('|');if(!other||spousePairs.has(pair))continue;spousePairs.add(pair);
      const start=right?{x:pos.x+cardW/2,y:Math.min(pos.y,other.y)+cardH}:{x:Math.min(pos.x,other.x)+cardW,y:pos.y+cardH/2};
      const end=right?{x:other.x+cardW/2,y:Math.max(pos.y,other.y)}:{x:Math.max(pos.x,other.x),y:other.y+cardH/2};
      // Route remarriage links outside intervening cards.
      const far=right?Math.abs(pos.y-other.y)>cardH+gap+1:Math.abs(pos.x-other.x)>cardW+gap+1;
      const d=far?(right?`M${start.x},${start.y} h${cardW/2+14} V${end.y} H${end.x}`:`M${start.x},${start.y} v${cardH/2+18} H${end.x} V${end.y}`):`M${start.x},${start.y} L${end.x},${end.y}`;
      edges+=`<path class="spouse-edge" d="${d}" fill="none" stroke="#a8bba6" stroke-width="1.4" stroke-dasharray="5 4"/>`;
    }
    const m=info.meta.get(p.id),color=s[p.gender==='M'?'male':p.gender==='F'?'female':'unknown'],match=search.matches(p,info),nameLines=wrap(p.name),dead=p.dead?` ${s.deceasedSymbol}`:'';
    let y=49;
    let content=`<text x="15" y="25" class="num" fill="${color}" font-size="10">${s.showNumbers?esc(m.number):''}${esc(dead)}</text>`;
    for(const line of nameLines){content+=`<text class="name" x="15" y="${y}" fill="#334d36" font-size="14" font-weight="550">${esc(line)}</text>`;y+=17;}
    if(s.showRelations&&p.label){content+=`<text class="detail" x="15" y="${y+4}" fill="#819074" font-size="10">${esc(wrap(p.label,30,1)[0])}</text>`;y+=17;}
    if(s.showDates&&(p.birth||p.death)){content+=`<text class="detail" x="15" y="${y+3}" fill="#819074" font-size="10">${esc(wrap([p.birth,p.death].filter(Boolean).join(' – '),30,1)[0])}</text>`;y+=15;}
    const connector=styleBy.get(p.id);if(connector)content+=`<path class="parent-swatch" d="M${cardW-80} 23h34" fill="none" stroke="${connector.color}" stroke-width="${connector.weight}" stroke-linecap="round"><title>${esc(p.name)} · connector style for ${connector.children} child${connector.children===1?'':'ren'}</title></path>`;
    if(s.showGender)content+=`<text x="${cardW-15}" y="25" text-anchor="end" fill="${color}" font-size="9">${esc(p.gender)}</text>`;
    if(s.showNotes&&p.notes)content+=`<text class="detail" x="15" y="${cardH-13}" fill="#819074" font-size="10">${esc(wrap(p.notes,30,1)[0])}</text>`;
    if(s.daughterLine&&m.viaDaughter)content+=`<path d="M15 30h${Math.max(12,m.number.length*6)}" stroke="#599b67" stroke-width="2"/>`;
    if(s.marriageBars&&m.marriage){content+=`<path d="M15 12h${Math.max(12,m.number.length*6)}" stroke="${color}"/>`;if(m.marriage>1)content+=`<path d="M15 9h${Math.max(12,m.number.length*6)}" stroke="${color}"/>`;}
    nodes+=`<g class="node${search.active?(match?(search.options.highlight?' match':''):(search.options.filter?' faded':'')):''}" data-search-person="${esc(p.id)}" data-person="${esc(p.id)}" tabindex="0" role="button" aria-label="Edit ${esc(p.name)}" transform="translate(${pos.x},${pos.y})"><title>${esc([p.name,p.label,p.notes].filter(Boolean).join(' · '))}</title><rect width="${cardW}" height="${cardH}" rx="${s.nodeStyle==='square'?0:9}" fill="#fff" stroke="${color}" stroke-opacity=".5"/><rect x="0" y="13" width="3" height="${cardH-26}" rx="1" fill="${color}"/>${content}</g>`;
  }
  return {width,height,positions,parentStyles,warnings:[...new Set(warnings)],svg:`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(f.name)} kinship diagram" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:${font}"><title>${esc(f.name)}</title><desc>Distinct colors and line weights identify each parent; arrows point to their children. Matching swatches appear on parent cards. Dashed lines connect spouses. ${esc(f.description)}</desc><defs>${markers}</defs><rect width="100%" height="100%" fill="#f9fbf6"/>${edges}${nodes}</svg>`};
}
