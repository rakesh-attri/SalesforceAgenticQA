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
