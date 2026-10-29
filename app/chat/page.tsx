"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import {
  nextPromptFromDeck,
  resetPromptDeck,
} from "@/lib/game";

type TwitchUser = { id: string; login: string };
type Phase = "typing" | "collecting" | "revealed";
type SocketState = "connecting" | "connected" | "disconnected" | "error";
type ChatVote = { userId: string; display: string; normalized: string };
type RankedAnswer = { answer: string; count: number; percent: number };
type RoundResult = "correct" | "wrong" | null;
type TopCount = 3 | 5;

type EventSubMessage = {
  metadata?: { message_type?: string; subscription_type?: string };
  payload?: {
    session?: { id?: string; reconnect_url?: string };
    event?: {
      broadcaster_user_id?: string;
      chatter_user_id?: string;
      chatter_user_name?: string;
      message?: { text?: string };
    };
  };
};

function cleanDisplayAnswer(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim();
}

function normalizeAnswer(value: string) {
  return cleanDisplayAnswer(value)
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE");
}

function normalizeForSimilarity(value: string) {
  return normalizeAnswer(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s'’´`._-]+/g, "");
}

function levenshtein(a: string, b: string) {
  const left = Array.from(a);
  const right = Array.from(b);

  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }

    previous = current;
  }

  return previous[right.length];
}

function isSimilarAnswer(a: string, b: string) {
  const left = normalizeForSimilarity(a);
  const right = normalizeForSimilarity(b);

  if (left === right) return true;
  if (!left || !right) return false;

  const shortest = Math.min(left.length, right.length);
  const longest = Math.max(left.length, right.length);

  // Kurze Wörter werden absichtlich nicht fuzzy zusammengelegt,
  // damit z. B. "Hund" und "Hand" getrennt bleiben.
  if (shortest <= 4) return false;

  const distance = levenshtein(left, right);
  if (longest <= 8) return distance <= 1;
  return distance <= 2;
}

function looksLikeAnswer(value: string) {
  const raw = value.trim();
  if (!raw || raw.startsWith("!")) return false;

  const clean = cleanDisplayAnswer(raw);
  if (!clean) return false;

  // Leichter Filter gegen normale Chat-Unterhaltungen.
  // Twitch-Emotes und kurze normale Begriffe dürfen weiterhin durch.
  if (clean.length > 40) return false;
  if (clean.split(/\s+/).length > 5) return false;
  if (/https?:\/\/|www\./i.test(clean)) return false;

  return true;
}

function getRankedAnswers(votes: Map<string, ChatVote>, limit: TopCount): RankedAnswer[] {
  const exactGroups = new Map<
    string,
    { normalized: string; count: number; displays: Map<string, number> }
  >();

  for (const vote of votes.values()) {
    const current = exactGroups.get(vote.normalized);

    if (current) {
      current.count += 1;
      current.displays.set(vote.display, (current.displays.get(vote.display) ?? 0) + 1);
    } else {
      exactGroups.set(vote.normalized, {
        normalized: vote.normalized,
        count: 1,
        displays: new Map([[vote.display, 1]]),
      });
    }
  }

  const exact = [...exactGroups.values()]
    .map((group) => {
      const answer = [...group.displays.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))[0]?.[0] ?? group.normalized;

      return {
        answer,
        normalized: group.normalized,
        count: group.count,
      };
    })
    .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer, "de"));

  const clusters: Array<{ answer: string; normalized: string; count: number }> = [];

  for (const group of exact) {
    const matchingCluster = clusters.find((cluster) =>
      isSimilarAnswer(group.normalized, cluster.normalized),
    );

    if (matchingCluster) {
      matchingCluster.count += group.count;
    } else {
      clusters.push({ ...group });
    }
  }

  const total = votes.size || 1;

  return clusters
    .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer, "de"))
    .slice(0, limit)
    .map(({ answer, count }) => ({
      answer,
      count,
      percent: Math.round((count / total) * 100),
    }));
}

