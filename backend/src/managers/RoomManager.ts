import { randomUUID } from "node:crypto";
import type { RelayEvent, User } from "../types.js";

interface Room {
    id: string;
    user1: User; // designated offerer — a single offerer avoids SDP glare
    user2: User;
}

export class RoomManager {
    private readonly rooms = new Map<string, Room>();
    private readonly roomByUser = new Map<string, string>();

    get size(): number {
        return this.rooms.size;
    }

    createRoom(user1: User, user2: User): string {
        const id = randomUUID();
        this.rooms.set(id, { id, user1, user2 });
        this.roomByUser.set(user1.socket.id, id);
        this.roomByUser.set(user2.socket.id, id);

        user1.socket.emit("send-offer", { roomId: id, peerName: user2.name });
        user2.socket.emit("matched", { roomId: id, peerName: user1.name });
        return id;
    }

    getRoomIdForUser(socketId: string): string | undefined {
        return this.roomByUser.get(socketId);
    }

    /**
     * Forwards a signaling message to the sender's peer.
     * Rejects (returns false) if the room doesn't exist or the sender isn't a member,
     * which prevents clients from injecting SDP into rooms they don't belong to.
     */
    relay(roomId: string, senderId: string, event: RelayEvent, payload: Record<string, unknown>): boolean {
        const room = this.rooms.get(roomId);
        if (!room) return false;

        const peer = this.peerOf(room, senderId);
        if (!peer) return false;

        peer.socket.emit(event, { ...payload, roomId });
        return true;
    }

    /** Tears down the user's room (if any) and returns the abandoned partner. */
    leaveRoom(socketId: string): User | undefined {
        const roomId = this.roomByUser.get(socketId);
        if (!roomId) return undefined;

        const room = this.rooms.get(roomId);
        this.roomByUser.delete(socketId);
        if (!room) return undefined;

        const partner = this.peerOf(room, socketId);
        this.rooms.delete(roomId);
        if (partner) this.roomByUser.delete(partner.socket.id);
        return partner;
    }

    private peerOf(room: Room, socketId: string): User | undefined {
        if (room.user1.socket.id === socketId) return room.user2;
        if (room.user2.socket.id === socketId) return room.user1;
        return undefined;
    }
}