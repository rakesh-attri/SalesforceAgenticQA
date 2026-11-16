# Lightning stable readiness and multi-object evidence

This continues `22328ba` and retains the later diagnostic evidence in `0de25c5`. It extends the existing view evaluator, rendering journal, workflow evidence/model/planner and CLI. It does not add a browser transport, permission plane or agent framework.

## Evidence first

The saved package-004 screenshot shows the Account header, tabs and related content without an obvious page-loading overlay. It established three native aria-busy counters but lacked element identities. The fresh authorized package-005 inspection subsequently identified all three as off-viewport `laf-progressive-container` elements below `lst-related-list-single-container` components, outside the reviewed name/tab regions. The old global predicate treated these nonzero-area elements as blockers. Their backend loading semantics are not established, and they are not labelled harmless or complete.

Account 005 also discovered 154 open roots against the initial 100-root inspection cap. Contact 006 discovered 153. Both incomplete inspections correctly prevented a receipt. This distinguishes a framework inspection/contract issue from a proven Salesforce application rendering failure.

[WAI-ARIA's aria-busy definition](https://www.w3.org/TR/wai-aria-1.2/#aria-busy) describes an element being updated; it does not establish that every such element blocks the whole page. Accessibility state and visible functional readiness must be reported separately. Do not remove the attribute or infer that a persistent value is harmless.

## Optional reviewed-region strategy

Existing view contracts retain their legacy global behavior. A new optional `readiness` definition changes the signed view hash and requires a fresh exact browser approval. It specifies `strategy: reviewed-regions-v1`, required region locators, and optionally independently reviewed background regions with explicit provenance hashes. No existing contract is upgraded automatically.

The fixed host-owned inspector records bounded structural DOM paths/hashes, public tag/finite role metadata, busy/fault flags, CSS-hidden reasons, ancestor aria-hidden/inert state, inactive-tab indications, viewport/region relationships and content signatures. It reads open LWC shadow roots with composed ancestry; closed internals remain inaccessible. It retains no text, ID, cookie, field value, arbitrary attribute map or raw HTML in diagnostic output. Required/anchor text is bounded and hashed in host memory solely for stability comparison. No inspector or browser handle is exposed as an arbitrary agent evaluator.

The inspector distinguishes actual CSS hiding, transparency and zero clipping from `aria-hidden`, offscreen positioning or inactive-tab labels alone. Visible unknown busy elements continue to block. An element is not ignored merely because it remains busy for a long time. Reviewed background exceptions cannot contain the required content or cover it as a positioned overlay. Visible application-error signals block even inside reviewed background regions. Missing/ambiguous required regions, conflicting background definitions and incomplete bounded inspection fail closed.

An additional explicitly selected, source-cited `deferredRelatedLists` definition can classify only the observed component/ancestor family as deferred when off viewport, unrelated to required regions/anchors, not covering them, and not an error/spinner/progressbar. Its aria-busy flags remain true in the report. If the list becomes required or visible, or another unknown component is busy, readiness still fails. This proves only the declared visible scope, not completion of deferred lists or backend quiescence. It is not enabled in older contracts. Local fixtures reproduce the actual tag/ancestry and 154-root shape. A separate signed `inspection.maxRoots` can select up to 512 roots; the default remains 100 and node/signal/text/browser/data budgets are unchanged.

The existing exact record-name and independent-content checks, source/build/app/operator matching, reviewed busy/fault selectors and stability window remain authoritative. The optional strategy additionally requires unchanged region/anchor content signatures throughout that window. Changing content resets stability. `readinessEvidence` reports why a signal was blocking or hidden; it never silently repairs a locator or changes an expected result.

The evaluator accepts standard/custom object API names and supports open LWC DOM. This does **not** expand live browser authorization: the existing session/record policies still allow only their approved Account/Contact scope. Generic/custom page coverage is verified with local fixtures, not a live grant for additional objects.

## Object-specific rendering evidence

New journal receipts identify Account or Contact. Existing Account receipts remain readable. A Contact receipt cannot satisfy the managed Account lifecycle gate. Receipt import checks its exact journal hash, native/unchanged proof, validation class, org/user/persona/source/build/app/state/profile/view scope and observed object. An optional matching reviewed view exports actual name/content locator definitions as workflow source claims. Neither HTTP success nor an incomplete render can produce those claims. Runtime receipt freshness and offline-versus-live restrictions remain intact.

Existing Contact grants retain their `LastName` display check. A new optional signed `referenceDisplayFields: {Contact: "Name"}` permits only that exact display-field selection for a separately reviewed Contact scope; the query still uses the exact approved ID and modification stamp. It requires a new session hash, and the rendering receipt binds the observed display field. An older surname receipt cannot be imported as full-name evidence. Package 006 exercised this read against the actual nominated Contact: one visible full-name text match, no matching heading-role locator, and equal scoped pre/post hashes. That is read/selector evidence, not a Contact readiness pass.

## Multi-object workflow assembly

`prepareMultiObjectJourney` reuses the existing snapshot, component graph, spec and evidence models. It preserves Describe references (including nullability and create/update flags) and explicitly incomplete permission facts. Read-only/system references are facts, not approved data operations. Relationship metadata cannot substitute for observed navigation or a required data dependency.

Live browser page inputs require a matching host rendering journal. Named source reviews, exact observed locator claims, source-stated outcomes, data prerequisites and independently reviewed transition claims are required for compiled proposals. Missing pages, expected outcomes, effective permissions and unsupported positive/negative/boundary/integration/permission/visual behavior remain questions. The existing planner/RAG/confirmed-history ranking, guarded TypeScript renderer and API/SOQL proposal validation remain the execution boundary. Model/source review grants no browser or factory authority.

```powershell
npm.cmd run platform -- workflow-evidence .state/account-contact-workflow-input.json
npm.cmd run platform -- workflow-plan .state/workflow-plan-input.json
```

`workflow-evidence` accepts bounded workspace paths `spec`, `org`, `graph`, explicit `permission`, optional journal-backed `observations` (`object`, `review`, `report`, `view`, optional separately reviewed evidence path), optional binding file and reviewed transition files. It writes a private content-versioned review artifact and makes no external calls. Raw snapshot/permission content is not sent to embeddings or models. The existing explicit minimized external-AI publication process is unchanged.

The actual local metadata analysis returned five within-Account/Contact references, two permission facts, 12 questions and no compiled model. `Contact.AccountId` was described as nullable; no mandatory UI transition or create authority was inferred. Real Contact page evidence, independently verified transition/outcome evidence and effective permissions remain incomplete. Existing reviewed fixture sources demonstrate compilation and guarded generation without claiming a real Salesforce journey.

## Live gate and continuation

Package 005 was approved, initially stopped at native identity-redirect, then used the operator-confirmed state-only replacement after fresh API/native proof. The original expiry and one-session total were retained and the old source retired. Its actual Account run verified name/Related/Details, made 196 requests with zero framework denials, captured four local images and passed scoped unchanged checks. Three off-viewport progressive nodes and incomplete inspection prevented readiness.

The separately nominated/approved Contact package 006 verified exact identity/app/build, performed the signed Name read and observed a unique visible name text, but zero matching heading-role names. The proposed heading contract failed; content checks depending on that name handle cannot establish whether the candidate tabs passed. Its 198 requests had zero framework denials, four local images and equal scoped pre/post checks. No receipt was minted. Neither reference was adopted for cleanup and no factory was reserved. Both slots are consumed.

Local evidence: `.state/account-stable-005-{latest,final}.json`, `.state/contact-stable-006-{latest,final}.json`, [Account preview](../artifacts/browser-debug/SFQA-STABLE-READINESS-20261116-005/index.html) and [Contact preview](../artifacts/browser-debug/SFQA-CONTACT-READINESS-20261116-006/index.html). New captures remain local; no image/traffic was sent to Gemini/RAG or an upload pipeline.

Fresh inactive reviews 007/008 were prepared from those observations. Account 007 keeps its heading/name/tabs/stability assertions and proposes only the narrow off-viewport component rule. Contact 008 proposes the actually observed unique text-name locator instead of the failed heading-role candidate, preserving expected names/tabs; Contact gets no deferral rule. Both explicitly select the 512-root bound and retain one 60-second/200-request session each. Their exact hashes and risk/locator/visible-scope changes require separate operator authorization; old grants cannot activate them. Passing checks would mean the reviewed visible view is ready, not every related list or business workflow.

Next: obtain exact approval for inactive 007/008, execute their source-backed visible-scope checks, issue receipts only if every reviewed check passes, and assemble reviewed Contact/workflow evidence. Only then prepare separate fresh factory/UI/session/run approvals for generated Playwright, independent SOQL, owned cleanup, reportingLabs and eligible learning. No real E2E or verified lesson follows from fixture tests or visual appearance alone. Richer autonomous Salesforce exploration and evidence-based coverage remain the next product priority.

Verification: 227/227 unit/integration tests, three headless Playwright tests, typecheck and all four demos passed; final focused receipt/readiness checks also passed. Fixtures cover genuine/hidden/clipped/inactive/background loading, errors, overlays, offscreen required content, stable/changing content, LWC ancestry, inspection limits, signed display fields and source-reviewed deferred components. These are offline checks. Actual observations are described separately above; no generated Salesforce lifecycle or verified business learning is claimed.
