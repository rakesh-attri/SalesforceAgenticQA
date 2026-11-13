# Implementation roadmap

See [current audit and roadmap](IMPLEMENTATION_ROADMAP.md) and [feature matrix](FEATURE_MATRIX.md) for the updated implementation state and exact remaining work. The original phases below remain the intended build order.

## Current starter scope (implemented)
- Offline fixture demonstration of story -> draft plan -> conservative dependency-aware data proposal.
- Salesforce JWT bearer token helper and bounded live Describe discovery for named sObjects.
- Source-linked local evidence store (JSON only).
- Headless Playwright test example against a local fake webpage.
- Unit test for blocked writes.

## Phase 1: Salesforce org discovery (next)
- Read-only Metadata/Tooling API retrieval of objects, record types, validation rules, Flow metadata, Apex dependencies and permissions.
- Versioned snapshot + metadata diffs + source provenance; collect only allowlisted schema.
- UI explorer with read-only browser permissions; approved seed state for each Salesforce persona.

## Phase 2: Hybrid test-data engine
- Recipe registry per business object; evaluate required values, dependencies and validation rules.
- Build dependency graph and topological sort including cyclic relationship handling.
- Approve API creates (Salesforce Composite) or supported business-service/Flow execution.
- Independent SOQL assertions, async reconciliation checks, cleanup policies, run ID isolation.

## Phase 3: Agentic reasoning
- LangGraph.js state, checkpointing and approval interruptions.
- Official Playwright Planner, Generator and Healer integration using reviewed story criteria.
- Bounded MCP tool allowlist, structured Zod contracts and human approval gates.

## Phase 4: Learning
- Chroma remote/Cloud on Windows x64, embeddings, source metadata and relevance filters.
- Risk impact via Git diff, test mappings, business criticality and historical failures.
- Structured root-cause proposals and confirmed knowledge promotion.

## Acceptance gates
- Demonstrate offline planning without hallucinated steps.
- Document all unknown Salesforce org specifics.
- Zero production writes and zero unapproved financial transactions.
- Never equate a passed local fixture with a passed live Salesforce integration test.
