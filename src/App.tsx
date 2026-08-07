import { HomeScreen } from "./components/HomeScreen";
import { SetupScreen } from "./components/SetupScreen";
import { TeamRevealScreen } from "./components/TeamRevealScreen";
import { useGameStore } from "./store/gameStore";
import "./styles/globals.css";

export function App() {
  const { view, game, hasSavedGame, openSetup, returnHome, startNewGame, continueGame, clearGame } = useGameStore();

  if (view === "setup") {
    return <SetupScreen onStartGame={startNewGame} onBack={returnHome} />;
  }

  if (view === "teamReveal" && game) {
    return <TeamRevealScreen game={game} onNewGame={openSetup} onClearGame={clearGame} />;
  }

  return <HomeScreen hasSavedGame={hasSavedGame} onNewGame={openSetup} onContinueGame={continueGame} />;
}
