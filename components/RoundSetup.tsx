"use client";

export function RoundSetup({
  title,
  description,
  rounds,
  onRounds,
  onStart,
}: {
  title: string;
  description: string;
  rounds: number;
  onRounds: (value: number) => void;
  onStart: () => void;
}) {
  return (
    <section className="card setup-card">
      <span className="eyebrow">TWITCH GAME</span>
      <h1>{title}</h1>
      <p>{description}</p>
      <label className="setup-field">
        <span>Rundenanzahl</span>
        <input
          className="input rounds-input"
          type="number"
          min={1}
          max={130}
          value={rounds}
          onChange={(event) => onRounds(Math.max(1, Math.min(130, Number(event.target.value) || 1)))}
        />
      </label>
      <button className="btn btn-primary btn-wide" type="button" onClick={onStart}>SPIEL STARTEN</button>
    </section>
  );
}
