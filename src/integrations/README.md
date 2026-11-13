# Integration status

- LangGraph runtime: `npm.cmd run demo:graph` runs validated deterministic planning with in-process checkpoints. Durable resume and approval interrupts are not implemented.
- Salesforce MCP: `npm.cmd run mcp:salesforce` exposes read-only bounded Describe discovery over stdio. No write or arbitrary query tools are exposed.
- Browser exploration: use the official Playwright test agent definitions and Playwright MCP in an approved authenticated sandbox context.
- Chroma: source-linked embedding index. `src/knowledge/store.ts` is **offline JSON evidence**, not semantic RAG.
- Browser authentication: JWT is API authentication only. Implement a reviewed UI session bridge separately; no MFA bypass.
- Actual test-data writes: intentionally not implemented. Require explicit sandbox allowlist, field/record-type/Flow analysis, reviewed recipes, cleanup and run ownership.
- Defect learning: reviewed incidents only; never promote unverified agent guesses.
