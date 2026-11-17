# First Account / Contact automation lifecycle

This continuation starts at `c8b43ff` and reuses the dedicated data service, headless local Chrome profile, shared Playwright/MCP architecture, host readiness journal, generated runner and reportingLabs. All 15 agent responsibilities and P0/P1/P2 requirements remain cumulative. No new browser transport, resource exception or general Production permission is introduced.

## Reviewed preparation

The original inactive lifecycle-009 package is preserved. Its proposed tests asserted only names, used the API origin rather than the source-observed Lightning origin, and grouped both selector visits into one 200-request context. Its Contact locator was source-supported, but full-name equivalence for a LastName-only factory was not independently enforced. None of these proposals was executed live.

The new private `.state/live-lifecycle-012/` package uses the actual Lightning origin, observed Account heading and Contact unique-text locator, plus exact Related/Details tab locators from the host-journal views. It preserves both literal synthetic name expectations. New generated content assertions require one visible element and carry a source citation. No fill/click step, cross-object transition or unobserved relationship locator is generated.

An explicit `contactDisplay: name-equals-synthetic-lastname` review binds the extra read. Before and after UI execution, the dedicated verification service checks exact owned Contact ID, Name, LastName and AccountId against the verified same-run Account. A populated/unexpected full name fails; the framework does not adjust the assertion. General ownership verification still checks creator, run marker and every approved payload field. Foreign IDs and altered relationships fail closed.

The new `selectorSessions: per-workflow` option is hash-bound and opt-in. It separates the two selector observations; two actual generated tests use two further contexts. A proposed four-session grant is a new permission requiring approval, not an increase to existing grants. Each context retains its independently enforced 60-second/200-request/resource bounds, native identity/build verification and dedicated-user access/risk review. Existing packages keep their original behavior and consumed quotas. Daily factory quotas are unchanged.

## Execution and reports

After final explicit approval and all live gates, the existing coordinator creates the Account, verifies it, creates the linked Contact, verifies both, observes the approved locators, runs generated TypeScript and performs independent post-browser checks. Cleanup deletes only certainly owned Contact then Account, checks foreign cascade dependencies, and now records separate exact-ID absence queries before finishing. Uncertain dispatches require reconciliation; no automatic replay is added.

API evidence retains query hashes, checked field names and affirmative relationship/display results in the lifecycle report. Actual values and private journal data remain local. The runner uses the real installed reportingLabs reporter. After cleanup, a framework-owned local HTML appendix and `sfqa-lifecycle.json` add requirement traceability, real test statuses, API/cleanup outcomes, coverage gaps and links/hashes for local masked PNGs to that actual report. This edits local generated output; it does not invent a reportingLabs API or manufacture vendor test rows. A finalization failure prevents an overall passing lifecycle even if individual tests passed.

Passing execution is history, not a verified Salesforce lesson. Legacy `publishVerifiedExecutionLesson` fields remain readable but cannot authorize automatic promotion; new proposals set it false. The existing confirmed failure, reviewed root cause/fix and passing-regression gates remain the route to verified defect knowledge. Failure evidence, investigation, history and regression planning remain available.

## Current verification and operator boundary

Fresh separately approved Account 010 and Contact 011 no-create preflights passed on November 17: exact API/native identities, installed Chrome/MCP, unchanged reviewed visible-view contracts, scoped pre/post equality and 197 requests each. These checks grant no factory authority. Historical 007/008 evidence remains unchanged. No Lightning loading/network investigation was repeated or resource policy widened.

The final lifecycle required the separate exact named authorization shown in `.state/live-lifecycle-012/manifest.review.json`. It did not arrive before the Account receipt expired at 9:55:57 a.m. IST on November 17. Package 012 stayed inactive: no factory or generated live test. A late reply cannot activate its expired proof. Continuing requires fresh unused readiness grants and a newly bound final review; schema, active-user permissions, imported session receipt, quotas, ownership and cleanup visibility must still pass. No existing observation record becomes cleanup-owned.

Offline verification: typecheck, 229 unit/integration tests, three headless tests and all four demos passed. Real local generated tests verify visible tabs, synthetic Contact binding, SOQL, cleanup, actual reportingLabs and refusal to promote a lesson merely from a pass. Negative tests reject foreign Contact IDs, unexpected full names and altered AccountId values. Gemini chat, gemini-embedding-001, RAG/optional Chroma, LangGraph and enterprise integrations retain their existing evidence; no external AI/embedding call was made here.

## Next intelligence priority

1. Acquire reviewed real multi-object transitions and prerequisites through the existing bounded Explorer/MCP, separating direct-ID navigation from actual business journeys.
2. Ground story analysis and risk-ranked positive/negative/boundary coverage in metadata, effective permissions and confirmed history; leave unsupported outcomes as questions.
3. Extend bounded autonomous exploration and functional/visual checks over those reviewed workflows, with separate interaction approval.
4. Correlate executed failures and visual/API evidence, propose controlled repairs, then require reviewed cause/fix and passing regressions for learning.
5. Extend local QA analytics/reporting and reviewed Jira/Azure DevOps publishing through existing connectors; execution evidence never authorizes external issue creation automatically.

The live execution outcome is recorded in the latest implementation report and feature matrix. Fixture passes or a prepared package never establish a live lifecycle pass.
