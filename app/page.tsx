import Link from "next/link";
import { Brand } from "@/components/Brand";
import { HubTwitchStatus } from "@/components/HubTwitchStatus";

const games = [
  {
    name: "Assoziationsspiel",
    description: "Privat mit Lobby oder zusammen mit deinem Twitch-Chat · ca. 130 Kategorien.",
    href: "/play",
    tag: "PRIVAT + TWITCH",
  },
  {
    name: "Tabu",
    description: "Erkläre einen Begriff. Dein Chat versucht ihn zuerst zu erraten.",
    href: "/games/tabu",
    tag: "TWITCH",
  },
  {
    name: "Wer bin ich?",
    description: "Du bekommst eine Person oder Figur und der Chat rät live.",
    href: "/games/who-am-i",
    tag: "TWITCH",
  },
  {
    name: "Montagsmaler",
    description: "Zeichne auf der Leinwand. Der schnellste richtige Chatter gewinnt.",
    href: "/games/drawing",
    tag: "TWITCH",
  },
  {
  name: "Randomizer",
  description: "Minecraft Randomizer",
  href: "https://minecraft-randomizer-wheat.vercel.app/",
  tag: "TWITCH + TIKTOK",
},
{
  name: "Emote-Guesser",
  description: "Bringe deinem Twitch-Chat 7tv Emotes bei!",
  href: "/games/emotes",
  tag: "TWITCH",
},
{
  name: "v//bot",
  description: "Verwalte den Twitchbot!",
  href: "https://vllcbot.up.railway.app/",
  tag: "TWITCH",
},

];

export default function HomePage() {
  return (
    <main className="hub-page">
      <section className="hub-shell">
        <header className="hub-header">
          <div className="hub-brand-side">
            <Brand />
            <div>
              <h1>V//GAMES</h1>
              <p>Stream-Games für den Twitchchat</p>
            </div>
          </div>
          <HubTwitchStatus />
        </header>

        <div className="hub-grid">
          {games.map((game) => (
            <Link className="hub-card" href={game.href} key={game.name}>
              <div className="hub-card-top">
                <span>{game.tag}</span>
                <b aria-hidden="true">→</b>
              </div>
              <h2>{game.name}</h2>
              <p>{game.description}</p>
            </Link>
          ))}
        </div>

        <p className="hub-note">
          Twitch einmal hier verbinden – die Session gilt danach für alle Twitch-Games.
        </p>
      </section>
    </main>
  );
}
