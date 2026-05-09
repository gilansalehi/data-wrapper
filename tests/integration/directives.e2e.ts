import { test, expect } from '@playwright/test';

test.describe('Directive demos', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    test('wrapper-scoped *if mounts and removes the toggle note', async ({ page }) => {
        const toggle = page.locator('#toggle');
        const note   = toggle.locator('p.note');

        await expect(note).toHaveCount(0);

        await toggle.getByRole('button', { name: 'Toggle' }).click();
        await expect(note).toHaveText('This node exists only while data-on="true".');

        await toggle.getByRole('button', { name: 'Toggle' }).click();
        await expect(note).toHaveCount(0);
    });

    test('row-scoped *if shows done badges only for completed todos', async ({ page }) => {
        const row = (text: string) => page.locator('#app .todo-item').filter({ hasText: text });

        await expect(row('Master the DOM').locator('.done-badge')).toHaveText('done');
        await expect(row('Ship data-wrapper').locator('.done-badge')).toHaveCount(0);

        await row('Ship data-wrapper').locator('input[type="checkbox"]').check();
        await expect(row('Ship data-wrapper').locator('.done-badge')).toHaveText('done');
    });
});
