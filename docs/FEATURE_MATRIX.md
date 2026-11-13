# Feature matrix

## Current continuation — 2026-11-13

The table below supersedes the first-increment inventory later in this file. Verified means the described offline behavior executed; it does not mean live Salesforce or remote Chroma validation. Full master-prompt completion remains outstanding.

| Priority / capability | Status | Evidence and practical limit |
|---|---|---|
| P0 Windows/headless foundation | Verified | typecheck, demo, 29 unit tests, 3 browser tests including generated test |
| Describe, schema dependencies, snapshot versions/diffs | Verified | Existing discovery/snapshot/data regressions preserved |
| Tooling ApexClass, FlowDefinition, ValidationRule discovery | Partially implemented | retrieval-api.test.ts; bounded first 200 rows; denied areas unknown |
| Metadata API named component reads | Partially implemented | metadata.test.ts; SOAP readMetadata only; no live read executed |
| Permission/sharing analysis and complete automation dependency map | Not implemented | No claim that API access proves business requirements |
| JWT setup and bounded SOQL state verification | Partially implemented | existing JWT helper; retrieval-api.test.ts; live auth/async org behavior unverified |
| Reviewed recipe registry | Verified | recipes.test.ts; source/field/type gates |
| Sandbox creates and owned-record deletion | Partially implemented | client.mutate + DataExecution; journal/approval/ownership tests; no live write executed |
| Hybrid UI/business-service factories and automatic reverse cleanup | Not implemented | Current executor handles explicit API operations only |
| Secure browser session creation | Partially implemented | headless authenticated callback + independent persona verifier; no live org session test |
| Durable LangGraph checkpoints / human interrupt | Verified | platform.test.ts; SQLite saver closed/reopened, graph resumed with named approval; single writer only |
| MCP permission-aware operations | Partially implemented | schema discovery by default; optional execution only by operator-controlled local approval ID; mcp-approval.test.ts |
| Embeddings/Chroma ingestion and scoped retrieval | Partially implemented | retrieval-api.test.ts; redacted chunk upsert and org/permission/version/verified filters; remote service unverified |
| Structured execution history | Verified | SQLite reporter stored actual 3 browser outcomes; duplicate/history tests |
| P1 bounded Playwright MCP workflow observation | Partially implemented | navigation/snapshot budget tests; no action exploration or live Lightning/Experience Cloud observation |
| Story + verified-workflow test generation | Partially implemented | reviewed workflow DSL; criteria-linked code generated and executed locally; cannot infer missing story workflows |
| Change/component impact and risk prioritization | Partially implemented | diff-path extraction, component/criticality/failure scoring, mandatory suite budget tests; no Salesforce dependency resolver |
| Failure investigation/classification | Partially implemented | deterministic evidence-linked hypotheses, never confirmed root cause automatically |
| Self-healing | Partially implemented | assertion-preserving repair proposals require reviewer/evidence/passing rerun; no automatic code patching |
| Historical defects/verified learning | Partially implemented | SQLite lessons require passing regression run; no semantic defect correlation |
| P2 bounded exploration | Partially implemented | page/time/origin budgets; navigation/observation only; no autonomous state-transition exploration |
| Defect reports | Partially implemented | proposed structured reports link expected/observed/evidence and hypothesis |
| Gap identification | Partially implemented | acceptance criteria with no mapped cases; no semantic coverage analysis |
| HTML/JUnit/history metrics | Verified | 3 real browser outcomes, durations/status and unstable-test calculation |
| Reporting Labs integration | Blocked | Exact provider/API/authentication contract not supplied; no invented integration |
| AI quality evaluation dashboards | Not implemented | Deterministic validation exists; model evaluation/dashboard not built |
| Live Salesforce and remote vector integration | Blocked | Authorized credentials, reviewed recipes/personas, model/embedding and remote Chroma required |

## Historical first-increment inventory

Status meanings: **Implemented** means working code exists; **Verified** means the stated local behavior ran successfully; **Partially implemented** means a material subset exists; **Not implemented** means no working implementation; **Blocked** identifies unavailable external verification. Installed packages alone do not establish implementation.

