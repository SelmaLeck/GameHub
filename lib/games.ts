export type HubGame = {
  name: string;
  description: string;
  href: string;
  tag: string;
  external?: boolean;
};

export function getHubGames(): HubGame[] {
  const associations = process.env.NEXT_PUBLIC_ASSOCIATIONS_URL || "#";
  return [
    {
      name: "Assoziationsspiel",
      description: "Privat oder mit Twitch-Chat.",
      href: associations,
      tag: "PRIVAT + TWITCH",
      external: associations !== "#",
    },
    {
      name: "Tabu",
      description: "Streamer erklärt – Chat muss zuerst erraten.",
      href: "/games/tabu",
      tag: "TWITCH",
    },
    {
      name: "Wer bin ich?",
      description: "Streamer bekommt eine Person – Chat rät.",
      href: "/games/who-am-i",
      tag: "TWITCH",
    },
    {
      name: "Montagsmaler",
      description: "Streamer zeichnet – Chat errät das Wort.",
      href: "/games/drawing",
      tag: "TWITCH",
    },
  ];
}
