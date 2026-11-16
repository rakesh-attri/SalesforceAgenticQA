# Dedicated native Chrome and workflow intelligence

This continues the existing compatibility engine and `LightningSession`; it does not replace them. `DEDICATED_QA_NORMAL_CHROME` is a separately reviewed transport inside `DEDICATED_QA_ORG`. `SANDBOX_QA`, `PRODUCTION_READ_ONLY_QA` and `PRODUCTION_CONTROLLED_QA` retain their existing policies.

## Selection and authorization

The default remains guarded networking. Prepare an inactive profile/session using:

```powershell
npm.cmd run platform -- dedicated-chrome-review .state/chrome-review-input.json
```

The input uses the existing Lightning review schema: `sourceReview`, `statePath`, fresh `runId`, and `viewPath`. Preparation writes `.state/dedicated-chrome-profile.review.json`, `.state/dedicated-chrome-session.review.json` and an inactive preference proposal. These files grant nothing. Review the exact hashes, operator, org/user/persona/origins, nominated record, engine/build/app, view and expiry before activating the profile and session locally. A profile explicitly accepts unknown/irreversible native background effects and attests review of the dedicated Salesforce user's access. No environment variable activates this mode.

An activated local `.state/dedicated-browser-preference.json` contains only:

```json
{"profile":".state/dedicated-chrome-profile.approved.json"}
```

The profile must carry a named operator, unchanged plan hash, risk/access attestations and valid expiry. New `lightning-review` drafts can select that exact matching profile, stay `REVIEW_REQUIRED`, and cannot outlive it. Existing signed guarded grants never acquire native transport through this preference. Expired or mismatched preferences fail closed. Each actual session separately binds `executionProfile`, `profileHash`, browser state, view, budgets and expiry. Activation does not renew the parent data policy, factory approval or any consumed session. State-only replacement retains the existing lineage, original expiry and total session allowance.

```powershell
npm.cmd run platform -- lightning-observe .state/approved-native-session.json .auth/approved-state.json --via compare --view .state/reviewed-view.json
```

Installed Chrome is preferred; compatible installed Edge is the fallback. The existing launcher creates an isolated, nonpersistent headless QA context. It never attaches to or imports an everyday browser profile. Native API/browser org/user/app/build verification precedes session reservation. Playwright and the private MCP SDK share the same context; agents receive only the existing restricted Salesforce gateway.

## Four permission planes and residual risk

| Plane | Native-profile behavior |
|---|---|
| Platform initialization | Native networking, without framework route interception. Requires its own exact operator risk/access review. Unknown native requests are not reclassified as safe controller contracts. |
| Observation | Only approved Account/Contact record navigation, constrained snapshots, reviewed locators and local approved masked screenshots. |
| Agent interactions | Existing reviewed workflow IDs, certain run-owned records, exact one-use steps and shared budgets. Arbitrary native MCP/evaluate/network/file tools remain unavailable. |
| Business mutations | Existing separate factory/UI/run approvals, ownership journal, independent SOQL and guarded cleanup. Readiness and preferences grant no mutation authority. |

Native application scripts can issue requests that the framework cannot prevent or reverse in this profile. Salesforce user permissions are the enforcement boundary for those requests. A fixture deliberately demonstrates a native background POST while explicit agent mutation tools remain denied. Request/time limits close the context after observed dispatch; response Content-Length accounting is not a hard transport cap. Service workers and downloads remain disabled. Least privilege and accepted native effects are mandatory, not assertions that the entire session is server-side read-only.

Reports distinguish explicit framework writes from unenumerated native background effects. Scoped pre/post Name/modification-stamp equality proves only those checked properties of the nominated record. It cannot prove absence of every server effect.

Rendering readiness requires the actual Account name, independent reviewed content locators, stability and absence of visible busy/error indicators, native document proof, approved screenshot evidence when configured, and unchanged independent reference checks. New receipts bind the profile hash. Old one-off normal comparisons still cannot mint readiness. Offline receipts cannot unlock live runs. A successful readiness receipt only permits consideration of a separately reviewed lifecycle.

## Source-grounded workflow services

`workflow-evidence.ts` acquires component/dependency sources from the existing org snapshot and graph, exact stated outcomes from specifications, and Account-page evidence from an actual host-journaled rendering proof. HTTP success or an old normal comparison alone is insufficient browser evidence. Metadata dependencies never establish business transitions or outcomes.

