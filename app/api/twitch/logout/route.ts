import { NextRequest, NextResponse } from "next/server";
import { TWITCH_SESSION_COOKIE } from "@/lib/twitch-auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(TWITCH_SESSION_COOKIE);
  return response;
}
