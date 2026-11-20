# Diagnostic 023: verified identity, expired-cookie input mismatch

November 20, 2026. The exact approved diagnostic executed once, completing at 11:32:17 IST, before its original deadline. It is consumed and cannot replay. Its original approval, intent, outcome, report and hashes remain unchanged.

| Stage | Actual result | Evidence boundary |
| --- | --- | --- |
| JWT and API identity | PASS, live | One OAuth exchange and six GET responses, all HTTP 200; no framework denial. |
| Active QA user and selected app | PASS, live | The canonical exact-path correction from diagnostic 022 worked without widening the query or scope. |
| Native session org/user identity | PASS, live | The existing verifier proved both approved-origin session cookies against the exact org/user. |
| Actual loaded-context state | FAIL, live | `context-identity` / `context-state-mismatch` / `session-or-scope`. Chrome imported 14 cookies from the approved 15-cookie file. |
| Build proof | NOT EXECUTED | The preceding exact-state comparison stopped execution. |
| Page rendering, MCP, images, business-record reads/writes, generated live tests, cleanup, reportingLabs | NOT EXECUTED | No factory or business effects; no readiness receipt or verified lesson. |

## Confirmed cause and limits

An offline import through the same installed headless Chrome, without a Page or external requests, reproduced the exact mismatch. One non-`sid` cookie had expired at **11:13:16 IST**, before the attempt. Chrome correctly omitted it. All other 14 entries matched the existing runtime comparison exactly, including both mandatory session cookies. There were no additional cookies or altered compared values/flags. This is an expired input-entry defect, not evidence of wrong identity, rejected authentication, an app mismatch or Lightning rendering failure.

The preserved 018 input contains the same cookie class with an expiry at **21:51:59 IST on November 19**, between successful 021 readiness and the later 018 attempt. This reconstructs an equivalent blocking condition in that saved input. It does **not** recover 018's discarded first exception or prove which historical check failed first.

The diagnostic primary stage/reason/category survived inner and outer cleanup. This verifies the structured failure path against a real failure; it does not establish every possible failure path as live tested.

## Narrow correction

The existing dedicated import module now offers a proposal-only expiry normalizer. It validates scope first, rejects missing/expired mandatory sessions and foreign cookies, and removes only already-expired non-session entries. It writes a new file under `.auth` without overwriting the source or an existing destination. Retained cookie fields and origins stay unchanged. Its result explicitly requires review; it grants no session or execution authority.

The runtime cookie comparison and all identity, Production isolation, action, budget and ownership checks are unchanged. No existing approval is rebound. A new exact review must bind the separate proposed copy and its provenance, explicitly approve that input, and repeat fresh native identity/build proof. The review window must end before any retained finite cookie expiry. Cookie import equality does not prove server-side login validity.

Four focused tests cover preserved state, invalid sessions/foreign scope/ordinary modes, private non-overwriting output and actual installed headless Chrome import. Real protected state was inspected only locally; regression fixtures use synthetic cookies and no service calls.

Final correction validation: typecheck PASS;396/396 full unit/integration tests (596326ms), zero failures/skips;5/5 headless tests (1.1m); required demo PASS; private recipes typecheck PASS. Four focused normalization tests passed, including real offline Chrome import. Two earlier full runs each had394/396 passing, with different existing browser-fixture failures (runner budget/pipeline, then remount-readiness/MCP adapter). Follow-ups retained one repeated pipeline failure before its instrumented fixture reproduction passed; the19-test readiness/MCP isolation passed unchanged. Those failures/logs remain retained; their cause is unconfirmed. No assertion, test/session budget or security check was weakened to obtain this complete passing rerun. User discovery edit is preserved/excluded. No new Salesforce/Gemini/Chroma call during correction; all validation precedes the new inactive review window. No new live call is authorized by this correction.

## Local evidence

- `.state/lifecycle-preflight-SFQA-DIAG-20261120-023/{outcome.json,report.html,execution-intent.json,cookie-import-analysis.json}`: immutable original result plus separate local analysis.
- `.state/023-cookie-history-and-window.json`: source-bound historical chronology.
- `.state/preflight-024-import-audit.json`: proposed copy, hashed expiry evidence, unchanged source/session fields and exact offline import result.

The complete cumulative feature registry and all 15 agent responsibilities remain in scope. Gemini/RAG were not rerun. A complete Account/Contact lifecycle still needs successful current prerequisites and separate business-data, native-risk and final-run consent.

Offline verification on Windows uses `npm.cmd run typecheck`, `npm.cmd run unit`, `npm.cmd run demo` and `npm.cmd test`. These commands do not activate a private diagnostic review. Do not invoke the activation/execution recipes until the operator approves the exact current package and its original window is still valid.

## Fresh inactive diagnostic 024: single next operator decision

After required offline validation, source-bound `SFQA-DIAG-20261120-024` was prepared INACTIVE. Review: `.state/lifecycle-preflight-SFQA-DIAG-20261120-024/REVIEW.html` (or `REVIEW.md`), `plan.review.json` and `manifest.review.json`. Proposed activation: `a8ae40f052acd90037d86083359fa7acd369763ff43469b0822e39eefb375a68`. Separate read-only policy: `10c1135c0df3c5b39f02d52a32d0c3d4a1ba1116d347b96b8fdbed256b863cb5`. Original expiry: **November 20, 2026, 1:27:06 p.m. IST**; execution must start **before 1:22:06 p.m. IST**, retaining the five-minute reserve and unchanged one-hour security limit. No renewal or replay.

The new copy removes only the one expired non-session entry omitted by Chrome. Mandatory sessions, all other retained values/flags and origins are unchanged; original state files and grants remain unchanged. Exact input/source bindings and offline import passed. The recipe requires explicit normalized-input approval plus read-only execution/native-effects/access consent; current server validity/build proof remain unverified until fresh execution. Maximum one JWT, six exact identity/active-user/selected-app GETs and five fixed native proof requests (conditional read-only SOAP getUserInfo POST included), two isolated headless installed-Chrome verification browsers, five minutes total. No Page, JavaScript/Aura/MCP/images/business-record reads/writes/factory/cleanup/AI or E2E authority. Native session requests may have undocumented irreversible effects; checks cannot undo in-flight effects.

Local audit passed exact hashes, normal-Production/cross-org/user/data/altered-state/path rejection and local headless review HTML with zero external requests. Approved files and execution intents: zero. No new live call. Code verified in `cb2849d`; all expensive checks preceded review creation.023 is consumed;018 and earlier declined/expired/consumed scopes stay unchanged. Fresh exact operator consent for024 is the only next decision; the complete lifecycle remains separately gated.
