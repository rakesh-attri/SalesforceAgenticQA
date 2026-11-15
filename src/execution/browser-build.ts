import ts from 'typescript';
import { parseLightningIdentity } from './lightning-identity.js';
import { digest } from './browser-policy.js';

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
