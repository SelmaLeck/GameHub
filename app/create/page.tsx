"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import {
  generateLobbyCode,
  generateSecret,
  hostSessionKey,
  playerSessionKey,
} from "@/lib/game";
import { supabase } from "@/lib/supabase";

export default function CreateLobbyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [totalRounds, setTotalRounds] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    try {
      const hostToken = generateSecret();
      const playerToken = generateSecret();
      let created: { game_id: string; game_code: string; player_id: string; player_name: string } | null = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateLobbyCode();
        const { data, error: createError } = await supabase.rpc("create_game_with_host", {
          p_code: code,
          p_total_rounds: totalRounds,
          p_host_name: name.trim(),
          p_host_token: hostToken,
          p_player_token: playerToken,
        });

        if (!createError && data?.[0]) {
          created = data[0];
          break;
        }
        if (createError?.code !== "23505") throw createError;
      }

      if (!created) throw new Error("Lobby-Code konnte nicht erzeugt werden.");

      const gameId = created.game_id;
      sessionStorage.setItem(
        playerSessionKey(gameId),
        JSON.stringify({ id: created.player_id, name: created.player_name, token: playerToken })
      );
      sessionStorage.setItem(hostSessionKey(gameId), hostToken);

      router.push(`/lobby/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lobby konnte nicht erstellt werden.");
      setLoading(false);
    }
  }

  return (
    <main className="center-page">
      <form className="card form-card" onSubmit={onSubmit}>
        <Brand />
        <h1>Lobby erstellen</h1>
        <p className="subtle">Du bist der Gruppenchef. Der Lobby-Code wird in der Lobby stream-sicher geblurrt angezeigt.</p>

        <div className="field">
          <label htmlFor="name">Dein Name</label>
          <input id="name" className="input" maxLength={18} value={name} onChange={(e) => setName(e.target.value)} placeholder="" autoFocus />
        </div>

        <div className="field">
          <label htmlFor="rounds">Runden</label>
          <input id="rounds" className="input" type="number" min={3} max={130} value={totalRounds} onChange={(e) => setTotalRounds(Number(e.target.value))} />
        </div>

        {error && <div className="error">{error}</div>}
        <div className="spacer" />
        <button className="btn btn-primary btn-wide" disabled={loading || !name.trim()}>
          {loading ? "Erstelle Lobby …" : "Lobby erstellen"}
        </button>
        <div className="spacer" />
        <Link className="muted small" href="/private">← Zurück</Link>
      </form>
    </main>
  );
}
