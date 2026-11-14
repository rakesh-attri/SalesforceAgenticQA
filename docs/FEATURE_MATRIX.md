# Current capability matrix

This is the reconciled source of truth for the original P0/P1/P2 master request and all later specs-to-tests requirements. Historical tables are archived in HISTORICAL_FEATURE_MATRIX.md and do not override this file. Statuses: Implemented = working code; Verified = stated automated scope executed; Partially implemented = incomplete breadth or unvalidated integration; Not implemented = missing engineering; Blocked = named external prerequisite. Offline verification never establishes live Salesforce behavior.

2026-11-14 authentication diagnostic verification: safe OAuth code/description classification and credential-withholding regressions passed. Read-only `discover:live` authenticated and discovered two configured objects with local credentials; no browser session, record mutation or broader live workflow was verified. Earlier `invalid_request` indicated the refresh_token scope/app installation/preauthorization requirement. See IMPLEMENTATION_REPORT.md for exact checks; prior statements of no live authentication apply to earlier increments.

Latest org-intelligence run: OAuth/org identity succeeded but **IsSandbox=false**. Explicitly authorized metadata-only inspection read 1,088 catalog entries, selected Account/Contact from story terms, described 108 fields and two record-type info entries, and queried bounded Apex/Flow/permission/metadata inventories. This is **live Salesforce read-only verification, not sandbox/UI/write verification**. Raw sources remain local; see ORG_INTELLIGENCE.md for exact counts, partial/unknown areas and plans.

## Foundation and live readiness

| Capability | Status | Evidence / remaining boundary |
|---|---|---|
| Standalone Windows/TypeScript/headless execution | Verified | existing typecheck/demo/browser suites retained; no Python/Docker dependency |
| JWT API access and fresh OAuth/org identity | Verified | actual userinfo/Organization identity executed; configured org reports IsSandbox=false; no sandbox assumption |
| Story-driven accessible object resolution | Verified | catalog API-name/label matching, explicit-name checks, persona exclusion and budgets tested; live Account/Contact selected without SFQA_OBJECTS; relevance remains proposed |
| Describe objects/fields/API-required fields/picklists/relationships | Verified | discovery tests; record-type rules and business requirements remain unknown |
| Tooling Apex/FlowDefinition/validation rule reads | Partially implemented | live bounded reads: classes partial, triggers/flow definitions observed, selected validation query zero rows; behavior/dependency breadth incomplete |
| Metadata SOAP named reads | Partially implemented | live CustomObject read executed; raw components retained locally pending interpretation/review |
| Describe record-type/relationship intelligence | Verified | retained extended fields, record-type infos and child/parent relationships; actual two-object metadata read |
| Permission inventories and scoped record-type query | Partially implemented | live ObjectPermissions/FieldPermissions/PermissionSetAssignment reads; field limit partial; record-type query zero rows; not effective authorization |
| Record-type scoped picklists, effective sharing/dependency graph | Not implemented | dependency query unknown; permission-set muting/sharing/UI applicability and deep Flow/Apex analysis remain unknown |
| Snapshot provenance, content versions/diffs/freshness | Verified | integrity, stable schema fingerprint and stale knowledge tests |
| Dependency-aware data proposals/reviewed recipes | Verified | required/ambiguous/cyclic/blocked dependencies and recipe field/type/source gates |
| Live story→metadata→test/data plan | Verified | three draft scenarios, API prerequisites and proposed Contact→Account dependency; no executable UI steps or writes authorized |
| Hybrid API/UI/business factory lifecycle | Partially implemented | approved adapter dispatch, references, independent verification, reverse cleanup integrated in graph; built-in live CLI API adapter only; org UI/services require reviewed adapters |
| Setup failure cleanup recovery | Verified | record journal precedes verification; graph cleans known owned rows after verification failure; unknown effects remain manual reconciliation |
| Retry/idempotency/record ownership/retention | Verified | pending mutation/run journals, cross-run denial, reverse cleanup; retain requires named review; no automatic replay of uncertain effects |
| SOQL independent and async state verification | Partially implemented | bounded polling service and mock assertions; live org async behavior unverified |
| Graph data setup and verified record references | Verified | readiness-pipeline test exercises actual browser /record/{{record:Account}} binding after setup/verification |
| Browser session creation and persona verification | Partially implemented | headless authenticator API, private content-hashed receipts, fresh probe and TTL gates; no live persona login executed |
| Sandbox execution gates in spec graph | Verified | runtime requires explicit org/user/persona, fresh sandbox identity, approved HTTPS origins and fresh state-bound browser probe; production denied in mocks |
| Authenticated state in generated execution | Verified | real cookie-authenticated browser fixture; state path supplied to Playwright, cookies not checkpointed |
| CLI sandbox policy/session/runtime wiring | Implemented | session-verify and spec-run use ignored operator policy; live run needs credentials, receipts and observed probe selectors |
| Durable LangGraph approval/resume | Partially implemented | SQLite planning interrupts/restart verified; spec lifecycle reserves pending runs, deliberately denies replay rather than attempting automatic recovery |
| Custom Salesforce MCP/read/write boundaries | Partially implemented | bounded schema tool; local approval-ID-only operations; further metadata/verification tools not all exposed |
| Playwright MCP integration | Partially implemented | headless launcher and bounded navigation/snapshot client; action exploration not implemented |