export default function TwitchChatGamePage() {
  const [configured, setConfigured] = useState(true);
  const [user, setUser] = useState<TwitchUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [socketState, setSocketState] = useState<SocketState>("disconnected");
  const [socketError, setSocketError] = useState("");

  const [gameStarted, setGameStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [totalRounds, setTotalRounds] = useState(10);
  const [topCount, setTopCount] = useState<TopCount>(3);
  const [score, setScore] = useState(0);
  const [roundResult, setRoundResult] = useState<RoundResult>(null);

  const [prompt, setPrompt] = useState("…");
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<Phase>("typing");
  const [answerText, setAnswerText] = useState("");
  const [streamerAnswer, setStreamerAnswer] = useState("");
  const [votes, setVotes] = useState<Map<string, ChatVote>>(() => new Map());
  const [camSide, setCamSide] = useState<"left" | "right">("left");
  const [showStreamerText, setShowStreamerText] = useState(true);

  const socketRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef<Phase>(phase);
  const broadcasterIdRef = useRef("");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    broadcasterIdRef.current = user?.id ?? "";
  }, [user?.id]);

  const voteCount = votes.size;
  const rankedAnswers = useMemo(
    () => getRankedAnswers(votes, topCount),
    [votes, topCount],
  );

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/twitch/session", { cache: "no-store" });
      const data = await response.json();
      setConfigured(data.configured !== false);
      setUser(data.connected ? data.user : null);
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Twitch verlangt für Apps mit OAuth-Sessions regelmäßige Token-Validierung.
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(loadSession, 55 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [user, loadSession]);

  const handleChatMessage = useCallback((message: EventSubMessage) => {
    if (message.metadata?.message_type !== "notification") return;
    if (message.metadata?.subscription_type !== "channel.chat.message") return;
    if (phaseRef.current !== "collecting") return;

    const event = message.payload?.event;
    const chatterId = event?.chatter_user_id ?? "";
    const rawText = event?.message?.text ?? "";

    if (!chatterId || chatterId === broadcasterIdRef.current) return;
    if (!looksLikeAnswer(rawText)) return;

    const display = cleanDisplayAnswer(rawText).slice(0, 40);
    const normalized = normalizeAnswer(display);
    if (!display || !normalized) return;

    setVotes((current) => {
      // Pro Twitch-Account zählt weiterhin nur die erste gültige Antwort pro Runde.
      if (current.has(chatterId)) return current;

      const next = new Map(current);
      next.set(chatterId, {
        userId: chatterId,
        display,
        normalized,
      });
      return next;
    });
  }, []);

  const connectEventSub = useCallback((
    url = "wss://eventsub.wss.twitch.tv/ws",
    subscribeOnWelcome = true,
  ) => {
    socketRef.current?.close();
    setSocketState("connecting");
    setSocketError("");

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onmessage = async (event) => {
      let message: EventSubMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      const type = message.metadata?.message_type;

      if (type === "session_welcome") {
        setSocketState("connected");

        if (subscribeOnWelcome) {
          const sessionId = message.payload?.session?.id;
          if (!sessionId) return;

          const response = await fetch("/api/twitch/eventsub", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            setSocketState("error");
            setSocketError(data.error || "Twitch-Chat konnte nicht verbunden werden.");
          }
        }

        return;
      }

      if (type === "session_reconnect") {
        const reconnectUrl = message.payload?.session?.reconnect_url;
        if (reconnectUrl) connectEventSub(reconnectUrl, false);
        return;
      }

      if (type === "revocation") {
        setSocketState("error");
        setSocketError("Twitch hat die Chat-Verbindung beendet. Bitte neu verbinden.");
        return;
      }

      handleChatMessage(message);
    };

    socket.onerror = () => {
      setSocketState("error");
      setSocketError("WebSocket-Verbindung zu Twitch fehlgeschlagen.");
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        setSocketState((state) => state === "error" ? state : "disconnected");
      }
    };
  }, [handleChatMessage]);

  useEffect(() => {
    if (!user) return;

    connectEventSub();

    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user, connectEventSub]);

  function resetRoundState() {
    setStreamerAnswer("");
    setAnswerText("");
    setVotes(new Map<string, ChatVote>());
    setRoundResult(null);
    setPhase("typing");
  }

  function startGame() {
    resetPromptDeck("twitch-chat");
    setPrompt(nextPromptFromDeck("twitch-chat"));
    setRound(1);
    setScore(0);
    setFinished(false);
    resetRoundState();
    setGameStarted(true);
  }

  function submitStreamerAnswer(e: FormEvent) {
    e.preventDefault();

    const clean = cleanDisplayAnswer(answerText);
    if (!clean || phase !== "typing") return;

    setStreamerAnswer(clean);
    setAnswerText("");
    setVotes(new Map<string, ChatVote>());
    setRoundResult(null);
    setPhase("collecting");
  }

  function reveal() {
    if (phase !== "collecting") return;
    setPhase("revealed");
  }

  function judge(result: Exclude<RoundResult, null>) {
    if (phase !== "revealed" || roundResult) return;

    setRoundResult(result);
    if (result === "correct") {
      setScore((value) => value + 1);
    }
  }

  function nextRound() {
    if (!roundResult) return;

    if (round >= totalRounds) {
      setFinished(true);
      return;
    }

    setPrompt(nextPromptFromDeck("twitch-chat"));
    setRound((value) => value + 1);
    resetRoundState();
  }

  function skipPrompt() {
    setPrompt(nextPromptFromDeck("twitch-chat"));
    resetRoundState();
  }

  function backToSetup() {
    setGameStarted(false);
    setFinished(false);
    setPrompt("…");
    setRound(1);
    setScore(0);
    resetRoundState();
  }

  async function logout() {
    await fetch("/api/twitch/logout", { method: "POST" });
    socketRef.current?.close();
    setUser(null);
    setGameStarted(false);
  }

  if (authLoading) {
    return (
      <main className="center-page">
        <div className="muted">Twitch wird geprüft …</div>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="center-page">
        <section className="card twitch-connect-card">
          <Brand />
          <h1>Twitch noch nicht eingerichtet</h1>
          <p className="subtle">
            Trage zuerst <code>TWITCH_CLIENT_ID</code> und <code>TWITCH_CLIENT_SECRET</code> in deiner <code>.env.local</code> bzw. in Vercel ein.
          </p>
          <Link className="muted small" href="/play">← Spielmodus</Link>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="center-page">
        <section className="card twitch-connect-card">
          <Brand />
          <h1>Mit Twitch-Chat spielen</h1>
          <p className="subtle">Verbinde deinen Twitch Account.</p>
          <a className="btn btn-primary btn-wide" href="/api/twitch/login?next=%2Fchat">
            Mit Twitch verbinden
          </a>
          <div className="spacer" />
          <Link className="muted small" href="/play">← Spielmodus</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="chat-page-shell">
      <header className="chat-topbar">
        <Brand />
        <div className="chat-top-controls">
          <span className={`connection-pill connection-${socketState}`}>
            <span className="connection-dot" />
            {socketState === "connected"
              ? `@${user.login} verbunden`
              : socketState === "connecting"
                ? "Twitch verbindet …"
                : "Twitch getrennt"}
          </span>

          {gameStarted && !finished && (
            <button
              className="mini-btn"
              onClick={() => setCamSide((side) => side === "left" ? "right" : "left")}
            >
              Cam {camSide === "left" ? "links" : "rechts"}
            </button>
          )}

          <button className="mini-btn" onClick={logout}>Trennen</button>
        </div>
      </header>

      <h1 className="chat-game-title">ASSOZIATIONSSPIEL</h1>

      {!gameStarted && (
        <section className="card twitch-connect-card">
          <div className="chat-phase-panel">
            <strong>Spiel einstellen</strong>
            <span>Wähle Rundenanzahl und wie viele Top-Antworten beim Reveal angezeigt werden.</span>
          </div>

          <div className="field">
            <label htmlFor="twitch-rounds">Runden</label>
            <input
              id="twitch-rounds"
              className="input"
              type="number"
              min={3}
              max={130}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value))}
            />
          </div>

          <div className="field">
            <label>Ergebnisse beim Reveal</label>
            <div className="game-actions">
              {([3, 5] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`btn ${topCount === value ? "btn-primary" : ""}`}
                  onClick={() => setTopCount(value)}
                >
                  Top {value}
                </button>
              ))}
            </div>
          </div>

          <p className="subtle">
            Kurze Chat-Nachrichten werden als Antworten gewertet. Längere Nachrichten und Links werden automatisch herausgefiltert. Ähnliche Schreibweisen werden vorsichtig zusammengefasst.
          </p>

          <button
            className="btn btn-primary btn-wide"
            onClick={startGame}
            disabled={!Number.isFinite(totalRounds) || totalRounds < 3 || totalRounds > 130}
          >
            SPIEL STARTEN
          </button>
        </section>
      )}

      {gameStarted && finished && (
        <section className="card twitch-connect-card">
          <div className="prompt-label">SPIEL BEENDET</div>
          <div className="prompt twitch-prompt">{score} / {totalRounds}</div>
          <p className="subtle">Punkte nach {totalRounds} Runden</p>

          <div className="game-actions">
            <button className="btn btn-primary" onClick={startGame}>NOCHMAL SPIELEN</button>
            <button className="btn" onClick={backToSetup}>EINSTELLUNGEN</button>
            <Link className="btn" href="/play">STARTSEITE</Link>
          </div>
        </section>
      )}

      {gameStarted && !finished && (
        <div className={`chat-stream-layout cam-${camSide}`}>
          <aside className="camera-answer-zone">
            <div className="camera-cover-note">
              <strong>FACECAM HIER DRÜBER</strong>
            </div>

            <div className="streamer-secret-area">
              <div className="secret-head">
                <span>Deine Antwort</span>
                <button
                  className="secret-toggle"
                  type="button"
                  onClick={() => setShowStreamerText((value) => !value)}
                >
                  {showStreamerText ? "ausblenden" : "anzeigen"}
                </button>
              </div>

              {phase === "typing" ? (
                <form onSubmit={submitStreamerAnswer}>
                  <input
                    className={`input streamer-answer-input ${showStreamerText ? "" : "secret-masked"}`}
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Deine Antwort …"
                    maxLength={80}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary btn-wide streamer-submit"
                    disabled={!answerText.trim()}
                  >
                    ABSCHICKEN
                  </button>
                </form>
              ) : (
                <div className="answer-locked">
                  <span>✓ gespeichert</span>
                  <strong className={showStreamerText ? "" : "secret-blurred"}>
                    {streamerAnswer}
                  </strong>
                </div>
              )}
            </div>
          </aside>

          <section className="card twitch-game-card">
            <div className="prompt-label" />
            <div className="prompt twitch-prompt">{prompt}</div>

            <div className="stats twitch-stats">
              <div className="stat">Punkte <strong>{score}</strong></div>
              <div className="stat">Runde <strong>{round}/{totalRounds}</strong></div>
              <div className="stat">Chat-Stimmen <strong>{voteCount}</strong></div>
            </div>

            {phase === "typing" && (
              <div className="chat-phase-panel">
                <strong>1. Streamer antwortet</strong>
                <span>Chat-Nachrichten werden noch nicht als Antworten gezählt.</span>
              </div>
            )}

            {phase === "collecting" && (
              <div className="chat-phase-panel collecting">
                <div className="live-label">
                  <span className="live-dot" /> CHAT DARF JETZT ANTWORTEN
                </div>
                <strong>{voteCount} eindeutige Antworten gesammelt</strong>
                <span>
                  Pro Twitch-Account zählt die erste kurze, gültige Antwort dieser Runde. Ähnliche Schreibweisen werden beim Reveal zusammengefasst.
                </span>

                <div className="game-actions">
                  <button className="btn btn-primary reveal-chat-btn" onClick={reveal}>
                    REVEAL
                  </button>
                  <button type="button" className="skip-button" onClick={skipPrompt}>
                    SKIP
                  </button>
                </div>
              </div>
            )}

            {phase === "revealed" && (
              <>
                <div className="streamer-reveal-row">
                  <span>{user.login}</span>
                  <strong>{streamerAnswer}</strong>
                </div>

                <div className="chat-results-head">
                  <span>Top {topCount} Antworten aus dem Chat</span>
                  <small>{voteCount} {voteCount === 1 ? "Stimme" : "Stimmen"}</small>
                </div>

                <div className="chat-ranking">
                  {rankedAnswers.length === 0 ? (
                    <div className="empty-ranking">Keine Chat-Antworten in dieser Runde.</div>
                  ) : rankedAnswers.map((item, index) => (
                    <div className="rank-row" key={`${item.answer}-${index}`}>
                      <div className="rank-number">{index + 1}</div>
                      <div className="rank-main">
                        <div className="rank-copy">
                          <strong>{item.answer}</strong>
                          <span>{item.count} {item.count === 1 ? "Stimme" : "Stimmen"}</span>
                        </div>
                        <div className="rank-track">
                          <div
                            className="rank-fill"
                            style={{ width: `${Math.max(item.percent, 2)}%` }}
                          />
                        </div>
                      </div>
                      <div className="rank-percent">{item.percent}%</div>
                    </div>
                  ))}
                </div>

                <div className="game-actions">
                  {!roundResult ? (
                    <>
                      <button className="btn btn-good" onClick={() => judge("correct")}>
                        RICHTIG
                      </button>
                      <button className="btn btn-bad" onClick={() => judge("wrong")}>
                        FALSCH
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-primary" onClick={nextRound}>
                      {round >= totalRounds ? "ERGEBNIS ANZEIGEN" : "NÄCHSTE RUNDE"}
                    </button>
                  )}
                </div>
              </>
            )}

            {socketError && (
              <div className="error">
                {socketError}
                <button className="inline-reconnect" onClick={() => connectEventSub()}>
                  Neu verbinden
                </button>
              </div>
            )}
          </section>

          <div className="chat-empty-side" aria-hidden="true" />
        </div>
      )}
    </main>
  );
}
