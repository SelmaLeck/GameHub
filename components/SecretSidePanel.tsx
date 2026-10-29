import type { ReactNode } from "react";

export function SecretSidePanel({ children }: { children: ReactNode }) {
  return (
    <aside className="secret-side">
      <div className="facecam-placeholder">
        <strong>FACECAM</strong>
        <span>-Cam hier drüber legen</span>
      </div>
      <div className="streamer-only">
        <span className="streamer-only-label">STREAMER ONLY</span>
        {children}
      </div>
    </aside>
  );
}
