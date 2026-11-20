# Lifecycle 018 preflight investigation

November 20, 2026; continuation from c834307. No fresh Salesforce or external-model call has been made during this investigation. Lifecycle018 remains consumed and its original package, consent receipts, report and deadlines are unchanged.

## What the saved evidence establishes

The last completed stage is `fresh-org-user-and-browser-session-verified`. The next composite gate, `reviewed-lightning-build-and-app-preflight-complete`, did not complete. Its exact first failed substage was not retained. The historical cause therefore remains **UNRESOLVED**.

The saved transport contains two successful JWT exchanges and 17 successful Node GET responses. This does not prove that response shapes, active-user/app expectations, native context cookies, native HTML/build parsing or browser disposal passed. It also cannot distinguish a native HTTP failure from a successful HTTP response that failed local verification. No factory reservation, mutation, record journal entry or main browser-session reservation exists for018. Created/deleted/active/uncertain owned effects remain zero. There was no generated live test, owned MCP observation, cleanup or live reportingLabs execution.

Local inspection confirms the original package/report hashes and scoped-state binding still match. The installed local engine binding also matches. The scoped export contains only approved origins and secure session cookies; its current server-side login validity is **UNKNOWN**. Local validation cannot establish a live session. The original export and everyday browser profile are untouched.

## Confirmed defects and corrections

The existing preflight services were exercised with realistic synthetic identity/state/bootstrap fixtures and mocked HTTP/browser transport, rather than injecting a generic failure at the pipeline boundary.

1. **Disposal could replace the original failure.** A build timeout followed by `browser.close()` failure returned the disposal exception with no attached build diagnostic. The actual preflight reproduction failed before the correction and passed afterward. Both browser preflight and native-session verification now preserve the primary failure while recording disposal failures separately. Disposal failure after otherwise successful verification still blocks success.
2. **Typed wrapping and absent observers could lose diagnostics.** The existing stage helper now retains closed stage/reason/timing metadata even without a persistent observer. Native session error translation copies only validated diagnostic metadata into the safe wrapper. Raw causes, provider text and credentials are not copied.
3. **Actor and app checks were indistinguishable.** The existing reviewed API facade now distinguishes API identity, exact active actor and selected-app checks. Denied reads, malformed responses, inactive/changed actors and app drift retain distinct closed reasons. No generic transport or mutation method is exposed.
4. **Unknown errors could collide with inherited object properties.** Closed-code lookup now uses own-property checks, so strings such as `constructor` remain unknown instead of corrupting diagnostic classification.

The existing pipeline report now includes a sanitized primary `failureDiagnostic` with stage, reason and category, alongside its persisted stage events. The primary failure survives outer catches and cleanup; cleanup failure cannot produce a passing lifecycle. Changed state is rejected before browser launch. Exact identity, app/build, cookie comparison, original UI assertions, budgets, ownership and cleanup rules are preserved.

These are verified **offline diagnostic defects**, not proof that any one caused018. Nothing reconstructs the discarded historical exception. No Salesforce business defect or verified learning has been fabricated.

## Offline evidence

`unit/lifecycle-preflight.test.ts` covers the actual API and native preflight services: primary timeout plus disposal failure, native identity redirects, changed actual cookies, HTTP build failure, unsupported bootstrap source, build drift, native-session wrapping, disposal-only failure, unchanged success, changed state, expired/cross-org/cross-user approvals, malformed/inactive actor, malformed/changed app and denied API reads. It also checks secret sentinels and observer-free diagnostic preservation. Existing pipeline tests verify that the summary survives into its report without writes, test results or verified learning.

The initial focused run passed32 tests. Final offline verification: typecheck PASS;391/391 full unit/integration tests (958831ms), zero failures/skips;5/5 installed headless tests (58.9s); required demo PASS. Initial32 focused tests and the intentional red-before/green-after actual-service reproduction passed their expected outcomes. Private review recipes typecheck. Diagnostic corrections remain OFFLINE verified; fresh live verification/E2E are BLOCKED pending separate exact consent; the refreshed input is now confirmed. No new Salesforce/Gemini/Chroma call, factory, quota reset or verified lesson; user discovery edit preserved/excluded. All expensive regression work precedes creation of the final time-limited review.

## Minimum fresh live decision

Fresh input is now confirmed and separately scoped. `.auth/qa-user-scoped-20261120-022.json` removed35 out-of-scope cookies and one origin; the original export is unchanged. Its current live validity remains unknown. After all391 unit/integration, five headless, typecheck/demo and private recipe checks completed, the inactive review was created at November20 10:34:59IST. Local saved-package, prospective-scope/negative-boundary and headless HTML checks passed without service calls.

Review: `.state/lifecycle-preflight-SFQA-DIAG-20261120-022/REVIEW.html` or `REVIEW.md`, plus `plan.review.json` and `manifest.review.json`. Original expiry: **November20 11:29:59IST**; latest start: **11:24:59IST**, preserving the five-minute execution reserve. Activation hash: `35777c0259b8673e37e6642cdd2f504818c3db6ad6373a3a59f399301c2b6214`. Read-only policy: `10c1135c0df3c5b39f02d52a32d0c3d4a1ba1116d347b96b8fdbed256b863cb5`. Native profile/risk: `164e47aa6277eef267fd532b613b212d88b4b94f12783977952506f9063f4589`. Both read-only execution and native-effects/access acceptance require exact fresh operator consent. There are no approved files, execution intent, service calls, factory renewal or data package. The current blocker is consent, not pending offline tests.

The proposed diagnostic uses the existing services once under a new exact authorization. It permits at most one JWT exchange and six GET reads over four exact shapes: OAuth userinfo, Organization identity, the exact QA User active flag and documented selected-app metadata. Native verification uses only the existing cookie/identity/build proof path: up to five fixed requests, including the conditional read-only SOAP `getUserInfo` POST and Lightning home HTML reads. No JavaScript-driven application initialization, Aura request, Account/Contact record read, Page creation, MCP session, screenshot, factory, cleanup, AI request or final lifecycle execution is included.

The parent capabilities omit dedicated-data and exploration; create/delete actions are absent. The exact org/user/persona, reviewed engine/build/app, state content, source files and execution recipe remain hash-bound. The existing Account reference is provenance only and is never fetched or adopted. Two temporary verification browsers use isolated contexts; everyday browser sessions are not accessed. The existing per-request timeouts and phase-boundary deadline checks remain explicit; native in-flight effects cannot be undone by an after-operation check.

The final inactive review is created only after required offline checks pass, with a55-minute original expiry under the unchanged one-hour policy and a five-minute execution reserve. Exact fresh read-only plus native-effects/access consent is required. Changed state/source/engine or failed proof stops; a durable intent forbids replay. Neither preparation nor this document grants authority. No replacement data-creation package is prepared.

A later diagnostic PASS would verify the **current** shared preflight path. It would not establish018's historical cause, renew old readiness receipts, verify schema/cleanup permissions or authorize data creation. The full Account/Contact milestone still needs current successful readiness and separately reviewed factory/native/final-run approvals, followed by actual generated tests, independent SOQL, certainly owned cleanup, absence checks and reportingLabs evidence.

All15 responsibilities, cumulative P0/P1/P2 requirements, Gemini/gemini-embedding-001, scoped RAG, LangGraph, Playwright MCP, autonomous exploration, self-healing, verified learning and enterprise integration requirements remain in the cumulative registry. No Gemini/RAG validation was repeated.
