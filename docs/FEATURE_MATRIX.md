# Feature matrix

Status meanings: **Implemented** means working code exists; **Verified** means the stated local behavior ran successfully; **Partially implemented** means a material subset exists; **Not implemented** means no working implementation; **Blocked** identifies unavailable external verification. Installed packages alone do not establish implementation.

| Capability | Status | Evidence or remaining work |
|---|---|---|
| Windows TypeScript/Node local foundation | Verified | Baseline typecheck and local execution |
| Headless Playwright execution | Verified | Two local fixture tests; no live org |
| JWT bearer helper | Partially implemented | Host validation, redirects rejected; live authentication unverified |
| Browser StorageState configuration | Partially implemented | Local path supported; bootstrap/persona validation absent |
| Explicit bounded object/field discovery | Partially implemented | Zod Describe reader; live org unverified |
| Active picklists and required API fields | Partially implemented | Describe only; record-type constraints unknown |
| Lookup/master-detail dependencies | Partially implemented | Required reference graph; relationship semantics incomplete |
| Record types and scoped picklists | Not implemented | Unknown coverage |
| Validation rules, Flows and Apex metadata | Not implemented | Unknown coverage |
| Permissions and sharing constraints | Not implemented | Unknown coverage |
| Versioned org snapshots and source provenance | Implemented | SHA-256 storage, integrity read, source/coverage |
| Org snapshot differences | Implemented | Added/removed/changed object schema comparison |
| Dependency-aware creation proposals | Partially implemented | Ordering, ambiguous/missing/blocked parents and cycles |
| Synthetic typed values and factories | Not implemented | Reviewed recipes required |
| Source-bound reviewed recipe registry | Implemented | Validates required fields, discovered types/targets/picklists; proposal only |
| Approved API creates and business services | Not implemented | All POSTs blocked |
| Hybrid API/UI setup | Not implemented | No approved workflow adapters |
| Run record registry and idempotency | Not implemented | Needed before any writes |
| Cleanup/retained records and isolation | Not implemented | Needed before any writes |
| SOQL backend and async state verification | Not implemented | No assertion service |
| Production write/financial restrictions | Partially implemented | API POSTs denied; future adapters need review |
| Lightning/Experience Cloud exploration | Not implemented | Authorized sessions/workflows absent |
| Playwright MCP browser command | Partially implemented | Headless launcher only |
| Workflow/locator observations and UI drift | Not implemented | Evidence capture and reviewed navigation needed |
| Custom Salesforce MCP server | Partially implemented | Stdio bounded Describe tool; no write tools |
| LangGraph orchestrator | Partially implemented | Validated planning graph, decision citations, review-required result |
| Durable checkpoints and resume | Partially implemented | In-process MemorySaver checkpoint inspection only; no durable resume |
| Approval interrupts/retry side-effect protection | Not implemented | No side effects currently enabled |
| Story/criteria validation and draft scenarios | Partially implemented | Deterministic criteria mapping; no inferred rules |
| Positive/negative/boundary planning and preconditions | Not implemented | Requires verified workflow evidence |
| Requirements traceability | Partially implemented | Draft scenario evidence cites criterion IDs |
| Playwright generation/code validation | Not implemented | Fixture specs are handwritten |
| Reusable fixtures/page objects/parameterization | Not implemented | No live org framework fixtures |
| Git change and component impact analysis | Not implemented | No risk selection engine |
| Configurable risk scoring and mandatory suites | Not implemented | No risk selection engine |
| Deterministic execution service | Partially implemented | Playwright CLI only; no selected-suite service |
| Screenshots, traces, HTML and JUnit | Implemented | Playwright reporters and failure capture configured |
| Reporting Labs integration | Not implemented | Provider/configuration not supplied |
| Local evidence JSON storage | Partially implemented | Source-linked add/read; no trust promotion workflow |
| Structured execution history database | Not implemented | JSON evidence is not a database |
| Redacted normalized ingestion/chunking | Not implemented | No ingestion pipeline |
| Embeddings and Chroma retrieval | Not implemented | Client dependency installed only |
| Source version/org/permission retrieval filters | Not implemented | No semantic retrieval pipeline |
| Failure classification/root-cause hypotheses | Not implemented | No investigator implementation |
| Evidence-based defect reporting/correlation | Not implemented | No defect workflow |
| Reviewed self-healing/intent validation | Not implemented | No repair mutation path |
| Verified learning and regression recommendations | Not implemented | Engineering memory only |
| Bounded autonomous exploration | Not implemented | No action executor or budgets |
| Coverage gap detection | Not implemented | No coverage model |
| Trends/flakiness/advanced analytics | Not implemented | No structured history |
| TypeScript AI evaluation foundation/dashboard | Not implemented | No model evaluation harness |
| Knowledge effectiveness metrics | Not implemented | No retrieval evaluation |
| CLI Mode A discovery | Partially implemented | Bounded Describe/fixture only |
| CLI Mode B story to test | Partially implemented | Draft plan/data proposal only |
| CLI Modes C/D/E/F | Not implemented | Regression/exploration/investigation/maintenance absent |
| Offline mock fixtures and demo | Verified | Baseline demo and tests |
| Live sandbox integration verification | Blocked | Authorized credentials/session/recipes not provided |
| Complete P0/P1/P2 master definition of done | Not implemented | Substantial roadmap remains |
