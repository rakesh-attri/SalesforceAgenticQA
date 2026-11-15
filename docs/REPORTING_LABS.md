# Local reportingLabs integration

reportingLabs is the open-source `reporting-labs` npm package. Its documented Playwright reporter generates local reports without a hosted account or paid API key. The earlier framework assumption that an unidentified reporting API blocked this feature was incorrect. Primary references: [Node.js setup](https://reportinglabs.dev/get-started/nodejs/), [supported options](https://reportinglabs.dev/reference/options/), [privacy](https://reportinglabs.dev/security-privacy/) and [package source](https://github.com/naveenautomationlabs/reporting-labs).

The project pins `reporting-labs` **0.6.24** in package.json/package-lock.json. No package lifecycle scripts were run during installation. The documented native entry is `['reporting-labs', options]`; this project delegates to the package's exported `ReportingLabsReporter` through `src/integrations/reporting-labs-reporter.ts` so framework privacy and output boundaries remain enforced. There is no invented API, upload endpoint or Reporting Labs credential setting.

## Configuration and output

`reporting-labs.config.ts` contains public fixture-report settings. The existing list, Playwright HTML, JUnit and history reporters remain enabled. Generated tests also use the adapter and retain their JSON/HTML/JUnit evidence.

```powershell
npm.cmd test
# Local native reportingLabs artifacts:
# artifacts/reporting-labs/index.html
# artifacts/reporting-labs/report.json
# artifacts/reporting-labs/history.json
# artifacts/reporting-labs/sfqa-validation.json
```

Generated execution places the same files under its own `reporting-labs` subdirectory. Set `SFQA_REPORTING_LABS=0` to disable only this optional reporter. This setting does not change execution, authentication, assertions or learning gates. Keep outputs under ignored runtime directories; do not commit them.

## Framework safeguards

- No `reporting-labs/auto` import or automatic API capture is enabled. Salesforce headers, request bodies and browser storage are not added to reporting through that facility.
- Secret masking values are derived privately in the adapter. They are never placed in Playwright's serialized reporter configuration, which is itself included in JSON reports. Native masks and framework stdout/error redaction operate locally.
- Output paths remain within ignored workspace directories. Existing asset deletion targets are checked before native report generation. Vendor environment overrides cannot redirect output or enable automatic browser opening. PDF generation and auto-open are disabled; execution remains headless.
- Reports identify `local-fixture`, `offline-mocked-salesforce`, `live-salesforce` or `unclassified-generated` scope. `sfqa-validation.json` records actual attempts and outcomes while explicitly refusing to infer lifecycle success or verified learning.
- Native grouping, trend and flakiness displays are reporting heuristics. Framework defect confirmation still needs reviewed cause/fix evidence and a passing regression; execution learning needs the complete UI/SOQL/cleanup lifecycle.

## Executed evidence and limits

The real installed package produced reports for the three existing headless fixture tests. An integration test also executed passed/failed/skipped generated fixtures, verified credential-canary masking and secret-free configuration, then launched a second Playwright process to prove persisted history across failure/recovery. The latter remains synthetic fixture evidence, not Salesforce defect learning.

No generated live Salesforce UI test has passed, so no reportingLabs artifact is claimed as evidence of a complete live Salesforce lifecycle. Earlier run-005 JSON/HTML failure reports and cleanup evidence remain authoritative. Broader dashboard customization, CI artifact publishing, cross-run QA evaluations and Jira/Azure DevOps connectors remain separate engineering tasks; none requires inventing a hosted reportingLabs API.
