import { test, expect } from '@playwright/test';

test.describe('Formatter gallery', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => customElements.get('data-wrapper'));
    });

    const output = (page: import('@playwright/test').Page, index: number) =>
        page.locator('#fmt-demo .fmt-output').nth(index);

    const cases = [
        ['currency', 0, '$9.99'],
        ['upper',    1, 'HELLO WORLD'],
        ['lower',    2, '  hello world  '],
        ['trim',     3, 'hello world'],
        ['count',    5, '5'],
        ['bool',     6, 'true'],
        ['yesno',    7, 'yes'],
        ['onoff',    8, 'on'],
        ['json',    10, '[\n  1,\n  2,\n  3,\n  4,\n  5\n]'],
        ['fallback', 11, '—'],
    ] as const;

    for (const [formatter, index, expected] of cases) {
        test(`${formatter} renders correct output`, async ({ page }) => {
            await expect(output(page, index)).toHaveText(expected);
        });
    }

    test('chained trim+upper produces "HELLO WORLD"', async ({ page }) => {
        await expect(output(page, 4)).toHaveText('HELLO WORLD');
    });

    test('modifying data-* attribute in DevTools re-runs formatters', async ({ page }) => {
        await page.locator('#fmt-demo').evaluate(el => {
            (el as HTMLElement).dataset.label = '  changed value  ';
        });

        await expect(output(page, 4)).toHaveText('CHANGED VALUE');
    });
});
