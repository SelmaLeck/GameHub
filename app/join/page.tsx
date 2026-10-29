"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { generateSecret, hostSessionKey, playerSessionKey } from "@/lib/game";
import { supabase } from "@/lib/supabase";

function friendlyJoinError(message: string) {
  if (message.includes("LOBBY_NOT_FOUND")) return "Lobby nicht gefunden.";
  if (message.includes("LOBBY_LOCKED")) return "Diese Lobby ist gesperrt.";
  if (message.includes("GAME_ALREADY_STARTED")) return "Dieses Spiel wurde bereits gestartet.";
  if (message.includes("duplicate key")) return "Der Name ist in dieser Lobby schon vergeben.";
  return message;
}

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanName || !cleanCode) return;

    setLoading(true);
    setError("");
    try {
      const playerToken = generateSecret();
      const { data, error: joinError } = await supabase.rpc("join_game", {
        p_code: cleanCode,
        p_name: cleanName,
        p_player_token: playerToken,
      });

      if (joinError) throw new Error(friendlyJoinError(joinError.message));
      const player = data?.[0];
      if (!player) throw new Error("Beitritt fehlgeschlagen.");
      const gameId = player.game_id;

      // Falls dieser Tab vom Host-Tab dupliziert wurde, Host-Geheimnis hier bewusst entfernen.
      sessionStorage.removeItem(hostSessionKey(gameId));
      sessionStorage.setItem(
        playerSessionKey(gameId),
        JSON.stringify({ id: player.player_id, name: player.player_name, token: playerToken })
      );
      router.push(`/lobby/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beitritt fehlgeschlagen.");
      setLoading(false);
    }
  }

  return (
    <main className="center-page">
      <form className="card form-card" onSubmit={onSubmit}>
        <Brand />
        <h1>Lobby beitreten</h1>
        <p className="subtle">Deinen Namen und den Lobby-Code eingeben.</p>

        <div className="field">
          <label htmlFor="name">1. Dein Name</label>
          <input id="name" className="input" maxLength={18} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Spielername" autoFocus />
        </div>

        <div className="field">
          <label htmlFor="code">2. Lobby-Code</label>
          <input id="code" className="input code-input" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
        </div>

        {error && <div className="error">{error}</div>}
        <div className="spacer" />
        <button className="btn btn-primary btn-wide" disabled={loading || !name.trim() || code.trim().length !== 6}>
          {loading ? "Trete bei …" : "Beitreten"}
        </button>
        <div className="spacer" />
        <Link className="muted small" href="/private">← Zurück</Link>
      </form>
    </main>
  );
}
