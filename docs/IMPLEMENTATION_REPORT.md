# Implementation report — 2026-11-13

## Environment-aware QA and reviewed live RAG — 2026-11-14

Continued from 0a27359 on feature/verified-discovery, preserving the pre-existing user edit in unit/discovery.test.ts. Reconciled the cumulative feature matrix, architecture, sandbox guide, knowledge and all 15 responsibilities before implementation. Dependency chain implemented: environment approval → restricted observation/session gates → structural metadata review → versioned persisted embeddings/retrieval → five grounded reasoning roles and evaluations. Then extended record-type-scoped UI API metadata reads. Existing factories, JWT grant/security checks, workflow generation, history, failure investigation and reviewed learning remain intact.

Implemented SANDBOX_QA capability checks, PRODUCTION_READ_ONLY_QA exact org/OAuth user/persona/origin/capability/hash/expiry/named-operator policies, and PRODUCTION_CONTROLLED_QA definitions/review with execution denied. Production connection now requires the reviewed local policy; generic writes remain disabled and dedicated mutations retain fresh sandbox-only checks and separate approvals. Identity-only policy preparation never exposes tokens or a writable client. Headless production observation has a strict navigation/read DSL, exact safe URLs, JavaScript/service-worker/download/WebSocket denial, GET/HEAD-only documents/static assets and fresh DOM identity checks. The spec graph rejects production recipes/executable workflows, preserves exact source assertions and records real observation evidence separately. General browser authentication/probe callbacks are now sandbox-gated, including typed callers. A restricted session-verification command can issue private content-hashed receipts from reviewed imported state; no production login automation was added.

Implemented a field-minimized metadata export with no records, labels, descriptions, formulas, permission rows, raw org/user/record-type IDs or code. External transmission requires a named exact-content/source/scope/destination hash and expiry; configured providers no longer automatically upload raw discovery. Reviewed persistent retrieval uses a hashed verified org identity and exact permission scope, deprecates stale versions, and namespaces embedding models/dimensions. Existing Gemini interfaces are reused. Spec Analyst, Planner, Generator, Investigator and Learning select only supplied fact/criterion/history IDs; expected outcomes resolve locally to the exact story. Historical reviewed defect/lesson test IDs force regressions independently of the model. This integrates planning proposals; it does not turn model text into approved workflows, verified facts or write authority.

Actual external evidence, with Rakesh Attri's explicit filtered-metadata approval:

- Salesforce policy-bound read-only discovery succeeded on the intentional Production org (IsSandbox=false): 1,088 catalog objects, Account/Contact selected, 108 fields, two Describe record types. Added two successful exact-record-type UI API picklist reads. Existing bounded inventories returned 84 object permissions, 200 field permissions (partial), 200 Apex classes (partial), 17 triggers, 13 flows and two assigned permission sets. Dependency coverage remains unknown; zero queried validation rows do not prove no business rules.
- `model:check` received valid real chat and embedding responses with synthetic input. Bulk 108-field embedding then hit HTTP 429. The smaller approved five-field bundle successfully published five Gemini vectors. A separate CLI process reopened SQLite, generated a real query embedding and retrieved all five source-linked facts. Five real Gemini role calls proposed three source-bound scenarios. Reference validation passed, outcomes were preserved, and the five-field retrieval smoke yielded precision/recall 1/1. This is not a broad semantic/business-correctness benchmark.
- No live Salesforce browser/session, production record mutation, financial transaction or external Chroma request was executed. External Chroma is unconfigured. UI session/state/safe identity view and separate browser policy remain external prerequisites. A writable run requires a different verified sandbox, reviewed recipes and exact approvals.

Verification: **typecheck passed; 84 unit/integration tests passed; original demo passed; 3 headless browser tests passed**. New unit/integration suites include a real synthetic headless browser demonstrating disabled scripts and denied form POST/unknown GET, mocked production graph dispatch, expiry/hash/persona/origin/capability denials, restart/version/permission/org/model-space isolation, rejected invented fields/outcomes/citations, reviewed history regression retention and typed record-type UI API reads. Mocks and local browser fixtures are not Salesforce UI verification. Existing actual failure → reviewed correction → passing regression → future prioritization tests remain passing.

