import { defineConfig } from "@playwright/test"

const configuredWorkers = Number.parseInt(process.env.FS_E2E_WORKERS || "1", 10)
const workers = Number.isNaN(configuredWorkers) || configuredWorkers < 1 ? 1 : configuredWorkers

export default defineConfig({
    testDir: "./tests",
    fullyParallel: false,
    workers,
    timeout: 120_000,
    expect: {
        timeout: 15_000,
    },
    reporter: [[process.env.CI ? "html" : "line", { outputFolder: "test-output/playwright-report" }]],
    outputDir: "test-output/playwright-artifacts",
    webServer: {
        command: "node ../../scripts/startPlaywrightDev.js",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
    use: {
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        video: "retain-on-failure",
    },
})
