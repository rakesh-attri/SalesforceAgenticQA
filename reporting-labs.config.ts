import type { SafeReportingLabsOptions } from './src/integrations/reporting-labs-reporter.js';
// Public configuration contains no maskValues/credentials. The adapter derives
// masking privately at runtime. reporting-labs/auto is intentionally not imported.
export default {outputFolder:'artifacts/reporting-labs',validation:'local-fixture'} satisfies SafeReportingLabsOptions;
