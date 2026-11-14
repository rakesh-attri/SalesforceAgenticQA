# Current capability matrix

This is the reconciled source of truth for the original P0/P1/P2 master request and all later specs-to-tests requirements. Historical tables are archived in HISTORICAL_FEATURE_MATRIX.md and do not override this file. Statuses: Implemented = working code; Verified = stated automated scope executed; Partially implemented = incomplete breadth or unvalidated integration; Not implemented = missing engineering; Blocked = named external prerequisite. Offline verification never establishes live Salesforce behavior.

Current deep-intelligence milestone (2026-11-14): bounded live Production reads returned 195 dependency rows, 493 Apex classes, 17 triggers, 29 LWC bundles, 14 Flow versions and three exact-version Flow metadata records. The ID-isolated graph has 909 nodes/365 edges with 40 unresolved/partial notes. Two current-user permission observations succeeded; no permission groups were assigned, so group/muting evidence is offline. Reviewed ingestion completed five facts in one request and repeated publication used zero requests. Live two-query MRR/nDCG=1, recall@3=1 and precision@3=0.333; five live Gemini roles proposed three source-grounded scenarios. Final scope remains bounded: no Production UI/writes, no external Chroma or actual Salesforce defect verification. See DEEP_INTELLIGENCE.md. Earlier dated increment evidence below remains historical.

Latest environment/RAG increment (2026-11-14): configured Production is an intentional read-only QA target. Named operator Rakesh Attri approved filtered structural metadata; exact org/OAuth persona/origin policy was exercised by live discovery. Gemini chat and embeddings both passed actual connectivity checks; five approved fields were embedded/persisted/retrieved across process restart and used by five real reasoning roles to propose three scenarios. Bulk 108-field embedding encountered HTTP 429 and is not claimed complete. Two exact-record-type UI API picklist reads also succeeded. No live browser, record mutation, financial action or external Chroma service was exercised. Earlier model-configuration and blanket non-sandbox browser-block descriptions below are historical; current boundaries are explicit modes and the restricted observer. See ENVIRONMENT_QA.md.

2026-11-14 authentication diagnostic verification: safe OAuth code/description classification and credential-withholding regressions passed. Read-only `discover:live` authenticated and discovered two configured objects with local credentials; no browser session, record mutation or broader live workflow was verified. Earlier `invalid_request` indicated the refresh_token scope/app installation/preauthorization requirement. See IMPLEMENTATION_REPORT.md for exact checks; prior statements of no live authentication apply to earlier increments.

Latest org-intelligence run: OAuth/org identity succeeded but **IsSandbox=false**. Explicitly authorized metadata-only inspection read 1,088 catalog entries, selected Account/Contact from story terms, described 108 fields and two record-type info entries, and queried bounded Apex/Flow/permission/metadata inventories. This is **live Salesforce read-only verification, not sandbox/UI/write verification**. Raw sources remain local; see ORG_INTELLIGENCE.md for exact counts, partial/unknown areas and plans.

## Foundation and live readiness

