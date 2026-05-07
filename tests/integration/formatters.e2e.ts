import { test, expect } from '@playwright/test';

test.describe('Formatter gallery', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    const cases = [
        ['currency', '$9.99'],
        ['upper',    'HELLO WORLD'],
        ['lower',    'hello world'],
        ['trim',     'hello world'],
        ['count',    '5'],
        ['bool',     'true'],
        ['yesno',    'yes'],
        ['onoff',    'on'],
        ['json',     '['],
        ['fallback', '—'],
    ] as const;

    for (const [formatter] of cases) {
        test.skip(`${formatter} renders correct output`, async () => {});
    }

    test.skip('chained trim+upper produces "HELLO WORLD"', async () => {});
    test.skip('modifying data-* attribute in DevTools re-runs formatters', async () => {});
});
