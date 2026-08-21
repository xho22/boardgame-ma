import { useEffect, useRef, useState } from "react";
import { FinalResultsScreen } from "./FinalResultsScreen";
import { RaceRevealScreen } from "./RaceRevealScreen";
import { RaceResultsScreen } from "./RaceResultsScreen";
import { RaceScreen } from "./RaceScreen";
import { SelectionScreen } from "./SelectionScreen";
import { TeamRevealScreen } from "./TeamRevealScreen";
import type { GameCommand, GameState, MainMoveChoice, RoomState } from "../game/types";
import { RoomClient } from "../network/roomClient";
import type { ServerMessage, StartSharedGameOptions } from "../network/protocol";

type OnlineRoomScreenProps = {
  onBack: () => void;
};

export const ONLINE_ROOM_IDS = ["family-a", "family-b", "family-c", "family-d", "family-e", "family-f", "family-g", "family-h"] as const;

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function storedPlayerId(roomId: string): string | undefined {
  return window.localStorage.getItem(`boardgame-ma:online-player:${roomId}`) ?? undefined;
}

export function OnlineRoomScreen({ onBack }: OnlineRoomScreenProps) {
  const client = useRef(new RoomClient());
  const [roomId, setRoomId] = useState<string>(ONLINE_ROOM_IDS[0]);
  const [playerName, setPlayerName] = useState("Player");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState("尚未连接");
  const [error, setError] = useState<string | null>(null);
  const [racersPerPlayerPerRace, setRacersPerPlayerPerRace] = useState<1 | 2>(1);
  const [debugMode, setDebugMode] = useState(false);
  const [boardMode, setBoardMode] = useState<"alternating" | "allSpecial">("alternating");

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

  function sendCommand(command: GameCommand) {
    if (!room?.gameState) {
      return;
    }

    try {
      client.current.send({ type: "GAME_COMMAND", revision: room.gameState.revision, command });
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : "无法发送在线操作。");
    }
  }

  function resetSharedGame() {
    if (!window.confirm("重置会删除当前房间的比赛进度，所有人将回到房间大厅。继续吗？")) {
      return;
    }

    try {
      client.current.send({ type: "RESET_SHARED_GAME" });
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "无法重置房间游戏。");
    }
  }

  function removeOfflinePlayer(targetPlayerId: string, playerName: string) {
    if (!window.confirm(`移除 ${playerName} 的离线座位？对方之后需要重新加入房间。`)) {
      return;
    }

    try {
      client.current.send({ type: "REMOVE_OFFLINE_PLAYER", targetPlayerId });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "无法移除离线座位。");
    }
  }

  const occupiedCount = room?.playerSlots.filter((slot) => slot.isOccupied).length ?? 0;
  const isHost = playerId !== null && room?.hostPlayerId === playerId;
  const canStart = Boolean(isHost && occupiedCount >= 2 && room?.status === "waiting");
  const game = room?.gameState;

  useEffect(() => {
    if (occupiedCount > 3) {
      setRacersPerPlayerPerRace(1);
    }
  }, [occupiedCount]);

  if (game && playerId) {
    return <OnlineGameView room={room} playerId={playerId} onBack={onBack} onCommand={sendCommand} onReset={resetSharedGame} />;
  }

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
                {ONLINE_ROOM_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
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
                  {isHost && room.status === "waiting" && slot.isOccupied && !slot.isConnected && slot.playerId ? (
                    <button className="ghost-button danger room-seat-remove" type="button" onClick={() => removeOfflinePlayer(slot.playerId!, slot.playerName)}>
                      移除
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {room.status === "waiting" ? (
              <section className="online-game-settings" aria-label="Online game settings">
                <div className="room-status-row">
                  <strong>游戏设定</strong>
                  <span>{`${occupiedCount} 名玩家`}</span>
                </div>
                {isHost ? (
                  <>
                    <div className="control-band">
                      <label htmlFor="online-racers-per-player">每位玩家的 racer 数量</label>
                      <div className="segmented-control" id="online-racers-per-player">
                        <button className={racersPerPlayerPerRace === 1 ? "selected" : ""} type="button" onClick={() => setRacersPerPlayerPerRace(1)}>1</button>
                        <button className={racersPerPlayerPerRace === 2 ? "selected" : ""} type="button" disabled={occupiedCount > 3} onClick={() => setRacersPerPlayerPerRace(2)}>2</button>
                      </div>
                    </div>
                    <label className="toggle-row" htmlFor="online-debug-mode">
                      <span>Debug Mode</span>
                      <input checked={debugMode} id="online-debug-mode" type="checkbox" onChange={(event) => setDebugMode(event.target.checked)} />
                    </label>
                    {debugMode ? (
                      <div className="control-band">
                        <label htmlFor="online-board-mode">Board Mode</label>
                        <div className="segmented-control" id="online-board-mode">
                          <button className={boardMode === "alternating" ? "selected" : ""} type="button" onClick={() => setBoardMode("alternating")}>Alternate</button>
                          <button className={boardMode === "allSpecial" ? "selected" : ""} type="button" onClick={() => setBoardMode("allSpecial")}>All Special</button>
                        </div>
                      </div>
                    ) : null}
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!canStart}
                      onClick={() => client.current.send({
                        type: "START_SHARED_GAME",
                        options: { racersPerPlayerPerRace, debugMode, boardMode } satisfies StartSharedGameOptions,
                      })}
                    >
                      Start Shared Game
                    </button>
                  </>
                ) : <p className="choice-hint">等待房主设置每人 racer 数量、Debug 模式和棋盘模式。</p>}
              </section>
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

type OnlineGameViewProps = {
  room: RoomState;
  playerId: string;
  onBack: () => void;
  onCommand: (command: GameCommand) => void;
  onReset: () => void;
};

function OnlineGameView({ room, playerId, onBack, onCommand, onReset }: OnlineGameViewProps) {
  const game = room.gameState!;
  const isHost = room.hostPlayerId === playerId;
  const canChangeAthlete = (athleteId: string) => game.players.some(
    (player) => player.id === playerId && game.selectionState?.selectionsByPlayerId[player.id]?.includes(athleteId),
  );
  const content = renderOnlineGameScreen(game, playerId, isHost, onBack, onCommand, canChangeAthlete);

  return (
    <>
      <div className="online-mode-banner">
        <span>{`在线房间: ${room.roomName}`}</span>
        {isHost ? <button className="ghost-button danger" type="button" onClick={onReset}>重置房间</button> : null}
      </div>
      {content}
    </>
  );
}

function renderOnlineGameScreen(
  game: GameState,
  playerId: string,
  isHost: boolean,
  onBack: () => void,
  onCommand: (command: GameCommand) => void,
  canChangeAthlete: (athleteId: string) => boolean,
) {
  if (game.phase === "teamReveal") {
    return (
      <TeamRevealScreen
        game={game}
        onNewGame={onBack}
        onClearGame={onBack}
        onRandomizeTeams={() => onCommand({ type: "ASSIGN_TEAMS" })}
        onBeginSelection={() => onCommand({ type: "BEGIN_SELECTION" })}
        canBeginSelection={isHost}
        canRandomizeTeams={isHost}
      />
    );
  }

  if (game.phase === "selecting") {
    return (
      <SelectionScreen
        game={game}
        selectionPlayerId={playerId}
        onBack={onBack}
        onSelectAthlete={(ownerId, athleteId) => onCommand({ type: "SELECT_ATHLETE", playerId: ownerId, athleteId })}
        onLockSelection={(ownerId) => onCommand({ type: "LOCK_SELECTION", playerId: ownerId })}
      />
    );
  }

  if (game.phase === "raceReveal") {
    return (
      <RaceRevealScreen
        game={game}
        onPredictionChange={(athleteId, predictedAthleteId) => onCommand({ type: "SET_MASTERMIND_PREDICTION", athleteId, predictedAthleteId })}
        onCopyChoiceChange={(athleteId, copiedAthleteId) => onCommand({ type: "SET_BEFORE_RACE_COPY_CHOICE", athleteId, copiedAthleteId })}
        onStartRace={() => onCommand({ type: "REVEAL_RACE" })}
        canChangeAthlete={canChangeAthlete}
        canStartRace={isHost}
      />
    );
  }

  if (game.phase === "racing") {
    return (
      <RaceScreen
        game={game}
        canActAsPlayer={(ownerId) => ownerId === playerId}
        onRoll={(entrantId, choice?: MainMoveChoice) => onCommand({ type: "ROLL_DICE", playerId: entrantId, choice })}
        onConfirmReaction={(ownerId, reactionId, accepted, targetEntrantId) => onCommand({
          type: "CONFIRM_REACTION",
          playerId: ownerId,
          reactionId,
          accepted,
          targetEntrantId,
        })}
      />
    );
  }

  if (game.phase === "raceResults") {
    return <RaceResultsScreen game={game} onContinue={() => onCommand({ type: "BEGIN_NEXT_RACE" })} canContinue={isHost} />;
  }

  return <FinalResultsScreen game={game} onNewGame={onBack} />;
}