| Capability | Status | Evidence / remaining boundary |
|---|---|---|
| Standalone Windows/TypeScript/headless execution | Verified | existing typecheck/demo/browser suites retained; no Python/Docker dependency |
| JWT API access and fresh OAuth/org identity | Verified | actual userinfo/Organization identity executed; configured org reports IsSandbox=false; no sandbox assumption |
| Story-driven accessible object resolution | Verified | catalog API-name/label matching, explicit-name checks, persona exclusion and budgets tested; live Account/Contact selected without SFQA_OBJECTS; relevance remains proposed |
| Describe objects/fields/API-required fields/picklists/relationships | Verified | discovery tests; record-type rules and business requirements remain unknown |
| Tooling Apex/FlowDefinition/validation rule reads | Partially implemented | live 493 classes/17 triggers/14 Flow versions, three exact-version metadata bodies; conditions/actions/connectors retained; validation query zero rows; runtime/dynamic/source breadth unknown |
| Metadata SOAP named reads | Partially implemented | live CustomObject/SharingRules reads; bounded PermissionSetGroup/MutingPermissionSet read paths exercised offline; raw business metadata stays local |
| Describe record-type/relationship intelligence | Verified | retained extended fields, record-type infos and child/parent relationships; actual two-object metadata read |
| Permission inventories and scoped record-type query | Partially implemented | profile/direct assignment/group/member/muting paths and group-local grant logic; two actual current-user UI API operation observations; group/muting offline only; field inventory partial; licenses/session/record-level access unknown |
| Record-type scoped picklists, effective sharing/dependency graph | Partially implemented | two scoped picklist reads retained; 195 real dependency rows and source graph, current-user API flags and declared sharing metadata; effective record sharing/dynamic behavior remain unknown |
| Bounded metadata pagination/source evidence | Verified | same-API cursor/loop/record/page/cap checks, sources and unknown handling tested; live bounded APIs executed, multi-page continuation verified offline |
| Source-backed component graph and impact traversal | Verified | stable metadata IDs isolate namespaces; declared Apex/LWC/Flow/object/field/validation/sharing/group edges, exact-source evidence and bounded reverse impact traversal; current org/version binding feeds optional planner risk boost; graph coverage remains partial |
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
| SANDBOX_QA environment capability policy | Verified | exact environment schema/hash/expiry checks supplement existing factory/session approvals; configured UI/data capabilities checked; production writes still denied |
| PRODUCTION_READ_ONLY_QA API policy | Verified | exact org ID, OAuth user/persona, origins, capabilities and named operator approval enforced at connection/read boundaries; actual metadata discovery executed under policy |
| PRODUCTION_READ_ONLY_QA browser observation | Partially implemented | strict navigation/read DSL, JS/service-worker/download/WebSocket restrictions, exact GET/HEAD documents/static assets, source assertions and graph history tested; actual synthetic headless form/unknown-GET blocking. Live persona/session/static identity view still required; full Lightning/Experience Cloud unsupported under strict no-JS boundary |
| Restricted production browser session verification | Implemented | existing state imported only from .auth; same observer verifies DOM identity before state-hashed bounded receipt; general authenticators/probe callbacks now sandbox-gated. Full production session issuance not live-validated |
| PRODUCTION_CONTROLLED_QA review interface | Verified | typed policy definitions and local review artifact only; all execution denied, no production-write switch |
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
| Requirement analysis and persona/object extraction | Partially implemented | BDD/bullets/actor-intent spans, catalog-backed object proposals and requirement review; exact source quotes enforced; unrestricted semantic/business-rule interpretation remains reviewed |
| Positive/negative/boundary scenarios | Partially implemented | authored kinds retained; missing expected behavior becomes questions rather than invented scenarios |
| Integration scenarios and requirement gaps | Verified | integration kind supported; absent category/outcome becomes review question; no invented expected results/actions; broad semantic coverage remains partial |
| Intelligent spec planning/review/traceability | Verified | reviewed local RAG handoff, historical regression/data proposals, exact outcome/workflow/source prerequisites, JSON/HTML report; reviewed generated LWC TypeScript actually executed against synthetic fixture; live story remains blocked with zero invented files |
| Reviewed story→workflow→generated assertions | Verified | exact criterion/expectedText mapping, source citations, blocked prerequisites and schema/hash gates |
| LangGraph connected pipeline | Verified | ingestion/context/planning/review/risk/data/generation/session/setup/execution/investigation/report lifecycle |
| Gemini chat and role-level reasoning hooks | Verified | existing phase-level mocked integration preserved; actual reviewed retrieval supplied to Spec Analyst/Planner/Generator/Investigator/Learning; source-ID-only outputs and exact story outcomes; not live executable workflow generation |
| Model provider config, privacy and request budgets | Verified | distinct chat/embedding configuration, static diagnostics, timeout/429/backoff/pacing/redaction tests; developer API only, no Vertex integration |
| General TypeScript generation validation | Partially implemented | constrained DSL syntax + actual execution; arbitrary user source semantic validation not implemented |
| Backend API assertions | Verified | generated independent HTTP expectations; no assumption that JWT authenticates browser/request context |
| Change/risk/mandatory regression selection | Partially implemented | deterministic history/lesson risk plus optional org/version-bound graph dependency impact; full runtime/business-process impact still missing |
| Learning influences future planning | Verified | real synthetic browser failure→unchanged-assertion passing regression→reviewed cause→future intelligent plan; same history without knowledge score 35/mandatory=false, with knowledge 75/mandatory=true |
| Failure trace/screenshot/API/state mapping | Partially implemented | bounded trace events, screenshots linked, explicit API/state data; no screenshot visual diagnosis or exhaustive trace causality |
| Lifecycle investigations | Verified | session/setup/cleanup errors produce evidence-linked hypotheses without inventing executed test failures |
| Defect review/deduplication/root cause/fix knowledge | Partially implemented | scoped fingerprints, normalized similarity, structured historical cause/fix hypotheses and regression recommendations; actual evidence/review gates preserved; current cause never auto-confirmed; broad semantic/visual adjudication partial |
| Lifecycle-aware verified learning | Verified | passing test from failed cleanup lifecycle cannot confirm a fix; same reviewed causes idempotent; conflicts denied |
| Locator healing | Partially implemented | typed locator-only candidate, failing source/hash binding, unchanged assertions, reviewed fixture rerun; no unattended live repairs |
| Autonomous bounded exploration | Partially implemented | page/time/origin budgets plus reviewed action/state-transition exploration on synthetic loopback Lightning/Experience/open-shadow fixtures; actual headless evidence/generation pass; sandbox action adapters and live dynamic journeys unverified, Production remains blocked |
| Gap analysis | Partially implemented | criterion mappings and missing behavior kinds; full semantic business coverage missing |

## Knowledge, evidence and reporting

