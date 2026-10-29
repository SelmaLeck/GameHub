"use client";

import { useEffect, useRef } from "react";
import type { ChatLine } from "@/lib/chat-game";

export function LiveChat({ messages }: { messages: ChatLine[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  return (
    <aside className="live-chat-card">
      <div className="panel-heading">
        <span className="hubgame-live-dot" />
        <strong>LIVE CHAT</strong>
      </div>
      <div className="live-chat-list">
        {messages.length === 0 ? (
          <p className="empty-copy">Noch keine Chat-Nachrichten.</p>
        ) : messages.map((line, index) => (
          <div className="chat-line" key={`${line.userId}-${line.at}-${index}`}>
            <strong>@{line.userName}</strong>
            <span>{line.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
}
