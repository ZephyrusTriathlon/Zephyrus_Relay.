// Package supplied records byte-for-byte, never synthesize replacements.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const names=['outlets.csv','vehicles.csv','calendar.csv','district_travel.csv','service_allowance.csv'];
const source=new URL('../data/General Data/',import.meta.url),target=new URL('../prisma/judge-data/General Data/',import.meta.url);
const files=await Promise.all(names.map(async name=>({name,bytes:await readFile(new URL(name,source))})));
await mkdir(target,{recursive:true});
for(const {name,bytes} of files)await writeFile(new URL(name,target),bytes);
await writeFile(new URL('../prisma/judge-data/manifest.json',import.meta.url),JSON.stringify({provenance:'Supplied Tech-Triathlon operational references; exact copies',files:Object.fromEntries(files.map(({name,bytes})=>[name,createHash('sha256').update(bytes).digest('hex')]))},null,2)+'\n');
console.log('Packaged five supplied reference CSVs without modifying values.');
