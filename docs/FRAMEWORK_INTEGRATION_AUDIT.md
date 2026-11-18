# Framework integration and capability audit

This audit continues **aa8b712** on `feature/verified-discovery`. It maps actual modules, not a promise that every roadmap capability is complete. The cumulative requirements remain in FEATURE_MATRIX.md. No live scopes were prepared or activated; observation 002 and lifecycle 012 remain declined/inactive.

## Connections audited and repaired

| Connection | Before this milestone | Current implementation and evidence |
|---|---|---|
| Specs → generated QA checks | `createSpecPipeline` regenerated plain workflows after setup, dropping the separate QA generator's guarded checks | Trusted `PipelineRuntime.prepareExecution/guardFor` preserve guarded generation after verified owned IDs exist; the real child executes the original assertion plus QA checks |
| Graph → exact execution review | General graph accepted an input approval but had no durable execution-specific interrupt | Optional `requireExecutionReview` uses the existing saver and binds exact input hash/reviewer before coordinator entry; old callers retain their behavior |
| Generated execution → independent verification/cleanup | Factory setup verified creates, but general pipeline had no host post-execution or absence callback | `afterExecution/verifyCleanup` connect owned SOQL checks, reviewed recovery and independent absence; errors keep lifecycle failed and cleanup remains in finally |
| QA checks → actual child process | The prior milestone tested generated callbacks in a fixture registration harness and called QA checks in-process | Closed `fixture-qa-guard.ts` reconstructs the reviewed host binding in the actual Playwright process, checks fresh mock identity and actual mutation ownership and permits only exact loopback preview pages/actions |
| Guarded tests → healer | Existing healer required byte-exact plain generated source | Optional trusted guard binds byte-exact guarded source; candidate preparation requires observed fixture locator review; the same runner/QA checks verify unchanged assertions |
| Healed locator → future workflow | Confirmed history changed risk but did not carry the reviewed repair into workflow source | Actual MCP locator evidence plus named review forms a new source-linked workflow version; future guarded proposals use the reviewed locator |
| Deterministic data proposal → factory | Value generation was internal to HybridFactory | Shared pure `factoryMutationValues` prepares the same deterministic fixture values before approval and actual setup; validation/approval/ownership remain in existing services |
| Application study → multi-case scenario observations | Application compiler accepts one current reviewed page per object; QA fixture has seven cases | Explicitly selected primary Account/Contact observations feed that compiler while all seven actual case/MCP observations feed QA workflow evidence; no compiler assertion is weakened |
| Many demos → coherent operator evidence | Separate demonstrations had independent histories, scopes and output conventions | One integration composition shares requirement, metadata, persistent source/RAG/history, two reviewed data runs, actual tests/recovery and one eligible lesson; unified HTML/manifest links actual reports |
| Operator entry points | Large existing platform CLI and scattered documentation | Same CLI gains local doctor/import/status/approvals/history and `demo:framework`/`doctor` npm aliases; complete guide documents existing execution commands and their limits |

The new fixture backend and child guard are test transports, not replacement Salesforce clients, browser modes, factories, oracles, planners or agents. The fixture backend has no HTTP mutation endpoint. The actual HybridFactory/DataExecution own approved synthetic changes; browser requests are GET-only. A foreign sentinel and independent exact-ID queries prove the run boundary. Ordinary Production and dedicated live policy modules are unchanged.

## P0/P1/P2 service map

