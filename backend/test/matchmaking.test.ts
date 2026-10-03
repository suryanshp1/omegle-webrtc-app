import { test } from "node:test";
import assert from "node:assert/strict";
import { UserManager } from "../src/managers/UserManager.js";
import { RoomManager } from "../src/managers/RoomManager.js";
import type { PeerSocket } from "../src/types.js";

class FakeSocket implements PeerSocket {
    readonly events: Array<{ event: string; payload: unknown }> = [];
    constructor(readonly id: string) {}
    emit(event: string, payload?: unknown) {
        this.events.push({ event, payload });
        return true;
    }
    last(event: string): any {
        return [...this.events].reverse().find((e) => e.event === event)?.payload;
    }
    count(event: string) {
        return this.events.filter((e) => e.event === event).length;
    }
}

const setup = (cooldown = 0) => {
    const rooms = new RoomManager();
    const um = new UserManager(rooms, { rematchCooldownMs: cooldown });
    return { rooms, um };
};

test("first user waits in lobby; second user triggers a match", () => {
    const { um, rooms } = setup();
    const a = new FakeSocket("a");
    const b = new FakeSocket("b");

    um.addUser("Ann", a);
    assert.equal(a.count("lobby"), 1);
    assert.equal(rooms.size, 0);

    um.addUser("Bob", b);
    assert.equal(rooms.size, 1);
    assert.equal(um.queueLength, 0);
    // Oldest waiter is the offerer
    assert.deepEqual(a.last("send-offer").peerName, "Bob");
    assert.deepEqual(b.last("matched").peerName, "Ann");
    assert.equal(a.last("send-offer").roomId, b.last("matched").roomId);
});

test("relays offer/answer/ice only between room members", () => {
    const { um } = setup();
    const a = new FakeSocket("a");
    const b = new FakeSocket("b");
    const c = new FakeSocket("c");
    um.addUser("A", a);
    um.addUser("B", b);
    um.addUser("C", c);
    const roomId = a.last("send-offer").roomId as string;

    assert.equal(um.relay("a", roomId, "offer", { sdp: "o" }), true);
    assert.deepEqual(b.last("offer"), { sdp: "o", roomId });

    assert.equal(um.relay("b", roomId, "answer", { sdp: "x" }), true);
    assert.deepEqual(a.last("answer"), { sdp: "x", roomId });

    assert.equal(um.relay("a", roomId, "ice-candidate", { candidate: { c: 1 } }), true);
    assert.deepEqual(b.last("ice-candidate"), { candidate: { c: 1 }, roomId });

    // Outsider cannot inject into the room
    assert.equal(um.relay("c", roomId, "offer", { sdp: "evil" }), false);
    assert.equal(b.count("offer"), 1);
    // Unknown room
    assert.equal(um.relay("a", "nope", "offer", { sdp: "o" }), false);
});

test("disconnect notifies partner and re-queues them", () => {
    const { um, rooms } = setup();
    const a = new FakeSocket("a");
    const b = new FakeSocket("b");
    um.addUser("A", a);
    um.addUser("B", b);

    um.removeUser("a");
    assert.equal(b.count("partner-left"), 1);
    assert.equal(rooms.size, 0);
    assert.equal(um.count, 1);
    assert.equal(um.queueLength, 1);

    const c = new FakeSocket("c");
    um.addUser("C", c);
    assert.equal(rooms.size, 1);
    assert.equal(b.last("send-offer").peerName, "C");
});

test("removing a waiting user only removes that user (regression: inverted filter)", () => {
    const { um } = setup();
    um.addUser("A", new FakeSocket("a"));
    um.removeUser("a");
    assert.equal(um.count, 0);
    assert.equal(um.queueLength, 0);
    um.addUser("B", new FakeSocket("b"));
    assert.equal(um.count, 1);
    assert.equal(um.queueLength, 1);
});

test("next() skips partner; both go to a new match when a third user is available", () => {
    const { um } = setup(60_000);
    const a = new FakeSocket("a");
    const b = new FakeSocket("b");
    const c = new FakeSocket("c");
    um.addUser("A", a);
    um.addUser("B", b);
    um.addUser("C", c); // waiting

    um.next("a");
    assert.equal(b.count("partner-left"), 1);
    // B was re-queued first and should be matched with C, not A (cooldown)
    assert.equal(b.last("matched")?.peerName ?? b.last("send-offer")?.peerName, "C");
    assert.equal(um.queueLength, 1); // A waits
    um.dispose();
});

test("cooldown prevents instant rematch of the same pair, then expires", async () => {
    const { um, rooms } = setup(50);
    const a = new FakeSocket("a");
    const b = new FakeSocket("b");
    um.addUser("A", a);
    um.addUser("B", b);
    um.next("a");
    assert.equal(rooms.size, 0, "same pair must not be rematched immediately");

    await new Promise((r) => setTimeout(r, 120));
    assert.equal(rooms.size, 1, "pair rematched after cooldown when nobody else is around");
    um.dispose();
});

test("duplicate join is ignored", () => {
    const { um } = setup();
    const a = new FakeSocket("a");
    um.addUser("A", a);
    um.addUser("A", a);
    assert.equal(um.count, 1);
    assert.equal(um.queueLength, 1);
});
