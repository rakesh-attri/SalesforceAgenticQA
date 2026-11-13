# SalesforceAgenticQA

**Standalone**, local-first Salesforce Agentic QA starter. No dependency on any earlier repository. Designed for Windows, Node 22+, TypeScript and headless Playwright.

## Current state
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
