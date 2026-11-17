# Autonomous Salesforce test design and impact intelligence

This increment continues `bcbf068`. Package 012 was explicitly declined and stays inactive. No replacement live data package, Salesforce session, record operation or live model request is needed by this workflow. Existing Account/Contact rendering, the 15 agent owners and the cumulative P0/P1/P2 registry are preserved.

## Source-driven design flow

`analyzeRequirementConditions` extends the existing Spec Analyst with literal Given/When/Then/If/Unless clauses, actor references, numeric boundary phrases and missing-result/precondition questions. It retains offsets and requirement citations. Criteria support positive, negative, boundary, integration, permission, regression and visual kinds. Existing strict parsing remains: arbitrary prose is not silently promoted into acceptance criteria; source-stated intents and extracted requirements require review, and expected UI text is never invented.

`designSalesforceTests` composes the existing versioned snapshot/component graph, WorkflowModelStore, workflow planner, scoped KnowledgeIndex, confirmed history and guarded generator. Graph content must match its version and org/metadata binding. Models retain the existing current-source and named-review gates. Historical page observations may be imported only through the actual host rendering journal, exact view/state/profile/source checks and matching org/persona. Expired receipts remain useful historical facts, never runtime authority.

Business-rule claims live inside the existing JourneyEvidence schema. Their explicit JSON identifies criterion, object, persona, condition, observable, literal expected result, prerequisites, field-level data requirements and relevant components. Named reviewed requirement/knowledge sources must state those claims. The reviewer rejects unknown objects/fields/components, mismatched outcomes or workflow objects, different-persona evidence and unreviewed rules. Two different literal outcomes for the same declared object/persona/condition/observable block both scenarios. This detects exact declared contradictions; it does not claim complete semantic equivalence detection across arbitrary prose.

The application view includes source-linked Flow/Apex/LWC/validation/dependency inventory, declared Flow conditions, Describe field constraints, record types and permission flags. Declared metadata is not runtime reachability, a complete business rule or effective sharing. Those unknowns stay in the report. Formula/record/component content is kept local and is absent from the default minimized AI payload.

## Impact and risk

`analyzeChangeImpact` extends existing graph analysis with deterministic bounded traversal of consumers, object/Flow containment, declared mutation targets, invocations and Flow connectors. Every propagated path names a real edge and its evidence. Field changes can reach enclosing objects, dependent Apex/LWC/validation components and mapped tests. Changed Flows can include their declared downstream targets. Cycles terminate; unknown changes and truncated traversal explicitly prevent a complete-impact claim. A metadata mutation-target edge grants no write permission.

Design ranking uses business impact, mapped affected components and current-org/current-permission/current-schema confirmed history. A confirmed historical defect can make its mapped regression mandatory; unmapped historical tests become review recommendations. Model suggestions add at most ten ranking points and cannot override blocked status, change outcomes, create mandatory tests or grant authority. Changes in the saved-org demonstration are explicitly hypothetical, not a detected deployment diff.

## Gemini, persistent RAG and evaluations

The existing Gemini chat and `gemini-embedding-001` adapters are reused. `reasonAboutTestDesign` requires exact minimized-payload and destination approval through `authorizePayload`. The existing ReasoningAgents validates scenario IDs, source citations, duplicate IDs and strict Zod output. Provider text remains redacted. No key configuration or expired earlier approval authorizes an external call.

The demo uses the real adapters with mocked HTTP responses, small embedding batches and a persistent SQLite semantic index. Reopened retrieval is verified. A clearly labelled seeded fixture failure/cause/fix/passing-regression goes through the existing confirmation gate and influences a later design. This is not a live Salesforce defect. The demo reports actual retrieval precision/recall rather than assuming relevance. Optional Chroma and prior live integration evidence remain unchanged; Chroma is not contacted here.

## Proposals, exploration and failure evidence

Playwright TypeScript proposals preserve literal expected outcomes and use the existing owned browser guard with an intentionally unapproved configuration. Independent API proposals contain exact-ID query construction and response assertions for reviewed current fields. They contain no HTTP transport, credentials or authorization. A separately approved read adapter and fresh schema are still required. Data plans are generic unapproved requirements; no named factory/run/approval package is prepared.

Visual scenarios remain review questions without an approved baseline, masking scope and comparison oracle. A text assertion or screenshot category cannot prove pixel-level conformance. Planning coverage is distinct from executed coverage.

The existing loopback-only Fixture Explorer now accepts an optional opaque action chooser. It can choose only unused reviewed action references within the original action/time bounds; unknown/replayed choices and hung decisions fail closed. Optional actual Playwright MCP snapshots reuse the sole context, expose only hashes in the report and confer no new action authority. Ordinary Production and dedicated live execution policies are untouched.

`investigateExplorationFailure` reuses the existing investigator and scoped historical retrieval, correlates changed/unchanged fixture state hashes with source-bound local screenshot milestones, and rejects mismatched run/policy evidence. It does not interpret image pixels, assert causality, approve repairs or publish learning. Existing reviewed self-healing and confirmed-defect/regression gates remain authoritative.

## Local commands and reports

```powershell
npm.cmd run platform -- demo-test-design
npm.cmd run platform -- test-design .state/test-design-local-input.json
npm.cmd run typecheck
npm.cmd run unit
npm.cmd run demo
npm.cmd test
```

The demo is synthetic and needs no Salesforce/Gemini credentials. The input command reads bounded workspace `spec`, `org`, `graph`, `permission`, optional `changes`, optional host-journal `observations` (`review`, `report`, `view`) and optional previously journaled `model`. It configures no external embedding/model adapter. Versioned JSON specs preserve their source/version; supported unstructured formats reuse the existing ingestion parsers.

Reports are content-versioned under `artifacts/test-design/<hash>/index.html` with JSON and proposal files alongside. HTML has no external script/network dependency and escapes source content. It shows coverage, ranking, conditions, prerequisites/data requirements, impact paths, contradictions, review questions, source traceability, retrieval/history and proposed AI advice. Outputs remain ignored/local. The saved Salesforce metadata example retains known historical Account/Contact pages but emits no tests where workflow/business evidence is incomplete.

## Remaining path to human-like autonomy

1. Broader reviewed workflow acquisition across actual multi-object, Flow, LWC and Experience journeys, with effective persona/sharing evidence and complete business oracles.
2. Semantic analysis of complex rules, decision tables and contradictory prose, with grounded evaluations beyond the deterministic clause/rule checks.
3. Bounded goal-driven exploration beyond reviewed fixture action sets, supported dynamic interactions and stateful recovery under separate authorization.
4. Approved visual baselines, pixel/layout/accessibility comparison and stable cross-browser/device evidence.
5. Wider enterprise test-data recipes, business-service/async validation and recovery; live data work remains separately opt-in and is not proposed in this increment.
6. Reproduced root causes, controlled repairs and independently passing regressions before trusted learning; stronger held-out AI/retrieval evaluations and drift analytics.
7. Productionized Chroma deployment, CI scheduling, broader quality analytics and approved Jira/Azure DevOps publishing. Existing connectors/reports remain, but this increment sends no external issue or message.

The autonomous Engineer is still partially implemented. Reviewed design proposals, fixture executions and historical Salesforce readiness are separate evidence classes; none establishes unrestricted autonomous live QA.
