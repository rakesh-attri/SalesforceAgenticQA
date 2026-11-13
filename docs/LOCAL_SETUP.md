# Local setup (Windows PowerShell)

Use Node 22+ and npm; no Docker or Python. If PowerShell rejects npm.ps1, use npm.cmd without changing machine execution policy.

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run typecheck
npm.cmd run unit
npm.cmd run demo
npm.cmd run demo:graph
npm.cmd test
npm.cmd run discover:fixture
npm.cmd run plan
npm.cmd run data:plan
```

`npm.cmd run mcp:salesforce` starts the stdio read-only MCP server for an authorized client. Credentials stay in local environment configuration. The only tool is `discover_schema`; it does not create records or authenticate a browser.

Dependencies present during audit: Playwright Test 1.65.0, LangGraph 1.7.4, MCP SDK 1.32.2, Playwright MCP 0.0.60, Chroma 3.5.0, Zod 4.6.7, TypeScript 5.9.3, tsx 4.23.15. `npm.cmd ls --depth=0` reports a resolved tree; no claim that these are the latest registry releases is made. Commit the lockfile for reproducibility.

## Authorized read-only sandbox discovery

```powershell
Copy-Item .env.example .env
# Configure authorized sandbox JWT credentials locally; never commit them.
$env:SFQA_ORG_ALIAS = 'my-authorized-sandbox'
$env:SFQA_OBJECTS = 'Account,Contact'
npm.cmd run discover:live
```

Describe discovery allows at most 50 explicit API object names. Required field metadata does not prove business-valid creation. All Salesforce POSTs are blocked. The old SFQA_ALLOW_WRITES flag cannot enable writes. No browser session is bootstrapped by JWT. Configure SFQA_BROWSER_STATE only with separately authorized local state and keep that state out of Git.

## Outputs and diagnosis

Ignored `.state` contains current/versioned schema snapshots; `artifacts` contains draft plans; `playwright-report` contains HTML; `test-results/junit.xml` contains actual Playwright outcomes. Do not commit live Salesforce records or auth artifacts.

The managed execution sandbox can produce `uv_os_get_passwd ENOMEM` in tsx before application startup. Run the same checks with approved normal local execution; do not report these startup failures as test results. Browser installation errors require installing Chromium. Authentication failures require checking app authorization, audience and key locally without printing secrets.

Live Salesforce integration has not been executed. No test currently verifies real Salesforce UI or business workflows.
