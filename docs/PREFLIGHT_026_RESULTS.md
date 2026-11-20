# Diagnostic 026: API-origin SOAP identity proof returned HTTP 500

The exact retained-input/read-only/native-risk approval executed `SFQA-DIAG-20261120-026` once on **November 20, 2026, 16:54:31–16:54:37 IST**, before its original deadlines. It is consumed: `failed-or-uncertain-no-replay`. Original reviews, input, approval, intent and outcome remain unchanged.

| Stage | Actual result | Limit |
| --- | --- | --- |
| Exact authorization, input and source bindings | PASS, local | Retained scoped025 input; no refresh, rebind or renewal. |
| JWT, API org/user identity, active user and selected app | PASS, live | One OAuth exchange and six GETs, all HTTP 200, with zero framework denials. |
| Installed headless Chrome and isolated context setup | PASS | No everyday browser profile. |
| Native identity proof | FAIL, live | `context-identity` / `identity-http` / `session-or-scope`. |
| Fixed failing operation | IDENTIFIED, live | `soap-get-user-info`, `sessionOrigin: api`, `httpStatus: 500`. The closed telemetry is now live verified. |
| SOAP fault code and message | UNKNOWN | Not retained by the approved source; no body retrieval or retry after failure. |
| Final actual-context cookie comparison and native build proof | NOT EXECUTED | Native identity proof failed first. |
| Browser disposal | PASS | Both observed disposal stages passed; primary diagnostic survived. |
| Business-record reads/writes, Page/JavaScript/Aura/MCP/images, generated live tests, factory, owned cleanup, reportingLabs, verified learning | NOT EXECUTED | No readiness receipt or lesson. Native background effects remain unenumerated. |

The local integrity audit confirms timing, exact input/source/approval hashes and zero framework business-record operations. Original outcome hash: `c35a762a01c9a490035042bf32551816cb209e805872188b288d0cb43bf5b16b`. Source at execution is recoverable from commit `61b0016`.

## Established boundary and remaining uncertainty

The failure is now localized to the SOAP browser-session identity proof, rather than an unspecified native HTTP step. The exact SOAP fault and its server-side cause remain unknown. This is not a framework transport denial or an observed Lightning rendering/selector failure. The retained export's age is not proof of expiry, and 026 does not recover the lost details of 025 or lifecycle 018.

