# Diagnostic 024: native identity proof redirected

November 20, 2026. The operator explicitly approved the exact normalized input, read-only scope and native-effects/access risk. Diagnostic `SFQA-DIAG-20261120-024` executed **once at 13:14:45–13:14:51 IST**, before its original latest-start and expiry deadlines. Its durable intent is now `failed-or-uncertain-no-replay`. It cannot run again, even before the original grant expires.

| Stage | Actual result | Evidence boundary |
| --- | --- | --- |
| Exact input, source and authorization bindings | PASS, local | The approved separate normalized copy was used without rebinding, renewal or source changes. |
| JWT and API org/user identity | PASS, live | One OAuth exchange and six GET responses, all HTTP 200; no framework transport denial. |
| Active dedicated user and selected app | PASS, live | The canonical exact request contracts worked. This does not prove native Lightning build/app identity. |
| Storage-state validation, browser launch and context creation | PASS | Local installed headless Chrome; isolated contexts, no everyday profile. |
| Native session identity | FAIL, live | `context-identity` / `identity-redirect` / `session-or-scope`. The identity proof reported a redirect, which was not followed. |
| Final actual-context cookie comparison | NOT EXECUTED | `verifyActualContext` requires native identity proof first. The normalized input correction remains offline verified; this attempt does not establish a live comparison pass. |
| Native build proof | NOT EXECUTED | The identity failure stopped the preflight. |
| Browser disposal | PASS | Both observed cleanup stages passed; the primary diagnostic survived cleanup. |
| Record reads/writes, Page initialization, MCP, images, generated live tests, owned cleanup, reportingLabs, verified learning | NOT EXECUTED | No Account/Contact reads, factory reservation or business mutation was permitted. No readiness receipt or lesson was minted. |

## What is known and unknown

The confirmed current blocker is a **native identity-proof redirect**, distinct from diagnostic 023's expired non-session cookie mismatch. The existing verifier throws this closed reason only for a 3xx response and disables redirect following. Its possible branches are the session-token userinfo request, conditional Lightning HTML proof, or conditional read-only SOAP proof. The retained diagnostic does not identify which branch, exact status or destination caused this attempt to stop. No additional request was made to investigate it.

An expired/revoked session, an identity mismatch, a Salesforce permission change, an SSO requirement or a rendering defect is **not established** by the saved evidence. Successful JWT/API checks cannot substitute for browser authentication. Do not weaken the proof, follow unapproved redirects or call the cookie-normalization correction live verified. Lifecycle 018's discarded first exception also remains unknown.

The approved state and original sources remain unchanged. Native session/background server effects are not enumerated; zero framework business-record operations is not a claim of zero server effects.

## Evidence and next input

Private local evidence remains excluded from Git:

- `.state/lifecycle-preflight-SFQA-DIAG-20261120-024/authorization.approved.json`: exact named consent and original expiry.
- `execution-intent.json`, `outcome.json`, `report.html` and `diagnostics.sqlite` in that directory: consumed intent, stage events and actual result.
- `.state/preflight-024-execution.log`: bounded execution summary.

The next input is a fresh independently approved export after a normal login as the same dedicated QA user, with the authenticated Account page loaded. Confirm only its path under `.auth` or that `qa-user.json` was refreshed; never paste its contents. That confirmation authorizes input preparation only. A new separate inactive review must bind the new copy and obtain exact read-only/native-risk consent before any further live proof. No replacement scope or data package has been prepared or activated here.

## Validation and delivery boundary

No runtime code changed during this execution/reporting turn. The exact pinned source had already passed **396/396 unit/integration tests, five headless tests, typecheck, demo and private recipe typecheck before review creation**. Those results are reused, not presented as a new test run. Earlier intermittent fixture failures remain recorded in [diagnostic 023's report](PREFLIGHT_023_RESULTS.md). Expensive suites were not repeated after time-limited consent.

Reporting changes receive local integrity, protected-value and diff checks. The user's discovery-test edit is preserved and excluded from commits. All 15 agent responsibilities, cumulative P0/P1/P2, Gemini/RAG, LangGraph, MCP, reportingLabs, ownership/cleanup and ordinary Production restrictions remain in scope. No Gemini/Chroma call, write authority, quota increase, factory or full lifecycle approval was added.
