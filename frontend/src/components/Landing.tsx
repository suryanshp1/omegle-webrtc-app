import { useEffect, useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH, SIGNALING_URL } from "../config";

interface LandingProps {
    onStart: (name: string) => void;
}

const CHANNELS = ["CH 07 — Lisbon", "CH 12 — Osaka", "CH 31 — Nairobi"];

function useOnlineCount(): number | null {
    const [count, setCount] = useState<number | null>(null);
    useEffect(() => {
        const ctrl = new AbortController();
        const load = () =>
            fetch(`${SIGNALING_URL}/health`, { signal: ctrl.signal })
                .then((r) => r.json() as Promise<{ online: number }>)
                .then((d) => setCount(d.online))
                .catch(() => {/* server offline: hide counter */});
        load();
        const id = setInterval(load, 10_000);
        return () => {
            ctrl.abort();
            clearInterval(id);
        };
    }, []);
    return count;
}

export const Landing = ({ onStart }: LandingProps) => {
    const [name, setName] = useState("");
    const [agreed, setAgreed] = useState(false);
    const online = useOnlineCount();

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!agreed) return;
        onStart(name.trim());
    };

    return (
        <div className="landing">
            <header className="topbar">
                <span className="wordmark">
                    stranger<span className="wordmark__dot">.</span>live
                </span>
                {online !== null && (
                    <span className="live-pill" aria-live="polite">
                        <span className="live-pill__dot" /> {online.toLocaleString()} on air
                    </span>
                )}
            </header>

            <main className="landing__main">
                <section className="hero">
                    <p className="eyebrow">Random video chat · peer-to-peer</p>
                    <h1 className="hero__title">
                        Talk to <em>strangers</em>.
                        <br />
                        Skip when it&rsquo;s dull.
                    </h1>
                    <p className="hero__lede">
                        One click drops you into a live call with someone, somewhere. Video streams directly between
                        browsers &mdash; our server only makes the introduction.
                    </p>

                    <form className="join" onSubmit={submit}>
                        <label className="join__label" htmlFor="name-input">
                            What should strangers call you?
                        </label>
                        <div className="join__row">
                            <input
                                id="name-input"
                                className="join__input"
                                type="text"
                                placeholder="Stranger"
                                autoComplete="off"
                                maxLength={MAX_NAME_LENGTH}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                            <button id="start-button" className="btn btn--signal" type="submit" disabled={!agreed}>
                                Start <span aria-hidden>→</span>
                            </button>
                        </div>
                        <label className="consent" htmlFor="consent-checkbox">
                            <input
                                id="consent-checkbox"
                                type="checkbox"
                                checked={agreed}
                                onChange={(e) => setAgreed(e.target.checked)}
                            />
                            <span>I&rsquo;m 18+ and I&rsquo;ll be decent. I understand chats aren&rsquo;t moderated.</span>
                        </label>
                    </form>
                </section>

                <aside className="channels" aria-hidden>
                    {CHANNELS.map((ch, i) => (
                        <div key={ch} className={`channel channel--${i}`}>
                            <div className="channel__screen">
                                <span className="channel__bars" />
                            </div>
                            <span className="channel__tag">{ch}</span>
                        </div>
                    ))}
                </aside>
            </main>

            <footer className="landing__foot">
                <span>
                    <kbd>Esc</kbd> skips during a chat
                </span>
                <span>No accounts · No recordings · WebRTC</span>
            </footer>
        </div>
    );
};