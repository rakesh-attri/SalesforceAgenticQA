import {z} from 'zod';
import {digest,fingerprint} from './browser-policy.js';
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const MetadataFailureSchema=z.object({stage:z.literal('metadata-source'),reason:z.enum(['dedicated-reader-denied','transport-policy-denied','api-http','invalid-json','invalid-response','source-drift','budget','unknown','evidence-write-failed']),area:z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),sourceHash:Hash,httpStatus:z.number().int().min(100).max(599).optional(),expectedHash:Hash.optional(),actualHash:Hash.optional(),evidenceSaved:z.boolean()}).strict();
export class MetadataPreflightError extends Error{constructor(readonly diagnostic:z.infer<typeof MetadataFailureSchema>){super('Source-bound metadata preflight failed; raw provider details withheld');this.name='MetadataPreflightError';MetadataFailureSchema.parse(diagnostic);}}
const Item=z.object({area:z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),path:z.string().min(1).max(32768),expectedResponseHash:Hash,previousCoverage:z.string().max(150)}).strict();
export async function verifyMetadataSources(reader:{get<T>(path:string):Promise<T>},raw:unknown,checkBudget:()=>void,save:(value:unknown)=>Promise<unknown>){
 const items=z.array(Item).min(1).max(100).parse(raw),seen=new Map<string,unknown>(),comparisons:Array<{area:string;sourceHash:string;responseHash:string;matches:boolean;coverage:string}>=[];
 for(const item of items){
  let failure:z.infer<typeof MetadataFailureSchema>|undefined;
  try{
   checkBudget();let value=seen.get(item.path);if(!seen.has(item.path)){value=await reader.get(item.path);seen.set(item.path,value);}
   if(value===undefined)throw new TypeError('Metadata response unavailable');
   const actual=fingerprint(value);comparisons.push({area:item.area,sourceHash:digest(item.path),responseHash:actual,matches:actual===item.expectedResponseHash,coverage:item.previousCoverage});
   if(actual!==item.expectedResponseHash)failure={stage:'metadata-source',reason:'source-drift',area:item.area,sourceHash:digest(item.path),expectedHash:item.expectedResponseHash,actualHash:actual,evidenceSaved:false};
  }catch(error){
   const message=error instanceof Error?error.message:'',http=/^Salesforce API GET failed: ([1-5][0-9]{2})$/.exec(message);
   const reason=message==='Dedicated business-record reads require the run-owned verification service'?'dedicated-reader-denied':message==='Unapproved lifecycle operation/path/query'?'transport-policy-denied':http?'api-http':error instanceof SyntaxError?'invalid-json':error instanceof TypeError?'invalid-response':message==='Original execution time budget exhausted'?'budget':'unknown';
   failure={stage:'metadata-source',reason,area:item.area,sourceHash:digest(item.path),...(http?{httpStatus:Number(http[1])}:{}),evidenceSaved:false};
  }
  if(failure){try{await save({comparisons,failure:{...failure,evidenceSaved:true}});failure.evidenceSaved=true;}catch{/* Keep the primary closed diagnostic when evidence I/O also fails. */}throw new MetadataPreflightError(failure);}
 }
 try{await save({comparisons,complete:true});}catch{const last=items.at(-1)!;throw new MetadataPreflightError({stage:'metadata-source',reason:'evidence-write-failed',area:last.area,sourceHash:digest(last.path),evidenceSaved:false});}return{compared:comparisons.length,uniqueReads:seen.size,sourceDrift:false};
}
