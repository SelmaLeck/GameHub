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
import { addWinner, isCorrectGuess, shuffle, type ChatLine, type LeaderboardEntry, type RoundHit } from "@/lib/chat-game";
import { tabuEntries, type TabuEntry } from "@/lib/game-data";

type Phase = "setup" | "choice" | "active" | "reveal" | "finished";

export default function TabuPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [totalRounds, setTotalRounds] = useState(10);
  const [round, setRound] = useState(1);
  const [options, setOptions] = useState<TabuEntry[]>([]);
  const [chosen, setChosen] = useState<TabuEntry | null>(null);
  const [hits, setHits] = useState<RoundHit[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const deckRef = useRef<TabuEntry[]>([]);
  const startRef = useRef(0);
  const hitsRef = useRef<RoundHit[]>([]);
  const phaseRef = useRef<Phase>(phase);
  const chosenRef = useRef<TabuEntry | null>(chosen);
  const finishTimerRef = useRef<number | null>(null);
  const awardedRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { chosenRef.current = chosen; }, [chosen]);
  useEffect(() => () => { if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current); }, []);

  const finishRound = useCallback((roundHits?: RoundHit[]) => {
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = null;
    const finalHits = roundHits ?? hitsRef.current;
    if (!awardedRef.current && finalHits[0]) {
      awardedRef.current = true;
      setLeaderboard((current) => addWinner(current, finalHits[0]));
    }
    setPhase("reveal");
  }, []);

  const onChatLine = useCallback((line: ChatLine) => {
    if (phaseRef.current !== "active" || !chosenRef.current) return;
    if (line.text.trim().startsWith("!")) return;
    if (!isCorrectGuess(line.text, chosenRef.current.word)) return;
    if (hitsRef.current.some((hit) => hit.userId === line.userId)) return;

    const hit: RoundHit = { userId: line.userId, userName: line.userName, ms: Date.now() - startRef.current };
    const next = [...hitsRef.current, hit].sort((a, b) => a.ms - b.ms);
    hitsRef.current = next;
    setHits(next);

    if (next.length >= 3) {
      finishRound(next);
    } else if (next.length === 1 && finishTimerRef.current === null) {
      finishTimerRef.current = window.setTimeout(() => finishRound(), 3000);
    }
  }, [finishRound]);

  const twitch = useTwitchChat(onChatLine);

  function takeOptions() {
    if (deckRef.current.length < 2) deckRef.current = shuffle(tabuEntries);
    const first = deckRef.current.pop();
    const second = deckRef.current.pop();
    setOptions([first, second].filter(Boolean) as TabuEntry[]);
    setChosen(null);
    chosenRef.current = null;
    hitsRef.current = [];
    setHits([]);
    awardedRef.current = false;
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = null;
    setPhase("choice");
  }

  function startGame() {
    deckRef.current = shuffle(tabuEntries);
    setLeaderboard([]);
    setRound(1);
    takeOptions();
  }

  function choose(entry: TabuEntry) {
    setChosen(entry);
    chosenRef.current = entry;
    hitsRef.current = [];
    setHits([]);
    startRef.current = Date.now();
    setPhase("active");
  }

  function skip() {
    takeOptions();
  }

  function nextRound() {
    if (round >= totalRounds) {
      setPhase("finished");
      return;
    }
    setRound((value) => value + 1);
    takeOptions();
  }

  if (twitch.authLoading) return <main className="center-page"><div className="muted">Twitch wird geprüft …</div></main>;
  if (!twitch.user) return <TwitchGate configured={twitch.configured} path="/games/tabu" />;
  if (phase === "finished") {
    return <main className="center-page"><FinalLeaderboard title="TABU" entries={leaderboard} onAgain={() => setPhase("setup")} /></main>;
  }

  return (
    <main className="game-page">
      <GameTopbar login={twitch.user.login} state={twitch.socketState} onLogout={twitch.logout} />

      {phase === "setup" ? (
        <div className="setup-wrap"><RoundSetup title="TABU" description="Erkläre den Begriff, ohne die verbotenen Wörter zu sagen. Der Chat muss ihn zuerst erraten." rounds={totalRounds} onRounds={setTotalRounds} onStart={startGame} /></div>
      ) : (
        <div className="stream-game-grid">
          <SecretSidePanel>
            <div className="secret-round">Runde {round}/{totalRounds}</div>
            {phase === "choice" ? (
              <>
                <h3>Wähle einen Begriff</h3>
                <div className="word-choice-list">
                  {options.map((entry) => <button className="word-choice" type="button" key={entry.word} onClick={() => choose(entry)}>{entry.word}</button>)}
                </div>
              </>
            ) : chosen ? (
              <>
                <div className="secret-word">{chosen.word}</div>
                <div className="forbidden-title">NICHT SAGEN</div>
                <div className="forbidden-list">{chosen.forbidden.map((word) => <span key={word}>{word}</span>)}</div>
                {phase === "active" && <button className="btn btn-ghost btn-wide" type="button" onClick={skip}>SKIP</button>}
              </>
            ) : null}
          </SecretSidePanel>

          <section className="game-center card">
            <div className="game-title-line"><span>TABU</span><b>RUNDE {round}/{totalRounds}</b></div>
            {phase === "reveal" && chosen ? (
              <RoundReveal answer={chosen.word} hits={hits} onNext={nextRound} isLast={round >= totalRounds} />
            ) : (
              <>
                <LiveLeaderboard entries={leaderboard} />
                <div className="round-status">
                  {phase === "choice" ? "Wähle links einen der beiden Begriffe." : hits.length ? "Erster Treffer! Sammle kurz Platz 2 und 3 …" : "Erklären – der Chat rät live."}
                </div>
              </>
            )}
            {twitch.socketError && <div className="error-box">{twitch.socketError}<button onClick={twitch.reconnect}>Neu verbinden</button></div>}
          </section>

          <LiveChat messages={twitch.messages} />
        </div>
      )}
    </main>
  );
}
