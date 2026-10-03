import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ICE_SERVERS, SIGNALING_URL } from "../config";

export type SessionStatus =
    | "connecting" // reaching signaling server
    | "waiting" // in queue
    | "matched" // paired, negotiating WebRTC
    | "connected"; // media flowing

interface MatchPayload {
    roomId: string;
    peerName: string;
}
interface SdpPayload {
    roomId: string;
    sdp: string;
}
interface IcePayload {
    roomId: string;
    candidate: RTCIceCandidateInit;
}

/**
 * Owns the signaling socket and the RTCPeerConnection for one chat session.
 *
 * Protocol: server picks a single offerer per room ("send-offer"); the other side gets "matched"
 * and answers. ICE candidates that arrive before the remote description are buffered.
 */
export function useChatSession(name: string, localStream: MediaStream | null) {
    const [status, setStatus] = useState<SessionStatus>("connecting");
    const [peerName, setPeerName] = useState<string | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [onlineCount, setOnlineCount] = useState<number | null>(null);
    const nextRef = useRef<() => void>(() => {});

    useEffect(() => {
        if (!localStream) return;

        const socket: Socket = io(SIGNALING_URL, { transports: ["websocket"] });
        let pc: RTCPeerConnection | null = null;
        let roomId: string | null = null;
        let pending: RTCIceCandidateInit[] = [];

        const teardownPeer = () => {
            if (pc) {
                pc.onicecandidate = null;
                pc.ontrack = null;
                pc.onconnectionstatechange = null;
                pc.close();
            }
            pc = null;
            roomId = null;
            pending = [];
            setRemoteStream(null);
            setPeerName(null);
        };

        const createPeer = (id: string): RTCPeerConnection => {
            teardownPeer();
            const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            localStream.getTracks().forEach((track) => conn.addTrack(track, localStream));

            conn.ontrack = (e) => setRemoteStream(e.streams[0] ?? new MediaStream([e.track]));
            conn.onicecandidate = (e) => {
                if (e.candidate && roomId === id) {
                    socket.emit("ice-candidate", { roomId: id, candidate: e.candidate.toJSON() });
                }
            };
            conn.onconnectionstatechange = () => {
                if (pc !== conn) return;
                if (conn.connectionState === "connected") setStatus("connected");
                // No route between peers (e.g. symmetric NAT without TURN): move on rather than hang.
                if (conn.connectionState === "failed") {
                    console.warn("[rtc] connection failed, skipping");
                    teardownPeer();
                    socket.emit("next");
                }
            };

            pc = conn;
            roomId = id;
            return conn;
        };

        const flushPending = async (conn: RTCPeerConnection) => {
            const queued = pending;
            pending = [];
            for (const c of queued) {
                await conn.addIceCandidate(c).catch((err) => console.warn("[rtc] bad candidate", err));
            }
        };

        const safe =
            <T,>(label: string, fn: (p: T) => Promise<void> | void) =>
            (payload: T) => {
                Promise.resolve(fn(payload)).catch((err) => console.error(`[rtc] ${label} failed`, err));
            };

        socket.on("connect", () => socket.emit("join", { name }));
        socket.on("disconnect", () => {
            teardownPeer();
            setStatus("connecting");
        });
        socket.on("online-count", ({ count }: { count: number }) => setOnlineCount(count));

        socket.on("lobby", () => {
            teardownPeer();
            setStatus("waiting");
        });

        socket.on("partner-left", () => {
            teardownPeer();
            setStatus("waiting");
        });

        socket.on(
            "send-offer",
            safe<MatchPayload>("offer", async ({ roomId: id, peerName: peer }) => {
                const conn = createPeer(id); // resets peer state — must precede setPeerName
                setPeerName(peer);
                setStatus("matched");
                const offer = await conn.createOffer();
                if (pc !== conn) return; // superseded by a newer match
                await conn.setLocalDescription(offer);
                socket.emit("offer", { roomId: id, sdp: offer.sdp });
            }),
        );

        socket.on("matched", ({ roomId: id, peerName: peer }: MatchPayload) => {
            createPeer(id);
            setPeerName(peer);
            setStatus("matched");
        });

        socket.on(
            "offer",
            safe<SdpPayload>("answer", async ({ roomId: id, sdp }) => {
                const conn = pc;
                if (!conn || roomId !== id) return;
                await conn.setRemoteDescription({ type: "offer", sdp });
                await flushPending(conn);
                const answer = await conn.createAnswer();
                if (pc !== conn) return;
                await conn.setLocalDescription(answer);
                socket.emit("answer", { roomId: id, sdp: answer.sdp });
            }),
        );

        socket.on(
            "answer",
            safe<SdpPayload>("set answer", async ({ roomId: id, sdp }) => {
                const conn = pc;
                if (!conn || roomId !== id) return;
                await conn.setRemoteDescription({ type: "answer", sdp });
                await flushPending(conn);
            }),
        );

        socket.on(
            "ice-candidate",
            safe<IcePayload>("add candidate", async ({ roomId: id, candidate }) => {
                const conn = pc;
                if (!conn || roomId !== id) return;
                if (!conn.remoteDescription) {
                    pending.push(candidate);
                    return;
                }
                await conn.addIceCandidate(candidate);
            }),
        );

        nextRef.current = () => {
            teardownPeer();
            setStatus("waiting");
            socket.emit("next");
        };

        return () => {
            nextRef.current = () => {};
            teardownPeer();
            socket.removeAllListeners();
            socket.disconnect();
        };
    }, [name, localStream]);

    const next = useCallback(() => nextRef.current(), []);

    return { status, peerName, remoteStream, onlineCount, next };
}
