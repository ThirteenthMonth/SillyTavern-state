const { test, expect } = require('@playwright/test');
const path = require('node:path');
const sourceRoot = process.env.STATE_TEST_SOURCE || path.join(__dirname, '..');

test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => { throw error; });
});

async function boot(page) {
    await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1">');
    await page.evaluate(() => {
        const context = {
            chatMetadata: {}, chat: [], saveMetadata() {},
            eventSource: { on() {}, off() {} }, event_types: {},
        };
        window.SillyTavern = { getContext: () => context };
    });
    await page.addStyleTag({ path: path.join(sourceRoot, 'style.css') });
    await page.addScriptTag({ type: 'module', path: path.join(sourceRoot, 'index.js') });
}

async function contained(page) {
    await expect.poll(() => page.locator('#stateExtPanel').evaluate(el => {
        const r = el.getBoundingClientRect();
        const v = window.visualViewport;
        return r.width > 0 && r.height > 0 && r.left >= v.offsetLeft - 1 &&
            r.top >= v.offsetTop - 1 && r.right <= v.offsetLeft + v.width + 1 &&
            r.bottom <= v.offsetTop + v.height + 1;
    })).toBe(true);
}

for (const width of [320, 390, 579, 1280]) {
    test(`first click, dragging, reopening and resizing at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await boot(page);
        const panel = page.locator('#stateExtPanel');
        const toggle = page.locator('#stateExtToggleBtn');
        await expect(panel).toBeHidden();
        await toggle.click();
        await expect(panel).toBeVisible();
        await contained(page);
        const header = await panel.locator('.header').boundingBox();
        await page.mouse.move(header.x + 10, header.y + 5);
        await page.mouse.down();
        await page.mouse.move(width - 2, 795, { steps: 5 });
        await page.mouse.up();
        await contained(page);
        for (let i = 0; i < 3; i++) {
            await toggle.click();
            await expect(panel).toBeHidden();
            await toggle.click();
            await contained(page);
        }
        await page.locator('#stateExtInput').fill(Array.from({ length: 35 }, (_, i) => `State${i} ${'long'.repeat(40)}`).join('\n'));
        await page.locator('#stateExtAddBtn').click();
        await contained(page);
        await expect(panel.locator('li')).toHaveCount(35);
        for (const size of [{ width: 800, height: 320 }, { width: 320, height: 640 }, { width: 320, height: 240 }, { width: 1280, height: 800 }]) {
            await page.setViewportSize(size);
            await contained(page);
        }
        await page.screenshot({ path: `test-results/panel-${width}.png` });
        await page.addScriptTag({ type: 'module', path: path.join(sourceRoot, 'index.js') });
        await expect(panel).toHaveCount(1);
        await toggle.click();
        await contained(page);
    });
}

test('touch drag remains inside the mobile viewport', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await boot(page);
    await page.locator('#stateExtToggleBtn').tap();
    const r = await page.locator('#stateExtPanel .header').boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + 20, y: r.y + 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x + 20, y: 100 }] });
    await expect.poll(async () => (await page.locator('#stateExtPanel').boundingBox()).y).toBeLessThan(150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 388, y: 840 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await contained(page);
    await page.screenshot({ path: 'test-results/mobile-touch.png' });
    await context.close();
});

test('mobile drawer width includes padding and borders', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await boot(page);
    // Isolate the CSS regression from the separate first-click bug.
    await page.locator('#stateExtPanel').evaluate(el => { el.style.display = 'block'; });
    await contained(page);
});
