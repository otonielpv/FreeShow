import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { closeApp, completeOnboardingIfNeeded, createQuickLyricsShow, createTestFolders, launchApp, openCreateShowPopup, uniqueShowName } from "./helpers/app"
import type { AppSession } from "./helpers/app"

test.describe("Project and show creation", () => {
    test.describe.configure({ mode: "serial" })

    const folders = createTestFolders()
    let window: Page
    let app: AppSession

    test.beforeAll(async () => {
        const session = await launchApp(folders)
        window = session.window
        app = session
        await completeOnboardingIfNeeded(window)
    })

    test.afterAll(async () => {
        await closeApp(app)
        folders.cleanup()
    })

    test("opens create show popup from project actions", async () => {
        await openCreateShowPopup(window)
        await expect(window.getByText("Quick Lyrics")).toBeVisible({ timeout: 10_000 })
    })

    test("creates a show from quick lyrics", async () => {
        const showName = uniqueShowName("E2E Quick Lyrics")
        const lyrics = `[Verse]\nline one\nline two\n\n[Chorus]\nline three\nline four`

        await createQuickLyricsShow(window, showName, lyrics)
        const groups = window.locator("#group")

        await expect(window.getByText(showName).first()).toBeVisible({ timeout: 20_000 })
        await expect(groups.first()).toBeVisible({ timeout: 20_000 })
        expect(await groups.count()).toBeGreaterThan(0)
        expect(await groups.count()).toBeGreaterThanOrEqual(2)
    })
})
