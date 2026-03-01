
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service } = await requireAdmin(req, "can_manage_config");
    const { data, error: queryError } = await service
      .from("app_config")
      .select("key, value, updated_at, updated_by");
    if (queryError) throw queryError;

    const config = Object.fromEntries((data || []).map((row: any) => [row.key, row.value]));
    return json({ config });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not load config.", (err as any)?.status || 500);
  }
});
