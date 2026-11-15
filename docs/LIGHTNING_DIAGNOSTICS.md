# Lightning rendering diagnosis without a new data lifecycle

## Actual fresh-session observation - 2026-11-15 IST

The exact 20-resource and independent read-only grants were approved. The stale browser export failed identity proof before observation; after the user refreshed qa-user.json, a new minimized copy passed native proof for both origins. The actual diagnostic reverified two absent run-005 IDs and recorded two document-200 responses, 11 unapproved static paths, no reviewed static completion during the bounded window and no authentication redirect. The exact document was unavailable at capture, so rendering and selectors remain unproven. No business RPC, record write, assertion, generated test or learning occurred.

A cumulative 31-resource draft and matching diagnostic session review are pending separately: .state/dedicated-static-current-session.review.json and .state/dedicated-diagnostic-current-session.review.json. They retain the 20, add the 11 observed paths and add no origin or business read. Baseline source files are preserved in .state/diagnostic-20-source-evidence. New paths are not treated as semantically equivalent to old ones, and the denial is not declared causal.

To import fresh approved state using the read-only grant, run dedicated-diagnostic-import EXECUTION_FILE .auth/qa-user.json --diagnostic-approval APPROVED_DIAGNOSTIC_FILE. It returns a new private copy path and preserves the original; pass that copy to dedicated-dependencies with the same grant. No new receipt or write approval is created. Resource and diagnostic hashes must match before observation.

This continuation starts from 653c46f and preserves all 15 agent owners and cumulative requirements. No new Account/Contact lifecycle is authorized by diagnostic commands. Historical six-record cleanup evidence is preserved; generated live UI tests and Salesforce learning remain unexecuted.

## Source review

The exact 20-resource draft adds two observed component-definition script URLs to the prior 18. The closest matching prior URLs differ only in `_style`; no resource was removed and no origin was added. This is an observed dependency difference, not proof that it caused selector failure. The exact source URLs stay in ignored local review files; command output exposes hashes, counts and known parameter names.

```powershell
npm.cmd run platform -- dedicated-resource-audit .state/dedicated-static-review-20.json .state/dedicated-static-source-18.json --observed .state/dedicated-static-observed-next.json
npm.cmd run platform -- dedicated-ui-review .state/dedicated-qa-execution-005.json
```

The resource audit validates content hashes, org/user/policy/spec bindings and exact observation provenance. It neither approves resources nor normalizes different query values into existing grants. Retrospective UI review keeps the failed run unchanged. Legacy evidence without runtime observations remains explicitly `not-captured` or `unclassified`.

## Independent diagnostic authorization

Previous environment, static and factory approvals can expire independently. A diagnostic review can be prepared from a completed, certain, journal-owned, deleted run even after those write approvals expire:

```powershell
npm.cmd run platform -- dedicated-diagnostic-review .state/dedicated-qa-execution-005.json .state/dedicated-static-review-20.json
```

The output `.state/dedicated-diagnostic-session.review.json` is inactive (`REVIEW_REQUIRED`). Its exact plan binds the named operator, org/user, parent definition, completed run, data/UI hashes, spec version, static plan and deleted record IDs. Limits are fixed: no record writes, business RPCs, assertions or learning; two documents at most; ten seconds of metadata observation; one-hour authorization at most.

An operator must explicitly approve the exact diagnostic grant and static bundle before activation. Preparation is not approval. The diagnostic reader exposes only fresh identity and signed-ID absence checks; it exposes no generic GET, mutation, factory, bridge or metadata SOAP transport. It does not edit persisted parent policy or factory/UI execution approvals. Parent grants and normal environment modes keep their existing behavior.

Once those local files are independently approved, the bounded command is:

```powershell
$session = Get-Content .state/dedicated-diagnostic-import.json -Raw | ConvertFrom-Json
if ($session.status -ne 'verified') { throw 'A fresh independently verified import is required' }
npm.cmd run platform -- dedicated-dependencies .state/dedicated-qa-execution-005.json $session.statePath --diagnostic-approval .state/dedicated-diagnostic-session.approved.json
```

Every session re-verifies API identity, active dedicated user, journal ownership/certainty, actual absence and browser org/user proof. A present/restored reference, unknown identity layout, authentication redirect, expired/mismatched grant or different resource set blocks observation. No old run ID is reserved or replayed. Session receipts and source state are not overwritten.

## Evidence and interpretation

| Category | Captured evidence | What remains unknown |
|---|---|---|
| Authentication | Native session failure code and observed authentication-document redirects | API JWT success cannot establish browser identity; redirects are not followed |
| Static resources | Exact review matches, HTTP status/MIME classes, denied URL hashes and structural parameter differences | A denied asset is not automatically necessary or causal |
| Read contracts | Existing validator support versus unsupported/unknown RPC, with deliberate metadata-mode denial recorded separately | Unknown controller actions cannot be approved as read-only without implementation/source review |
| Rendering | Finite script-error names, network-failure counts and per-document ready state/DOM/heading/alert/busy/custom-element/open-shadow counts | Counts and an HTTP 200 do not prove complete Lightning rendering |
| Selectors | Source-bound observed/unobserved/ambiguous/text-mismatch outcomes and unchanged expected-value hashes | An absent selector does not establish an incorrect locator or an application defect |
| Learning | Explicit unconfirmed-cause and unexecuted/learning-ineligible markers | No negative-page diagnosis becomes verified business knowledge |

Full URLs eligible for static review are saved separately in the ignored `static-observations.json`; runtime output contains no request headers/bodies, DOM text, cookies, redirect queries or raw error messages. Metadata mode blocks every business RPC, including ones supported by the ordinary owned-read guard. That intentional block is not a missing read contract. Unknown operations remain blocked and are not turned into approval requests merely because their names resemble reads.

`dependencies.json` binds the current runtime evidence to run/data/policy/spec scope. `dedicated-ui-review` can join that evidence with earlier selector observations, clearly labeling it as **known-deleted negative-page metadata**, not a successful Account/Contact assertion. Cross-run/version joins are rejected.

## Continuation gates

The prior UTC day consumed three data runs. The fresh 15-November UTC check found **zero used after 05:30 IST**. This does not authorize a lifecycle. No quota increase, auto-run or replay is prepared. A future lifecycle requires supported rendering, reviewed actual locators with unchanged assertions, fresh exact factory/UI/session approval and a new run ID. Deleted pages cannot prove positive Account/Contact selectors. Preserve owned setup, independent pre/post SOQL, reverse cleanup, actual generated execution and learning gates.

Gemini chat and `gemini-embedding-001` remain configured unchanged. These diagnostics make no external AI request and transmit no Salesforce record data to a model.
