# Live integration readiness and operator handoff

This continuation starts at **6aa3d64**. It prepares a fresh existing-Account observation and a separate minimal AI validation. Neither is approved or activated. Observation 002 and lifecycle 012 remain declined/inactive. No replacement write package is prepared.

## Evidence-based service audit

| Service | Historical actual service evidence | This increment | Remaining gate |
|---|---|---|---|
| Salesforce JWT/OAuth | Previously authenticated the configured dedicated QA user; sanitized failure diagnostics were tested | Approved-host configuration and local RSA key parse only; no token request | Fresh exact Salesforce authorization, then actual OAuth/org/user proof |
| Metadata/Tooling | Actual saved Account/Contact schema, deep Apex/Flow/LWC/dependency evidence; inaccessible behavior remained unknown | Current saved snapshot/graph/typed lineage agree locally; metadata capture is **November 14** | Saved-source consistency is not current server metadata; separately authorize relevant refresh if needed |
| Account/Contact browser | November 17 exact-user native headless Chrome/MCP visible-name/Related/Details/stability and unchanged scoped reads | Readable local export only; no native identity check, session or page observation | Fresh exact one-Account grant and native risk/access review; current state/org/user/build/app checks |
| Data factories/SOQL/cleanup | Earlier exact-scope synthetic Account/Contact creates and owned cleanup were actually executed; no full generated live UI lifecycle was completed | No live creates/updates/deletes or write-package preparation | A separate explicit future write request, fresh automation review, all data/UI/session/run approvals and unchanged quotas |
| Gemini chat + gemini-embedding-001 | Earlier actual connectivity, reviewed structural metadata planning and persisted local vectors succeeded | Existing provider constructors validate configuration without requests; two-fact review remains inactive | Fresh exact minimized-content/destination approval; actual API response and grounding checks |
| Rate limits and recovery | A larger historical embedding attempt received HTTP 429 | Existing retry/pacing/queue/version tests and new review/runner regression tests | Do not deliberately exhaust live quota; a future live 429 must be retained as BLOCKED/deferred, not success |
| Persistent RAG | Prior reviewed Gemini vectors persisted/retrieved locally; integration demo used real adapters with mock HTTP | Saved-source validation, minimal namespace/query plan and cache/queue reuse prepared | Authorized bounded publication, process-reopened retrieval and current reviewed citations |
| External Chroma | SDK/HTTP contract and isolation tests only; no current external deployment proof | Not contacted or newly authorized | Separate destination review/service setup; it is optional for local RAG |
| Playwright/MCP/reportingLabs/LangGraph | Actual local browser/MCP/generated tests/checkpoint reopening/reports; prior scoped Salesforce browser observations | Full regression and connected fixture revalidated; reports inspected locally | Local/mocked results never establish actual current Salesforce or Gemini health |

Historical supporting records are documented in ORG_INTELLIGENCE.md, DEEP_INTELLIGENCE.md, GEMINI.md, LIGHTNING_STABLE_READINESS.md and the cumulative implementation report. Historical success is not refreshed by configuration presence or a new local report.

## Local readiness command

```powershell
npm.cmd run doctor
npm.cmd run platform -- integration-readiness .state/integration-readiness-input.json
```

The second command writes `.state/integration-readiness/report.json` and `report.html`. It makes no Salesforce, model or vector-service request. Each check states **PASS**, **FAIL** or **BLOCKED**, its evidence class and the next operator action. PASS means that specific local check passed. Overall BLOCKED is expected while live authorization/proof is absent. The CLI uses exit 2 for BLOCKED, 1 for FAIL; it does not turn an unexecuted integration into a pass.

The JWT syntax check is shared with the actual JWT helper; the RS256 grant and existing endpoint checks are unchanged. The readable browser-state check does not prove freshness, valid cookies or identity. Private key/state contents, tokens, Consumer Keys, usernames and API keys are withheld. Metadata fingerprints match **saved** evidence only.

## Fresh Account observation decision

The new private package is prepared through the existing `live-exploration-prepare` service, using the previously nominated QA Account and its actual historical view evidence. It does not read or reactivate the declined observation package. A new source reconciliation review is generated from immutable cached evidence; its definition hash can equal an earlier finding because the content is unchanged. Its approval is nevertheless new and inactive: no prior grant is reused.

Review the new manifest, requirement, exact org/user/persona/origins/Account, source-lineage definition, state binding, current local engine, name/Related/Details/readiness assertions and the proposed activation hash. All nested browser/profile/API/source approval names remain `REVIEW_REQUIRED`. The draft has a new run ID/nonce, one session, no clicks/forms, no factory/data plan and no external AI authority. It expires within one hour and cannot be renewed by a late reply.

The required decision is whether **Rakesh Attri** authorizes that exact package and separate source compatibility review, including the native-networking/user-access risk. Native Salesforce initialization may have unreviewed or irreversible background effects; post-observation budgets do not prevent in-flight effects. This is not a claim of server purity. Screenshots are best-effort masked, local-only and not sent to AI. The independent record comparison covers only the approved fields/record and does not establish effective sharing or absence of every possible background effect.