Evidence stays in ignored .state/artifacts: local policy, review bundle/approval, raw intelligence, reviewed-rag.sqlite, grounded plan and live-integration-validation.json. ENVIRONMENT_QA.md documents exact commands and review prerequisites. FEATURE_MATRIX.md retains all original/later rows and unfinished P0/P1/P2 work. Still partial: broad Lightning/Experience Cloud exploration, org UI/business-service factories, effective sharing/deep dependency mapping, pending-run recovery adjudication, autonomous actions, semantic coverage/quality benchmarks, connectors/imports and Reporting Labs' unspecified API contract. Next: separately reviewed strict observation readiness and richer permission/dependency/retrieval evaluations; keep Production controlled execution disabled.

## Real org intelligence and story readiness — 2026-11-14

Continued from d15a06e without modifying the existing user edit in unit/discovery.test.ts. Reconciled current FEATURE_MATRIX.md, sandbox execution contracts, all 15 owners and original/later P0/P1/P2 requirements. Added bounded global-catalog story resolution, extended Describe fields/relationships/record-type metadata, typed versioned intelligence, scoped metadata/permission queries, local observed/reviewed knowledge indexing and a live-schema-backed draft test/data plan. Existing JWT, write approvals, browser gates, Gemini contracts, failure intelligence and verified learning are preserved.

Actual identity verification exposed a material mismatch: configured org reports **IsSandbox=false**. Default intelligence discovery correctly refused it. An explicit metadata-only non-sandbox read policy was then exercised under the project's production-read-only rule. No sandbox data setup, live UI testing, business record query/mutation or financial transaction was executed. Browser preparation remains blocked and does not derive browser authentication from JWT.

Final live read-only run: 1,088 catalog entries; Account/Contact selected from the story with no explicit object list; 108 fields and two Describe record-type entries; selected RecordType/ValidationRule queries returned zero rows; 84 object-permission rows, 200 field-permission rows (partial); 200 Apex classes (partial), 17 Apex triggers, 13 flow definitions, two assigned permission sets. CustomObject Metadata API read completed (partial interpretation); component dependency query remained unknown. Inventories do not prove business behavior, effective sharing or complete validation coverage. Exact sources/raw data are local only under .state/org-intelligence/87fbba2f5507ef78d8dc8d0a46acbb05bfa28a09585bf25ead1614382c5de499.

Actual story outputs: artifacts/SFQA-ACCOUNT-CONTACT/org-intelligence-plan.json contains three draft source-backed scenarios, Account Name/Contact LastName prerequisites and proposed Contact→Account dependency. approved=false and executable=false are explicit. Metadata knowledge is stored as observed by default; review is required for trusted retrieval. Tests exercise reviewed publication and scoped retrieval with fixtures, not a fabricated human review of live metadata.

Gemini connectivity recheck actually executed: chat failed model configuration validation; embeddings not-configured. No live Gemini/remote-vector result is claimed. See ORG_INTELLIGENCE.md for offline/live comparison and source contracts. Next: resolve the sandbox/environment mismatch, review discovered metadata, configure Gemini models if desired and establish a reviewed headless browser persona/session before UI testing; continue effective permission/record-type/dependency analysis as engineering work.

Verification completed: typecheck passed; **69 unit/integration tests passed**, including five new org-intelligence tests; original demo passed; **3 headless browser tests passed**. The actual spec graph test retrieves explicitly reviewed org facts, carries the optional Account-reference proposal into the Data Agent and remains blocked from execution without reviewed workflows. Partial/unknown section coverage is carried into planning warnings and graph-compatible snapshots. `org-plan` regenerates the draft from saved live intelligence without network calls. Live knowledge remains observed pending an operator's actual review, and all raw metadata/permissions, snapshots, auth state and reports remain ignored by Git.

## Gemini provider integration — 2026-11-14

Reviewed the existing configuration, JWT diagnostics, deterministic reasoning graph and callable embedding adapter. No chat provider interface existed, so added a provider-neutral StructuredChat contract and native TypeScript Gemini Developer API implementation while preserving Embed and the existing OpenAI-compatible adapter. No Salesforce auth grant or write policy was changed; the existing user edit to unit/discovery.test.ts remains untouched.

Added separate chat/embedding configuration with alias/field validation, pinned HTTPS/header authentication, Zod JSON-schema output validation, safe input/output redaction, bounded timeout/retries/Retry-After/pacing and batching/vector checks. Graph phases now call optional Spec Analyst, Planner, Generator and Investigator reasoning hooks. Advice remains proposed, citations must resolve to input evidence, and workflow expected outcomes cannot be replaced by model text. Other reasoning roles use the same typed service. Reports expose failed model roles; deterministic execution remains independently verified.

