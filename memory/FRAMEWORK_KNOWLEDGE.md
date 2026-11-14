# Framework Knowledge Base

## Environment-aware QA and approved semantic planning — 2026-11-14

- Production can be an intentional read-only QA target. Use an exact org/OAuth persona/origin/capability definition, named hash-bound expiry approval and the dedicated restricted observer. PRODUCTION_CONTROLLED_QA remains review-only. Regression: environment.test.ts and production-pipeline.test.ts.
- GET alone does not prove a safe browser operation. Require exact reviewed non-mutating document/asset URLs, block unknown traffic, disable scripts/service workers/downloads/WebSockets, and never accept action/evaluation callbacks in Production. Some Lightning pages cannot operate within this boundary; report that limitation. Synthetic real-browser regression: environment.test.ts. Live Salesforce UI remains unverified.
- Ordinary callback authenticators/probes require a fresh sandbox verifier. Imported Production state must instead pass restricted DOM identity verification before a receipt is issued. API JWT is never treated as browser authentication.
- Review metadata content before embedding, not merely its reviewer label. Whitelist structural fields, bind exact bundle/source/scope/destinations, minimize fields, and keep raw records/descriptions/formulas/permissions/code local. Actual operator-approved five-field flow succeeded; the 108-field attempt hit real HTTP 429. Regression: reviewed-rag.test.ts.
- Org aliases can collide, and vector dimensions alone do not identify an embedding model. Use verified org identity hashes for live scope and provider/model/dimension namespaces for semantic vectors. Old unknown/mismatched spaces cannot contribute cosine scores. Regression: restart/scope/version/model test.
- Model-selected IDs can be checked; free prose cannot establish org truth. Grounded planning resolves fields/outcomes locally, rejects invented or omitted references and retains reviewed historical regression IDs independently of AI priority. Actual five-role Gemini run is planning evidence, not UI execution or verified self-learning. Existing failure/review/passing-regression learning tests remain authoritative.
- UI API picklists are specific to the observed record type/persona. Preserve controller indices, dependent values and source paths; never substitute global Describe values after denial. Two live reads succeeded; record-type breadth, effective sharing and business behavior remain partial/unknown. Regression: picklists.test.ts and org-intelligence.test.ts.

## Real org intelligence — 2026-11-14

- JWT success does not prove an org is a sandbox. Actual identity returned IsSandbox=false; default discovery refused it, and only an explicit read-only metadata exception proceeded. No UI/data-write gate is relaxed. Regression: org-intelligence.test.ts.
- Story personas are not automatically data objects. A generic "sales user" mention must not propose User creation. Catalog-backed matching now excludes actor-only User mentions unless explicit object intent exists. Regression: story resolver test.
- Optional relationship intent must be proposed against observed reference fields, not invented required fields. The real Account/Contact story yields Contact→Account while avoiding an inferred Account self-parent cycle. Regression: live-shaped plan/data integration test.
- Accessible permission rows and zero validation-rule rows do not prove effective sharing or absence of business rules. Preserve observed/partial/unknown coverage and source queries. Live field/class results reached bounds and are partial; component dependencies remained unknown.
- API observations are not silently trusted RAG knowledge. Store observed source/versioned facts locally; explicit reviewer publication is required for trusted scoped retrieval. Regression: observed→reviewed index test.

## Gemini integration lessons — 2026-11-14

- Gemini chat uses generateContent structured JSON and local Zod validation; embeddings use a separate batchEmbedContents model. A configured key does not establish either endpoint works. Actual model:check reported a model configuration failure and embeddings not-configured, while Salesforce read-only JWT discovery succeeded for two objects.
- Keep model advice proposed and source-cited. The graph must reject model-proposed expected-outcome changes while preserving deterministic test rendering. Regression: unit/gemini.test.ts phase-order and assertion-preservation integration.
- Preserve the symmetric Embed contract: SEMANTIC_SIMILARITY is applied consistently for Gemini document/query inputs; asymmetric tasks need an explicit interface extension. Regression: embedding payload/batch-order/dimension tests.
- Provider errors can echo credentials, so diagnostics use fixed categories without raw text/causes. Regression: Gemini auth/rate/transport/schema/redaction tests. No automatic data-write permissions are introduced by model configuration.

## Safe JWT diagnostics — 2026-11-14

The old JWT helper discarded OAuth error details on HTTP 400. Response fields can echo secrets, so substring scrubbing alone cannot guarantee safe logs. The helper now recognizes fixed codes/reasons and prints static guidance, withholding unknown provider text and transport details. Regression: unit/jwt.test.ts covers mocked audience/certificate/approval/client errors, the observed invalid_request scope/preauthorization requirement, malformed responses, secret/assertion echoes and unchanged signed JWT claims/grant. Read-only live discovery subsequently succeeded for two configured objects; this does not establish live browser or write functionality.

## Sandbox-readiness integration lessons

