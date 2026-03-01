
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, getProfileByUserId, json, logAdminAction, readJson, requireAdmin, updateProfileByUserId } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service, user } = await requireAdmin(req, "can_manage_billing");
    const body = await readJson(req) as { user_id?: string; plan?: string; premium_days?: number };
    if (!body.user_id) return error("Missing user_id.", 400);

    const current = await getProfileByUserId(service, body.user_id);
    if (!current) return error("Profile not found for that user.", 404);

    const premiumDays = Math.max(Number(body.premium_days || 0), 0);
    const patch: Record<string, unknown> = {
      plan: body.plan || "free",
      premium_expires_at: premiumDays > 0
        ? new Date(Date.now() + premiumDays * 24 * 60 * 60 * 1000).toISOString()
        : null,
    };

    const updated = await updateProfileByUserId(service, body.user_id, patch);
    if (!updated) return error("Could not update premium state.", 500);

    await logAdminAction(service, user, "admin_update_user_plan", "profile", body.user_id, patch);
    return json({ success: true, profile: updated });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Plan update failed.", (err as any)?.status || 500);
  }
});
