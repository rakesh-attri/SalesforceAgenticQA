# Specs in, tests out

## Run the integrated demonstration

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run typecheck
npm.cmd run unit
npm.cmd run platform -- demo-learning
npm.cmd run demo
npm.cmd test
```

`demo-learning` starts an isolated loopback fixture on a free port. It builds a reviewed structured requirement and workflow, generates TypeScript, runs Playwright headlessly, captures an intentional failing assertion with screenshot and trace, fixes the fixture handler, and reruns the unchanged assertion plus an independent HTTP state check. A named fixture review links the failed evidence, cause, fix and passing regression. A later plan retrieves the verified defect and marks its regression mandatory. The CLI fails if any demonstration invariant fails. The seeded failure is evidence of the exercise, not a passing application test or a Salesforce defect.

The CLI prints `artifacts/learning-<UUID>/manifest.json`. That manifest links the failing report, corrected regression report and future plan. Each report has JSON and HTML; execution directories include generated source, Playwright JSON, HTML, JUnit, trace and screenshots. Runtime evidence is ignored by Git. SQLite history and verified scoped knowledge persist in `.state/history.sqlite`.

## Ingest a specification

```powershell
npm.cmd run platform -- spec-ingest fixtures/specs/status.json
npm.cmd run platform -- spec-ingest path/to/requirements.yaml
npm.cmd run platform -- spec-ingest path/to/requirements.docx
npm.cmd run platform -- spec-ingest path/to/requirements.pdf
```

Supported local inputs: JSON/YAML stories or OpenAPI documents; Markdown/text with explicit `AC1: ...` lines; PDF text and DOCX paragraphs using the same AC convention. Text headers support `ID:`, `Title:`, `Objects:` and `Persona:`. Optional `[positive]`, `[negative]` or `[boundary]` AC tags preserve authored intent. Generic prose is retained as source material but never converted into invented expected outcomes. PDFs must contain extractable text; OCR and layout/table interpretation are not implemented. OpenAPI import preserves declared method/path/status contracts, does not resolve external references, and does not infer UI workflows. Existing test cases must be normalized to this explicit criterion structure; arbitrary test scripts are not ingested as executable requirements. Jira/Azure DevOps connectors are not implemented.

`spec-ingest` writes `artifacts/spec-ingested.json` with a SHA-256 source version. Only structured criteria with explicit `expectedText` can bind to an executable text assertion. Missing negative/boundary requirements become questions, not guessed test outcomes.

## Plan or execute a reviewed bundle

`npm.cmd run platform -- spec-run BUNDLE.json` accepts `PipelineInputSchema` from `src/agents/pipeline.ts`. Use `specPath` to ingest a file automatically, or supply normalized `spec`. Supply `org`, its exact `snapshotVersion(org)` as `orgVersion`, permission scope, allowed origins, a unique run ID, and criterion-to-reviewed-workflow mappings. Mappings must bind exact criterion IDs and assertion text; data-dependent workflows need reviewed precondition evidence. Unknown objects or prerequisites block affected scenarios.

Execution is optional. Without `executionApproval`, output explicitly says `not-executed`. To approve a reviewed bundle, use `executionHash(input)` and a named reviewer in `executionApproval`. Changing any reviewed input invalidates that hash. Previously executed run IDs cannot replay. The integrated execution coordinator currently permits only fixture snapshots and loopback origins. Live sandbox test execution remains separate until verified session/data gates are connected. This restriction does not affect the existing guarded Salesforce data services.

Pipeline: Spec Analyst → Knowledge Agent → Planner/Reviewer/Risk/Data Proposal → Generator → Execution Coordinator → Investigator → Reports. Reviewed requirements and workflows remain inputs; an LLM is not required for the deterministic offline path. Generated TypeScript receives syntax validation and actual Playwright execution; it is not a general-purpose validator for arbitrary user code.

## Persistent knowledge and learning

`knowledge-index FILE.json` validates `KnowledgeSchema`: identity/version, org, permission, kind, trust status, text, evidence, test IDs, capture time and reviewer. Verified knowledge requires named review. New versions deprecate older versions; changed text cannot reuse an existing version. Planner/investigator retrieval excludes observed, proposed and deprecated facts and isolates org/permission scopes.

SQLite is the operational source of truth. Offline retrieval is lexical. When embedding configuration is present, the index stores embeddings and combines cosine similarity with lexical overlap. Configured Chroma mirrors reviewed verified sources using the existing adapter; external Chroma-only records are not automatically imported into the trusted SQLite catalog. No vector workflow retrains a model. Source text still requires privacy review: built-in redaction is not complete DLP.

The pipeline binds execution approvals to the exact org snapshot and knowledge freshness to a stable schema-content fingerprint. Actual schema changes conservatively deprecate schema-dependent org/workflow/lesson/defect knowledge for that scope; a timestamp-only refresh does not. Affected evidence must be refreshed and reviewed. Requirement documents are not silently rewritten. `retrievalMetrics` provides deterministic precision/recall fixtures. Reports contain groundedness, execution coverage and cross-run failure/mixed-outcome metrics; these are deterministic checks, not an LLM judge or proof of flakiness.

`confirmDefect` requires recorded failing evidence, explicit reviewer/root cause/fix and an actual passing regression run before storing verified knowledge. Investigations retrieve previous defects first, keep root causes as hypotheses, map API/state/evidence and parse trace error events. Fingerprints propose duplicate candidates. Screenshots are linked, not visually diagnosed by a model.

## Locator repair

`heal-workflow REVIEW.json` validates `HealingSchema`. The supplied workflow hash and generated source must match the recorded failing test, and review must cite captured failure evidence. Only a typed locator is changed; actions, values, criterion and assertion text remain intact. A headless fixture rerun must pass before the candidate is returned. It does not edit the original test or infer an approved live locator. The accepted candidate includes hashes, reviewer and rerun evidence for subsequent review.

## Next dependency and external prerequisites

Next engineering work: connect hybrid setup/verification/cleanup hooks and authenticated session approval into the spec graph before enabling live execution; add stable org workflow/record-type permission discovery and live adapter contracts. Continue remote-vector integration/evaluation and richer bounded action exploration afterwards. Reporting Labs needs an identified provider/API contract. Model-quality evaluation, OCR/layout interpretation, connectors and unattended autonomous actions remain unfinished engineering. Sandbox/session/model/Chroma credentials and reviewed business recipes are external prerequisites, not substitutes for those implementations.
