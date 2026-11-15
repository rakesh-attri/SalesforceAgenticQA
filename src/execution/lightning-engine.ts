import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
export function lightningEngineProfile(){
  const driver=require('@playwright/test/package.json') as {version:string},mcp=require('@playwright/mcp/package.json') as {version:string;dependencies:{playwright:string}};
  return{version:1,driverVersion:driver.version,mcpVersion:mcp.version,mcpDriverVersion:mcp.dependencies.playwright,browser:'chromium',headless:true,serviceWorkers:'block',context:'non-persistent',agentTransport:'restricted-gateway'} as const;
}
export function lightningEngineHash(){return createHash('sha256').update(JSON.stringify(lightningEngineProfile())).digest('hex');}
export function verifyLightningEngine(expected:string|undefined){
  const profile=lightningEngineProfile(),line=(version:string)=>/^\d+\.\d+/.exec(version)?.[0];
  if(!expected||expected!==lightningEngineHash()||line(profile.driverVersion)!==line(profile.mcpDriverVersion))throw Error('Reviewed compatible Playwright/MCP engine profile required');
  return profile;
}