- Persist known factory ownership before independent verification. Otherwise verification failures lose cleanup references even though a create succeeded. Regression: readiness-pipeline.test.ts verifies cleanup after a seeded verification failure.
- Adapter verification must return affirmative evidence or throw. False/null/undefined cannot be treated as verified records. Regression: readiness-pipeline.test.ts false evidence blocks browser dispatch and preserves cleanup.
- A browser test passing is insufficient if cleanup failed. Preserve its real pass row, mark the overall lifecycle failed, and reject that run as verified-fix evidence. Regression: readiness-pipeline.test.ts cleanup failure and confirmDefect rejection.
- Gate denial must precede every effect, including cleanup. Cleanup is attempted only if setup started; unique pending run reservations prevent blind replay. Regression: denied-session and repeated-run checks.
- Browser identity must be independently verified; JWT identity does not establish browser auth. State receipts bind private file content and identity/expiry, while the runner consumes the separately approved state. Regression: session receipt tampering, identity/expiry denial and actual cookie-authenticated fixture execution.
- Chroma SDK upserts require a preflight protocol call in addition to collection/query endpoints. The initial HTTP mock failed at preflight; adding the documented-by-installed-SDK endpoint fixed it. Regression: chroma-wire.test.ts. Remote hits are intersected with local reviewed scope/version state, never promoted directly to trusted facts.

## Integrated pipeline lessons — 2026-11-13

- Extracted prose is not an executable expected outcome. The spec pipeline requires explicit expectedText, matching reviewed workflow assertions and exact criterion links. Missing negative/boundary behavior becomes a question. Regression: unit/spec-pipeline.test.ts.
- A generated file is not a passing test. The coordinator parses actual Playwright exit/status/attachments, rejects incomplete or duplicated reports and records only executed outcomes. Regression: real seeded failure and corrected run in spec-pipeline integration; blocked evaluation has zero passes.
- Trusted source text cannot change under the same source version. Scoped schema-version changes conservatively deprecate schema-dependent facts and lessons until refreshed/reviewed. Regression: knowledge version/invalidation test.
- A locator proposal must target the actual failing generated source, preserve the original expected outcome, and pass a reviewed rerun. Regression: source-hash-bound candidate rerun in spec-pipeline integration.
- A repeated reviewed finding must not blindly insert the same lesson again. The persistent learning demo exposed a uniqueness failure; confirmation now revalidates evidence/regression, accepts the same reviewed cause idempotently and rejects conflicting causes. Fingerprints include org/permission. Regression: duplicate/conflicting confirmations in unit/spec-pipeline.test.ts.
- Discovery capture timestamps are provenance, not schema changes. Lesson invalidation uses a schema-content fingerprint while execution approval still binds the exact snapshot version. Regression: unit/snapshots.test.ts.
- Synthetic parent references must be materialized before child dispatch; cleanup must preserve reverse dependency order and run ownership across all adapter modes. Regression: unit/hybrid-factory.test.ts.

## Continuation verification — 2026-11-13

- Durable checkpoints must preserve pending writes and serialized byte arrays, not only visible graph state. Evidence: unit/platform.test.ts closes and reopens the SQLite saver before resuming a real LangGraph human interrupt.
- A network exception after mutation dispatch is not proof that no record was created. Pending journal entries block automatic retry. Regression: uncertain side effects test in unit/platform.test.ts.
- Record cleanup requires run ownership, not merely a matching object name. Regression: cross-run deletion rejection in unit/platform.test.ts.
- Runtime history must derive from actual Playwright outcomes. Evidence: history reporter recorded three passed browser tests including generated workflow code; platform metrics returned executed=3, passed=3, failed=0.
- Metadata SOAP read calls use HTTP POST despite being read-only. Keep this fixed readMetadata transport separate from generic mutation dispatch. Regression: unit/metadata.test.ts rejects unsupported verbs/types, DTDs and faults.
- Dedicated approved writes extend the earlier blanket API-write-denial rule. Generic POST is still denied; sandbox identity, explicit object permission and scoped review are required by client.mutate. This is tested offline, not verified against a live org.

## Verified architecture decisions
- Local-first Windows-compatible TypeScript framework.
- Headless Playwright only.
- Salesforce metadata alone is insufficient for business-valid test data.
- Synthetic data and any test records must be isolated and approved.
- Human review required before Salesforce writes and before treating reported bugs as confirmed.

## Verified incidents
### Blocked parent propagation (2026-11-13)
Evidence: original `proposeDataPlan` ordered children after parents but never propagated parent blocked status. Fix: children require proposed parents; ambiguous required polymorphic references require a reviewed target choice. Regression: `unit/data-agent.test.ts`, blocked-parent, polymorphic and cycle tests.

### Environment flag write bypass (2026-11-13)
Evidence: original `SalesforceClient.request` accepted POST when `SFQA_ALLOW_WRITES=true` without checking sandbox identity or factory approval. Fix: all POSTs are now denied. Regression: `unit/security.test.ts`, environment flag write denial. No Salesforce record was created to verify this policy.

### LangGraph node/channel collision (2026-11-13)
Evidence: first graph unit execution failed because `plan` was both a state channel and a node name. Fix: explicit `draft_plan` and `propose_data` node names. Regression: `unit/graph.test.ts`, preserves criterion evidence and checkpointed review-required state; rerun passed.

### Local execution boundary (2026-11-13)
Evidence: tsx failed before app startup with sandbox `uv_os_get_passwd ENOMEM`; the same baseline checks passed outside the sandbox. PowerShell also rejected npm.ps1. Use npm.cmd and approved execution outside the affected sandbox; do not alter assertions or machine execution policy. Evidence recorded in docs/IMPLEMENTATION_ROADMAP.md.
