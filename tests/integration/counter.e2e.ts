import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Counter demo', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    test('displays initial count of 0', async ({ page }) => {
        await expect(page.locator('#counter .count-display')).toHaveText('0');
    });

    test('increments count when + is clicked', async ({ page }) => {
        await page.locator('#counter button').filter({ hasText: '+' }).click();

        await expect(page.locator('#counter .count-display')).toHaveText('1');
    });

    test('decrements count when − is clicked', async ({ page }) => {
        await page.locator('#counter button').filter({ hasText: '−' }).click();

        await expect(page.locator('#counter .count-display')).toHaveText('-1');
    });

    test('updates data-count attribute on the wrapper', async ({ page }) => {
        await page.locator('#counter button').filter({ hasText: '+' }).click();

        await expect(page.locator('#counter')).toHaveAttribute('data-count', '1');
    });

    test('output element reflects state in real-time', async ({ page }) => {
        await page.locator('#counter').evaluate(el => {
            (el as HTMLElement & { put(key: string, val: unknown): void }).put('count', 7);
        });

        await expect(page.locator('#counter output')).toHaveText('7');
    });

    test('the HTML listing is populated from the live demo via *source', async ({ page }) => {
        const listing = page.locator('#how-to details pre code').first();

        await expect(listing).toContainText('data-wrapper id="counter"');
        await expect(listing).toContainText('@click="count/inc"');
        // *source strips the framework's own wake residue from the snapshot.
        await expect(listing).not.toContainText('_live');
    });

    test('has no critical a11y violations', async ({ page }) => {
        const results = await new AxeBuilder({ page })
            .include('#counter')
            .analyze();
        expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
    });
});
