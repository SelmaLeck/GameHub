import crypto from "node:crypto";

export const TWITCH_SESSION_COOKIE = "vullco_twitch_session";
export const TWITCH_STATE_COOKIE = "vullco_twitch_oauth_state";

export type TwitchSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  login: string;
  scopes: string[];
  createdAt: number;
};

function getClientId() {
  const value = process.env.TWITCH_CLIENT_ID;
  if (!value) throw new Error("TWITCH_CLIENT_ID fehlt.");
  return value;
}

function getClientSecret() {
  const value = process.env.TWITCH_CLIENT_SECRET;
  if (!value) throw new Error("TWITCH_CLIENT_SECRET fehlt.");
  return value;
}

function encryptionKey() {
  return crypto.createHash("sha256").update(getClientSecret()).digest();
}

export function twitchConfigured() {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

export function sealTwitchSession(session: TwitchSession) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function unsealTwitchSession(value?: string | null): TwitchSession | null {
  if (!value) return null;
  try {
    const [ivPart, tagPart, dataPart] = value.split(".");
    if (!ivPart || !tagPart || !dataPart) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(decrypted) as TwitchSession;
  } catch {
    return null;
  }
}

async function validateAccessToken(accessToken: string) {
  const response = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as {
    client_id: string;
    login: string;
    scopes: string[];
    user_id: string;
    expires_in: number;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    scope?: string[];
  };
}

export async function getValidTwitchSession(rawCookie?: string | null) {
  const current = unsealTwitchSession(rawCookie);
  if (!current) return { session: null as TwitchSession | null, refreshed: false };

  const validation = await validateAccessToken(current.accessToken);
  if (validation && validation.client_id === getClientId()) {
    const session: TwitchSession = {
      ...current,
      userId: validation.user_id,
      login: validation.login,
      scopes: validation.scopes ?? current.scopes,
    };
    return { session, refreshed: false };
  }

  const refreshedToken = await refreshAccessToken(current.refreshToken);
  if (!refreshedToken?.access_token) {
    return { session: null as TwitchSession | null, refreshed: false };
  }

  const nextValidation = await validateAccessToken(refreshedToken.access_token);
  if (!nextValidation || nextValidation.client_id !== getClientId()) {
    return { session: null as TwitchSession | null, refreshed: false };
  }

  const session: TwitchSession = {
    accessToken: refreshedToken.access_token,
    refreshToken: refreshedToken.refresh_token || current.refreshToken,
    userId: nextValidation.user_id,
    login: nextValidation.login,
    scopes: nextValidation.scopes ?? refreshedToken.scope ?? current.scopes,
    createdAt: Date.now(),
  };
  return { session, refreshed: true };
}

export function twitchClientId() {
  return getClientId();
}

export function twitchClientSecret() {
  return getClientSecret();
}