Salesforce documents SOAP faults with associated exception codes. Its code reference distinguishes invalid session IDs, access issues and request errors; HTTP 500 alone does not select a code. [SOAP error handling](https://developer.salesforce.com/docs/platform/api/guide/sforce-api-concepts-errorhandling.html), [API fault fields and exception codes](https://developer.salesforce.com/docs/platform/api/guide/sforce-api-calls-concepts-core-data-objects.html).

Salesforce also documents API-use restrictions as one context in which an invalid-session fault can appear. That example does not establish this org's configuration or the cause of 026. Browser validity and JWT/API access remain separate gates. [Salesforce API-access-control example](https://help.salesforce.com/s/articleView?id=000392667&language=en_US&type=1).

## Offline bounded SOAP classification

The existing verifier now has a diagnostic-only parser for failed SOAP HTTP 400–599 responses. It reads an already buffered response with a one-second diagnostic deadline and parses at most **16 KiB, 128 tags and 24 levels**. This is a parse bound, not a hard HTTP-transfer cap. DTD/entities, malformed XML, conflicting codes, excessive content and unsupported shapes are rejected or classified without provider text. Redirect bodies stay unread.

The retained fields are a closed classification, an optional allowlisted code and optional reported-message hint. The code allowlist is `INVALID_SESSION_ID`, `API_DISABLED_FOR_ORG`, `API_CURRENTLY_DISABLED`, `INSUFFICIENT_ACCESS`, `INVALID_SOAP_HEADER`, `INVALID_VERSION`, `INVALID_CLIENT` and `INVALID_OPERATION_WITH_EXPIRED_PASSWORD`. Two closed hint labels distinguish an API-use restriction message from an expiry/invalid message; neither independently proves the exact underlying cause or effective permissions.

No `faultstring`, `exceptionMessage`, XML, URL, header, cookie, token, org/user value or record data is retained or uploaded. Unknown codes are withheld. Read/parse failure cannot replace the primary identity failure. A recognized fault still fails identity verification: no retry, automatic login/refresh, JWT substitution, permission change, assertion relaxation or extra request is introduced.

This parser has **not run against Salesforce** and cannot reconstruct 026's discarded body. Mocked tests cover documented namespace/detail forms, every allowed code, safe hints, unknown/conflicting codes, malformed/oversized/deep/entity-bearing XML, schema injection, unread redirects and body read failure/timeout while retaining primary failure through disposal.

Final SOAP-fault validation: typecheck PASS; **402/402 unit/integration tests** (599110 ms; zero failures/skips), **46 focused tests**, **five headless tests** (25.7s), required demo and private recipe typecheck PASS. Unsafe XML, unknown/conflicting codes, protected-field injection, read failure/timeout and unread redirects were exercised offline. Original026 evidence and the user discovery edit remain unchanged; the edit is excluded from commits. The SOAP classifier has not run against Salesforce. No additional live Salesforce/Gemini/Chroma call, automatic session recovery, permission change or verified lesson occurred. All checks precede any new final review window. No additional live call is authorized by the correction.

Private local evidence is under `.state/lifecycle-preflight-SFQA-DIAG-20261120-026/`: `authorization.approved.json`, `execution-intent.json`, `outcome.json`, `report.html`, `diagnostics.sqlite` and `result-audit.json`. Any future body classification requires a new exact source-bound input/read-only/native-risk/content-minimization review. A complete Account/Contact lifecycle remains incomplete and separately gated. All 15 responsibilities and cumulative P0/P1/P2, existing integrations and safety/ownership/learning controls remain in scope.

## Inactive 027: bounded SOAP fault classification requires new consent

Source-bound `SFQA-DIAG-20261120-027` is **INACTIVE** after all offline checks. It explicitly reuses unchanged `.auth/qa-user-scoped-20261120-025.json` from the **November 20, 1:22:30 p.m. IST** export. This is not a new login or working-session claim.026 identified API-origin SOAP getUserInfo HTTP500 at4:54p.m.IST; its actual fault code remains unknown. The new purpose is bounded local classification of a failed SOAP response, with no historical body recovery.

Review: `.state/lifecycle-preflight-SFQA-DIAG-20261120-027/REVIEW.html` (or `REVIEW.md`), `plan.review.json` and `manifest.review.json`. Proposed activation: `cf5be4510baf183eb8bf2612848fcd4414e0ab385a4945f0f6d5e8b319ccd835`; read-only policy: `10c1135c0df3c5b39f02d52a32d0c3d4a1ba1116d347b96b8fdbed256b863cb5`. Original expiry: **November 20, 2026, 6:15:47.079 p.m. IST**; execution must start **before 6:10:47.079 p.m. IST**. The new55-minute review window and five-minute reserve preserve the one-hour limit and renew no earlier grant.

Same exact QA org/user/persona/origins/app/build/engine and fixed preflight request scope: at most one JWT, six metadata GETs and five native proof calls (conditional read-only SOAP getUserInfo POST included), two isolated installed headless Chrome verification browsers, five minutes total and existing request timeouts/phase checks. Failed SOAP HTTP400-599 alone may trigger a one-second buffered-body read and16KiB/128tag/24level classification. Only a closed class, allowlisted code and optional reported-message label persist; no raw XML/messages/URLs/headers/cookies/tokens/identity values or uploads. The parse cap is not a hard HTTP-transfer cap. Redirect bodies remain unread. A classification does not authenticate, prove the exact cause, retry, refresh, substitute JWT, or change permissions.

The new SOAP-content/minimization consent flag is false by default and mandatory before execution, alongside exact retained-input/read-only/native-effects/access approval. No Page/JavaScript/Aura/MCP/images, business-record reads/writes, actions, factories, owned cleanup, AI or E2E authority. Native effects may be undocumented/irreversible; checks cannot undo in-flight effects. Changed input/source or failed proof stops without replay/rebinding/renewal.

Code verified in `d49c5f6`:402 full tests,46 focused,five headless,typecheck/demo/private recipes PASS before review creation. Local exact source/input/history/date/hash/consent-flag and ordinary-Production/cross-org/user/data/altered-input/path negatives passed; empty-context headless HTML used zero HTTP. Approved files/intents/live calls are zero.026 remains consumed and its outcome unchanged. The SOAP parser is OFFLINE verified only; no live fault code or verified Salesforce lesson is claimed. All 15 responsibilities and cumulative P0/P1/P2/integrations/safety boundaries remain preserved. Older sections retain historical status.
