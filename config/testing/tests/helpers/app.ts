import { expect, Page, Locator, _electron as electron, ElectronApplication } from "@playwright/test"
import tmp from "tmp"

tmp.setGracefulCleanup()

export type TestFolders = {
    settingsPath: string
    dataPath: string
    cleanup: () => void
}

export type AppSession = {
    electronApp: ElectronApplication
    window: Page
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function createTestFolders(): TestFolders {
    const settingsFolder = tmp.dirSync({ unsafeCleanup: true })
    const dataFolder = tmp.dirSync({ unsafeCleanup: true })

    return {
        settingsPath: settingsFolder.name,
        dataPath: dataFolder.name,
        cleanup: () => {
            dataFolder.removeCallback()
            settingsFolder.removeCallback()
        },
    }
}

export async function launchApp(folders: TestFolders): Promise<AppSession> {
    const electronApp = await electron.launch({
        args: ["."],
        env: {
            ...process.env,
            NODE_ENV: "development",
            FS_MOCK_STORE_PATH: folders.settingsPath,
            FS_TEST_DATA_PATH: folders.dataPath,
        },
    })

    // Mock system file picker so tests run without manual interaction.
    await electronApp.evaluate(async ({ dialog }, dataPath) => {
        dialog.showOpenDialogSync = (): string[] | undefined => [dataPath]
    }, folders.dataPath)

    await wait(5_000)

    const window = await findMainWindow(electronApp)
    await window.waitForLoadState("domcontentloaded")

    return { electronApp, window }
}

export async function closeApp(session: AppSession) {
    await session.electronApp.close()
    await wait(1_000)
}

export async function completeOnboardingIfNeeded(window: Page) {
    await wait(2_000)

    const getStarted = window.getByText("Get Started!")

    if (await isVisible(getStarted, 6_000)) {
        const languageDropdownButton = window.locator(".main .dropdownElem").getByRole("button")
        if (await isVisible(languageDropdownButton, 5_000)) {
            await languageDropdownButton.click({ timeout: 10_000 })
            await window.locator(".main .dropdownElem .dropdown #id_English").click({ timeout: 10_000 })
        }

        const folderButton = window.locator(".main .showElem").getByRole("button")
        await folderButton.click({ timeout: 10_000 })
        await getStarted.click({ timeout: 15_000 })
    }

    await dismissGuideIfVisible(window)
    await expect(window.locator("#leftPanel")).toBeVisible({ timeout: 45_000 })
}

export async function dismissGuideIfVisible(window: Page) {
    const guideButtons = window.locator("#guideButtons")
    if (!(await isVisible(guideButtons, 1_500))) return

    const skipButton = guideButtons.getByText("Skip")
    if (await isVisible(skipButton, 1_500)) {
        await skipButton.click({ timeout: 10_000 })
        return
    }

    const firstButton = guideButtons.getByRole("button").first()
    if (await isVisible(firstButton, 1_500)) {
        await firstButton.click({ timeout: 10_000 })
    }
}

export async function openCreateShowPopup(window: Page) {
    const directNewShow = window.getByText("New show").first()
    if (await isVisible(directNewShow, 2_000)) {
        await directNewShow.click({ timeout: 20_000 })
        await expect(window.locator("#name")).toBeVisible({ timeout: 20_000 })
        return
    }

    const addButton = window.locator(".addButton").first()
    await addButton.click({ timeout: 20_000 })

    const addMenuFirstAction = window.locator(".addMenu button").first()
    if (await isVisible(addMenuFirstAction, 5_000)) {
        await addMenuFirstAction.click({ timeout: 20_000 })
    }

    await window.getByText("New show").first().click({ timeout: 20_000 })
    await expect(window.locator("#name")).toBeVisible({ timeout: 20_000 })
}

export async function ensureProjectsView(window: Page) {
    const projectsPanel = window.locator("#projectsArea.list.projects")
    const projectsAddButton = window.locator("#projectsArea .addButton").first()
    if ((await isVisible(projectsPanel, 1_500)) && (await isVisible(projectsAddButton, 1_500))) return

    const backButton = window.locator(".header .left button").first()
    if (await isVisible(backButton, 2_000)) {
        try {
            await backButton.click({ timeout: 10_000 })
        } catch {
            await window.keyboard.press("Escape")
        }
    } else {
        await window.keyboard.press("Escape")
    }

    await expect(projectsPanel).toBeVisible({ timeout: 20_000 })
    await expect(projectsAddButton).toBeVisible({ timeout: 20_000 })
}

export async function createProjectFromProjectsView(window: Page) {
    await ensureProjectsView(window)

    await clickWithRetry(window, "#projectsArea .addButton")

    const addMenuButtons = window.locator("#projectsArea .addMenu button")
    await expect(addMenuButtons.first()).toBeVisible({ timeout: 10_000 })

    // First entry in projects add menu is "new project".
    await addMenuButtons.first().click({ timeout: 10_000 })

    const projectArea = window.locator("#projectArea")
    if (await isVisible(projectArea, 3_000)) return

    const projectButtons = window.locator("#projectsArea .fullTree button:not(.folder)")
    await expect(projectButtons.first()).toBeVisible({ timeout: 20_000 })
    await projectButtons.first().click({ timeout: 10_000 })

    await expect(projectArea).toBeVisible({ timeout: 20_000 })
}

async function clickWithRetry(window: Page, selector: string, attempts = 4) {
    let lastError: unknown

    for (let i = 0; i < attempts; i++) {
        try {
            const locator = window.locator(selector).first()
            await locator.click({ timeout: 10_000 })
            return
        } catch (error) {
            lastError = error
            await wait(300)
        }
    }

    throw lastError
}

export async function createProjectTemplateFromProjectsView(window: Page, templateName: string) {
    await ensureProjectsView(window)

    await clickWithRetry(window, "#projectsArea .addButton")

    // Projects menu order: project, folder, template, import.
    await window.locator("#projectsArea .addMenu button").nth(2).click({ timeout: 10_000 })

    const editInput = window.locator("input.edit.name").first()
    await expect(editInput).toBeVisible({ timeout: 15_000 })
    await editInput.fill(templateName, { timeout: 10_000 })
    await editInput.press("Enter")

    const templateButton = window.locator(".projectTemplates").getByText(templateName).first()
    await expect(templateButton).toBeVisible({ timeout: 20_000 })
}

export async function createFolderFromProjectsView(window: Page) {
    await ensureProjectsView(window)

    const folderButtons = window.locator("#projectsArea .fullTree button.folder")
    const before = await folderButtons.count()

    await clickWithRetry(window, "#projectsArea .addButton")

    // Projects menu order: project, folder, template, import.
    await window.locator("#projectsArea .addMenu button").nth(1).click({ timeout: 10_000 })

    await expect.poll(async () => window.locator("#projectsArea .fullTree button.folder").count(), { timeout: 20_000 }).toBeGreaterThan(before)
}

export async function duplicateFirstProjectFromProjectsView(window: Page) {
    await ensureProjectsView(window)

    const projectButtons = window.locator("#projectsArea button[class*='#project_button']")
    const before = await projectButtons.count()
    await expect(projectButtons.first()).toBeVisible({ timeout: 20_000 })

    await projectButtons.first().click({ button: "right", timeout: 10_000, force: true })

    const duplicateItem = window.locator(".contextMenu [role='menuitem']").filter({ hasText: /Duplicate/i }).first()
    await expect(duplicateItem).toBeVisible({ timeout: 10_000 })
    await duplicateItem.click({ timeout: 10_000 })

    await expect.poll(async () => window.locator("#projectsArea button[class*='#project_button']").count(), { timeout: 20_000 }).toBeGreaterThan(before)
}

export async function renameFirstProjectFromProjectsView(window: Page, projectName: string) {
    await ensureProjectsView(window)

    const firstProject = window.locator("#projectsArea button[class*='#project_button']").first()
    await expect(firstProject).toBeVisible({ timeout: 20_000 })
    await firstProject.click({ button: "right", timeout: 10_000, force: true })

    const renameItem = window.locator(".contextMenu [role='menuitem']").filter({ hasText: /Rename/i }).first()
    await expect(renameItem).toBeVisible({ timeout: 10_000 })
    await renameItem.click({ timeout: 10_000 })

    const editInput = window.locator("input.edit.name").first()
    await expect(editInput).toBeVisible({ timeout: 10_000 })
    await editInput.fill(projectName, { timeout: 10_000 })
    await editInput.press("Enter")

    await expect(window.locator("#projectsArea button[class*='#project_button']").filter({ hasText: projectName }).first()).toBeVisible({ timeout: 20_000 })
}

export async function openProjectContextMenuFromProjectsView(window: Page) {
    await ensureProjectsView(window)

    const firstProject = window.locator("#projectsArea button[class*='#project_button'], #projectsArea .fullTree button:not(.folder), #projectsArea button[title*='id_select_project']").first()
    await expect(firstProject).toBeVisible({ timeout: 20_000 })
    await firstProject.click({ button: "right", timeout: 10_000, force: true })
}

export async function openImportPopupFromProjectsView(window: Page) {
    await ensureProjectsView(window)

    const addButton = window.locator("#projectsArea .addButton").first()
    await addButton.click({ timeout: 10_000 })

    const menuButtons = window.locator("#projectsArea .addMenu button")
    await expect(menuButtons.first()).toBeVisible({ timeout: 10_000 })

    // Projects menu order: project, folder, template, import.
    await menuButtons.last().click({ timeout: 10_000 })

    await expect(window.getByAltText("pdf-logo").first()).toBeVisible({ timeout: 20_000 })
}

export async function addSectionInActiveProject(window: Page) {
    await ensureActiveProjectArea(window)

    let addButton = window.locator("#projectArea .addButton").first()
    await expect(addButton).toBeVisible({ timeout: 20_000 })

    const sections = window.locator("#projectArea button.section")
    const before = await sections.count()

    await addButton.click({ timeout: 10_000 })

    const menuButtons = window.locator("#projectArea .addMenu button")
    await expect(menuButtons.first()).toBeVisible({ timeout: 10_000 })

    // Last button in project content add menu is always section.
    await menuButtons.last().click({ timeout: 10_000 })

    await expect.poll(async () => window.locator("#projectArea button.section").count(), { timeout: 20_000 }).toBeGreaterThan(before)
}

export async function openImportPopupFromActiveProject(window: Page) {
    await ensureActiveProjectArea(window)

    let addButton = window.locator("#projectArea .addButton").first()
    await expect(addButton).toBeVisible({ timeout: 20_000 })

    await addButton.click({ timeout: 10_000 })

    const menuButtons = window.locator("#projectArea .addMenu button")
    await expect(menuButtons.first()).toBeVisible({ timeout: 10_000 })

    const menuCount = await menuButtons.count()
    await menuButtons.nth(Math.max(0, menuCount - 2)).click({ timeout: 10_000 })

    await expect(window.getByAltText("pdf-logo").first()).toBeVisible({ timeout: 20_000 })
}

async function ensureActiveProjectArea(window: Page) {
    const projectArea = window.locator("#projectArea")
    if (await isVisible(projectArea, 2_000)) return

    await createQuickLyricsShow(window, uniqueShowName("E2E Seed"), "[Verse]\nseed line")
    await expect(projectArea).toBeVisible({ timeout: 20_000 })
}

export async function createQuickLyricsShow(window: Page, showName: string, lyrics: string) {
    await openCreateShowPopup(window)
    await window.locator("#name").fill(showName, { timeout: 10_000 })
    const lyricsBox = window.getByPlaceholder("[Verse]")
    if (!(await isVisible(lyricsBox, 1_500))) {
        const textOption = window.getByRole("button", { name: /Quick lyrics|Paste text/i }).first()
        await textOption.click({ timeout: 10_000, force: true })
    }

    await expect(lyricsBox).toBeVisible({ timeout: 10_000 })
    await lyricsBox.focus({ timeout: 10_000 })
    await lyricsBox.fill(lyrics, { timeout: 10_000 })

    await window.getByTestId("create.show.popup.new.show").click({ timeout: 10_000 })
    await expect(window.locator("#group").first()).toBeVisible({ timeout: 20_000 })
}

export async function saveShowFromContextMenu(window: Page) {
    await window.keyboard.press("Control+S")
    await wait(2_000)
}

export function uniqueShowName(prefix: string) {
    return `${prefix} ${new Date().toISOString().replace(/[.:]/g, "-")}`
}

async function isVisible(locator: Locator, timeout = 2_000) {
    try {
        return await locator.first().isVisible({ timeout })
    } catch {
        return false
    }
}

async function findMainWindow(electronApp: ElectronApplication): Promise<Page> {
    const deadline = Date.now() + 45_000

    while (Date.now() < deadline) {
        const windows = electronApp.windows()
        for (const window of windows.reverse()) {
            if (await looksLikeMainWindow(window)) {
                return window
            }
        }

        await wait(500)
    }

    return electronApp.firstWindow()
}

async function looksLikeMainWindow(window: Page): Promise<boolean> {
    return (await isVisible(window.locator("#leftPanel"), 500)) || (await isVisible(window.getByText("Get Started!"), 500)) || (await isVisible(window.locator(".main .showElem"), 500))
}
