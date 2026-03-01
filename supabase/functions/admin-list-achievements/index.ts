import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service } = await requireAdmin(req, "can_manage_users");
    const { data, error: queryError } = await service
      .from("achievements")
      .select("id,key,name,badge_key,is_active")
      .order("name", { ascending: true });
    if (queryError) throw queryError;

    const achievements = (data || [])
      .filter((row: any) => row?.is_active !== false)
      .map((row: any) => ({
        id: row.id,
        key: row.key,
        name: row.name || row.key,
        badge_key: row.badge_key || row.key,
      }))
      .filter((row) => Boolean(row.key));

    return json({ achievements });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not load achievements.", (err as any)?.status || 500);
  }
});
