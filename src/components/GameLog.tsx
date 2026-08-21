import type { Athlete, GameLogEntry, Player } from "../game/types";

type GameLogProps = {
  entries: GameLogEntry[];
  players?: Player[];
  athletes?: Athlete[];
};

type ParticipantMatch = {
  label: string;
  color: string;
};

type Highlight = {
  start: number;
  end: number;
  kind: "racer" | "ability" | "dice";
  color?: string;
};

function findMatches(message: string, token: string): { start: number; end: number }[] {
  if (!token) {
    return [];
  }

  const matches: { start: number; end: number }[] = [];
  let start = message.indexOf(token);
  while (start >= 0) {
    matches.push({ start, end: start + token.length });
    start = message.indexOf(token, start + token.length);
  }
  return matches;
}

function getHighlights(message: string, participants: ParticipantMatch[], abilityNames: string[]): Highlight[] {
  const highlights: Highlight[] = [];
  const occupied = (start: number, end: number) => highlights.some((item) => start < item.end && end > item.start);

  for (const participant of participants.sort((first, second) => second.label.length - first.label.length)) {
    for (const match of findMatches(message, participant.label)) {
      if (!occupied(match.start, match.end)) {
        highlights.push({ ...match, kind: "racer", color: participant.color });
      }
    }
  }

  for (const abilityName of abilityNames.sort((first, second) => second.length - first.length)) {
    for (const match of findMatches(message, abilityName)) {
      if (!occupied(match.start, match.end)) {
        highlights.push({ ...match, kind: "ability" });
      }
    }
  }

  for (const match of message.matchAll(/(?:掷出了|实际为|保留点数)\s*(\d+)/g)) {
    const value = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf(value);
    const end = start + value.length;
    if (!occupied(start, end)) {
      highlights.push({ start, end, kind: "dice" });
    }
  }

  return highlights.sort((first, second) => first.start - second.start);
}

function renderMessage(message: string, participants: ParticipantMatch[], abilityNames: string[]) {
  const highlights = getHighlights(message, participants, abilityNames);
  if (highlights.length === 0) {
    return message;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const highlight of highlights) {
    if (highlight.start > cursor) {
      nodes.push(message.slice(cursor, highlight.start));
    }
    nodes.push(
      <mark
        className={`log-highlight ${highlight.kind}`}
        key={`${highlight.kind}-${highlight.start}`}
        style={highlight.color ? ({ "--log-racer-color": highlight.color } as React.CSSProperties) : undefined}
      >
        {message.slice(highlight.start, highlight.end)}
      </mark>,
    );
    cursor = highlight.end;
  }
  if (cursor < message.length) {
    nodes.push(message.slice(cursor));
  }
  return nodes;
}

export function GameLog({ entries, players = [], athletes = [] }: GameLogProps) {
  const visibleEntries = entries.map((entry, index) => ({ entry, number: index + 1 })).reverse();
  const participants = players.flatMap((player) =>
    athletes.map((athlete) => ({ label: `${player.name}的${athlete.displayName}`, color: player.color })),
  );
  const abilityNames = athletes.map((athlete) => athlete.displayName);

  return (
    <section className="game-log" aria-label="比赛日志">
      <h2>比赛日志</h2>
      <ol className="game-log-list">
        {visibleEntries.map(({ entry, number }) => {
          const highlights = getHighlights(entry.message, participants, abilityNames);
          const actorColor = highlights.find((highlight) => highlight.kind === "racer")?.color;
          return (
          <li key={entry.id} style={actorColor ? ({ "--log-entry-color": actorColor } as React.CSSProperties) : undefined}>
            <span>{number}</span>
            <p>{renderMessage(entry.message, participants, abilityNames)}</p>
          </li>
          );
        })}
      </ol>
    </section>
  );
}