Activation itself does not open a browser. Execution remains behind fresh API/native identity, active-user, source/state/build/app, approved origin and exact read checks. Changed state or failed identity stops; no state rebinding, assertion repair, quota increase or live replay is implied. Current server-wide metadata/business behavior remains unverified. A successful observation would prove its scoped UI/API result, not a full Salesforce business workflow.

After explicit exact authorization and existing activation checks, the existing execution command is:

```powershell
# Only for the newly approved package; not the declined 002 files.
npm.cmd run platform -- live-exploration-run .state/<fresh-package>/run.approved.json
npm.cmd run platform -- live-exploration-report .state/<fresh-package>/run.approved.json
```

Do not create approved files merely by copying a name from this document. The operator must first review and authorize the exact hash and original expiry. The actual Live Exploration Intelligence report is not generated as a passing execution before that step. Failed/blocked sessions retain their real outcome, independent comparison and local evidence.

## Minimal Gemini/RAG decision

The private review bundle contains only **Account.Name and Contact.LastName** API names, types, required flags, generic source IDs/provenance hashes and a synthetic planning story. No records, actual org/user IDs, descriptions, formulas, permission rows, private documents, traces or images are sent. Org/permission isolation metadata stays local; the source fields selected by the existing grounded planner are the reviewed input. There is no Chroma destination approval.

The independent decision is whether Rakesh Attri approves that exact bundle hash and both `gemini-chat` and `gemini-embeddings` destinations before its expiry. The inactive approval template cannot pass authorization: the shared validator now rejects `REVIEW_REQUIRED`, including whitespace variants.

Only after consent, use the named approved copy printed by the handoff. These commands preserve the configured models and shared `.state/reviewed-rag.sqlite` catalog, ingestion queue, cache and quotas:

```powershell
$bundle = '.state/minimal-ai-20261118-001/bundle.review.json'
$review = '.state/minimal-ai-20261118-001/approval.approved.json'
$source = '.state/org-snapshot.json'
npm.cmd run platform -- knowledge-publish $bundle $review --local-only --single-attempt --source $source
npm.cmd run platform -- grounded-plan $bundle $review --local-only --single-attempt --planner-only --source $source
npm.cmd run platform -- knowledge-benchmark $bundle $review --local-only --single-attempt --source $source
```

`--source` rejects a foreign/stale saved source or altered field fact before any provider request. It does not perform a fresh Salesforce Describe. `--local-only` explicitly excludes configured Chroma. `--planner-only` makes one grounded planner call instead of the normal five-role demonstration. `--single-attempt` disables automatic transport retries for this small validation, leaving the regular configured retry behavior unchanged elsewhere.

Expected uncached cost is **one chat request and four to five embedding requests**: one/two ingestion batches for two facts, one grounding-query embedding and two benchmark-query embeddings. Existing cached fact vectors can avoid ingestion requests. Source-version changes still need review; do not repeatedly upload unchanged facts. A quota/deferred queue result stops this sequence. Do not reset its database, counters, limits or Retry-After timestamp to force continuation. Further calls/resume require the original still-valid review and intended scope. Existing offline tests prove retry/429 handling; successful minimal requests alone do not prove live retry recovery.

Grounded planning resolves fields/outcomes locally, validates all criterion/fact/citation IDs and retains unknown workflows, business rules, UI outcomes and disabled writes. Actual publication/retrieval/grounding must be recorded before claiming current live success. No passing mock or configured key substitutes for that result.

## Reliability corrections

* AI content authorization now requires a genuine named operator; the placeholder previously satisfied the minimum-length check.
* Generated execution validates prerequisites before spending a reservation or deleting old report files. A durable per-directory/run intent blocks replay of completed or uncertain executions. A separately reviewed different run can reuse reporting history.
* Before a new explicit execution, only its old generated result/HTML/JSON/validation files are removed; reporter history is retained. Old report files cannot silently satisfy a new process.
* reportingLabs success now requires HTML, JSON stats and the framework validation receipt to agree with actual test outcomes and validation class. HTML alone, stale counts, missing JSON, runner-level errors or an unrelated validation receipt cannot become a passing lifecycle.

No data factory, cleanup, browser mode or normal Production restriction was loosened. Full original P0/P1/P2 and all 15 responsibilities remain in the cumulative registry.

## What remains before a real generated Account/Contact lifecycle

1. A **separate explicit request** to prepare a new write package; lifecycle 012 remains declined. This readiness task is not that request.
2. Fresh scoped metadata/automation review: relevant Apex, Flows, validations, dependencies, create/delete permissions and cleanup visibility. Unknown or foreign side effects must block execution rather than become assumed safe.
3. Current exact org/dedicated QA user/persona/origin verification, eligible browser authentication and fresh Account/Contact readiness. JWT is not browser authentication. Administrator app permissions are never changed automatically.
4. Exact factory, UI, browser/profile and run approvals; one bounded synthetic Account/Contact plan, a fresh run ID/nonce, unchanged daily quotas and original expiry. No old grant/session replay or automatic renewal.
5. Reviewed generated TypeScript, approved locators and unchanged assertions; actual independent Contact.Name/LastName/AccountId and owned-marker/creator checks. Direct page navigation is not proof of an Account-to-Contact UI transition.
6. Real execution, post-checks and owned Contact-before-Account cleanup with independent absence. Observation references and unrelated records must never be adopted for cleanup. Uncertain effects require reconciliation, not blind retries/deletes.
7. Complete actual Playwright/reportingLabs outputs with truthful lifecycle status. Verified learning still requires actual failing evidence, named cause/fix and passing regression after successful cleanup; a passing lifecycle alone creates no lesson.

