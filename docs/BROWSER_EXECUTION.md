# Reviewed Salesforce Lightning browser execution

This increment continues `d0bf874` on `feature/verified-discovery`. It adds a dedicated execution boundary alongside the existing observers; it does not replace their behavior. Live rendering is **unresolved** until the new scope is explicitly approved, a fresh native session passes, and an actual Account observation succeeds. The nominated existing QA Account is an observation reference, never factory-owned data.

## Dependency chain and architecture decision

The next chain is: audit existing request/source evidence → build-bound inactive policy → separate initialization risk review → fresh API and actual browser identity/build → no-create Account comparison → actual selector review → fresh factory/UI/run approvals → generated Playwright → independent SOQL → owned cleanup → reportingLabs → eligible execution learning. No stage can infer completion of the next.

The old metadata diagnostic deliberately rejects every XHR/fetch, including supported record reads. It cannot serve as a Lightning execution session. Its isolated per-URL CDN transport and ten-second observation window also differ from a normal authenticated browser. These are architectural differences, **not demonstrated causes** of the Salesforce rendering failure. [Playwright documents that routing disables its HTTP cache](https://playwright.dev/docs/api/class-page#page-route). Consequently the new cache is explicit and policy-scoped; neither routed transport is described as an unrestricted human-browser baseline.

| Session path | Initialization and transport | Agent authority |
|---|---|---|
| Existing Production observer | Original strict no-JavaScript/read DSL, identities, origins, request restrictions | Unchanged; no dynamic Salesforce journeys or writes |
| Existing dedicated metadata diagnostic | Original exact-resource grants, all business RPCs blocked | None; known-deleted-page evidence only |
| `DEDICATED_INITIALIZATION_AUDIT` | New exact identity/build policy; no initialization contracts | No agent actions or workflow permits |
| `DEDICATED_REVIEWED_EXECUTION`, observation reference | Reviewed versioned resources, documented UI API or explicitly selected existing scoped-read contracts, separately authorized initialization | No agent actions, forms or record writes; existing records cannot enter cleanup |
| `DEDICATED_REVIEWED_EXECUTION`, owned run | Same initialization boundary plus active exact factory journal and independently verified IDs | Separate reviewed workflow hashes, step budget and one-use action journal; network writes remain blocked |

`SANDBOX_QA`, `PRODUCTION_READ_ONLY_QA` and `PRODUCTION_CONTROLLED_QA` do not accept a dedicated browser policy. Neither an environment flag nor `IsSandbox=false` enables it. The existing JWT, browser-state, native org/user, factory, ownership and cleanup checks remain. The browser facade exposes no generic GET, mutation, factory or bridge API. A separately approved browser expiry is used only in its local restricted facade; persisted parent/factory/UI authorization is never renewed.

## Versioned resources and cache

Review preparation groups already observed resources by exact origin, pathname, resource type, closed query-key set and component definitions. A native document independently proves the framework/app build hashes before execution. Context values such as `_uid`, `_style`, `_au` and `_cl` may vary only within the reviewed rule. New paths, definitions, origins or builds require policy review, rather than individual approvals of each context URL. Exact encoded Salesforce pathnames are matched literally; prefix rules reject encoded separators. Prefix rules exist only for bounded non-executable image/font roots and extensions.

Public Salesforce CDN resources use a shared in-session credential-free fetch broker and persistent SQLite cache. Requests omit credentials and browser headers, follow no redirects, enforce TLS origins, MIME, size, duration and total-byte budgets, reject HTML disguised as script/style and credential-varying/Set-Cookie responses. Cache scope includes org, user, build and the complete policy hash; key includes the complete URL and type. Cached bytes and headers are validated, TTL is at most five minutes and approval expiry, and global retention is bounded to 256 entries/128 MiB. Changed content under an unchanged cached build fails closed. Only public code/assets are cached. Authenticated first-party resources retain native same-origin cookies, are validated and never cached. API/documents/authentication responses are never cached or synthesized.

`native-reference` permits browser-native transport only for the same reviewed resources and requests. Public CDN requests carrying Cookie/Authorization are blocked. It has no owned-run or agent authority. Both transports still use routing, service-worker blocking, exact record navigation and the same RPC restrictions. Without an operator-supplied normal-session HAR, this is a **policy-matched transport comparison**, not a normal unrestricted session comparison.

## Initialization is separate from agent actions

There is no `get*` controller allow rule. POST is not generally enabled. A native Aura batch must pass the exact origin/path, envelope, framework/app context, descriptor, query fingerprint, parameter shape/value and call budget. Unknown controllers, extra parameters, mixed mutation batches, unrelated records and high-risk controllers remain denied. The optional `existing-scoped-reads-v1` profile reuses the original six fixed record/object/layout read contracts with exact record/object and View-only constraints; it cannot grant other business RPCs.

The observed `OneController.getCurrentApp` request had one `appContextIdOrName` matching the independently queried selected-app ID. Local client analysis did not establish the server implementation, purity or required response schema. [Salesforce's general storable-action guidance](https://developer.salesforce.com/docs/platform/aura-platform/guide/controllers-server-storable-actions.html) is not evidence about this particular internal controller. No Salesforce API response is replaced to manufacture rendering.

The only undocumented exception supported by this implementation is that exact current-app action: one action/request, the three observed envelope keys, exact query fingerprint, one app-ID parameter, pinned org/user/build/app and at most one call per context. It **always** retains `unknownEffects=true`. A second named, expiring receipt must explicitly acknowledge undocumented server semantics and bind the complete contract definition. Approving only the outer policy does not approve the exception. High-risk/Apex/financial/admin operations cannot obtain this exception. The false mutation/financial flags describe prohibited authority, not proof of an undocumented server's purity.

Initialization cannot call the agent broker. Reviewed click/fill steps require the active certain owned run, exact verified record document, source-reviewed workflow hash, same operator, remaining action budget and a one-use persistent step claim. Template hashes support review before Salesforce assigns IDs; resolution uses only the exact journaled factory plan and closed placeholders. Assertions are unchanged. Completed/pending/uncertain actions cannot replay after a resource-policy change. Unreviewed fill/submit/save/delete/financial/admin requests remain blocked by the network boundary; dangerous locators are also rejected. Browser API assertions cannot bypass the boundary through Playwright's separate request fixture: dedicated workflows use the existing independent scoped SOQL adapter.

The new profile currently rejects autonomous exploration packages until an action-broker adapter is implemented. Existing bounded fixture/legacy exploration remains available. This limitation is explicit, rather than silently granting autonomous authority with initialization.

## Preparing and running the no-create proof

Keep private input, state, reference HAR, policies, cache and reports under ignored `.state`/`.auth`. Do not paste their contents into chat or Git. `browser-review` requires a local input containing `runId`, approved `statePath`, and exact `references` (`object`, `id`, `purpose: observation-only`). Its default source files are the previously reviewed static manifest and frozen initialization evidence. It emits an inactive base policy with no undocumented RPC and a separate inactive candidate with its risk receipt:

```powershell
npm.cmd run platform -- browser-review .state/browser-reference-input.json
```

Review `.state/dedicated-browser-base.review.json` or `.state/dedicated-browser-execution.review.json`. Only explicit named exact approval may activate a separate approved copy. Do not set approvals through AI/model output. No activation CLI, auto-renewal, factory renewal, quota increase or default execution switch exists.

After approval, use its exact reviewed state path. A failed native identity proof requires a fresh independently approved normal-login export; JWT access alone is insufficient.

```powershell
$source = Get-Content .state/browser-reference-input.json -Raw | ConvertFrom-Json
npm.cmd run platform -- browser-probe .state/dedicated-browser-execution.approved.json $source.statePath --object Account --transport native-reference
# Use the resulting *.trace.json path, without exposing its private source.
npm.cmd run platform -- browser-probe .state/dedicated-browser-execution.approved.json $source.statePath --object Account --transport validated-cache --reference .state/browser-probes/REVIEWED_SESSION/REFERENCE.trace.json
```

The candidate allows only two sessions, each at most 60 seconds/200 routed requests/64 MiB (8 MiB per resource), and zero agent actions. Session reservations persist, including failed attempts; changing transport or restarting does not reset them. The API facade re-verifies exact identity, active user, selected app and approved record. The browser verifies original state hash, actual loaded cookies, both native identities and build, then permits only the exact reference document. Independent pre/post Name/LastModifiedDate hashes cover **only that Account**, not all possible app/session effects. Existing records are never adopted for cleanup. Reports contain hashes/counts/classifications, no record names, tokens, headers or raw response values. No external AI is called.

An optional normal-session HAR can be imported locally and sanitized:

```powershell
npm.cmd run platform -- browser-reference-import .auth/normal-account.har .state/dedicated-browser-execution.review.json
npm.cmd run platform -- browser-compare .state/browser-reference.sanitized.json .state/browser-probes/REVIEWED_SESSION/CONTROLLED.trace.json
```

Import retains neither credentials nor request/response values, never proves identity, and grants no permission. Comparisons require matching org/user/build/app/record scope. HTTP 200 Aura ERROR is not success. Blocked requests, actual HTTP/Aura errors, resource validation failures and unavailable response inspections remain distinct. Correlation never becomes a proven rendering cause automatically.

## Lifecycle continuation and validation

After real rendering and actual Account/Contact selectors are reviewed, prepare a **new** data run and exact factory/UI/session approvals. Its browser policy must have `ownedDataPlanHash`, empty observation references, `validated-cache` only, sufficient bounded sessions, and its hash in `ui.plan.browserSessionPolicyHash`. The pipeline proves native identity/build/app before reserving data, derives actual record IDs from the certain factory journal, reviews unchanged selectors, and runs generated tests with the sole browser boundary. Each generated context repeats fresh API, actual browser, build, ownership and session-budget checks.

```powershell
npm.cmd run platform -- dedicated-run .state/NEW_REVIEWED_EXECUTION.json --browser-policy .state/NEW_REVIEWED_BROWSER_POLICY.json
npm.cmd run typecheck
npm.cmd run unit
npm.cmd run demo
npm.cmd run demo:graph
npm.cmd run platform -- demo-learning
npm.cmd test
```

The lifecycle preserves independent SOQL, reverse owned cleanup, uncertainty recovery, reportingLabs and evidence-backed learning gates. No old run is replayed. Offline `browser-pipeline.test.ts` executes two generated Playwright tests and actual local reportingLabs with mocked Salesforce, leaves an unrelated record untouched and denies mock adapters claiming live validation. `browser-runtime.test.ts` executes both headless transports and tests separate risk receipts, safe HAR comparison and the narrow API facade. `browser-policy.test.ts` tests normal-mode/org/user/build isolation, resource/cache rules, budgets, ownership and unchanged generation. No live Salesforce UI/lifecycle pass is inferred from those results.
