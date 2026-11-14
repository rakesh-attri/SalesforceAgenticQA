# Salesforce browser authentication and first live lifecycle

This guide continues the dedicated personal QA mode. It does not authorize ordinary Production writes, change app permissions or establish a browser session merely because JWT/API access works. Keep the default read-only policy separate from `.state/dedicated-qa-policy.json`.

## External Client App settings: administrator review only

| Setting | Requirement for this framework |
|---|---|
| OAuth and JWT bearer | Retain the working OAuth/JWT bearer configuration and matching RSA public certificate. Keep the existing grant type; no password grant, client-credentials substitution or client-secret requirement is added. |
| `api` — Manage user data via APIs | Required for REST metadata/SOQL and the separately approved Account/Contact factories. Object, field and record authorization still applies. |
| `web` — Manage user data via Web browsers | Required for the UI Bridge token. Salesforce also accepts `full`, but that broader scope is unnecessary for the requested setup. App configuration alone is not proof of effective token scope. |
| Identity / `id` | Identity service access underpins the current-user checks. Salesforce documents identity access with standard OAuth scopes; this implementation does not consume an ID token. |
| `openid` | Not a UI Bridge prerequisite. Needed when separately implementing an OpenID Connect ID-token flow; do not add it merely to repair this browser gate. |
| `refresh_token`, `offline_access` | Not the UI Bridge permission and not a substitute for `web`. Prior user approvals involving refresh-token authorization can affect JWT scope issuance. Preserve the working installation/preauthorization configuration; an administrator must review any change. JWT bearer itself never issues a refresh token. |

