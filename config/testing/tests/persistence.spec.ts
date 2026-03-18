import { expect, test } from "@playwright/test"
import fs from "fs"
import path from "path"
import { closeApp, completeOnboardingIfNeeded, createQuickLyricsShow, createTestFolders, launchApp, saveShowFromContextMenu, uniqueShowName } from "./helpers/app"

test.skip("show data persists after app restart", async () => {
    const folders = createTestFolders()
    const initialCount = getShowsCount(folders.settingsPath)
    const showName = uniqueShowName("E2E Persisted Show")
    const lyrics = `[Verse]\npersist line 1\npersist line 2\n\n[Chorus]\npersist line 3\npersist line 4`

    const firstSession = await launchApp(folders)
    try {
        await completeOnboardingIfNeeded(firstSession.window)
        await createQuickLyricsShow(firstSession.window, showName, lyrics)
        await saveShowFromContextMenu(firstSession.window)
    } finally {
        await closeApp(firstSession)
    }

    await expect.poll(() => getShowsCount(folders.settingsPath), { timeout: 20_000 }).toBeGreaterThan(initialCount)
    const afterFirstCloseCount = getShowsCount(folders.settingsPath)

    const secondSession = await launchApp(folders)
    try {
        await completeOnboardingIfNeeded(secondSession.window)
    } finally {
        await closeApp(secondSession)
    }

    await expect.poll(() => getShowsCount(folders.settingsPath), { timeout: 20_000 }).toBeGreaterThanOrEqual(afterFirstCloseCount)
    folders.cleanup()
})

function getShowsCount(settingsPath: string): number {
    const showsPath = path.join(settingsPath, "shows.json")
    if (!fs.existsSync(showsPath)) return 0

    try {
        const content = fs.readFileSync(showsPath, "utf8")
        const parsed = JSON.parse(content || "{}")
        if (!parsed || typeof parsed !== "object") return 0
        return Object.keys(parsed).length
    } catch {
        return 0
    }
}
