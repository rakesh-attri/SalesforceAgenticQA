# Environment-aware QA and reviewed Gemini knowledge

Latest diagnostic-only continuation: exact 31-resource/read-only grants were approved and exercised with fresh org/user/native proof and two signed absences. Twelve reviewed static responses completed, with no unapproved script/style. Unsupported OneController.getCurrentApp remains blocked pending source/parameter/response review and implementation; no read-like name grants permission. Parent/factory/UI files and normal modes stayed unchanged; no writes, replay, quota increase or learning occurred. Gemini chat/gemini-embedding-001 remain unchanged. See LIGHTNING_DIAGNOSTICS.md; earlier pending-31 evidence is historical.

Latest dedicated-QA continuation: Rakesh Attri approved exact 15 then 18 static resources, without adding business origins/actions or changing normal-mode/app permissions. Refreshed native browser identity passed and isolated public CDN GETs carried no browser credentials. Actual run 005 setup/SOQL/owned cleanup passed while UI selectors remained unobserved; cumulative fresh absence is six created/six deleted, zero active/uncertain. Further style-context URLs remain unapproved, generated UI tests/learning remain unexecuted, and the three allowed daily data runs are consumed. No quota, default Production policy or external AI data scope was expanded. Current evidence and commands are in [BROWSER_AUTHENTICATION.md](BROWSER_AUTHENTICATION.md); earlier pending-static/four-record statements below are historical.

Browser/data continuation: see [BROWSER_AUTHENTICATION.md](BROWSER_AUTHENTICATION.md) for exact app/user prerequisites, approved narrowed state import, actual My Domain/Lightning identity proof, no-write readiness, cleanup and observed-selector gates. Dedicated real setup/SOQL/cleanup passed; UI resource discovery remains blocked pending separate exact static approval. No normal Production boundary or app permission is changed by the framework.

This continues the existing framework. Its sandbox data factories, reviewed workflow generator, graph, history, failure investigation and verified-learning gates remain in place. Environment policy is an additional gate. JWT does not authenticate the browser.

| Mode | Permitted after review | Execution boundary |
|---|---|---|
| SANDBOX_QA | Nonfinancial reviewed UI tests and data factories in a freshly verified sandbox | Existing source/session/schema gates and separate per-mutation approvals still apply. A configured environment policy must also grant the relevant capability. |
| PRODUCTION_READ_ONLY_QA | Metadata, SOQL verification, restricted browser observation | Exact org ID, OAuth user/persona, canonical HTTPS origins, capabilities, named operator, definition hash and expiry. No production mutations. |
| PRODUCTION_CONTROLLED_QA | Policy definitions and review | Every execution capability is denied. There is no production-write implementation or enabling flag. |
| DEDICATED_QA_ORG | Separately approved synthetic Account/Contact factories, owned-page UI and bounded exploration in the exact personal QA org | Technical IsSandbox=false is permitted only with named exact-org/dedicated-user/origin/object/action/source review. Independent session gate precedes writes; journal-owned cleanup only. See [DEDICATED_QA.md](DEDICATED_QA.md). |

`SalesforceClient.connect()` verifies OAuth and Organization identity before returning a client. Production requires an approved local environment policy. `reviewIdentity()` exposes only identity/origin for policy preparation, never a client/token. Read methods recheck policy capability and expiry; the fixed SOAP readMetadata operation remains read-only even though its transport uses POST. Existing mutation transport retains its fresh sandbox check, object scope and exact payload approval. The new dedicated transport is accessible only through the separately authorized ownership service, never the ordinary mutation API or MCP approval tool. The existing MCP discovery entry point inherits this connection gate.

## Policy review

Run from the repository root using PowerShell:

```powershell
npm.cmd run platform -- environment-review
```

Inspect `.state/environment-review.json` locally: exact org ID, authenticated user, proposed `authorized-api-reader` persona, org type, origins and capabilities. The command only proposes a policy. After the named operator approves that exact definition, create the ignored policy:

```powershell
$qaReview = Get-Content -LiteralPath .state/environment-review.json -Raw | ConvertFrom-Json
$qaPolicy = $qaReview.definition
$qaPolicy | Add-Member -NotePropertyName approval -NotePropertyValue @{
  operator = 'Rakesh Attri'
  definitionHash = $qaReview.definitionHash
  expiresAt = [DateTime]::UtcNow.AddHours(1).ToString('o')
}
$qaPolicy | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath .state/environment-policy.json
npm.cmd run discover:live
npm.cmd run platform -- org-intelligence stories/account-contact.json --allow-non-sandbox-read
```

Changing any definition field requires a new `environmentHash()` and actual review. Do not copy a hash from a different policy. A persona name is an operator-approved mapping to the exact OAuth user, not proof of effective field/record access. Permission inventory and server authorization remain separate from effective sharing analysis.

## Reviewed structural knowledge

Generic metadata discovery stores observations locally. It does not upload raw metadata to AI. Source versioning uses the observed schema fingerprint; org isolation uses SHA-256 of the verified org ID rather than a potentially reused alias. Permission scopes are exact labels bound by the reviewed bundle. The review bundle includes only selected field API names, types, API-required flags, reference API names and source hashes, plus the redacted story. No record values, record-type names/IDs, labels, descriptions, formulas, permission rows or Apex/Flow source are exported. A digest is an isolation key, not anonymization of arbitrary content; inspect the bundle itself.

```powershell
npm.cmd run platform -- knowledge-review stories/account-contact.json Account,Contact --fields Account.Id,Account.Name,Contact.Id,Contact.LastName,Contact.AccountId
```

