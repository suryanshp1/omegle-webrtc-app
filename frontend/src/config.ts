/** Runtime configuration, overridable via Vite env vars (see .env.example). */

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

function parseIceServers(raw: string | undefined): RTCIceServer[] {
    if (!raw) return DEFAULT_ICE_SERVERS;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as RTCIceServer[];
    } catch {
        console.warn("[config] VITE_ICE_SERVERS is not valid JSON; using default STUN");
    }
    return DEFAULT_ICE_SERVERS;
}

/** Defaults to same host on :3000 so LAN testing works without extra config. */
export const SIGNALING_URL: string =
    import.meta.env.VITE_SIGNALING_URL ?? `${window.location.protocol}//${window.location.hostname}:3000`;

export const ICE_SERVERS: RTCIceServer[] = parseIceServers(import.meta.env.VITE_ICE_SERVERS);

export const MAX_NAME_LENGTH = 24;
