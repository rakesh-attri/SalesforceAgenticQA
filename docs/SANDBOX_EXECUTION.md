# Sandbox execution readiness

The separate, explicitly authorized personal-org exception is documented in [DEDICATED_QA.md](DEDICATED_QA.md). It does not change any sandbox contract in this guide or permit normal Production modes to write. Statements below about writable environments refer to this original sandbox pipeline.

Environment-aware continuation: see [ENVIRONMENT_QA.md](ENVIRONMENT_QA.md). Production metadata/SOQL now require an exact named environment policy, and a separate strictly read-only observer can use separately reviewed imported state. The sandbox runner/factories remain sandbox-only. When an environment policy is configured, grant `sandbox-ui` for reviewed browser origins and `sandbox-data` for API factories in addition to required reads; mutation-specific approvals still apply. General `createBrowserSession`/probe APIs now require a fresh `verifySandbox` callback. Use the restricted production-session-verify command for Production, never those callbacks. Live sandbox write/UI validation still requires a different authorized sandbox.

This increment connects existing services; it does not claim a live sandbox run. Verification used mocks, a real cookie-authenticated loopback browser and the real Chroma JS SDK against a local HTTP fixture.

## Execution dependency chain

The spec graph now runs: source/metadata binding → knowledge/planning/review → generation → execution approval → fresh sandbox identity/schema/session preflight → recipe preflight → approved setup → independent verification → verified record binding → fresh sandbox preflight again → authenticated headless execution → approved cleanup → lifecycle investigation/reporting.

Fixture-only flows still work without a sandbox runtime. A Salesforce API snapshot cannot execute unless an explicit `sandbox` request and trusted runtime are provided. Generic Salesforce POST remains denied; dedicated mutations still require separate scoped approvals. Browser actions require reviewed nonfinancial workflows. Production is never a writable target.

## Operator prerequisites

1. Configure authorized JWT sandbox access and explicit `SFQA_WRITE_OBJECTS` when data writes are required. This is API authentication only.
2. Discover and review the org snapshot and business recipes. The live runtime re-describes snapshot objects and rejects schema drift. Flows, Apex, sharing and business constraints are not proved by Describe; unknowns remain review prerequisites.
3. Create a browser session separately with the existing headless `createBrowserSession` API and a reviewed org authenticator. No MFA bypass or inferred JWT browser login is provided.
4. Establish a reviewed, independent browser identity probe. The built-in CLI probe reads operator-configured observed test IDs for org/user/persona on an authorized page. These are **not assumed Salesforce selectors**. If the org has no such identity view, implement an explicitly reviewed `sandboxRuntime` probe; do not fabricate selectors or return constants as proof of identity.
5. Store state/receipts in ignored `.auth`. Keep the operator-controlled policy and scoped mutation approvals in ignored `.state/sandbox-policy.json`. Protect both directories with local account permissions. Windows chmod does not replace a reviewed Windows ACL policy.

## Runtime policy contract

`RuntimePolicySchema` in `src/integrations/live-runtime.ts` requires:

- `allowedOrgIds`: exact approved sandbox org identifiers.
- `allowedOrigins`: canonical HTTPS origins, without paths or credentials. Include authorized app, Experience Cloud and required resource origins explicitly; unexpected redirects fail closed.
- `allowedObjects`: reviewed objects usable by the built-in API factory adapter.
- `approvals`: map from `mutationHash(concreteMutation)` to an expiring `ApprovalSchema` value. The map is an operator trust boundary, never an agent output or MCP approval tool.
- `browserProbe`: observed page `path` plus `orgIdTestId`, `userIdTestId`, `personaTestId`.

The CLI registers only the real API/SOQL factory adapter. UI and business-service adapters can be supplied through the typed library runtime after org-specific review. They are not guessed from metadata. Dependency records have concrete IDs only after creation, so parent-dependent create/delete approvals may need an operator callback through the library runtime. Automatic CLI approval generation and durable human-interrupt recovery for these operations remain unfinished.

## Session receipt

Prepare an ignored JSON request containing `statePath`, expected `identity` (`orgId`, `userId`, `persona`), `reviewer` and `receiptPath`, then run:

```powershell
npm.cmd run platform -- session-verify .state/session-review.json
```

