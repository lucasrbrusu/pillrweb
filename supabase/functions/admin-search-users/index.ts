
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin, readJson } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service } = await requireAdmin(req, "can_manage_users");
    const body = await readJson(req) as { query?: string; account_status?: string; limit?: number };
    const query = (body.query || "").trim();
    const limit = Math.min(Math.max(body.limit || 25, 1), 50);

    let builder = service
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (body.account_status) {
      builder = builder.eq("account_status", body.account_status);
    }

    if (query) {
      const filters = [
        `email.ilike.%${query}%`,
        `username.ilike.%${query}%`,
        `full_name.ilike.%${query}%`,
      ];
      if (/^[0-9a-fA-F-]{36}$/.test(query)) {
        filters.push(`id.eq.${query}`);
      }
      builder = builder.or(filters.join(","));
    }

    const { data, error: queryError } = await builder;
    if (queryError) throw queryError;

    const userIds = (data || []).map((row: any) => row.id || row.user_id).filter(Boolean);
    let tokenCounts = new Map<string, number>();
    if (userIds.length) {
      const { data: tokens } = await service
        .from("push_tokens")
        .select("user_id")
        .in("user_id", userIds);
      for (const row of tokens || []) {
        tokenCounts.set(row.user_id, (tokenCounts.get(row.user_id) || 0) + 1);
      }
    }

    const users = (data || []).map((row: any) => {
      const resolvedUserId = row.id || row.user_id;
      return {
        ...row,
        user_id: resolvedUserId,
        push_token_count: tokenCounts.get(resolvedUserId) || 0,
      };
    });

    return json({ users });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not search users.", (err as any)?.status || 500);
  }
});
