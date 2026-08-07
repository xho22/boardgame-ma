type HomeScreenProps = {
  hasSavedGame: boolean;
  onNewGame: () => void;
  onContinueGame: () => void;
  onOpenCatalog: () => void;
};

export function HomeScreen({ hasSavedGame, onNewGame, onContinueGame, onOpenCatalog }: HomeScreenProps) {
  return (
    <main className="app-shell home-layout">
      <section className="hero">
        <p className="eyebrow">Family racing board game</p>
        <h1>boardgame-ma</h1>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onNewGame}>
            New Game
          </button>
          <button className="secondary-button" type="button" onClick={onContinueGame} disabled={!hasSavedGame}>
            Continue
          </button>
          <button className="ghost-button" type="button" onClick={onOpenCatalog}>
            Racers
          </button>
        </div>
      </section>
    </main>
  );
}