| Capability | Status | Evidence / remaining boundary |
|---|---|---|
| Operational SQLite history/trust/source isolation | Verified | run/test/lesson/knowledge scope/version tests; all runtime databases ignored |
| Redaction/normalization/chunking | Partially implemented | limited redaction + chunks; source privacy review still required; no complete DLP guarantee |
| Embeddings + persistent local lexical/vector index | Verified | actual Gemini vectors for five approved fields persisted/retrieved in separate processes; org/permission/version isolation, embedding-space mismatch and restart regressions; broader corpus/quota validation partial |
| Separate Gemini embedding adapter | Verified | actual connectivity + five-field approved publication succeeded; 108-field batch hit HTTP 429; mocked order/count/dimensions and existing Embed contract preserved |
| Safe model connectivity command | Verified | actual chat and embedding API responses both succeeded with synthetic inputs; key presence alone is never success |
| Content-bound external AI data review | Verified | structural whitelist, explicit field minimization, exact bundle/source/scope hash, named operator, expiry and destination gates tested and exercised; raw discovery local; separate Chroma destination approval required |
| Embedding model namespace integrity | Verified | SQLite semantic scores require matching provider/model/dimension space; Chroma collection namespaced for reviewed flow; old unknown-space vectors not silently compared |
| Persistent reviewed ingestion queue | Verified | small configurable batches, atomic source invalidation, durable jobs/cache/retry/lease/daily budgets, restart and concurrent-worker tests; actual five-fact request then zero-upload repeat; provider-crash exactly-once semantics not claimed |
| Retry-After, pacing and quotas | Verified | numeric/date backoff persisted, native retries disabled under queue budget, daily/per-run request/text limits and pacing; deterministic clock regression; these are local ingestion limits, not a global provider quota guarantee |
| Content deduplication and version-safe vector reuse | Verified | org/permission/model/content hashes, normalized structural facts, unchanged new-source-version reuse, review/source expiration and stale-source tests; precomputed mirror vectors avoid extra embedding calls |
| Chroma upsert and real retrieval flow | Verified | actual JS SDK over local mock HTTP server: auth, preflight, collection, upsert, query; returned hits affect ranking only for current reviewed catalog sources |
| Remote ranking trust/version isolation | Verified | wrong org/stale/unreviewed/unknown catalog hits cannot elevate knowledge; configured failures are surfaced |
| External Chroma-only source import / Cloud tenancy | Not implemented | explicit local review/catalog ingestion required; Cloud tenant/database CLI configuration incomplete |
| Stale schema/lesson invalidation | Verified | field schema and captured deep metadata/Flow/validation/permission fingerprints deprecate dependent facts/lessons; transport/capture-time changes ignored; legacy unbound lessons flagged; unobserved changes/live monitoring remain unknown |
| Source-linked plan/investigation citations | Verified | criteria/version/workflow/verified-defect citations in reports |
| Org intelligence→reviewed knowledge indexing | Verified | versioned observed local catalog by default; explicit reviewer required for trusted retrieval; tested planning/data/index links; external embedding upload opt-in |
| Playwright HTML/JUnit/JSON/screenshots/traces | Verified | actual generated/local browser reports; lifecycle status reported independently from test rows |
| Quality HTML/readiness/trends/retrieval metrics | Verified | deterministic grounding/execution/mixed-outcome metrics; mixed outcomes do not prove flakiness |
| Full model evaluation/dashboard/knowledge effectiveness | Partially implemented | strict grounding checks, precision/recall@k/MRR/nDCG benchmark harness and two live source-judged queries; wider semantic/business benchmarks, model judge/dashboard/retraining remain missing |
| Reporting Labs | Blocked | specific provider/API/auth contract not supplied; no invented integration |
| 15-agent ownership inventory | Implemented | CAPABILITY_AUDIT.md defines inputs/outputs/tools/evidence; partial roles remain explicitly identified |
| Live sandbox workflows and external vector/model verification | Partially implemented | live Production read-only Salesforce, Gemini chat/embeddings and persisted local semantic retrieval verified; sandbox workflows need a distinct approved sandbox/recipes/session; external Chroma unconfigured and unverified |
| Complete original and later definition of done | Not implemented | remaining engineering above remains in scope |

## Next dependency

Latest completed checks (deep-intelligence increment, 2026-11-14): typecheck passed, **96 unit/integration tests passed**, demo/graph/real failure-learning demonstrations passed and **3 existing headless browser tests passed**. New unit/integration suites exercise queue restart/quota/lease/backoff/dedupe, metadata graph/pagination/namespace isolation, source-grounded intelligent planning, real generated LWC browser execution and historical/stale knowledge. Actual bounded Production deep metadata, minimized Gemini ingestion/retrieval/planning and local operational handoff were executed. Actual Salesforce UI/data workflows and external Chroma remain unverified.

Next dependency chain: expand bounded version/source coverage and sharing/license/session permission semantics; obtain reviewed sandbox persona/workflow/data recipes for richer action adapters. Production dynamic journeys remain blocked. A separate strict observation policy/imported state/static safe identity view is still required for any Production browser observation. Continue pending-run reconciliation, broader retrieval/model evaluations, full runtime impact maps, connectors/imports and Reporting Labs' actual contract. All original P0/P1/P2 and 15 responsibilities remain in scope; no complete-framework claim is made.
