import { formatTime, sortLeaderboard, type LeaderboardEntry } from "@/lib/chat-game";

export function LiveLeaderboard({ entries, limit = 5 }: { entries: LeaderboardEntry[]; limit?: number }) {
  const ranked = sortLeaderboard(entries).slice(0, limit);
  return (
    <section className="leaderboard-card">
      <div className="leaderboard-title"><span>LIVE</span> LEADERBOARD</div>
      {ranked.length === 0 ? (
        <div className="leaderboard-empty">Noch hat niemand eine Runde gewonnen.</div>
      ) : (
        <div className="leaderboard-list">
          {ranked.map((entry, index) => (
            <div className={`leader-row rank-${index + 1}`} key={entry.userId}>
              <div className="leader-place">{index + 1}</div>
              <div className="leader-name">@{entry.userName}</div>
              <div className="leader-meta">
                <strong>{entry.wins}</strong>
                <span>{entry.wins === 1 ? "Sieg" : "Siege"}</span>
                <small>Ø {formatTime(entry.totalWinMs / Math.max(entry.wins, 1))}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
