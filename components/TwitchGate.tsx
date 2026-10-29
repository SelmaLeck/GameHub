import Link from "next/link";
import { Brand } from "@/components/Brand";

export function TwitchGate({
  configured,
  path,
}: {
  configured: boolean;
  path: string;
}) {
  return (
    <main className="center-page">
      <section className="card connect-card">
        <Brand />
        <h1>{configured ? "Twitch verbinden" : "Twitch noch nicht eingerichtet"}</h1>
        <p>
          {configured
            ? "Verbinde deinen Twitch-Account. Die Session gilt danach für alle Chat-Games im Hub."
            : "Trage TWITCH_CLIENT_ID und TWITCH_CLIENT_SECRET in .env.local bzw. Vercel ein."}
        </p>
        {configured && <a className="btn btn-primary btn-wide" href={`/api/twitch/login?next=${encodeURIComponent(path)}`}>MIT TWITCH VERBINDEN</a>}
        <Link className="text-link" href="/">← Zum Game Hub</Link>
      </section>
    </main>
  );
}
