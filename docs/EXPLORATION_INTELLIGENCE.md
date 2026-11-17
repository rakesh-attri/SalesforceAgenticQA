# Goal-directed exploration and defect investigation

This extends the existing Application Explorer, WorkflowModelStore, KnowledgeIndex, LangGraph/DurableSaver, History, Failure Investigator and locator-only healer. It adds no agent framework, generic MCP browser tool or Salesforce network policy. All existing Production modes, dedicated authorization, platform initialization, native identity/session, ownership/factory/cleanup and write restrictions remain unchanged. Package 012 stays declined/inactive; no replacement Salesforce write package is prepared.

## Execution dependency chain

Current application study + versioned specification + optional exactly reviewed workflow → explicit objective and reviewed discovery catalog → deterministic evidence/coverage/risk/cost selection → durable LangGraph operator interruption → existing fixture browser owner/action loop → hashed observations and independent outcome checks → proposed investigation → separate locator-only repair review → remaining-budget regression → existing confirmed-defect learning gate.

The executable adapter in this increment is **synthetic loopback fixtures only**. It rejects live-Salesforce source receipts and non-loopback origins. Logical fixture org/user/persona identity is checked through the host adapter; this is not Salesforce API/native-browser identity verification. Existing live Salesforce identity and policy services are preserved, but a goal-driven live adapter remains engineering work and requires separate exact authorization. No fresh Salesforce, Gemini or Chroma call was executed for this milestone. Validation: 272 full tests, 19 final focused tests, three headless tests, typecheck and eight demonstrations passed; see IMPLEMENTATION_REPORT.md for evidence.

## Objective and action selection

`exploration-plan.ts` validates the immutable application study, full specification content fingerprint, source versions and optional current reviewed WorkflowModelStore model. Objectives identify source acceptance criteria and a named reviewer. Catalog entries point to the existing fixture action references, exact source/version citations, prerequisites, criteria, evidence gain, risk, cost, uncertainty and review status. No model may create a new action reference or approve an action.

Eligibility rejects unreviewed/rejected actions, wrong pages/states, incomplete/error/loading observations, unsatisfied prerequisites, insufficient budgets, attempted physical actions and already-observed navigation targets. The deterministic score is uncovered criteria ×100 + directly unblocked criteria ×50 + evidence gain ×10 + reviewed risk ×5 + mapped confirmed-history hits ×30 + state novelty ×3 − cost − uncertainty ×20. Optional approved model ranking can add at most five points to an existing candidate; eligibility remains unchanged. Tie-breaking is stable by action ID. The score is a prioritization heuristic, not calibrated failure probability.

Achieved means the specified criteria have actual unique/visible, complete, error-free source-exact observation passes. It is not complete Salesforce/application coverage. No useful eligible action means blocked with a review question. Unknown prerequisites/outcomes remain unknown rather than invented. Identical-state contradictory checks revoke affected coverage and require investigation.

The existing KnowledgeIndex retrieves only reviewed current scoped requirements/defects/lessons. Org/persona isolation and source invalidation remain authoritative. The goal runtime uses local retrieval; it does not silently generate external query embeddings. Existing persistent semantic RAG, approved Gemini chat and `gemini-embedding-001` ingestion remain available through their original review flows. `recommendExploration` reuses ReasoningAgents/structured-output validation and exact payload/destination approval; tests reject unknown model IDs/citations and attempts to boost an unapproved action. No new live model health is claimed.

## Durable execution and resume

`exploration-ledger.ts` persists the exact definition, original approval/hash/nonce, state checksum, hash-linked events, visited states, attempts/results, coverage, decisions, questions, budgets and current session reservation. Run definitions/approvals cannot be replaced; nonces cannot move to another run. Browser session, request/navigation, action and cumulative time counts persist across interruptions. Pending intent is journaled **before** locator resolution/action, and an unfinished intent becomes uncertain. Attempted/uncertain actions never replay under the original run.

