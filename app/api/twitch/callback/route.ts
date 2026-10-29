import { NextRequest, NextResponse } from "next/server";
import {
  TWITCH_SESSION_COOKIE,
  TWITCH_STATE_COOKIE,
  sealTwitchSession,
  twitchClientId,
  twitchClientSecret,
  twitchConfigured,
  type TwitchSession,
} from "@/lib/twitch-auth";

export const runtime = "nodejs";
const NEXT_COOKIE = "vullco_twitch_next";

function targetFrom(request: NextRequest) {
  const value = request.cookies.get(NEXT_COOKIE)?.value;
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const target = targetFrom(request);
  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(new URL(`${target}?error=${encodeURIComponent(error)}`, origin));
  if (!twitchConfigured()) return NextResponse.redirect(new URL(`${target}?error=twitch_not_configured`, origin));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get(TWITCH_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL(`${target}?error=oauth_state`, origin));
  }

  const redirectUri = `${origin}/api/twitch/callback`;
  const body = new URLSearchParams({
    client_id: twitchClientId(),
    client_secret: twitchClientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!tokenResponse.ok) return NextResponse.redirect(new URL(`${target}?error=token_exchange`, origin));

  const token = (await tokenResponse.json()) as { access_token: string; refresh_token: string; scope?: string[] };
  const validationResponse = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  if (!validationResponse.ok) return NextResponse.redirect(new URL(`${target}?error=token_validation`, origin));

  const validation = (await validationResponse.json()) as {
    user_id: string;
    login: string;
    scopes?: string[];
    client_id: string;
  };
  const session: TwitchSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    userId: validation.user_id,
    login: validation.login,
    scopes: validation.scopes ?? token.scope ?? ["user:read:chat"],
    createdAt: Date.now(),
  };

  const response = NextResponse.redirect(new URL(`${target}?connected=1`, origin));
  response.cookies.delete(TWITCH_STATE_COOKIE);
  response.cookies.delete(NEXT_COOKIE);
  response.cookies.set(TWITCH_SESSION_COOKIE, sealTwitchSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
