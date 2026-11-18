# Reviewed QA expectations

This extension uses the existing specification/workflow planner, component graph, reviewer, knowledge index, failure investigator and Playwright generator. It grants no Salesforce, browser or model permissions. Live observation SFQA-OBS-20261118-002 and lifecycle 012 remain explicitly declined/inactive; refreshed storage state is not approval. No replacement live package is prepared.

## Evidence states

| State | Meaning | Limitation |
|---|---|---|
| Metadata declaration | Source-linked validation formula, Flow condition, field relationship, permission assignment or sharing configuration | Does not prove a branch executed, a user can access a record or an expected business outcome |
| Reviewed expectation | Literal acceptance criterion plus independently reviewed typed oracle/permission rule or exact masked baseline version | A declaration of intent; not a passing result or execution approval |
| Observed UI/API signal | Exact contract, source scope, run, record hash, input hash and channel receipt | Missing, denied, ambiguous or malformed signals stay unknown; unmatched conditions are not applicable |
| Independently compared outcomes | UI and separately supplied API adapter agree with reviewed signals for the same run/record/input/scope | Inputs are host-bound prerequisites, not independently proven general business conditions; API errors do not prove a persisted invalid record exists |
| Verified learning | Existing confirmed failure, reviewed cause/fix and passing regression gates | No contract review, visual difference or passing fixture automatically creates a lesson |

`QAContractStore` persists immutable content-addressed contracts, separate named reviews and hashed observation receipts in existing SQLite History. Every use checks exact review/content and current source references. Schema, graph, org, persona, specification, requirement and component evidence must agree. `oracle` evidence claims extend the existing JourneyEvidence vocabulary, keeping executable signal contracts distinct from existing narrative `business-rule` claims.

## Business oracles and generation

`qa-oracles.ts` supports bounded literal predicates and UI, API-field and enumerated API-error signals. It does not execute arbitrary formulas, Apex, Flow expressions or JavaScript from metadata. Rule expectations must match the acceptance criterion exactly and name real discovered fields/components. Inaccessible formulas and unresolved behavior remain review questions.

`qa-intelligence.ts` enriches `designSalesforceTests`; it retains scenario ranking, impact paths, confirmed history and all previous workflow blockers. An approved baseline can resolve the specific missing-baseline question; it cannot resolve missing page evidence. Generated TypeScript retains the original assertion and appends exact-version QA checks. Independent API proposals retain exact record IDs, validated field names and LIMIT 1. No proposal grants execution authority.

`bindReviewedQAContext` is a trusted-host integration point for an already authorized Page, exact checks and independently approved read/permission/masked-capture adapters. It cannot launch or authenticate a browser, activate a policy or submit an action. A generated test without its host binding fails. The existing browser guard/action broker still owns networking and UI actions. No new live composition is activated in this increment.

## Permission intelligence

`permission-intelligence.ts` consumes saved identity/version-bound inventories. It follows the current user's profile, direct assignments and group components; group-local muting never subtracts an independent grant. Object and field candidates must both allow an operation. Missing assignments, fields, group status, muting or partial inventories stay unknown, rather than inferred denial. The adapter intentionally requires explicit complete evidence; it is not a general Salesforce authorization evaluator.

Candidate profile/set/group grants and sharing declarations do not prove effective access. Runtime receipts must explicitly match the observed object, field, operation and source/persona scope. A read denial cannot prove edit denial. Record sharing, restriction rules, licenses, session activation and alternative personas remain review questions without separately authorized runtime evidence. The synthetic demo exercises actual GET denial for **read**, not a real edit attempt.

## Reviewed visual baselines

Use existing contained, masked screenshot manifests. A frame binds its immutable manifest entry and image hash, session/run/validation, org/persona/metadata/graph, local engine, render profile, masking version and raster dimensions. The entry hash permits the original capture manifest to append later frames without changing the reviewed frame. Integrity, containment, validation class and dimensions are checked on every comparison.

Baseline approval requires a separate named exact content-version review, reviewed literal visual expectation and accessibility locator evidence. It records critical regions, explicitly reviewed dynamic rectangles, tolerance and masking acknowledgement. Unreviewed images cannot become baselines automatically. New source/render/engine/masking versions require a new compatible baseline review. Previous versions remain immutable.

The bounded PNG comparator supports Chrome RGB/RGBA 8-bit non-interlaced screenshots, validates PNG integrity and never resizes images. Dynamic exclusions total at most 10% of the raster and cannot overlap critical regions. Changed pixel count/ratio, bounding rectangle and per-critical-region counts are reported. Explicit role/name/visibility facts accompany pixel evidence. Missing facts remain unknown. Differences produce **review required**, not a confirmed visual defect, automatic baseline update or verified lesson. This is focused visual/accessibility signal detection, not full WCAG conformance or semantic vision.

Images and traces remain local. The new planning/publication path enforces `KnowledgeIndex.assertLocalOnly()` before retrieval or ingestion. Reviewed rule documents are indexed as **reviewed declarations, runtime unverified**, not lessons. Existing current-source invalidation and persona isolation apply. Gemini and gemini-embedding-001 adapters are preserved; external reasoning/embedding still requires the existing separately reviewed minimized-payload path.

## Local execution

```powershell
npm run typecheck
npm run unit
npm test
npm run demo
npm run demo:graph
npm run platform -- demo-qa-intelligence
npm run platform -- qa-intelligence .state/qa-cached-input.json
```

The demo uses a synthetic Account/Contact preview fixture, local installed headless Chrome and real same-context MCP observations. Five typed oracles, one restricted-persona read expectation and one visual baseline cover seven scenario kinds. Fixture review names are explicitly synthetic. No Salesforce calls or external AI occur. Four masked captures demonstrate an approved clock change, layout shift and accessibility regression candidate. A generated Playwright callback is exercised by the headless regression suite using real assertions and an independent fixture API; a wrong API name fails while the original UI expectation still passes.

`qa-intelligence` consumes a bounded workspace JSON manifest:

```json
{
  "spec": ".state/reviewed-spec.json",
  "org": ".state/org-snapshot.json",
  "graph": ".state/component-graph.json",
  "permission": "dedicated-qa-test-user",
  "changes": ["Field:Contact.LastName"],
  "checks": {"oracles": [], "permissions": [], "visuals": []}
}
```

An optional `model` path must match the existing journaled exact review; check versions must already have independent reviews in History. This command reviews/activates nothing and configures no remote services. Missing contracts/model produce a gap report, not fabricated tests. HTML/JSON reports stay under ignored `.state`; images remain under ignored `artifacts/browser-debug`. Reports escape source content, disallow scripts/network and include traceability, risk/history, personas, declarations, receipts, meaningful visual differences and unresolved questions.

## Shortest future Salesforce verification

No live package is prepared here. If separately requested, first obtain independent business-owner review of one existing Account/Contact outcome and an exact read-only persona/record/field expectation. Reuse saved current-source reconciliation and the working local Chrome/MCP readiness profile; obtain fresh exact org/user/origin/record/session/read authorization and identity proof. Observe the existing record and use an independently authorized exact-ID SOQL read; compare source-grounded outcomes, with no actions or factories. Separately approve a masked baseline from that observation and compare a second authorized observation under the same engine/render/source scope. A read-only scope can verify observable read expectations; mutation, validation-on-save and alternate-persona effective access need their own later approvals. Keep both declined scopes inactive, and publish no lesson without the established failure/fix/regression evidence.
