export type GameStatus = "lobby" | "playing" | "finished";
export type RoundResult = "correct" | "wrong" | null;

export type Game = {
  id: string;
  code: string;
  host_player_id: string | null;
  status: GameStatus;
  round: number;
  total_rounds: number;
  score: number;
  current_prompt: string | null;
  revealed: boolean;
  round_result: RoundResult;
  is_locked: boolean;
  created_at: string;
};

export type Player = {
  id: string;
  game_id: string;
  name: string;
  submitted_round: number;
  created_at: string;
};

export type Answer = {
  id: string;
  game_id: string;
  player_id: string;
  round: number;
  answer: string;
  created_at: string;
};

export type LocalPlayer = {
  id: string;
  name: string;
  token: string;
};
