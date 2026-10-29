"use client";

import { useCallback, useEffect, useState } from "react";

type TwitchUser = { id: string; login: string };

export function HubTwitchStatus() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [user, setUser] = useState<TwitchUser | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/twitch/session", { cache: "no-store" });
      const data = await response.json();
      setConfigured(data.configured !== false);
      setUser(data.connected ? data.user : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function logout() {
    await fetch("/api/twitch/logout", { method: "POST" });
    setUser(null);
  }

  if (loading) return <div className="hub-twitch hub-twitch-loading">Twitch wird geprüft …</div>;

  if (!configured) {
    return (
      <div className="hub-twitch hub-twitch-warning" title="TWITCH_CLIENT_ID und TWITCH_CLIENT_SECRET fehlen">
        Twitch nicht eingerichtet
      </div>
    );
  }

  if (!user) {
    return (
      <a className="hub-twitch hub-twitch-connect" href="/api/twitch/login?next=%2F">
        <span className="hub-twitch-dot" />
        TWITCH VERBINDEN
      </a>
    );
  }

  return (
    <div className="hub-twitch hub-twitch-connected">
      <span className="hub-twitch-dot" />
      <strong>@{user.login}</strong>
      <button type="button" onClick={logout}>Trennen</button>
    </div>
  );
}