`exploration-runtime.ts` invokes the existing `exploreFixture` owner and private in-memory Playwright MCP snapshot client in the same isolated installed headless Chrome context. It never attaches to everyday profiles or downloads a browser. The original loopback and exact-navigation rules remain; extra execution hooks enforce budgets, GET/HEAD-only fixture transport and host state/approval checks without exposing Page/evaluate/network tools to agents. Rejected requests are framework denials, not Salesforce server errors.

LangGraph checkpoints each selection and its operator-review interrupt through the existing DurableSaver. Review answers bind the original operator, definition hash, action ID and observed state hash. Resume reopens the durable stores, verifies the original unexpired grant and source/identity/engine/MCP binding, reserves a newly permitted session, then independently re-observes the checkpoint page. Only an identical state can continue. The state hash includes visible text, test-id state and hashed form values; form values are not persisted. A fresh empty form therefore cannot stand in for the previously filled one. Changed state blocks; no clicks/fills are replayed to reconstruct it.

An operator stop needs no new browser session. A crash/abandoned session consumes its full reserved time; pending effects become uncertain and require review. It is not automatically resumed or refunded. The runtime remains bounded by the original sessions/actions/requests/navigation/time limits, and original expiry cannot be renewed by a resume reply. Masked screenshots reuse the existing debug manifest/store/preview: up to four viewport captures/4 MiB per fixture session, under the existing capture/time bounds. Images remain local; masking is best effort.

## Investigation and reproducibility

`exploration-investigation.ts` consumes the ledger's actual failing/blocked run and exact criterion, source requirement, attempts, state/locator checks, sanitized response classes, console categories and host-recorded screenshots. Optional bounded API/SOQL diagnostic signals must match the fixture org/user and carry a source hash; they are explicitly mocked/source signals, not fresh Salesforce verification. Raw traffic, response bodies, headers, tokens, record values and assertion stacks are not uploaded. Expected display text and diagnostics are redacted; observed text is retained as a hash with match/visibility status.

The investigator proposes evidence-linked hypotheses for application defect, incorrect test assumption, locator problem, permission issue, stale data, environment problem or unknown cause. Each includes heuristic confidence, uncertainty and the minimum next observation. Framework request denials are identified independently from actual response failures. Cached/stale or contradictory sources produce assumption-review hypotheses. A unique complete source-backed text mismatch can suggest a product defect; it never confirms one. Confidence heuristics need broader held-out calibration.

Historical duplicate candidates come only from current scoped verified defects/lessons. Signature similarity and expected-outcome matches are shown; candidates are never confirmed duplicates automatically. Reproduction steps are the exact approved attempted catalog entries, with source versions/status and redaction. Reports include story/criterion, affected page/object/component, proposed severity/risk rationale, environment/engine/app-source versions, screenshots, evidence, unknowns and regression recommendations. Screenshot paths/manifests/session filenames and PNG hashes are checked before use; altered evidence is rejected.

Reports distinguish **suspected defect**, **test-framework failure** and **investigation required**. They do not publish Jira/Azure DevOps issues. Existing reportingLabs remains the actual generated-Playwright reporter; no vendor rows or unsupported reporting API are fabricated for exploration observations. Existing generated-test demonstrations/regressions continue to exercise it.

## Controlled recovery and learning

`exploration-recovery.ts` reuses the existing healer's extracted `locatorOnlyCandidate` transformation. A proposal must match a certain recorded locator failure, original workflow hash, source criterion/expected assertion and attempted catalog. The new locator must be uniquely observed now and supported by original host-journal source evidence. Actions/values/expected outcomes cannot change. Uncertain/pending effects, non-idempotent catalogs, unknown candidates, stale sources and insufficient remaining budget block recovery.

A consequential repair requires a separate exact proposal hash, original named operator, fresh nonce and expiry no later than the parent grant. The parent is sealed; its remaining allowance is allocated once to the hash-bound child fixture run. Child session/action/request/navigation/time budgets cannot exceed that remainder. Unused allowance is conservatively not returned to the parent, and neither parent nor repair receipt may replay. The child still executes through the existing fixture action owner and rechecks the unchanged assertions. This creates no Salesforce factory/write authorization.

