# Implementation roadmap

## Baseline and increment 1

Audit completed 2026-11-13. Baseline: typecheck passed; 1 unit test passed; offline demo completed; 2 headless local fixture tests passed. PowerShell blocks npm.ps1; use npm.cmd. Sandbox Node user lookup fails with `uv_os_get_passwd ENOMEM`; checks succeed outside that sandbox.

Implemented first increment: response-validated discovery with explicit unknown coverage, immutable content-addressed snapshot versions and integrity checks, schema diffs, required dependency blocking fixes, permanent API write denial, stricter JWT/transport boundaries and JUnit reporting. Added a validated LangGraph proposal-only planning graph with in-process checkpoints and a read-only Salesforce stdio MCP discovery server. Regression references are in memory/FRAMEWORK_KNOWLEDGE.md.

## Remaining dependency order

1. Expand read-only discovery to authorized record types, validation rules, Flows, Apex, permissions and sharing. Validate against mocked responses and an authorized sandbox; preserve denied/unknown coverage.
2. Build reviewed synthetic factory recipes, verified sandbox identity, approval binding, idempotency journal, async SOQL verification and reverse-order cleanup. Keep every public write entry point fail-closed until all gates exist.
3. Establish approved browser sessions per persona; bounded headless Playwright MCP observations, evidence and locator review. Prohibit financial actions.
4. Add Zod-validated LangGraph nodes, durable checkpoints, human interruptions, retry protection and custom Salesforce MCP tools. Add CLI modes A–F.
5. Add normalized, redacted, source-versioned ingestion; embeddings and remote/Cloud Chroma; structured local execution history; permission-filtered retrieval and evaluation fixtures.
6. Add criteria-linked planning, reviewed code generation, independent API/UI assertions and generated-code validation.
7. Add deterministic configurable change/risk selection, mandatory suites and verified history inputs.
8. Add evidence-linked failure hypotheses, reviewed locator proposals, verified learning and bounded exploratory testing.
9. Add Reporting Labs, trend/flakiness analytics, coverage gaps and TypeScript-native AI evaluations. Do not introduce Python to satisfy a vendor name.

## Integration prerequisites

Authorized sandbox credentials, approved app/JWT configuration, uniquely configured org alias, reviewed business recipes, authorized browser session, model provider, remote Chroma and Reporting Labs configuration are not supplied by the repository. They block live verification, not implementation of local contracts and mocks.

The master request is not complete. Remaining implementation is recorded explicitly in FEATURE_MATRIX.md.
