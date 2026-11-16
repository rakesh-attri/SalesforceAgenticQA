# SalesforceAgenticQA

Salesforce-specialized QA framework: **Specs In → Tests Out → Failure Intelligence → Verified Learning**. Windows, TypeScript and headless Playwright; all 15 responsibilities and the complete P0/P1/P2 roadmap remain in scope.

The [shared Lightning session architecture](docs/LIGHTNING_SESSION_ARCHITECTURE.md) separates platform initialization, read-only observation/discovery, approved agent interactions and business mutations. Direct Playwright, generated tests and the restricted Playwright MCP gateway share existing verification and network guards. Engine versions and reviewed rendering contracts are hash-bound. Unknown Aura operations stay blocked.

[Visual browser debugging](docs/BROWSER_VISUAL_DEBUGGING.md) adds approved, bounded local masked screenshots, finite readiness/error diagnostics, generated-test attachments and a local HTML preview. The synthetic demo needs no Salesforce credentials. Real visual observation remains gated by fresh native session identity and exact approval.

[Lightning compatibility intelligence](docs/LIGHTNING_COMPATIBILITY.md) compares saved browser evidence, maintains versioned platform-contract reviews and generates inactive policy recommendations plus a local compatibility report. It grants no browser or data permissions.

**Live milestone is incomplete:** the separately authorized installed-Chrome normal-network comparison displayed real Account content and a unique verified name. The same Chrome with framework guards failed to render visible record controls. See [local browser comparison](docs/LOCAL_BROWSER_COMPARISON.md) for actual A/B evidence, local previews and remaining contract/stability review. Both one-session grants are consumed; no passing guarded Account/Contact lifecycle is claimed.

Use the [cumulative feature matrix](docs/FEATURE_MATRIX.md), [implementation report](docs/IMPLEMENTATION_REPORT.md) and [agent audit](docs/CAPABILITY_AUDIT.md) for exact validation and remaining gaps. Earlier README progress notes are preserved in [historical notes](docs/HISTORICAL_README_NOTES.md).

**Standalone**, local-first Salesforce Agentic QA framework. No dependency on any earlier repository. Designed for Windows, Node 22+, TypeScript and headless Playwright.

## Current state

The framework includes versioned Salesforce discovery/component dependencies, reviewed semantic knowledge, durable LangGraph approvals, dependency-aware hybrid data plans, sandbox/dedicated factories and owned cleanup, source-linked test generation, risk/failure intelligence, guarded browser execution and local reportingLabs. Its complete autonomous workflow breadth remains partial.

Earlier live evidence covers Salesforce JWT/metadata, Gemini chat and gemini-embedding-001, approved persisted local semantic retrieval and bounded dedicated Account/Contact setup/SOQL/cleanup. It does not establish fresh service health or complete Lightning rendering. Normal Production restrictions are unchanged; dedicated-org grants are separate and never arise from an alias or IsSandbox flag.

The new managed service and actual installed MCP gateway are tested with mocked Salesforce and real local headless browsers. Normal baseline imports require exact native document/build evidence and named capture provenance; importing one grants nothing. New managed data runs require prior live rendered-Account evidence plus the existing independent data/UI/session approvals.

Run `npm.cmd run platform -- demo-learning` for the existing offline Specs → generated tests → execution → failure/learning → future selection demonstration. Model output cannot approve operations or replace reviewed assertions. Setup and operator commands are in [LOCAL_SETUP.md](docs/LOCAL_SETUP.md) and the shared architecture guide.

## Requirements
- Windows 10/11 (PowerShell), Node.js 22+, Git optional, VS Code / Codex optional.
- Internet access for `npm install` and `npm.cmd run browsers:install`.
- No Python and no Docker for this starter.

## Install and run on Windows
```powershell
Expand-Archive .\SalesforceAgenticQA.zip -DestinationPath $HOME\Documents
cd $HOME\Documents\SalesforceAgenticQA
npm install
npm.cmd run browsers:install
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
