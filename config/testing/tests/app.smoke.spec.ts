import { expect, test } from "@playwright/test"
import { closeApp, completeOnboardingIfNeeded, createTestFolders, launchApp } from "./helpers/app"

test("app starts and reaches main workspace", async () => {
    const folders = createTestFolders()
    const session = await launchApp(folders)

    try {
        await completeOnboardingIfNeeded(session.window)

        await expect(session.window.locator("#leftPanel")).toBeVisible({ timeout: 30_000 })
        await expect(session.window.locator(".top").first()).toContainText("FreeShow")
    } finally {
        await closeApp(session)
        folders.cleanup()
    }
})
