"use client";

import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";
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
import { drawingEntries } from "@/lib/game-data";

type Phase = "setup" | "choice" | "active" | "reveal" | "finished";
const COLORS = ["#ffffff", "#111827", "#ef4444", "#f97316", "#facc15", "#22c55e", "#38bdf8", "#3b82f6", "#a855f7", "#ec4899"];

export default function DrawingPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [totalRounds, setTotalRounds] = useState(10);
  const [round, setRound] = useState(1);
  const [options, setOptions] = useState<string[]>([]);
  const [word, setWord] = useState("");
  const [hits, setHits] = useState<RoundHit[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [color, setColor] = useState("#111827");
  const [brush, setBrush] = useState(8);
  const [eraser, setEraser] = useState(false);
  const deckRef = useRef<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const undoRef = useRef<string[]>([]);
  const startRef = useRef(0);
  const hitsRef = useRef<RoundHit[]>([]);
  const phaseRef = useRef<Phase>(phase);
  const wordRef = useRef("");
  const finishTimerRef = useRef<number | null>(null);
  const awardedRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { wordRef.current = word; }, [word]);
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
    if (phaseRef.current !== "active" || !wordRef.current) return;
    if (line.text.trim().startsWith("!")) return;
    if (!isCorrectGuess(line.text, wordRef.current)) return;
    if (hitsRef.current.some((hit) => hit.userId === line.userId)) return;

    const hit: RoundHit = { userId: line.userId, userName: line.userName, ms: Date.now() - startRef.current };
    const next = [...hitsRef.current, hit].sort((a, b) => a.ms - b.ms);
    hitsRef.current = next;
    setHits(next);
    if (next.length >= 3) finishRound(next);
    else if (next.length === 1 && finishTimerRef.current === null) finishTimerRef.current = window.setTimeout(() => finishRound(), 3000);
  }, [finishRound]);

  const twitch = useTwitchChat(onChatLine);

  function canvasContext() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  function clearCanvas(track = true) {
    const canvas = canvasRef.current;
    const ctx = canvasContext();
    if (!canvas || !ctx) return;
    if (track) pushUndo();
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function pushUndo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoRef.current = [...undoRef.current.slice(-19), canvas.toDataURL("image/png")];
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvasContext();
    const snapshot = undoRef.current.pop();
    if (!canvas || !ctx || !snapshot) return;
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };
    img.src = snapshot;
  }

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (phase !== "active") return;
    const ctx = canvasContext();
    if (!ctx) return;
    pushUndo();
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || phase !== "active") return;
    const ctx = canvasContext();
    if (!ctx) return;
    const p = point(event);
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = eraser ? brush * 2 : brush;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function pointerUp() {
    drawingRef.current = false;
    canvasContext()?.closePath();
  }

  function takeOptions() {
    if (deckRef.current.length < 2) deckRef.current = shuffle(drawingEntries);
    const first = deckRef.current.pop();
    const second = deckRef.current.pop();
    setOptions([first, second].filter(Boolean) as string[]);
    setWord("");
    wordRef.current = "";
    hitsRef.current = [];
    setHits([]);
    awardedRef.current = false;
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = null;
    undoRef.current = [];
    setPhase("choice");
    window.setTimeout(() => clearCanvas(false), 0);
  }

  function startGame() {
    deckRef.current = shuffle(drawingEntries);
    setLeaderboard([]);
    setRound(1);
    takeOptions();
  }

  function choose(nextWord: string) {
    setWord(nextWord);
    wordRef.current = nextWord;
    hitsRef.current = [];
    setHits([]);
    startRef.current = Date.now();
    setPhase("active");
    window.setTimeout(() => clearCanvas(false), 0);
  }

  function skip() { takeOptions(); }

  function nextRound() {
    if (round >= totalRounds) {
      setPhase("finished");
      return;
    }
    setRound((value) => value + 1);
    takeOptions();
  }

  if (twitch.authLoading) return <main className="center-page"><div className="muted">Twitch wird geprüft …</div></main>;
  if (!twitch.user) return <TwitchGate configured={twitch.configured} path="/games/drawing" />;
  if (phase === "finished") return <main className="center-page"><FinalLeaderboard title="MONTAGSMALER" entries={leaderboard} onAgain={() => setPhase("setup")} /></main>;

  return (
    <main className="game-page">
      <GameTopbar login={twitch.user.login} state={twitch.socketState} onLogout={twitch.logout} />
      {phase === "setup" ? (
        <div className="setup-wrap"><RoundSetup title="MONTAGSMALER" description="Wähle ein Wort, zeichne es auf der Leinwand und lass den Twitch-Chat raten." rounds={totalRounds} onRounds={setTotalRounds} onStart={startGame} /></div>
      ) : (
        <div className="stream-game-grid drawing-grid">
          <SecretSidePanel>
            <div className="secret-round">Runde {round}/{totalRounds}</div>
            {phase === "choice" ? (
              <>
                <h3>Wähle dein Zeichenwort</h3>
                <div className="word-choice-list">{options.map((entry) => <button className="word-choice" type="button" key={entry} onClick={() => choose(entry)}>{entry}</button>)}</div>
              </>
            ) : (
              <>
                <h3>Zeichne</h3>
                <div className="secret-word">{word}</div>
                {phase === "active" && <button className="btn btn-ghost btn-wide" type="button" onClick={skip}>SKIP</button>}
              </>
            )}
          </SecretSidePanel>

          <section className="game-center card drawing-center">
            <div className="game-title-line"><span>MONTAGSMALER</span><b>RUNDE {round}/{totalRounds}</b></div>
            {phase === "reveal" ? (
              <RoundReveal answer={word} hits={hits} onNext={nextRound} isLast={round >= totalRounds} />
            ) : (
              <>
                <LiveLeaderboard entries={leaderboard} limit={3} />
                <div className="drawing-toolbar">
                  <div className="color-row">{COLORS.map((item) => <button key={item} type="button" className={`color-swatch ${color === item && !eraser ? "selected" : ""}`} style={{ background: item }} onClick={() => { setColor(item); setEraser(false); }} aria-label={`Farbe ${item}`} />)}</div>
                  <div className="tool-row">
                    {[4, 8, 15].map((size) => <button key={size} className={`tool-btn ${brush === size ? "selected" : ""}`} type="button" onClick={() => setBrush(size)}>{size === 4 ? "KLEIN" : size === 8 ? "MITTEL" : "GROSS"}</button>)}
                    <button className={`tool-btn ${eraser ? "selected" : ""}`} type="button" onClick={() => setEraser((value) => !value)}>RADIERER</button>
                    <button className="tool-btn" type="button" onClick={undo}>UNDO</button>
                    <button className="tool-btn" type="button" onClick={() => clearCanvas(true)}>CLEAR</button>
                  </div>
                </div>
                <canvas
                  ref={canvasRef}
                  className={`drawing-canvas ${phase !== "active" ? "canvas-disabled" : ""}`}
                  width={1100}
                  height={650}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerCancel={pointerUp}
                  onPointerLeave={pointerUp}
                />
                <div className="round-status">{phase === "choice" ? "Wähle links zuerst ein Wort." : hits.length ? "Erster Treffer! Sammle kurz Platz 2 und 3 …" : "Zeichnen – der Chat rät live."}</div>
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
