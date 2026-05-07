import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Todos demo', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    test.skip('renders seed todos on load', async () => {});
    test.skip('adds a new todo via the form', async () => {});
    test.skip('clears the input after adding', async () => {});
    test.skip('marks a todo done by checking the checkbox', async () => {});
    test.skip('applies .done class to completed item', async () => {});
    test.skip('removes a todo when ✕ is clicked', async () => {});
    test.skip('shows empty-state message when list is empty', async () => {});
    test.skip('All filter shows all todos', async () => {});
    test.skip('Active filter hides done todos', async () => {});
    test.skip('Done filter shows only done todos', async () => {});
    test.skip('active count reflects undone items', async () => {});
    test.skip('data-filter attribute updates when filter button is clicked', async () => {});
    test.skip('filter button is visually active via CSS attribute selector', async () => {});

    test('has no critical a11y violations', async ({ page }) => {
        const results = await new AxeBuilder({ page })
            .include('#app')
            .analyze();
        expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
    });
});
