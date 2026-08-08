import { useEffect, useRef, useState } from "react";
import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { Entrant, MainMoveChoice, Player, RaceState } from "../game/types";

type DicePanelProps = {
  race: RaceState;
  currentPlayer: Player;
  currentEntrant: Entrant;
  onRoll: (playerId: string, choice?: MainMoveChoice) => void;
};

export function DicePanel({ race, currentPlayer, currentEntrant, onRoll }: DicePanelProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [rollingValue, setRollingValue] = useState(1);
  const [useBeforeMainAbility, setUseBeforeMainAbility] = useState(true);
  const [useRocketDouble, setUseRocketDouble] = useState(true);
  const [magicianMaxRerolls, setMagicianMaxRerolls] = useState<0 | 1 | 2>(2);
  const [geniusGuess, setGeniusGuess] = useState<"" | 1 | 2 | 3 | 4 | 5 | 6>("");
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setIsRolling(false);
    setRollingValue(race.previousFinalMoveValue ?? 1);
    setUseBeforeMainAbility(true);
    setUseRocketDouble(true);
    setMagicianMaxRerolls(2);
    setGeniusGuess("");
  }, [currentEntrant.id, currentPlayer.id, race.previousFinalMoveValue]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentEntrant.skippedTurns <= 0 || isRolling) {
      return;
    }

    const recoveryTimer = window.setTimeout(() => {
      onRoll(currentEntrant.id);
    }, 3_000);

    return () => window.clearTimeout(recoveryTimer);
  }, [currentEntrant.id, currentEntrant.skippedTurns, isRolling, onRoll]);

  function startRollAnimation(choice?: MainMoveChoice) {
    if (isRolling) {
      return;
    }

    setIsRolling(true);
    intervalRef.current = window.setInterval(() => {
      setRollingValue(Math.floor(Math.random() * 6) + 1);
    }, 80);
    timeoutRef.current = window.setTimeout(() => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      timeoutRef.current = null;
      onRoll(currentEntrant.id, choice);
    }, 2_000);
  }

  function useDirectAbility(choice: MainMoveChoice) {
    if (isRolling) {
      return;
    }

    onRoll(currentEntrant.id, choice);
  }

  const displayValue = isRolling ? rollingValue : (race.previousFinalMoveValue ?? "-");
  const currentAthlete = STANDARD_ATHLETE_BY_ID.get(currentEntrant.athleteId);
  const abilityKey = currentEntrant.copiedAbilityKey ?? currentAthlete?.implementationKey;
  const hasFlipFlopTarget =
    abilityKey === "warp_swap_instead_main_move" &&
    race.entrants.some(
      (entrant) =>
        entrant.id !== currentEntrant.id &&
        !entrant.finished &&
        !entrant.eliminated &&
        entrant.position > currentEntrant.position,
    );
  const rollChoice: MainMoveChoice = {
    useLegsFixedMove: false,
    useFlipFlopSwap: false,
    useCheerleader: abilityKey === "cheer_last_place_then_self" ? useBeforeMainAbility : undefined,
    useHypnotist: abilityKey === "warp_racer_to_self_before_main" ? useBeforeMainAbility : undefined,
    useThirdWheel: abilityKey === "warp_to_exactly_two_before_main" ? useBeforeMainAbility : undefined,
    useRocketScientistDouble: abilityKey === "optional_double_roll_then_trip" ? useRocketDouble : undefined,
    magicianMaxRerolls: abilityKey === "reroll_main_move_up_to_two" ? magicianMaxRerolls : undefined,
    geniusGuess: abilityKey === "predict_roll_extra_turn" && geniusGuess !== "" ? geniusGuess : undefined,
  };

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
          </>
        ) : null}
      </div>
      <div className={`dice-readout ${isRolling ? "rolling" : ""}`} aria-label="Last die roll">
        {currentEntrant.skippedTurns > 0 ? "休" : displayValue}
      </div>
      <div className="ability-choice-panel">
        {currentEntrant.skippedTurns > 0 ? (
          <div className="recovery-panel" role="status">
            <strong>绊倒恢复中</strong>
            <span>3 秒后自动进入下一回合</span>
          </div>
        ) : abilityKey === "cheer_last_place_then_self" ? (
          <>
            <div className="ability-choice-actions" aria-label="啦啦队长能力选择">
              <button className="secondary-button" type="button" onClick={() => startRollAnimation({ ...rollChoice, useCheerleader: false })} disabled={isRolling}>
                {isRolling ? "掷骰中..." : "直接掷骰"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => startRollAnimation({ ...rollChoice, useCheerleader: true })}
                disabled={isRolling}
              >
                先支援最后一名再掷骰
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
            <button className="primary-button" type="button" onClick={() => startRollAnimation(rollChoice)} disabled={isRolling}>
              {isRolling ? "掷骰中..." : "猜好后掷骰"}
            </button>
          </>
        ) : abilityKey === "main_move_fixed_five_optional" ? (
          <div className="ability-choice-actions" aria-label="长腿能力选择">
            <button className="secondary-button" type="button" onClick={() => startRollAnimation(rollChoice)} disabled={isRolling}>
              {isRolling ? "掷骰中..." : "掷骰移动"}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => useDirectAbility({ useLegsFixedMove: true })}
              disabled={isRolling}
            >
              直接移动 5 格
            </button>
          </div>
        ) : (
          <>
            {abilityKey === "warp_swap_instead_main_move" && hasFlipFlopTarget ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => useDirectAbility({ useFlipFlopSwap: true })}
                disabled={isRolling}
              >
                使用能力换位
              </button>
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

            {abilityKey === "optional_double_roll_then_trip" ? (
              <label className="ability-toggle">
                <input
                  type="checkbox"
                  checked={useRocketDouble}
                  onChange={(event) => setUseRocketDouble(event.target.checked)}
                />
                掷骰后使用火箭加倍
              </label>
            ) : null}

            {abilityKey === "reroll_main_move_up_to_two" ? (
              <label className="ability-select">
                <span>低点自动重掷次数</span>
                <select
                  value={magicianMaxRerolls}
                  onChange={(event) => setMagicianMaxRerolls(Number(event.target.value) as 0 | 1 | 2)}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </label>
            ) : null}

            <button className="primary-button" type="button" onClick={() => startRollAnimation(rollChoice)} disabled={isRolling}>
              {isRolling ? "掷骰中..." : "掷骰"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
