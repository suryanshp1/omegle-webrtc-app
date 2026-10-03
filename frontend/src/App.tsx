import { useState } from "react";
import { Landing } from "./components/Landing";
import { Room } from "./components/Room";

/**
 * Two-screen state machine. A router isn't used because the chat screen owns live
 * MediaStreams/sockets that can't be meaningfully restored from a URL.
 */
function App() {
    const [session, setSession] = useState<{ name: string } | null>(null);

    return session ? (
        <Room name={session.name} onExit={() => setSession(null)} />
    ) : (
        <Landing onStart={(name) => setSession({ name })} />
    );
}

export default App;
