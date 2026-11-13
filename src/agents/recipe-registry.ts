import { z } from 'zod';
import type { OrgSnapshot } from '../core/types.js';
import { snapshotVersion } from '../knowledge/snapshots.js';
const Name=z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
export const RecipeSchema=z.object({
  id:z.string().min(1),object:Name,version:z.string().min(1),
  orgAlias:z.string().min(1),sourceVersion:z.string().regex(/^[a-f0-9]{64}$/),
  reviewedBy:z.string().min(1),evidence:z.array(z.string().min(1)).min(1),
  mode:z.enum(['api','business-service','ui']),
  fields:z.record(Name,z.discriminatedUnion('kind',[
    z.object({kind:z.literal('synthetic'),type:z.enum(['string','email','boolean','integer'])}),
    z.object({kind:z.literal('picklist'),value:z.string().min(1)}),
    z.object({kind:z.literal('parent'),object:Name}),
  ])),
});
export type Recipe=z.infer<typeof RecipeSchema>;
// A review record is provenance, not authorization to execute. No adapter is invoked.
export class RecipeRegistry {
  private recipes=new Map<string,Recipe>();
  register(input:unknown) {
    const recipe=RecipeSchema.parse(input);
    if(this.recipes.has(recipe.id)) throw Error('Duplicate recipe ID; register a new versioned ID');
    this.recipes.set(recipe.id,structuredClone(recipe));
  }
  propose(id:string,org:OrgSnapshot,sourceVersion:string) {
    const recipe=this.recipes.get(id);
    if(!recipe) throw Error('Unknown recipe');
    const errors:string[]=[];
    if(recipe.orgAlias!==org.orgAlias || recipe.sourceVersion!==sourceVersion || sourceVersion!==snapshotVersion(org)) errors.push('Recipe org or source version mismatch');
    const object=org.objects.find(o=>o.name===recipe.object);
    if(!object) errors.push('Object not discovered');
    else {
      if(!object.createable) errors.push('Object not createable');
      for(const field of object.fields.filter(f=>f.createable && !f.nillable && !f.defaultedOnCreate)) if(!recipe.fields[field.name]) errors.push(`Missing required field: ${field.name}`);
      for(const [name,value] of Object.entries(recipe.fields)) {
        const field=object.fields.find(f=>f.name===name);
        if(!field || !field.createable) {errors.push(`Unknown or noncreateable field: ${name}`);continue;}
        if(value.kind==='parent') {
          if(field.type!=='reference' || !field.referenceTo?.includes(value.object)) errors.push(`Invalid reference target: ${name}`);
        } else if(value.kind==='picklist') {
          if(field.type!=='picklist' || !field.picklistValues?.includes(value.value)) errors.push(`Unobserved picklist value: ${name}`);
        } else {
          const supported:Record<string,string[]>={string:['string','textarea'],email:['email'],boolean:['boolean'],integer:['int']};
          if(!supported[value.type].includes(field.type)) errors.push(`Synthetic type mismatch: ${name}`);
        }
      }
    }
    return {recipe:structuredClone(recipe),status:errors.length?'blocked' as const:'proposed' as const,errors,approved:false as const,
      warnings:['Recipe review is not execution approval. Business rules, record types and automation still require independent validation.']};
  }
}
