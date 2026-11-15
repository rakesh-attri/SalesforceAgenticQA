import { defineConfig, devices } from '@playwright/test';
import reportingLabs from './reporting-labs.config.js';
if (process.argv.some(arg => ['--headed', '--ui', '--debug'].includes(arg)) || (process.env.PWDEBUG && process.env.PWDEBUG !== '0')) {
  throw new Error('This framework runs headless only');
}
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: process.env.SFQA_BROWSER_STATE || undefined,
  },
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }], ['./src/integrations/history-reporter.ts'],...(process.env.SFQA_REPORTING_LABS==='0'?[]:[['./src/integrations/reporting-labs-reporter.ts',reportingLabs] as [string,typeof reportingLabs]])],
  webServer: {
    command: 'tsx fixtures/demo-server.ts',
    url: 'http://127.0.0.1:8765/health',
    reuseExistingServer: !process.env.CI,
  },
});
