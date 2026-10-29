import { NextRequest, NextResponse } from "next/server";
import {
  TWITCH_SESSION_COOKIE,
  getValidTwitchSession,
  sealTwitchSession,
  twitchClientId,
  twitchConfigured,
} from "@/lib/twitch-auth";

export const runtime = "nodejs";

type ExistingSubscription = {
  id: string;
  type: string;
  condition?: { broadcaster_user_id?: string; user_id?: string };
};

export async function POST(request: NextRequest) {
  if (!twitchConfigured()) return NextResponse.json({ error: "Twitch ist nicht konfiguriert." }, { status: 503 });
  const raw = request.cookies.get(TWITCH_SESSION_COOKIE)?.value;
  const { session, refreshed } = await getValidTwitchSession(raw);
  if (!session) return NextResponse.json({ error: "Nicht mit Twitch verbunden." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { sessionId?: string } | null;
  const sessionId = body?.sessionId?.trim();
  if (!sessionId) return NextResponse.json({ error: "EventSub Session-ID fehlt." }, { status: 400 });

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    "Client-Id": twitchClientId(),
    "Content-Type": "application/json",
  };

  // Alte/stale Chat-Subscriptions dieses Accounts entfernen, damit ein frischer Stream-Tab sauber verbindet.
  const listResponse = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions?type=channel.chat.message", {
    headers,
    cache: "no-store",
  });
  if (listResponse.ok) {
    const list = (await listResponse.json()) as { data?: ExistingSubscription[] };
    const stale = (list.data ?? []).filter(
      (item) =>
        item.type === "channel.chat.message" &&
        item.condition?.broadcaster_user_id === session.userId &&
        item.condition?.user_id === session.userId
    );
    await Promise.all(
      stale.map((item) =>
        fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${encodeURIComponent(item.id)}`, {
          method: "DELETE",
          headers,
          cache: "no-store",
        })
      )
    );
  }

  const createResponse = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "channel.chat.message",
      version: "1",
      condition: {
        broadcaster_user_id: session.userId,
        user_id: session.userId,
      },
      transport: {
        method: "websocket",
        session_id: sessionId,
      },
    }),
    cache: "no-store",
  });

  const payload = await createResponse.json().catch(() => ({}));
  const response = NextResponse.json(
    createResponse.ok ? { ok: true } : { error: payload?.message || "EventSub konnte nicht verbunden werden." },
    { status: createResponse.ok ? 200 : createResponse.status }
  );

  if (refreshed) {
    response.cookies.set(TWITCH_SESSION_COOKIE, sealTwitchSession(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}
