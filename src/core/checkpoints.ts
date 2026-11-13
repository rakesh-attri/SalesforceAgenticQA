import { MemorySaver } from '@langchain/langgraph';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
// Single-writer local saver. Serialized bytes use explicit tags for lossless reload.
export class DurableSaver extends MemorySaver {
  private db:DatabaseSync;
  constructor(path='.state/checkpoints.sqlite') {
    super();mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);
    this.db.exec('CREATE TABLE IF NOT EXISTS checkpoints(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');
    const row=this.db.prepare('SELECT payload FROM checkpoints WHERE id=1').get();
    if(row) {const data=JSON.parse(String(row.payload),(_k,v)=>v && typeof v==='object' && Array.isArray(v.__bytes)?new Uint8Array(v.__bytes):v);this.storage=data.storage;this.writes=data.writes;}
  }
  private flush() {this.db.prepare('INSERT OR REPLACE INTO checkpoints VALUES(1,?)').run(JSON.stringify({storage:this.storage,writes:this.writes},(_k,v)=>v instanceof Uint8Array?{__bytes:Array.from(v)}:v));}
  override async put(...args:Parameters<MemorySaver['put']>) {const result=await super.put(...args);this.flush();return result;}
  override async putWrites(...args:Parameters<MemorySaver['putWrites']>) {await super.putWrites(...args);this.flush();}
  override async deleteThread(thread:string){await super.deleteThread(thread);this.flush();}
  close(){this.db.close();}
}
