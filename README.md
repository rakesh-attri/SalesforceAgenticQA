# SalesforceAgenticQA

Current increment: [approved Lightning diagnostics](docs/LIGHTNING_DIAGNOSTICS.md) exercised the exact 31-resource union live without a data lifecycle: 12 reviewed static responses succeeded, no missing script/style URL was observed, and two pages remained loading without headings. The actual OneController.getCurrentApp bootstrap request is identified but unsupported and blocked; its source-bound review cannot enable execution. Rendering/locators remain unverified. Typecheck, 149 unit/integration tests, all demos and three headless fixtures pass. [reportingLabs](docs/REPORTING_LABS.md) remains locally verified. No writes, new model calls or verified Salesforce lessons occurred; all 15 duties and P0/P1/P2 requirements remain. Dated increments below are historical.

Latest continuation: [browser authentication and selector readiness](docs/BROWSER_AUTHENTICATION.md) adds isolated credential-free CDN transport, safe identity-redirect diagnostics, source-bound UI gap investigation and fair two-page observation budgets. Separately approved 15/18-resource bundles and refreshed native browser identity were exercised live. Run 005 created/verified/cleaned its Account/Contact pair but failed selector observation; across 003/004/005, six created/six deleted, none retained or uncertain. Generated Salesforce UI tests and learning remain unexecuted. Remaining style-context URLs need review and the three allowed daily data runs are consumed. Typecheck, 133 unit/integration tests, 3 existing headless tests and all demos pass. Earlier increment descriptions below are historical; the cumulative matrix retains all P0/P1/P2 and 15-agent requirements.

Latest increment: [dedicated personal QA org mode](docs/DEDICATED_QA.md) adds exact named org/test-user authorization, deterministic owned Account/Contact factories, guarded headless execution and verified execution learning. All three existing modes retain their boundaries. The full lifecycle passes with mocked Salesforce and real headless fixtures; the approved live attempt stopped before writes because UI Bridge lacked authorized web scope. No actual Salesforce UI/data pass is claimed.

Latest milestone: [deep intelligence and intelligent planning](docs/DEEP_INTELLIGENCE.md) adds a live source-backed component graph, resumable reviewed embeddings, source-spanned stories, historical risk/learning and synthetic Lightning/LWC/Experience exploration. See the cumulative matrix for partial and blocked capabilities; Production dynamic journeys remain disabled.

Environment-aware QA and reviewed Gemini planning: [operator guide](docs/ENVIRONMENT_QA.md), [cumulative feature matrix](docs/FEATURE_MATRIX.md), [actual implementation evidence](docs/IMPLEMENTATION_REPORT.md). Normal Production modes support explicitly approved read-only APIs and restricted observation, with writes disabled. The dedicated personal QA exception requires its separate approvals. Gemini connectivity and a five-field metadata-to-retrieval-to-planning flow have been live-validated; Salesforce UI and external Chroma have not.

**Standalone**, local-first Salesforce Agentic QA starter. No dependency on any earlier repository. Designed for Windows, Node 22+, TypeScript and headless Playwright.