This opens the existing state headlessly, probes the reviewed identity view and writes a new receipt. The receipt binds org/user/persona, origin set, named reviewer, storage-state SHA-256 and a 15-minute lifetime. Receipt/state paths must resolve within `.auth`, including symlink resolution. Creation refuses existing receipt paths. Changed state, missing review, expired/future receipts and identity/origin mismatches are rejected. State bytes must remain unchanged during issuance.

Every sandbox preflight fetches OAuth userinfo plus Organization IsSandbox and compares identities. The browser is independently probed using the approved stored state. The current runtime conservatively requires the API user and browser persona to refer to the same user ID; separate service/test personas require an extended reviewed policy. Userinfo behavior follows the [Salesforce OAuth endpoint contract](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_endpoints.htm&language=en_US&type=5); no live identity response was obtained in this session.

## Spec bundle and execution

Use the existing `PipelineInputSchema` bundle. Add `sandbox` with org/user/persona, `sessionReceipt`, reviewer, expiry and `nonFinancialReviewed:true`. Optional `dataSetup` contains reviewed recipes and `cleanup:'always'` (default) or `cleanup:'retain-reviewed'` with a separate named retention reviewer. Include all these fields before obtaining the existing `executionHash` approval.

```powershell
npm.cmd run platform -- spec-run .state/reviewed-sandbox-bundle.json
```

Workflow paths, fill values and API assertion paths can reference `{{record:Account}}` using an actual recipe object name. Binding occurs only after the factory's independent verification. Missing references fail execution. Expected assertion text is never substituted or weakened.

The runner consumes the approved storage state without putting cookies in LangGraph state. Generated navigation stays within allowed origins and service workers are blocked. API assertion context authentication remains independently meaningful only where that endpoint accepts the reviewed session; no bearer token is injected into generated tests.

## Failure, cleanup and replay

The graph reserves a unique run ID durably before preflight/setup. Failures do not trigger blind retries. Factory ownership is persisted immediately after a known successful create, before independent verification, so verification failures still leave references for approved reverse cleanup. Unknown network effects remain pending for manual reconciliation. Cleanup needs its own exact mutation approvals and fresh sandbox identity.

Cleanup is attempted only after setup started. A gate denial cannot trigger cleanup writes. An explicit retention policy preserves records for reviewed investigation. If cleanup fails, tests retain their actual outcomes but overall `lifecycle.status` is failed and the CLI exits nonzero. Lifecycle errors are separate evidence-linked hypotheses; unexecuted tests are not fabricated as failed product tests. `confirmDefect` rejects a passing test from a failed lifecycle as proof of a verified fix.

Reports contain lifecycle stages/errors/counts. Known owned references remain in ignored SQLite `factory_records`; pending statuses remain in `pipeline_runs` and the mutation journal. Reusing a run ID is denied. Inspect and independently reconcile these rows/records with the operator before a new approved run; automatic reconciliation is not implemented.

## Knowledge retrieval

Configured Chroma now participates in planning/investigation retrieval, not only ingestion. Results are compared against locally reviewed current source/version/org/permission entries; stale, wrong-scope and unknown catalog hits cannot elevate trusted knowledge. A protocol test drives the real SDK through identity/preflight/collection/upsert/query HTTP calls against a mock server. No external Chroma, cloud tenant or embedding model was validated. Offline lexical retrieval remains available when remote integration is not configured.

## Verification and continuation

`unit/readiness-pipeline.test.ts` covers authenticated generated execution, references, gate denial, setup-verification cleanup, cleanup failure, replay denial, session tampering/expiry and failed-lifecycle learning rejection. `unit/live-runtime.test.ts` checks fresh OAuth/org matching and live schema drift rejection. `unit/chroma-wire.test.ts` checks the actual SDK protocol and result trust filtering. Existing parser, learning, healing, metadata/MCP and safety regressions remain in scope.

Next: exercise this configured runtime against an authorized sandbox with reviewed nonfinancial recipes/persona probes, add record-type/permission discovery and concrete org UI/service adapters, then implement explicit reviewed recovery and dynamic mutation-approval interruptions. Credentials/service access and unknown org workflows are external prerequisites; remaining code is tracked in FEATURE_MATRIX.md.