`workflow-models.ts` links multi-object steps to pages, components (including accessible LWC/Flow/validation graph nodes), permission contexts, prerequisites, transitions and literal expected outcomes. Claims carry source IDs, versions and provenance hashes. Page navigation, transitions and assertion text must match their cited claims. SQLite stores immutable model content, separately appended immutable named review, and current source versions. Only dependent source changes invalidate a model; cross-org/permission access fails.

`workflow-planning.ts` reuses `intelligentSpecPlan`, the current component graph, reviewed KnowledgeIndex retrieval and confirmed historical regression mappings. Business impact, changed component dependencies and confirmed history influence ranking. Six scenario kinds are represented: positive, negative, boundary, integration, permission and visual. Missing behavior becomes coverage questions. The current fixture supports only positive/negative scenarios; it does not invent the remaining four.

Generated TypeScript proposals preserve literal assertions and install the existing owned browser guard. They contain a deliberately unapproved guard configuration reference and cannot execute as an authorized journey. Navigation must equal the observed page. API/SOQL proposals require known current object/field names and exact reviewed expected values; execution remains the existing scoped adapter's responsibility. Full cross-object business semantics, live Contact proof acquisition and automatic reviewed model assembly remain partial.

The LangGraph adapter uses the existing graph runtime/checkpointer interface, interrupts for exact named model review, and returns proposals without execution tools. Caller-supplied durable savers retain the existing checkpoint behavior. No additional agent framework is introduced.

```powershell
npm.cmd run platform -- demo-workflow-intelligence
npm.cmd run platform -- workflow-plan .state/workflow-plan-input.json
```

`workflow-plan` accepts bounded workspace paths `model`, `spec`, `org`, `graph`, optional `observations: [{review,report}]` and `changed` component IDs. It reconstructs current metadata/requirement versions, imports only browser evidence backed by the existing dedicated rendering journal, checks model freshness, reuses local reviewed knowledge/history, and writes a local HTML/JSON coverage report. It configures no external model/embedding client and launches no browser or factory. A missing source/review returns a sanitized source gate.

The demo uses synthetic Account/Contact sources and a seeded reviewed-history fixture in a fresh private SQLite database on each run. It demonstrates historical regression influence and guarded proposals, not a real discovered Salesforce defect, executed business journey or newly verified lesson. Reports stay under ignored `artifacts/workflow-intelligence/<model-version>/` with a restrictive CSP and escaped content. No model input or screenshot is uploaded.

## Verification boundary and continuation

The initial package-002 attempt stopped at native `identity-http` before reservation. The operator refreshed the normal-login export and explicitly authorized a state-only replacement. Fresh API/native org/user/build/app and unchanged engine proof passed; the old state binding was retired with the original expiry and one shared session retained.

The one live session then ran in installed Chrome **157.0.8103.78**, headless, with Playwright/MCP sharing the context. Both observed exactly one Account-name heading/text match, 18 headings, four tabs and 48 buttons. The reviewed name and two independent Related/Details locators passed. There were **196 requests, zero framework denials**, no budget-triggered closure, four local masked screenshots, and equal scoped pre/post Name/modification-stamp hashes. One console error was categorized `blocked`; its underlying cause is not established. No explicit framework write, factory, data lifecycle or lesson promotion occurred. Native background effects remain unenumerated.

**Readiness was not established:** the aggregate busy check stayed false while name/content/fault checks passed. The capture did not retain which native SLDS/aria signal caused this; zero role-progressbar matches does not rule out those other signals. Do not call the page fully stable or infer a specific Salesforce error. New bounded counter diagnostics distinguish those signals in future sessions and are verified offline; they do not retroactively explain this run. The session is consumed. Images stay local and were not sent to AI for analysis. Local preview: `artifacts/browser-debug/SFQA-NATIVE-PROFILE-20261116-002/index.html`; sanitized evidence: `.state/native-profile-002-latest.json` and `-final.json`.

Next: review local images and finite busy-state evidence, obtain a fresh exact no-create diagnostic grant without replaying the consumed session, complete stable Account proof, then review Contact evidence and a dependency-aware workflow model. Separately authorize one fresh bounded factory/UI/session/data run. Execute generated tests, independent SOQL, owned-only cleanup and reportingLabs before promoting eligible learning. Broader autonomous exploration, visual/business evaluations and enterprise connectors remain cumulative engineering work.
