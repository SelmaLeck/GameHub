-- VULLCO ASSOCIATIONS: UPDATE v2 -> v3
-- Für dein bereits eingerichtetes v2-Supabase-Projekt.
-- Entfernt den zusätzlichen PIN: Beitritt funktioniert wieder nur mit Name + Lobby-Code.
-- Host-/Spieler-Tokens und die Lobby-Sperre bleiben erhalten.

create extension if not exists pgcrypto;

-- Alte RPCs mit PIN zuerst entfernen.
drop function if exists public.create_game_with_host(text, integer, text, text, text, text);
drop function if exists public.join_game_with_pin(text, text, text, text);

-- Falls dieses Update erneut ausgeführt wird, die v3-Signaturen ebenfalls sauber neu anlegen.
drop function if exists public.create_game_with_host(text, integer, text, text, text);
drop function if exists public.join_game(text, text, text);

-- Der PIN-Hash wird nicht mehr benötigt.
alter table public.game_secrets drop column if exists join_pin_hash;

-- Lobby inkl. Host erstellen: nur noch Code + sichere Session-Tokens.
create function public.create_game_with_host(
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
  if p_total_rounds < 3 or p_total_rounds > 30 then raise exception 'INVALID_ROUNDS'; end if;
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

-- Beitritt nur mit Name + Lobby-Code. Keine Teilnehmergrenze.
create function public.join_game(
  p_code text,
  p_name text,
  p_player_token text
)
returns table(game_id uuid, player_id uuid, player_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game public.games%rowtype;
  v_player_id uuid;
  v_name text := trim(p_name);
begin
  select * into v_game
  from public.games
  where code = upper(trim(p_code))
  for update;

  if not found then raise exception 'LOBBY_NOT_FOUND'; end if;
  if v_game.status <> 'lobby' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if v_game.is_locked then raise exception 'LOBBY_LOCKED'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 18 then raise exception 'INVALID_NAME'; end if;
  if char_length(p_player_token) < 24 then raise exception 'INVALID_TOKEN'; end if;

  insert into public.players(game_id, name)
  values (v_game.id, v_name)
  returning id into v_player_id;

  insert into public.player_secrets(player_id, player_token_hash)
  values (v_player_id, crypt(p_player_token, gen_salt('bf')));

  return query select v_game.id, v_player_id, v_name;
end;
$$;

-- Standardmäßig dürfen neue Funktionen sonst von PUBLIC ausgeführt werden.
revoke execute on function public.create_game_with_host(text, integer, text, text, text) from public;
revoke execute on function public.join_game(text, text, text) from public;
grant execute on function public.create_game_with_host(text, integer, text, text, text) to anon;
grant execute on function public.join_game(text, text, text) to anon;
