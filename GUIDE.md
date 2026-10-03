# stranger.live Architecture & Deployment Guide

## Architecture Overview

The application consists of two main components:
1. **Signaling Server (Backend)**: Introduces peers to each other. It does *not* touch video/audio data.
2. **WebRTC Client (Frontend)**: Negotiates connections and transmits media peer-to-peer.

### Signaling Flow
1. User connects to Socket.io and emits `join`.
2. Backend places them in a queue (`UserManager`).
3. When two users are available, `RoomManager` pairs them into a virtual room.
4. User A is designated the "offerer" (`send-offer` event). User B is notified they are `matched`.
5. User A generates an SDP Offer and sends it to the server.
6. Server relays the offer to User B.
7. User B generates an SDP Answer and sends it to the server.
8. Server relays the answer to User A.
9. Both clients generate ICE candidates (network paths) and relay them through the server.
10. WebRTC establishes a direct P2P connection; video flows.

### Matchmaking Rules
- **FIFO**: Users are matched in the order they joined.
- **Cooldown**: If User A skips User B, they are placed on a brief cooldown to ensure they aren't immediately rematched with each other if no one else is in the queue.

## Deployment

### 1. Environment Variables

**Frontend (`.env` or build environment)**:
- `VITE_SIGNALING_URL`: URL of your deployed backend (e.g., `https://api.stranger.live`).
- `VITE_ICE_SERVERS`: JSON array of ICE servers (STUN/TURN). See the TURN section below.

**Backend (`.env`)**:
- `PORT`: Server port (default `3000`).
- `CORS_ORIGIN`: Comma-separated list of allowed frontend origins (e.g., `https://stranger.live`).

### 2. Network / NAT Traversal (STUN & TURN)

WebRTC requires STUN servers to discover public IPs, and TURN servers to relay media if direct P2P fails (e.g., due to symmetric NAT or strict firewalls).

- **STUN**: By default, the app uses Google's public STUN servers. This works for ~80% of connections.
- **TURN**: For a production app, you **must** deploy your own TURN server (e.g., `coturn`) or use a paid service (Twilio, Metered). Without TURN, some users will connect but see a black screen.

**Configuring ICE Servers via Env Var:**
```bash
VITE_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:your-turn.com:3478","username":"user","credential":"password"}]'
```

### 3. Build & Serve

**Backend**:
```bash
cd backend
npm install
npm run build
npm run start # or use PM2 / Docker
```

**Frontend**:
```bash
cd frontend
npm install
npm run build
# Serve the `/dist` folder using Nginx, Vercel, Netlify, Cloudflare Pages, etc.
```

### 4. Security Considerations
- The backend sanitizes usernames and limits SDP string lengths to prevent basic abuse.
- WebRTC requires a secure context. The frontend *must* be served over HTTPS (or `localhost` for development), otherwise the browser will block access to the camera and microphone.