## Current state
Story-driven read-only org intelligence is available via `npm.cmd run platform -- org-intelligence stories/account-contact.json --allow-non-sandbox-read` under an approved read-only policy. Actual API identity reports **IsSandbox=false**. See [ORG_INTELLIGENCE.md](docs/ORG_INTELLIGENCE.md) for metadata evidence and draft plans, and the dedicated guide for the separately approved personal QA workflow.
Optional Gemini chat and separate semantic embeddings are available through validated providers. Run `npm.cmd run model:check` for a credential-safe connectivity result, and see [GEMINI.md](docs/GEMINI.md) for configuration and actual validation limits. Model advice remains proposed and cannot approve writes or replace reviewed assertions.
The spec graph now connects approved hybrid setup/verification, independently verified session gates, authenticated execution and lifecycle cleanup. See [sandbox execution contracts](docs/SANDBOX_EXECUTION.md). The configured runtime is implemented and tested with local mocks; live Salesforce validation remains outstanding. [FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) is the single reconciled current inventory; historical tables are archived.
The connected **specs → generated tests → actual execution → failure intelligence → verified learning → future selection** workflow is now runnable with `npm.cmd run platform -- demo-learning`. Read [SPECS_PIPELINE.md](docs/SPECS_PIPELINE.md) and [agent ownership audit](docs/CAPABILITY_AUDIT.md). This is an offline fixture demonstration; live Salesforce execution and the remaining P0/P1/P2 gaps are explicit in the feature matrix.
The continuation now includes durable SQLite-backed LangGraph interrupts/resume, structured execution history, Tooling/Metadata API clients, guarded sandbox mutation and cleanup services, Chroma ingestion/retrieval adapters, reviewed workflow generation, bounded MCP observation, and deterministic quality services. See the **current continuation** table in [FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) for exact validation and limits, and [LOCAL_SETUP.md](docs/LOCAL_SETUP.md) for runnable commands. This is still a partial implementation of the complete P0/P1/P2 request. The following paragraph describes the original starter scope.
This is a **runnable foundation, not a finished autonomous Salesforce tester**. It includes a deterministic offline demo, typed story plans, conservative test-data dependency proposals, JWT API authentication helper, validated bounded Salesforce Describe discovery, versioned snapshots, a local evidence store and example Playwright fixture tests. A LangGraph planning demo and a read-only Salesforce MCP server are implemented. Chroma, approved data writes, browser org exploration and self-learning remain extension points.

## Requirements
- Windows 10/11 (PowerShell), Node.js 22+, Git optional, VS Code / Codex optional.
- Internet access for `npm install` and `npx playwright install chromium`.
- No Python and no Docker for this starter.

## Install and run on Windows
```powershell
Expand-Archive .\SalesforceAgenticQA.zip -DestinationPath $HOME\Documents
cd $HOME\Documents\SalesforceAgenticQA
npm install
npx playwright install chromium
npm run typecheck
npm run unit
npm run demo
npm test
```
The ZIP may be anywhere; adjust its location accordingly. The sample is **not Salesforce** and uses no credentials. Offline demo JSON is stored at `artifacts/offline-demo.json`.

## Discover your sandbox (READ ONLY)
```powershell
Copy-Item .env.example .env
# Edit .env with your sandbox's approved External Client App JWT configuration.
# Set SFQA_OBJECTS=Account,Contact,Your_Object__c if desired.
npm run discover:live
npm run plan
npm run data:plan
```
The JWT client retrieves a Salesforce OAuth token. It is not a browser-login solution. The live discovery command fetches only the named objects and their Describe metadata. It does not inspect every Flow, validation rule, Apex dependency or business process. A proposed data plan must not be used directly for Salesforce writes; recipes require review and approval.

## Codex local usage
Open the unzipped folder in VS Code, select Codex, and give it the task in `docs/IMPLEMENTATION.md`. `AGENTS.md` enforces repository boundaries, headless execution and safety. The project contains no relationship to the old `PlaywrightAgentic` repo.

## Suggested new GitHub repository
Create a separate repository named `SalesforceAgenticQA` when ready. In the extracted folder:
```powershell
git init
git add .
git commit -m "Initial standalone Salesforce agentic QA foundation"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/SalesforceAgenticQA.git
git push -u origin main
```
Create the remote GitHub repository first; the placeholder URL must be replaced. `.gitignore` excludes secrets, `.state` and run reports.

## Audit and implementation status
See [feature matrix](docs/FEATURE_MATRIX.md), [architecture](docs/ARCHITECTURE.md), [roadmap](docs/IMPLEMENTATION_ROADMAP.md) and [Windows setup](docs/LOCAL_SETUP.md). Discovery now validates API responses, records unknown coverage and saves integrity-checked snapshot versions. Data proposals propagate blocked dependencies and reject ambiguous required reference targets. All Salesforce POSTs are disabled regardless of environment flags. Playwright emits JUnit alongside HTML.

Use `npm.cmd` and `npx.cmd` if PowerShell blocks the `.ps1` launchers. Live org behavior remains unverified.

## Next steps
See `docs/IMPLEMENTATION.md` for the phased roadmap and `memory/FRAMEWORK_KNOWLEDGE.md` for verified lessons.
