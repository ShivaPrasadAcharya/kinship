import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeDocument,cleanSettings} from '../model.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'_site');
async function discover(dir,prefix=''){
  const files=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    if(entry.isSymbolicLink())throw Error('Symlinks are not supported in data/.');
    const rel=prefix+entry.name;
    if(entry.isDirectory())files.push(...await discover(path.join(dir,entry.name),rel+'/'));
    else if(/\.json$/i.test(entry.name)&&rel!=='index.json')files.push(rel);
  }
  return files.sort((a,b)=>a.localeCompare(b));
}
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(path.join(out,'data'),{recursive:true});
const files=await discover(path.join(root,'data'));let count=0,people=0;
for(const file of files){
  const raw=await fs.readFile(path.join(root,'data',file),'utf8');if(Buffer.byteLength(raw)>10000000)throw Error(file+': exceeds 10 MB.');
  let d;try{d=normalizeDocument(JSON.parse(raw),file);}catch(e){throw Error(file+': '+e.message);}
  count+=d.tables.length;people+=d.tables.reduce((n,t)=>n+t.people.length,0);
  await fs.mkdir(path.dirname(path.join(out,'data',file)),{recursive:true});await fs.writeFile(path.join(out,'data',file),raw);
}
for(const file of ['index.html','styles.css','app.mjs','model.mjs','diagram.mjs','favicon.svg'])await fs.copyFile(path.join(root,file),path.join(out,file));
const s=cleanSettings(JSON.parse(await fs.readFile(path.join(root,'site-settings.json'),'utf8')));
await fs.writeFile(path.join(out,'site-settings.json'),JSON.stringify(s,null,2)+'\n');
await fs.writeFile(path.join(out,'data/index.json'),JSON.stringify({version:1,files},null,2)+'\n');
await fs.writeFile(path.join(out,'.nojekyll'),'');
console.log(`Built ${files.length} JSON files, ${count} families, ${people} people in _site/.`);
