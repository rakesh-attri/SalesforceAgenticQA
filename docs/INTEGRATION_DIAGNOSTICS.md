# Salesforce and Gemini integration diagnostics - November 19

## Later exact authorization outcomes

[Approved validation results](APPROVED_VALIDATION_20261119.md): the exact two-query Gemini run executed once and passed at 13:13 IST, November 19. Two actual HTTP 200 responses contained valid 3,072-dimensional vectors; both reviewed targets ranked first using persisted source-scoped knowledge. No retry, ingestion, chat, Salesforce or Chroma call. The consumed run cannot replay. Account 004 approval arrived after its original noon deadline and was not activated or replaced. The inactive-review sections below describe preparation history; they do not authorize new execution. Current connected status remains PARTIAL, with no new Salesforce browser proof.

## November 19 diagnostic fixes - continuation from 069e2f2

This increment made **zero new Salesforce/Gemini/Chroma service calls**. All 15 responsibilities and cumulative P0/P1/P2 capabilities remain in scope. Live results below remain November 18 evidence; fresh scoped revalidation is prepared but inactive. [Detailed diagnostic report and operator steps](INTEGRATION_DIAGNOSTICS.md) records verified fixes, historical uncertainty and exact new reviews. Scopes 002/012 remain declined; 003 remains consumed/expired. No write package, record mutation or automatic retry/replay.

| Area | Implemented and verified evidence | Still uncertain / gated |
|---|---|---|
| Historical browser input | Saved state bytes and parent definition match original 003 binding; existing validator deterministically rejects state-origin. Existing minimizer removes 34 cookies/one origin into a separate copy | Original first exception was discarded; another earlier failure cannot be excluded. Current native identity/build/page are unverified |
| Browser diagnostic boundary | Durable hash/run-bound stage, timing, closed codes, page presence, safe request/response/console categories and visual availability; early state validation before launch; MCP/navigation/readiness/cleanup covered | No diagnostic grants permissions; unproved/auth pages cannot be captured, typed fixture evidence stays offline |
| Independent comparison | Trusted host now performs exact approved post-check even when session initialization fails; missing/drifted reads remain unverified | No new live comparison occurred; stored 003 Name/modification equality remains historical |
| Gemini contract | Official REST batch response is embeddings[].values in input order; existing envelope/task preserved. New safe reasons separate JSON/body timeout, envelope/count/type/dimension/nonfinite/zero/oversize failures | Original HTTP-200 body was not retained; exact historical cause is unrecoverable. No coercion, fallback endpoint, task switch or relaxed parsing |
| Persistent retrieval | Per-hit lexical/semantic/remote/compatibility evidence, retained source-scoped benchmark cases, source/model/org/persona fixture persistence after reopen and no re-upload of unchanged facts | New actual Gemini benchmark requires separate two-call review; previous complete benchmark remains failed, not retroactively repaired |
| Connected report | integration-results reads saved journals, historical comparison, vectors, citations, partial errors, transport counts and current local quota bookkeeping independently | Imported evidence is labeled; no configured key, stage attempt or old receipt implies a new live pass. Provider quota remains unqueried |

Verified: **358/358 full unit/integration tests**, **46/46 final affected-feature tests**, **5/5 headless tests**, TypeScript typecheck and **all 11 demos** passed. The private exact benchmark recipe was separately typechecked but not executed. Logs: .state/integration-diagnostics-{verified-unit,final-46-focused,final-headless,final-typecheck}.log; demos .state/integration-diagnostics-demo-summary.json. One concurrent framework demo initially had an extra qa-AC3 timeout; an isolated rerun passed with unchanged assertions/timeouts. Its exclusive cause remains unconfirmed and both runs are retained. No live request was retried.


Actual local framework output: artifacts/framework-61aa3d68-6c7a-4712-98ac-1e35bd92e50e/index.html. Generated success phase seven passed; fault phase four passed/three deliberate failures; reviewed locator regression one passed. Four synthetic mock-created/four mock-cleaned records and foreign sentinel unchanged. HTML/reportingLabs inspection found four masked fixture links, two SDK report links, zero overflow/script errors/external requests. Expanded connected report inspected 12 independent component rows, zero images/overflow/script errors/external requests. These are local/offline outcomes, not fresh Salesforce UI or Gemini passes.

## What the saved browser evidence proves

The confirmed last successful layer is independent API preflight. No browser session reservation, rendered UI receipt or screenshot followed. The unchanged export and unchanged environment definition deterministically reproduce state-origin in validateDedicatedState, even at the original attempt time. The existing minimizer removes **34 out-of-scope cookies and one origin storage entry**. No cookie/domain/value is logged. The derived copy passes only local format/origin/cookie-expiry checks, not server identity.

This is a concrete prerequisite defect in the saved inputs and in late validation/preparation. It does **not** recover the discarded first exception or prove that no preceding engine/launch/API failure occurred. The old logs retain no original stack, browser console, page screenshot or response body. No new Salesforce call was made to manufacture missing evidence.

LightningSession now records engine -> API identity -> references -> authorization -> storage state -> browser launch -> context -> native identity -> build -> session budget -> network boundary -> MCP/navigation/readiness/discovery -> cleanup using the existing boundary and same context. Closed codes and elapsed times persist in browser_execution_diagnostics, even before reservation. Production modes, source/identity/origin/action/ownership checks and original caps are unchanged. Capture reuses BrowserVisualDebug and still refuses unproved/auth/out-of-scope pages. A page existing is not permission to capture it.

## Gemini response contract audit

