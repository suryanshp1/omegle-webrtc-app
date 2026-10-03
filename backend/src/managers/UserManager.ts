import type { PeerSocket, RelayEvent, User } from "../types.js";
import { RoomManager } from "./RoomManager.js";

export type { User } from "../types.js";

export interface UserManagerOptions {
    /** Window during which two users who just parted won't be re-matched (unless they wait it out). */
    rematchCooldownMs: number;
}

const DEFAULT_OPTIONS: UserManagerOptions = { rematchCooldownMs: 5_000 };

/**
 * Owns user lifecycle and the matchmaking queue.
 * Transport-agnostic: socket.io handlers live in index.ts and call into this class.
 */
export class UserManager {
    private readonly users = new Map<string, User>();
    private queue: string[] = [];
    private readonly lastPartner = new Map<string, { id: string; at: number }>();
    private retryTimer: NodeJS.Timeout | undefined;
    private readonly options: UserManagerOptions;

    constructor(
        private readonly roomManager: RoomManager = new RoomManager(),
        options: Partial<UserManagerOptions> = {},
    ) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    get count(): number {
        return this.users.size;
    }

    get queueLength(): number {
        return this.queue.length;
    }

    has(socketId: string): boolean {
        return this.users.has(socketId);
    }

    addUser(name: string, socket: PeerSocket): void {
        if (this.users.has(socket.id)) return;
        this.users.set(socket.id, { name, socket });
        this.enqueue(socket.id);
    }

    removeUser(socketId: string): void {
        if (!this.users.has(socketId)) return;
        this.queue = this.queue.filter((id) => id !== socketId);
        this.abandonRoom(socketId);
        this.users.delete(socketId);
        this.lastPartner.delete(socketId);
        this.match();
    }

    /** Skip current partner (or keep waiting) and go back into the queue. */
    next(socketId: string): void {
        if (!this.users.has(socketId)) return;
        this.abandonRoom(socketId);
        this.enqueue(socketId);
    }

    relay(senderId: string, roomId: string, event: RelayEvent, payload: Record<string, unknown>): boolean {
        if (!this.users.has(senderId)) return false;
        return this.roomManager.relay(roomId, senderId, event, payload);
    }

    dispose(): void {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
    }

    private abandonRoom(socketId: string): void {
        const partner = this.roomManager.leaveRoom(socketId);
        if (!partner) return;

        const now = Date.now();
        this.lastPartner.set(socketId, { id: partner.socket.id, at: now });
        this.lastPartner.set(partner.socket.id, { id: socketId, at: now });

        partner.socket.emit("partner-left");
        // Partner didn't choose to leave — put them straight back in line.
        this.enqueue(partner.socket.id, false);
    }

    private enqueue(socketId: string, runMatch = true): void {
        const user = this.users.get(socketId);
        if (!user) return;
        if (!this.queue.includes(socketId)) this.queue.push(socketId);
        user.socket.emit("lobby");
        if (runMatch) this.match();
    }

    private isOnCooldown(a: string, b: string, now: number): boolean {
        const last = this.lastPartner.get(a);
        return last !== undefined && last.id === b && now - last.at < this.options.rematchCooldownMs;
    }

    /** FIFO matching that skips just-parted pairs. O(n²) worst case; queue is expected to stay small. */
    private match(): void {
        const now = Date.now();
        let blocked = false;
        let i = 0;

        while (i < this.queue.length) {
            const aId = this.queue[i]!;
            let j = -1;
            for (let k = i + 1; k < this.queue.length; k++) {
                if (this.isOnCooldown(aId, this.queue[k]!, now)) {
                    blocked = true;
                    continue;
                }
                j = k;
                break;
            }
            if (j === -1) {
                i++;
                continue;
            }

            const bId = this.queue[j]!;
            this.queue.splice(j, 1);
            this.queue.splice(i, 1);

            const a = this.users.get(aId);
            const b = this.users.get(bId);
            if (a && b) {
                this.roomManager.createRoom(a, b);
            } else {
                // Defensive: re-queue whichever side still exists.
                if (a) this.queue.splice(i, 0, aId);
                if (b) this.queue.push(bId);
            }
        }

        if (blocked && !this.retryTimer) {
            this.retryTimer = setTimeout(() => {
                this.retryTimer = undefined;
                this.match();
            }, this.options.rematchCooldownMs);
            this.retryTimer.unref?.();
        }
    }
}