Actual external verification: read-only JWT/Describe succeeded for two configured objects using the existing .env. model:check executed and reported a chat **model configuration** failure plus embedding **not-configured**; no live Gemini response was validated or claimed. No Chroma/Vertex/model-quality or live Salesforce browser/write behavior is established by these checks. Setup, commands and limitations are in GEMINI.md and .env.example.

Final executed checks: typecheck passed; **64 unit/integration tests passed**, including 10 focused Gemini tests; original demo passed; **3 headless browser tests passed**. Coverage includes actual phase-level mocked reasoning, rejected invented citations/changed assertions, rate/timeout and concurrent pacing, separate embedding shape/order/dimensions, privacy and backward-compatible HTTP embedding configuration. All original deterministic, auth, session, data-lifecycle and learning checks remain passing.

## JWT OAuth diagnostic fix — 2026-11-14

`src/salesforce/jwt.ts` now parses failed OAuth JSON error/error_description fields and emits recognized codes plus fixed, credential-safe descriptions/guidance. Arbitrary provider descriptions, response bodies and transport errors are withheld. Mappings cover invalid_grant/client, audience, signature/certificate, assertion validity, consumer approval and the observed invalid_request refresh_token scope/app installation/preauthorization requirement. Non-JSON, malformed success and echoed-secret responses have safe fallbacks. Existing host validation, RS256 signing, 180-second JWT lifetime, redirect denial, timeout and JWT bearer grant remain intact.

Verification: typecheck passed; 54 unit/integration tests passed; offline demo passed; all 3 headless browser tests passed. JWT tests use generated temporary RSA keys and mocked responses, verify the emitted JWT signature/claims/grant, and assert that echoed credentials/assertions/tokens never enter diagnostics. The existing local edit to unit/discovery.test.ts was preserved.

Actual read-only discovery was retried. An earlier HTTP 400 invalid_request was safely categorized as the refresh_token scope/app installation/preauthorization requirement. The latest retry authenticated successfully and discovered two configured objects; metadata was saved only under ignored .state. The diagnostic change does not itself change app settings or the authentication grant. Broader live workflows, browser authentication and writes remain unverified. No credentials or raw OAuth responses are included in this report.

Guidance was checked against Salesforce's [OAuth error documentation](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_flow_errors.htm&language=en_US&type=5) and [JWT bearer-flow documentation](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_jwt_flow_ca.htm&language=en_US&type=5).

## Sandbox-readiness increment (current)

Reconciled all original P0/P1/P2 and later specs-to-tests requirements against FEATURE_MATRIX.md before implementation/reporting. The current matrix is now a single inventory; conflicting historical tables moved to HISTORICAL_FEATURE_MATRIX.md. No earlier requirement was removed. Started from `43f93fb` on the existing isolated `feature/verified-discovery` branch.

Dependency chain implemented: execution approval → fresh API/sandbox identity and schema/session checks → approved recipe planning → hybrid setup → independent verification → concrete record-reference binding → authenticated generated execution → approved reverse cleanup → lifecycle investigation/reporting. The existing offline flows remain supported.

Completed within their stated scopes:

- Spec graph calls the existing hybrid factory and runtime preflight. Known creations are journaled before verification, so verification failures still allow approved cleanup. Session/gate failures cannot initiate setup or cleanup. Pending run reservations prevent replay of uncertain effects. Explicit reviewed retention is supported.
- Verified browser-state path is supplied to headless Playwright. Private receipts bind state SHA-256, org/user/persona, approved HTTPS origins, reviewer and bounded lifetime; consumed state and receipt paths are resolved under `.auth`. Existing session creation also rejects invalid/outside destinations before authentication and checks resolved output directories.
- Configured live API runtime fetches fresh OAuth userinfo and sandbox identity, re-describes reviewed objects to reject schema drift, and independently probes the approved browser persona before setup and before browser execution. CLI wiring is available but no Salesforce connection was executed.
- Overall lifecycle status is distinct from actual test results. Setup/cleanup/session errors produce evidence-linked hypotheses. A passed test from a failed cleanup lifecycle cannot confirm a verified fix.
- Chroma retrieval now influences planning/investigation ranking, intersected with current locally reviewed source/version/org/permission records. The real SDK HTTP test covers auth, preflight, collection, upsert and query plus malicious/stale scope rejection. Its initial mock omitted the SDK preflight endpoint; that fixture was corrected and the protocol test passed.