Google's [REST service definition](https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/generative_service.proto) defines batchEmbedContents output as one embeddings entry per request, in order, with numeric values. The current envelope already matches. A single embedContent or SDK/async response is a different contract; accepting one would hide a mismatch. The [official embeddings guide](https://ai.google.dev/gemini-api/docs/embeddings) documents gemini-embedding-001, its default 3072 dimensions and task parameter. The configured model and SEMANTIC_SIMILARITY task remain unchanged. Cosine ranking already handles vector norms; no undocumented payload normalization or cached-space/task migration was introduced.

The historical benchmark only retained HTTP 200 and a generic response rejection. Its body/shape and first case's scores cannot be recovered. Its precise cause remains unknown. Independently reproduced adapter weaknesses are fixed: invalid JSON, body-read timeout/failure, envelope/cardinality/value/dimension/nonfinite/zero/oversize errors now have safe structured diagnostics. A body abort is transport/body-timeout rather than a misleading generic response. No vector values, request headers, private payloads or arbitrary JSON keys are retained. Invalid data remains rejected and partial batches never publish vectors.

Offline fixtures prove standard 3072-vector order, malformed and SDK envelopes, cross-batch dimensions, provider-body abort, partial benchmark failure, semantic score contributions without lexical matches, process reopening, org/persona/model/source isolation and cache reuse. These tests do not establish current live Gemini health or reinterpret the failed historical benchmark as passed.

## Connected report and evidence

[Saved-evidence HTML](../artifacts/integration-results/DIAGNOSTICS-20261119-001/eac355c265d6818d86d2e7dd948dddcc3e9f9c6c783eab6beebc62a00ff5f80f/index.html) separates API authentication, browser launch/context/navigation, UI readiness, screenshots, exact comparison, Gemini ingestion/planning, persisted retrieval, benchmark outcome and local quotas. Request counts remain the actual historical Node totals: two OAuth, 54 Salesforce API, four embedding and one chat; native browser transport is separate/unknown when no receipt exists. Current local ingestion bookkeeping is not the provider's quota or a query/chat allowance.

```powershell
npm.cmd run platform -- integration-results .state/integration-diagnostics-results-input.json
npm.cmd run typecheck
npm.cmd run unit
npm.cmd test
npm.cmd run demo:framework
```

The first command is local and returns PARTIAL/exit 2 for the saved failures. It never authenticates or approves execution. Runtime artifacts stay ignored. Recent fixture HTML: framework-61aa3d68-6c7a-4712-98ac-1e35bd92e50e/index.html. All actual Salesforce/model results remain historical until a new authorized run records new receipts.

## Exact fresh inactive reviews

| Review | Hashes and original deadline |
|---|---|
| Account-only .state/live-exploration-SFQA-OBS-20261119-004 | Proposed activation **9c8e532c80b30265c1229497b6d24fc0c098efce1b29e816377e50c82303c929**; separate source-lineage .state/source-reconciliation-DIAGNOSTICS-20261119-001/account.lineage.review.json **d0beae7f1efb7ac83f8790ac42e2876c8397feba03623e5f63281a7a81d9c263**; expires **2026-11-19T06:30:12.645Z / 19 Nov 2026, 12:00:12 pm IST** |
| Embedding-only .state/gemini-retrieval-20261119-001 | Bundle **4d4c6c7fb44fe93d3a9fd1ef7be90af89bf3361bfecb6c26f29759508c9025d7**; separate exact manifest/run authorization **fb379dfbe33e1797835797e0d31dfb898ffdd5b61fb8f3bc3ea015dc2c496518**; expires **2026-11-20T05:22:40.038Z / 20 Nov 2026, 10:52:40 am IST** |

Account scope: same nominated existing QA Account and exact org/user/persona/origins; separately scoped copy .auth/qa-user-scoped-20261119-004.json, original export unchanged; one isolated local headless Chrome/MCP observation <=60 seconds, 200 requests, 64 MiB accounted resources, up to eight local masked images/8 MiB; API/native active-user/build/app/source/state proof, original name/Related/Details/stability and Id/Name/LastModifiedDate comparison. No clicks/forms/writes/Contact traversal/factory renewal/AI upload. Explicit acceptance of potentially irreversible native background effects and the dedicated user's reviewed access is still required. Native post-observation accounting does not prevent in-flight effects. No fresh native identity or readiness claim exists. Changed binding, drift, expiration or failed proof stops; no automatic renewal.

Gemini scope: two exact queries **Account Name** and **Contact LastName**, using the already persisted reviewed field vectors and unchanged model namespace. Synthetic story/facts are local provenance; no metadata re-upload, chat, Salesforce, Chroma, records, descriptions, formulas, permission rows, documents, traces or images. Only closed response stage/reason/count/dimension/HTTP/timing metadata and real relevance/semantic compatibility scores are retained. Automatic retries zero, maximum two provider requests, first failure stops. The guarded private recipe .state/execute-reviewed-benchmark-20261119-001.ts checks named content **and** manifest/run authorization, exact query/endpoint/body scope, original expiry, local pacing/cache and a durable wx intent. Pending/completed/uncertain intents cannot replay or overwrite old evidence. It has been typechecked, not executed. Neither approved copy nor intent exists before fresh consent.

These drafts are preparation only. All operators remain REVIEW_REQUIRED. User consent must name Rakesh Attri and the exact hashes/original deadlines before activation. Late consent cannot renew a deadline, change state binding, reset quotas or authorize a different package. 002/012 stay declined; 003 stays consumed. No new data-creation package exists. A full generated Account/Contact lifecycle still needs its own explicit preparation request and current automation/permission/factory/UI/session/run/cleanup/report gates.
