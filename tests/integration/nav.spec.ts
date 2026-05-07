import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Nav sidebar', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    test.skip('dialog is closed on load (data-nav-open="false")', async () => {});
    test.skip('clicking hamburger sets data-nav-open="true"', async () => {});
    test.skip('hamburger lines animate to X when open', async () => {});
    test.skip('clicking backdrop closes the nav', async () => {});
    test.skip('clicking ✕ button closes the nav', async () => {});
    test.skip('clicking a nav link closes the nav', async () => {});
    test.skip('clicking a nav link scrolls to the correct section', async () => {});
    test.skip('theme toggle switches data-theme between light and dark', async () => {});
    test.skip('dark theme applies --bg variable change to body', async () => {});

    test('has no critical a11y violations when open', async ({ page }) => {
        await page.click('.nav-hamburger');
        const results = await new AxeBuilder({ page })
            .include('#nav')
            .analyze();
        expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
    });
});
