import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, logAdminAction, readJson, requireAdmin } from "../_shared/admin.ts";

type AchievementRow = {
  id: string;
  key: string;
  name?: string | null;
  badge_key?: string | null;
  is_active?: boolean | null;
};

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "_");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service, user } = await requireAdmin(req, "can_manage_users");
    const body = await readJson(req) as {
      user_id?: string;
      grant_all?: boolean;
      achievement_keys?: string[];
      custom_achievement_keys?: string[];
    };

    const userId = String(body.user_id || "").trim();
    if (!userId) return error("Missing user_id.", 400);

    const { data: userExists, error: userLookupError } = await service.auth.admin.getUserById(userId);
    if (userLookupError) throw userLookupError;
    if (!userExists?.user) return error("User not found.", 404);

    const { data: catalogRows, error: catalogError } = await service
      .from("achievements")
      .select("id,key,name,badge_key,is_active");
    if (catalogError) throw catalogError;

    const catalog = (catalogRows || []) as AchievementRow[];
    const catalogByKey = new Map<string, AchievementRow>();
    for (const row of catalog) {
      if (!row.key) continue;
      catalogByKey.set(normalizeKey(row.key), row);
    }

    const requested = new Set<string>();
    if (body.grant_all) {
      for (const row of catalog) {
        if (row.is_active === false) continue;
        if (row.key) requested.add(normalizeKey(row.key));
      }
    }

    for (const key of body.achievement_keys || []) {
      const normalized = normalizeKey(String(key || ""));
      if (normalized) requested.add(normalized);
    }

    const customKeys: string[] = [];
    for (const key of body.custom_achievement_keys || []) {
      const normalized = normalizeKey(String(key || ""));
      if (!normalized) continue;
      requested.add(normalized);
      customKeys.push(normalized);
    }

    if (!requested.size) {
      return error("No achievements requested. Select one, select all, or provide custom keys.", 400);
    }

    const missingKeys = [...requested].filter((key) => !catalogByKey.has(key));
    if (missingKeys.length) {
      const rows = missingKeys.map((key) => ({
        key,
        name: key.replaceAll("_", " "),
        badge_key: key,
        is_active: true,
      }));
      const { error: createCustomError } = await service
        .from("achievements")
        .upsert(rows, { onConflict: "key" });
      if (createCustomError) throw createCustomError;
    }

    const requestedKeyList = [...requested];
    const { data: finalCatalogRows, error: finalCatalogError } = await service
      .from("achievements")
      .select("id,key,name,badge_key,is_active")
      .in("key", requestedKeyList);
    if (finalCatalogError) throw finalCatalogError;

    const finalCatalog = (finalCatalogRows || []) as AchievementRow[];
    if (!finalCatalog.length) {
      return error("No achievements could be resolved for grant.", 400);
    }

    const nowIso = new Date().toISOString();
    const achievementUpserts = finalCatalog.map((row) => ({
      user_id: userId,
      achievement_id: row.id,
      achievement_key: row.key,
      unlocked_at: nowIso,
      source: "admin_panel",
      granted_by: user.id,
    }));

    const { error: userAchievementError } = await service
      .from("user_achievements")
      .upsert(achievementUpserts, { onConflict: "user_id,achievement_key" });
    if (userAchievementError) throw userAchievementError;

    const badgeKeys = [...new Set(finalCatalog.map((row) => row.badge_key || row.key).filter(Boolean))];
    const badgeUpserts = badgeKeys.map((badgeKey) => ({
      user_id: userId,
      badge_key: badgeKey,
      unlocked_at: nowIso,
      source: "achievement_granted_by_admin",
      granted_by: user.id,
    }));

    if (badgeUpserts.length) {
      const { error: userBadgeError } = await service
        .from("user_badges")
        .upsert(badgeUpserts, { onConflict: "user_id,badge_key" });
      if (userBadgeError) throw userBadgeError;
    }

    await logAdminAction(service, user, "admin_grant_achievements", "profile", userId, {
      grant_all: Boolean(body.grant_all),
      requested_keys: requestedKeyList,
      custom_keys: customKeys,
      granted_achievements: achievementUpserts.length,
      unlocked_badges: badgeUpserts.length,
    });

    return json({
      success: true,
      granted_achievements: achievementUpserts.length,
      unlocked_badges: badgeUpserts.length,
      granted_keys: finalCatalog.map((row) => row.key),
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not grant achievements.", (err as any)?.status || 500);
  }
});
