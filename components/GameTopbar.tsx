"use client";

import Link from "next/link";
import { Brand } from "@/components/Brand";
import type { SocketState } from "@/hooks/useTwitchChat";

export function GameTopbar({ login, state, onLogout }: { login: string; state: SocketState; onLogout: () => void }) {
  return (
    <header className="hubgame-topbar">
      <Brand />
      <div className="hubgame-top-actions">
        <span className={`hubgame-connection-pill hubgame-connection-${state}`}><i />@{login}</span>
        <button className="hubgame-mini-btn" type="button" onClick={onLogout}>Trennen</button>
        <Link className="hubgame-mini-btn" href="/">Hub</Link>
      </div>
    </header>
  );
}
