export const prompts = [
  "Pokémon-Typ",
  "Fast-Food-Kette",
  "Fußballverein",
  "Minecraft-Mob",
  "YouTuber",
  "Streamer",
  "Obstsorte",
  "Automarke",
  "Land in Europa",
  "Superheld",
  "Getränkemarke",
  "Tier im Zoo",
  "Deutsche Stadt",
  "Videospiel",
  "Filmreihe",
  "Süßigkeit",
  "Schulfach",
  "Handymarke",
  "Social-Media-App",
  "Musikinstrument",
  "Anime",
  "Sportart",
  "Eissorte",
  "Farbe",
  "Beruf",
  "Kleidungsmarke",
  "Disney-Figur",
  "Marvel-Figur",
  "Fortnite-Skin",
  "Minecraft-Block",
  "Computerspiel-Charakter",
  "Snack",
  "Brettspiel",
  "Konsolenmarke",
  "App auf dem Handy",
  "Schuhmarke",
  "Fußballspieler",
  "Bundesland",
  "Pizza-Belag",
  "Restaurant-Kette",
  "Netflix-Serie",
  "Zeichentrickserie",
  "Haustier",
  "Ding im Kühlschrank",
  "Ding im Klassenzimmer",
  "Ding im Badezimmer",
  "Ding am Strand",
  "Ding im Supermarkt",
  "Browser",
  "Winter-Sportart",
  "Frühstück",
  "Kuchen",
  "Käse-Sorte",
  "Haustier",
  "Insekt",
  "Tier das fliegen kann",
  "Salat-art",
  "Chipsmarke",
  "Döner-Zutat",
  "Sushi-Sorte",
  "Pasta-Sorte",
  "Soße",
  "Gewürz",
  "Urlaubsziel",
  "See",
  "7tv-Emote",
  "Minecraft-Biom",
  "Minecraft-Item",
  "Pokémon",
  "Mario-Charakter ausser Mario & Luigi",
  "Steam-Spiel",
  "Mobile-Game",
  "Nintendo-Spiel",
  "Film",
  "Harry-Potter-Charakter",
  "Anime-Charakter",
  "Sänger",
  "Band",
  "Song mit nur einem Wort im Titel",
  "Parfümmarke",
  "Ding im Schlafzimmer",
  "Ding in der Küche",
  "Ding im Wohnzimmer",
  "Ding im Garten",
  "Ding im Keller",
  "Ding auf dem Schreibtisch",
  "Ding in der Schultasche",
  "Ding im Rucksack",
  "Ding im Auto",
  "Ding im Zug",
  "Ding im Flugzeug",
  "Ding im Hotelzimmer",
  "Ding im Fitnessstudio",
  "Ding im Stadion",
  "Ding auf einer Party",
  "Ding auf einem Festival",
  "Ding auf einem Weihnachtsmarkt",
  "Ding auf einem Campingplatz",
  "Ding auf einem Spielplatz",
  "Ding in einer Tankstelle",
  "Ding in einem Kino",
  "Ding in einer Küche",
  "Ding in einer Garage",
  "Etwas das stinkt",
  "Etwas das laut ist",
  "Etwas das klebt",
  "Etwas das rund ist",
  "Etwas das weich ist",
  "Etwas das kalt ist",
  "Etwas das heiß ist",
  "Date-Idee",
  "Jugendwort",
  "Wort das mit S beginnt",
  "Wort das mit K beginnt",
  "Beruf den Kinder cool finden",
  "Traumberuf",
  "Schlimmer Beruf",
  "Feiertag",
  "Weihnachtslied",
  "Halloween-Kostüm",
  "Geburtstagsgeschenk",
  "Sache die viel zu teuer geworden ist",
  "Sache die man niemals gebraucht kaufen würde",
  "Marke die jeder kennt",
  "Online-Shop",
  "Streamer-Equipment",
  "Twitch-Kategorie",
  "Twitch-Command",
  "Sache die man auf einer Insel braucht",
  "Superkraft",
  "Fantasy-Wesen",
  "Ding das man bei einer Alien-Invasion braucht",
];

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateLobbyCode(length = 6) {
  let code = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}


export function generateSecret(bytesLength = 24) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type PromptDeckState = {
  remaining: string[];
  last: string | null;
};

function shufflePrompts() {
  const shuffled = [...prompts];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [
      shuffled[j],
      shuffled[i],
    ];
  }

  return shuffled;
}

function createFreshDeck(last: string | null) {
  const deck = shufflePrompts();

  // Verhindert möglichst, dass beim neuen Durchlauf
  // direkt dasselbe Wort nochmal kommt.
  if (
    last &&
    deck.length > 1 &&
    deck[0] === last
  ) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
  }

  return deck;
}

export function nextPromptFromDeck(scope: string) {
  if (typeof window === "undefined") {
    return prompts[0];
  }

  const key = `vullco-prompt-deck-${scope}`;

  let state: PromptDeckState = {
    remaining: [],
    last: null,
  };

  const stored = sessionStorage.getItem(key);

  if (stored) {
    try {
      state = JSON.parse(stored);
    } catch {
      // Falls gespeicherte Daten kaputt sind:
      state = {
        remaining: [],
        last: null,
      };
    }
  }

  // Alle Wörter aufgebraucht?
  // → komplett neu mischen.
  if (state.remaining.length === 0) {
    state.remaining = createFreshDeck(state.last);
  }

  const nextPrompt = state.remaining.shift()!;

  state.last = nextPrompt;

  sessionStorage.setItem(
    key,
    JSON.stringify(state)
  );

  return nextPrompt;
}

export function resetPromptDeck(scope: string) {
  if (typeof window === "undefined") return;

  sessionStorage.removeItem(
    `vullco-prompt-deck-${scope}`
  );
}

export function playerSessionKey(code: string) {
  return `vullco-assoc-player-${code.toUpperCase()}`;
}

export function hostSessionKey(code: string) {
  return `vullco-assoc-host-${code.toUpperCase()}`;
}

