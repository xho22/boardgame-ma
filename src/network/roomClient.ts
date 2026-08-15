import type { ClientMessage, ServerMessage } from "./protocol";

export class RoomClient {
  private socket: WebSocket | null = null;

  connect(url: string, onOpen: () => void, onMessage: (message: ServerMessage) => void, onClose: () => void): void {
    this.close();
    this.socket = new WebSocket(url);
    this.socket.addEventListener("open", onOpen);
    this.socket.addEventListener("message", (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        onMessage({ type: "CONNECTION_ERROR", reason: "收到无法识别的服务器消息。" });
      }
    });
    this.socket.addEventListener("close", onClose);
    this.socket.addEventListener("error", () => {
      onMessage({ type: "CONNECTION_ERROR", reason: "无法连接在线房间服务。请确认已运行 npm run server。" });
    });
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("在线房间尚未连接。");
    }
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
