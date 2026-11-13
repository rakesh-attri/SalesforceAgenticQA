import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export type Evidence={ id:string; orgAlias:string; source:string; status:'observed'|'proposed'|'verified'|'deprecated'; text:string; capturedAt:string };
// Offline source-linked knowledge for first-run operation; replace query with Chroma semantic retrieval after embedding setup.
export class LocalKnowledgeStore {
  constructor(private root='.state/knowledge'){}
  async add(e:Evidence){await mkdir(this.root,{recursive:true});await writeFile(join(this.root,`${e.id.replace(/[^a-z0-9_-]/gi,'_')}.json`),JSON.stringify(e,null,2));}
  async read(id:string){return JSON.parse(await readFile(join(this.root,`${id.replace(/[^a-z0-9_-]/gi,'_')}.json`),'utf8')) as Evidence;}
}
