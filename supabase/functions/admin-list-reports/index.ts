
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin, readJson } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service } = await requireAdmin(req, "can_manage_reports");
    const body = await readJson(req) as { limit?: number };
    const limit = Math.min(Math.max(body.limit || 50, 1), 100);

    const { data, error: queryError } = await service
      .from("friend_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (queryError) throw queryError;

    const ids = new Set<string>();
    for (const report of data || []) {
      if (report.reporter_id) ids.add(report.reporter_id);
      if (report.reported_user_id) ids.add(report.reported_user_id);
    }

    const profileMap = new Map<string, any>();
    if (ids.size) {
      const idList = [...ids];
      const { data: profilesById } = await service
        .from("profiles")
        .select("*")
        .or(`id.in.(${idList.join(",")}),user_id.in.(${idList.join(",")})`);
      for (const profile of profilesById || []) {
        if (profile.id) profileMap.set(profile.id, profile);
        if (profile.user_id) profileMap.set(profile.user_id, profile);
      }
    }

    const reports = (data || []).map((report: any) => ({
      ...report,
      reporter_display: profileMap.get(report.reporter_id)?.email || profileMap.get(report.reporter_id)?.username || report.reporter_id,
      reported_display: profileMap.get(report.reported_user_id)?.email || profileMap.get(report.reported_user_id)?.username || report.reported_user_id,
    }));

    return json({ reports });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not load reports.", (err as any)?.status || 500);
  }
});