## Specs in → tests out and intelligence

| Capability | Status | Evidence / remaining boundary |
|---|---|---|
| JSON/YAML/Markdown/text/PDF/DOCX/OpenAPI input | Verified | actual parser tests; explicit criteria only; no OCR/layout semantics or external refs |
| Jira/Azure DevOps / arbitrary existing test imports | Not implemented | normalized explicit criteria supported; connector/import engineering and credentials required |
| Requirement analysis and persona/object extraction | Partially implemented | explicit structured/header fields; unstructured business-rule interpretation not automated |
| Positive/negative/boundary scenarios | Partially implemented | authored kinds retained; missing expected behavior becomes questions rather than invented scenarios |
| Reviewed story→workflow→generated assertions | Verified | exact criterion/expectedText mapping, source citations, blocked prerequisites and schema/hash gates |
| LangGraph connected pipeline | Verified | ingestion/context/planning/review/risk/data/generation/session/setup/execution/investigation/report lifecycle |
| Gemini chat and role-level reasoning hooks | Verified | mocked generateContent, Zod validation/citations; Spec Analyst/Planner/Generator/Investigator phases emit proposals; other roles via CLI; no live model result validated |
| Model provider config, privacy and request budgets | Verified | distinct chat/embedding configuration, static diagnostics, timeout/429/backoff/pacing/redaction tests; developer API only, no Vertex integration |
| General TypeScript generation validation | Partially implemented | constrained DSL syntax + actual execution; arbitrary user source semantic validation not implemented |
| Backend API assertions | Verified | generated independent HTTP expectations; no assumption that JWT authenticates browser/request context |
| Change/risk/mandatory regression selection | Partially implemented | deterministic component/history/lesson selection; full Salesforce component impact map missing |
| Learning influences future planning | Verified | seeded failure→reviewed fix→reopened SQLite→mandatory future regression |
| Failure trace/screenshot/API/state mapping | Partially implemented | bounded trace events, screenshots linked, explicit API/state data; no screenshot visual diagnosis or exhaustive trace causality |
| Lifecycle investigations | Verified | session/setup/cleanup errors produce evidence-linked hypotheses without inventing executed test failures |
| Defect review/deduplication/root cause/fix knowledge | Partially implemented | scoped fingerprints, duplicate candidates, actual evidence and named review gates; semantic adjudication remains reviewed |
| Lifecycle-aware verified learning | Verified | passing test from failed cleanup lifecycle cannot confirm a fix; same reviewed causes idempotent; conflicts denied |
| Locator healing | Partially implemented | typed locator-only candidate, failing source/hash binding, unchanged assertions, reviewed fixture rerun; no unattended live repairs |
| Autonomous bounded exploration | Partially implemented | page/time/origin navigation budgets; richer action/state-transition exploration missing |
| Gap analysis | Partially implemented | criterion mappings and missing behavior kinds; full semantic business coverage missing |