| Requirement area | Actual service path | Verification class / remaining boundary |
|---|---|---|
| P0 discovery, metadata and permissions | `agents/org-discovery`, `org-intelligence`, `deep-discovery`, `component-graph`; `salesforce/operations`, `metadata` | Offline integration + prior bounded live evidence; inaccessible semantics and effective sharing remain unknown |
| P0 hybrid factories, setup and cleanup | `agents/recipe-registry`, `hybrid-factory`, `data-execution`; `salesforce/dedicated-qa` | Actual services against mock backend here; prior dedicated exact-scope creation/cleanup historical; broad business factories partial |
| P0 JWT/API/SOQL | `salesforce/jwt`, `client`, `operations`; closed reviewed readers | Mock HTTP queries here; prior JWT/SOQL live evidence historical; no new service calls |
| P0 browser authentication and security | `integrations/session-gate`, `browser-session`; `execution/browser-guard`, `lightning-session`, `environment` | Existing scopes/identity/approval/ownership tests preserved; new fixture guard cannot accept live origins/evidence |
| P0 durable graph and human approvals | `agents/pipeline`, `graph`, `workflow-planning`; `core/checkpoints` | Actual close/reopen + exact workflow/execution resumes; uncertain browser replay remains prohibited |
| P0 MCP tools and policy | `integrations/salesforce-mcp`, existing private browser gateway and `agents/fixture-explorer` | Actual same-context fixture MCP observations; no arbitrary live controller or agent action rights |
| P0 semantic RAG and history | `knowledge/index`, `rag`, `reviewed`, `ingestion-queue`; `core/history` | Real SQLite/vector persistence with mocked Gemini HTTP here; prior approved live Gemini/local retrieval historical; external Chroma remains unverified |
| P1 exploration and source-grounded tests | `agents/application-intelligence`, `fixture-explorer`, `workflow-models`, `test-design`, `workflows` | Two selected application pages/seven scenario observations; actual generated child tests; broad live journeys remain partial |
| P1 impact/risk/regression | `agents/component-graph`, `quality`, `test-design` | Same-source dependency paths and actual fixture-confirmed defect make a later regression mandatory; full runtime impact incomplete |
| P1 investigation and healing | `agents/intelligence`, `healing`, `exploration-investigation`, `exploration-recovery` | Actual API/visual/locator failures and trace evidence; one reviewed locator recovery; semantic root causes and live repairs remain partial |
| P1 historical defects/verified learning | `intelligence.confirmDefect`, History/KnowledgeIndex | Actual fixture failure + reviewed cause/fix + passing repair + cleanup before promotion; no fabricated Salesforce defect |
| P2 bounded autonomous exploration | `agents/exploration-plan`, `exploration-ledger`, `exploration-runtime` | Existing deterministic/model-choice fixture demos preserved; this integration uses reviewed actions; broader live autonomous actions unverified |
| P2 intelligent defect reporting and gaps | Existing investigator/report/application review services | Evidence-linked proposals and missing requirements; Jira/Azure DevOps publishing/import and broader semantic triage remain engineering gaps |
| P2 reportingLabs/analytics/evaluations | `execution/runner`; `integrations/reporting-labs-reporter`; `agents/evaluation` | Real local npm HTML/JSON/history and mixed pass/failure outputs; no paid key needed; CI publishing/dashboard and held-out semantic evaluation partial |
| Later business/permission/visual intelligence | `agents/qa-oracles`, `permission-intelligence`, `qa-intelligence`; `execution/qa-checks`, `visual-baselines` | Real fixture UI/API comparisons and reviewed pixels; declarations/runtime/access boundaries explicit; real-org oracle/baseline proof still pending separate request |

## Ownership and duplicate responsibilities

The 15-owner inventory in CAPABILITY_AUDIT.md remains authoritative. The general specs graph, dedicated live lifecycle and goal exploration graph have distinct approval/runtime responsibilities; they are not interchangeable. Narrative business-rule claims and executable oracle claims have different schemas. Application study review and execution approval are separate. History stores passing test rows separately from lifecycle cleanup status.

There are still multiple historical demonstration/report formats and legacy planning helpers. They remain to preserve passing functionality. The new integrated manifest links their active service outputs rather than replacing every report schema. `createPlanningGraph` remains a proposal-only graph, not a second execution coordinator. The application compiler's one-current-page-per-object choice and real live QA-host composition are explicit remaining integration limits.

## Actual verification boundaries

The integrated example uses injected Gemini transports and a synthetic API/data backend. It runs actual discovery/planning/generation/factory/graph/QA/investigation/healing/learning code, installed headless Chrome, Playwright MCP and the real local reportingLabs npm reporter. Expected faulty tests remain failed in all reports; only their separately reviewed locator regression passes. Provider configuration is not connectivity proof.

Historical Salesforce/Gemini evidence and current offline evidence must be reported separately. No new Salesforce authentication, record write, browser state import, Production permission, remote model/vector call or live authorization package is part of this milestone. The highest-value future live check is a separately requested reviewed existing-record expectation with fresh exact no-create authorization and independent SOQL, followed by separately approved masked baseline comparison. Do not prepare it automatically.
