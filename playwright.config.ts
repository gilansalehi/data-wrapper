import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir:       './tests/integration',
    testMatch:     '**/*.spec.ts',
    fullyParallel: true,
    forbidOnly:    !!process.env.CI,
    retries:       process.env.CI ? 2 : 0,
    reporter:      [['html', { open: 'never' }]],

    use: {
        baseURL: 'http://localhost:3000',
        trace:   'on-first-retry',
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome']  } },
        { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit',   use: { ...devices['Desktop Safari']  } },
    ],

    webServer: {
        command:            'bun serve.ts',
        url:                'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
    },
});
