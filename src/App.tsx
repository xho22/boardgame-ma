import { HomeScreen } from "./components/HomeScreen";
import { RaceRevealScreen } from "./components/RaceRevealScreen";
import { SelectionScreen } from "./components/SelectionScreen";
import { SetupScreen } from "./components/SetupScreen";
import { TeamRevealScreen } from "./components/TeamRevealScreen";
import { useGameStore } from "./store/gameStore";
import "./styles/globals.css";

export function App() {
  const {
    view,
    game,
    hasSavedGame,
    openSetup,
    returnHome,
    startNewGame,
    continueGame,
    clearGame,
    beginSelection,
    selectAthlete,
    lockSelection,
  } = useGameStore();

  if (view === "setup") {
    return <SetupScreen onStartGame={startNewGame} onBack={returnHome} />;
  }

  if (view === "teamReveal" && game) {
    return (
      <TeamRevealScreen
        game={game}
        onNewGame={openSetup}
        onClearGame={clearGame}
        onBeginSelection={beginSelection}
      />
    );
  }

  if (view === "selecting" && game) {
    return <SelectionScreen game={game} onSelectAthlete={selectAthlete} onLockSelection={lockSelection} />;
  }

  if (view === "raceReveal" && game) {
    return <RaceRevealScreen game={game} />;
  }

  return <HomeScreen hasSavedGame={hasSavedGame} onNewGame={openSetup} onContinueGame={continueGame} />;
}
