import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { closeApp, completeOnboardingIfNeeded, createQuickLyricsShow, createTestFolders, launchApp, saveShowFromContextMenu, uniqueShowName } from "./helpers/app"
import type { AppSession } from "./helpers/app"

test.describe("Show editing", () => {
    test.describe.configure({ mode: "serial" })

    const folders = createTestFolders()
    let window: Page
    let app: AppSession

    test.beforeAll(async () => {
        const session = await launchApp(folders)
        window = session.window
        app = session

        await completeOnboardingIfNeeded(window)

        const showName = uniqueShowName("E2E Editable Show")
        const lyrics = `[Verse]\nedit line 1\nedit line 2\n\n[Chorus]\nedit line 3\nedit line 4`
        await createQuickLyricsShow(window, showName, lyrics)
    })

    test.afterAll(async () => {
        await closeApp(app)
        folders.cleanup()
    })

    test("renders editable slide group blocks", async () => {
        const groups = window.locator("#group")

        await expect(groups.first()).toBeVisible({ timeout: 10_000 })
        expect(await groups.count()).toBeGreaterThan(0)

        await groups.first().click({ timeout: 10_000 })
        await expect(groups.first()).toBeVisible({ timeout: 10_000 })
    })

    test("saves via the app context menu", async () => {
        await saveShowFromContextMenu(window)
        await expect(window.locator("#leftPanel")).toBeVisible({ timeout: 10_000 })
    })
})
