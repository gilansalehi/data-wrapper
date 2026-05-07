import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Counter demo', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    test.skip('displays initial count of 0', async () => {});
    test.skip('increments count when + is clicked', async () => {});
    test.skip('decrements count when − is clicked', async () => {});
    test.skip('updates data-count attribute on the wrapper', async () => {});
    test.skip('output element reflects state in real-time', async () => {});

    test('has no critical a11y violations', async ({ page }) => {
        const results = await new AxeBuilder({ page })
            .include('#counter')
            .analyze();
        expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
    });
});
