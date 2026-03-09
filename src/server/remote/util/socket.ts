import { io } from "socket.io-client"
import { _get, _update } from "./stores"
import { receiver, ReceiverKey } from "./receiver"

const socket = io()
let id: string = ""
let diagnosticsInstalled = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function sendClientLog(source: string, level: "info" | "warn" | "error", message: string, extra: Record<string, any> = {}) {
    try {
        socket.emit("REMOTE", {
            id,
            channel: "CLIENT_LOG",
            data: {
                source,
                level,
                message: String(message || ""),
                extra,
                timestamp: Date.now(),
                href: typeof window !== "undefined" ? window.location.href : ""
            }
        })
    } catch {
        // Do not throw from logger path.
    }
}

function installDiagnostics() {
    if (diagnosticsInstalled || typeof window === "undefined") return
    diagnosticsInstalled = true

    window.addEventListener("error", (event) => {
        const error = event.error as any
        sendClientLog("window.error", "error", event.message || error?.message || "Unknown error", {
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
            stack: error?.stack || null
        })
    })

    window.addEventListener("unhandledrejection", (event) => {
        const reason: any = event.reason
        sendClientLog("unhandledrejection", "error", reason?.message || String(reason || "Unhandled rejection"), {
            stack: reason?.stack || null
        })
    })

    window.addEventListener("beforeunload", () => {
        sendClientLog("window.beforeunload", "warn", "Remote page unloading")
    })
}

function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer)

    heartbeatTimer = setInterval(() => {
        sendClientLog("heartbeat", "info", "alive", {
            connected: socket.connected,
            readyState: document.readyState,
            visibility: typeof document !== "undefined" ? document.visibilityState : "unknown"
        })
    }, 2000)
}

function stopHeartbeat() {
    if (!heartbeatTimer) return
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
}

export function initSocket() {
    installDiagnostics()

    socket.on("connect", () => {
        id = socket.id || ""
        console.log("Connected with id:", id)
        sendClientLog("socket.connect", "info", "Remote client connected")
        startHeartbeat()

        // try accessing with saved password
        const SAVED_PASSWORD = localStorage.password
        if (SAVED_PASSWORD) {
            _update("password", "remember", true)
            _update("password", "stored", SAVED_PASSWORD)
            send("ACCESS", SAVED_PASSWORD)
            return
        }

        // check if there is a password!
        send("PASSWORD")
    })

    socket.on("connect_error", (error: any) => {
        sendClientLog("socket.connect_error", "error", error?.message || "connect_error", {
            stack: error?.stack || null
        })
    })

    socket.on("disconnect", (reason: string) => {
        sendClientLog("socket.disconnect", "warn", "Remote client disconnected", { reason })
        stopHeartbeat()
    })

    socket.on("REMOTE", (msg: any) => {
        let key = msg.channel as ReceiverKey
        if (!receiver[key]) {
            if (msg.data !== null) console.log("Unhandled message:", msg)
            return
        }

        if (!_get("isConnected")) {
            const UNCONNECTED_ALLOWED_KEYS = ["PASSWORD", "ERROR", "ACCESS", "LANGUAGE"]
            if (!UNCONNECTED_ALLOWED_KEYS.includes(key)) return
        }

        receiver[key](msg.data)
    })
}

export const send = (channel: string, data: any = null) => socket.emit("REMOTE", { id, channel, data })
