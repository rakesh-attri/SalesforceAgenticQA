import ts from 'typescript';
import { createHash } from 'node:crypto';
function id15(value:string) {
  if(!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(value))return undefined;
  const base=value.slice(0,15),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';let suffix='';
  for(let chunk=0;chunk<3;chunk++){let bits=0;for(let bit=0;bit<5;bit++)if(/[A-Z]/.test(base[chunk*5+bit]))bits|=1<<bit;suffix+=alphabet[bits];}
  return value.length===15||value.slice(15)===suffix?base:undefined;
}
export function sameSalesforceIdentity(actual:string,expected:string){const a=id15(actual),b=id15(expected);return !!a&&a===b;}
function property(node:ts.Node|undefined,name:string):ts.Expression|undefined {
  if(!node||!ts.isObjectLiteralExpression(node))return undefined;
  const matches=node.properties.filter((p):p is ts.PropertyAssignment=>ts.isPropertyAssignment(p)&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))&&p.name.text===name);
  return matches.length===1?matches[0].initializer:undefined;
}
const string=(node:ts.Node|undefined)=>node&&ts.isStringLiteral(node)?node.text:undefined;
// Source-backed parser for the observed Salesforce-generated Lightning bootstrap.
// No eval, page JavaScript, caller callbacks, arbitrary ID searches or guessed values.
export function parseLightningIdentity(html:string) {
  if(html.length>2000000)throw Error('Unsupported Lightning identity document; content withheld');
  const users:string[]=[],orgs:string[]=[];
  for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    const ast=ts.createSourceFile('identity.js',script[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const visit=(node:ts.Node)=>{
      if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='auraConfig'){
        const providers=property(property(node.initializer,'context'),'globalValueProviders');
        if(providers&&ts.isArrayLiteralExpression(providers))for(const provider of providers.elements)if(string(property(provider,'type'))==='$SObjectType'){
          const user=string(property(property(property(provider,'values'),'CurrentUser'),'Id'));if(user)users.push(user);
        }
      }
      if(ts.isCallExpression(node)&&node.expression.getText(ast)==='$A.addValueProvider'&&string(node.arguments[0])==='$ContentAsset'){
        const provider=node.arguments[1];if(provider&&ts.isNewExpression(provider)&&ts.isIdentifier(provider.expression)&&provider.expression.text==='ContentAssetGlobalValueProvider'){
          const org=string(provider.arguments?.[0]);if(org)orgs.push(org);
        }
      }
      ts.forEachChild(node,visit);
    };visit(ast);
  }
  if(users.length!==1||orgs.length!==1||!id15(users[0])||!id15(orgs[0])||!users[0].startsWith('005')||!orgs[0].startsWith('00D'))throw Error('Unsupported or ambiguous Lightning identity source; content withheld');
  return {organization_id:orgs[0],user_id:users[0],source:'observed-salesforce-lightning-bootstrap-v1',documentHash:createHash('sha256').update(html).digest('hex')};
}
