"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { PlayerList } from "@/components/PlayerList";
import {
  hostSessionKey,
  playerSessionKey,
  nextPromptFromDeck,
  resetPromptDeck,
} from "@/lib/game";
import { supabase } from "@/lib/supabase";
import type { Game, LocalPlayer, Player } from "@/lib/types";

export default function LobbyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const gameId = String(params.id ?? "");
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [localPlayer, setLocalPlayer] = useState<LocalPlayer | null>(null);
  const [hostToken, setHostToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const isHost = useMemo(
    () => !!game && !!localPlayer && game.host_player_id === localPlayer.id && !!hostToken,
    [game, localPlayer, hostToken]
  );

  const loadLobby = useCallback(async () => {
    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .select("id,code,host_player_id,status,round,total_rounds,score,current_prompt,revealed,round_result,is_locked,created_at")
      .eq("id", gameId)
      .single();

    if (gameError || !gameData) {
      setError("Lobby nicht gefunden.");
      setLoading(false);
      return;
    }
    setGame(gameData as Game);

    const { data: playerData } = await supabase
      .from("players")
      .select("id,game_id,name,submitted_round,created_at")
      .eq("game_id", gameData.id)
      .order("created_at");
    setPlayers((playerData ?? []) as Player[]);
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    const raw = sessionStorage.getItem(playerSessionKey(gameId));
    if (raw) {
      try { setLocalPlayer(JSON.parse(raw)); } catch { /* ignore */ }
    }
    setHostToken(sessionStorage.getItem(hostSessionKey(gameId)) ?? "");
    loadLobby();
  }, [gameId, loadLobby]);

  useEffect(() => {
    if (!game?.id) return;
    const channel = supabase
      .channel(`lobby-${game.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${game.id}` }, loadLobby)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${game.id}` }, (payload) => {
        const next = payload.new as Game;
        setGame(next);
        if (next.status === "playing") router.push(`/game/${gameId}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [game?.id, loadLobby, router, gameId]);

async function startGame() {
  if (!game || !isHost) return;

  setError("");

  const deckScope = `private-${game.id}`;

  resetPromptDeck(deckScope);

  const { error: updateError } = await supabase.rpc("start_game", {
    p_code: game.code,
    p_host_token: hostToken,
    p_prompt: nextPromptFromDeck(deckScope),
  });

  if (updateError) {
    setError(updateError.message);
  }
}
  async function toggleLock() {
    if (!game || !isHost) return;
    setError("");
    const { error: lockError } = await supabase.rpc("set_lobby_locked", {
      p_code: game.code,
      p_host_token: hostToken,
      p_locked: !game.is_locked,
    });
    if (lockError) setError(lockError.message);
  }

 async function copyCode() {
  if (!game) return;

  await navigator.clipboard.writeText(game.code);

  setCopied(true);
  window.setTimeout(() => setCopied(false), 1300);
}

  if (loading) return <main className="center-page"><div className="muted">Lobby lädt …</div></main>;
  if (error && !game) return <main className="center-page"><div className="card form-card"><h1>Oops</h1><div className="error">{error}</div><div className="spacer"/><Link href="/" className="btn">Startseite</Link></div></main>;
  if (!game) return null;

  return (
    <main className="page-shell">
      <div className="topbar">
        <Brand />
        <span className="pill">{players.length} Spieler</span>
      </div>

      <div className="lobby-grid">
        <section className="card lobby-panel">
          {isHost ? (
            <>
              <div className="prompt-label">Lobby-Code</div>
              <div className="lobby-code-wrap" aria-label="Lobby-Code aus Streamschutz geblurrt">
                <div className="lobby-code lobby-code-blurred">{game.code}</div>
              </div>
              <p className="subtle">Kopiere den Code und schick ihn privat an deine Mitspieler.</p>
              <button className="btn btn-ghost" onClick={copyCode}>{copied ? "Code kopiert ✓" : "Lobby-Code kopieren"}</button>
            </>
          ) : (
            <>
              <div className="prompt-label">Lobby</div>
              <div className="joined-title">Beigetreten ✓</div>
              <p className="subtle">Warte hier, bis der Host das Spiel startet.</p>
            </>
          )}

          <div className="lock-row">
            <span className={`lock-state ${game.is_locked ? "locked" : "open"}`}>
              {game.is_locked ? "🔒 Lobby gesperrt" : "🔓 Lobby offen"}
            </span>
            {isHost && <button className="btn" onClick={toggleLock}>{game.is_locked ? "Lobby öffnen" : "Lobby sperren"}</button>}
          </div>
        </section>

        <section className="card lobby-panel">
          <div className="prompt-label">Spieler</div>
          <PlayerList players={players} hostId={game.host_player_id} />
          {isHost ? (
            <button className="btn btn-primary btn-wide" onClick={startGame} disabled={players.length < 2}>
              {players.length < 2 ? "Warte auf mindestens 1 Mitspieler …" : `Spiel mit ${players.length} Spielern starten`}
            </button>
          ) : (
            <div className="pill" style={{ textAlign: "center" }}>Warte darauf, dass der Host startet …</div>
          )}
          {error && <div className="error">{error}</div>}
        </section>
      </div>
    </main>
  );
}
