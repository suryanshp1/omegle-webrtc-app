import { useEffect } from "react";
import { useChatSession, type SessionStatus } from "../hooks/useChatSession";
import { useLocalMedia } from "../hooks/useLocalMedia";
import { VideoTile } from "./VideoTile";

interface RoomProps {
    name: string;
    onExit: () => void;
}

const STATUS_COPY: Record<SessionStatus, { title: string; sub: string }> = {
    connecting: { title: "Tuning in…", sub: "Reaching the switchboard" },
    waiting: { title: "Looking for a stranger…", sub: "Hang tight — scanning channels" },
    matched: { title: "Found someone", sub: "Opening a direct line" },
    connected: { title: "", sub: "" },
};

export const Room = ({ name, onExit }: RoomProps) => {
    const { stream, error, retry } = useLocalMedia();
    const { status, peerName, remoteStream, onlineCount, next } = useChatSession(name, stream);

    // Omegle muscle memory: Esc skips.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !e.repeat) next();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [next]);

    if (error) {
        return (
            <div className="room room--error">
                <div className="error-card" role="alert">
                    <p className="eyebrow">No signal</p>
                    <h1 className="error-card__title">We can&rsquo;t see you.</h1>
                    <p>{error}</p>
                    <div className="error-card__actions">
                        <button id="retry-media-button" className="btn btn--signal" onClick={retry}>
                            Try again
                        </button>
                        <button id="back-button" className="btn btn--ghost" onClick={onExit}>
                            Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const live = status === "connected" && remoteStream;
    const copy = STATUS_COPY[stream ? status : "connecting"];

    return (
        <div className="room">
            <header className="topbar topbar--room">
                <span className="wordmark">
                    stranger<span className="wordmark__dot">.</span>live
                </span>
                <h1 className="visually-hidden">Video chat with a stranger</h1>
                {onlineCount !== null && (
                    <span className="live-pill" aria-live="polite">
                        <span className="live-pill__dot" /> {onlineCount.toLocaleString()} on air
                    </span>
                )}
            </header>

            <main className="stage">
                <section className={`stage__remote ${live ? "is-live" : ""}`} aria-label="Stranger's video">
                    <VideoTile stream={remoteStream} label="Stranger's video" className="stage__video" />

                    {!live && (
                        <div className="scan" aria-live="polite">
                            <div className={`radar ${status === "matched" ? "radar--locked" : ""}`}>
                                <span />
                                <span />
                                <span />
                            </div>
                            <p className="scan__title">{copy.title}</p>
                            <p className="scan__sub">
                                {status === "matched" && peerName ? `Connecting to ${peerName}` : copy.sub}
                            </p>
                        </div>
                    )}

                    {live && (
                        <div className="nametag">
                            <span className="nametag__dot" /> {peerName ?? "Stranger"}
                        </div>
                    )}
                </section>

                <section className="stage__self" aria-label="Your video">
                    <VideoTile stream={stream} muted mirrored label="Your video" className="stage__video" />
                    <span className="stage__self-tag">You{name ? ` · ${name}` : ""}</span>
                </section>
            </main>

            <nav className="controls" aria-label="Chat controls">
                <button id="stop-button" className="btn btn--ghost" onClick={onExit}>
                    Stop
                </button>
                <button id="next-button" className="btn btn--signal btn--wide" onClick={next} disabled={!stream}>
                    Next stranger <kbd>Esc</kbd>
                </button>
            </nav>
        </div>
    );
};