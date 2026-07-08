import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    testMatch: /.*\.pw\.ts/,
    reporter: 'list',
    use: {
        baseURL: 'http://example.test',
        browserName: 'chromium',
    },
});
