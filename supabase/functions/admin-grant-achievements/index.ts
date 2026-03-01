import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  error,
  getProfileByUserId,
  json,
  logAdminAction,
  readJson,
  requireAdmin,
  updateProfileByUserId,
} from "../_shared/admin.ts";
import { APP_ACHIEVEMENT_KEYS } from "../_shared/achievement-catalog.ts";

type AchievementRow = {
  id: string;
  key: string;
  name?: string | null;
  badge_key?: string | null;
  is_active?: boolean | null;
};

const cleanKey = (value: string) => value.trim();
const looksLikeUuid = (value: string) => /^[0-9a-fA-F-]{36}$/.test(value);

function mergeStringArrays(existing: unknown, incoming: string[]) {
  const current = Array.isArray(existing)
    ? existing.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const merged = new Set<string>(current);
  for (const value of incoming) merged.add(value);
  return [...merged];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { service, user } = await requireAdmin(req, "can_manage_users");
    const body = await readJson(req) as {
      user_id?: string;
      grant_all?: boolean;
      achievement_keys?: string[];
    };

    const requestedUserId = String(body.user_id || "").trim();
    if (!requestedUserId) return error("Missing user_id.", 400);

    const profile = await getProfileByUserId(service, requestedUserId);
    const authIdCandidates = new Set<string>([requestedUserId]);
    if (profile?.id) authIdCandidates.add(String(profile.id));
    if (profile?.user_id) authIdCandidates.add(String(profile.user_id));

    let resolvedAuthUserId: string | null = null;
    for (const candidate of authIdCandidates) {
      if (!looksLikeUuid(candidate)) continue;
      const { data: authResult, error: authError } = await service.auth.admin.getUserById(candidate);
      if (authError) {
        const message = String(authError.message || "").toLowerCase();
        if (message.includes("not found")) continue;
        throw authError;
      }
      if (authResult?.user) {
        resolvedAuthUserId = candidate;
        break;
      }
    }

    if (!resolvedAuthUserId) {
      return error("User not found in Auth. Use an auth user id or a profile linked by user_id.", 404);
    }

    const { data: catalogRows, error: catalogError } = await service
      .from("achievements")
      .select("id,key,name,badge_key,is_active")
      .in("key", [...APP_ACHIEVEMENT_KEYS])
      .eq("is_active", true);
    if (catalogError) throw catalogError;

    const catalog = ((catalogRows || []) as AchievementRow[])
      .filter((row) => row?.is_active !== false && Boolean(row?.key));
    const catalogByKey = new Map<string, AchievementRow>();
    for (const row of catalog) {
      if (!row.key) continue;
      catalogByKey.set(cleanKey(row.key), row);
    }

    const requested = new Set<string>();
    if (body.grant_all) {
      for (const row of catalog) {
        if (row.key) requested.add(cleanKey(row.key));
      }
    }

    for (const key of body.achievement_keys || []) {
      const cleaned = cleanKey(String(key || ""));
      if (cleaned) requested.add(cleaned);
    }

    if (!requested.size) {
      return error("No achievements requested. Select one or use select all.", 400);
    }

    const invalidKeys = [...requested].filter((key) => !catalogByKey.has(key));
    if (invalidKeys.length) {
      return error(`Invalid achievement keys requested: ${invalidKeys.join(", ")}`, 400);
    }

    const requestedKeyList = [...requested];
    const finalCatalog = requestedKeyList
      .map((key) => catalogByKey.get(key))
      .filter((row): row is AchievementRow => Boolean(row));
    if (!finalCatalog.length) {
      return error("No achievements could be resolved for grant.", 400);
    }

    const nowIso = new Date().toISOString();
    const grantedAchievementKeys = finalCatalog.map((row) => row.key);
    const achievementUpserts = finalCatalog.map((row) => ({
      user_id: resolvedAuthUserId,
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
      user_id: resolvedAuthUserId,
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

    const syncProfile = profile || await getProfileByUserId(service, resolvedAuthUserId);
    const profilePatch: Record<string, unknown> = {};
    if (syncProfile) {
      if ("achievement_keys" in syncProfile) {
        profilePatch.achievement_keys = mergeStringArrays((syncProfile as any).achievement_keys, grantedAchievementKeys);
      }
      if ("unlocked_achievement_keys" in syncProfile) {
        profilePatch.unlocked_achievement_keys = mergeStringArrays((syncProfile as any).unlocked_achievement_keys, grantedAchievementKeys);
      }
      if ("badge_keys" in syncProfile) {
        profilePatch.badge_keys = mergeStringArrays((syncProfile as any).badge_keys, badgeKeys);
      }
      if ("unlocked_badge_keys" in syncProfile) {
        profilePatch.unlocked_badge_keys = mergeStringArrays((syncProfile as any).unlocked_badge_keys, badgeKeys);
      }
      if ("achievements" in syncProfile && (syncProfile as any).achievements && typeof (syncProfile as any).achievements === "object") {
        const current = (syncProfile as any).achievements as Record<string, unknown>;
        profilePatch.achievements = {
          ...current,
          unlocked_keys: mergeStringArrays(current.unlocked_keys, grantedAchievementKeys),
          unlocked_badge_keys: mergeStringArrays(current.unlocked_badge_keys, badgeKeys),
          last_admin_granted_at: nowIso,
        };
      }
      if (Object.keys(profilePatch).length) {
        await updateProfileByUserId(service, requestedUserId, profilePatch);
      }
    }

    await logAdminAction(service, user, "admin_grant_achievements", "profile", requestedUserId, {
      grant_all: Boolean(body.grant_all),
      requested_keys: requestedKeyList,
      granted_achievements: achievementUpserts.length,
      unlocked_badges: badgeUpserts.length,
      resolved_auth_user_id: resolvedAuthUserId,
      profile_synced_fields: Object.keys(profilePatch),
    });

    return json({
      success: true,
      granted_achievements: achievementUpserts.length,
      unlocked_badges: badgeUpserts.length,
      granted_keys: grantedAchievementKeys,
      resolved_auth_user_id: resolvedAuthUserId,
      profile_synced_fields: Object.keys(profilePatch),
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not grant achievements.", (err as any)?.status || 500);
  }
});
