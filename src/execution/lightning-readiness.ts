import {z} from 'zod';
import type {Page,Locator,ElementHandle} from '@playwright/test';
import {LocatorSchema,resolveLocator} from '../core/locators.js';
import {digest,fingerprint} from './browser-policy.js';

const Selector=LocatorSchema.extend({value:z.string().min(1).max(200),name:z.string().max(300).optional()}).strict();
export const ReadinessRegionsSchema=z.object({
  strategy:z.literal('reviewed-regions-v1'),
  regions:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),locator:Selector}).strict()).min(1).max(10),
  backgrounds:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),locator:Selector,reason:z.literal('independent-background'),sourceHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(10).default([]),
  inspection:z.object({maxRoots:z.number().int().min(100).max(512)}).strict().optional(),
  deferredRelatedLists:z.object({component:z.literal('laf-progressive-container'),ancestor:z.literal('lst-related-list-single-container'),reason:z.literal('outside-reviewed-viewport-only'),sourceHashes:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(10)}).strict().optional(),
}).strict().refine(v=>new Set([...v.regions,...v.backgrounds].map(r=>r.id)).size===v.regions.length+v.backgrounds.length,'Region IDs must be unique');
export type ReadinessRegions=z.infer<typeof ReadinessRegionsSchema>;

// Fixed host-owned DOM inspection. No text/record values, IDs, arbitrary CSS,
// browser handles or evaluator are exposed to agents. Inner text is hashed in
// host memory solely to detect changes during the stability window.
export async function inspectLightningReadiness(page:Page,anchors:Locator[],raw?:ReadinessRegions,name=''){
  const config=raw?ReadinessRegionsSchema.parse(raw):undefined;
  const handles:ElementHandle[]=[];
  try{
    const anchorHandles=[],regionHandles=[],backgroundHandles=[];let regionsValid=true,backgroundsValid=true;
    const snapshot=async(locator:Locator)=>{const matches=await locator.elementHandles();handles.push(...matches);const elements:ElementHandle<Element>[]=[];for(const handle of matches){if(!await handle.evaluate(node=>node.nodeType===1))return[];elements.push(handle as ElementHandle<Element>);}return elements;};
    for(const locator of anchors){const matches=await snapshot(locator);if(matches.length===1)anchorHandles.push(matches[0]);}
    for(const region of config?.regions??[]){const locator=resolveLocator(page,{...region.locator,value:region.locator.value.replaceAll('{{record-name}}',name),name:region.locator.name?.replaceAll('{{record-name}}',name)}),matches=await snapshot(locator);if(matches.length!==1||!await matches[0].isVisible()){regionsValid=false;continue;}regionHandles.push(matches[0]);}
    for(const region of config?.backgrounds??[]){const locator=resolveLocator(page,{...region.locator,value:region.locator.value.replaceAll('{{record-name}}',name),name:region.locator.name?.replaceAll('{{record-name}}',name)}),matches=await snapshot(locator);if(matches.length>1){backgroundsValid=false;continue;}if(matches.length===1)backgroundHandles.push({id:region.id,element:matches[0]});}
    const dom=await page.evaluate(({anchors,regions,backgrounds,rootLimit})=>{
      const candidates=Array.from(document.querySelectorAll('[role="progressbar"],[aria-busy="true"],.slds-spinner,[role="alert"],.forcePageError'));
      // Include open LWC shadow roots, with bounded traversal. Closed roots
      // remain inaccessible and are not represented as inspected internals.
      const roots:ParentNode[]=[document];let scanned=0,rootsVisited=0;
      for(let i=0;i<roots.length&&i<rootLimit&&scanned<=10000;i++){rootsVisited++;for(const element of Array.from(roots[i].querySelectorAll('*'))){if(++scanned>10000)break;if(element.shadowRoot){roots.push(element.shadowRoot);for(const signal of Array.from(element.shadowRoot.querySelectorAll('[role="progressbar"],[aria-busy="true"],.slds-spinner,[role="alert"],.forcePageError')))candidates.push(signal);}}}
      const all=[...new Set(candidates)],signals=[];let backgroundConflict=false;
      let positiveVisible=true;for(const required of [...anchors,...regions]){const rect=required.getBoundingClientRect();if(rect.width<=0||rect.height<=0||rect.bottom<=0||rect.right<=0||rect.top>=innerHeight||rect.left>=innerWidth)positiveVisible=false;let cursor:Element|null=required,depth=0;while(cursor&&depth++<64){const style=getComputedStyle(cursor);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0||style.contentVisibility==='hidden'||cursor.hasAttribute('hidden'))positiveVisible=false;cursor=cursor.parentElement??((cursor.getRootNode() as ShadowRoot).host??null);}if(cursor)positiveVisible=false;}
      for(const background of backgrounds)for(const required of [...anchors,...regions]){let cursor:Element|null=required,depth=0;while(cursor&&depth++<64){if(cursor===background.element)backgroundConflict=true;cursor=cursor.parentElement??((cursor.getRootNode() as ShadowRoot).host??null);}if(cursor)backgroundConflict=true;}
      for(const element of all.slice(0,1000)){
        const rect=element.getBoundingClientRect(),own=getComputedStyle(element),reasons:string[]=[],path:string[]=[];let parent:Element|null=element,ariaHidden=false,inert=false,inactiveTab=false,depth=0;
        while(parent&&depth++<64){const style=getComputedStyle(parent),box=parent.getBoundingClientRect();if(style.display==='none'||parent.hasAttribute('hidden'))reasons.push('display-hidden');if(style.visibility==='hidden'||style.visibility==='collapse')reasons.push('visibility-hidden');if(Number(style.opacity)===0)reasons.push('transparent-ancestor');if(style.contentVisibility==='hidden')reasons.push('content-hidden');if(parent.getAttribute('aria-hidden')==='true')ariaHidden=true;if(parent.hasAttribute('inert'))inert=true;
          if((style.overflow==='hidden'||style.overflow==='clip')&&(box.width===0||box.height===0))reasons.push('zero-clip-ancestor');
          const clip=style.clip.startsWith('rect(')?style.clip.match(/-?\d+(?:\.\d+)?/g)?.map(Number):undefined;if(clip?.length===4&&(clip[2]<=clip[0]||clip[1]<=clip[3]))reasons.push('zero-clip-ancestor');if(/^inset\(50%(?: 50%){0,3}\)$/.test(style.clipPath))reasons.push('zero-clip-ancestor');
          if(parent.getAttribute('role')==='tabpanel'&&parent.id)for(const tab of Array.from((parent.getRootNode() as Document|ShadowRoot).querySelectorAll('[role="tab"][aria-controls]')))if(tab.getAttribute('aria-controls')===parent.id&&tab.getAttribute('aria-selected')==='false')inactiveTab=true;
          if(path.length<128){const siblings=Array.from(parent.parentElement?.children??(parent.getRootNode() as Document|ShadowRoot).children??[]).filter(s=>s.tagName===parent!.tagName);path.push(`${parent.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(parent)+1})`);if(!parent.parentElement&&(parent.getRootNode() as ShadowRoot).host)path.push('::shadow-root::');}
          parent=parent.parentElement??((parent.getRootNode() as ShadowRoot).host??null);
        }
        if(rect.width===0||rect.height===0)reasons.push('zero-area');
        const hidden=[...new Set(reasons)];let required=false,anchorRelated=false;const backgroundsContaining=[];
        for(const root of regions){let cursor:Element|null=element,depth=0;while(cursor&&depth++<64){if(cursor===root)required=true;cursor=cursor.parentElement??((cursor.getRootNode() as ShadowRoot).host??null);}cursor=root;depth=0;while(cursor&&depth++<64){if(cursor===element)required=true;cursor=cursor.parentElement??((cursor.getRootNode() as ShadowRoot).host??null);}}
        for(const root of anchors){let cursor:Element|null=element,depth=0;while(cursor&&depth++<64){if(cursor===root)anchorRelated=true;cursor=cursor.parentElement??((cursor.getRootNode() as ShadowRoot).host??null);}cursor=root;depth=0;while(cursor&&depth++<64){if(cursor===element)anchorRelated=true;cursor=cursor.parentElement??((cursor.getRootNode() as ShadowRoot).host??null);}}
        for(const root of backgrounds){let cursor:Element|null=element,depth=0;while(cursor&&depth++<64){if(cursor===root.element){backgroundsContaining.push(root);break;}cursor=cursor.parentElement??((cursor.getRootNode() as ShadowRoot).host??null);}}
        const coversRequired=(own.position==='fixed'||own.position==='absolute')&&[...anchors,...regions].some(root=>{const box=root.getBoundingClientRect();return rect.left<box.right&&rect.right>box.left&&rect.top<box.bottom&&rect.bottom>box.top;});
        signals.push({path:path.reverse().join(' > '),tag:element.tagName.toLowerCase().slice(0,80),role:['progressbar','alert','tabpanel','region','status','main','dialog'].includes(element.getAttribute('role')??'')?element.getAttribute('role'):null,
          ariaBusy:element.getAttribute('aria-busy')==='true',progressbar:element.getAttribute('role')==='progressbar',spinner:element.classList.contains('slds-spinner'),fault:element.matches('[role="alert"],.forcePageError'),
          hidden,ariaHidden,inert,inactiveTab,ancestorLimit:!!parent,offViewport:rect.bottom<=0||rect.right<=0||rect.top>=innerHeight||rect.left>=innerWidth,required,anchorRelated,coversRequired,backgrounds:backgroundsContaining.map(b=>b.id),
          legacyVisible:rect.width>0&&rect.height>0&&own.display!=='none'&&own.visibility!=='hidden'});
      }
      return{signals,backgroundConflict,positiveVisible,scanned,rootsVisited,rootsObserved:roots.length,truncated:all.length>1000||rootsVisited<roots.length||scanned>10000,matched:all.length,regionContent:[...regions,...anchors].map(root=>({text:(root as HTMLElement).innerText?.slice(0,65536)??'',truncated:((root as HTMLElement).innerText?.length??0)>65536}))};
    },{anchors:anchorHandles,regions:regionHandles,backgrounds:backgroundHandles,rootLimit:config?.inspection?.maxRoots??100});
    const signals=dom.signals.map(signal=>{const hidden=signal.hidden.length>0,background=!!config&&signal.backgrounds.length>0&&!signal.required&&!signal.anchorRelated&&!signal.coversRequired&&!dom.backgroundConflict;
      const deferred=!!config?.deferredRelatedLists&&signal.tag===config.deferredRelatedLists.component&&signal.path.split(' > ').some(p=>p.startsWith(`${config.deferredRelatedLists!.ancestor}:nth-of-type(`))&&signal.offViewport&&!signal.required&&!signal.anchorRelated&&!signal.coversRequired&&!signal.fault&&!signal.spinner&&!signal.progressbar;
      const blocking=config?!hidden&&(signal.fault||!background&&!deferred):signal.legacyVisible;
      return{...signal,pathHash:digest(signal.path),classification:hidden?'hidden':signal.fault?'application-error':signal.required||signal.anchorRelated?'required-region':background?'reviewed-background':deferred?'reviewed-deferred-related-list':signal.inactiveTab?'inactive-tab-visible':'unresolved',blocking};});
    const complete=!dom.truncated&&!signals.some(s=>s.ancestorLimit)&&!dom.regionContent.some(r=>r.truncated),valid=regionsValid&&backgroundsValid&&!dom.backgroundConflict&&(!config||dom.positiveVisible);
    const visible=signals.filter(s=>s.legacyVisible);
    return{strategy:config?.strategy??'legacy-global',complete,valid,matched:dom.matched,legacyCounts:{nativeProgressbars:visible.filter(s=>s.progressbar).length,nativeAriaBusy:visible.filter(s=>s.ariaBusy).length,nativeSpinners:visible.filter(s=>s.spinner).length,nativeFaults:visible.filter(s=>s.fault).length},blockingBusy:signals.filter(s=>s.blocking&&(s.ariaBusy||s.progressbar||s.spinner)).length,blockingFaults:signals.filter(s=>s.blocking&&s.fault).length,
      signature:fingerprint(dom.regionContent.map(r=>digest(r.text))),signals:signals.slice(0,40),detailsTruncated:signals.length>40,regionsValid,positiveVisible:dom.positiveVisible,backgroundConflict:dom.backgroundConflict,limits:{nodesVisited:dom.scanned,rootsObserved:dom.rootsObserved,rootsVisited:dom.rootsVisited,nodeLimit:10000,rootLimit:config?.inspection?.maxRoots??100,signalLimit:1000,textLimit:65536,contentTruncated:dom.regionContent.some(r=>r.truncated)}};
  }finally{for(const handle of handles)await handle.dispose();}
}
