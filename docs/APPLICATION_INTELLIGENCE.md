# Application discovery and workflow understanding

This layer composes existing Org Discovery, Application Explorer, WorkflowModelStore, Spec Analyst, Planner, Risk Analyzer, KnowledgeIndex, Reviewer and Generator. It grants no browser, model-upload, factory or execution permission. Lifecycle 012 remains explicitly declined; do not prepare another live data package without a new request.

The dependency chain is current metadata/component graph and source specification → historical host-journal pages or bounded synthetic exploration → candidate relationships and observed states/navigation → prioritized questions → named accept/reject/correct answers → compiled model → separate exact model review → existing risk/RAG/history/test design → guarded proposals and local reports. A review is a business/design decision, not an environment or execution grant.

## Evidence and discovery

`application-intelligence.ts` verifies the graph content hash, snapshot knowledge fingerprint, requirement content, persona and org. Existing deep metadata supplies fields/types/picklists, record types, Flow conditions, Apex/LWC/validation dependencies and available permission/sharing evidence. The study keeps all these source versions; metadata declarations never establish executed business effects or effective record permissions.

Relationships become suggested journeys in both directions, including declared hierarchy references. A runtime transition becomes observed only when the host actually navigates between mapped pages under an explicit navigation contract and metadata supports the relationship. Unsupported observed relationships stay unsupported. An operator cannot turn a suggestion into an observed transition by answering a question. Historical direct visits to Account and Contact prove their own reviewed views, not navigation between them.

