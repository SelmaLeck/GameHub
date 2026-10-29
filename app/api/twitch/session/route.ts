import { NextRequest, NextResponse } from "next/server";
import {
  TWITCH_SESSION_COOKIE,
  getValidTwitchSession,
  sealTwitchSession,
  twitchConfigured,
} from "@/lib/twitch-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!twitchConfigured()) {
    return NextResponse.json({ connected: false, configured: false });
  }

  const raw = request.cookies.get(TWITCH_SESSION_COOKIE)?.value;
  const { session, refreshed } = await getValidTwitchSession(raw);
  const response = NextResponse.json(
    session
      ? { connected: true, configured: true, user: { id: session.userId, login: session.login } }
      : { connected: false, configured: true }
  );

  if (session && refreshed) {
    response.cookies.set(TWITCH_SESSION_COOKIE, sealTwitchSession(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  if (!session && raw) response.cookies.delete(TWITCH_SESSION_COOKIE);
  return response;
}
