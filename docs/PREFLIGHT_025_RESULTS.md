# Diagnostic 025: native identity HTTP failure

The operator approved the exact scoped input, read-only execution and native-effects/access risk. `SFQA-DIAG-20261120-025` executed once on **November 20, 2026, 15:36:04–15:36:09 IST**, within its original deadlines. Its intent is consumed: `failed-or-uncertain-no-replay`. The signed review, approvals, input, outcome and original expiry remain unchanged.

| Stage | Actual result | Limit |
| --- | --- | --- |
| Exact authorization, input and source bindings | PASS, local | No rebind or renewal. The confirmed export was saved at 13:22:30 IST. |
| JWT, API org/user identity, active-user and selected app | PASS, live | One OAuth exchange and six GETs, all HTTP 200, with zero framework denials. |
| Storage-state validation, installed headless Chrome launch and context creation | PASS | Isolated contexts; no everyday browser profile. |
| Native browser-session identity | FAIL, live | `context-identity` / `identity-http` / `session-or-scope`. |
| Final actual-context cookie comparison and native build proof | NOT EXECUTED | Native identity proof failed first. The normalized-input correction is still not live verified by this attempt. |
| Browser disposal | PASS | Both observed disposal stages passed; the primary failure was retained. |
| Account/Contact reads, writes, Page initialization, MCP, images, generated live tests, factory, owned cleanup, reportingLabs, verified learning | NOT EXECUTED | No business-record operation, readiness receipt or lesson. Native background server effects remain unenumerated. |

## Confirmed observability gap

The actual native proof operation, numeric HTTP status and response destination were not retained in 025. `identity-http` can represent an unexpected userinfo HTTP response, rejected SOAP proof, rejected Lightning HTML proof, or unsupported HTML content type. The available evidence cannot select among those branches. Do not infer session expiry, API-disabled access, an identity mismatch, a Salesforce defect or a specific HTTP code.

The state was about two hours and fourteen minutes old at execution. That age is observable; it is not proof of server-side expiry. Successful JWT/API authentication does not prove browser authentication. Diagnostic 024's earlier redirect remains a separate historical result, and lifecycle 018's original discarded exception remains unknown.

The local result audit verified the exact source/input/approval hashes, original timing, consumed intent, both disposal events and zero framework business-record operations before any instrumentation change. Its outcome hash is `84505100fdfc161fa1c4396c6ba910cd90265e382118d87f352ac91e7d72287e`.

## Offline correction in the existing verifier

The diagnostic stage schema now supports optional `nativeProof` evidence with three strictly closed fields:

- `operation`: `oauth-userinfo`, `soap-get-user-info`, or `lightning-home-html`.
- `sessionOrigin`: `api` or `lightning`, without a hostname or identifier.
- `httpStatus`: an integer from 100 through 599, absent if no response arrived.

The existing native verifier attaches the current proof operation and received status to its stage evidence. The error association retains that evidence across sanitized wrapping and disposal, with or without an observer, including older observers that ignore the new argument. Invalid metadata and failing metadata callbacks cannot replace the original failure. Previous saved diagnostic rows remain readable; legacy failure summaries are unchanged.

No URL, cookie, token, header, status text, response body, org/user value or record field is added to diagnostics. The verifier's request shapes, methods, fallbacks, redirects-disabled setting, 15-second request timeouts and independent identity assertions remain unchanged. The metadata grants no permission and issues no extra requests.

Mocked tests distinguish userinfo HTTP/redirect failures, SOAP rejection, HTML redirect, HTML content-type rejection and a transport timeout. They verify exact call counts, unchanged fallback success, protected-value rejection and preservation through disposal/wrapping. A synthetic SOAP HTTP 500 is a fixture result, **not** an observed Salesforce 025 status. The new fields do not recover lost historical evidence and have not been executed against Salesforce.

Regression testing exposed partial response doubles without Playwright's required `status()` method; the doubles now return their existing successful HTTP status explicitly. It also exposed a fixture setup waiting for a frame-load event under an 80 ms locator timeout. That fixture now installs its static DOM before observation. Its 80 ms locator timeout, 1,500 ms observation budget, 100 ms stability requirement and all remount assertions are unchanged. The corrected affected files passed 43 focused tests; initial failed-run evidence remains retained.

