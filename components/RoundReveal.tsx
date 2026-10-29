import { formatTime, type RoundHit } from "@/lib/chat-game";

export function RoundReveal({
  answer,
  hits,
  onNext,
  isLast,
}: {
  answer: string;
  hits: RoundHit[];
  onNext: () => void;
  isLast: boolean;
}) {
  return (
    <section className="round-reveal">
      <span className="reveal-kicker">RICHTIG ERRATEN</span>
      <h2>{answer}</h2>
      <div className="fastest-list">
        {hits.length === 0 ? (
          <p className="empty-copy">Niemand hat es erraten.</p>
        ) : hits.slice(0, 3).map((hit, index) => (
          <div className={`fastest-row fastest-${index + 1}`} key={hit.userId}>
            <span className="fastest-place">{index + 1}</span>
            <strong>@{hit.userName}</strong>
            <span>{formatTime(hit.ms)}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" type="button" onClick={onNext}>{isLast ? "ERGEBNIS" : "NÄCHSTE RUNDE"}</button>
    </section>
  );
}
