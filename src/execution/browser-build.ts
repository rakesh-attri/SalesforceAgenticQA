import ts from 'typescript';
import { parseLightningIdentity } from './lightning-identity.js';
import { digest, BrowserReviewSchema, authorizeBrowserSession } from './browser-policy.js';
import type { BrowserContext } from '@playwright/test';
import type { EnvironmentIdentity } from './environment.js';
import { sameSalesforceIdentity } from './lightning-identity.js';

// A native document supplies the actual build; aliases/env vars supply none.
export function parseBrowserBuild(html: string) {
  if(Buffer.byteLength(html,'utf8')>2000000)throw Error('Native build document exceeds the bounded source limit');
  const identity = parseLightningIdentity(html), versions: Array<{ framework: string; app: string }> = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const ast = ts.createSourceFile('native-build.js', script[1], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const field = (node: ts.Node | undefined, name: string): ts.Expression | undefined => {
      if (!node || !ts.isObjectLiteralExpression(node)) return;
      const values = node.properties.filter((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name);
      return values.length === 1 ? values[0].initializer : undefined;
    };
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'auraConfig') {
        const context = field(node.initializer, 'context'), framework = field(context, 'fwuid'), app = field(context, 'app');
        if (framework && app && ts.isStringLiteral(framework) && ts.isStringLiteral(app) && framework.text.length > 0 && framework.text.length < 4000 && app.text.length < 300) versions.push({ framework: framework.text, app: app.text });
      }
      ts.forEachChild(node, visit);
    }; visit(ast);
  }
  if (versions.length !== 1) throw Error('Native Lightning build is missing or ambiguous; content withheld');
  return { orgId: identity.organization_id, userId: identity.user_id, buildHash: digest(versions[0].framework), appHash: digest(versions[0].app), documentHash: identity.documentHash };
}

export async function proveReviewedBrowserBuild(context:BrowserContext,raw:unknown,parent:unknown,identity:EnvironmentIdentity){
  const review=BrowserReviewSchema.parse(raw),origin=review.plan.origins.find(origin=>new URL(origin).hostname.endsWith('.lightning.force.com'));
  if(!origin)throw Error('Exact Lightning origin missing');
  const response=await context.request.get(`${origin}/lightning/page/home`,{maxRedirects:0,timeout:15000});
  if(response.status()!==200||!response.headers()['content-type']?.includes('text/html')||Number(response.headers()['content-length']??0)>2000000)throw Error('Native Lightning build proof unavailable');
  const build=parseBrowserBuild(await response.text());
  if(!sameSalesforceIdentity(build.orgId,identity.Id)||!sameSalesforceIdentity(build.userId,identity.userId))throw Error('Native build actor mismatch');
  authorizeBrowserSession(review,parent,identity,build);return build;
}
