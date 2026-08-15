import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../game/types";
import { RoomClient } from "../network/roomClient";
import type { ServerMessage } from "../network/protocol";

type OnlineRoomScreenProps = {
  onBack: () => void;
};

const ROOM_IDS = ["family-a", "family-b", "family-c"];

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8787`;
}

function storedPlayerId(roomId: string): string | undefined {
  return window.localStorage.getItem(`boardgame-ma:online-player:${roomId}`) ?? undefined;
}

export function OnlineRoomScreen({ onBack }: OnlineRoomScreenProps) {
  const client = useRef(new RoomClient());
  const [roomId, setRoomId] = useState(ROOM_IDS[0]);
  const [playerName, setPlayerName] = useState("Player");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState("尚未连接");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => client.current.close(), []);

  function handleMessage(message: ServerMessage) {
    if (message.type === "STATE_SYNC") {
      setRoom(message.room);
      setPlayerId(message.playerId);
      window.localStorage.setItem(`boardgame-ma:online-player:${message.room.roomId}`, message.playerId);
      setStatus(`已连接到 ${message.room.roomName}`);
      setError(null);
      return;
    }

    if (message.type === "COMMAND_REJECTED") {
      setError(message.reason);
      if (message.room) {
        setRoom(message.room);
      }
      return;
    }

    setError(message.reason);
  }

  function joinRoom() {
    setError(null);
    setStatus("正在连接...");
    client.current.connect(socketUrl(), () => {
      try {
        client.current.send({
          type: "JOIN_ROOM",
          roomId,
          playerName,
          previousPlayerId: storedPlayerId(roomId),
        });
      } catch (joinError) {
        setError(joinError instanceof Error ? joinError.message : "无法加入房间。");
      }
    }, handleMessage, () => setStatus("连接已关闭"));
  }

  const occupiedCount = room?.playerSlots.filter((slot) => slot.isOccupied).length ?? 0;
  const isHost = playerId !== null && room?.hostPlayerId === playerId;
  const canStart = Boolean(isHost && occupiedCount >= 2 && room?.status === "waiting");
  const game = room?.gameState;

  return (
    <main className="app-shell screen-layout online-room-layout">
      <header className="top-bar">
        <button className="ghost-button" type="button" onClick={onBack}>Back</button>
        <h1>Online Room</h1>
      </header>

      <section className="room-panel" aria-label="Online room">
        <div className="mode-indicator">在线房间{room ? `: ${room.roomName}` : ""}</div>
        <p className="helper-text">固定房间技术验证。服务端负责房间状态与命令执行；本地同屏模式不受影响。</p>

        {!room ? (
          <div className="room-join-form">
            <label className="name-field">
              <span>固定房间</span>
              <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
                {ROOM_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
            <label className="name-field">
              <span>昵称</span>
              <input value={playerName} maxLength={24} onChange={(event) => setPlayerName(event.target.value)} />
            </label>
            <button className="primary-button" type="button" onClick={joinRoom}>Join Room</button>
          </div>
        ) : (
          <>
            <div className="room-status-row">
              <strong>{status}</strong>
              <span>{`座位 ${occupiedCount} / 6`}</span>
            </div>
            <div className="room-seat-grid">
              {room.playerSlots.map((slot) => (
                <div className={slot.isOccupied ? "room-seat occupied" : "room-seat"} key={slot.slotIndex}>
                  <span>{`座位 ${slot.slotIndex + 1}`}</span>
                  <strong>{slot.isOccupied ? slot.playerName : "空位"}</strong>
                  {slot.playerId === room.hostPlayerId ? <small>房主</small> : null}
                  {slot.playerId === playerId ? <small>你</small> : null}
                  {slot.isOccupied ? <small>{slot.isConnected ? "已连接" : "已离线"}</small> : null}
                </div>
              ))}
            </div>

            {room.status === "waiting" ? (
              <button
                className="primary-button"
                type="button"
                disabled={!canStart}
                onClick={() => client.current.send({ type: "START_SHARED_GAME" })}
              >
                Start Shared Test Game
              </button>
            ) : null}

            {game ? (
              <section className="shared-game-summary" aria-label="Shared game state">
                <div>
                  <span>共享游戏</span>
                  <strong>{game.phase}</strong>
                </div>
                <div>
                  <span>状态版本</span>
                  <strong>{game.revision}</strong>
                </div>
                <div>
                  <span>游戏玩家</span>
                  <strong>{game.players.map((player) => player.name).join("、")}</strong>
                </div>
                {isHost && game.phase === "teamReveal" ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => client.current.send({ type: "GAME_COMMAND", revision: game.revision, command: { type: "BEGIN_SELECTION" } })}
                  >
                    Begin Shared Selection
                  </button>
                ) : null}
              </section>
            ) : null}
          </>
        )}

        {error ? <p className="room-error" role="alert">{error}</p> : null}
        <p className="room-connection-note">{status}</p>
      </section>
    </main>
  );
}
