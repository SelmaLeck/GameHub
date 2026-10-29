"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatLine } from "@/lib/chat-game";

type TwitchUser = { id: string; login: string };
export type SocketState = "connecting" | "connected" | "disconnected" | "error";

type EventSubMessage = {
  metadata?: { message_type?: string; subscription_type?: string };
  payload?: {
    session?: { id?: string; reconnect_url?: string };
    event?: {
      chatter_user_id?: string;
      chatter_user_name?: string;
      message?: { text?: string };
    };
  };
};

export function useTwitchChat(onChatLine?: (line: ChatLine) => void) {
  const [configured, setConfigured] = useState(true);
  const [user, setUser] = useState<TwitchUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [socketState, setSocketState] = useState<SocketState>("disconnected");
  const [socketError, setSocketError] = useState("");
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onChatLine);
  const selfIdRef = useRef("");

  useEffect(() => { handlerRef.current = onChatLine; }, [onChatLine]);
  useEffect(() => { selfIdRef.current = user?.id ?? ""; }, [user?.id]);

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

  useEffect(() => { loadSession(); }, [loadSession]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(loadSession, 55 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [user, loadSession]);

  const connect = useCallback((url = "wss://eventsub.wss.twitch.tv/ws", subscribeOnWelcome = true) => {
    socketRef.current?.close();
    setSocketState("connecting");
    setSocketError("");
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onmessage = async (event) => {
      let message: EventSubMessage;
      try { message = JSON.parse(event.data); } catch { return; }
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
        if (reconnectUrl) connect(reconnectUrl, false);
        return;
      }
      if (type === "revocation") {
        setSocketState("error");
        setSocketError("Twitch hat die Chat-Verbindung beendet. Bitte neu verbinden.");
        return;
      }
      if (type !== "notification" || message.metadata?.subscription_type !== "channel.chat.message") return;

      const payload = message.payload?.event;
      const userId = payload?.chatter_user_id ?? "";
      const userName = payload?.chatter_user_name ?? "Unbekannt";
      const text = payload?.message?.text?.trim() ?? "";
      if (!userId || !text) return;
      const line: ChatLine = { userId, userName, text, at: Date.now() };
      setMessages((current) => [...current.slice(-49), line]);
      if (line.userId !== selfIdRef.current) handlerRef.current?.(line);
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
  }, []);

  useEffect(() => {
    if (!user) return;
    connect();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user, connect]);

  async function logout() {
    await fetch("/api/twitch/logout", { method: "POST" });
    socketRef.current?.close();
    setUser(null);
    setMessages([]);
  }

  return {
    configured,
    user,
    authLoading,
    socketState,
    socketError,
    messages,
    reconnect: () => connect(),
    logout,
  };
}
