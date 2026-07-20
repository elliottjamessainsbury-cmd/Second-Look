create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_films (
  user_id uuid not null references auth.users(id) on delete cascade,
  film_id text not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, film_id)
);

create table if not exists public.taste_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  liked_film_ids text[] not null default '{}',
  disliked_film_ids text[] not null default '{}',
  mood_affinity jsonb not null default '{}',
  theme_affinity jsonb not null default '{}',
  director_affinity jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.saved_films enable row level security;
alter table public.taste_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can read own saved films" on public.saved_films;
create policy "Users can read own saved films"
on public.saved_films for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own saved films" on public.saved_films;
create policy "Users can insert own saved films"
on public.saved_films for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own saved films" on public.saved_films;
create policy "Users can delete own saved films"
on public.saved_films for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own taste profile" on public.taste_profiles;
create policy "Users can read own taste profile"
on public.taste_profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own taste profile" on public.taste_profiles;
create policy "Users can insert own taste profile"
on public.taste_profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own taste profile" on public.taste_profiles;
create policy "Users can update own taste profile"
on public.taste_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
