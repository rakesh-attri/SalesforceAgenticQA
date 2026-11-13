import { createHash } from 'node:crypto';
import type { OrgSnapshot } from '../core/types.js';
import { History } from '../core/history.js';
import { RecipeRegistry,type Recipe } from './recipe-registry.js';
import { DataExecution,type DataAdapter } from './data-execution.js';
import { snapshotVersion } from '../knowledge/snapshots.js';
import { authorize,type Mutation,type Approval } from '../salesforce/approval.js';
type Mode=Recipe['mode'];
export interface FactoryAdapter extends DataAdapter {
  identity():Promise<{Id:string;IsSandbox:boolean}>;
  verify(m:Mutation,id:string):Promise<unknown>;
}
export class HybridFactory {
  constructor(private history:History,private adapters:Partial<Record<Mode,FactoryAdapter>>,private allowedObjects:string[]){history.db.exec('CREATE TABLE IF NOT EXISTS factory_records(run TEXT,object TEXT,id TEXT,mode TEXT,evidence TEXT,PRIMARY KEY(run,object,id))');}
  owned(runId:string):SetupRecord[] {return this.history.db.prepare('SELECT object,id,mode,evidence FROM factory_records WHERE run=? ORDER BY rowid').all(runId).map(r=>({object:String(r.object),id:String(r.id),mode:r.mode as Mode,evidence:r.evidence?JSON.parse(String(r.evidence)):null}));}
  plan(recipes:Recipe[],org:OrgSnapshot) {
    const registry=new RecipeRegistry(),byObject=new Map<string,Recipe>();
    for(const recipe of recipes){registry.register(recipe);if(byObject.has(recipe.object))throw Error('One recipe per object required');byObject.set(recipe.object,recipe);}
    for(const recipe of recipes){const proposal=registry.propose(recipe.id,org,snapshotVersion(org));if(proposal.status==='blocked')throw Error(proposal.errors.join('; '));if(!this.adapters[recipe.mode])throw Error(`Reviewed ${recipe.mode} adapter missing`);if(!this.allowedObjects.includes(recipe.object))throw Error('Factory object permission denied');}
    const sorted:Recipe[]=[],visiting=new Set<string>(),visited=new Set<string>();
    const visit=(recipe:Recipe)=>{if(visiting.has(recipe.object))throw Error('Cyclic recipe dependencies');if(visited.has(recipe.object))return;visiting.add(recipe.object);
      for(const field of Object.values(recipe.fields).filter(f=>f.kind==='parent')){const parent=byObject.get(field.object);if(!parent)throw Error('Missing parent recipe');visit(parent);}
      visiting.delete(recipe.object);visited.add(recipe.object);sorted.push(recipe);
    };recipes.forEach(visit);return sorted;
  }
  private executor(mode:Mode) {
    const adapter=this.adapters[mode];if(!adapter)throw Error('Reviewed adapter unavailable');
    return new DataExecution({mutate:async(m,a)=>{authorize(m,a,await adapter.identity(),this.allowedObjects);return adapter.mutate(m,a);}},this.history);
  }
  async setup(runId:string,recipes:Recipe[],org:OrgSnapshot,approvalFor:(m:Mutation)=>Promise<Approval>) {
    const sorted=this.plan(recipes,org),created:Array<{object:string;id:string;mode:Mode;evidence:unknown}>=[],references=new Map<string,string>();
    for(const recipe of sorted) {
      const values:Mutation['values']={};
      for(const [name,field] of Object.entries(recipe.fields)){
        const seed=createHash('sha256').update(`${runId}:${recipe.id}:${name}`).digest('hex').slice(0,12);
        values[name]=field.kind==='parent'?references.get(field.object)!:field.kind==='picklist'?field.value:field.type==='boolean'?false:field.type==='integer'?1:field.type==='email'?`sfqa-${seed}@example.test`:`sfqa-${seed}`;
      }
      const m:Mutation={runId,object:recipe.object,operation:'create',values};
      const id=String(await this.executor(recipe.mode).execute(m,await approvalFor(m)));
      this.history.db.prepare('INSERT OR IGNORE INTO factory_records VALUES(?,?,?,?,NULL)').run(runId,recipe.object,id,recipe.mode);
      // Verification failure does not erase the durable ownership registry or trigger blind retries.
      const evidence=await this.adapters[recipe.mode]!.verify(m,id);if(evidence===undefined||evidence===null||evidence===false)throw Error('Independent verification produced no affirmative evidence');this.history.db.prepare('UPDATE factory_records SET evidence=? WHERE run=? AND object=? AND id=?').run(JSON.stringify(evidence),runId,recipe.object,id);references.set(recipe.object,id);created.push({object:recipe.object,id,mode:recipe.mode,evidence});
    }return created;
  }
  async cleanup(runId:string,created:Array<{object:string;id:string;mode:Mode}>,approvalFor:(m:Mutation)=>Promise<Approval>) {
    const deleted=[];
    for(const record of [...created].reverse()){
      const m:Mutation={runId,object:record.object,id:record.id,operation:'delete',values:{}};
      await this.executor(record.mode).execute(m,await approvalFor(m));deleted.push(record.id);
    }return deleted;
  }
}
export type SetupRecord={object:string;id:string;mode:Mode;evidence:unknown};
