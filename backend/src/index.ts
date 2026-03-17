import express from "express";
import http from "http";
import { Server } from "socket.io";
import { Socket } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket: Socket) => {
  console.log('a user connected');
});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});