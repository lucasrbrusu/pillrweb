
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, logAdminAction, readJson, requireAdmin } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service, user } = await requireAdmin(req, "can_manage_config");
    const body = await readJson(req) as { updates?: Record<string, unknown> };
    const updates = body.updates || {};
    const rows = Object.entries(updates).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }));

    if (!rows.length) return error("No config updates provided.", 400);

    const { error: upsertError } = await service
      .from("app_config")
      .upsert(rows, { onConflict: "key" });
    if (upsertError) throw upsertError;

    await logAdminAction(service, user, "admin_update_config", "app_config", null, { keys: Object.keys(updates) });
    return json({ success: true });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Config update failed.", (err as any)?.status || 500);
  }
});