The scope meanings come from [Salesforce OAuth Tokens and Scopes](https://help.salesforce.com/s/articleView?id=remoteaccess_oauth_tokens_scopes.htm&language=en_US&type=5). The `web`/`full` requirement is specified by the [UI Bridge API](https://help.salesforce.com/s/articleView?id=sf.frontdoor_singleaccess.htm&language=en_US&type=5). These are app/token capabilities, not permission to access every record.

In External Client Apps Manager, an authorized administrator reviews the app's OAuth settings and policies. With **Admin approved users are pre-authorized**, the dedicated user must be assigned app access through an approved profile/permission set. With **All users may self-authorize**, JWT scopes derive from prior authorizations; adding a scope to the app does not by itself update that prior consent. Obtain a fresh JWT token after the administrator completes authorization. The framework cannot request extra scopes in a JWT bearer request. See [JWT bearer flow and scope issuance](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_jwt_flow.htm&language=en_US&type=5) and [External Client App OAuth settings](https://help.salesforce.com/s/articleView?id=sf.configure_external_client_app_oauth_settings.htm&language=en_US&type=5). Do not weaken app security settings or enable unrelated OAuth flows.

## Dedicated user and origin prerequisites

The runtime user needs API access and a license/profile that permits the reviewed Salesforce UI. **API Only User must not be enabled** for UI Bridge. Salesforce explicitly rejects that user category; the framework does not remove the permission. API-enabled service users without UI eligibility cannot be made browser users by importing another user's cookies. See [Salesforce UI-only restriction](https://help.salesforce.com/s/articleView?id=release-notes.rn_security_singleaccess_frontdoor.htm&language=en_US&release=260&type=5).

The reviewed factory needs create/read access to Account.Name, Account.Description, Contact.LastName, Contact.Description and Contact.AccountId, plus appropriate Account/Contact delete and record access for its two owned rows. Cascade inspection also needs sufficient read access to every declared cascading child relationship; inaccessible or active children block cleanup. Do not grant Modify All Data, View All Data, administrative app-management rights or broad permission changes to make a test pass. The dedicated mode still requires the exact org/user/persona, nonfinancial automation review and separate data/UI approvals.

UI Bridge requests must use the approved My Domain or Experience Cloud origin, not the generic login/test host. The API call uses a Bearer header and fixed relative landing path. The returned frontdoor URL is sensitive, single-use and valid for at most one minute; Salesforce can return the same URL during that window, even after a caller consumed it. Avoid rapid retries and never paste, log, trace or manually replay it. Browser landing waits for the approved asynchronous redirect; waiting does not allow another origin or action. [UI Bridge endpoint and URL lifetime](https://help.salesforce.com/s/articleView?id=sf.frontdoor_singleaccess.htm&language=en_US&type=5).

## Independently approved state import

An operator may supply Playwright-format state from their normal, approved authentication process as the exact dedicated QA user. The framework stays headless, never enters passwords/MFA, never clones another user's profile and never extracts state from arbitrary browser profiles. Do not paste cookies/tokens into prompts or Git.

Place the private file under ignored `.auth`. Use a minimized export containing only the policy's exact approved origin storage and cookies for those exact hosts. Shared parent-domain cookies, unrelated login/other-org storage, insecure/expired session cookies and missing host sessions are rejected. Broad browser-profile exports must not be silently treated as approved state.

```powershell
npm.cmd run platform -- dedicated-session .state/dedicated-qa-execution.json .auth/approved-state.json
npm.cmd run platform -- dedicated-check .state/dedicated-qa-execution.json
```

For a full independently approved export, explicitly create a separate narrowed copy with `dedicated-import EXECUTION_FILE .auth/qa-user.json`. It retains only already approved hosts/storage, preserves cookie values/flags and leaves the original file unchanged. Existing copies are not overwritten; subsequent verification uses `dedicated-session EXECUTION_FILE COPY_PATH`.

The native verifier selects one secure, nonexpired session cookie for **each** approved origin. It preserves Salesforce's optional HttpOnly flag and does not change org settings; see [Session Settings](https://help.salesforce.com/s/articleView?id=sf.admin_sessions.htm&language=en_US). API-compatible cookies are proved in an empty verifier context cleared between requests. Supported non-OAuth sessions can use the fixed read-only SOAP [getUserInfo utility](https://developer.salesforce.com/docs/platform/api/guide/sforce-api-calls-getuserinfo.html), never an API JWT substitution.

The observed Lightning child session is domain-restricted. Its proof uses the same approved origin's fixed landing document with JavaScript and redirects disabled. A strict non-executing AST parser reads the observed Salesforce-generated CurrentUser and ContentAsset org provider layout, rejects ambiguous/unknown layouts, and compares exact server identities. Only valid 15/18-character representations of the same Salesforce ID are equivalent; policy allowlisting remains bound to fresh API identity. An authenticated API cookie cannot mask a different Lightning user or org. Raw HTML, IDs and session values are not logged. State-content hash and a named, private receipt valid for at most 15 minutes/policy lifetime are required. Protect state/receipts using Windows ACLs.

Without a state argument, `dedicated-session` attempts UI Bridge. Category-only failure information is saved in `.state/dedicated-session-diagnostic.json`; no query strings, one-use URLs, response bodies or DOM text are reported. A separate local origin-review artifact records blocked canonical origins and recognized authentication paths, never query values. It grants nothing.

`dedicated-auth-review` can prepare a separate named authentication-only review for the closed supported GET document handoff paths. Unsupported paths, methods, origins or scripts fail closed. After explicit operator review, the exact hash-bound, expiring approval belongs at `.state/dedicated-auth-handoff.json`. It applies only while creating the session: it never extends business UI/data origins, allows forms, or authorizes arbitrary bootstrap traffic. Extra authentication-origin state is removed before the private execution state is saved. Current live observed paths are unsupported, so the draft command correctly refuses them; there is no approved handoff artifact in this run. Prefer independently approved state rather than widening the route guard.

## Readiness, observed selectors and execution

`dedicated-check` is repeatable and performs no create/delete or run reservation. It validates the reviewed package, fresh API identity/active user, Account/Contact schema, deterministic factory, independently verified browser receipt and cleanup access. `ready-for-owned-ui-discovery` means those preconditions passed; it is not a test result or selector proof.

Cleanup checks existing visibility sufficient to avoid hidden child rows; the current implementation recognizes an already assigned profile-level sharing override and never grants it. Child inspection uses actual Describe relationship names, including parent subqueries for virtual ActivityHistory. Explicit null empty results are supported; missing/malformed/inaccessible results and any populated dependent still block deletion. Do not grant broad permissions merely to fix a test. Permission-set-only visibility support remains partial. `dedicated-cleanup` produces a separate recovery report with fresh SOQL absence proof and does not turn a failed UI run into passed execution or learning.

Once every gate passes, the exact authorized lifecycle creates its two synthetic owned records and independently verifies them. A new guarded headless observation phase visits only those owned pages, checks the **previously approved** candidate locators and saves source-bound `selector-evidence.json`. Every selector must be unique, visible and match the unchanged expected text. Evidence binds the exact run/data plan/policy/spec/documents and expires after five minutes. The deterministic review checks the observation against the named approved workflow; it does not invent a human review or propose a locator repair. Missing/ambiguous selectors or workflows requiring unknown steps block generation, clean only known owned records and publish no learning. The framework never browses unrelated existing records to find examples.

Only then does it generate and execute Playwright TypeScript, repeat SOQL verification, clean Contact then Account with cascade/ownership/absence checks and report actual results. Learning requires the whole lifecycle to pass. Defect causes still require the separate failure + named cause/fix review + passing regression gate. A failed preflight run ID cannot replay; after resolving prerequisites, review a fresh run package for the already authorized bounded lifecycle.

## Exact static dependency review

Some required Salesforce code comes from a different static CDN origin. It is not added to business origins. `dedicated-static-review OBSERVATIONS_FILE EXECUTION_FILE` prepares a local exact script/style URL bundle. Its separate named approval binds org, user, environment definition, spec version, URL/resource type, hash and expiry; it belongs at `.state/dedicated-static-approval.json` only after explicit operator approval. No env flag authorizes it.

Only exact reviewed GET script/style requests on known static namespaces or Salesforce static CDNs are supported. Documents, XHR/API actions, POSTs, Apex pages, unrelated tenant origins, credential-bearing URLs and unknown URLs stay blocked. Authorization headers are removed; cross-origin requests containing cookies are denied and referrers removed. Route fallback preserves other guards. No financial or administrative action becomes permitted. Current draft: 15 observed resources, with one additional origin `https://b.static.lightning.force.com`; activation awaits its separate named approval.

`dedicated-dependencies EXECUTION_FILE STATE_PATH` can diagnose dependencies without another data run, after proving that historical run references were framework-owned and are now absent. It visits only those known negative page URLs, executes zero assertions and blocks every business RPC/server action. It cannot publish learning or treat a missing record as a passed test. This preserves the daily creation budget while preparing source-backed transport review.

## Current evidence — 2026-11-14

| Capability | Actual result |
|---|---|
| Live API identity, active dedicated user, Account/Contact schema/factory readiness | Passed under the unchanged exact named scope. No run reservation or record writes in readiness. |
| Live UI Bridge API after administrator update | Passed its scope gate and returned a validated one-use URL. No app permissions changed by the framework. |
| Live headless session | Imported approved state, narrowed without changing values, passed both origins' actual org/user proof and private receipt gates. UI Bridge API succeeds, but its unsupported auth handoff remains blocked; import is the working alternative. |
| Live Account/Contact setup and SOQL | Runs 003/004 each created and independently verified one synthetic Account and linked Contact. No unrelated records were seeded or adopted. |
| Live cleanup | Both runs' two records were deleted with absence checks: run 003 recovered after fixing explicit-null handling; run 004 automatic cleanup passed. Four created/four deleted, zero retained or uncertain. Original failed UI outcomes remain failed. |
| Live dependency metadata | Run 004's known deleted references were rechecked absent through SOQL before a bounded headless diagnostic: zero data creation, assertions, business RPCs or learning; 36 requests denied. The exact static bundle remains inactive. |
| Live UI selectors/generated tests/learning | Owned-page observation attempted, but required static resources were denied and approved selectors not observed. Generated live tests and verified Salesforce learning have not run. Exact static approval is pending. |
| Offline security and lifecycle | Latest complete suite: 128 unit/integration tests; 3 existing headless tests and all demos passed. Covers real guarded fixture observations/generated tests, strict session/source/ID validation, foreign/null/malformed child boundaries, recovery and credential-free exact CDN grants. Diagnostic action names use a finite vocabulary; arbitrary namespaces/actions and request values are withheld. |
| Gemini/RAG and remaining roadmap | Prior live evidence retained; no new external AI payload or Chroma validation. All 15 owners and P0/P1/P2 gaps remain in FEATURE_MATRIX.md. |

Continuation: resolve the concrete static approval, inspect known read-only transport dependencies without creating data, then use the remaining quota for a fresh bounded lifecycle. Generate tests only after actual owned selectors are observed; retain blocked learning otherwise. Richer workflows, autonomous exploration, connectors/reporting and wider AI evaluations remain in scope.
