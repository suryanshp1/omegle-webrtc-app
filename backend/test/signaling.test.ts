import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { io as connect, type Socket } from "socket.io-client";

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
let server: ChildProcess;

interface Health {
    status: string;
    online: number;
    waiting: number;
}

const once = <T = any>(s: Socket, event: string, ms = 3000) =>
    new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
        s.once(event, (p: T) => {
            clearTimeout(t);
            resolve(p);
        });
    });

before(async () => {
    server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ["ignore", "pipe", "inherit"],
    });
    await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("server did not start")), 10_000);
        server.stdout!.on("data", (d: Buffer) => {
            if (d.toString().includes("signaling server")) {
                clearTimeout(t);
                resolve();
            }
        });
    });
});

after(() => {
    server.kill("SIGTERM");
});

test("health endpoint", async () => {
    const res = await fetch(`${URL}/health`);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as Health).status, "ok");
});

test("full signaling flow over real sockets", async () => {
    const a = connect(URL, { transports: ["websocket"] });
    const b = connect(URL, { transports: ["websocket"] });
    try {
        const aLobby = once(a, "lobby");
        a.emit("join", { name: "  <Alice>  " });
        await aLobby;

        const aOffer = once(a, "send-offer");
        const bMatched = once(b, "matched");
        b.emit("join", { name: "Bob" });
        const { roomId, peerName } = await aOffer;
        assert.equal(peerName, "Bob");
        assert.equal((await bMatched).peerName, "Alice", "name is sanitized");

        const bGetsOffer = once(b, "offer");
        a.emit("offer", { roomId, sdp: "v=0 offer" });
        assert.equal((await bGetsOffer).sdp, "v=0 offer");

        const aGetsAnswer = once(a, "answer");
        b.emit("answer", { roomId, sdp: "v=0 answer" });
        assert.equal((await aGetsAnswer).sdp, "v=0 answer");

        const bGetsIce = once(b, "ice-candidate");
        a.emit("ice-candidate", { roomId, candidate: { candidate: "c", sdpMid: "0" } });
        assert.equal((await bGetsIce).candidate.candidate, "c");

        const bLeft = once(b, "partner-left");
        a.emit("next");
        await bLeft;

        const health = (await (await fetch(`${URL}/health`)).json()) as Health;
        assert.equal(health.online, 2);
        assert.equal(health.waiting, 2, "both peers re-queued after next");

        const aLeft = once(a, "partner-left").catch(() => "none");
        b.disconnect();
        // a is no longer in a room with b (cooldown), so no partner-left expected
        assert.equal(await Promise.race([aLeft, new Promise((r) => setTimeout(() => r("none"), 300))]), "none");
    } finally {
        a.disconnect();
        b.disconnect();
    }
});
