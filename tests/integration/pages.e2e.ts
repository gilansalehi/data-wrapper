import { test, expect } from '@playwright/test';

test.describe('Site pages', () => {
    test('framework page explains the positioning and loads its nav', async ({ page }) => {
        await page.goto('/framework.html');
        await page.waitForFunction(() => customElements.get('data-wrapper'));

        await expect(page.getByRole('heading', { name: '“NO”' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Where it fits' })).toBeVisible();

        await page.locator('#nav .nav-hamburger').click();

        await expect(page.locator('#nav dialog')).toHaveAttribute('open', '');
        await expect(page.locator('#nav')).toContainText('Code tour');
    });

    test('layout prototype loads the shared nav and first view', async ({ page }) => {
        await page.goto('/layout.html');
        await page.waitForFunction(() => customElements.get('data-wrapper'));

        await expect(page.getByRole('heading', { name: '“NO”' })).toBeVisible();

        await page.locator('#nav .nav-hamburger').click();

        await expect(page.locator('#nav dialog')).toHaveAttribute('open', '');
        await expect(page.locator('#nav')).toContainText('Generated docs');
    });
});
