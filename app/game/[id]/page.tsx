"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import {
  hostSessionKey,
  playerSessionKey,
  nextPromptFromDeck,
  resetPromptDeck,
} from "@/lib/game";
import { supabase } from "@/lib/supabase";
import type { Answer, Game, LocalPlayer, Player, RoundResult } from "@/lib/types";

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const gameId = String(params.id ?? "");

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [localPlayer, setLocalPlayer] = useState<LocalPlayer | null>(null);
  const [hostToken, setHostToken] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const isHost = useMemo(
    () => !!game && !!localPlayer && game.host_player_id === localPlayer.id && !!hostToken,
    [game, localPlayer, hostToken]
  );
  const me = useMemo(() => players.find((p) => p.id === localPlayer?.id), [players, localPlayer?.id]);
  const mySubmitted = !!game && me?.submitted_round === game.round;
  const submittedCount = game ? players.filter((p) => p.submitted_round === game.round).length : 0;
  const roundAnswers = useMemo(() => answers.filter((a) => a.round === game?.round), [answers, game?.round]);
  const allSubmitted = players.length > 0 && submittedCount >= players.length;

  const loadAll = useCallback(async () => {
    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .select("id,code,host_player_id,status,round,total_rounds,score,current_prompt,revealed,round_result,is_locked,created_at")
      .eq("id", gameId)
      .single();

    if (gameError || !gameData) {
      setError("Spiel nicht gefunden.");
      setLoading(false);
      return;
    }
    const nextGame = gameData as Game;
    setGame(nextGame);

    const playerQuery = supabase
      .from("players")
      .select("id,game_id,name,submitted_round,created_at")
      .eq("game_id", nextGame.id)
      .order("created_at");

    const answerQuery = supabase
      .from("answers")
      .select("id,game_id,player_id,round,answer,created_at")
      .eq("game_id", nextGame.id)
      .eq("round", nextGame.round)
      .order("created_at");

    const [{ data: playerData }, { data: answerData }] = await Promise.all([playerQuery, answerQuery]);
    setPlayers((playerData ?? []) as Player[]);
    setAnswers((answerData ?? []) as Answer[]);
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    const raw = sessionStorage.getItem(playerSessionKey(gameId));
    if (raw) {
      try { setLocalPlayer(JSON.parse(raw)); } catch { /* ignore */ }
    }
    setHostToken(sessionStorage.getItem(hostSessionKey(gameId)) ?? "");
    loadAll();
  }, [gameId, loadAll]);

  useEffect(() => {
    if (!game?.id) return;
    const channel = supabase
      .channel(`game-${game.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${game.id}` }, () => {
        setAnswerText("");
        loadAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${game.id}` }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [game?.id, loadAll]);

  useEffect(() => {
    if (game?.status === "lobby") router.replace(`/lobby/${gameId}`);
  }, [game?.status, router, gameId]);

  async function submitAnswer(e: FormEvent) {
    e.preventDefault();
    if (!game || !localPlayer || !answerText.trim() || mySubmitted || game.revealed) return;
    setError("");
    const { error: submitError } = await supabase.rpc("submit_answer", {
      p_code: game.code,
      p_player_id: localPlayer.id,
      p_player_token: localPlayer.token,
      p_answer: answerText.trim(),
    });
    if (submitError) {
      setError(submitError.message);
      return;
    }
    setAnswerText("");
    await loadAll();
  }

  async function skipPrompt() {
    if (!game || !isHost) return;

    setError("");

    const { error: skipError } = await supabase.rpc("skip_prompt", {
      p_code: game.code,
      p_host_token: hostToken,
      p_prompt: nextPromptFromDeck(`private-${game.id}`),
    });

    if (skipError) {
      setError(skipError.message);
      return;
    }

    // Sofort auch lokal auf einen frischen Prompt-Zustand wechseln.
    // Die DB-Funktion setzt submitted_round aller Spieler ebenfalls zurück.
    setAnswerText("");
    setAnswers([]);
    setPlayers((current) =>
      current.map((player) => ({ ...player, submitted_round: 0 })),
    );

    await loadAll();
  }

  async function reveal() {
    if (!game || !isHost || !allSubmitted) return;
    setError("");
    const { error: revealError } = await supabase.rpc("reveal_round", {
      p_code: game.code,
      p_host_token: hostToken,
    });
    if (revealError) setError(revealError.message);
  }

  async function judge(result: Exclude<RoundResult, null>) {
    if (!game || !isHost || !game.revealed || game.round_result) return;
    setError("");
    const { error: judgeError } = await supabase.rpc("judge_round", {
      p_code: game.code,
      p_host_token: hostToken,
      p_result: result,
    });
    if (judgeError) setError(judgeError.message);
  }

  async function nextRound() {
  if (!game || !isHost || !game.round_result) return;

  setError("");

  const { error: nextError } = await supabase.rpc("next_round", {
    p_code: game.code,
    p_host_token: hostToken,
    p_prompt: nextPromptFromDeck(`private-${game.id}`),
  });

  if (nextError) {
    setError(nextError.message);
  }
}

async function restart() {
  if (!game || !isHost) return;

  setError("");

  const deckScope = `private-${game.id}`;

  resetPromptDeck(deckScope);

  const { error: restartError } = await supabase.rpc("restart_game", {
    p_code: game.code,
    p_host_token: hostToken,
    p_prompt: nextPromptFromDeck(deckScope),
  });

  if (restartError) {
    setError(restartError.message);
  }
}

  if (loading) return <main className="center-page"><div className="muted">Spiel lädt …</div></main>;
  if (error && !game) return <main className="center-page"><div className="error">{error}</div></main>;
  if (!game) return null;

  if (game.status === "finished") {
    return (
      <main className="center-page">
        <section className="card finished" style={{ width: "min(620px, 100%)" }}>
          <Brand />
          <h1>Spiel beendet</h1>
          <p className="muted">Euer Ergebnis</p>
          <div className="finished-score">{game.score}/{game.total_rounds}</div>
          {isHost ? (
            <><div className="spacer" /><button className="btn btn-primary" onClick={restart}>Nochmal spielen</button></>
          ) : <p className="subtle">Warte auf den Host.</p>}
          {error && <div className="error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell private-game-page">
      <div className="topbar game-topbar">
        <Brand />
      </div>

      <div className="private-game-stage">
        <h1 className="private-game-title">ASSOZIATIONSSPIEL</h1>

        <div className="game-wrap">
          <section className="card game-card">
          <div className="prompt-label"></div>
          <div className="prompt">{game.current_prompt ?? "…"}</div>

          <div className="stats">
            <div className="stat">Punkte <strong>{game.score}</strong></div>
            <div className="stat">Runde <strong>{game.round}/{game.total_rounds}</strong></div>
            <div className="stat">Antworten <strong>{submittedCount}/{players.length}</strong></div>
          </div>

          {!game.revealed && (
            <form className="answer-box" onSubmit={submitAnswer}>
              <input
                className="input answer-input"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder={mySubmitted ? "Antwort abgeschickt" : "Deine Antwort …"}
                maxLength={48}
                disabled={mySubmitted}
                autoFocus
              />
              <div className="game-actions">
                <button className="btn" disabled={mySubmitted || !answerText.trim()}>Antwort abschicken</button>
                {isHost && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!allSubmitted}
                      onClick={reveal}
                    >
                      REVEAL
                    </button>

                    <button
                      type="button"
                      className="skip-button"
                      onClick={skipPrompt}
                    >
                      SKIP
                    </button>
                  </>
                )}
              </div>
              <p className="status-line">
                {mySubmitted ? "Deine Antwort ist gespeichert. Jetzt auf die anderen warten." : "Die Antworten der anderen sind vor dem Reveal nicht abrufbar."}
              </p>
            </form>
          )}

          {game.revealed && (
            <>
              <div className="reveal-grid">
                {players.map((player) => {
                  const answer = roundAnswers.find((a) => a.player_id === player.id);
                  return (
                    <div className="answer-card" key={player.id}>
                      <div className="answer-name">{player.name}</div>
                      <div className="answer-text">{answer?.answer ?? "—"}</div>
                    </div>
                  );
                })}
              </div>

              {game.round_result === "correct" && <div className="result-banner result-good">✓ RICHTIG — Punkt dazu</div>}
              {game.round_result === "wrong" && <div className="result-banner result-bad">✕ NICHT GLEICH</div>}

              {isHost ? (
                <div className="game-actions">
                  {!game.round_result ? (
                    <>
                      <button className="btn btn-good" onClick={() => judge("correct")}>RICHTIG</button>
                      <button className="btn btn-bad" onClick={() => judge("wrong")}>FALSCH</button>
                    </>
                  ) : (
                    <button className="btn btn-primary" onClick={nextRound}>{game.round >= game.total_rounds ? "ERGEBNIS" : "WEITER"}</button>
                  )}
                </div>
              ) : (
                <p className="status-line">Der Host entscheidet und startet die nächste Runde.</p>
              )}
            </>
          )}

            {error && <div className="error">{error}</div>}
          </section>
        </div>
      </div>
    </main>
  );
}
