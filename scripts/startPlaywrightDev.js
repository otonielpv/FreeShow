const { spawn, spawnSync, execSync } = require("child_process")
const path = require("path")

process.env.NODE_ENV = "development"
process.env.VITE_E2E_DISABLE_PROVIDER_SYNC = "1"

const root = path.join(__dirname, "..")

function runStep(command, args, label) {
    console.log(`[playwright-dev] ${label}...`)

    const result = spawnSync(command, args, {
        stdio: "inherit",
        shell: true,
        cwd: root,
        env: process.env,
    })

    if (result.status !== 0) {
        console.error(`[playwright-dev] Failed: ${label}`)
        process.exit(result.status || 1)
    }
}

try {
    execSync("npx kill-port 3000", { stdio: "pipe", cwd: root })
} catch {
    // Port may already be free.
}

runStep("node", ["scripts/preBuild.js"], "prebuild")
runStep("node", ["scripts/vite/createServerFiles.js"], "build server files")
runStep("npm", ["run", "build:electron:dev"], "build electron dev")
runStep("node", ["scripts/electronDevPostBuild.js"], "prepare preload map")

console.log("[playwright-dev] Starting Vite dev server...")
const vite = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "3000"], {
    stdio: "inherit",
    shell: true,
    cwd: root,
    env: process.env,
})

function shutdown(signal) {
    console.log(`[playwright-dev] Received ${signal}. Shutting down...`)
    vite.kill()
    process.exit(0)
}

vite.on("error", (error) => {
    console.error("[playwright-dev] Failed to start Vite:", error)
    process.exit(1)
})

vite.on("exit", (code) => {
    if (code && code !== 0) {
        console.error(`[playwright-dev] Vite exited with code ${code}`)
        process.exit(code)
    }
})

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