Verification: baseline typecheck, 36 tests, demo and 3 browsers passed. Expanded suite: **41 unit/integration tests passed**, typecheck passed, original demo passed, **3 headless browser tests passed**. New evidence: readiness-pipeline.test.ts (actual authenticated loopback browser, setup/reference/verification/cleanup paths, denial and failure-learning gates), live-runtime.test.ts (OAuth/org mismatch and schema drift denial), chroma-wire.test.ts (real SDK against local mock HTTP service). Final path-security regressions are included. No live Salesforce, financial transaction, external Chroma or model-provider validation was performed.

Final focused rerun: typecheck and all 3 hybrid/readiness tests passed after strengthening the independent-verification contract: false/null/undefined evidence blocks browser dispatch and still permits approved owned-record cleanup. Full-suite execution remained 41 tests; the focused rerun is additional validation, not three new tests.

Still partial: actual live browser/recipe workflows, org UI/service adapters, complete permission/record-type discovery, reviewed recovery of pending side effects, dynamic parent-dependent mutation approvals, autonomous action exploration, connectors, external Chroma-only catalog import and model evaluation. Reporting Labs remains blocked by an unspecified provider/API contract. External sandbox/session/model/vector credentials are separate prerequisites; they do not stand in for unfinished code.

Next continuation: validate the configured runtime in an authorized sandbox with a reviewed nonfinancial workflow, then extend permission/record-type discovery and explicit approved recovery/approval interruptions. Current commands/contracts are in SANDBOX_EXECUTION.md. All 15 agent owners remain tracked in CAPABILITY_AUDIT.md and the reconciled feature matrix.

## Specs-to-tests session

Started from verified `1730bda` on the existing feature branch. Preserved the prior 29 unit tests and 3 browser tests. Added a connected LangGraph specification pipeline, actual format parsers, reviewed expected-outcome binding, scoped persistent knowledge, generated browser/API execution, trace and screenshot mapping, historical-defect retrieval, explicit defect review/learning, source-bound locator-only repair reruns and deterministic quality/HTML reporting. Added hybrid recipe dispatch with scoped approval checks, independent SOQL verification and reverse ownership-aware cleanup.

Verified evidence:

- `unit/spec-formats.test.ts`: actual JSON/YAML/Markdown/text/DOCX/PDF extraction; OpenAPI behavior is covered in spec-pipeline tests.
- `unit/spec-pipeline.test.ts`: actual generated headless failing test → trace/screenshot investigation → corrected fixture passing unchanged UI/API assertion → simulated named fixture review → persisted verified defect → reopened SQLite → mandatory future regression. Includes source-bound locator candidate passing the same expected outcome, blocked stale org versions/approval hashes and zero false passes for unexecuted criteria.
- `unit/hybrid-factory.test.ts`: metadata → ordered reviewed UI/service recipe adapters → explicit mock sandbox approvals → SOQL verification code → cross-run cleanup denial → reverse cleanup. No live Salesforce/UI business factory was executed.
- `npm.cmd run platform -- demo-learning`: independently executed the seeded failure, corrected regression and learned future plan, with retained evidence at `artifacts/learning-26e70902-bd1e-48b7-b7a6-ac0fcd9576d1/manifest.json`. These are local runtime artifacts, not Git contents. A fixture review actor exercises review gates; no real Salesforce defect was confirmed.
- Latest unit run: **36 tests passed**. Typecheck, original demo and all **3 headless browser tests passed**. The integrated unit suite separately executes a seeded failing browser test, a corrected regression and a reviewed locator-candidate rerun.

A repeated persistent demonstration exposed a duplicate lesson insertion. Confirmation is now idempotent for the same reviewed cause/test while conflicting causes require explicit reconciliation; defect fingerprints include org and permission. Regression covers duplicate confirmation and conflicting review. Knowledge invalidation uses a stable schema-content fingerprint, so a timestamp-only discovery refresh does not discard trusted lessons. Regression: unit/snapshots.test.ts.

After the fix, two consecutive persistent CLI demos completed successfully. Latest retained manifest: `artifacts/learning-40578624-0f91-4756-8135-f788c4f77d6d/manifest.json`; it links the actual failing run, corrected passing run, and future mandatory regression with verified lesson citation. Runtime evidence remains local and ignored by Git.

Audit/inventory: CAPABILITY_AUDIT.md covers all 15 responsibilities. SPECS_PIPELINE.md provides executable commands, the bundle contract, evidence locations and boundaries. Missing engineering is not relabeled as an external blocker: live graph session/data-gate integration, permission/record-type graph, rich action exploration, connectors, remote-catalog retrieval, model evaluation and Reporting Labs integration remain incomplete. Credentials, reviewed org recipes/personas and an identified Reporting Labs API are separate external prerequisites.

