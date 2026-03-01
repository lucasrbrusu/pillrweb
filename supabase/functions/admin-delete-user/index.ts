import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, getProfileByUserId, json, logAdminAction, readJson, requireAdmin } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service, user } = await requireAdmin(req, "can_manage_users");
    const body = await readJson(req) as { user_id?: string };
    if (!body.user_id) return error("Missing user_id.", 400);
    if (body.user_id === user.id) return error("You cannot delete your own account.", 400);

    // Best-effort cleanup for app tables that may not have cascading FKs.
    const { error: pushTokenError } = await service
      .from("push_tokens")
      .delete()
      .eq("user_id", body.user_id);
    if (pushTokenError) throw pushTokenError;

    const { error: reportDeleteError } = await service
      .from("friend_reports")
      .delete()
      .or(`reporter_id.eq.${body.user_id},reported_user_id.eq.${body.user_id}`);
    if (reportDeleteError) throw reportDeleteError;

    const profile = await getProfileByUserId(service, body.user_id);
    if (profile?.id) {
      const { error: profileDeleteByIdError } = await service
        .from("profiles")
        .delete()
        .eq("id", profile.id);
      if (profileDeleteByIdError) throw profileDeleteByIdError;
    } else if (profile?.user_id) {
      const { error: profileDeleteByUserIdError } = await service
        .from("profiles")
        .delete()
        .eq("user_id", profile.user_id);
      if (profileDeleteByUserIdError) throw profileDeleteByUserIdError;
    }

    const { error: adminUserDeleteError } = await service
      .from("admin_users")
      .delete()
      .eq("user_id", body.user_id);
    if (adminUserDeleteError) throw adminUserDeleteError;

    const { error: authDeleteError } = await service.auth.admin.deleteUser(body.user_id);
    if (authDeleteError) throw authDeleteError;

    await logAdminAction(service, user, "admin_delete_user", "profile", body.user_id, {
      deleted_user_id: body.user_id,
    });

    return json({ success: true });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not delete user.", (err as any)?.status || 500);
  }
});
