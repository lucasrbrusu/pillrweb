
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin, readJson } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service } = await requireAdmin(req);
    const body = await readJson(req) as { limit?: number };
    const limit = Math.min(Math.max(body.limit || 75, 1), 200);

    const { data, error: queryError } = await service
      .from("admin_audit_logs")
      .select("id, actor_user_id, actor_email, action, target_type, target_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (queryError) throw queryError;

    return json({ logs: data || [] });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not load audit logs.", (err as any)?.status || 500);
  }
});
