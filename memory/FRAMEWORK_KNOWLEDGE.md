# Framework Knowledge Base

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
