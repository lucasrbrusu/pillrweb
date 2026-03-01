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

-- Canonical app achievement catalog used by the admin dashboard.
-- This creates all tier achievements inside each category.
drop table if exists tmp_admin_achievement_catalog;
create temporary table tmp_admin_achievement_catalog (
  key text primary key,
  name text not null,
  badge_key text not null,
  is_active boolean not null default true
) on commit drop;

-- Longest current streak tiers.
insert into tmp_admin_achievement_catalog (key, name, badge_key, is_active)
select
  format('longest_current_streak_%s_days', days),
  format('%s Day Current Streak', days),
  format('longest_current_streak_%s_days', days),
  true
from unnest(array[2, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365]) as days;

-- Longest habit streak tiers.
insert into tmp_admin_achievement_catalog (key, name, badge_key, is_active)
select
  format('longest_habit_streak_%s_days', days),
  format('%s Day Habit Streak', days),
  format('longest_habit_streak_%s_days', days),
  true
from unnest(array[2, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365]) as days;

-- Total habit completions tiers.
insert into tmp_admin_achievement_catalog (key, name, badge_key, is_active)
select
  format('total_habit_completions_%s', value),
  format('%s Total Habit Completions', value),
  format('total_habit_completions_%s', value),
  true
from unnest(array[1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]) as value;

-- Total habits achieved tiers.
insert into tmp_admin_achievement_catalog (key, name, badge_key, is_active)
select
  format('total_habits_achieved_%s', value),
  format('%s Habits Achieved', value),
  format('total_habits_achieved_%s', value),
  true
from unnest(array[1, 3, 5, 10, 20, 30, 50, 75, 100]) as value;

-- Account age tiers.
insert into tmp_admin_achievement_catalog (key, name, badge_key, is_active)
select
  format('account_age_%s_days', days),
  format('%s Day Account Age', days),
  format('account_age_%s_days', days),
  true
from unnest(array[7, 14, 30, 60, 90, 180, 365, 730, 1095, 1825]) as days;

insert into public.achievements (key, name, badge_key, is_active)
select key, name, badge_key, is_active
from tmp_admin_achievement_catalog
on conflict (key) do update
set
  name = excluded.name,
  badge_key = excluded.badge_key,
  is_active = excluded.is_active;

-- Hide legacy/non-app achievement rows from the admin achievement grant modal.
update public.achievements
set is_active = false
where key not in (select key from tmp_admin_achievement_catalog);
