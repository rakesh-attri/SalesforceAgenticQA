# Architecture

SalesforceAgenticQA is an independent Windows/Node/TypeScript project. No other automation repository is a dependency.

## Working pipeline

`CLI -> validated story and org snapshot -> deterministic draft planner + dependency proposal -> local artifacts`

Live discovery uses JWT API authentication and bounded Describe GETs. Zod validates responses before they enter an org snapshot. Coverage records distinguish observed schema from unknown business rules. Content-addressed snapshots live under ignored `.state/snapshots`; snapshot reads verify integrity. Diffs reject different org aliases or fixture/live sources. Configure a unique `SFQA_ORG_ALIAS` for each authorized org; the alias is operator supplied, not verified org identity.

Data proposals sort required single-target relationships, block unknown or ambiguous targets, propagate blocked dependencies, and reject cycles. Optional lookups are not automatically made required. Proposals never authorize execution or infer valid business values.

The recipe registry binds reviewed definitions to a precise org snapshot hash. It rejects unknown/noncreateable fields, missing API-required fields, type mismatches, unobserved picklist values and invalid parent targets. Review provenance is required but does not authorize writes. No synthetic record materialization or execution adapter is implemented.

The Salesforce transport rejects all POSTs, including when the legacy write environment flag is true. No production or sandbox writes are supported yet. JWT and API requests reject redirects and use bounded request timeouts. Browser storage state is a separate user-provided integration prerequisite; JWT is not a browser login.

Playwright runs headlessly against a local synthetic application with HTML, JUnit, screenshots and failure traces. Its outcomes do not establish live Salesforce behavior. Local JSON evidence storage is neither a relational execution database nor semantic retrieval.

## Planned boundaries

Discovery must precede approved factory recipes and cleanup. Browser observations must precede executable UI generation. A LangGraph state machine will orchestrate deterministic tools, reviewed approvals and retry-safe side effects. MCP tools must share those safety checks. Chroma retrieval must filter by org, permission, source version and verification status. Only reviewed evidence can become trusted learning. Failure conclusions remain hypotheses until supported by independent verification.

The optional `npm.cmd run demo:graph` uses an actual LangGraph sequence: validation, criterion planning, dependency proposal and review-required result. Each stage validates its output; decisions cite story or org observation sources. MemorySaver checkpoints can be inspected within the same process. This does not provide durable restart recovery, human approval interrupts or an execution path.

`npm.cmd run mcp:salesforce` starts a stdio MCP server exposing only bounded `discover_schema`. It accepts explicit names rather than arbitrary HTTP paths or SOQL. Provider failures return a generic diagnostic; credentials never enter tool results. An in-memory MCP client/server test verifies the public tool boundary. The browser MCP launcher remains a separate headless command, not an implemented explorer.

Semantic indexing, autonomous execution and learning remain unimplemented. See FEATURE_MATRIX.md for the authoritative capability inventory.
