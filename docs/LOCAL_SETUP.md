# Local setup (Windows PowerShell)

## Specs-to-tests and verified-learning workflow

See [SPECS_PIPELINE.md](SPECS_PIPELINE.md) for the connected workflow, bundle schema, trust boundaries and continuation point.

```powershell
npm.cmd run platform -- spec-ingest fixtures/specs/status.json
npm.cmd run platform -- demo-learning
npm.cmd run platform -- knowledge-index path-to-reviewed-knowledge.json
npm.cmd run platform -- spec-run path-to-reviewed-bundle.json
npm.cmd run platform -- heal-workflow path-to-locator-review.json
```

The learning demo intentionally executes one failing fixture and one corrected regression. It retains screenshot/trace/JSON/HTML/JUnit evidence and prints the manifest path. This never creates Salesforce data or executes a financial transaction.

## Continuation commands

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run unit
npm.cmd run demo
npm.cmd run platform -- generate-fixture
npm.cmd test
npm.cmd run platform -- metrics
npm.cmd run platform -- graph-start reviewed-thread
npm.cmd run platform -- graph-resume reviewed-thread YOUR_REVIEWER_NAME
# Authorized live read-only integrations:
npm.cmd run platform -- metadata
npm.cmd run platform -- metadata-read CustomObject Account,Contact
# Input-driven analysis (see platform-cli.ts input contracts):
npm.cmd run platform -- risk path-to-selection-input.json
npm.cmd run platform -- investigate path-to-failure-input.json
npm.cmd run platform -- rag-index path-to-verified-source.json
npm.cmd run platform -- rag-query path-to-scoped-query.json
```

SQLite uses Node's built-in node:sqlite (experimental in the verified Node 24.14.1 runtime); use Node 22.13+ or Node 24. Checkpoint saving is single-writer, not a distributed service. Runtime files remain ignored. Generated tests live in ignored tests/generated and must be regenerated after cloning.

RAG requires CHROMA_HOST (HTTPS hostname), optional CHROMA_TOKEN, SFQA_EMBEDDING_URL (HTTPS OpenAI-compatible endpoint), SFQA_EMBEDDING_MODEL and SFQA_EMBEDDING_KEY. The caller must review source text for sensitive data before remote ingestion; built-in redaction is a limited additional filter, not a complete DLP system. Chroma Cloud-specific tenant/database configuration is not yet exposed by this CLI.

Approved writes are disabled by default. The new dedicated mutation path requires a fresh Organization IsSandbox check, matching org ID, expiring SHA-256 payload approval, reviewer, nonFinancialReviewed=true and explicit SFQA_WRITE_OBJECTS allowlist. Ordinary request(POST) remains denied. MCP additionally requires SFQA_ENABLE_APPROVED_TOOLS=true and an operator-controlled ignored .state/reviewed-mutations.json map of approval IDs to {mutation,approval}. MCP cannot create approvals. Protect that file from untrusted edits. DataExecution journals pending operations before network calls, never retries uncertain effects, and permits cleanup only for a record created by that run. Each deletion needs its own scoped approval. Existing business automation must be reviewed before allowing object writes; no financial transactions are authorized by the framework.

Browser sessions are created only through createBrowserSession with an explicitly reviewed org-specific authenticator and independent persona verifier. JWT is never used as browser-login evidence. All network origins are explicitly allowlisted. A real session has not been created during verification.

The sections below describe the original starter and should be read with the dedicated mutation-path exception above.

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
