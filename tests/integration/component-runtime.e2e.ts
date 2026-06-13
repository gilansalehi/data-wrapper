import { test, expect } from '@playwright/test';

test.describe('Loaded component modules', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tests/fixtures/component-counter.html');
        await page.waitForFunction(() =>
            [...document.querySelectorAll('data-wrapper')]
                .every(wrapper => wrapper.querySelector('[data-output="count"]'))
        );
    });

    test('binds live exports and computed readers to scalar sinks', async ({ page }) => {
        const first = page.locator('#first');

        await expect(first.locator('[data-output="count"]')).toHaveText('0');
        await expect(first.locator('[data-output="doubled"]')).toHaveText('0');

        await first.getByRole('button', { name: 'Increment' }).click();

        await expect(first.locator('[data-output="count"]')).toHaveText('1');
        await expect(first.locator('[data-output="doubled"]')).toHaveText('2');
    });

    test('creates a fresh inline module instance for each loaded root', async ({ page }) => {
        const first  = page.locator('#first');
        const second = page.locator('#second');

        await first.getByRole('button', { name: 'Increment' }).click();

        await expect(first.locator('[data-output="count"]')).toHaveText('1');
        await expect(second.locator('[data-output="count"]')).toHaveText('0');
    });

    test('removes the component module script from rendered DOM', async ({ page }) => {
        await expect(page.locator('script[data-component]')).toHaveCount(0);
    });
});
