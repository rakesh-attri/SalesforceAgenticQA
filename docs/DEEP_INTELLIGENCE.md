# Deep intelligence, reviewed ingestion and intelligent planning

This milestone extends the existing framework and all 15 owners. Production remains an explicitly approved read-only QA target. No Production browser restriction, JWT grant or sandbox write gate was weakened. Raw deep metadata stays in ignored `.state`; the external AI path still uses an exact reviewed minimized bundle.

## Commands

```powershell
npm.cmd run platform -- org-intelligence stories/account-contact.json --allow-non-sandbox-read --deep
npm.cmd run platform -- component-graph
npm.cmd run platform -- intelligent-plan stories/account-contact.json
npm.cmd run platform -- knowledge-publish
npm.cmd run platform -- knowledge-benchmark
npm.cmd run platform -- grounded-plan
npm.cmd run platform -- demo-learning
```

The existing exact org/user/persona/origin policy and named expiry approval are required for live discovery. `component-graph` rebuilds from saved sources without network access. `intelligent-plan SPEC [SNAPSHOT]` accepts the existing supported spec formats and performs local reviewed retrieval; no raw story/deep metadata is automatically uploaded. Its JSON/HTML traceability report and any reviewed generated `.spec.ts` files are under `artifacts/spec-intelligence/STORY_ID`.

Optional reviewed inputs: `--bindings .state/workflow-bindings.json`, `--review .state/requirements-review.json`, `--component-changes .state/component-changes.json`, `--graph .state/component-graph.json`. Requirements review is `{ "reviewer": "named operator", "sourceVersion": "exact ingested source version" }`. Bindings use the existing criterion/workflow/preconditions contract. Component changes are an array of exact graph node IDs. Impact selection rejects another org or stale knowledge version, traverses reverse declared dependencies with a bound and carries source paths; it is a conservative metadata impact estimate, not complete runtime impact analysis.

## Source-backed discovery

