import { STANDARD_ATHLETES } from "../game/athletes";

type AthleteCatalogScreenProps = {
  onBack: () => void;
};

export function AthleteCatalogScreen({ onBack }: AthleteCatalogScreenProps) {
  return (
    <main className="app-shell screen-layout">
      <header className="top-bar">
        <button className="ghost-button" type="button" onClick={onBack} aria-label="Back to home">
          Back
        </button>
        <h1>Racers</h1>
        <span />
      </header>

      <section className="catalog-grid" aria-label="Racer catalog">
        {STANDARD_ATHLETES.map((athlete) => (
          <article className="catalog-card" key={athlete.id}>
            <div>
              <h2>{athlete.displayName}</h2>
              <p>{athlete.standardName}</p>
            </div>
            <span>{athlete.type}</span>
            <p>{athlete.abilityText}</p>
            <code>{athlete.implementationKey}</code>
          </article>
        ))}
      </section>
    </main>
  );
}
