import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import type { AppSession } from "./helpers/app"
import {
    closeApp,
    completeOnboardingIfNeeded,
    createFolderFromProjectsView,
    createProjectFromProjectsView,
    createTestFolders,
    launchApp,
    openProjectContextMenuFromProjectsView,
} from "./helpers/app"

test.describe("Project basics", () => {
    test.describe.configure({ mode: "serial" })

    let folders: ReturnType<typeof createTestFolders>
    let window: Page
    let app: AppSession

    test.beforeEach(async () => {
        folders = createTestFolders()
        const session = await launchApp(folders)
        window = session.window
        app = session

        await completeOnboardingIfNeeded(window)
    })

    test.afterEach(async () => {
        await closeApp(app)
        folders.cleanup()
    })

    test("creates a project folder", async () => {
        await createFolderFromProjectsView(window)
        await expect(window.locator("#projectsArea .fullTree button.folder").first()).toBeVisible({ timeout: 20_000 })
    })

    test("creates multiple project folders", async () => {
        const foldersBefore = await window.locator("#projectsArea .fullTree button.folder").count()

        await createFolderFromProjectsView(window)
        await createFolderFromProjectsView(window)

        const foldersAfter = await window.locator("#projectsArea .fullTree button.folder").count()
        expect(foldersAfter).toBeGreaterThanOrEqual(foldersBefore + 2)
    })

    test("creates and opens a project from projects view", async () => {
        await createProjectFromProjectsView(window)
        await expect(window.locator("#projectArea")).toBeVisible({ timeout: 20_000 })
    })

    test("shows duplicate action in project context menu", async () => {
        await createProjectFromProjectsView(window)
        await openProjectContextMenuFromProjectsView(window)

        await expect(window.locator(".contextMenu [role='menuitem']").filter({ hasText: /Duplicate/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test("shows rename action in project context menu", async () => {
        await createProjectFromProjectsView(window)
        await openProjectContextMenuFromProjectsView(window)

        await expect(window.locator(".contextMenu [role='menuitem']").filter({ hasText: /Rename/i }).first()).toBeVisible({ timeout: 10_000 })
    })

})
