
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, logAdminAction, readJson, requireAdmin } from "../_shared/admin.ts";

const isValidExpoPushToken = (token: string) =>
  token.startsWith("ExpoPushToken[") || token.startsWith("ExponentPushToken[");

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service, user } = await requireAdmin(req, "can_manage_push");
    const body = await readJson(req) as {
      title?: string;
      body?: string;
      user_ids?: string[];
      segment?: "all" | "premium" | "active";
      data?: Record<string, unknown>;
    };

    if (!body.title?.trim() || !body.body?.trim()) {
      return error("Push title and body are required.", 400);
    }

    let userIds = Array.isArray(body.user_ids) ? body.user_ids.filter(Boolean) : [];

    if (!userIds.length) {
      let profileQuery = service.from("profiles").select("id, user_id");
      if (body.segment === "premium") profileQuery = profileQuery.eq("plan", "premium");
      if (body.segment === "active") profileQuery = profileQuery.eq("account_status", "active");
      const { data: profiles, error: profileError } = await profileQuery.limit(5000);
      if (profileError) throw profileError;
      userIds = (profiles || []).map((profile: any) => profile.id || profile.user_id).filter(Boolean);
    }

    if (!userIds.length) return json({ success: true, sent: 0, tokens: 0 });

    const { data: tokenRows, error: tokenError } = await service
      .from("push_tokens")
      .select("user_id, expo_push_token")
      .in("user_id", userIds);
    if (tokenError) throw tokenError;

    const tokens = [...new Set((tokenRows || []).map((row: any) => row.expo_push_token).filter(isValidExpoPushToken))];
    if (!tokens.length) return json({ success: true, sent: 0, tokens: 0 });

    const messages = tokens.map((token) => ({
      to: token,
      title: body.title,
      body: body.body,
      data: body.data || {},
      sound: "default",
    }));

    const chunks = chunkArray(messages, 100);
    for (const chunk of chunks) {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(`Expo push rejected the payload: ${responseBody}`);
      }
    }

    await logAdminAction(service, user, "admin_send_push", "push_broadcast", null, {
      title: body.title,
      segment: body.segment || null,
      user_count: userIds.length,
      token_count: tokens.length,
    });

    return json({ success: true, sent: tokens.length, users: userIds.length });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Push send failed.", (err as any)?.status || 500);
  }
});
