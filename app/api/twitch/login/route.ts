import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { TWITCH_STATE_COOKIE, twitchClientId, twitchConfigured } from "@/lib/twitch-auth";

export const runtime = "nodejs";
const NEXT_COOKIE = "vullco_twitch_next";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  const target = safeNext(new URL(request.url).searchParams.get("next"));
  if (!twitchConfigured()) {
    return NextResponse.redirect(new URL(`${target}?error=twitch_not_configured`, request.url));
  }

  const state = crypto.randomBytes(24).toString("hex");
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/twitch/callback`;
  const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", twitchClientId());
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "user:read:chat");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(TWITCH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 10 * 60,
  });
  response.cookies.set(NEXT_COOKIE, target, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
