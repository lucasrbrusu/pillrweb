
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service } = await requireAdmin(req);

    const [
      totalUsers,
      activeUsers,
      premiumUsers,
      expiredPremiumUsers,
      openReports,
      resolvedReports,
      pushTokens,
      pushReadyUsers,
      signupsRes,
      actionsRes,
    ] = await Promise.all([
      service.from("profiles").select("id", { count: "exact", head: true }),
      service.from("profiles").select("id", { count: "exact", head: true }).eq("account_status", "active"),
      service.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "premium"),
      service.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "premium").lt("premium_expires_at", new Date().toISOString()),
      service.from("friend_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      service.from("friend_reports").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      service.from("push_tokens").select("id", { count: "exact", head: true }),
      service.from("push_tokens").select("user_id", { count: "exact", head: true }),
      service.from("profiles").select("*").order("created_at", { ascending: false }).limit(5),
      service.from("admin_audit_logs").select("action, target_type, target_id, created_at").order("created_at", { ascending: false }).limit(5),
    ]);

    return json({
      totalUsers: totalUsers.count || 0,
      activeUsers: activeUsers.count || 0,
      premiumUsers: premiumUsers.count || 0,
      expiredPremiumUsers: expiredPremiumUsers.count || 0,
      openReports: openReports.count || 0,
      resolvedReports: resolvedReports.count || 0,
      pushTokens: pushTokens.count || 0,
      pushReadyUsers: pushReadyUsers.count || 0,
      recentSignups: signupsRes.data || [],
      recentActions: actionsRes.data || [],
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not load metrics.", (err as any)?.status || 500);
  }
});
