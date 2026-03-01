
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, logAdminAction, readJson, requireAdmin, updateProfileByUserId } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service, user } = await requireAdmin(req, "can_manage_users");
    const body = await readJson(req) as { user_id?: string; status?: string; suspended_days?: number; reason?: string };
    if (!body.user_id) return error("Missing user_id.", 400);
    if (!body.status) return error("Missing status.", 400);

    let suspendedUntil: string | null = null;
    if (body.status === "suspended") {
      const days = Math.max(Number(body.suspended_days || 7), 1);
      suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const patch = {
      account_status: body.status,
      suspended_until: suspendedUntil,
      status_reason: body.reason || null,
    };

    const updated = await updateProfileByUserId(service, body.user_id, patch);
    if (!updated) return error("Could not update account status.", 500);

    await logAdminAction(service, user, "admin_set_account_status", "profile", body.user_id, patch);
    return json({ success: true, profile: updated });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Account status update failed.", (err as any)?.status || 500);
  }
});
