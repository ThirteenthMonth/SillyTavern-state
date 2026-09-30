const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    use: { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', screenshot: 'only-on-failure' },
});
