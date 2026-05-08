import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Todos demo', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    const list = (page: import('@playwright/test').Page) => page.locator('#app .todo-list');
    const items = (page: import('@playwright/test').Page) => page.locator('#app .todo-item');
    const row = (page: import('@playwright/test').Page, text: string) =>
        page.locator('#app .todo-item').filter({ hasText: text });
    const filterButton = (page: import('@playwright/test').Page, value: string) =>
        page.locator(`#app .filter-btns button[data-val="${value}"]`);

    test('renders seed todos on load', async ({ page }) => {
        await expect(items(page)).toHaveCount(3);
        await expect(list(page)).toContainText('Master the DOM');
        await expect(list(page)).toContainText('Ship data-wrapper');
        await expect(list(page)).toContainText('Write the docs');
    });

    test('adds a new todo via the form', async ({ page }) => {
        await page.locator('#app input[name="task"]').fill('Cover browser behavior');
        await page.locator('#app form button[type="submit"]').click();

        await expect(row(page, 'Cover browser behavior')).toHaveCount(1);
        await expect(items(page)).toHaveCount(4);
    });

    test('clears the input after adding', async ({ page }) => {
        const input = page.locator('#app input[name="task"]');
        await input.fill('Clear after add');
        await page.locator('#app form button[type="submit"]').click();

        await expect(input).toHaveValue('');
    });

    test('marks a todo done by checking the checkbox', async ({ page }) => {
        const todo = row(page, 'Ship data-wrapper');

        await todo.locator('input[type="checkbox"]').check();

        await expect(todo.locator('input[type="checkbox"]')).toBeChecked();
    });

    test('applies .done class to completed item', async ({ page }) => {
        const todo = row(page, 'Ship data-wrapper');

        await todo.locator('input[type="checkbox"]').check();

        await expect(todo).toHaveClass(/done/);
    });

    test('removes a todo when ✕ is clicked', async ({ page }) => {
        await row(page, 'Ship data-wrapper').locator('.delete-btn').click();

        await expect(row(page, 'Ship data-wrapper')).toHaveCount(0);
        await expect(items(page)).toHaveCount(2);
    });

    test('shows empty-state message when list is empty', async ({ page }) => {
        while (await page.locator('#app .delete-btn').count()) {
            await page.locator('#app .delete-btn').first().click();
        }

        await expect(page.locator('#app .dw-empty-msg')).toHaveText('No tasks yet. Add one above.');
    });

    test('All filter shows all todos', async ({ page }) => {
        await filterButton(page, 'active').click();
        await filterButton(page, 'all').click();

        await expect(items(page)).toHaveCount(3);
    });

    test('Active filter hides done todos', async ({ page }) => {
        await filterButton(page, 'active').click();

        await expect(items(page)).toHaveCount(2);
        await expect(list(page)).not.toContainText('Master the DOM');
        await expect(list(page)).toContainText('Ship data-wrapper');
    });

    test('Done filter shows only done todos', async ({ page }) => {
        await filterButton(page, 'done').click();

        await expect(items(page)).toHaveCount(1);
        await expect(list(page)).toContainText('Master the DOM');
        await expect(list(page)).not.toContainText('Ship data-wrapper');
    });

    test('active count reflects undone items', async ({ page }) => {
        await expect(page.locator('#app .controls strong')).toHaveText('2');

        await row(page, 'Ship data-wrapper').locator('input[type="checkbox"]').check();

        await expect(page.locator('#app .controls strong')).toHaveText('1');
    });

    test('data-filter attribute updates when filter button is clicked', async ({ page }) => {
        await filterButton(page, 'done').click();

        await expect(page.locator('#app')).toHaveAttribute('data-filter', 'done');
    });

    test('filter button is visually active via CSS attribute selector', async ({ page }) => {
        const done = filterButton(page, 'done');

        await done.click();

        await expect(done).toHaveCSS('font-weight', '700');
        await expect(done).toHaveCSS('text-decoration-line', 'underline');
    });

    test('has no critical a11y violations', async ({ page }) => {
        const results = await new AxeBuilder({ page })
            .include('#app')
            .analyze();
        expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
    });
});
