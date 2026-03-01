
-- Pillaflow admin dashboard setup
-- Run this after your core app schema exists.

create extension if not exists pgcrypto;

-- 1) Admin user registry
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'support' check (role in ('support','moderator','admin','super_admin')),
  is_active boolean not null default true,
  can_manage_users boolean not null default false,
  can_manage_reports boolean not null default false,
  can_manage_push boolean not null default false,
  can_manage_billing boolean not null default false,
  can_manage_config boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row
execute function public.set_timestamp_updated_at();

alter table public.admin_users enable row level security;

drop policy if exists "admin_users_select_self" on public.admin_users;
create policy "admin_users_select_self"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.admin_users from anon;
grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;

-- 2) Audit logs
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_idx on public.admin_audit_logs (actor_user_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

revoke all on public.admin_audit_logs from anon, authenticated;
grant all on public.admin_audit_logs to service_role;

-- 3) App config for remote control
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant all on public.app_config to service_role;

insert into public.app_config (key, value)
values
  ('maintenance_mode', jsonb_build_object('enabled', false)),
  ('global_banner', jsonb_build_object('text', '')),
  ('min_supported_version', jsonb_build_object('value', '1.0.0'))
on conflict (key) do nothing;

-- 4) Profiles fields that the admin dashboard controls
alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists suspended_until timestamptz,
  add column if not exists status_reason text;

-- 5) Add moderation workflow fields to friend_reports
alter table public.friend_reports
  add column if not exists status text not null default 'open',
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists moderator_note text;

create index if not exists friend_reports_status_idx on public.friend_reports (status, created_at desc);

-- 6) Helpful indexes for admin search
create index if not exists profiles_admin_email_idx on public.profiles ((lower(coalesce(email, ''))));
create index if not exists profiles_admin_username_idx on public.profiles ((lower(coalesce(username, ''))));
create index if not exists profiles_admin_full_name_idx on public.profiles ((lower(coalesce(full_name, ''))));
create index if not exists profiles_admin_account_status_idx on public.profiles (account_status);
create index if not exists profiles_admin_plan_idx on public.profiles (plan);

-- 7) Seed a first super admin (replace the email below after creating the user in Supabase Auth)
-- insert into public.admin_users (
--   user_id,
--   email,
--   role,
--   is_active,
--   can_manage_users,
--   can_manage_reports,
--   can_manage_push,
--   can_manage_billing,
--   can_manage_config
-- )
-- values (
--   'PUT-REAL-AUTH-USER-UUID-HERE',
--   'admin@pillaflow.com',
--   'super_admin',
--   true,
--   true,
--   true,
--   true,
--   true,
--   true
-- )
-- on conflict (user_id) do update
-- set
--   email = excluded.email,
--   role = excluded.role,
--   is_active = excluded.is_active,
--   can_manage_users = excluded.can_manage_users,
--   can_manage_reports = excluded.can_manage_reports,
--   can_manage_push = excluded.can_manage_push,
--   can_manage_billing = excluded.can_manage_billing,
--   can_manage_config = excluded.can_manage_config,
--   updated_at = now();
