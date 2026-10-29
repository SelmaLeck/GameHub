export type ChatLine = {
  userId: string;
  userName: string;
  text: string;
  at: number;
};

export type RoundHit = {
  userId: string;
  userName: string;
  ms: number;
};

export type LeaderboardEntry = {
  userId: string;
  userName: string;
  wins: number;
  totalWinMs: number;
};

export function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ").trim();
}

export function normalizeGuess(value: string) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[’'´`._-]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactGuess(value: string) {
  return normalizeGuess(value).replace(/\s+/g, "");
}

export function levenshtein(a: string, b: string) {
  const left = Array.from(a);
  const right = Array.from(b);
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[right.length];
}

export function isCorrectGuess(message: string, target: string) {
  const msg = normalizeGuess(message);
  const answer = normalizeGuess(target);
  if (!msg || !answer) return false;
  if (msg === answer) return true;

  // Normale Sätze wie "ist es harry potter" dürfen treffen.
  if (msg.split(/\s+/).length <= 7) {
    const padded = ` ${msg} `;
    if (padded.includes(` ${answer} `)) return true;
  }

  const a = compactGuess(msg);
  const b = compactGuess(answer);
  if (!a || !b) return false;

  // Fuzzy nur bei kurzen Guess-Nachrichten, nicht bei normalem Chat-Gerede.
  if (msg.split(/\s+/).length > Math.max(4, answer.split(/\s+/).length + 2)) return false;
  const shortest = Math.min(a.length, b.length);
  const longest = Math.max(a.length, b.length);
  if (shortest <= 4) return false;
  const distance = levenshtein(a, b);
  if (longest <= 8) return distance <= 1;
  if (longest <= 14) return distance <= 2;
  return distance <= 3;
}

export function shuffle<T>(items: readonly T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function sortLeaderboard(entries: LeaderboardEntry[]) {
  return [...entries].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const avgA = a.wins ? a.totalWinMs / a.wins : Number.POSITIVE_INFINITY;
    const avgB = b.wins ? b.totalWinMs / b.wins : Number.POSITIVE_INFINITY;
    if (avgA !== avgB) return avgA - avgB;
    return a.userName.localeCompare(b.userName, "de");
  });
}

export function addWinner(
  entries: LeaderboardEntry[],
  winner: RoundHit | undefined,
): LeaderboardEntry[] {
  if (!winner) return entries;
  const existing = entries.find((entry) => entry.userId === winner.userId);
  if (!existing) {
    return sortLeaderboard([
      ...entries,
      { userId: winner.userId, userName: winner.userName, wins: 1, totalWinMs: winner.ms },
    ]);
  }
  return sortLeaderboard(entries.map((entry) =>
    entry.userId === winner.userId
      ? { ...entry, userName: winner.userName, wins: entry.wins + 1, totalWinMs: entry.totalWinMs + winner.ms }
      : entry,
  ));
}

export function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}
