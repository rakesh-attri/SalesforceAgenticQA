# Diagnostic 027: browser-session SOAP proof rejected with INVALID_SESSION_ID

The operator approved the exact retained input, bounded SOAP parsing/closed-field retention, read-only execution and native-effects/access risk. `SFQA-DIAG-20261120-027` executed **once on November 20, 2026, 17:47:21–17:47:27 IST**, within its original deadlines. It is consumed: `failed-or-uncertain-no-replay`. No retry, state rebind or renewal occurred.

| Stage | Actual result | Evidence boundary |
| --- | --- | --- |
| Exact authorization, source, input and content-consent gates | PASS, local | The reviewed scoped025 input was retained unchanged. |
| JWT, API org/user identity, active user and selected app | PASS, live | One OAuth exchange and six GETs, all HTTP 200; zero framework transport denials. |
| Installed headless Chrome and isolated context setup | PASS | No everyday profile or active browser session was used. |
| API-origin browser-session identity proof | FAIL, live | SOAP `getUserInfo` returned HTTP 500. Closed fault classification: `recognized`, code `INVALID_SESSION_ID`. |
| Narrower session-rejection hint | UNKNOWN | No approved API-use or expiry/invalid message hint was recorded. Raw fault text was not retained. |
| Closed SOAP-fault parser | LIVE VERIFIED for this code | The bounded parser recognized this response. Other codes, hint branches and adversarial-input cases remain offline verified. |
| Remaining browser identity, final actual-context cookie comparison and native build proof | NOT COMPLETED / NOT EXECUTED | The first native proof failure stopped follow-on verification. JWT identity cannot substitute for browser identity. |
| Browser disposal | PASS | Both observed disposal stages passed; primary evidence survived. |
| Page/JavaScript/Aura/MCP/images, business-record reads/writes, generated live tests, factory, owned cleanup, reportingLabs and verified learning | NOT EXECUTED | No readiness receipt or lesson. Native background effects remain unenumerated. |

The current, confirmed blocker is **the API-origin browser cookie being rejected for SOAP identity proof**. This establishes the immediate rejection, not its precise server-side cause. Do not report an expired session, malformed cookie, API-use restriction, app permission issue or Salesforce defect as proven. The export's age is observable, not a causal test.

Salesforce documents invalid session IDs among SOAP exception codes, including malformed/expired sessions, and separately documents an API-use-restriction context that can produce the same code. These are possibilities, not a diagnosis of this org. [SOAP exception reference](https://developer.salesforce.com/docs/platform/api/guide/sforce-api-calls-concepts-core-data-objects.html), [Salesforce API-session restriction example](https://help.salesforce.com/s/articleView?id=000392667&language=en_US&type=1).

## Preserved evidence and validation

Private evidence remains under `.state/lifecycle-preflight-SFQA-DIAG-20261120-027/`: `authorization.approved.json`, `execution-intent.json`, `outcome.json`, `report.html`, `diagnostics.sqlite` and `result-audit.json`. Original outcome hash: `824e739add212e49c0c99ef63504b0bc9a5b51a586683e97c0c5b5976a67c35a`. The approved runtime source is recoverable from commit `1582047`.

The local result audit verified exact input/source/approval/content-consent hashes, original execution timing, recognized code, consumed intent, both disposal events and zero framework business-record operations. No provider XML, faultstring, exceptionMessage, credentials or protected identifiers were retained in diagnostic output. Original 026 and earlier evidence remain unchanged; this result does not retroactively establish their unrecorded fault codes or lifecycle 018's discarded exception.

No runtime code changed during this result-recording turn. The exact source already passed **402/402 unit/integration tests, 46 focused tests, five headless tests, typecheck, demo and private recipe typecheck before review creation**. These results are reused, not claimed as a new test run. No expensive suite was repeated after time-limited consent. Delivery checks cover local integrity, protected values and diff only. The user's discovery-test edit remains unchanged and excluded from commits.

## Single next input

Obtain a fresh independently approved export after a **new normal login as the same dedicated QA user**, with the authenticated Account page loaded. Prefer a new local filename under `.auth` if convenient; do not overwrite the bound `qa-user-scoped-20261120-025.json`. Confirm only the path or that `qa-user.json` was refreshed. Never paste its contents.

That confirmation permits input preparation only. A separate inactive review must bind the new source and obtain fresh exact consent before another proof. A refresh is a safe prerequisite, not a guaranteed fix: persistent rejection of a fresh session requires reviewed investigation of API-session restrictions or a supported alternative identity proof, without weakening the gate or changing app permissions automatically.

The user answered **Not available** to the fresh-export question. That input is currently externally blocked. While unavailable, do not repeat the failed source or prepare another lifecycle-verification scope; this response grants no new authority. No replacement scope or data package is prepared or activated here. All 15 responsibilities, cumulative P0/P1/P2, existing integrations, normal Production isolation, ownership/cleanup and verified-learning requirements remain in scope. The complete Account/Contact lifecycle is still incomplete and separately gated.