Final offline verification: typecheck PASS; **399/399 unit/integration tests** (542157 ms; zero failures/skips), **43 focused tests**, **five headless tests** (18.7s), required demo and private recipes typecheck PASS. The initial full run was392/399: six incomplete response-double failures and one fixture frame-load setup timeout. Corrected API doubles and deterministic pre-observation DOM setup passed the complete rerun; assertions, locator/session budgets and stability requirements were unchanged. Initial logs are retained. New telemetry remains OFFLINE verified only; no additional Salesforce/Gemini/Chroma call or verified lesson. The user discovery edit is preserved/excluded. All checks precede any new final review window. No additional live request is authorized by this correction.

## Local evidence and continuation

Private evidence is under `.state/lifecycle-preflight-SFQA-DIAG-20261120-025/`: `authorization.approved.json`, `execution-intent.json`, `outcome.json`, `report.html`, `diagnostics.sqlite` and `result-audit.json`. The approved runtime source is recoverable from commit `c12254e`; later telemetry changes cannot authorize replay of that source-bound run.

A future diagnostic needs separate exact consent binding the changed source and its reviewed input. Its purpose must explicitly include the new closed native-proof metadata. No replacement live data package, factory approval, session renewal or automatic lesson is prepared by this code change. The complete Account/Contact lifecycle remains incomplete and separately gated. All 15 agent responsibilities, cumulative P0/P1/P2, Gemini/RAG, LangGraph, MCP, reportingLabs, ownership/cleanup and normal Production restrictions remain preserved.

## Inactive 026: classify the native proof with closed evidence

After all required checks passed, source-bound `SFQA-DIAG-20261120-026` was prepared **INACTIVE**. It explicitly reuses the unchanged confirmed `.auth/qa-user-scoped-20261120-025.json`, from the November20 **1:22:30 p.m. IST** export. This is **not a refreshed export or a working-session claim**:025 failed native identity-http at3:36p.m.IST, with the original operation/status unavailable. The new purpose is to capture fixed native-proof operation, api/lightning session-origin class and numeric HTTP status using the tested telemetry. A failure classification alone does not prove expiry or a Salesforce defect.

Review: `.state/lifecycle-preflight-SFQA-DIAG-20261120-026/REVIEW.html` (or `REVIEW.md`), `plan.review.json` and `manifest.review.json`. Proposed activation: `9daffc013080573e49492521fb3a4ad4186e6c0f01d330f21767c8759bdc0c2e`; read-only policy: `10c1135c0df3c5b39f02d52a32d0c3d4a1ba1116d347b96b8fdbed256b863cb5`. Original expiry: **November20,2026,5:05:22.520 p.m. IST**; execution must start **before5:00:22.520 p.m. IST**. The new55-minute window/five-minute reserve preserve the existing one-hour limit and renew no previous grant.

Same exact org/user/persona/origins/app/build/engine and preflight request semantics: at most one JWT, six exact metadata GETs and five fixed native proof requests (conditional read-only SOAP getUserInfo POST included), two isolated installed headless Chrome verification browsers, five-minute scope and existing request timeouts/phase checks. No Page/JavaScript/Aura/MCP/images, record read/write, action, factory, cleanup, AI or E2E authority. Native session effects may be undocumented and irreversible; checks cannot undo in-flight effects. New exact retained-input/read-only/native-effects/access consent is required. Changed input/source or failed proof stops; no replay, rebind or renewal.

Code verified in `55fffb2`:399 full tests,43 focused,five headless,typecheck/demo/private recipes PASS before review creation. Local exact hash/provenance, ordinary-Production/cross-org/user/data/altered-input/path negatives and empty-context headless review HTML passed; approved files/intents/live calls are zero.025 remains consumed; its original outcome and all earlier declined/expired/consumed scopes are unchanged. No new factory package or verified Salesforce lesson. All 15 responsibilities and cumulative P0/P1/P2/integrations/safety boundaries remain preserved. Older sections below retain historical status.
