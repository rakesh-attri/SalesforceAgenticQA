import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
function b64url(value: string | Buffer): string { return Buffer.from(value).toString('base64url'); }
// OAuth responses may echo credentials. Never interpolate arbitrary provider text,
// request parameters, headers, or nested errors into a local diagnostic.
export async function oauthFailureDiagnostic(response:Response):Promise<string> {
  let body:unknown;
  try {body=await response.json();}catch {return `Salesforce JWT OAuth failed (HTTP ${response.status}): response was not valid OAuth JSON; details withheld. Check the approved token endpoint and network/proxy configuration.`;}
  const value=body!==null&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:{};
  const knownCodes=['invalid_grant','invalid_client','invalid_request','unsupported_grant_type','unauthorized_client','access_denied','server_error','temporarily_unavailable'];
  const code=typeof value.error==='string'&&knownCodes.includes(value.error)?value.error:'unrecognized_oauth_error';
  const description=typeof value.error_description==='string'?value.error_description.toLowerCase():'';
  let reason='Response details withheld to protect credentials.';
  let guidance='Check the approved app configuration, JWT certificate, user authorization and sandbox login endpoint.';
  if(/refresh_token/.test(description)&&/scope|preauthor|install/.test(description)) {
    reason='Salesforce requires refresh_token scope and app installation/preauthorization.';
    guidance='Ask the Salesforce administrator to review the app OAuth scopes and enable the required refresh_token scope, then install/preauthorize the app for the target sandbox user. Keep the JWT bearer grant; this diagnostic does not request or display a refresh token.';
  }else if(/hasn.?t approved this consumer|has not approved this consumer|consumer.*(?:not approved|approval required)|user.*(?:not approved|approval required)/.test(description)) {
    reason="User has not approved this consumer.";
    guidance='Have the Salesforce administrator authorize the user for this app, including approved-user policy and profile/permission-set access. JWT bearer requires prior consumer approval.';
  }else if(/audience.*(?:invalid|incorrect|mismatch)|invalid audience/.test(description)) {
    reason='JWT audience rejected.';
    guidance='Verify SF_LOGIN_URL uses the org-approved sandbox/My Domain login endpoint and matches the JWT audience. Do not change the grant type or bypass host validation.';
  }else if(/signature|certificate|signing key/.test(description)) {
    reason='JWT certificate/signature rejected.';
    guidance='Verify the app has the matching public certificate for SF_PRIVATE_KEY_PATH, the certificate is valid, and the JWT is signed with the corresponding RSA private key.';
  }else if(/expired|expiration|clock|not yet valid/.test(description)) {
    reason='JWT validity period rejected.';
    guidance='Check the local system clock/time synchronization and certificate validity. Keep the short-lived JWT expiry.';
  }else if(/invalid assertion|assertion.*invalid/.test(description)) {
    reason='JWT assertion rejected.';
    guidance='Check the uploaded public certificate against the local RSA key, JWT audience and system clock. Salesforce did not establish which assertion check failed.';
  }else if(code==='invalid_client') {
    reason='OAuth client rejected.';
    guidance='Verify SF_CLIENT_ID is the Consumer Key of the authorized app in the intended org and that JWT/digital-signature access is enabled. Do not print or share the key.';
  }else if(code==='invalid_grant') {
    reason='JWT grant rejected.';
    guidance='Verify the sandbox user is active and authorized for the app, the audience/login endpoint is correct, and the uploaded certificate matches the RSA key.';
  }else if(code==='unauthorized_client'||code==='access_denied') {
    reason='App or user authorization denied.';
    guidance='Ask the Salesforce administrator to review app access, approved-user policies and user permissions for JWT authentication.';
  }else if(code==='invalid_request'||code==='unsupported_grant_type') {
    guidance='Check the approved OAuth token endpoint and proxy behavior. The framework must keep the JWT bearer grant and form-encoded assertion.';
  }
  return `Salesforce JWT OAuth failed (HTTP ${response.status}): ${code}. ${reason} ${guidance}`;
}
export function salesforceJWTConfiguration(env:NodeJS.ProcessEnv=process.env) {
  const login = env.SF_LOGIN_URL ?? 'https://test.salesforce.com';
  const loginUrl=new URL(login);
  if (loginUrl.protocol!=='https:' || loginUrl.username || loginUrl.password || loginUrl.port || loginUrl.pathname!=='/' || loginUrl.search || loginUrl.hash || !(loginUrl.hostname==='test.salesforce.com' || loginUrl.hostname==='login.salesforce.com' || loginUrl.hostname.endsWith('.my.salesforce.com'))) throw Error('Unexpected Salesforce login host');
  const configured=(name:string)=>{const value=env[name];if(!value)throw Error(`Missing ${name}`);return value;};
  return{login,loginUrl,clientId:configured('SF_CLIENT_ID'),username:configured('SF_USERNAME'),keyPath:configured('SF_PRIVATE_KEY_PATH')};
}
export async function getSalesforceToken() {
  const {login,loginUrl,clientId,username,keyPath}=salesforceJWTConfiguration();
  const now = Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=b64url(JSON.stringify({iss:clientId,sub:username,aud:login,iat:now,exp:now+180}));
  const unsigned=`${header}.${payload}`;
  const signer=createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  const signature=signer.sign(await readFile(keyPath)).toString('base64url');
  const params=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`});
  let resp:Response;
  try {resp=await fetch(`${loginUrl.origin}/services/oauth2/token`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),body:params,headers:{'Content-Type':'application/x-www-form-urlencoded'}});}
  catch {throw Error('Salesforce JWT token request could not complete. Check network, TLS and the approved login endpoint; transport details withheld to protect credentials.');}
  if (!resp.ok) throw Error(await oauthFailureDiagnostic(resp));
  let token:unknown;
  try {token=await resp.json();}catch {throw Error('Invalid Salesforce OAuth response');}
  if(token===null||typeof token!=='object'||!('access_token' in token)||!('instance_url' in token)||typeof token.access_token!=='string'||!token.access_token||typeof token.instance_url!=='string'||!token.instance_url)throw Error('Invalid Salesforce OAuth response');
  return {access_token:token.access_token,instance_url:token.instance_url};
}
