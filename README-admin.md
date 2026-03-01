
# Pillaflow admin dashboard bundle

This website bundle adds a static admin control centre to your existing Pillaflow website and includes the matching Supabase SQL + Edge Functions.

## What is included

- `index.html` updated with an **Admin login** button
- `admin/login.html` for Supabase admin sign-in
- `admin/dashboard.html` with tabs for:
  - Overview
  - Users
  - Reports
  - Push
  - Config
  - Audit
- `supabase/admin-dashboard-setup.sql`
- `supabase/admin-achievements-setup.sql`
- `supabase/functions/*` admin Edge Functions

## Setup order

1. Run `supabase/admin-dashboard-setup.sql` in the Supabase SQL editor.
2. Run `supabase/admin-achievements-setup.sql` in the Supabase SQL editor.
3. Create a real admin user in Supabase Auth.
4. Insert that auth user into `public.admin_users` using the commented seed block in the SQL file.
5. Copy your real project values into `admin/js/config.js`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Deploy the Edge Functions inside `supabase/functions/`.
7. Deploy the updated website files.

## Deploying the Edge Functions

From your app project root, copy the folders under `supabase/functions/` into your real Supabase project and run:

```bash
supabase functions deploy admin-check-access
supabase functions deploy admin-get-dashboard-metrics
supabase functions deploy admin-search-users
supabase functions deploy admin-delete-user
supabase functions deploy admin-list-achievements
supabase functions deploy admin-grant-achievements
supabase functions deploy admin-update-user-plan
supabase functions deploy admin-set-account-status
supabase functions deploy admin-list-reports
supabase functions deploy admin-resolve-report
supabase functions deploy admin-send-push
supabase functions deploy admin-get-config
supabase functions deploy admin-update-config
supabase functions deploy admin-list-audit-logs
```

## Frontend config

Edit `admin/js/config.js` before going live. Do not put the service role key into the website.

## Mobile app wiring you still need

In your mobile app, update your profile/session loader so that it reacts to these fields:

- `profiles.account_status`
- `profiles.suspended_until`
- `profiles.status_reason`
- `app_config.maintenance_mode`
- `app_config.global_banner`
- `app_config.min_supported_version`

That lets the admin dashboard control the live app behaviour.