Exact next dependency: connect HybridFactory setup/independent verification/cleanup and a separately verified browser persona/session approval into createSpecPipeline before permitting sandbox origins. Keep fixture-only execution until those gates and retry/recovery tests exist. The current branch remains feature/verified-discovery; this session's verified commit and push are reported in Git and the final handoff.

## Current continuation result

Continued across P0, P1 and P2 with working TypeScript services and offline regressions. Added Tooling and read-only SOAP Metadata clients, independent SOQL state verification, sandbox-scoped create/delete transport, pending/completed side-effect journal and cleanup ownership, headless reviewed browser-session bootstrap, durable SQLite LangGraph checkpoints and named human interrupts, approval-ID-only MCP execution, embeddings/Chroma ingestion and scoped retrieval, SQLite execution history and Playwright reporter, workflow-based test generation, bounded MCP observation, deterministic risk selection, evidence-linked failure/defect proposals, guarded repair proposals, verified lessons and coverage/analytics utilities.

Final executed checks: typecheck passed; **29 unit tests passed**; offline demo passed; **3 headless browser tests passed**, including actual generated TypeScript; generated outcomes persisted to SQLite history. Durable saver restart/resume and approval/production-write rejection are offline-tested. Dependency installation completed with zero vulnerabilities reported by npm. No real Salesforce calls, browser session creation, Salesforce writes, remote embeddings or Chroma requests were performed.

The current completion matrix is the first table in FEATURE_MATRIX.md. Core service implementations are available, but end-to-end autonomous Salesforce QA remains incomplete. Missing code includes hybrid business/UI factory execution, full metadata/permission graph, rich action exploration, automatic intent-preserving code repair, model evaluation dashboards and Reporting Labs integration. Missing external prerequisites include authorized sandbox credentials, reviewed business recipes and persona login functions, a remote Chroma/embedding provider and a precise Reporting Labs API/authentication contract. These are not all external blockers: the missing implementations remain engineering work.

Security check before publication: `.env`, private keys, `.auth`, `.state`, SQLite files, approval records, generated tests and runtime reports are ignored; tracked-file scans found no such artifacts. Changes remain scoped to the isolated SalesforceAgenticQA repository and normal non-force publication of feature/verified-discovery.

## Historical first increment

This increment improves the starter. The complete P0/P1/P2 master request remains unfinished; FEATURE_MATRIX.md identifies each remaining capability.

## Implemented and locally verified

- Strict, bounded Describe response validation; active picklist filtering; explicit unknown metadata/workflow coverage.
- Source-linked content-addressed snapshot storage, integrity reads and object-level schema differences.
- Required dependency order, blocked-parent propagation, ambiguous target blocking and cycle safety.
- Reviewed recipe registry bound to the actual org snapshot hash, field/type/picklist/parent validation; no execution authorization.
- Salesforce write denial independent of environment flags; stricter OAuth hosts, transport paths, redirect denial and timeouts.
- Actual LangGraph planning workflow with criterion evidence, Zod outputs, review-required result and in-process checkpoints.
- Stdio Salesforce MCP server with only read-only bounded discovery; client/server protocol regression.
- Playwright JUnit output alongside HTML and retained failure evidence.

## Verification

Baseline: typecheck passed, 1 unit test passed, offline demo completed, 2 headless local browser tests passed. Initial sandbox startup errors were resolved by approved execution outside that sandbox.

Latest completed checks: typecheck passed; 15 unit tests passed; offline demo passed; graph demo passed; fixture discovery persisted a versioned snapshot; 2 headless fixture tests passed. The graph initially failed its runtime name-collision regression, was fixed, and passed on rerun. No live Salesforce test was executed. Local payment fixture tests do not execute real financial transactions.

## Remaining work and external prerequisites

Metadata/Tooling discovery beyond Describe, factory execution/cleanup, browser workflow exploration, durable orchestration and approval interrupts, semantic RAG, structured execution history, generation, risk selection, failure analysis, verified learning, bounded exploration, analytics and Reporting Labs remain unimplemented or partial. External credentials, authorized browser sessions, org business recipes, model/embedding and remote Chroma configuration are required for their live integration validation.

Git originally resolved to the parent Downloads repository. An isolated project repository was created on `feature/verified-discovery`, with the user-supplied author identity and `https://github.com/rakesh-attri/SalesforceAgenticQA.git` as origin. No parent staged files are touched. The commit is local; no remote publication is included in this increment.
