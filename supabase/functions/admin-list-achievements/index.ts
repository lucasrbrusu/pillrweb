import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin } from "../_shared/admin.ts";
import { APP_ACHIEVEMENT_BY_KEY, APP_ACHIEVEMENT_KEYS } from "../_shared/achievement-catalog.ts";

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

    const achievements = (data || [])
      .map((row: any) => {
        const definition = APP_ACHIEVEMENT_BY_KEY.get(row.key);
        if (!definition) return null;
        return {
          id: row.id,
          key: definition.key,
          name: row.name || definition.name,
          badge_key: row.badge_key || definition.badge_key,
          category_key: definition.category_key,
          category_name: definition.category_name,
          target_value: definition.target_value,
          target_label: definition.target_label,
          sort_order: definition.sort_order,
        };
      })
      .filter((row): row is {
        id: string;
        key: string;
        name: string;
        badge_key: string;
        category_key: string;
        category_name: string;
        target_value: number;
        target_label: string;
        sort_order: number;
      } => Boolean(row))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row: any) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        badge_key: row.badge_key,
        category_key: row.category_key,
        category_name: row.category_name,
        target_value: row.target_value,
        target_label: row.target_label,
      }))
      .filter((row) => Boolean(row.key));

    return json({ achievements });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not load achievements.", (err as any)?.status || 500);
  }
});
