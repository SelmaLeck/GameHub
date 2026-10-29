import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function PrivateModePage() {
  return (
    <main className="center-page">
      <section className="card form-card private-choice-card">
        <Brand />
        <h1>Privates Spiel</h1>
        <p className="subtle">Erstelle eine geschützte Lobby oder tritt mit Name + Lobby-Code bei.</p>
        <div className="actions private-actions">
          <Link className="btn btn-primary" href="/create">Lobby erstellen</Link>
          <Link className="btn" href="/join">Lobby beitreten</Link>
        </div>
        <div className="spacer" />
        <Link className="muted small" href="/play">← Spielmodus</Link>
      </section>
    </main>
  );
}
