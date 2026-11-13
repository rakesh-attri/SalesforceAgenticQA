# Framework Knowledge Base

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
