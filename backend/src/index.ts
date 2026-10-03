import express from "express";
import http from "node:http";
import { Server, type Socket } from "socket.io";
import { UserManager } from "./managers/UserManager.js";
import { RELAY_EVENTS, type RelayEvent } from "./types.js";

const PORT = Number(process.env.PORT ?? 3000);
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const MAX_NAME_LENGTH = 24;
const MAX_SDP_LENGTH = 20_000;

const app = express();
app.disable("x-powered-by");
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: CORS_ORIGINS },
    maxHttpBufferSize: 64 * 1024, // signaling payloads are small; cap to blunt abuse
});

const userManager = new UserManager();

// Minimal allow-list CORS for HTTP routes (socket.io handles its own CORS).
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && CORS_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    next();
});

app.get("/health", (_req, res) => {
    res.json({ status: "ok", online: userManager.count, waiting: userManager.queueLength });
});

// ---- validation helpers (never trust client payloads) ----
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function sanitizeName(raw: unknown): string {
    if (typeof raw !== "string") return "Stranger";
    // eslint-disable-next-line no-control-regex
    const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, MAX_NAME_LENGTH);
    return cleaned || "Stranger";
}

function parseRelay(event: RelayEvent, payload: unknown): { roomId: string; body: Record<string, unknown> } | null {
    if (!isRecord(payload) || typeof payload.roomId !== "string") return null;
    if (event === "ice-candidate") {
        return isRecord(payload.candidate) ? { roomId: payload.roomId, body: { candidate: payload.candidate } } : null;
    }
    const { sdp } = payload;
    if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > MAX_SDP_LENGTH) return null;
    return { roomId: payload.roomId, body: { sdp } };
}

// ---- online count: coalesced broadcast to avoid O(n²) fan-out on join storms ----
let lastBroadcastCount = -1;
const countTimer = setInterval(() => {
    if (userManager.count === lastBroadcastCount) return;
    lastBroadcastCount = userManager.count;
    io.emit("online-count", { count: lastBroadcastCount });
}, 1_000);

io.on("connection", (socket: Socket) => {
    socket.emit("online-count", { count: userManager.count });

    socket.on("join", (payload: unknown) => {
        const name = sanitizeName(isRecord(payload) ? payload.name : undefined);
        userManager.addUser(name, socket);
        console.info(`[join] ${socket.id} as "${name}" (online=${userManager.count})`);
    });

    socket.on("next", () => userManager.next(socket.id));

    for (const event of RELAY_EVENTS) {
        socket.on(event, (payload: unknown) => {
            const parsed = parseRelay(event, payload);
            if (!parsed || !userManager.relay(socket.id, parsed.roomId, event, parsed.body)) {
                console.warn(`[relay] dropped ${event} from ${socket.id}`);
            }
        });
    }

    socket.on("disconnect", (reason) => {
        userManager.removeUser(socket.id);
        console.info(`[leave] ${socket.id} (${reason}) (online=${userManager.count})`);
    });
});

server.listen(PORT, () => {
    console.info(`signaling server on http://localhost:${PORT} (cors: ${CORS_ORIGINS.join(", ")})`);
});

function shutdown(signal: string): void {
    console.info(`${signal} received, shutting down`);
    clearInterval(countTimer);
    userManager.dispose();
    io.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));