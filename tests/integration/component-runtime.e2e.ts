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

test.describe('Loaded component lifecycle', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tests/fixtures/component-lifecycle.html');
        await expect(page.locator('[data-output="status"]')).toHaveText('mounted');
    });

    test('mounts after wake and destroys the previous runtime before reload', async ({ page }) => {
        const component = page.locator('#component');

        await expect(component).toHaveAttribute('data-mounts', '1');
        await page.locator('#component').evaluate((wrapper: HTMLElement & {
            load(src: string): Promise<void>;
        }) => wrapper.load('/tests/fixtures/component-lifecycle-view.html'));

        await expect(component).toHaveAttribute('data-cleaned', 'yes');
        await expect(component).toHaveAttribute('data-destroyed', 'yes');
        await expect(component).toHaveAttribute('data-mounts', '2');
        await expect(component.locator('[data-output="status"]')).toHaveText('mounted');
    });

    test('destroys the runtime when its wrapper disconnects', async ({ page }) => {
        const state = await page.locator('#component').evaluate(async wrapper => {
            wrapper.remove();
            await new Promise(resolve => setTimeout(resolve, 0));
            return { ...((wrapper as HTMLElement).dataset) };
        });

        expect(state.cleaned).toBe('yes');
        expect(state.destroyed).toBe('yes');
    });

    test('recreates a manually loaded component after reconnect', async ({ page }) => {
        const component = page.locator('#component');

        await component.evaluate(wrapper => {
            wrapper.removeAttribute('src');
            const parent = wrapper.parentElement!;
            wrapper.remove();
            parent.appendChild(wrapper);
        });

        await expect(component).toHaveAttribute('data-cleaned', 'yes');
        await expect(component).toHaveAttribute('data-destroyed', 'yes');
        await expect(component).toHaveAttribute('data-mounts', '2');
        await expect(component.locator('[data-output="status"]')).toHaveText('mounted');
    });
});
