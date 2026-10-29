import Link from "next/link";
import { formatTime, sortLeaderboard, type LeaderboardEntry } from "@/lib/chat-game";

export function FinalLeaderboard({ title, entries, onAgain }: { title: string; entries: LeaderboardEntry[]; onAgain: () => void }) {
  const ranked = sortLeaderboard(entries);
  const champion = ranked[0];
  return (
    <section className="card final-card">
      <span className="eyebrow">SPIEL BEENDET</span>
      <h1>{title}</h1>
      {champion ? (
        <>
          <div className="champion-box">
            <span>CHAT CHAMPION</span>
            <strong>@{champion.userName}</strong>
            <b>{champion.wins} {champion.wins === 1 ? "Sieg" : "Siege"}</b>
          </div>
          <div className="final-ranking">
            {ranked.slice(0, 10).map((entry, index) => (
              <div className="final-row" key={entry.userId}>
                <span>{index + 1}.</span>
                <strong>@{entry.userName}</strong>
                <b>{entry.wins}</b>
                <small>Ø {formatTime(entry.totalWinMs / Math.max(1, entry.wins))}</small>
              </div>
            ))}
          </div>
        </>
      ) : <p className="empty-copy">Diesmal gab es keine richtigen Antworten.</p>}
      <div className="final-actions">
        <button className="btn btn-primary" type="button" onClick={onAgain}>NOCHMAL</button>
        <Link className="btn" href="/">ZUM HUB</Link>
      </div>
    </section>
  );
}
