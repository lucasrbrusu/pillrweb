import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin } from "../_shared/admin.ts";

const APP_ACHIEVEMENT_KEYS = [
  "longest_current_streak",
  "longest_habit_streak",
  "total_habit_completions",
  "total_habits_achieved",
  "account_age",
] as const;

const APP_ACHIEVEMENT_DEFAULT_NAMES: Record<string, string> = {
  longest_current_streak: "Longest Current Streak",
  longest_habit_streak: "Longest Habit Streak",
  total_habit_completions: "Total Habit Completions",
  total_habits_achieved: "Total Habits Achieved",
  account_age: "Account Age",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service } = await requireAdmin(req, "can_manage_users");
    const { data, error: queryError } = await service
      .from("achievements")
      .select("id,key,name,badge_key,is_active")
      .in("key", [...APP_ACHIEVEMENT_KEYS])
      .eq("is_active", true);
    if (queryError) throw queryError;

    const indexByKey = new Map(APP_ACHIEVEMENT_KEYS.map((key, index) => [key, index]));
    const achievements = (data || [])
      .filter((row: any) => Boolean(row?.key) && indexByKey.has(row.key))
      .map((row: any) => ({
        id: row.id,
        key: row.key,
        name: row.name || APP_ACHIEVEMENT_DEFAULT_NAMES[row.key] || row.key,
        badge_key: row.badge_key || row.key,
      }))
      .sort((a, b) => (indexByKey.get(a.key) ?? 999) - (indexByKey.get(b.key) ?? 999));

    return json({ achievements });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not load achievements.", (err as any)?.status || 500);
  }
});
