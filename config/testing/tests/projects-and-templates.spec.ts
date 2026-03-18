import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import type { AppSession } from "./helpers/app"
import {
    closeApp,
    completeOnboardingIfNeeded,
    createQuickLyricsShow,
    createProjectFromProjectsView,
    createProjectTemplateFromProjectsView,
    createTestFolders,
    ensureProjectsView,
    launchApp,
    uniqueShowName,
} from "./helpers/app"

test.describe("Projects and templates", () => {
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
        await ensureProjectsView(window)
    })

    test.afterEach(async () => {
        await closeApp(app)
        folders.cleanup()
    })

    test("creates a new project from projects view", async () => {
        await createProjectFromProjectsView(window)
        await expect(window.locator("#projectArea")).toBeVisible({ timeout: 20_000 })
    })

    test("creates multiple project templates", async () => {
        const templatesBefore = await window.locator(".projectTemplates button").count()

        await createProjectTemplateFromProjectsView(window, uniqueShowName("E2E Template A"))
        await createProjectTemplateFromProjectsView(window, uniqueShowName("E2E Template B"))

        const templatesAfter = await window.locator(".projectTemplates button").count()
        expect(templatesAfter).toBeGreaterThanOrEqual(templatesBefore + 2)
    })

    test("creates project template and uses it to create a project", async () => {
        const templateName = uniqueShowName("E2E Template")

        await createProjectTemplateFromProjectsView(window, templateName)

        await window.locator(".projectTemplates").getByText(templateName).first().click({ timeout: 10_000 })

        const editInput = window.locator("input.edit.name").first()
        if (await editInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            const createdFromTemplateName = uniqueShowName("E2E From Template")
            await editInput.fill(createdFromTemplateName, { timeout: 10_000 })
            await editInput.press("Enter")
        }

        await expect(window.locator("#projectArea")).toBeVisible({ timeout: 20_000 })
    })

    test("converts project to template and recreates equivalent project", async () => {
        const randomId = Math.random().toString(36).slice(2, 8)
        const sourceProjectName = `E2E Project ${randomId}`
        const sourceShowName = `E2E Show ${randomId}`
        const recreatedProjectName = `E2E Recreated ${randomId}`

        // Create source project and one text-based show.
        await createProjectFromProjectsView(window)
        await createQuickLyricsShow(window, sourceShowName, "[Verse]\nline A\nline B")

        // Capture source project content for equality check.
        await expect(window.locator("#projectArea")).toBeVisible({ timeout: 20_000 })
        const sourceItems = await window.locator("#projectArea .listSection button p").allTextContents()

        // Rename source project to an explicit random name (no date tokens).
        await ensureProjectsView(window)
        const projectButtonSelector = "#projectsArea button[class*='#project_button']"
        await expect.poll(async () => window.locator(projectButtonSelector).count(), { timeout: 20_000 }).toBeGreaterThan(0)

        const sourceProjectButton = window.locator(projectButtonSelector).first()
        await expect(sourceProjectButton).toBeVisible({ timeout: 20_000 })
        await sourceProjectButton.click({ button: "right", timeout: 10_000 })

        const renameItem = window.locator(".contextMenu [role='menuitem']").filter({ hasText: /Rename/i }).first()
        await expect(renameItem).toBeVisible({ timeout: 10_000 })
        await renameItem.click({ timeout: 10_000 })

        const renameInput = window.locator("input.edit.name").first()
        await expect(renameInput).toBeVisible({ timeout: 10_000 })
        await renameInput.fill(sourceProjectName, { timeout: 10_000 })
        await renameInput.press("Enter")

        // Convert source project into template via context menu.
        const templateCountBefore = await window.locator(".projectTemplates button").count()
        const templateTextsBefore = (await window.locator(".projectTemplates button p").allTextContents()).map((text) => text.trim()).filter(Boolean)

        await ensureProjectButtonsAvailable(window, projectButtonSelector)
        await expect.poll(async () => window.locator(projectButtonSelector).count(), { timeout: 20_000 }).toBeGreaterThan(0)
        await rightClickFirstProjectWithRetry(window, projectButtonSelector)

        const convertItem = window.locator(".contextMenu [role='menuitem']").filter({ hasText: /Convert to template/i }).first()
        await expect(convertItem).toBeVisible({ timeout: 10_000 })
        await convertItem.click({ timeout: 10_000 })

        await expect.poll(async () => window.locator(".projectTemplates button").count(), { timeout: 20_000 }).toBeGreaterThan(templateCountBefore)

        const templateTextsAfter = (await window.locator(".projectTemplates button p").allTextContents()).map((text) => text.trim()).filter(Boolean)
        const newTemplateText = templateTextsAfter.find((text) => !templateTextsBefore.includes(text)) || ""

        const templateButton = newTemplateText
            ? window.locator(".projectTemplates button").filter({ hasText: newTemplateText }).first()
            : window.locator(".projectTemplates button").first()
        await expect(templateButton).toBeVisible({ timeout: 20_000 })

        // Create a new project from that template.
        await templateButton.click({ timeout: 10_000 })

        const newProjectNameInput = window.locator("input.edit.name").first()
        await expect(newProjectNameInput).toBeVisible({ timeout: 15_000 })
        await newProjectNameInput.fill(recreatedProjectName, { timeout: 10_000 })
        await newProjectNameInput.press("Enter")

        if (!(await window.locator("#projectArea").isVisible({ timeout: 2_000 }).catch(() => false))) {
            await ensureProjectsView(window)
            await ensureProjectButtonsAvailable(window, projectButtonSelector)

            const projectButtons = window.locator(projectButtonSelector)
            const count = await projectButtons.count()
            await projectButtons.nth(Math.max(0, count - 1)).click({ timeout: 10_000 })
        }

        // Verify equivalence between source and recreated project.
        await expect(window.locator("#projectArea")).toBeVisible({ timeout: 20_000 })
        const recreatedItems = await window.locator("#projectArea .listSection button p").allTextContents()

        expect(recreatedItems.length).toBe(sourceItems.length)
        expect(recreatedItems.join("\n")).toContain(sourceShowName)
        expect(sourceItems.join("\n")).toContain(sourceShowName)
    })
})

async function rightClickFirstProjectWithRetry(window: Page, selector: string, attempts = 4) {
    let lastError: unknown

    for (let i = 0; i < attempts; i++) {
        try {
            const projectButton = window.locator(selector).first()
            await projectButton.click({ button: "right", timeout: 15_000, force: true })
            return
        } catch (error) {
            lastError = error
            await window.waitForTimeout(250)
        }
    }

    throw lastError
}

async function ensureProjectButtonsAvailable(window: Page, selector: string) {
    for (let i = 0; i < 4; i++) {
        const count = await window.locator(selector).count()
        if (count > 0) return

        const backButton = window.locator(".header .left button").first()
        if (await backButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
            await backButton.click({ timeout: 10_000 })
        } else {
            await window.keyboard.press("Escape")
        }

        await window.waitForTimeout(300)
    }
}
