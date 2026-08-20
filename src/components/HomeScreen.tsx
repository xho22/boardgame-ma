type HomeScreenProps = {
  hasSavedGame: boolean;
  onNewGame: () => void;
  onContinueGame: () => void;
  onOpenCatalog: () => void;
  onOpenOnlineRoom: () => void;
};

declare const __BUILD_TIMESTAMP__: string;

const BUILD_TIMESTAMP = typeof __BUILD_TIMESTAMP__ === "string"
  ? __BUILD_TIMESTAMP__
  : "1970-01-01T00:00:00.000Z";

export function formatBuildTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

export function HomeScreen({ hasSavedGame, onNewGame, onContinueGame, onOpenCatalog, onOpenOnlineRoom }: HomeScreenProps) {
  return (
    <main className="app-shell home-layout">
      <section className="hero">
        <p className="eyebrow">Family racing board game</p>
        <h1>boardgame-ma</h1>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onNewGame}>
            Local Game
          </button>
          <button className="secondary-button" type="button" onClick={onOpenOnlineRoom}>Online Room</button>
          <button className="secondary-button" type="button" onClick={onContinueGame} disabled={!hasSavedGame}>
            Continue
          </button>
          <button className="ghost-button" type="button" onClick={onOpenCatalog}>
            Racers
          </button>
        </div>
        <p className="build-info">{`最后更新：${formatBuildTimestamp(BUILD_TIMESTAMP)}（UTC+8）`}</p>
      </section>
    </main>
  );
}
