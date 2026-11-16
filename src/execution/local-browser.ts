import {existsSync,realpathSync,statSync,openSync,readSync,closeSync} from 'node:fs';
import {join,win32} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

export function browserCandidates(env:NodeJS.ProcessEnv=process.env){
  const roots=[env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA].filter((v):v is string=>!!v);
  return (['chrome','msedge'] as const).flatMap(channel=>roots.map(root=>({channel,path:win32.join(root,...(channel==='chrome'?['Google','Chrome','Application','chrome.exe']:['Microsoft','Edge','Application','msedge.exe']))})));
}
export function chooseBrowser<T extends {channel:'chrome'|'msedge';path:string}>(candidates:T[],exists:(path:string)=>boolean){return candidates.find(c=>c.channel==='chrome'&&exists(c.path))??candidates.find(c=>c.channel==='msedge'&&exists(c.path));}
let cached:{key:string;value:{channel:'chrome'|'msedge';executablePath:string;sha256:string}}|undefined;
export function installedBrowser(){
  const found=chooseBrowser(browserCandidates(),path=>existsSync(path)&&statSync(path).isFile());
  if(!found)throw Error('No installed Chrome or Edge found; no browser download or remote connection attempted');
  const path=realpathSync(found.path),s=statSync(path),key=JSON.stringify([path,s.size,s.mtimeMs]);if(cached?.key===key)return cached.value;
  const hash=createHash('sha256'),fd=openSync(path,'r'),buffer=Buffer.alloc(1048576);try{let count;while((count=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count));}finally{closeSync(fd);}
  const value={channel:found.channel,executablePath:path,sha256:hash.digest('hex')};cached={key,value};return value;
}
export function localLaunchOptions(){const browser=installedBrowser();return{headless:true as const,channel:browser.channel,executablePath:browser.executablePath};}
// launch() owns a new temporary profile; never connectOverCDP, persistent user
// data directories, everyday session discovery, profile copying or process kills.
export async function launchLocalBrowser(){return chromium.launch(localLaunchOptions());}
