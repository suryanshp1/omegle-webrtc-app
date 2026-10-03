import { useEffect, useRef } from "react";

interface VideoTileProps {
    stream: MediaStream | null;
    muted?: boolean;
    mirrored?: boolean;
    className?: string;
    label?: string;
}

/** Binds a MediaStream to a <video>. srcObject can't be set declaratively, hence the effect. */
export function VideoTile({ stream, muted = false, mirrored = false, className = "", label }: VideoTileProps) {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.srcObject = stream;
        if (stream) el.play().catch(() => {/* autoplay policy: muted local always plays; remote plays after user gesture (Start click) */});
    }, [stream]);

    return (
        <video
            ref={ref}
            className={`video ${mirrored ? "video--mirrored" : ""} ${stream ? "" : "video--empty"} ${className}`}
            autoPlay
            playsInline
            muted={muted}
            aria-label={label}
        />
    );
}
