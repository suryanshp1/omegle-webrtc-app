/**
 * Minimal socket surface the domain layer depends on.
 * Keeps managers decoupled from socket.io so they can be unit-tested with fakes.
 */
export interface PeerSocket {
    readonly id: string;
    emit(event: string, payload?: unknown): unknown;
}

export interface User {
    socket: PeerSocket;
    name: string;
}

/** Events that may be relayed verbatim between the two peers of a room. */
export const RELAY_EVENTS = ["offer", "answer", "ice-candidate"] as const;
export type RelayEvent = (typeof RELAY_EVENTS)[number];
