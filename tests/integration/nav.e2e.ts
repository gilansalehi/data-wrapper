import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Nav sidebar', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    test('dialog is closed on load (data-nav-open="false")', async ({ page }) => {
        await expect(page.locator('#nav')).toHaveAttribute('data-nav-open', 'false');
        await expect(page.locator('#nav dialog')).not.toHaveAttribute('open');
    });

    test('clicking hamburger sets data-nav-open="true"', async ({ page }) => {
        await page.locator('.nav-hamburger').click();

        await expect(page.locator('#nav')).toHaveAttribute('data-nav-open', 'true');
        await expect(page.locator('#nav dialog')).toHaveAttribute('open', '');
    });

    test('hamburger lines animate to X when open', async ({ page }) => {
        await page.locator('.nav-hamburger').click();

        await expect(page.locator('.nav-hamburger hr').nth(1)).toHaveCSS('opacity', '0');
        await expect.poll(async () =>
            page.locator('.nav-hamburger hr').first().evaluate(el => getComputedStyle(el).transform)
        ).not.toBe('none');
    });
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
