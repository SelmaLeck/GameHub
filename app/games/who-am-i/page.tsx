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
import { whoAmIEntries } from "@/lib/game-data";

type Phase = "setup" | "active" | "reveal" | "finished";

export default function WhoAmIPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [totalRounds, setTotalRounds] = useState(10);
  const [round, setRound] = useState(1);
  const [person, setPerson] = useState("");
  const [hits, setHits] = useState<RoundHit[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const deckRef = useRef<string[]>([]);
  const startRef = useRef(0);
  const hitsRef = useRef<RoundHit[]>([]);
  const personRef = useRef("");
  const phaseRef = useRef<Phase>(phase);
  const finishTimerRef = useRef<number | null>(null);
  const awardedRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { personRef.current = person; }, [person]);
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
    if (phaseRef.current !== "active" || !personRef.current) return;
    if (line.text.trim().startsWith("!")) return;
    if (!isCorrectGuess(line.text, personRef.current)) return;
    if (hitsRef.current.some((hit) => hit.userId === line.userId)) return;

    const hit: RoundHit = { userId: line.userId, userName: line.userName, ms: Date.now() - startRef.current };
    const next = [...hitsRef.current, hit].sort((a, b) => a.ms - b.ms);
    hitsRef.current = next;
    setHits(next);
    if (next.length >= 3) finishRound(next);
    else if (next.length === 1 && finishTimerRef.current === null) finishTimerRef.current = window.setTimeout(() => finishRound(), 3000);
  }, [finishRound]);

  const twitch = useTwitchChat(onChatLine);

  function beginRound() {
    if (!deckRef.current.length) deckRef.current = shuffle(whoAmIEntries);
    const next = deckRef.current.pop() ?? whoAmIEntries[0];
    setPerson(next);
    personRef.current = next;
    hitsRef.current = [];
    setHits([]);
    awardedRef.current = false;
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = null;
    startRef.current = Date.now();
    setPhase("active");
  }

  function startGame() {
    deckRef.current = shuffle(whoAmIEntries);
    setLeaderboard([]);
    setRound(1);
    beginRound();
  }

  function skip() { beginRound(); }

  function nextRound() {
    if (round >= totalRounds) {
      setPhase("finished");
      return;
    }
    setRound((value) => value + 1);
    beginRound();
  }

  if (twitch.authLoading) return <main className="center-page"><div className="muted">Twitch wird geprüft …</div></main>;
  if (!twitch.user) return <TwitchGate configured={twitch.configured} path="/games/who-am-i" />;
  if (phase === "finished") return <main className="center-page"><FinalLeaderboard title="WER BIN ICH?" entries={leaderboard} onAgain={() => setPhase("setup")} /></main>;

  return (
    <main className="game-page">
      <GameTopbar login={twitch.user.login} state={twitch.socketState} onLogout={twitch.logout} />
      {phase === "setup" ? (
        <div className="setup-wrap"><RoundSetup title="WER BIN ICH?" description="Du bekommst eine Person oder Figur und beschreibst sie. Der Chat versucht als Erster den Namen zu erraten." rounds={totalRounds} onRounds={setTotalRounds} onStart={startGame} /></div>
      ) : (
        <div className="stream-game-grid">
          <SecretSidePanel>
            <div className="secret-round">Runde {round}/{totalRounds}</div>
            <h3>Du bist</h3>
            <div className="secret-word">{person}</div>
            {phase === "active" && <button className="btn btn-ghost btn-wide" type="button" onClick={skip}>SKIP</button>}
          </SecretSidePanel>

          <section className="game-center card">
            <div className="game-title-line"><span>WER BIN ICH?</span><b>RUNDE {round}/{totalRounds}</b></div>
            {phase === "reveal" ? (
              <RoundReveal answer={person} hits={hits} onNext={nextRound} isLast={round >= totalRounds} />
            ) : (
              <>
                <LiveLeaderboard entries={leaderboard} />
                <div className="round-status">{hits.length ? "Erster Treffer! Sammle kurz Platz 2 und 3 …" : "Beschreiben – der Chat rät live."}</div>
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