Broader autonomous workflows, alternative personas/sharing, semantic visual evaluation, richer factories, Chroma deployments, Jira/Azure DevOps and CI/CD reliability remain engineering/verification work. They are preserved, not replaced by this bounded transition.


## Verified local results and exact inactive handoff

Verified: TypeScript typecheck passed; **336/336 full unit/integration tests**, **23/23 focused reliability/JWT/reporting tests**, **5/5 headless tests**, **all 11 offline demos**, and **3/3 tests of the committed discovery contract** passed. The existing discovery-test edit remains byte-for-byte unchanged and excluded. Logs: `.state/live-readiness-{typecheck,final-unit,final-focused,headless,committed-discovery}.log`; demo summary: `.state/live-readiness-demo-summary.json`.

The new connected fixture report is [local HTML](../artifacts/framework-00877ec0-203a-417f-93c7-573ee683b40e/index.html). Actual generated execution: seven passing success tests; four passing and three deliberately failing fault tests; one passing reviewed repair. Both mock factory phases created two and cleaned two records; zero live records were touched. Fixture-only verified learning raised later regression risk 80 to 130. Local headless report inspection found four masked image links, both reportingLabs links, actual test rows, no horizontal overflow, no script errors or external requests. JSON checks: .state/live-readiness-report-inspection.json. Neither the fixture nor its local verified lesson proves a Salesforce defect.

Local readiness has six PASS checks and four BLOCKED gates: the tools/configuration/saved evidence/export checks pass, while fresh Account approval, AI content approval, current live proof and future write authority remain blocked. Exit code 2 was checked using Windows LASTEXITCODE. See [.state readiness HTML](../.state/integration-readiness/report.html), .state/live-readiness-exit.json and .state/live-readiness-handoff-check.json. No credential values or session contents are in the report.

| Independent decision | Inactive review and exact scope |
|---|---|
| Salesforce Account observation | .state/live-exploration-SFQA-OBS-20261118-003/manifest.review.json; proposed activation hash **e136aac28bbaea7c5e7d03573976bd20f43df30e47d3d46084d30754db02dd8a**; separate fresh .state/source-reconciliation-READINESS-20261118-001/account.lineage.review.json hash **d0beae7f1efb7ac83f8790ac42e2876c8397feba03623e5f63281a7a81d9c263**; expires **2026-11-18T14:11:47.879Z (November 18, 7:41:47 p.m. IST)** |
| Minimal Gemini/RAG | .state/minimal-ai-20261118-001/manifest.review.json and bundle.review.json; bundle hash **afcc7bbb3a5b43ef156d132f6f42400181de74215024477c9558e4d764e8c990**; destinations gemini-chat and gemini-embeddings only; expires **2026-11-19T12:45:26.033Z (November 19, 6:15:26 p.m. IST)** |

The Account draft allows one isolated native headless Chrome session, at most 60 seconds/200 requests/64 MiB accounted resources; one exact-record navigation/observation, zero AI UI actions; up to eight local best-effort-masked images totaling 8 MiB. It preserves the exact existing QA org/user/persona/approved origins and nominated Account, bound export, reviewed name/Related/Details/stability and exact Id/Name/LastModifiedDate pre/post reads. Fresh API/native identity, active-user/build/app and source/state checks must pass. It requires separate acceptance of potentially irreversible native background effects and the dedicated user's reviewed access. Post-observation budgets do not prevent in-flight effects. No clicks, forms, writes, factory renewal, Contact traversal or external AI are authorized. There is no fresh passing Live Exploration Intelligence receipt yet.

Both choices are independent. All draft approval operators remain REVIEW_REQUIRED, with zero approved files and zero run reservations. Scope 002 and lifecycle 012 remain declined/inactive and have no reservations; no active or uncertain owned records remain (.state/live-readiness-safety.json). No replacement write package was prepared. No live Salesforce, Gemini or Chroma requests were made. A late reply cannot renew the original expiry or change the reviewed state binding; a failed runtime gate stops the session rather than lowering an assertion.

## Subsequent exact approvals and actual partial results

The operator subsequently approved the two exact packages above. The earlier inactive-handoff audit is historical. [LIVE_INTEGRATION_RESULTS.md](LIVE_INTEGRATION_RESULTS.md) records actual Salesforce API/unchanged-record and Gemini ingestion/grounding success, blocked browser observation and failed complete retrieval benchmark. No retry/replay, renewed expiry, changed binding or write package.
