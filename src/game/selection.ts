import { STANDARD_ATHLETES, STANDARD_ATHLETE_BY_ID } from "./athletes";
import type { Rng } from "./rng";
import type { GameState, SelectionState } from "./types";

export function beginSelection(game: GameState): GameState {
  const selectionState: SelectionState = {
    raceNumber: game.raceIndex + 1,
    activePlayerId: game.players[0]?.id ?? null,
    selectionsByPlayerId: Object.fromEntries(game.players.map((player) => [player.id, []])),
    mastermindPredictionsByAthleteId: {},
    eggCandidatesByAthleteId: {},
    copiedAbilityAthleteIdByAthleteId: {},
    lockedPlayerIds: [],
    revealed: false,
  };

  return {
    ...game,
    phase: "selecting",
    selectionState,
    revision: game.revision + 1,
  };
}

export function selectAthleteForRace(game: GameState, playerId: string, athleteId: string): GameState {
  const selectionState = requireSelectionState(game);
  const player = game.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }

  if (selectionState.lockedPlayerIds.includes(playerId)) {
    throw new Error(`${player.name} has already locked a racer`);
  }

  if (!player.athleteIds.includes(athleteId)) {
    throw new Error(`${athleteId} does not belong to ${player.name}`);
  }

  if (player.usedAthleteIds.includes(athleteId)) {
    throw new Error(`${athleteId} has already been used`);
  }

  const selectedAthleteIds = selectionState.selectionsByPlayerId[playerId] ?? [];
  const nextSelectedAthleteIds = selectedAthleteIds.includes(athleteId)
    ? selectedAthleteIds.filter((selectedAthleteId) => selectedAthleteId !== athleteId)
    : [...selectedAthleteIds, athleteId].slice(-game.settings.racersPerPlayerPerRace);

  return {
    ...game,
    selectionState: {
      ...selectionState,
      selectionsByPlayerId: {
        ...selectionState.selectionsByPlayerId,
        [playerId]: nextSelectedAthleteIds,
      },
      mastermindPredictionsByAthleteId: Object.fromEntries(
        Object.entries(selectionState.mastermindPredictionsByAthleteId ?? {}).filter(([mastermindAthleteId, predictedAthleteId]) =>
          nextSelectedAthleteIds.includes(mastermindAthleteId) || predictedAthleteId !== athleteId,
        ),
      ),
    },
    revision: game.revision + 1,
  };
}

export function setMastermindPrediction(game: GameState, athleteId: string, predictedAthleteId: string): GameState {
  const selectionState = requireSelectionState(game);
  const selectedAthleteIds = Object.values(selectionState.selectionsByPlayerId).flat();

  if (!selectionState.revealed) {
    throw new Error("Mastermind predictions can only be set after racers are revealed");
  }

  if (!selectedAthleteIds.includes(athleteId)) {
    throw new Error(`${athleteId} is not selected for this race`);
  }

  if (!selectedAthleteIds.includes(predictedAthleteId)) {
    throw new Error(`${predictedAthleteId} is not selected for this race`);
  }

  return {
    ...game,
    selectionState: {
      ...selectionState,
      mastermindPredictionsByAthleteId: {
        ...(selectionState.mastermindPredictionsByAthleteId ?? {}),
        [athleteId]: predictedAthleteId,
      },
    },
    revision: game.revision + 1,
  };
}

export function setBeforeRaceCopyChoice(game: GameState, athleteId: string, copiedAthleteId: string): GameState {
  const selectionState = requireSelectionState(game);
  const selectedAthleteIds = Object.values(selectionState.selectionsByPlayerId).flat();

  if (!selectionState.revealed || !selectedAthleteIds.includes(athleteId)) {
    throw new Error("Copy choices can only be set for revealed racers");
  }

  const athlete = STANDARD_ATHLETE_BY_ID.get(athleteId);
  if (!athlete) {
    throw new Error(`Unknown athlete: ${athleteId}`);
  }

  const allowedAthleteIds = athlete.implementationKey === "draft_temp_power_before_race"
    ? selectionState.eggCandidatesByAthleteId[athleteId] ?? []
    : athlete.implementationKey === "copy_previous_winner_before_race"
      ? previousWinnerAthleteIds(game)
      : [];

  if (!allowedAthleteIds.includes(copiedAthleteId)) {
    throw new Error(`${copiedAthleteId} cannot be copied by ${athlete.displayName}`);
  }

  return {
    ...game,
    selectionState: {
      ...selectionState,
      copiedAbilityAthleteIdByAthleteId: {
        ...selectionState.copiedAbilityAthleteIdByAthleteId,
        [athleteId]: copiedAthleteId,
      },
    },
    revision: game.revision + 1,
  };
}

export function lockPlayerSelection(game: GameState, playerId: string, rng: Rng): GameState {
  const selectionState = requireSelectionState(game);
  const playerIndex = game.players.findIndex((player) => player.id === playerId);

  if (playerIndex < 0) {
    throw new Error(`Unknown player: ${playerId}`);
  }

  const selectedAthleteIds = selectionState.selectionsByPlayerId[playerId] ?? [];

  if (selectedAthleteIds.length !== game.settings.racersPerPlayerPerRace) {
    throw new Error(
      `${game.players[playerIndex].name} must select ${game.settings.racersPerPlayerPerRace} racer(s) before locking`,
    );
  }

  const lockedPlayerIds = selectionState.lockedPlayerIds.includes(playerId)
    ? selectionState.lockedPlayerIds
    : [...selectionState.lockedPlayerIds, playerId];
  const nextPlayer = game.players.find((player) => !lockedPlayerIds.includes(player.id));
  const allLocked = lockedPlayerIds.length === game.players.length;
  const allSelectedAthleteIds = Object.values(selectionState.selectionsByPlayerId).flat();
  const eggCandidatesByAthleteId = allLocked
    ? Object.fromEntries(
        allSelectedAthleteIds
          .filter(
            (athleteId) => STANDARD_ATHLETE_BY_ID.get(athleteId)?.implementationKey === "draft_temp_power_before_race",
          )
          .map((eggAthleteId) => [
            eggAthleteId,
            rng
              .shuffle(
                STANDARD_ATHLETES.filter(
                  (athlete) => athlete.id !== eggAthleteId && !allSelectedAthleteIds.includes(athlete.id),
                ),
              )
              .slice(0, 3)
              .map((athlete) => athlete.id),
          ]),
      )
    : selectionState.eggCandidatesByAthleteId;

  return {
    ...game,
    phase: allLocked ? "raceReveal" : "selecting",
    selectionState: {
      ...selectionState,
      activePlayerId: nextPlayer?.id ?? null,
      lockedPlayerIds,
      revealed: allLocked,
      eggCandidatesByAthleteId,
    },
    revision: game.revision + 1,
  };
}

function previousWinnerAthleteIds(game: GameState): string[] {
  return [...new Set(
    game.races
      .slice(0, game.raceIndex)
      .flatMap((race) => race.finishers)
      .filter((finisher) => finisher.rank === 1)
      .map((finisher) => finisher.athleteId),
  )];
}

export function getActiveSelectionPlayer(game: GameState) {
  if (!game.selectionState?.activePlayerId) {
    return null;
  }

  return game.players.find((player) => player.id === game.selectionState?.activePlayerId) ?? null;
}

function requireSelectionState(game: GameState): SelectionState {
  if (!game.selectionState) {
    throw new Error("Selection has not started");
  }

  return game.selectionState;
}
