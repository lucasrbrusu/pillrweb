
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, logAdminAction, readJson, requireAdmin } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service, user } = await requireAdmin(req, "can_manage_reports");
    const body = await readJson(req) as { report_id?: string; status?: string; moderator_note?: string };
    if (!body.report_id) return error("Missing report_id.", 400);

    const patch = {
      status: body.status || "resolved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      moderator_note: body.moderator_note || null,
    };

    const { data, error: updateError } = await service
      .from("friend_reports")
      .update(patch)
      .eq("id", body.report_id)
      .select("*")
      .maybeSingle();

    if (updateError) throw updateError;
    await logAdminAction(service, user, "admin_resolve_report", "friend_report", body.report_id, patch);
    return json({ success: true, report: data });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not resolve report.", (err as any)?.status || 500);
  }
});
