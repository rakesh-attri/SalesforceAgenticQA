# Lightning compatibility and policy intelligence

This layer reuses the browser trace schema, installed headless Chrome, actual Playwright MCP session, existing policy validators, private screenshot manifests, History and KnowledgeIndex. It performs deterministic local analysis. No Salesforce/model call, policy activation, session renewal, normal-network replay or factory operation is needed to review saved evidence.

## Services and boundaries

| Service | Implemented behavior |
|---|---|
| `compatibility-analyzer.ts` | Checks matching authenticated org/user/build/app/record scope and provenance; groups request keys, duplicates, blocked/normal overlaps, HTTP/Aura errors, unknown responses, source citations, request-start order when available and versioned registry matches |
| `platform-contracts.ts` / `compatibility-types.ts` | SQLite immutable contract versions with org/user/permission/build/app/engine/record scope, exact operation/shape hashes, parameter/value constraint declarations, response/effect/risk/status, sources, dependencies, operator definition receipt, expiry and mandatory re-review conditions |
| `compatibility-policy-import.ts` | Imports existing resource and Aura definitions as proposed, source-linked registry entries; old browser approval never becomes registry approval and unknown effects remain unknown |
| `policy-recommendations.ts` | Groups observed equivalent resource classes into one build-bound review task; otherwise one exact-operation review task. Rejects mutation/high-risk signals, carries source references, requires shape/effect/response/dependency/regression/operator review and emits no executable permission patch |
| `compatibility-report.ts` | Static local HTML/JSON with source-linked findings, normal/guarded differences, visual milestone/console categories and integrity-checked links to local screenshot previews |
| `agents/compatibility.ts` | Sanitized evidence for seven existing owners; optional existing ReasoningAgents investigator advice and existing KnowledgeIndex observed-evidence indexing. No agent approval authority or diagnostic-to-verified-lesson promotion |

Contract registry review is deliberately separate from live execution authority. A registry dry-run must also pass the existing named environment/browser approval, exact scope, installed engine hash, existing policy definition hash, request shape and original runtime network validator. An approved registry entry absent from the actual reviewed browser policy still cannot permit a request. Unsupported runtime bindings remain blocked. Unknown responses/effects cannot be stored as reviewed contracts; proposed/revoked, expired, cyclic or unresolved dependency contracts are unusable. Scoped source invalidation additionally disables affected reviews and dependents without overwriting their history. Revocation is an appended version, preserving original entries. Registry membership never changes normal Production permissions or data ownership.

Resource matching is a comparison aid, not a cache/permission wildcard. New traces retain a hashed resource-class identity and request-shape signature. Signatures exclude values and token/context material; exact value constraints are still enforced by existing reviewed runtime definitions. Operation risk labels use HTTP mutation methods and conservative descriptor signals; they are investigation/rejection signals, not proof of actual server behavior. A get-like name is never a read permission. Static success is not evidence that a request is necessary; optionality stays unknown without controlled evidence.

## Timing and evidence limits

Previously saved traces were collected in response/inspection order. Their array positions cannot prove request order. New captures record request-start sequence, elapsed request time and response-observation time using a boundary-local clock. Order changes remain observations, not inferred dependency edges or causes. Visual/network times are approximate boundary-relative correlation, not a synchronized causal experiment. Legacy traces lacking engine/permission fields rely on matching profile sidecars and are explicitly marked incomplete. The report preserves original screenshot categories, including previously identified classifier mistakes.

Actual error responses (HTTP failures/Aura ERROR) are separate from denied status-zero requests, absent response contracts, truncated traces and missing timing. Historical normal Aura HTTP-200 responses lack action-state classification and are not labeled successful Aura behavior. No report claims that normal-browser success proves safety. Unknown build behavior and inferred dependencies remain unproven.

## Executed saved Salesforce review

The existing authorized Chrome A/B artifacts were analyzed locally. Result: **174 distinct request findings**, **17 distinct blocked/normal-overlap candidate keys** (the prior eighteen matched events include a duplicate), and **44 proposed registry definitions** imported from the existing browser policy. The missing historical fields are reported explicitly: request-start ordering, Aura response classifications and engine identity bound by sidecar rather than trace. Recommendations activate zero permissions. Observed facts were persisted locally; zero verified lessons were published. No fresh Salesforce/Gemini/Chroma request or live browser session ran in this milestone.

The new report contains direct/guarded screenshot preview links. All source traffic, images, registry/knowledge databases and generated report artifacts stay local under ignored `.state` and `artifacts` paths. The export to agents contains hashes, counts, classifications and citations; it contains no raw request/response bodies, URLs, record names, tokens or images. Optional Gemini advice is a proposal over this sanitized evidence only and never determines permission decisions. It was not called during this milestone.

## Local command

Create a private JSON input under `.state`:

```json
{
  "normalReport": ".state/local-browser-A-final.json",
  "guardedReport": ".state/local-browser-B-final.json",
  "normalPolicy": ".state/local-browser-A.approved.json",
  "guardedPolicy": ".state/local-browser-B.approved.json",
  "indexObserved": true
}
```

Then run:

```powershell
npm.cmd run platform -- compatibility-review .state/compatibility-review-input.json
# Open the printed artifacts/compatibility/<analysis-hash>/index.html locally.
```

The input loader checks bounded real paths under `.state`; visual manifests must stay under `artifacts/browser-debug`. Image hashes and preview paths are validated by the existing screenshot service. Registry definitions and report content are hash/version bound. Repeating an unchanged review reuses the same immutable definitions and analysis identity; it uploads nothing. Existing expired browser approvals can serve as historical source evidence only.

## Validation and next major capability

Focused negative tests cover missing timing, unknown Aura outcomes, source links, duplicate/reordered requests, mutation/high-risk rejection, immutable versions, revoked/expired/foreign scopes, tampering, cyclic dependencies, parameter drift and engine mismatches. The actual local Playwright MCP fixture now feeds its real guarded network events to the analyzer, verifying sequence metadata and blocked Apex classification without backend mutations. Existing browser policy/cache, build, org/user/expiry and SDK-version regressions remain.

Next major autonomous QA capability: **source-grounded workflow evidence acquisition and impact-guided test design**. Prioritize (1) reviewed contract dependency experiments that isolate the current guarded rendering gap, (2) stable multi-object workflow/independent-content models with unknown behavior explicit, and (3) story-to-scenario/visual/API coverage and historical-defect risk selection. This builds on the full 15-agent/P0/P1/P2 registry. Neither the current analyzer nor a normal-network observation establishes a complete guarded Salesforce lifecycle; new live experiments still require fresh exact authorization.
