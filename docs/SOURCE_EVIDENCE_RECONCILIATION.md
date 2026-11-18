# Salesforce source evidence reconciliation

The earlier Account gate compared two different artifact domains. It correctly
stopped execution, but the conclusion that the hashes represented metadata drift
was too strong. The reconciliation service reproduces both producers, checks the
saved host journal, and relates the artifacts without replacing either hash.

## Findings from saved Salesforce evidence

| Value | Meaning and original producer |
|---|---|
| `9c734a03…` | Dedicated specification content, created in dedicated-review.ts before SpecSchema adds default positive kinds/warnings. Browser sourceVersion inherited this **specification** version through the reviewed static/initialization chain. |
| `f4011604…` | Published org intelligence fingerprint: schema plus bounded metadata sections, with the existing canonicalization rules. This is the parent automation-review and graph knowledge version. |
| `54089efe…` | Describe/schema fingerprint, excluding capture time but retaining the producer's alias/source and sorted object/field representation. |
| `8ac7e7f5…` | Full parsed snapshot publication hash, including capture time and coverage. |
| `0b7e1457…` | Full intelligence publication version, distinct from its semantic fingerprint. |

The historical execution package's parsed metadata snapshot and the current local
snapshot are identical. Both refer to the November 14, 2026 10:24:52.754 UTC
capture. The current intelligence content reproduces f4011604…, and the 909-node,
365-edge component graph reproduces its own version and that knowledge binding.
No metadata change is demonstrated by the two originally compared hashes.

The saved Account and Contact readiness rows reproduce their journal hashes and
match the same org, user/persona, app and build. Their observations occurred on
November 17 at 04:10:57.466 / 04:13:21.837 UTC, with independent unchanged-record
checks at that time. Their readiness expiries are 04:25:57.466 / 04:28:21.837 UTC.
They are expired historical evidence, never current execution authority.

All these findings are **offline reconciliation of saved evidence**. They do not
establish current Salesforce authentication, permissions, layout, metadata or
record freshness. No browser or Salesforce request is required for reconciliation.

## Narrow compatibility contract

SourceLineageStore extends existing SQLite evidence/version storage. A canonical
identity combines artifact kind, logical name and exact hashed org/user/persona
scope. Each artifact retains its original version algorithm and immutable content
hash. Snapshot, intelligence, component graph, specification, browser observation,
locator, reviewed workflow, RAG knowledge and readiness are separate kinds.
Parent edges retain provenance; they never mean equal hashes or extra permissions.

The compatibility definition binds the exact existing record hash, historical
browser hash, selector contract, parent policy, org/user/persona, app/build,
origins, specification version, current snapshot/intelligence/graph versions and
all seven mandatory source artifacts. It permits only existing-record observation.
Its named review is separate from the fresh browser/profile/read/run approvals.
The original browser/view/profile sourceVersion remains 9c734a03…; the application
study's metadataVersion remains f4011604…. Neither is copied onto the other.

Known capture/publication-only differences can be classified separately when the
schema and semantic evidence match. Actual Describe differences remain rejected.
Alias/canonicalization differences and unexplained intelligence/graph publication
changes are reported separately and remain blocked when the required historical
comparison is missing. A hash difference alone is never a Salesforce business
change, and a hash match alone never establishes business behavior or access.

Missing/tampered journal rows, unsupported specification canonicalization,
unreproduced metadata, changed fields/dependencies, foreign org/user/persona/app/
build/record, changed selectors and stale lineage fail closed. Chronology cannot
silently roll back a publication. Traversal is bounded. A changed ancestor also
blocks registered workflow lookup and excludes registered RAG knowledge from
retrieval; actual derived-content hashes are checked as well. Existing artifacts
without these new optional bindings retain their existing source/schema gates.

The reviewed-workflow and reviewed-knowledge bridges attach only artifacts already
present in WorkflowModelStore/KnowledgeIndex with their existing exact review and
evidence. They create no model, knowledge document, authority or lesson. The
recorded-failure/cause/fix/passing-regression learning gate remains unchanged.

## Offline review and commands

Create a private input under `.state` with `runId`, `history`, `browserHistory`,
`historical`, `org`, `intelligence`, `graph`, `parent`, and one/two `observations`
containing saved `review`, `report`, `view` paths. JSON/database inputs must be
bounded, contained workspace files. The historical package is read for existing
specification/scope/metadata evidence only; no factory package is created or run.

```powershell
npm.cmd run platform -- source-reconcile .state/source-reconciliation-input.json
Start-Process '<returned-local-index.html>'
```

Results include local HTML/JSON, exact findings/source links, and inactive per-object
`*.lineage.review.json` files with REVIEW_REQUIRED. They grant no permissions. A
fresh preparation input may include the applicable `lineage` path beside each
observation. Unknown mismatch without a compatible journaled lineage still blocks.

```powershell
npm.cmd run platform -- live-exploration-prepare .state/reconciled-account-prepare.json
Get-Content .state/live-exploration-<fresh-run-id>/manifest.review.json
```

Preparation stores only inactive grants. The manifest contains both the inactive
draft hash and the exact proposed **post-approval** definition hash. The latter
changes only named approval fields to the proposed operator; all sources,
assertions, hashes, state binding, limits, nonce and original expiry stay fixed.
This avoids asking an operator to approve a hash that activation would change.

After separate explicit authorization, an operator supplies the exact named
authorization JSON (original definitionHash, nonce and expiry) via the run input's
`authorization` path. The activation command verifies the whole proposed package
and unchanged independently approved state export, then writes new approved files
once. It performs no browser/API execution and cannot renew or replay a package.

```powershell
npm.cmd run platform -- live-exploration-activate .state/live-exploration-<fresh-run-id>/run.json
npm.cmd run platform -- live-exploration-run .state/live-exploration-<fresh-run-id>/run.approved.json
npm.cmd run platform -- live-exploration-report .state/live-exploration-<fresh-run-id>/run.approved.json
```

Do not fill approval names or run activation without the operator's fresh exact
authorization. If a browser export changes, a grant expires or a session was
consumed, retain the rejection and obtain a new explicitly reviewed binding/scope.
The new grant does not renew any factory or parent write approval.

## First live Account boundary

The prepared Account goal has one direct-record observation reference and no UI
clicks/forms/agent steps. It preserves the actual reviewed name, Related/Details,
busy/fault and one-second stability assertions. Current JWT/API and native browser
org/user/app/build/local-engine proofs must pass, followed by separately approved
exact Account Id/Name/LastModifiedDate reads and independent pre/post comparison.
The current export is only a binding until these live checks succeed.

The DEDICATED_QA_NORMAL_CHROME native-network profile still requires separate
acceptance of unreviewed/potentially irreversible background effects and reviewed
dedicated-user access. Native request/byte limits close after observation, not
before in-flight effects. Scoped equality is not proof of global server purity.
Masked images remain local with best-effort masking and no AI/upload use.

Only actual authorized execution can produce a Live Exploration Intelligence
receipt. Direct Account observation does not establish Contact navigation, a
transaction, generated Playwright test passes or verified business learning.
reportingLabs remains the actual generated-test reporter. Package 012 remains
declined/inactive; no replacement live factory/write package is authorized.
