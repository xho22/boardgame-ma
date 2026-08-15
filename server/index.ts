import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { RoomService, RoomServiceError } from "../src/network/roomService";
import type { ClientMessage, ServerMessage } from "../src/network/protocol";

const port = Number(process.env.PORT ?? 8787);
const rooms = new RoomService();
const clients = new Map<WebSocket, { roomId: string; playerId: string }>();
const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404);
  response.end();
});
const server = new WebSocketServer({ server: httpServer });

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(roomId: string): void {
  for (const [socket, client] of clients) {
    if (client.roomId === roomId) {
      const room = rooms.getRoomForPlayer(roomId, client.playerId);
      if (room) {
        send(socket, { type: "STATE_SYNC", room, playerId: client.playerId });
      }
    }
  }
}

server.on("connection", (socket) => {
  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString()) as ClientMessage;

      if (message.type === "JOIN_ROOM") {
        const joined = rooms.join(message.roomId, message.playerName, message.previousPlayerId);
        clients.set(socket, { roomId: message.roomId, playerId: joined.playerId });
        broadcast(message.roomId);
        return;
      }

      const client = clients.get(socket);
      if (!client) {
        throw new RoomServiceError("请先加入一个房间。");
      }

      if (message.type === "START_SHARED_GAME") {
        rooms.startSharedGame(client.roomId, client.playerId);
      } else if (message.type === "RESET_SHARED_GAME") {
        rooms.resetSharedGame(client.roomId, client.playerId);
      } else if (message.type === "GAME_COMMAND") {
        rooms.dispatchGameCommand(client.roomId, client.playerId, message.revision, message.command);
      }

      broadcast(client.roomId);
    } catch (error) {
      const client = clients.get(socket);
      send(socket, {
        type: "COMMAND_REJECTED",
        reason: error instanceof Error ? error.message : "无法处理房间请求。",
        ...(client ? { room: rooms.getRoom(client.roomId) ?? undefined } : {}),
      });
    }
  });

  socket.on("close", () => {
    const client = clients.get(socket);
    clients.delete(socket);
    if (client) {
      rooms.disconnect(client.roomId, client.playerId);
      broadcast(client.roomId);
    }
  });
});

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`boardgame-ma room server listening on ws://127.0.0.1:${port}`);
});
