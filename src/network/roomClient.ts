import type { ClientMessage, ServerMessage } from "./protocol";

export class RoomClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;

  connect(url: string, onOpen: () => void, onMessage: (message: ServerMessage) => void, onClose: () => void): void {
    this.close();
    this.shouldReconnect = true;
    this.open(url, onOpen, onMessage, onClose);
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("在线房间尚未连接。");
    }
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.shouldReconnect = false;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
  }

  private open(url: string, onOpen: () => void, onMessage: (message: ServerMessage) => void, onClose: () => void): void {
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }

      this.reconnectAttempts = 0;
      this.startHeartbeat(socket);
      onOpen();
    });
    socket.addEventListener("message", (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        onMessage({ type: "CONNECTION_ERROR", reason: "收到无法识别的服务器消息。" });
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }

      this.stopHeartbeat();
      onClose();
      this.scheduleReconnect(url, onOpen, onMessage, onClose);
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket) {
        onMessage({ type: "CONNECTION_ERROR", reason: "在线房间连接中断，正在尝试重连。" });
      }
    });
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat();
    this.sendHeartbeat(socket);
    this.heartbeatTimer = window.setInterval(() => {
      this.sendHeartbeat(socket);
    }, 25_000);
  }

  private sendHeartbeat(socket: WebSocket): void {
    if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "HEARTBEAT", sentAt: Date.now() } satisfies ClientMessage));
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(url: string, onOpen: () => void, onMessage: (message: ServerMessage) => void, onClose: () => void): void {
    if (!this.shouldReconnect || this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(1_000 * 2 ** this.reconnectAttempts, 10_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.open(url, onOpen, onMessage, onClose);
      }
    }, delay);
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
