import type { Player } from "@/lib/types";

export function PlayerList({ players, hostId }: { players: Player[]; hostId: string | null }) {
  return (
    <div className="player-list">
      {players.map((player) => (
        <div className="player-row" key={player.id}>
          <div className="player-left">
            <div className="avatar">{player.name.slice(0, 1).toUpperCase()}</div>
            <strong>{player.name}</strong>
          </div>
          {player.id === hostId && <span className="host-tag">HOST</span>}
        </div>
      ))}
    </div>
  );
}
