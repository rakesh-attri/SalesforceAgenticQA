# SalesforceAgenticQA — coding agent rules

This is a NEW standalone project. Do not read, modify, or depend on `rakesh-attri/PlaywrightAgentic`.
Read README.md, docs/IMPLEMENTATION.md and memory/FRAMEWORK_KNOWLEDGE.md first.
Preserve headless-only Playwright execution. TypeScript/JavaScript only. No Docker or Python required for starter.
Never create production Salesforce records or execute real financial transactions. Never put secrets, private keys, Salesforce records, or browser storage state into git.
JWT grants Salesforce API access; do not assume it authenticates the browser. All unknown org workflows must be reported as unknown.
Do not fabricate test results or relax assertions. Review all write paths and proposed locator repairs. Track verified lessons with evidence and regression reference.
Build in this order: verified org discovery; dependency-aware test-data proposal; approved business factories and cleanup; browser workflow exploration; typed agent graph; source-linked RAG; risk-based selection; failure analysis and learning.
Always run npm run typecheck, npm run unit, npm run demo, npm test (when browsers are installed). Document results truthfully.
