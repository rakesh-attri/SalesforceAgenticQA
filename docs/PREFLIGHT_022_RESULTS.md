# Actual diagnostic 022 result and canonical API path correction

November20, 2026. Exact operator-approved diagnostic022 executed once at10:59:43-10:59:45IST, before its unchanged original deadline. **It failed before native browser preflight.** Its intent is consumed and cannot replay, even while the original grant remains within its time window.

| Stage | Actual result | Evidence boundary |
| --- | --- | --- |
| JWT | PASS | One real OAuth exchange, HTTP200. No token retained in diagnostics. |
| Fresh API org/user identity | PASS | Four real GET responses, all HTTP200; exact identity checks passed twice. |
| Active-user query | BLOCKED by framework | The exact-path guard denied the request before dispatch. This is not a Salesforce permission rejection. Current active-user response remains unverified. |
| Selected app | NOT EXECUTED | The preceding gate stopped execution. |
| Browser cookies/native identity/build | NOT EXECUTED | No browser launch or Page; current browser login validity remains unknown. |
| Business-record reads/writes, generated tests, cleanup, reportingLabs | NOT EXECUTED | No Account/Contact read, factory, mutation or owned record; no new readiness receipt or verified lesson. |

## Confirmed cause of022

The review generator used `encodeURIComponent` to construct an exact user-query path. That function left the query's apostrophes literal. `SalesforceClient.readRequest` then constructed a WHATWG URL, which serialized those apostrophes as `%27`. The guard compared the resulting `pathname + search` with the uncanonicalized saved string and rejected it.

Local analysis of the actual saved plan, source and denied stage establishes identical decoded query values, one exact query parameter, approved origin/method and available request budget. Only the serialized path differs. The one framework denial occurred before the actor request was added to dispatched transport rows; all five prior requests were successful. An offline reproduction through the actual reviewed API preflight produces the same denial with synthetic identity and mocked HTTP.

The denied full URL was not retained. Its canonical representation and hashes are reconstructed locally from the pinned client, saved exact user/version and actual guard logic; they are not a newly captured raw request.

This establishes022's **framework URL-contract defect**. It does not establish018's discarded inner exception:018 used a different, broader transport guard. Do not label022 a stale cookie, failed Salesforce permission, app mismatch, rendering error or selector defect. Those checks did not run.

## Correction and verification

The existing Salesforce client module now exports `browserPreflightApiPaths`, a pure proposal helper for the four fixed identity/actor/app paths. It validates API version and user-ID shape, then uses the same URL serialization as the client. Future review generators reuse this helper. It grants no authority and accepts no caller-supplied SOQL.

Runtime exact-string matching remains strict. The request origin, user, fields, query and number of parameters are unchanged. The helper does not decode arbitrary incoming requests or admit equivalent-looking additional operations. Integration tests execute the actual preflight under the corrected exact allowlist and reject changed user IDs, queries, origins, extra/duplicate parameters, fragments and malformed inputs. The old red reproduction and new passing test are retained separately.

022's signed review, original source snapshot, approval, intent and outcome remain unchanged. A separate postmortem links the source/hash evidence without retaining raw SQL, IDs, provider bodies or credentials. Future denial diagnostics also distinguish framework contract rejection from Salesforce HTTP failures using closed classifications and hashes.

Final canonical-fix validation: typecheck PASS;392/392 full unit/integration tests (577353ms), zero failures/skips;5/5 headless tests (26.8s); required demo PASS; focused actual-service canonical-path test PASS. Private corrected recipes typecheck. No live retry or new service call during correction. Original022 intent/outcome stay consumed/unchanged;018's cause remains unknown. All validation precedes the next inactive review window; user discovery edit is preserved/excluded. No new review window starts while the full regression suite is running. The same confirmed scoped022 export may be bound in a new review; this does not prove its live validity or rebind022.

## Local evidence and next decision

After all checks passed, independent `SFQA-DIAG-20261120-023` was prepared **INACTIVE**. Review: `.state/lifecycle-preflight-SFQA-DIAG-20261120-023/REVIEW.html` or `REVIEW.md`, with `plan.review.json` and `manifest.review.json`. Activation hash: `b63e90987ebc80de1964d6331434ddd636eb66223da71417c0b23f987a02569b`. Original expiry: **November20 12:18:23p.m.IST**; latest start: **12:13:23p.m.IST**, preserving the five-minute reserve and unchanged one-hour policy limit. It reuses the unchanged confirmed scoped022 state, with live validity still unknown. Canonical exact paths and source/receipt/state bindings passed local audit; prospective normal-Production/cross-org/user/data/altered-path negatives and local HTML checks passed. There is no approval file, execution intent or new live call. Same operation/user/query semantics, no data capability or broader matching. The single next decision is fresh exact read-only/native-effects/access consent for023;022 cannot replay.

Private evidence remains ignored by Git:

- `.state/lifecycle-preflight-SFQA-DIAG-20261120-022/{outcome.json,report.html,execution-intent.json,url-denial-analysis.json,client-source-at-execution.ts}`.
- `.state/diagnostic-022-url-before.log`: intentional offline reproduction failure against the old generator.
- `.state/preflight-023-canonical-focused.log`: corrected helper tested through the actual service with mocked HTTP.

After offline validation, a new source/state-bound diagnostic requires **fresh exact read-only and native-risk/access consent**.022 is consumed; canonicalizing its query or changing its source does not authorize retry. No factory/data package, quota reset or broader permission is prepared. The later full Account/Contact lifecycle still requires actual current prerequisites and separate business/native/final approvals. All15 responsibilities, cumulative P0/P1/P2 and prior integrations remain preserved; no Gemini/RAG validation was repeated.
