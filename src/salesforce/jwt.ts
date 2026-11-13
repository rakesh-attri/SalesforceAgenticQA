import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
function b64url(value: string | Buffer): string { return Buffer.from(value).toString('base64url'); }
export async function getSalesforceToken() {
  const login = process.env.SF_LOGIN_URL ?? 'https://test.salesforce.com';
  const loginUrl=new URL(login);
  if (loginUrl.protocol!=='https:' || loginUrl.username || loginUrl.password || loginUrl.port || loginUrl.pathname!=='/' || loginUrl.search || loginUrl.hash || !(loginUrl.hostname==='test.salesforce.com' || loginUrl.hostname==='login.salesforce.com' || loginUrl.hostname.endsWith('.my.salesforce.com'))) throw Error('Unexpected Salesforce login host');
  const clientId=required('SF_CLIENT_ID'), username=required('SF_USERNAME'), keyPath=required('SF_PRIVATE_KEY_PATH');
  const now = Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=b64url(JSON.stringify({iss:clientId,sub:username,aud:login,iat:now,exp:now+180}));
  const unsigned=`${header}.${payload}`;
  const signer=createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  const signature=signer.sign(await readFile(keyPath)).toString('base64url');
  const params=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`});
  const resp=await fetch(`${loginUrl.origin}/services/oauth2/token`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),body:params,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  if (!resp.ok) throw Error(`Salesforce JWT token request failed (${resp.status}). Check app authorization and sandbox config.`);
  const token=await resp.json() as {access_token:string;instance_url:string};
  if (!token.access_token || !token.instance_url) throw Error('Invalid Salesforce OAuth response');
  return token;
}
function required(name:string) {const value=process.env[name]; if(!value) throw Error(`Missing ${name}`); return value;}
