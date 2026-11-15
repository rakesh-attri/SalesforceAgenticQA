# Implementation roadmap

## Continuation status

The current FEATURE_MATRIX.md supersedes earlier inventory. Durable orchestration/history, bounded metadata clients, guarded API journaling, semantic retrieval and P1/P2 quality services have working implementations. Next work includes supported Lightning rendering/locators, richer hybrid recipes/exploration, live sandbox/vector breadth, permissions/impact, repair and AI evaluations. reportingLabs is the identified open-source reporting-labs npm package; local Playwright integration is implemented and offline verified, with no hosted account/API key. Advanced reporting/CI customization is engineering work. Fixtures and negative-page metadata never establish live workflow completion. See LIGHTNING_DIAGNOSTICS.md and REPORTING_LABS.md.

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
9. Extend implemented local reportingLabs with lifecycle/CI dashboards, trend/flakiness evaluations, coverage gaps and TypeScript-native AI evaluations. No Python or hosted reporting API is required.

## Integration prerequisites

Live Salesforce requires current exact org/user/session/resource/factory approvals and budget; dedicated auth/setup/SOQL/cleanup have actual evidence, while positive UI execution remains unverified. Gemini chat/embedding/local retrieval have prior live evidence; external Chroma is unverified. These boundaries do not block local reporter engineering. reportingLabs configuration is supplied and tested and needs no API key/account.

The master request is not complete. Remaining implementation is recorded explicitly in FEATURE_MATRIX.md.
