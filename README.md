# stranger.live — WebRTC Video Chat

A peer-to-peer random video chat application (Omegle clone) built with React, WebRTC, and Socket.io.

## Features
- **Peer-to-Peer Video/Audio**: Media streams directly between browsers using WebRTC.
- **Random Matching**: Fast pairing using a socket-based queuing system.
- **Next / Skip**: Instantly leave a chat and find a new partner (or press <kbd>Esc</kbd>).
- **Graceful Disconnects**: Auto-requeue when a partner drops.
- **No Accounts**: Frictionless, anonymous entry.
- **Modern UI**: Dark "late-night broadcast" aesthetic, responsive design, and status feedback (radar/scanning animations).

## Tech Stack
- **Frontend**: React 19, Vite, TypeScript, Vanilla CSS
- **Backend**: Node.js, Express, Socket.io (Signaling Server)

## Development Setup

1. **Install dependencies**:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Start the backend (signaling server)**:
   ```bash
   cd backend
   npm run dev
   # Runs on http://localhost:3001
   ```

3. **Start the frontend (dev server)**:
   ```bash
   cd frontend
   npm run dev
   # Runs on http://localhost:5173
   ```

## How to Test Locally

1. Ensure both the backend and frontend servers are running.
2. Open your browser and navigate to `http://localhost:5173` in **Tab A**.
3. Enter a name, check the consent box, click **Start**, and allow camera/microphone permissions.
4. Open a **new tab** or window (**Tab B**) and go to `http://localhost:5173`.
5. Enter a different name, accept the consent, and click **Start**.
6. The two tabs will match and connect via WebRTC. You can test skipping by pressing <kbd>Esc</kbd> in either tab.

*Note: You can also run the automated backend tests using `npm test` inside the `backend` directory.*

## Production & Deployment
See [GUIDE.md](GUIDE.md) for detailed architecture, deployment instructions, and how to configure TURN servers for NAT traversal.