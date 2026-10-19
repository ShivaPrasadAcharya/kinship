import {analyze} from './model.mjs';
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
export function createDiagram(f,s,{query=''}={}) {
  const info=analyze(f,s), by=info.by, members=new Map(), groupOf=new Map(), groups=[];
  // Connected spouse groups keep remarriages on the same generation.
  for(const p of f.people) {
    if(groupOf.has(p.id))continue;
    const g={id:groups.length,people:[],parents:new Set(),rank:0};groups.push(g);
    const todo=[p];while(todo.length){const n=todo.shift();if(groupOf.has(n.id))continue;groupOf.set(n.id,g.id);g.people.push(n);n.spouses.forEach(id=>{if(by.has(id)&&!groupOf.has(id))todo.push(by.get(id));});}
    members.set(g.id,g);
  }
  const warnings=[];
  for(const g of groups)for(const p of g.people)for(const id of p.parents) {
    const parentGroup=groupOf.get(id);if(parentGroup===g.id)warnings.push('Some partners also share a parent chain; inspect their relationships.');else g.parents.add(parentGroup);
  }
  const done=new Set(),active=new Set();
  function rank(g){if(done.has(g.id))return g.rank;if(active.has(g.id)){warnings.push('Cross-generation marriages cannot all share a row; some connectors run upwards.');return 0;}active.add(g.id);g.rank=Math.max(0,...[...g.parents].map(id=>rank(members.get(id))+1));active.delete(g.id);done.add(g.id);return g.rank;}
  groups.forEach(rank);
  const layers=new Map();for(const g of groups){if(!layers.has(g.rank))layers.set(g.rank,[]);layers.get(g.rank).push(g);}
  const cardW=202,cardH=s.showNotes?150:130,gap=24,groupGap=50,layerGap=88,pad=35,positions=new Map(),orderIndex=new Map(info.ordered.map((p,i)=>[p.id,i]));
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
  if(right){for(const pos of positions.values()){const x=pos.x,y=pos.y;pos.x=pad+(y-pad)/(cardH+layerGap)*(cardW+120);pos.y=pad+(x-pad)/(cardW+gap)*(cardH+gap);}width=(maxRank+1)*cardW+maxRank*120+pad*2;height=Math.max(cardH+pad*2,...[...positions.values()].map(p=>p.y+cardH+pad));}
  const font=s.font==='serif'?'Georgia, serif':s.font==='nepali'?'Noto Sans Devanagari, Nirmala UI, sans-serif':'system-ui, Segoe UI, sans-serif';
  const edgeDash=s.lineStyle==='dashed'?'7 4':s.lineStyle==='dotted'?'2 4':'';
  // Give each parent set its own connector track. Different couples must not
  // merge into a shared horizontal (or vertical) bus between generations.
  const branchLayers=new Map(), branchKey=p=>JSON.stringify([...p.parents].sort());
  for(const p of f.people)if(p.parents.length){
    const level=members.get(groupOf.get(p.id)).rank;
    if(!branchLayers.has(level))branchLayers.set(level,[]);
    const keys=branchLayers.get(level),key=branchKey(p);if(!keys.includes(key))keys.push(key);
  }
  let edges='',nodes='';const spousePairs=new Set();
  for(const p of f.people){
    const pos=positions.get(p.id);
    let track=0;
    if(p.parents.length){
      const keys=branchLayers.get(members.get(groupOf.get(p.id)).rank),fraction=(keys.indexOf(branchKey(p))+1)/(keys.length+1);
      const start=Math.max(...p.parents.map(id=>{const parent=positions.get(id);return right?parent.x+cardW:parent.y+cardH;}));
      track=start+((right?pos.x:pos.y)-start)*fraction;
    }
    for(const id of p.parents){
      const par=positions.get(id);if(!par)continue;
      const d=right?`M${par.x+cardW},${par.y+cardH/2} H${track} V${pos.y+cardH/2} H${pos.x}`:`M${par.x+cardW/2},${par.y+cardH} V${track} H${pos.x+cardW/2} V${pos.y}`;
      edges+=`<path class="parent-edge" data-child="${esc(p.id)}" data-track="${track}" d="${d}" stroke="#afbd9f" fill="none" stroke-width="1.3" stroke-dasharray="${edgeDash}" marker-end="url(#arrow)"/>`;
    }
    for(const id of p.spouses){const other=positions.get(id),pair=[p.id,id].sort().join('|');if(!other||spousePairs.has(pair))continue;spousePairs.add(pair);
      const start=right?{x:pos.x+cardW/2,y:Math.min(pos.y,other.y)+cardH}:{x:Math.min(pos.x,other.x)+cardW,y:pos.y+cardH/2};
      const end=right?{x:other.x+cardW/2,y:Math.max(pos.y,other.y)}:{x:Math.max(pos.x,other.x),y:other.y+cardH/2};
      // Route remarriage links outside intervening cards.
      const far=right?Math.abs(pos.y-other.y)>cardH+gap+1:Math.abs(pos.x-other.x)>cardW+gap+1;
      const d=far?(right?`M${start.x},${start.y} h${cardW/2+14} V${end.y} H${end.x}`:`M${start.x},${start.y} v${cardH/2+18} H${end.x} V${end.y}`):`M${start.x},${start.y} L${end.x},${end.y}`;
      edges+=`<path class="spouse-edge" d="${d}" fill="none" stroke="#a8bba6" stroke-width="1.4" stroke-dasharray="5 4"/>`;
    }
    const m=info.meta.get(p.id),color=s[p.gender==='M'?'male':p.gender==='F'?'female':'unknown'],match=!query||[p.name,p.label,p.notes,p.birth,p.death].join(' ').toLocaleLowerCase().includes(query),nameLines=wrap(p.name),dead=p.dead?` ${s.deceasedSymbol}`:'';
    let y=49;
    let content=`<text x="15" y="25" class="num" fill="${color}" font-size="10">${s.showNumbers?esc(m.number):''}${esc(dead)}</text>`;
    for(const line of nameLines){content+=`<text class="name" x="15" y="${y}" fill="#334d36" font-size="14" font-weight="550">${esc(line)}</text>`;y+=17;}
    if(s.showRelations&&p.label){content+=`<text class="detail" x="15" y="${y+4}" fill="#819074" font-size="10">${esc(wrap(p.label,30,1)[0])}</text>`;y+=17;}
    if(s.showDates&&(p.birth||p.death)){content+=`<text class="detail" x="15" y="${y+3}" fill="#819074" font-size="10">${esc(wrap([p.birth,p.death].filter(Boolean).join(' – '),30,1)[0])}</text>`;y+=15;}
    if(s.showGender)content+=`<text x="${cardW-15}" y="25" text-anchor="end" fill="${color}" font-size="9">${esc(p.gender)}</text>`;
    if(s.showNotes&&p.notes)content+=`<text class="detail" x="15" y="${cardH-13}" fill="#819074" font-size="10">${esc(wrap(p.notes,30,1)[0])}</text>`;
    if(s.daughterLine&&m.viaDaughter)content+=`<path d="M15 30h${Math.max(12,m.number.length*6)}" stroke="#599b67" stroke-width="2"/>`;
    if(s.marriageBars&&m.marriage){content+=`<path d="M15 12h${Math.max(12,m.number.length*6)}" stroke="${color}"/>`;if(m.marriage>1)content+=`<path d="M15 9h${Math.max(12,m.number.length*6)}" stroke="${color}"/>`;}
    nodes+=`<g class="node${query?(match?' match':' faded'):''}" data-person="${esc(p.id)}" tabindex="0" role="button" aria-label="Edit ${esc(p.name)}" transform="translate(${pos.x},${pos.y})"><title>${esc([p.name,p.label,p.notes].filter(Boolean).join(' · '))}</title><rect width="${cardW}" height="${cardH}" rx="${s.nodeStyle==='square'?0:9}" fill="#fff" stroke="${color}" stroke-opacity=".5"/><rect x="0" y="13" width="3" height="${cardH-26}" rx="1" fill="${color}"/>${content}</g>`;
  }
  return {width,height,warnings:[...new Set(warnings)],svg:`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(f.name)} kinship diagram" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:${font}"><title>${esc(f.name)}</title><desc>Solid or customized parent-child connectors; dashed spouse connectors. ${esc(f.description)}</desc><defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8" fill="#afbd9f"/></marker></defs><rect width="100%" height="100%" fill="#f9fbf6"/>${edges}${nodes}</svg>`};
}
