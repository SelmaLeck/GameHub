"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FinalLeaderboard } from "@/components/FinalLeaderboard";
import { GameTopbar } from "@/components/GameTopbar";
import { LiveChat } from "@/components/LiveChat";
import { LiveLeaderboard } from "@/components/LiveLeaderboard";
import { RoundReveal } from "@/components/RoundReveal";
import { RoundSetup } from "@/components/RoundSetup";
import { SecretSidePanel } from "@/components/SecretSidePanel";
import { TwitchGate } from "@/components/TwitchGate";
import { useTwitchChat } from "@/hooks/useTwitchChat";
import {
  addWinner,
  shuffle,
  type ChatLine,
  type LeaderboardEntry,
  type RoundHit,
} from "@/lib/chat-game";

type Phase = "setup" | "active" | "reveal" | "finished";

type SevenTvFile = {
  name?: string;
  format?: string;
  width?: number;
  height?: number;
};

type SevenTvSetEntry = {
  id?: string;
  name?: string;
  data?: {
    id?: string;
    name?: string;
    host?: {
      url?: string;
      files?: SevenTvFile[];
    };
  };
};

type SevenTvPayload = {
  emote_set?: {
    emotes?: SevenTvSetEntry[];
  };
  emotes?: SevenTvSetEntry[];
};

type QuizEmote = {
  id: string;
  name: string;
  imageUrl: string;
};

function normalizeGuess(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("de-DE");
}

function getEmoteImage(entry: SevenTvSetEntry, id: string) {
  const host = entry.data?.host;
  const hostUrl = host?.url
    ? host.url.startsWith("//")
      ? `https:${host.url}`
      : host.url
    : "";

  const files = host?.files ?? [];

  const bestWebp = [...files]
    .filter((file) => file.name?.toLowerCase().endsWith(".webp"))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];

  const fallbackFile = [...files].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0)
  )[0];

  const file = bestWebp ?? fallbackFile;

  if (hostUrl && file?.name) {
    return `${hostUrl.replace(/\/$/, "")}/${file.name}`;
  }

  return `https://cdn.7tv.app/emote/${id}/4x.webp`;
}

function parseEmotes(payload: SevenTvPayload): QuizEmote[] {
  const raw = payload.emote_set?.emotes ?? payload.emotes ?? [];
  const seen = new Set<string>();

  return raw
    .map((entry) => {
      // entry.name ist wichtig: Das ist der Name/Alias im Channel-Set.
      const name = (entry.name ?? entry.data?.name ?? "").trim();
      const id = (entry.data?.id ?? entry.id ?? "").trim();

      if (!name || !id) return null;

      const key = normalizeGuess(name);
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        id,
        name,
        imageUrl: getEmoteImage(entry, id),
      };
    })
    .filter((emote): emote is QuizEmote => Boolean(emote));
}

async function getJsonFromFirstWorkingUrl(urls: string[]) {
  let lastError = "7TV konnte nicht geladen werden.";

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        lastError = `7TV antwortet mit ${response.status}.`;
        continue;
      }

      return (await response.json()) as SevenTvPayload;
    } catch {
      lastError = "Verbindung zu 7TV fehlgeschlagen.";
    }
  }

  throw new Error(lastError);
}

