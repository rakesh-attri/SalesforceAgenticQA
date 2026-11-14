# Capability audit and agent ownership

Gemini integration update: Spec Analyst, Test Planner, Test Generator and Failure Investigator can invoke the provider-neutral structured chat service at their graph phases. Risk, Reviewer, Explorer and Learning advisory roles use the same service via CLI. All model results remain proposals; deterministic source review, execution and verified-learning gates retain ownership of trusted outcomes. Evidence: unit/gemini.test.ts covers schema/citation rejection, unchanged assertions, phase order, embeddings, privacy and request budgets. See GEMINI.md for actual live-check limitations.

Current increment: the graph coordinator now integrates Data Agent setup/verification/cleanup and Execution Coordinator session/identity gates. Knowledge Agent reads real Chroma query results with a locally verified catalog intersection. Failure Investigator receives lifecycle evidence, and Learning rejects passing tests from failed cleanup lifecycles. All 15 owners in the table remain; partial Explorer/Autonomous Explorer/model-evaluation roles are not relabeled complete. New evidence: readiness-pipeline.test.ts, live-runtime.test.ts, chroma-wire.test.ts. FEATURE_MATRIX.md is reconciled into one current inventory; earlier conflicting tables are archived.

Audit starting point: `1730bda`, branch `feature/verified-discovery`, isolated SalesforceAgenticQA repository. Baseline executed: typecheck, 29 unit tests, demo, 3 headless browser tests passed. Existing Describe/Metadata/Tooling, recipe/journal, durable planning graph, MCP, Chroma adapters and deterministic quality functions were retained. The material gap was orchestration: specification ingestion, executable spec graph, failure evidence ingestion, persistent trusted retrieval and verified feedback were absent or disconnected. New code reuses those services rather than replacing them.

All services are local TypeScript. Tool access below is an architectural boundary, not a claim of an external LLM agent running. `spec-pipeline.test.ts` connects the main graph; remaining agent responsibilities use the related explicit reviewed service workflows.

| Responsibility / owner | Inputs → outputs | Allowed tools | Evidence / remaining scope |
|---|---|---|---|
| Orchestrator / pipeline.ts | reviewed bundle → graph report | typed nodes, optional checkpoint saver | spec-pipeline; durable graph tests |
| Spec Analyst / specs/ingest.ts | local source → versioned explicit criteria | bounded local parsers | spec-formats and spec-pipeline |
| Org Discovery / org-discovery + operations + metadata | explicit object/component names → observed schema/unknown coverage | read-only authorized APIs | discovery/metadata/retrieval-api tests; live blocked |
| Application Explorer / workflows.explore | allowed URLs/budgets → snapshots | MCP navigate/snapshot only | platform test; live action workflow incomplete |
| Knowledge Agent / knowledge/index + rag | scoped sources/query → reviewed citations | SQLite, configured embeddings/Chroma | retrieval and version/isolation regressions |
| Test Planner / pipeline.analyze + planner | criteria/context → scenarios/questions | validated criteria, reviewed workflow inputs | integration proves no invented expected outcomes |
| Risk Analyzer / quality + pipeline | cases/history/verified defects → explained ranking | deterministic scoring, SQL history | mandatory learned regression verified |
| Test Data / hybrid-factory + data-execution | reviewed recipes/approvals → owned references/verification/cleanup | registered API/UI/service adapters with sandbox checks | hybrid-factory offline integration; no live adapter validation |
| Test Generator / workflows.generateTest | reviewed source-linked workflow → TypeScript | constrained DSL and TS syntax validation | actual generated browser/API execution |
| Test Reviewer / pipeline analysis + executionHash | criteria/source/assertions → blocked reasons/approval binding | exact outcome checks, schema/hash comparison | stale/invalid approval regressions |
| Execution Coordinator / execution/runner | approved generated files → actual exit/status/evidence | headless Playwright child, bounded fixture runner | generated failures and passes; incomplete reports rejected |
| Failure Investigator / intelligence | failure/trace/API/state + historical facts → proposals | bounded trace parser, scoped retrieval | seeded trace/screenshot/history chain; no visual screenshot diagnosis |
| Self-Healing / healing | reviewed locator candidate + executed source → rerun-validated proposal | typed locator transform, headless fixture rerun | unchanged assertion and source-hash verification |
| Autonomous Explorer / workflows.explore | bounded goals/URLs → observations | navigation/snapshot only | budgets tested; autonomous actions remain incomplete |
| Learning / intelligence.confirmDefect + history/index | failure + human cause/fix + passing regression → verified scoped defect | SQL evidence gate, reviewed ingestion | reopened SQLite influences future plan; stale invalidation tested |

No agent can convert a hypothesis into verified knowledge without review. No graph review approves arbitrary Salesforce writes. Runtime state, records, sessions and reports remain excluded from Git. No Salesforce, remote vector or model integration was claimed on the basis of these local fixtures.
