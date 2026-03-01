-- Admin achievements + badges schema used by:
-- - admin-list-achievements
-- - admin-grant-achievements

create extension if not exists pgcrypto;

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  badge_key text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid references public.achievements(id) on delete set null,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  source text,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null,
  unlocked_at timestamptz not null default now(),
  source text,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, badge_key)
);

create index if not exists idx_achievements_key on public.achievements(key);
create index if not exists idx_user_achievements_user_id on public.user_achievements(user_id);
create index if not exists idx_user_badges_user_id on public.user_badges(user_id);

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists achievements_read_all on public.achievements;
create policy achievements_read_all
  on public.achievements
  for select
  to authenticated
  using (true);

drop policy if exists user_achievements_read_own on public.user_achievements;
create policy user_achievements_read_own
  on public.user_achievements
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_badges_read_own on public.user_badges;
create policy user_badges_read_own
  on public.user_badges
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Example catalog rows. Extend with your real app achievements.
insert into public.achievements (key, name, badge_key, is_active)
values
  ('first_login', 'First Login', 'first_login', true),
  ('profile_complete', 'Profile Complete', 'profile_complete', true),
  ('streak_7', '7 Day Streak', 'streak_7', true),
  ('streak_30', '30 Day Streak', 'streak_30', true)
on conflict (key) do nothing;
