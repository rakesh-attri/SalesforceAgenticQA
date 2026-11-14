# SalesforceAgenticQA — coding agent rules

This is a NEW standalone project. Do not read, modify, or depend on `rakesh-attri/PlaywrightAgentic`.
Read README.md, docs/IMPLEMENTATION.md and memory/FRAMEWORK_KNOWLEDGE.md first.
Preserve headless-only Playwright execution. TypeScript/JavaScript only. No Docker or Python required for starter.
Never create ordinary production Salesforce records or execute real financial transactions. The user-authorized DEDICATED_QA_ORG exception permits only approved nonfinancial synthetic factories in an exact org/test-user scope with local named authorization, run ownership and guarded cleanup. SANDBOX_QA and both normal Production modes retain their existing restrictions; aliases, IsSandbox=false and environment flags never activate the exception. Never put secrets, private keys, Salesforce records, or browser storage state into git.
JWT grants Salesforce API access; do not assume it authenticates the browser. All unknown org workflows must be reported as unknown.
Do not fabricate test results or relax assertions. Review all write paths and proposed locator repairs. Track verified lessons with evidence and regression reference.
Build in this order: verified org discovery; dependency-aware test-data proposal; approved business factories and cleanup; browser workflow exploration; typed agent graph; source-linked RAG; risk-based selection; failure analysis and learning.
Always run npm run typecheck, npm run unit, npm run demo, npm test (when browsers are installed). Document results truthfully.
