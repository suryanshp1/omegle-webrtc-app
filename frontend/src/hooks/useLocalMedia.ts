import { useCallback, useEffect, useState } from "react";

const CONSTRAINTS: MediaStreamConstraints = {
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

function describeMediaError(err: unknown): string {
    const name = err instanceof DOMException ? err.name : "";
    switch (name) {
        case "NotAllowedError":
            return "Camera & mic access was blocked. Allow it in your browser's site settings, then retry.";
        case "NotFoundError":
            return "No camera or microphone was found on this device.";
        case "NotReadableError":
            return "Your camera is busy in another app. Close it and retry.";
        default:
            return "Couldn't start your camera. Check your device and retry.";
    }
}

/** Acquires the local camera+mic stream and guarantees tracks are stopped on unmount/retry. */
export function useLocalMedia() {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        let acquired: MediaStream | null = null;

        if (!navigator.mediaDevices?.getUserMedia) {
            queueMicrotask(() => {
                if (!cancelled) setError("Video chat needs a secure origin (HTTPS or localhost).");
            });
            return () => {
                cancelled = true;
            };
        }

        navigator.mediaDevices
            .getUserMedia(CONSTRAINTS)
            .then((s) => {
                if (cancelled) {
                    s.getTracks().forEach((t) => t.stop());
                    return;
                }
                acquired = s;
                setError(null);
                setStream(s);
            })
            .catch((err: unknown) => {
                console.error("[media] getUserMedia failed", err);
                if (!cancelled) setError(describeMediaError(err));
            });

        return () => {
            cancelled = true;
            acquired?.getTracks().forEach((t) => t.stop());
            setStream(null);
        };
    }, [attempt]);

    const retry = useCallback(() => {
        setError(null);
        setAttempt((a) => a + 1);
    }, []);

    return { stream, error, retry };
}
