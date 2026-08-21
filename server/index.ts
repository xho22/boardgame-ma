import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { RoomService, RoomServiceError } from "../src/network/roomService";
import type { ClientMessage, ServerMessage } from "../src/network/protocol";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const clientDistDirectory = resolve(process.cwd(), "dist");
const rooms = new RoomService();
const clients = new Map<WebSocket, { roomId: string; playerId: string }>();
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function cacheControl(relativePath: string, servedPath: string): string {
  if (extname(servedPath) === ".html") {
    return "no-store";
  }

  if (relativePath.startsWith("assets/")) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=3600, must-revalidate";
}

const httpServer = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const requestedPath = resolve(clientDistDirectory, relativePath);
  const safePath = requestedPath.startsWith(`${clientDistDirectory}/`) ? requestedPath : null;
  const fallbackPath = resolve(clientDistDirectory, "index.html");

  try {
    const servedPath = safePath ?? fallbackPath;
    const body = await readFile(servedPath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(servedPath)] ?? "application/octet-stream",
      "cache-control": cacheControl(relativePath, servedPath),
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    if (extname(relativePath)) {
      response.writeHead(404, { "cache-control": "no-store" });
      response.end();
      return;
    }

    try {
      const body = await readFile(fallbackPath);
      response.writeHead(200, { "content-type": contentTypes[".html"], "cache-control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "Client build is unavailable. Run npm run build first." }));
    }
  }
});
const server = new WebSocketServer({ server: httpServer, path: "/ws" });

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

function disconnectClearedRoomClients(roomId: string, hostPlayerId: string): void {
  for (const [socket, client] of clients) {
    if (client.roomId !== roomId || client.playerId === hostPlayerId) {
      continue;
    }

    clients.delete(socket);
    send(socket, { type: "ROOM_CLEARED", reason: "房主已清空房间，请重新加入。" });
    socket.close(4001, "Room cleared by host");
  }
}

server.on("connection", (socket) => {
  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString()) as ClientMessage;

      if (message.type === "HEARTBEAT") {
        send(socket, { type: "HEARTBEAT_ACK", sentAt: message.sentAt });
        return;
      }

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
        rooms.startSharedGame(client.roomId, client.playerId, message.options);
      } else if (message.type === "RESET_SHARED_GAME") {
        rooms.resetSharedGame(client.roomId, client.playerId);
      } else if (message.type === "CLEAR_ROOM") {
        rooms.clearRoom(client.roomId, client.playerId);
        disconnectClearedRoomClients(client.roomId, client.playerId);
      } else if (message.type === "REMOVE_OFFLINE_PLAYER") {
        rooms.removeOfflinePlayer(client.roomId, client.playerId, message.targetPlayerId);
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

httpServer.listen(port, host, () => {
  console.log(`boardgame-ma serving HTTP and WebSocket on ${host}:${port}`);
});
