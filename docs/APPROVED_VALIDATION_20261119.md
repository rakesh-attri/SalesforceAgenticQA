# Approved Gemini retrieval validation - November 19, 2026

## Actual execution

Rakesh Attri separately approved the exact two-query Gemini content and run reviews. Run GEMINI-RETRIEVAL-20261119-001 executed once at **13:13:40-13:13:41 IST** on November 19, before its original November 20, 10:52:40 IST expiry. The exact reviewed manifest and bundle hashes matched before execution. The durable intent is complete and cannot replay, including while its original deadline remains in the future.

| Integration | Newly executed result | Evidence / limitation |
|---|---|---|
| Gemini embeddings | PASS: two actual HTTP 200 responses, one valid 3,072-dimensional vector per request | gemini-embedding-001; unchanged SEMANTIC_SIMILARITY task and model namespace; no alternate envelope, coercion or retry |
| Persistent hybrid retrieval | PASS for the two reviewed queries against existing source-scoped vectors | Fresh process reopened the existing local database; no ingestion or metadata re-upload |
| Relevance benchmark | PASS: both reviewed targets ranked first; mean recall 1, MRR 1, NDCG 1 | Precision@3 = 0.3333333333333333; the existing metric divides one relevant hit by the configured cutoff of three. Only two documents exist in this reviewed scope |
| Semantic compatibility | PASS: both retrieved documents used compatible persisted vectors for each query | This is hybrid retrieval. Exact field-name lexical matches may contribute; this is not an isolated semantic-only relevance evaluation |
| Salesforce Account observation 004 | BLOCKED before activation: approval received after original expiry | Original expiry November 19, 12:00:12 IST; processing began at 13:12 IST. No renewal, replacement package, native session, new identity proof, screenshot or SOQL call |
| Gemini chat / Chroma | Not executed | Earlier chat evidence stays historical; Chroma service validation remains external/unverified |

Only **Account Name** and **Contact LastName** were sent in the two embedding requests. Existing cached documents were checked against reviewed org, permission, source, text and model-space bindings locally before either request. The broker allowed only the exact model endpoint and reviewed payload shape; requests were durably recorded before dispatch. Maximum two requests, zero automatic retries, zero denied calls. No records, documents, descriptions, formulas, permission rows, traffic or images were sent. Response vectors were used in memory; retained response diagnostics contain counts/dimensions/status only, without vector values, headers or provider text.

Actual new calls: **2 embeddings, 0 chat, 0 Salesforce, 0 Chroma**. Zero metadata uploads, zero Salesforce writes and zero new verified Salesforce lessons. No provider quota was queried or reset. The old failed benchmark and its unrecoverable HTTP-200 rejection remain historical failures, not overwritten results or a proved explanation of the earlier failure.

## Local evidence and report

- Durable request intent: .state/gemini-retrieval-20261119-001/execution-intent.json.
- Complete actual scores: artifacts/minimal-retrieval-20261119-001/retrieval-benchmark.json; evidence hash 0a4a75bd3c16aaafc954473489eae61f7a6ca3d0af9540fadfae27f51a3adcb1.
- Independent expiry outcome: .state/live-exploration-SFQA-OBS-20261119-004/approval-outcome.json; no approved copies were created in that package.
- Combined current outcome: .state/approved-validation-20261119-outcome.json.
- [Local connected HTML report](../artifacts/integration-results/APPROVED-VALIDATION-20261119-001/cb7b26491cbcc7054efb70503912e57d2c6b0de27b119b8e9c12d706c95be378/index.html).

The connected report remains **PARTIAL** because current Salesforce browser proof is missing. Its API, ingestion and chat rows retain their explicitly historical evidence classes. Its transport counts describe these **two new Gemini calls only**; historical November 18 totals are preserved separately in LIVE_INTEGRATION_RESULTS.md. The report generator's newServiceCalls=0 describes offline report generation, not the preceding authorized benchmark. It was run with fetch denied.

```powershell
# Offline saved-evidence report only; expected PARTIAL / exit 2.
npm.cmd run platform -- integration-results .state/approved-validation-results-input.json
```

Do not rerun the consumed benchmark recipe. Normal Production restrictions, all 15 responsibilities, cumulative P0/P1/P2 requirements and the dedicated QA identity/action/ownership/cleanup boundaries are unchanged. Packages 002/012 stay declined/inactive; 003 stays consumed/expired; 004 stays expired/inactive. No new browser or data-creation review was prepared. Any future browser execution requires an explicit request for a new exact review and fresh consent; this late approval cannot authorize another scope.

## Verification

Fresh required verification after the approved service execution: **358/358 unit/integration tests** passed (zero failures/skips; 425817 ms), **5/5 headless tests** passed, TypeScript typecheck passed and npm run demo passed. Logs: .state/approved-gemini-validation-{unit,headless,typecheck,demo}.log. These are offline fixture checks, not new Salesforce execution. The prior diagnostic milestone's other ten demonstrations were not rerun in this authorization-only follow-through.

The connected HTML was inspected in isolated installed headless Chrome with all HTTP/HTTPS requests blocked: 12 component rows, retrieval benchmark PASS, zero images, external requests, script errors or overflow. Inspection receipt: .state/approved-validation-report-inspection.json. No runtime implementation or assertion was changed. The existing user edit in unit/discovery.test.ts remains untouched and excluded from the commit (SHA-256 113D6D786185D998EB987C6D8FF8F86017D6E29081484FF458707B9A8494CAA1). Authentication state, database, approved reviews/intents and runtime reports remain ignored by Git.

## Next independently verifiable step

The smallest Salesforce continuation is a separately requested, exact Account-only no-create review using independently approved, scoped browser state, current API/native identity and unchanged pre/post record checks. It cannot run under package 004. Broader Gemini quality needs separately reviewed nontrivial queries and larger judged source coverage; these two exact field-name queries establish connectivity, strict response compatibility and persisted hybrid retrieval only.