Inspect `.state/ai-review-bundle.json` and `.state/ai-review-request.json`. After content and destinations are approved:

```powershell
$qaAIReview = Get-Content -LiteralPath .state/ai-review-request.json -Raw | ConvertFrom-Json
@{
  operator = 'Rakesh Attri'
  bundleHash = $qaAIReview.bundleHash
  destinations = @('gemini-chat', 'gemini-embeddings')
  expiresAt = [DateTime]::UtcNow.AddHours(1).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath .state/ai-review-approval.json
npm.cmd run platform -- knowledge-publish
npm.cmd run platform -- grounded-plan
```

The commands close/reopen `.state/reviewed-rag.sqlite`, exercising persistence. Model/provider/dimension namespaces prevent vectors from different embedding spaces being compared. Old sources are deprecated; retrieval returns only verified, current org/permission-scoped sources. If Chroma is configured, its destination must separately appear in the exact bundle approval. Chroma collections are namespaced by embedding space. It was **not configured or live-validated** in this increment.

Spec Analyst, Planner, Generator, Investigator and Learning receive the same scoped retrieved facts. Their constrained output selects source IDs; object/field details and expected outcomes are resolved locally. Unknown fields, missing/duplicate criteria, invented historical citations and extra expected-outcome fields fail validation. Generated workflow execution remains a separate, reviewed step. The proposal contains no invented UI navigation or executable write authority. Reviewed historical lesson/defect test IDs force regression retention independently of model priority; creating verified lessons still requires the existing actual-failure/review/passing-regression service.

Legacy `ai-reason`, `rag-index` and `rag-query` remain available with `SFQA_AI_PAYLOAD_REVIEW`: `AIReviewSchema.bundleHash` must equal `payloadHash()` of the exact redacted `{role,source}` or `{mode,payload}` input and include each destination. `ai-payload-review FILE` prepares a redacted object/hash locally; provide the complete wrapper when preparing these legacy requests. Metadata `--with-embeddings` now directs operators through the content-review flow. Ordinary spec-run uses local retrieval for raw live metadata; the separate grounded flow supplies reviewed external reasoning. Typed provider abstractions and injected graph reasoning remain available to reviewed callers.

## Restricted production browser observation

No live browser approval/session was supplied in this increment. Metadata approval does not grant browser capability. The default reviewed policy grants metadata/SOQL only.

To prepare observation, independently review a policy granting `browser-observe`, exact additional browser origins, and a specific session/persona. Import existing operator-reviewed state into `.auth`; production login is not automated. Supply an `ObservationRequestSchema` JSON containing exact HTTPS document URLs with `nonMutatingReviewed:true` and source evidence, explicit static asset URLs, actual observed org/user/persona test-ID markers, source-linked criterion IDs and exact expected text. Sign its canonical `observationHash(plan)` with the same named operator and an expiry. Test-ID markers are an explicit integration prerequisite, not assumed Salesforce selectors.

```powershell
npm.cmd run platform -- production-session-verify .state/observation-request.json .auth/qa-state.json
npm.cmd run platform -- production-observe .state/observation-request.json
```

Session verification uses the same restricted observer and issues a private, state-content-hashed, bounded receipt only after actual DOM identity verification. The spec graph also accepts `productionReadOnly`, exact execution approval and org-bound API metadata. It dispatches this observer, never generated arbitrary workflow code, and records observation results separately from generic browser execution. Data recipes, sandbox requests and executable mappings are rejected in this mode.

The observer disables JavaScript and service workers, refuses downloads/WebSockets, allows only GET/HEAD on exact reviewed documents or stylesheet/image/font assets, and accepts navigation/text reads only. Unknown paths, scripts/XHR/fetch, all other methods, form submissions, query-bearing paths, and mutating/financial routes are blocked. Redirects must still match the reviewed document. It never clicks, fills, submits, evaluates caller code or saves a changed session. All returned text stays local; summaries contain booleans, not record values.

Lightning commonly requires JavaScript and non-GET bootstrap traffic. Such pages may not work under this strict observer. A server-rendered safe observation view with independently verified identity markers is required for this implementation; no claim of complete Lightning/Experience Cloud observation is made. General browser authenticators and callback probes now require a fresh sandbox verifier, including typed API callers. Do not relax the observer to make a page load.

## Actual verification and remaining work

2026-11-14: actual Production identity and metadata discovery succeeded under the named policy; both Gemini connectivity checks succeeded using synthetic input. Bulk embedding of 108 filtered fields hit HTTP 429. A later five-field publication succeeded, persisted five vectors and was retrieved in a separate process; five real Gemini reasoning roles produced three proposed scenarios. Exact field references and story outcomes passed validation. Five-field retrieval precision/recall were 1/1 for this smoke test; this is not a broad semantic relevance or business-correctness benchmark. No raw records were transmitted. Live outputs are local under `artifacts/SFQA-ACCOUNT-CONTACT` and `artifacts/live-integration-validation.json`.

The cumulative FEATURE_MATRIX.md retains all P0/P1/P2 requirements and all 15 owners. Remaining engineering includes deep dependency/effective-sharing analysis, org-specific UI/service factories, richer safe exploration, broad AI-quality evaluation, connectors/importers, recovery adjudication and Reporting Labs' unspecified contract. Normal Production UI needs the separate restricted observation approval/state/identity view. Sandbox writes retain their existing approvals. The separate dedicated personal QA exception is documented in DEDICATED_QA.md; its actual live attempt stopped before any writes because UI Bridge lacked authorized web scope. Production-controlled writes remain disabled by design.
