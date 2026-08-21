import { useEffect, useRef, useState } from "react";
import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import { isEntrantAloneInLead } from "../game/abilityEngine";
import type { AbilityImplementationKey } from "../game/abilityTypes";
import type { Entrant, MainMoveChoice, Player, RaceState } from "../game/types";

type DicePanelProps = {
  debugMode: boolean;
  race: RaceState;
  currentPlayer: Player;
  currentEntrant: Entrant;
  effectiveAbilityKey: AbilityImplementationKey;
  interactionBlocked?: boolean;
  onRoll: (playerId: string, choice?: MainMoveChoice) => void;
};

export function DicePanel({ debugMode, race, currentPlayer, currentEntrant, effectiveAbilityKey, interactionBlocked = false, onRoll }: DicePanelProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [rollingValue, setRollingValue] = useState(1);
  const [revealedRollValue, setRevealedRollValue] = useState<number | null>(null);
  const [useBeforeMainAbility, setUseBeforeMainAbility] = useState(false);
  const [selectedTargetEntrantId, setSelectedTargetEntrantId] = useState("");
  const [selectedThirdWheelPosition, setSelectedThirdWheelPosition] = useState<number | "">("");
  const [geniusGuess, setGeniusGuess] = useState<"" | 1 | 2 | 3 | 4 | 5 | 6>("");
  const [forcedDieRoll, setForcedDieRoll] = useState<1 | 2 | 3 | 4 | 5 | 6>(6);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const awaitingRollResultRef = useRef(false);
  const isDiceBusy = isRolling || revealedRollValue !== null;
  const hareSkipsTurn =
    effectiveAbilityKey === "hare_fast_unless_alone_lead" &&
    race.finishers.length === 0 &&
    isEntrantAloneInLead(race, currentEntrant);
  const automaticallySkipsTurn = currentEntrant.skippedTurns > 0 || hareSkipsTurn;

  function stopRollAnimation() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }

    awaitingRollResultRef.current = false;
    setIsRolling(false);
  }

  useEffect(() => {
    if (awaitingRollResultRef.current || revealedRollValue !== null) {
      return;
    }

    setIsRolling(false);
    setRollingValue(race.previousDieRoll ?? 1);
    setUseBeforeMainAbility(false);
    setSelectedTargetEntrantId("");
    setSelectedThirdWheelPosition("");
    setGeniusGuess("");
    setForcedDieRoll(6);
  }, [currentEntrant.id, currentPlayer.id, race.previousDieRoll]);

  useEffect(() => {
    if (!awaitingRollResultRef.current || race.previousDieRoll == null) {
      return;
    }

    const confirmedDieRoll = race.previousDieRoll;
    awaitingRollResultRef.current = false;
    setIsRolling(false);
    setRollingValue(confirmedDieRoll);
    setRevealedRollValue(confirmedDieRoll);
    revealTimeoutRef.current = window.setTimeout(() => {
      revealTimeoutRef.current = null;
      setRevealedRollValue(null);
      setUseBeforeMainAbility(false);
      setSelectedTargetEntrantId("");
      setSelectedThirdWheelPosition("");
      setGeniusGuess("");
      setForcedDieRoll(6);
    }, 1_000);
  }, [currentEntrant.id, race.previousDieRoll]);

  useEffect(() => {
    return () => {
      stopRollAnimation();
    };
  }, []);

  useEffect(() => {
    if (!automaticallySkipsTurn || isDiceBusy || interactionBlocked) {
      return;
    }

    const recoveryTimer = window.setTimeout(() => {
      onRoll(currentEntrant.id);
    }, 3_000);

    return () => window.clearTimeout(recoveryTimer);
  }, [automaticallySkipsTurn, currentEntrant.id, interactionBlocked, isDiceBusy, onRoll]);

  function startRollAnimation(choice?: MainMoveChoice) {
    if (isRolling || revealedRollValue !== null || interactionBlocked) {
      return;
    }

    setIsRolling(true);
    setRevealedRollValue(null);
    intervalRef.current = window.setInterval(() => {
      setRollingValue(Math.floor(Math.random() * 6) + 1);
    }, 80);
    timeoutRef.current = window.setTimeout(() => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      timeoutRef.current = null;
      awaitingRollResultRef.current = true;
      onRoll(currentEntrant.id, choice);
    }, 2_000);
  }

  function useDirectAbility(choice: MainMoveChoice) {
    if (isRolling || revealedRollValue !== null || interactionBlocked) {
      return;
    }

    onRoll(currentEntrant.id, choice);
  }

  const displayValue = isRolling ? rollingValue : (revealedRollValue ?? race.previousDieRoll ?? "-");
  const currentAthlete = STANDARD_ATHLETE_BY_ID.get(currentEntrant.athleteId);
  const abilityKey = effectiveAbilityKey;
  const copiedAthlete = currentAthlete?.implementationKey !== abilityKey
    ? [...STANDARD_ATHLETE_BY_ID.values()].find((athlete) => athlete.implementationKey === abilityKey)
    : null;
  const hasFlipFlopTarget =
    abilityKey === "warp_swap_instead_main_move" &&
    race.entrants.some(
      (entrant) =>
        entrant.id !== currentEntrant.id &&
        !entrant.finished &&
        !entrant.eliminated,
    );
  const activeOpponents = race.entrants.filter(
    (entrant) => entrant.id !== currentEntrant.id && !entrant.finished && !entrant.eliminated,
  );
  const uniqueLast = (() => {
    const activeEntrants = race.entrants.filter((entrant) => !entrant.finished && !entrant.eliminated);
    const lastPosition = Math.min(...activeEntrants.map((entrant) => entrant.position));
    const lastEntrants = activeEntrants.filter((entrant) => entrant.position === lastPosition);

    return lastEntrants.length === 1 ? lastEntrants[0] : null;
  })();
  const thirdWheelSpaces = (() => {
    const counts = new Map<number, number>();

    for (const entrant of activeOpponents) {
      counts.set(entrant.position, (counts.get(entrant.position) ?? 0) + 1);
    }

    return [...counts.entries()]
      .filter(([, count]) => count === 2)
      .map(([position]) => position)
      .sort((first, second) => first - second);
  })();
  const entrantLabel = (entrant: Entrant) => {
    const player = race.entrants.find((candidate) => candidate.id === entrant.id);
    const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);

    return `${athlete?.displayName ?? entrant.id}（${player?.position ?? entrant.position} 格）`;
  };
  const rollChoice: MainMoveChoice = {
    useLegsFixedMove: false,
    useFlipFlopSwap: false,
    flipFlopTargetEntrantId: selectedTargetEntrantId || undefined,
    useCheerleader: abilityKey === "cheer_last_place_then_self" ? useBeforeMainAbility : undefined,
    usePartyAnimal: abilityKey === "pull_all_then_bonus_per_guest" ? useBeforeMainAbility : undefined,
    useHypnotist: abilityKey === "warp_racer_to_self_before_main" ? useBeforeMainAbility : undefined,
    hypnotistTargetEntrantId: selectedTargetEntrantId || undefined,
    useThirdWheel: abilityKey === "warp_to_exactly_two_before_main" ? useBeforeMainAbility : undefined,
    thirdWheelTargetPosition: selectedThirdWheelPosition === "" ? undefined : selectedThirdWheelPosition,
    geniusGuess: abilityKey === "predict_roll_extra_turn" && geniusGuess !== "" ? geniusGuess : undefined,
    forcedDieRoll: debugMode ? forcedDieRoll : undefined,
  };
  const needsSelectedTarget =
    useBeforeMainAbility &&
    ((abilityKey === "warp_racer_to_self_before_main" && !selectedTargetEntrantId) ||
      (abilityKey === "warp_to_exactly_two_before_main" && selectedThirdWheelPosition === ""));

  return (
    <section className="dice-panel" aria-label="Current turn">
      {currentAthlete ? (
        <img className="current-racer-image" src={currentAthlete.imagePath} alt={currentAthlete.displayName} />
      ) : null}
      <div className="current-racer-copy">
        <p className="eyebrow">Current turn</p>
        <h2>{currentPlayer.name}</h2>
        {currentAthlete ? (
          <>
            <h3>{`${currentAthlete.displayName} / ${currentAthlete.standardName}`}</h3>
            <p>{currentAthlete.abilityText}</p>
            {copiedAthlete ? <p className="choice-hint">{`当前复制：${copiedAthlete.displayName} - ${copiedAthlete.abilityText}`}</p> : null}
          </>
        ) : null}
      </div>
      <div className={`dice-readout ${isRolling ? "rolling" : ""}`} aria-label="Last die roll">
        {automaticallySkipsTurn ? "休" : displayValue}
      </div>
      <div className="ability-choice-panel">
        {automaticallySkipsTurn ? (
          <div className="recovery-panel" role="status">
            <strong>{hareSkipsTurn ? "野兔独自领先，本回合跳过" : "绊倒恢复中"}</strong>
            <span>3 秒后自动进入下一回合</span>
          </div>
        ) : abilityKey === "cheer_last_place_then_self" ? (
          <>
            <div className="ability-choice-actions" aria-label="啦啦队长能力选择">
              <button className="secondary-button" type="button" onClick={() => startRollAnimation({ ...rollChoice, useCheerleader: false })} disabled={isDiceBusy || interactionBlocked}>
                {isRolling ? "掷骰中..." : "直接掷骰"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => startRollAnimation({ ...rollChoice, useCheerleader: true })}
                disabled={isDiceBusy || interactionBlocked || !uniqueLast}
              >
                先支援最后一名再掷骰
              </button>
            </div>
            {!uniqueLast ? <p className="choice-hint">没有唯一的最后一名，本回合不能使用支援。</p> : null}
          </>
        ) : abilityKey === "pull_all_then_bonus_per_guest" ? (
          <>
            <div className="ability-choice-actions" aria-label="派对动物能力选择">
              <button className="secondary-button" type="button" onClick={() => startRollAnimation({ ...rollChoice, usePartyAnimal: false })} disabled={isDiceBusy || interactionBlocked}>
                {isRolling ? "掷骰中..." : "直接掷骰"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => startRollAnimation({ ...rollChoice, usePartyAnimal: true })}
                disabled={isDiceBusy || interactionBlocked}
              >
                召集派对后掷骰
              </button>
            </div>
          </>
        ) : abilityKey === "predict_roll_extra_turn" ? (
          <>
            <label className="ability-select">
              <span>预测点数</span>
              <select
                value={geniusGuess}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setGeniusGuess(nextValue === "" ? "" : (Number(nextValue) as 1 | 2 | 3 | 4 | 5 | 6));
                }}
              >
                <option value="">不预测</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
                <option value={6}>6</option>
              </select>
            </label>
            {debugMode ? (
              <label className="ability-select">
                <span>本次骰点</span>
                <select
                  value={forcedDieRoll}
                  onChange={(event) => setForcedDieRoll(Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6)}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                </select>
              </label>
            ) : null}
            <button className="primary-button" type="button" onClick={() => startRollAnimation(rollChoice)} disabled={isDiceBusy || interactionBlocked}>
              {isRolling ? "掷骰中..." : "猜好后掷骰"}
            </button>
          </>
        ) : abilityKey === "main_move_fixed_five_optional" ? (
          <>
            {debugMode ? (
              <label className="ability-select">
                <span>本次骰点</span>
                <select
                  value={forcedDieRoll}
                  onChange={(event) => setForcedDieRoll(Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6)}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                </select>
              </label>
            ) : null}
            <div className="ability-choice-actions" aria-label="长腿能力选择">
              <button className="secondary-button" type="button" onClick={() => startRollAnimation(rollChoice)} disabled={isDiceBusy || interactionBlocked}>
                {isRolling ? "掷骰中..." : "掷骰移动"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => useDirectAbility({ useLegsFixedMove: true })}
                disabled={isDiceBusy || interactionBlocked}
              >
                直接移动 5 格
              </button>
            </div>
          </>
        ) : (
          <>
            {abilityKey === "warp_swap_instead_main_move" && hasFlipFlopTarget ? (
              <div className="ability-choice-actions">
                <label className="ability-select">
                  <span>换位目标</span>
                  <select value={selectedTargetEntrantId} onChange={(event) => setSelectedTargetEntrantId(event.target.value)}>
                    <option value="">请选择选手</option>
                    {activeOpponents.map((entrant) => (
                      <option key={entrant.id} value={entrant.id}>
                        {entrantLabel(entrant)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => useDirectAbility({ useFlipFlopSwap: true, flipFlopTargetEntrantId: selectedTargetEntrantId })}
                  disabled={isDiceBusy || interactionBlocked || !selectedTargetEntrantId}
                >
                  使用能力换位
                </button>
              </div>
            ) : null}

            {abilityKey === "warp_racer_to_self_before_main" ||
            abilityKey === "warp_to_exactly_two_before_main" ? (
              <label className="ability-toggle">
                <input
                  type="checkbox"
                  checked={useBeforeMainAbility}
                  onChange={(event) => setUseBeforeMainAbility(event.target.checked)}
                />
                本回合使用可选能力
              </label>
            ) : null}

            {abilityKey === "warp_racer_to_self_before_main" && useBeforeMainAbility ? (
              <label className="ability-select">
                <span>传送目标</span>
                <select value={selectedTargetEntrantId} onChange={(event) => setSelectedTargetEntrantId(event.target.value)}>
                  <option value="">请选择选手</option>
                  {activeOpponents.map((entrant) => (
                    <option key={entrant.id} value={entrant.id}>
                      {entrantLabel(entrant)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {abilityKey === "warp_to_exactly_two_before_main" && useBeforeMainAbility ? (
              <label className="ability-select">
                <span>传送格</span>
                <select
                  value={selectedThirdWheelPosition}
                  onChange={(event) => setSelectedThirdWheelPosition(event.target.value === "" ? "" : Number(event.target.value))}
                >
                  <option value="">请选择格子</option>
                  {thirdWheelSpaces.map((position) => (
                    <option key={position} value={position}>{`${position} 格`}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {debugMode ? (
              <label className="ability-select">
                <span>本次骰点</span>
                <select
                  value={forcedDieRoll}
                  onChange={(event) => setForcedDieRoll(Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6)}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                </select>
              </label>
            ) : null}

            <button className="primary-button" type="button" onClick={() => startRollAnimation(rollChoice)} disabled={isDiceBusy || interactionBlocked || needsSelectedTarget}>
              {isRolling ? "掷骰中..." : "掷骰"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