The deep reader uses bounded SELECT queries, maximum records/pages and exact same-API pagination cursors. Cross-origin, other-endpoint and repeated cursors are denied. Reaching a cap remains partial. Dependency API gets one bounded inventory; unsupported name filters and queryMore are not used. Salesforce documents these limitations in its [Dependency API reference](https://developer.salesforce.com/docs/platform/api-tooling/references/tooling-objects/tooling-metadatacomponentdependency.html).

Inventories cover Apex classes/triggers, LWC bundles, Flow definitions and versions, assigned permission sets/groups/components, profile context and named group/muting metadata when applicable. Up to three active Flow versions are read by exact ID, preserving their declared conditions, object targets, action/subflow references and connectors. Unresolved targets remain unknown. No regex scan of Apex source is promoted into an asserted relationship. Custom metadata/LWC/Apex references are retained when returned by the dependency inventory; dynamic relationships and inaccessible managed metadata remain unknown.

The component graph uses metadata IDs for inventory identity so equal names in different namespaces remain distinct. Nodes/edges carry source references. Describe supplies object/field relationships; explicit Tooling dependency rows supply component references; trigger targets, active Flow versions, Flow connectors/conditions/targets, validation rules, declared sharing models and group/muting membership add only source-backed edges. Invocation targets are joined only when metadata explicitly identifies the type and the name resolves uniquely. The graph retains unresolved coverage and does not infer business outcomes or execute actions.

Current-user UI API object/field create/update/delete/query flags are separate observations from assignment inventories. They never authorize writes. Group-local muting calculations do not subtract independent grants; unresolved completeness yields unknown. Licenses, session activation, permission dependencies, effective record sharing, role/group expansion, restriction/scoping rules and other personas remain partial/unknown. The configured persona had **zero assigned permission-set groups**: group/muting behavior was tested with offline mocks, not claimed live-validated. See Salesforce's [group-component reference](https://developer.salesforce.com/docs/platform/object-reference/references/standard-objects/object-permissionsetgroupcomponent.html) and [muting metadata reference](https://developer.salesforce.com/docs/platform/api-metadata/references/meta-types/metadata-mutingpermissionset.html).

## Resumable reviewed ingestion

`knowledge-publish` now enqueues exact reviewed documents and drains small batches. The queue, vector cache, source bindings, lease, attempt counters, next retry time and UTC daily counters persist in `.state/reviewed-rag.sqlite`. Cache keys include org, permission, embedding model space and content hash. Structural embedding input excludes provenance hashes so unchanged fields can reuse vectors after a reviewed source-version change; source evidence/version still stays in the document. Moving the older index to normalized queue input requires one initial publication; subsequent unchanged publications issue zero requests.

Environment knobs in `.env.example` control batch size, per-run requests, daily requests/texts and pacing. The queue disables nested provider retries so each attempted embedding HTTP request is charged to its persistent budget. Pacing/quotas defer work; no long blocking sleep is required. HTTP 429/transport/server failures retain pending work and a persisted Retry-After-aware backoff. Authentication/configuration/malformed responses become blocked; after correcting configuration and reviewing the unchanged bundle, `knowledge-publish --retry-blocked` retries them within the same budgets. Expired or changed approval, stale source and cross-scope reuse are denied. Changed capture/source publication atomically invalidates dependent knowledge. Existing vectors can be mirrored to Chroma without another embedding call, but external Chroma remains unconfigured/unvalidated.

Exit code 2 means pending/blocked work remains. Inspect the sanitized status and `deferredUntil`; rerun the same command when eligible. Multiple workers share an expiring model-space lease. A process crash after the provider accepts a request but before its vector is committed can require another request; exactly-once provider billing is not claimed. Local guardrails do not describe all project-wide traffic or the provider's current quota. Google directs projects to their [active rate limits](https://ai.google.dev/gemini-api/docs/rate-limits); no fixed tier limit is assumed here.

`knowledge-benchmark` currently sends two queries derived only from already approved structural facts. It reports precision/recall@3, MRR and nDCG against explicit source judgments. Broader semantic/cross-org/cross-permission/stale-source cases are offline tests; no model judge or broad relevance benchmark is claimed.

## Specs, failure intelligence and verified learning

Unstructured BDD, acceptance bullets and actor/intent stories retain exact spans in LF-normalized source text. Extracted kinds/personas require review. No expected UI text is invented; unstructured executable text must occur literally in its criterion. Missing positive/negative/boundary/integration behavior becomes a requirement question. Known literal outcomes, named source review, exact approved workflow assertions and reviewed prerequisites produce deterministic reviewable TypeScript. Unknown journeys produce sandbox discovery tasks. The existing spec graph separately enforces requirements review and its existing execution/session/data gates.

The local planner imports only current verified field facts and schema-compatible reviewed lessons from the reviewed RAG catalog. It retains source citations, historical regressions, dependency-aware data proposals, risk scores, coverage gaps and traceability. Structured reviewed historical causes/fixes produce current-failure hypotheses and similarity correlations; they never become a confirmed current cause automatically. Publishing verified learning still requires actual recorded failure evidence, a named cause/fix review and a passing regression/lifecycle.

Deep knowledge fingerprints cover captured metadata/permission/Flow/validation content and ignore capture-time/API decorations. Changed observed business metadata can therefore invalidate lessons even when field schema is unchanged. This happens on rediscovery, not through a live change monitor; inaccessible Apex bodies and other unobserved behavior cannot be detected. Legacy lessons with no compatible binding are flagged for review. Field-only external bundles retain their structural source binding; including historical lessons requires its compatible knowledge version and a new exact content review.

The extended `demo-learning` runs a real seeded local browser failure, unchanged assertion, passing regression, confirmation and future plan. Holding the recorded execution history constant, excluding reviewed knowledge gave score **35 / mandatory=false**; including the confirmed lesson gave **75 / mandatory=true**. These are synthetic fixture results, not Salesforce defects.

## Actual verification — 2026-11-14

| Area | Evidence and boundary |
|---|---|
| Live Salesforce read-only | 195 dependency rows, 493 Apex classes, 17 triggers, 29 LWC bundles, 14 Flow versions, three exact-version metadata reads; two current-user permission reads and two sharing metadata reads |
| Source graph | 909 nodes, 365 edges, 40 unresolved/partial coverage notes; two declared condition nodes; no runtime-completeness claim |
| Live Gemini/RAG | Five approved facts completed in one queue request; repeated publication made zero requests; five actual reasoning roles proposed three grounded scenarios |
| Live retrieval smoke | Two judged queries: MRR/nDCG 1, recall@3 1, precision@3 0.333; not a broad benchmark |
| Local operational planner | Reused five reviewed sources; the real story's three criteria remained blocked because UI workflows/exact assertions were not approved; zero invented test files |
| Offline | 96 unit/integration tests, including real shadow-DOM fixture exploration and generated TypeScript execution; demos and three existing headless browser tests passed |
| Not executed | Production browser journeys, sandbox record writes, financial workflows, external Chroma, Jira/Azure services and Reporting Labs |

Remaining engineering includes broader Flow/source analysis, effective sharing/license/session permission modeling, complete runtime impact maps, sandbox UI/service factories, safely authorized action exploration, arbitrary test imports/connectors, broader AI-quality benchmarks, pending-run adjudication and Reporting Labs' unspecified contract. These remain in the cumulative FEATURE_MATRIX.md and 15-agent CAPABILITY_AUDIT.md. The next dependency is reviewing concrete sandbox workflows/personas/data factories while extending source/permission breadth; Production dynamic journeys remain blocked.
