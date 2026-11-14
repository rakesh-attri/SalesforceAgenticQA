# Read-only org intelligence

## Commands

```powershell
npm.cmd run platform -- org-intelligence stories/account-contact.json
# Only when an authorized non-sandbox org is intentionally being inspected read-only:
npm.cmd run platform -- org-intelligence stories/account-contact.json --allow-non-sandbox-read
# Rebuild plans from already saved intelligence; no Salesforce calls:
npm.cmd run platform -- org-plan stories/account-contact.json
```

The command validates the story, authenticates with existing JWT, verifies OAuth/org identity, reads global Describe and resolves candidate objects from actual catalog API names/labels. It does not rely on SFQA_OBJECTS. Explicit story objects must exist in that catalog. Actor-only "user" mentions do not cause a User data-creation proposal. Label matches remain proposed relevance; this is not proof of a business workflow or complete semantic interpretation.

Describe exploration is limited to 12 objects and two required-parent levels by default (library maxima: 50 objects/three levels). Denied describes, absent objects, ambiguous references and omitted dependencies remain unknown or blocked. Extended snapshots retain relationship names/order, child relationships, record-type info, field length/precision/scale/update permissions and picklists. These are API facts, not business validation guarantees.

The additional reads cover selected objects' RecordType, ValidationRule, ObjectPermissions, FieldPermissions, named CustomObject Metadata API reads and available dependency rows, plus bounded ApexClass/ApexTrigger/FlowDefinition and current-user permission-set assignment inventories. Query results are limited to 200 rows. A full limit is conservatively marked partial even if Salesforce reports done; failures are unknown, never empty proof of absence. SOAP uses fixed readMetadata only; no deploy, create/update/delete, business records or financial operations are executed. Technical contracts follow Salesforce's [Tooling API resources](https://developer.salesforce.com/docs/platform/api-tooling/guide/intro-rest-resources.html), [RecordType](https://developer.salesforce.com/docs/platform/api-tooling/references/tooling-objects/tooling-recordtype.html), [FieldPermissions](https://developer.salesforce.com/docs/platform/object-reference/references/standard-objects/object-fieldpermissions.html) and [readMetadata](https://developer.salesforce.com/docs/platform/api-metadata/references/crud-based-calls/meta-readmetadata.html) references.

## Org identity is authoritative

The default command refuses an org reporting IsSandbox=false. Explicit `--allow-non-sandbox-read` permits only this bounded metadata-read path under the project's production-read-only policy. It never grants data mutation/UI testing or changes the sandbox-only execution runtime. A Developer Edition or other non-sandbox environment must not be relabeled a sandbox because of an alias, URL or user assumption. API/org identifiers are retained privately for provenance and omitted from console summaries.

## Storage, source links and review

- `.state/org-intelligence/<SHA-256>/intelligence.json`: identity, selection evidence, metadata sections, unknowns and snapshot.
- `.state/org-intelligence-latest.json`: current intelligence manifest.
- `.state/org-snapshot.json` plus content-addressed snapshot store: existing planning/runtime compatibility.
- `artifacts/<story-id>/org-intelligence-plan.json`: actual draft test/data plan from the supplied story and observed schema.
- `artifacts/<story-id>/browser-readiness.json`: required persona/session/origin gates; no browser is launched.

All live metadata/permission rows and runtime plans remain ignored by Git. KnowledgeIndex receives source-versioned **observed** records under the configured org alias and `SFQA_KNOWLEDGE_PERMISSION` (default authorized-api-reader). Observations do not enter trusted retrieval automatically. After independently reviewing the metadata, re-run with `--reviewer YOUR_NAME` to publish source-linked verified facts. This verifies the reviewed metadata content only, not inferred business behavior. `--with-embeddings` separately opts into configured embedding/Chroma adapters; without it there is no external model/vector upload from this command. Scope must match the spec pipeline's permission value.

The Spec Analyst can consume the extended snapshot directly; the planner cites live Describe paths; the data agent resolves required references and optional story-linked relationship proposals only against discovered fields/targets. Story-derived relationship edges are proposals requiring recipe review, not fabricated required API fields. Self-hierarchy references are not inferred merely from a generic "related" story. Unknown fields/parents remain blocked. Existing verified knowledge retrieval can consume reviewed org documents, with org/permission/version isolation and existing schema invalidation preserved.

## Actual execution comparison — 2026-11-14

| Capability | Offline evidence | Actual configured-org result |
|---|---|---|
| JWT/OAuth identity | auth/readiness mocks | authenticated identity succeeded; **IsSandbox=false** |
| Global catalog and story resolution | label/actor/unknown/budget tests | 1,088 accessible object entries; Account and Contact selected from an empty explicit objects list |
| Fields and relationships | typed Describe fixtures and plan assertions | two objects, 108 fields; relationship metadata read; Contact Account-reference proposal precedes child creation |
| Record types | record-type/child relationship fixtures | two Describe info entries; zero selected-object RecordType query rows (not proof of UI picklist applicability) |
| Validation rules | denied-section fixture | selected-object query succeeded with zero rows; broader Apex/Flow/business rules remain unknown |
| Apex | bounded/partial coverage logic | 200 class entries (partial), 17 trigger entries |
| Flows | query coverage logic | 13 FlowDefinition entries; flow conditions/actions not verified |
| Accessible permissions | scoped metadata query fixtures | 84 ObjectPermissions rows, 200 FieldPermissions rows (partial), two assigned permission-set rows; effective user/sharing access not established |
| CustomObject Metadata API | read-only XML/metadata tests | named read returned locally; section marked partial pending component interpretation/review |
| Component dependency query | safe unknown coverage | unavailable/unknown; no cause or dependency edge invented |
| Test/data planning | catalog→plan→reviewed index integration | three source-criteria scenarios; Account Name and Contact LastName prerequisites, Contact→Account dependency; approved=false, executable=false |
| Browser preparation | blocked readiness tests | blocked: non-sandbox flag plus no reviewed browser origin/persona/session; no UI action executed |
| Gemini | structured chat/embed mock suites | model:check reports chat model configuration failure and embeddings not-configured; no live Gemini result claimed |

Live version retained for the final run: `87fbba2f5507ef78d8dc8d0a46acbb05bfa28a09585bf25ead1614382c5de499`. Its raw org data is local only. Exact counts reflect this bounded run and can change with org configuration/permissions. No current-org records were created, changed or deleted. `org-plan` regenerates derived plans from that retained capture without another network call.

## Continuation

Validation for this increment: typecheck, 69 unit/integration tests, original offline demo and all three headless browser tests passed. Five new tests exercise discovery/selection, actual graph/RAG/data integration, trust isolation, partial coverage and non-sandbox readiness blocking. This automated fixture coverage is separate from the live metadata counts above.

Point the local configuration at an authorized **actual sandbox** (or resolve the environment discrepancy with the administrator) before live UI/data testing. Review discovered metadata and unknown rules, publish only reviewed knowledge, establish a separately approved browser origin/persona/authenticator/session receipt and then use bounded headless MCP observations. Extend record-type scoped picklists, permission-set-group muting/effective access, component dependencies and deeper Flow/Apex analysis with source evidence. Gemini needs valid chat model configuration and explicit embedding configuration before live model validation; credentials alone are not success. All original/later P0/P1/P2, failure intelligence, verified learning and 15-agent requirements remain tracked in FEATURE_MATRIX.md.
