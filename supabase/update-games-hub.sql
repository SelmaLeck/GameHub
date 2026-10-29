-- Vullco Games Hub update for an existing Associations database.
-- Run once in Supabase SQL Editor if your existing project still has the old 30-round limit
-- or the old skip_prompt implementation.

alter table public.games
  drop constraint if exists games_total_rounds_check;

alter table public.games
  add constraint games_total_rounds_check
  check (total_rounds between 3 and 130);

create or replace function public.create_game_with_host(
  p_code text,
  p_total_rounds integer,
  p_host_name text,
  p_host_token text,
  p_player_token text
)
returns table(game_id uuid, game_code text, player_id uuid, player_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game_id uuid;
  v_player_id uuid;
  v_code text := upper(trim(p_code));
  v_name text := trim(p_host_name);
begin
  if char_length(v_code) <> 6 then raise exception 'INVALID_CODE'; end if;
  if p_total_rounds < 3 or p_total_rounds > 130 then raise exception 'INVALID_ROUNDS'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 18 then raise exception 'INVALID_NAME'; end if;
  if char_length(p_host_token) < 24 or char_length(p_player_token) < 24 then raise exception 'INVALID_TOKEN'; end if;

  insert into public.games(code, total_rounds)
  values (v_code, p_total_rounds)
  returning id into v_game_id;

  insert into public.players(game_id, name)
  values (v_game_id, v_name)
  returning id into v_player_id;

  update public.games set host_player_id = v_player_id where id = v_game_id;

  insert into public.game_secrets(game_id, host_token_hash)
  values (v_game_id, crypt(p_host_token, gen_salt('bf')));

  insert into public.player_secrets(player_id, player_token_hash)
  values (v_player_id, crypt(p_player_token, gen_salt('bf')));

  return query select v_game_id, v_code, v_player_id, v_name;
end;
$$;

create or replace function public.skip_prompt(
  p_code text,
  p_host_token text,
  p_prompt text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game public.games%rowtype;
  v_hash text;
begin
  select g.* into v_game
  from public.games g
  where g.code = upper(trim(p_code));

  if not found then raise exception 'LOBBY_NOT_FOUND'; end if;

  select host_token_hash into v_hash
  from public.game_secrets
  where game_id = v_game.id;

  if v_hash is null or v_hash <> crypt(p_host_token, v_hash) then
    raise exception 'HOST_FORBIDDEN';
  end if;
  if v_game.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if v_game.revealed or v_game.round_result is not null then raise exception 'ROUND_ALREADY_REVEALED'; end if;

  delete from public.answers
  where game_id = v_game.id and round = v_game.round;

  update public.players
  set submitted_round = greatest(v_game.round - 1, 0)
  where game_id = v_game.id;

  update public.games
  set current_prompt = trim(p_prompt), revealed = false, round_result = null
  where id = v_game.id;
end;
$$;

grant execute on function public.create_game_with_host(text, integer, text, text, text) to anon;
grant execute on function public.skip_prompt(text, text, text) to anon;
