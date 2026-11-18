import vm from 'node:vm';
import ts from 'typescript';
import { expect, type Page, type BrowserContext } from '@playwright/test';
// Test-only registration harness: executes the actual generated callback and
// real Playwright assertions against a loopback Page. No production interpreter.
export async function executeGeneratedQAFixture(code: string, page: Page, modules: Record<string, unknown>) {
    const callbacks: Array<(fixtures: {
        page: Page;
        context: BrowserContext;
        request: unknown;
    }) => Promise<void>> = [], before: Array<(fixtures: {
        context: BrowserContext;
    }) => Promise<void>> = [];
    const test = Object.assign((_name: string, fn: (fixtures: any) => Promise<void>) => callbacks.push(fn), { beforeEach: (fn: (fixtures: any) => Promise<void>) => before.push(fn) }), javascript = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const sandbox = { exports: {}, require: (id: string) => { if (id === '@playwright/test')
            return { test, expect }; if (Object.hasOwn(modules, id))
            return modules[id]; throw Error('Generated fixture import outside reviewed harness'); } };
    vm.runInNewContext(javascript, sandbox, { timeout: 1000 });
    if (callbacks.length !== 1)
        throw Error('One generated fixture test required');
    for (const callback of before)
        await callback({ context: page.context() });
    await callbacks[0]({ page, context: page.context(), request: undefined });
}
