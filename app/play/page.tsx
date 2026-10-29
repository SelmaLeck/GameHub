import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function PlayPage() {
  return (
    <main className="center-page">
      <section className="card mode-card">
        <Brand />
        <h1>Spielmodus</h1>
        <p className="subtle">Wie willst du spielen?</p>

        <div className="mode-grid">
          <Link className="mode-option" href="/private">
            <div className="mode-icon">P</div>
            <div>
              <strong>Privat</strong>
              <span>Lobby erstellen und mit Freunden zocken!</span>
            </div>
          </Link>
          <Link className="mode-option mode-option-chat" href="/chat">
            <div className="mode-icon">T</div>
            <div>
              <strong>Mit Twitch-Chat</strong>
              <span>Schaue was dein Chat denkt!</span>
            </div>
          </Link>
        </div>

        <div className="spacer" />
        <Link className="muted small" href="/">← Zurück</Link>
      </section>
    </main>
  );
}