export default function EmotesPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [totalRounds, setTotalRounds] = useState(10);
  const [round, setRound] = useState(1);

  const [emotes, setEmotes] = useState<QuizEmote[]>([]);
  const [emotesLoading, setEmotesLoading] = useState(false);
  const [emoteError, setEmoteError] = useState("");

  const [currentEmote, setCurrentEmote] = useState<QuizEmote | null>(null);
  const [hits, setHits] = useState<RoundHit[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const deckRef = useRef<QuizEmote[]>([]);
  const currentRef = useRef<QuizEmote | null>(null);
  const hitsRef = useRef<RoundHit[]>([]);
  const phaseRef = useRef<Phase>(phase);
  const startRef = useRef(0);
  const finishTimerRef = useRef<number | null>(null);
  const awardedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    currentRef.current = currentEmote;
  }, [currentEmote]);

  useEffect(
    () => () => {
      if (finishTimerRef.current) {
        window.clearTimeout(finishTimerRef.current);
      }
    },
    []
  );

  const finishRound = useCallback((roundHits?: RoundHit[]) => {
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
    }

    finishTimerRef.current = null;

    const finalHits = roundHits ?? hitsRef.current;

    if (!awardedRef.current && finalHits[0]) {
      awardedRef.current = true;
      setLeaderboard((current) => addWinner(current, finalHits[0]));
    }

    setPhase("reveal");
  }, []);

  const onChatLine = useCallback(
    (line: ChatLine) => {
      const emote = currentRef.current;

      if (phaseRef.current !== "active" || !emote) return;
      if (line.text.trim().startsWith("!")) return;

      // Absichtlich KEIN Fuzzy Matching:
      // Der Chat soll den echten Emote-Namen lernen.
      if (normalizeGuess(line.text) !== normalizeGuess(emote.name)) return;

      if (hitsRef.current.some((hit) => hit.userId === line.userId)) return;

      const hit: RoundHit = {
        userId: line.userId,
        userName: line.userName,
        ms: Date.now() - startRef.current,
      };

      const next = [...hitsRef.current, hit].sort((a, b) => a.ms - b.ms);

      hitsRef.current = next;
      setHits(next);

      // Sobald drei Leute richtig sind: sofort Reveal.
      if (next.length >= 3) {
        finishRound(next);
        return;
      }

      // Nach dem ersten Treffer noch kurz Platz 2 und 3 sammeln.
      if (next.length === 1 && finishTimerRef.current === null) {
        finishTimerRef.current = window.setTimeout(() => {
          finishRound();
        }, 3000);
      }
    },
    [finishRound]
  );

  const twitch = useTwitchChat(onChatLine);

  const twitchUserId = (
    twitch.user as { id?: string; login?: string } | null
  )?.id;

  // Optional:
  // Wenn du IMMER ein bestimmtes Vullco-7TV-Set benutzen willst,
  // kannst du NEXT_PUBLIC_7TV_SET_ID in .env.local / Vercel setzen.
 const fixedSetId = "01JMD4HWA562E1FMF4849708TQ";

  useEffect(() => {
    if (!twitch.user) return;
    if (!fixedSetId && !twitchUserId) return;

    let cancelled = false;

    async function loadEmotes() {
      setEmotesLoading(true);
      setEmoteError("");

      try {
        const urls = fixedSetId
          ? [
              `https://api.7tv.app/v3/emote-sets/${fixedSetId}`,
              `https://7tv.io/v3/emote-sets/${fixedSetId}`,
            ]
          : [
              `https://api.7tv.app/v3/users/twitch/${twitchUserId}`,
              `https://7tv.io/v3/users/twitch/${twitchUserId}`,
            ];

        const payload = await getJsonFromFirstWorkingUrl(urls);
        const parsed = parseEmotes(payload);

        if (!parsed.length) {
          throw new Error(
            "In diesem 7TV-Set wurden keine Emotes gefunden."
          );
        }

        if (!cancelled) {
          setEmotes(parsed);
        }
      } catch (error) {
        if (!cancelled) {
          setEmotes([]);
          setEmoteError(
            error instanceof Error
              ? error.message
              : "7TV-Emotes konnten nicht geladen werden."
          );
        }
      } finally {
        if (!cancelled) {
          setEmotesLoading(false);
        }
      }
    }

    loadEmotes();

    return () => {
      cancelled = true;
    };
  }, [fixedSetId, twitch.user, twitchUserId]);

  function resetRoundState() {
    hitsRef.current = [];
    setHits([]);
    awardedRef.current = false;

    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
    }

    finishTimerRef.current = null;
  }

  function takeNextEmote() {
    if (!emotes.length) {
      setEmoteError("Keine 7TV-Emotes geladen.");
      return;
    }

    if (deckRef.current.length === 0) {
      deckRef.current = shuffle([...emotes]);
    }

    const next = deckRef.current.pop();

    if (!next) return;

    resetRoundState();

    setCurrentEmote(next);
    currentRef.current = next;
    startRef.current = Date.now();
    setPhase("active");
  }

  function startGame() {
    if (!emotes.length) {
      setEmoteError(
        emotesLoading
          ? "7TV-Emotes werden noch geladen."
          : "Keine 7TV-Emotes verfügbar."
      );
      return;
    }

    setLeaderboard([]);
    setRound(1);
    deckRef.current = shuffle([...emotes]);
    takeNextEmote();
  }

  function skip() {
    takeNextEmote();
  }

  function revealWithoutWinner() {
    finishRound([]);
  }

  function nextRound() {
    if (round >= totalRounds) {
      setPhase("finished");
      return;
    }

    setRound((value) => value + 1);
    takeNextEmote();
  }

  if (twitch.authLoading) {
    return (
      <main className="center-page">
        <div className="muted">Twitch wird geprüft …</div>
      </main>
    );
  }

  if (!twitch.user) {
    return (
      <TwitchGate
        configured={twitch.configured}
        path="/games/emotes"
      />
    );
  }

  if (phase === "finished") {
    return (
      <main className="center-page">
        <FinalLeaderboard
          title="7TV EMOTE QUIZ"
          entries={leaderboard}
          onAgain={() => setPhase("setup")}
        />
      </main>
    );
  }

  return (
    <main className="game-page">
      <GameTopbar
        login={twitch.user.login}
        state={twitch.socketState}
        onLogout={twitch.logout}
      />

      {phase === "setup" ? (
        <div className="setup-wrap">
          <RoundSetup
            title="7TV EMOTE QUIZ"
            description="Ein Emote wird angezeigt. Der Chat muss den exakten 7TV-Namen schreiben. Groß-/Kleinschreibung ist egal."
            rounds={totalRounds}
            onRounds={setTotalRounds}
            onStart={startGame}
          />

          <div className="emote-quiz-load-state">
            {emotesLoading ? (
              <span className="muted">7TV-Emotes werden geladen …</span>
            ) : emoteError ? (
              <div className="error-box">{emoteError}</div>
            ) : (
              <span className="muted">
                {emotes.length} Emotes aus dem 7TV-Set geladen.
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="stream-game-grid">
          <SecretSidePanel>
            <div className="secret-round">
              Runde {round}/{totalRounds}
            </div>

            <h3>7TV Emote Quiz</h3>

            <div className="emote-side-info">
              <strong>{emotes.length}</strong>
              <span>Emotes im Set</span>
            </div>

            <p className="muted small">
              Der Chat muss nur den Emote-Namen schreiben.
              Groß-/Kleinschreibung ist egal.
            </p>

            {phase === "active" && (
              <div className="emote-side-actions">
                <button
                  className="btn btn-ghost btn-wide"
                  type="button"
                  onClick={skip}
                >
                  SKIP
                </button>

                <button
                  className="btn btn-ghost btn-wide"
                  type="button"
                  onClick={revealWithoutWinner}
                >
                  AUFLÖSEN
                </button>
              </div>
            )}
          </SecretSidePanel>

          <section className="game-center card">
            <div className="game-title-line">
              <span>7TV EMOTE QUIZ</span>
              <b>
                RUNDE {round}/{totalRounds}
              </b>
            </div>

            {phase === "reveal" && currentEmote ? (
              <>
                <div className="emote-quiz-reveal-image">
                  <img
                    src={currentEmote.imageUrl}
                    alt=""
                    draggable={false}
                  />
                </div>

                <RoundReveal
                  answer={currentEmote.name}
                  hits={hits}
                  onNext={nextRound}
                  isLast={round >= totalRounds}
                />
              </>
            ) : currentEmote ? (
              <>
                <div className="emote-quiz-stage">
                  <img
                    className="emote-quiz-image"
                    src={currentEmote.imageUrl}
                    alt="7TV Emote"
                    draggable={false}
                  />
                </div>

                <div className="emote-quiz-question">
                  WIE HEISST DIESES EMOTE?
                </div>

                <LiveLeaderboard entries={leaderboard} />

                <div className="round-status">
                  {hits.length
                    ? "Erster Treffer! Sammle kurz Platz 2 und 3 …"
                    : "Der Chat rät jetzt live."}
                </div>
              </>
            ) : (
              <div className="muted">Emote wird geladen …</div>
            )}

            {twitch.socketError && (
              <div className="error-box">
                {twitch.socketError}
                <button onClick={twitch.reconnect}>
                  Neu verbinden
                </button>
              </div>
            )}
          </section>

          <LiveChat messages={twitch.messages} />
        </div>
      )}
    </main>
  );
}
