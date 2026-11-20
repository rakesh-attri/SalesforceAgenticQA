# Milestone 1 authentication audit

**AUTH BLOCKED** — the confirmed replacement export is locally valid; its current Salesforce session has not been proved. No new Salesforce, Gemini or Chroma call was made in this audit. No live data lifecycle or generated Salesforce test ran.

## What the saved evidence establishes

The milestone request's description of diagnostic027 is historical. Separate exact consent subsequently executed027 once. Its API/user/active-user/selected-app checks passed; the browser cookie's API-origin SOAP `getUserInfo` proof returned HTTP500 with recognized `INVALID_SESSION_ID`. Both verification-browser disposal stages completed and the primary diagnostic survived. The particular reason for that rejection—expiry, revocation, session restrictions or another server condition—is unknown. Diagnostic027 is consumed, not available for another attempt. It cannot explain the lost exception in lifecycle018 retrospectively.

Actual saved execution outcomes, rather than prepared definitions alone, confirm that Account observation005 achieved its live goal and preflight021 passed Account and Contact readiness with independent unchanged-record comparisons. They use the same exact dedicated org/user/origins as the current policy. Their original state files still match their saved bindings. Those successful historical sessions and expired receipts grant no current execution rights.

## Why SOAP appears in the existing path

`LightningSession.open` verifies API identity, reference values and local authorization, imports the approved state into an isolated installed headless browser, then calls the existing context verifier. That verifier separately proves native browser identity and exact actual cookies before native app/build proof and any record navigation. A successful JWT exchange is not browser proof.

`verifyDedicatedSession` requires one secure session cookie for **each** approved API/Lightning origin. A separate empty verifier context presents each origin's own cookie to the fixed API-origin OAuth user-info endpoint. Only its existing selected failure statuses trigger a fallback: the API-origin cookie uses Partner SOAP `getUserInfo`; the Lightning-origin cookie uses its own Lightning-home HTML identity proof. SOAP is therefore a conditional native-identity fallback, not an unconditional lifecycle prerequisite or a business mutation.

Every successful response must prove the exact canonical Salesforce org and dedicated user. Redirects fail; a SOAP fault never authenticates. No JWT is substituted for a browser cookie. The source file hash is checked again, and `verifyActualContext` compares the complete approved/actual cookie tuples before the source-bound native build check. The request still uses the API origin, configured API version, SOAP1.1 envelope, Partner namespace, native-cookie `SessionHeader`, `getUserInfo` body, fixed SOAPAction/content type, redirects disabled and a15-second timeout.

## Reproduction and comparison

The TypeScript ASTs of the user-info and SOAP request calls at the successful005/021 source revisions match the current construction. An offline harness invokes the **actual** `verifyDedicatedSession` service with synthetic browser dependencies: both direct user-info proofs pass; an API-origin401 triggers exactly one SOAP fallback while the other cookie is independently proved. Assertions check endpoint/origin/version, namespaces, escaped native cookie, body, headers, timeout and redirect handling. There are no live HTTP requests in these reproductions.

The historical success outcomes do not retain which fallback branch ran. They therefore do **not** prove that SOAP itself succeeded in005 or021. No request-construction, endpoint/origin or version defect was demonstrated. There is no evidence-based reason to remove the identity gate, change expected results, loosen cookie equality or add another fault-classification diagnostic.

The existing UI Bridge implementation was also inspected. It requires its separately authorized app web scope and exact authentication handoffs. Earlier evidence stopped on unsupported cross-origin authentication documents; it is not a currently verified alternative and is not automatically broadened. The confirmed replacement export avoids making an unrelated authentication change.

## Confirmed replacement input

The operator confirmed that the existing `.auth/qa-user.json`, saved November20,2026 at **5:52:40 p.m. IST**, came from a new normal login as the same dedicated QA user with the Account authenticated and was independently approved for QA. This confirms input preparation only.

A new `.auth/qa-user-scoped-20261120-028.json` is a separate review-required copy. Existing minimization removed32 out-of-scope cookies and one origin; no expired entries were removed. All11 retained cookies, mandatory session cookies, flags and allowed origins are unchanged. Both opaque origin-session bindings differ from the rejected025 input. An isolated installed headless Chrome context imported the copy exactly with JavaScript disabled, service workers blocked, all requests aborted and **zero network requests**. The source and every historical scoped file remain unchanged. Cookie differences and offline import are not proof of current server validity.

Private audit artifacts under `.state/milestone1-*` and `.state/readiness-028-input-audit.json` retain hashes, structural checks and source links. Cookies, tokens, record values, raw provider content and private reviews are excluded from Git. This audit publishes no verified business lesson.

## Offline validation

The required typecheck,402/402 unit/integration tests (zero failures/skips),42 focused session/preflight tests, five headless tests and demo passed. The inactive private handoff also typechecks and rejects23 altered-scope/identity/permission/action/state/path/view/consent/deadline cases. No runtime authentication source was changed. The existing user edit in `unit/discovery.test.ts` is unchanged and excluded from the commit. These offline results do not establish current Salesforce login validity or a completed live lifecycle.

## One next operator decision

Review the single fresh **inactive** Account/Contact read-only readiness scope028 under `.state/lifecycle-readiness-20261120-028/REVIEW.html` or `REVIEW.md`, after its final offline checks. It reuses021's existing services and unchanged view assertions, binding the new input and current tested source. It runs native identity/readiness first, stopping before metadata collection if authentication fails. It also collects only the existing bounded metadata/permission/cleanup-read prerequisites if both pages pass.

Exact scoped-input/read-only consent and separate native background-effects/access acceptance are required. The55-minute review window and five-minute execution reserve remain within the established one-hour authorization limit. It grants no factory, cleanup or final lifecycle authority. No activation, renewal, rebinding or replay occurs automatically.002/012 stay declined;018 and consumed diagnostics remain historical.

After actual **AUTH VERIFIED**, reuse the existing factory/generated-test/ownership/SOQL/reportingLabs pipeline with fresh exact separate business/native/final consent. Current readiness must pass again at the final run's existing pre-creation gate; waiting for operator consent cannot silently extend a15-minute receipt. The full lifecycle still needs genuine **DATA CREATED**, **UI TESTS EXECUTED**, **DATA CLEANED**, then **MILESTONE 1 PASS** evidence. No new browser architecture, agent framework, model benchmark or unrelated milestone was added.
