-- VULLCO ASSOCIATIONS v3 - FRISCHES Supabase Setup
-- Nur für ein neues/leeres Projekt. Bei einem bereits eingerichteten v2-Projekt:
-- stattdessen supabase/update-v3.sql ausführen.

create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_player_id uuid null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  round integer not null default 0,
  total_rounds integer not null default 10 check (total_rounds between 3 and 130),
  score integer not null default 0,
  current_prompt text null,
  revealed boolean not null default false,
  round_result text null check (round_result in ('correct', 'wrong')),
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 18),
  submitted_round integer not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, name)
);

alter table public.games
  drop constraint if exists games_host_player_id_fkey;
alter table public.games
  add constraint games_host_player_id_fkey
  foreign key (host_player_id) references public.players(id) on delete set null;

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round integer not null check (round > 0),
  answer text not null check (char_length(answer) between 1 and 48),
  created_at timestamptz not null default now(),
  unique (game_id, player_id, round)
);

-- Geheimnisse liegen absichtlich NICHT in den öffentlich lesbaren Tabellen.
create table if not exists public.game_secrets (
  game_id uuid primary key references public.games(id) on delete cascade,
  host_token_hash text not null
);

create table if not exists public.player_secrets (
  player_id uuid primary key references public.players(id) on delete cascade,
  player_token_hash text not null
);

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.answers enable row level security;
alter table public.game_secrets enable row level security;
alter table public.player_secrets enable row level security;

-- Nur sichere Spieldaten sind öffentlich lesbar.
drop policy if exists "games public read" on public.games;
create policy "games public read" on public.games for select to anon using (true);

drop policy if exists "players public read" on public.players;
create policy "players public read" on public.players for select to anon using (true);

-- Antworten sind serverseitig erst NACH dem Reveal der aktuellen Runde lesbar.
drop policy if exists "answers revealed read" on public.answers;
create policy "answers revealed read" on public.answers
for select to anon
using (
  exists (
    select 1 from public.games g
    where g.id = answers.game_id
      and g.revealed = true
      and g.round = answers.round
  )
);

-- Alte/offene v1-Policies sicher entfernen, falls schema.sql versehentlich erneut läuft.
drop policy if exists "games public insert" on public.games;
drop policy if exists "games public update" on public.games;
drop policy if exists "games public delete" on public.games;
drop policy if exists "players public insert" on public.players;
drop policy if exists "players public update" on public.players;
drop policy if exists "players public delete" on public.players;
drop policy if exists "answers public read" on public.answers;
drop policy if exists "answers public insert" on public.answers;
drop policy if exists "answers public update" on public.answers;
drop policy if exists "answers public delete" on public.answers;

-- Lobby inkl. Host sicher erstellen.
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