| Capability | Status | Evidence or remaining work |
|---|---|---|
| Windows TypeScript/Node local foundation | Verified | Baseline typecheck and local execution |
| Headless Playwright execution | Verified | Two local fixture tests; no live org |
| JWT bearer helper | Partially implemented | Host validation, redirects rejected; live authentication unverified |
| Browser StorageState configuration | Partially implemented | Local path supported; bootstrap/persona validation absent |
| Explicit bounded object/field discovery | Partially implemented | Zod Describe reader; live org unverified |
| Active picklists and required API fields | Partially implemented | Describe only; record-type constraints unknown |
| Lookup/master-detail dependencies | Partially implemented | Required reference graph; relationship semantics incomplete |
| Record types and scoped picklists | Not implemented | Unknown coverage |
| Validation rules, Flows and Apex metadata | Not implemented | Unknown coverage |
| Permissions and sharing constraints | Not implemented | Unknown coverage |
| Versioned org snapshots and source provenance | Implemented | SHA-256 storage, integrity read, source/coverage |
| Org snapshot differences | Implemented | Added/removed/changed object schema comparison |
| Dependency-aware creation proposals | Partially implemented | Ordering, ambiguous/missing/blocked parents and cycles |
| Synthetic typed values and factories | Not implemented | Reviewed recipes required |
| Source-bound reviewed recipe registry | Implemented | Validates required fields, discovered types/targets/picklists; proposal only |
| Approved API creates and business services | Not implemented | All POSTs blocked |
| Hybrid API/UI setup | Not implemented | No approved workflow adapters |
| Run record registry and idempotency | Not implemented | Needed before any writes |
| Cleanup/retained records and isolation | Not implemented | Needed before any writes |
| SOQL backend and async state verification | Not implemented | No assertion service |
| Production write/financial restrictions | Partially implemented | API POSTs denied; future adapters need review |
| Lightning/Experience Cloud exploration | Not implemented | Authorized sessions/workflows absent |
| Playwright MCP browser command | Partially implemented | Headless launcher only |
| Workflow/locator observations and UI drift | Not implemented | Evidence capture and reviewed navigation needed |
| Custom Salesforce MCP server | Partially implemented | Stdio bounded Describe tool; no write tools |
| LangGraph orchestrator | Partially implemented | Validated planning graph, decision citations, review-required result |
| Durable checkpoints and resume | Partially implemented | In-process MemorySaver checkpoint inspection only; no durable resume |
| Approval interrupts/retry side-effect protection | Not implemented | No side effects currently enabled |
| Story/criteria validation and draft scenarios | Partially implemented | Deterministic criteria mapping; no inferred rules |
| Positive/negative/boundary planning and preconditions | Not implemented | Requires verified workflow evidence |
| Requirements traceability | Partially implemented | Draft scenario evidence cites criterion IDs |
| Playwright generation/code validation | Not implemented | Fixture specs are handwritten |
| Reusable fixtures/page objects/parameterization | Not implemented | No live org framework fixtures |
| Git change and component impact analysis | Not implemented | No risk selection engine |
| Configurable risk scoring and mandatory suites | Not implemented | No risk selection engine |
| Deterministic execution service | Partially implemented | Playwright CLI only; no selected-suite service |
| Screenshots, traces, HTML and JUnit | Implemented | Playwright reporters and failure capture configured |
| Reporting Labs integration | Not implemented | Provider/configuration not supplied |
| Local evidence JSON storage | Partially implemented | Source-linked add/read; no trust promotion workflow |
| Structured execution history database | Not implemented | JSON evidence is not a database |
| Redacted normalized ingestion/chunking | Not implemented | No ingestion pipeline |
| Embeddings and Chroma retrieval | Not implemented | Client dependency installed only |
| Source version/org/permission retrieval filters | Not implemented | No semantic retrieval pipeline |
| Failure classification/root-cause hypotheses | Not implemented | No investigator implementation |
| Evidence-based defect reporting/correlation | Not implemented | No defect workflow |
| Reviewed self-healing/intent validation | Not implemented | No repair mutation path |
| Verified learning and regression recommendations | Not implemented | Engineering memory only |
| Bounded autonomous exploration | Not implemented | No action executor or budgets |
| Coverage gap detection | Not implemented | No coverage model |
| Trends/flakiness/advanced analytics | Not implemented | No structured history |
| TypeScript AI evaluation foundation/dashboard | Not implemented | No model evaluation harness |
| Knowledge effectiveness metrics | Not implemented | No retrieval evaluation |
| CLI Mode A discovery | Partially implemented | Bounded Describe/fixture only |
| CLI Mode B story to test | Partially implemented | Draft plan/data proposal only |
| CLI Modes C/D/E/F | Not implemented | Regression/exploration/investigation/maintenance absent |
| Offline mock fixtures and demo | Verified | Baseline demo and tests |
| Live sandbox integration verification | Blocked | Authorized credentials/session/recipes not provided |
| Complete P0/P1/P2 master definition of done | Not implemented | Substantial roadmap remains |
