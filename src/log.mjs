import {open,readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {digest,invariant} from './core.mjs';
export async function readJournal(file) {
  let text;try{text=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return [];throw e;}
  if(!text)return [];
  invariant(text.endsWith('\n'),'Incomplete journal: preserve it and recover manually');
  const records=text.trimEnd().split('\n').map(line=>JSON.parse(line));
  let previous='genesis';
  for(const r of records){const {hash,...body}=r;invariant(body.previous===previous&&hash===await digest(body),'Journal hash mismatch');previous=hash;}
  return records;
}
export async function appendJournal(file,event) {
  await mkdir(path.dirname(file),{recursive:true});
  const lock=await open(file+'.lock','wx');
  try{
    const records=await readJournal(file),body={sequence:records.length+1,previous:records.at(-1)?.hash||'genesis',event};
    const record={...body,hash:await digest(body)},handle=await open(file,'a');
    try{await handle.writeFile(JSON.stringify(record)+'\n');await handle.sync();}finally{await handle.close();}
    return record;
  }finally{await lock.close();const {unlink}=await import('node:fs/promises');await unlink(file+'.lock');}
}
