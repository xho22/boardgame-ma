import { HomeScreen } from "./components/HomeScreen";
import { FinalResultsScreen } from "./components/FinalResultsScreen";
import { RaceRevealScreen } from "./components/RaceRevealScreen";
import { RaceResultsScreen } from "./components/RaceResultsScreen";
import { RaceScreen } from "./components/RaceScreen";
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
    revealRace,
    rollDice,
    beginNextRace,
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
    return <RaceRevealScreen game={game} onStartRace={revealRace} />;
  }

  if (view === "racing" && game) {
    return <RaceScreen game={game} onRoll={rollDice} />;
  }

  if (view === "raceResults" && game) {
    return <RaceResultsScreen game={game} onContinue={beginNextRace} />;
  }

  if (view === "finalResults" && game) {
    return <FinalResultsScreen game={game} onNewGame={openSetup} />;
  }

  return <HomeScreen hasSavedGame={hasSavedGame} onNewGame={openSetup} onContinueGame={continueGame} />;
}