-- Beitritt nur mit Name + Lobby-Code. Keine Teilnehmergrenze.
create or replace function public.join_game(
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

create or replace function public.set_lobby_locked(
  p_code text,
  p_host_token text,
  p_locked boolean
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game_id uuid;
  v_status text;
  v_hash text;
begin
  select g.id, g.status, s.host_token_hash into v_game_id, v_status, v_hash
  from public.games g join public.game_secrets s on s.game_id = g.id
  where g.code = upper(trim(p_code));

  if v_game_id is null then raise exception 'LOBBY_NOT_FOUND'; end if;
  if v_hash <> crypt(p_host_token, v_hash) then raise exception 'HOST_FORBIDDEN'; end if;
  if v_status <> 'lobby' then raise exception 'GAME_ALREADY_STARTED'; end if;

  update public.games set is_locked = p_locked where id = v_game_id;
end;
$$;

create or replace function public.start_game(
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
  v_game_id uuid;
  v_status text;
  v_hash text;
  v_count integer;
begin
  select g.id, g.status, s.host_token_hash into v_game_id, v_status, v_hash
  from public.games g join public.game_secrets s on s.game_id = g.id
  where g.code = upper(trim(p_code));

  if v_game_id is null then raise exception 'LOBBY_NOT_FOUND'; end if;
  if v_hash <> crypt(p_host_token, v_hash) then raise exception 'HOST_FORBIDDEN'; end if;
  if v_status <> 'lobby' then raise exception 'GAME_ALREADY_STARTED'; end if;

  select count(*) into v_count from public.players where game_id = v_game_id;
  if v_count < 2 then raise exception 'NOT_ENOUGH_PLAYERS'; end if;

  update public.players set submitted_round = 0 where game_id = v_game_id;
  update public.games set
    status = 'playing', round = 1, score = 0,
    current_prompt = trim(p_prompt), revealed = false,
    round_result = null, is_locked = true
  where id = v_game_id;
end;
$$;

create or replace function public.submit_answer(
  p_code text,
  p_player_id uuid,
  p_player_token text,
  p_answer text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game public.games%rowtype;
  v_hash text;
  v_answer text := trim(p_answer);
begin
  select * into v_game from public.games where code = upper(trim(p_code));
  if not found then raise exception 'LOBBY_NOT_FOUND'; end if;
  if v_game.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if v_game.revealed then raise exception 'ROUND_ALREADY_REVEALED'; end if;
  if char_length(v_answer) < 1 or char_length(v_answer) > 48 then raise exception 'INVALID_ANSWER'; end if;

  select ps.player_token_hash into v_hash
  from public.players p
  join public.player_secrets ps on ps.player_id = p.id
  where p.id = p_player_id and p.game_id = v_game.id;

  if v_hash is null or v_hash <> crypt(p_player_token, v_hash) then raise exception 'PLAYER_FORBIDDEN'; end if;
  if exists (
    select 1 from public.answers
    where game_id = v_game.id and player_id = p_player_id and round = v_game.round
  ) then raise exception 'ALREADY_SUBMITTED'; end if;

  insert into public.answers(game_id, player_id, round, answer)
  values (v_game.id, p_player_id, v_game.round, v_answer);

  update public.players set submitted_round = v_game.round where id = p_player_id;
end;
$$;

create or replace function public.reveal_round(
  p_code text,
  p_host_token text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game public.games%rowtype;
  v_hash text;
  v_players integer;
  v_answers integer;
begin
  select g.* into v_game from public.games g where g.code = upper(trim(p_code));
  if not found then raise exception 'LOBBY_NOT_FOUND'; end if;
  select host_token_hash into v_hash from public.game_secrets where game_id = v_game.id;
  if v_hash is null or v_hash <> crypt(p_host_token, v_hash) then raise exception 'HOST_FORBIDDEN'; end if;
  if v_game.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if v_game.revealed then return; end if;

  select count(*) into v_players from public.players where game_id = v_game.id;
  select count(*) into v_answers from public.answers where game_id = v_game.id and round = v_game.round;
  if v_players = 0 or v_answers < v_players then raise exception 'WAIT_FOR_ALL_PLAYERS'; end if;

  update public.games set revealed = true where id = v_game.id;
end;
$$;

create or replace function public.judge_round(
  p_code text,
  p_host_token text,
  p_result text
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
  if p_result not in ('correct', 'wrong') then raise exception 'INVALID_RESULT'; end if;
  select g.* into v_game from public.games g where g.code = upper(trim(p_code));
  if not found then raise exception 'LOBBY_NOT_FOUND'; end if;
  select host_token_hash into v_hash from public.game_secrets where game_id = v_game.id;
  if v_hash is null or v_hash <> crypt(p_host_token, v_hash) then raise exception 'HOST_FORBIDDEN'; end if;
  if not v_game.revealed then raise exception 'REVEAL_FIRST'; end if;
  if v_game.round_result is not null then return; end if;

  update public.games set
    round_result = p_result,
    score = score + case when p_result = 'correct' then 1 else 0 end
  where id = v_game.id and round_result is null;
end;
$$;

create or replace function public.next_round(
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
  select g.* into v_game from public.games g where g.code = upper(trim(p_code));
  if not found then raise exception 'LOBBY_NOT_FOUND'; end if;
  select host_token_hash into v_hash from public.game_secrets where game_id = v_game.id;
  if v_hash is null or v_hash <> crypt(p_host_token, v_hash) then raise exception 'HOST_FORBIDDEN'; end if;
  if v_game.round_result is null then raise exception 'JUDGE_FIRST'; end if;

  if v_game.round >= v_game.total_rounds then
    update public.games set status = 'finished', is_locked = true where id = v_game.id;
  else
    update public.games set
      round = round + 1,
      current_prompt = trim(p_prompt),
      revealed = false,
      round_result = null
    where id = v_game.id;
  end if;
end;
$$;

create or replace function public.restart_game(
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
  v_game_id uuid;
  v_hash text;
begin
  select g.id, s.host_token_hash into v_game_id, v_hash
  from public.games g join public.game_secrets s on s.game_id = g.id
  where g.code = upper(trim(p_code));
  if v_game_id is null then raise exception 'LOBBY_NOT_FOUND'; end if;
  if v_hash <> crypt(p_host_token, v_hash) then raise exception 'HOST_FORBIDDEN'; end if;

  delete from public.answers where game_id = v_game_id;
  update public.players set submitted_round = 0 where game_id = v_game_id;
  update public.games set
    status = 'playing', round = 1, score = 0,
    current_prompt = trim(p_prompt), revealed = false,
    round_result = null, is_locked = true
  where id = v_game_id;
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

-- Nur Lesen auf sicheren Tabellen. Schreiben ausschließlich über die RPC-Funktionen oben.
grant usage on schema public to anon;
revoke all on table public.games, public.players, public.answers from anon;
grant select on table public.games, public.players, public.answers to anon;
revoke all on table public.game_secrets, public.player_secrets from anon;

revoke execute on function public.create_game_with_host(text, integer, text, text, text) from public;
revoke execute on function public.join_game(text, text, text) from public;
revoke execute on function public.set_lobby_locked(text, text, boolean) from public;
revoke execute on function public.start_game(text, text, text) from public;
revoke execute on function public.submit_answer(text, uuid, text, text) from public;
revoke execute on function public.reveal_round(text, text) from public;
revoke execute on function public.judge_round(text, text, text) from public;
revoke execute on function public.next_round(text, text, text) from public;
revoke execute on function public.restart_game(text, text, text) from public;
revoke execute on function public.skip_prompt(text, text, text) from public;

grant execute on function public.create_game_with_host(text, integer, text, text, text) to anon;
grant execute on function public.join_game(text, text, text) to anon;
grant execute on function public.set_lobby_locked(text, text, boolean) to anon;
grant execute on function public.start_game(text, text, text) to anon;
grant execute on function public.submit_answer(text, uuid, text, text) to anon;
grant execute on function public.reveal_round(text, text) to anon;
grant execute on function public.judge_round(text, text, text) to anon;
grant execute on function public.next_round(text, text, text) to anon;
grant execute on function public.restart_game(text, text, text) to anon;
grant execute on function public.skip_prompt(text, text, text) to anon;

-- Realtime für sichtbare Spielzustände.
do $$
begin
  begin alter publication supabase_realtime add table public.games; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.answers; exception when duplicate_object then null; end;
end $$;