## Knowledge, evidence and reporting

| Capability | Status | Evidence / remaining boundary |
|---|---|---|
| Operational SQLite history/trust/source isolation | Verified | run/test/lesson/knowledge scope/version tests; all runtime databases ignored |
| Redaction/normalization/chunking | Partially implemented | limited redaction + chunks; source privacy review still required; no complete DLP guarantee |
| Embeddings + persistent local lexical/vector index | Partially implemented | injected embeddings and cosine/lexical scoring; external provider not exercised |
| Separate Gemini embedding adapter | Verified | mocked batchEmbedContents, batch order/count/dimensions, existing Embed contract preserved; live embedding provider not configured |
| Safe model connectivity command | Implemented | actual command reports chat model configuration failure and embedding not-configured; success requires real valid response, not key presence |
| Chroma upsert and real retrieval flow | Verified | actual JS SDK over local mock HTTP server: auth, preflight, collection, upsert, query; returned hits affect ranking only for current reviewed catalog sources |
| Remote ranking trust/version isolation | Verified | wrong org/stale/unreviewed/unknown catalog hits cannot elevate knowledge; configured failures are surfaced |
| External Chroma-only source import / Cloud tenancy | Not implemented | explicit local review/catalog ingestion required; Cloud tenant/database CLI configuration incomplete |
| Stale schema/lesson invalidation | Verified | schema-content changes deprecate dependent facts; capture-time-only changes do not |
| Source-linked plan/investigation citations | Verified | criteria/version/workflow/verified-defect citations in reports |
| Org intelligence→reviewed knowledge indexing | Verified | versioned observed local catalog by default; explicit reviewer required for trusted retrieval; tested planning/data/index links; external embedding upload opt-in |
| Playwright HTML/JUnit/JSON/screenshots/traces | Verified | actual generated/local browser reports; lifecycle status reported independently from test rows |
| Quality HTML/readiness/trends/retrieval metrics | Verified | deterministic grounding/execution/mixed-outcome metrics; mixed outcomes do not prove flakiness |
| Full model evaluation/dashboard/knowledge effectiveness | Not implemented | deterministic metrics are not a model judge, retraining or comprehensive AI-quality evaluation |
| Reporting Labs | Blocked | specific provider/API/auth contract not supplied; no invented integration |
| 15-agent ownership inventory | Implemented | CAPABILITY_AUDIT.md defines inputs/outputs/tools/evidence; partial roles remain explicitly identified |
| Live sandbox workflows and external vector/model verification | Blocked | JWT/Describe succeeded for two objects; live browser/data workflows still need reviewed recipes/persona sessions; Gemini check is blocked at model configuration and embedding provider is disabled; external Chroma/model responses unverified |
| Complete original and later definition of done | Not implemented | remaining engineering above remains in scope |

## Next dependency

Latest completed checks (org-intelligence increment, 2026-11-14): typecheck passed, **69 unit/integration tests passed**, original demo passed and **3 headless browser tests passed**. The new five tests cover story resolution, graph/data/RAG links, metadata coverage and non-sandbox browser blocking. Actual read-only identity/catalog/metadata inspection succeeded against the configured **non-sandbox** org. Gemini check still reports chat model configuration failure and embedding not-configured. Live UI/data workflows and external vector/model responses remain unverified.

Validate the configured API/session/data runtime in an authorized sandbox using reviewed nonfinancial workflows, then extend permission/record-type discovery and production-quality org UI/service adapters. Add explicit reviewed reconciliation/recovery for pending runs; do not silently replay them. Continue autonomous action exploration, semantic source import, connectors, model evaluation and provider-specific reporting afterwards. External credentials do not replace the unfinished engineering listed here.
