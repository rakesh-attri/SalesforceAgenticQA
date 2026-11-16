# Installed Windows browser and native-network comparison

Continued from 51002eb. Standard per-machine/per-user Chrome and Edge executable locations are detected without reading browser profiles. Chrome is preferred, then Edge; missing or incompatible installations fail closed without downloading or connecting remotely. Headless launch uses the installed executable with a fresh Playwright temporary profile and isolated nonpersistent contexts. No CDP attach, everyday profile copying, user-data path, existing-session termination or Docker is used. Test/configured/generated runners use the same local browser selection. Engine profiles now pin the executable SHA-256 as well as Playwright/MCP versions; old engine approvals require a fresh review. A software update invalidates that pin.

Installed detections on November 16: Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe`, **156.0.8078.76**; Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, **155.0.4283.62**. Chrome launched successfully through Playwright; real MCP fixture tests reused its guarded context. Edge fallback discovery is tested offline; no actual Edge session was needed.

Primary interfaces: [Playwright installed browser channels](https://playwright.dev/docs/browsers) and [isolated browser contexts](https://playwright.dev/docs/browser-contexts).

## Separate reviewed comparison scopes

Rakesh Attri separately approved exact local A/B policy hashes, one session each, exact org/user/origins/nominated Account/state/build/engine, no actions or data factory authority, maximum sixty seconds, original 10:19 a.m. IST expiry. Both passed fresh API and native org/user/app/build proofs. Playwright and private MCP reused the same context within each comparison.

A requires an additional exact `NormalNetworkingReceiptSchema` receipt acknowledging native initialization's unreviewed server effects. It installs no framework route, request rewrite, fetch/fulfill/abort or interception. Only passive events collect sanitized classifications. Crossing a time/request/advertised-byte limit closes the owned context; this cannot undo or prevent already dispatched requests, and response content-length accounting is not a hard transport byte cap. This limitation was expressly disclosed and approved. No AI actions, raw native MCP tools, generic navigation or default normal-network mode are enabled. Normal observations cannot produce a lifecycle readiness receipt. B uses the existing versioned resource cache and source-reviewed request contracts, including the separately approved sole current-app exception. Normal Production restrictions are preserved.

The private CLI for an already approved A scope is:

```powershell
npm.cmd run platform -- lightning-observe .state/local-browser-A.approved.json .auth/APPROVED_STATE.json --via compare --settle-ms 10000 --normal-receipt .state/local-browser-normal.approved.json
```

For B omit the normal receipt and use its exact approved policy. These two November 16 grants are consumed; examples are not permission to replay them. Never substitute an expired review or renew the session cap automatically.

## Executed live evidence

| Observation | A: native networking | B: guarded networking |
|---|---|---|
| Browser | Installed Chrome 156.0.8078.76 | Same installed Chrome version |
| Native Account document identity | Passed | Passed |
| Exact Account text / heading | 1 / 1 | 0 / 0 |
| Headings / tabs / buttons | 18 / 4 / 48 | 0 / 0 / 0 |
| Observed requests | 195 | 41 |
| Framework denials | 0 (no interception) | 23 |
| Console categories | 1 browser blocked-category error | 23 blocked-category errors |
| Pre/post Account Name/LastModifiedDate hashes | Equal | Equal |
| Local masked screenshots | 4 | 6 |
| Reviewed rendering/stability receipt | Not established | Not established |

A's final image shows the Account header, Related/Details tabs, related record cards and Activity region; the API-verified name was uniquely visible to both direct Playwright and MCP. B fails before visible controls. A had 58 Aura POST HTTP-200 responses; HTTP status alone does not establish Aura success or controller purity. B denied five unknown-resource and four origin/path static requests, eight unknown action/query Aura requests and one unreviewed Aura GET, plus other unsupported requests. Eighteen exact request keys denied in B were observed in A's network trace. The matching-scope comparison grants no permissions.

This identifies a **guarded-network compatibility gap on the same installed Chrome**, rather than evidence that installing Chrome alone fixes guarded execution. Cache/interception, static coverage and request-contract coverage differ together. The specific causal request or combination is **not isolated**. Neither controller semantics nor safety follow from successful normal rendering. No unknown controller was automatically allowed, no generated Salesforce lifecycle ran and no learning was published. Existing-record checks cover the approved record fields only, not all possible server-side effects accepted in A's native-risk review.

Private original reports: `.state/local-browser-A-final.json`, `local-browser-B-final.json`, the corresponding `-latest.json` direct/MCP observations, and `.state/local-browser-comparison.json`. Console output is classified locally; raw console text is not retained. Screenshot previews:

```powershell
npm.cmd run platform -- browser-debug-preview SFQA-LOCAL-20261116-A
npm.cmd run platform -- browser-debug-preview SFQA-LOCAL-20261116-B
Invoke-Item .\artifacts\browser-debug\SFQA-LOCAL-20261116-A\index.html
Invoke-Item .\artifacts\browser-debug\SFQA-LOCAL-20261116-B\index.html
```

A screenshot names start `e828f64c-580d-4bb6-a148-249bfdef033d-`; B names start `9b7b8ff5-6e3d-4cf6-8420-e081838f4225-`, inside their respective run folders. Images/manifests remain local and ignored. Masking remains best effort; custom related-record widgets can expose values, so inspect locally before sharing. There is no automatic Gemini/RAG or hosted-report upload.

## Continuation

Use the minimized matching request deltas and existing local client-source evidence to review actual behavior/parameter/response contracts. Establish exact observed Account heading and independent content selectors, then validate stability and cleared loading/error state under a newly reviewed guarded session. Only after a passing guarded no-create proof should a fresh Account/Contact data/UI/run package be reviewed. A normal-network pass alone cannot approve factories, cleanup, actions, unrestricted Production browsing or high-risk operations. All 15 responsibilities and P0/P1/P2/Gemini/gemini-embedding-001/RAG/reportingLabs/learning requirements remain cumulative.