`application-layouts.ts` adds an optional bounded public UI API default Full/View/Large layout read (three objects by default, maximum five; bounded fields and response size). It verifies the current API org/user first, retains only fields present in Describe, and emits source-linked Layout/LayoutField graph nodes. Required flags are explicitly layout-only. Denied, foreign, malformed or omitted results stay unknown/partial; provider error bodies are withheld. It uses the documented [getLayout parameters](https://developer.salesforce.com/docs/platform/lwc/guide/reference-get-layout.html) and [UI API layout resource](https://developer.salesforce.com/docs/atlas.en-us.uiapi.meta/uiapi/ui_api_resources_record_layout.htm). This new wire adapter is mock-verified, not live-verified. Existing cached metadata is not silently refreshed.

## Browser observations

The existing fixture explorer now supports explicit reviewed navigation, collecting unique visible role/label/test-id locators through open shadow roots, tabs, actions, regions/related-list structures, loading/errors and state hashes. Navigation permits match an exact main-frame target within the reviewed loopback paths; unknown navigation and external origins are blocked. Action choice uses only unused reviewed references for the current page. No arbitrary MCP tool, evaluate authority or new live policy is exposed.

The actual Playwright MCP snapshot client shares the sole isolated headless installed-Chrome context. Host-journal receipts bind org, persona, metadata version and report content; synthetic receipts cannot be imported as live Salesforce facts. Collection limits are 512 nodes, 60 locator candidates and 100 loading/error signals. Hitting bounds marks the observation incomplete. Closed/inaccessible components remain unknown; visible elements do not imply click safety. This fixture collector is not a replacement for the existing stricter live Lightning readiness evaluator.

At most four local viewport screenshots share a 4 MiB budget and reuse the existing masked debug manifest/store/preview. Inputs, private elements and recognized credentials are masked; masking remains best effort. Images and evidence stay ignored/local. No upload, animation fast-forward or everyday Chrome profile access occurs. Native Salesforce navigation/exploration still requires fresh exact authorization and the existing live identity, action, time/request and ownership gates. This increment did not execute live exploration.

## Operator review and model generation

Questions are grouped by business rule, workflow, page, permission, transition and missing outcome, prioritized by prerequisites and the criteria they unblock. Each cites current source IDs/versions. The SQLite study is immutable; answers are append-only with a named operator, reason, exact scope/version and citations. Corrections/rejections must supersede the exact current answer. Wrong personas, nonexistent source fields/components, changed literal results and foreign citations fail closed. Rejected or corrected answers invalidate dependent models and indexed requirements.

Compilation requires complete observed pages, page and permission-prerequisite reviews, supported fields/components, exact acceptance outcomes, actual observed locators/actions and reviewed connected transitions. Conditions and states become optional evidence refs on existing JourneyModel steps, preserving older model hashes. Identical object/persona/condition/observable with conflicting results is rejected. API expectations require reviewed current fields and retain exact source citations. A compiled model still needs a separate immutable named model review before the existing generator emits proposals. Even then, generated Playwright references the missing `REVIEW_REQUIRED-test-design-guard.json`; API code has no HTTP adapter or credentials.

The existing seven-category planner remains responsible for positive, negative, boundary, integration, permission, regression and visual scenarios. Missing negative/boundary outcomes, permissions, business conditions or approved visual oracles remain questions. No scenario category or expected result is invented to claim coverage. Existing Gemini ranking and confirmed-defect risk influence remain available through their separate reviewed payload/history gates.

## Knowledge classes

Local application facts enter KnowledgeIndex as **observed workflow** documents. Accepted business answers enter as **reviewed requirements**, never execution lessons. Explicit hypotheses remain **proposed**. Trusted retrieval excludes observed/proposed documents and isolates org/persona/current metadata. Corrected answers deprecate earlier requirements. This new publisher rejects any embedding or remote adapter before transmitting or writing: external use must go through the existing minimized, approved ingestion path. Gemini chat and `gemini-embedding-001` are unchanged. No new verified lesson is created; the existing confirmed failure/cause/fix/passing-regression gate remains authoritative.

## PowerShell commands

Run the actual synthetic browser/MCP discovery, scripted **fixture-only** reviews, two-object model, guarded proposals and HTML report:

```powershell
npm.cmd run platform -- demo-application-intelligence
```

The result prints report/JSON, screenshot preview, proposal and SQLite paths. It observes one navigation direction, leaves the reverse suggested, collects five state observations/four masked images and generates two UI plus one API proposal. These proposals were not executed against Salesforce.

Local discovery uses a workspace JSON configuration:

```json
{"spec":"stories/reviewed-story.json","org":".state/org-snapshot.json","graph":".state/component-graph.json","permission":"reviewed-persona","observations":[],"changes":["Field:Contact.LastName"]}
```

An optional `observations` entry has `review`, `report` and `view` paths to matching prior browser evidence. The host `.state/dedicated-qa.sqlite` journal must establish those receipts. New live proofs are never minted by importing files.

```powershell
npm.cmd run platform -- application-discover .state/application-input.json
Start-Process '<printed local HTML path>'
npm.cmd run platform -- application-review .state/application-answer.json
npm.cmd run platform -- application-compile .state/application-compile.json
npm.cmd run platform -- application-approve-model .state/application-model-review.json
npm.cmd run platform -- application-compile .state/application-compile.json
npm.cmd run platform -- application-index .state/application-index.json
```

All these application commands are local-only. Review JSON has `{scope:{org,permission},decision:{studyVersion,questionId,operator,decision,reason,answer,sources:[{source,version}],supersedes?}}`. Use IDs/versions from the printed study. Business answers use the existing BusinessRuleSchema (criterionId/object/persona/when/observable/expected/prerequisites/dataRequirements/components); workflow answers are `{object,workflow,api?}` using WorkflowSchema and an optional `{object,fields,expected}` read proposal. Page/permission answers use `{text}`, transition answers `{transitionId}` and require an observed edge. Rejections need a reason; corrections/rejections of an earlier answer must include its decision hash as `supersedes`.

Compile JSON is `{scope,studyVersion,spec,org,graph}`. Exact-model review JSON is `{scope,studyVersion,id,modelVersion,operator}`. Index JSON is `{scope,studyVersion}`. Scope contains only `org` and `permission`; use the hash/alias from discovery, not invented identity. These commands persist only intelligence decisions; no synthetic data factory package is created. Use the existing `org-intelligence STORY --allow-non-sandbox-read --layouts` only after a separately authorized live metadata-read configuration; it is not needed for offline discovery.

## Remaining autonomy

The next dependency is goal-directed selection of **already approved** discovery steps, using missing-evidence priority and coverage gain to choose the next bounded observation, with persisted checkpoints and reproducible failure evidence. Then add separately reviewed live navigation adapters, semantic state equivalence, LWC/Experience breadth, richer business/permission oracles and verified recovery. Actual multi-object Salesforce transitions, effective sharing, business-action outcomes, visual baselines and full E2E execution remain unverified. Neither historical readiness nor this fixture grants authority for them.
