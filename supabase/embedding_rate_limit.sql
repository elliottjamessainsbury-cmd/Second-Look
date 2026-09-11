-- Shared, atomic rate limiting for the /api/taste-embedding endpoint.
--
-- The endpoint enforces a per-user limit on how often it will call the paid
-- OpenAI embeddings API. An in-process Map cannot enforce this on Vercel,
-- where each function instance (and every cold start) has its own memory, so
-- the counter lives here in Postgres and is checked atomically per request.
--
-- Apply once in the Supabase SQL editor (or via `supabase db` tooling), then
-- set SUPABASE_SERVICE_ROLE_KEY in the Vercel project's environment variables.
-- Until both are in place the endpoint falls back to the per-process limiter.

create table if not exists public.embedding_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists embedding_rate_events_user_time
  on public.embedding_rate_events (user_id, created_at desc);

-- Returns true and records the request when the caller is under the limit;
-- returns false when they are at or over it. Runs as a single statement batch
-- so concurrent calls from different function instances serialise correctly.
create or replace function public.check_embedding_rate_limit(
  p_user_id uuid,
  p_window_ms integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start timestamptz := now() - make_interval(secs => p_window_ms / 1000.0);
  recent_count integer;
begin
  -- Opportunistic cleanup of rows older than the window.
  delete from public.embedding_rate_events where created_at < window_start;

  select count(*) into recent_count
    from public.embedding_rate_events
   where user_id = p_user_id and created_at >= window_start;

  if recent_count >= p_limit then
    return false;
  end if;

  insert into public.embedding_rate_events (user_id) values (p_user_id);
  return true;
end;
$$;

-- The endpoint calls this with the service role key; do not expose it to anon.
revoke all on function public.check_embedding_rate_limit(uuid, integer, integer) from anon;
