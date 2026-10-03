import { io } from "socket.io-client";
import { RTCPeerConnection } from "node:wrtc"; // wait, node doesn't have WebRTC natively without wrtc. Let's just monitor the socket traffic!