Passing recovery alone publishes no lesson. The demo additionally uses the existing `confirmDefect` gate only after an actual recorded fixture failure, named reviewed cause/fix and actual passing child regression. This publishes a **synthetic automation** defect lesson, not a Salesforce business defect. Its mapped later action score increases from 170 to 200 in the fixture. Source changes continue to invalidate requirements/models/knowledge. Recovery and investigation functions themselves do not automatically publish verified learning.

## Reports and PowerShell use

```powershell
npm.cmd run platform -- demo-exploration-intelligence
```

The demo owns a synthetic server and headless Chrome/MCP contexts, pauses before the first action, closes/reopens both SQLite stores, resumes through Account → Contact, then demonstrates a separate real locator failure/reviewed recovery/confirmed fixture-learning chain. It prints local exploration/defect HTML+JSON, history and checkpoint paths. Its fixture server closes at the end; historical files do not authorize execution against another server or Salesforce.

Local reports show the objective, actual state graph, dashed source-required but unobserved targets, selected/rejected actions with score reasons, requirement coverage, unexplored risk, suspected issues, verified local screenshot links, review questions and remaining budgets. “Unobserved target” is a requirement, not an invented runtime state. A parent failure remains a failure even when its separately reviewed recovery child passes.

To re-render an existing local run without opening a browser:

```powershell
@{
  history = '.state/exploration-<printed-history-id>.sqlite'
  runId = 'goal-<printed-run-id>'
} | ConvertTo-Json | Set-Content -Encoding utf8 .state/exploration-report-input.json
npm.cmd run platform -- exploration-report .state/exploration-report-input.json
Start-Process '<printed local index.html path>'
```

The reusable CLI also accepts bounded workspace JSON configurations:

```powershell
npm.cmd run platform -- exploration-plan .state/exploration-plan-input.json
npm.cmd run platform -- exploration-run .state/exploration-run-input.json
npm.cmd run platform -- exploration-resume .state/exploration-resume-input.json
npm.cmd run platform -- exploration-investigate .state/exploration-investigation-input.json
npm.cmd run platform -- exploration-repair-propose .state/exploration-repair-input.json
npm.cmd run platform -- exploration-repair-run .state/exploration-repair-run-input.json
```

All configs name an **existing contained `.state/*.sqlite` history**. Planning uses `{history,definition,progress}`; progress contains path/stateHash/covered/attempted/completed/visited/actionsRemaining/remainingMs/completeEvidence. Runtime uses `{history,definition,approval,resume?}`; definition and approval are paths to exact source-reviewed JSON, with the synthetic server still running. Resume JSON has `{operator,definitionHash,actionId,stateHash,decision:"continue"|"stop"}` and never grants new authority. Investigation uses `{history,runId,signals}`; signals identify criterionId, bounded message and optional mocked API/verification hashes. Repair proposal uses `{history,proposal}` with parentRun/actionId/criterionId/original/originalHash/target/locator. Repair run uses `{history,proposalId,review}`; the separately reviewed receipt has operator/proposalHash/expiresAt/nonce. No command creates a Salesforce write package or auto-approves a proposal.

```powershell
npm.cmd run typecheck
npm.cmd run unit
npm.cmd run demo
npm.cmd run demo:graph
npm.cmd run platform -- demo-learning
npm.cmd run platform -- demo-workflow-intelligence
npm.cmd run platform -- demo-test-design
npm.cmd run platform -- demo-browser-debug
npm.cmd run platform -- demo-application-intelligence
npm.cmd run platform -- demo-exploration-intelligence
npm.cmd test
```

## Remaining human-like autonomy gaps

Highest-value next milestone: connect this planner to the **existing separately approved live browser gateway** for source-backed read-only multi-object goals, with fresh native/API identity and independent scoped API verification. No new Production permissions or write package should be implied. Add semantic state equivalence for richer LWC/Experience pages, business/permission/visual oracles, reproducibility across sessions, held-out defect/duplicate/confidence evaluations and evidence-guided follow-up observations. Actual live goal-directed execution, arbitrary business workflows, calibrated causal diagnosis and live recovery remain partial/unverified. Enterprise publishing/connectors and CI/quality analytics stay in the cumulative P0/P1/P2 registry.
