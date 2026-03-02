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
import { APP_ACHIEVEMENT_BY_KEY, APP_ACHIEVEMENT_KEYS } from "../_shared/achievement-catalog.ts";

type AchievementRow = {
  id: string;
  key: string;
  name?: string | null;
  badge_key?: string | null;
  is_active?: boolean | null;
};

type AppUnlockRow = {
  badge_id: string;
  achievement_key: string;
  milestone_value: number;
  unlocked_at: string;
};

const cleanKey = (value: string) => value.trim();
const looksLikeUuid = (value: string) => /^[0-9a-fA-F-]{36}$/.test(value);

function uniqueUuidValues(values: Array<string | null | undefined>) {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!looksLikeUuid(value) || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

function mergeStringArrays(existing: unknown, incoming: string[]) {
  const current = Array.isArray(existing)
    ? existing.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const merged = new Set<string>(current);
  for (const value of incoming) merged.add(value);
  return [...merged];
}

function mergeStringObjectArray(existing: unknown, incoming: string[]) {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return null;
  const current = existing as Record<string, unknown>;
  return {
    ...current,
    unlocked_keys: mergeStringArrays(current.unlocked_keys, incoming),
  };
}

function mergeAchievementUnlockPayload(existing: unknown, incoming: AppUnlockRow[]) {
  const current = Array.isArray(existing) ? existing : [];
  const byBadgeId = new Map<string, AppUnlockRow>();

  for (const raw of current) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const badgeId = String(entry.badge_id || entry.badgeId || "").trim();
    if (!badgeId) continue;
    const achievementKey = String(entry.achievement_key || entry.achievementKey || "").trim();
    const milestoneValue = Number(entry.milestone_value ?? entry.milestoneValue);
    byBadgeId.set(badgeId, {
      badge_id: badgeId,
      achievement_key: achievementKey || (badgeId.includes(":") ? badgeId.split(":")[0] : ""),
      milestone_value: Number.isFinite(milestoneValue)
        ? milestoneValue
        : Number(badgeId.split(":")[1] || 0),
      unlocked_at: String(entry.unlocked_at || entry.unlockedAt || new Date().toISOString()),
    });
  }

  for (const entry of incoming) {
    byBadgeId.set(entry.badge_id, entry);
  }

  return [...byBadgeId.values()];
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
    if (profile?.user_id) authIdCandidates.add(String(profile.user_id));
    if (profile?.id) authIdCandidates.add(String(profile.id));

    let resolvedAuthUserId: string | null = null;
    let resolvedAuthUserRecord: any = null;
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
        resolvedAuthUserRecord = authResult.user;
        break;
      }
    }

    const unlockOwnerCandidates = uniqueUuidValues([
      profile?.user_id ? String(profile.user_id) : null,
      profile?.id ? String(profile.id) : null,
      requestedUserId,
      resolvedAuthUserId,
    ]);
    if (!unlockOwnerCandidates.length) {
      return error("Could not resolve a valid account/user id for achievement grant.", 400);
    }

    const { data: catalogRows, error: catalogError } = await service
      .from("achievements")
      .select("id,key,name,badge_key,is_active")
      .in("key", [...APP_ACHIEVEMENT_KEYS])
      .eq("is_active", true);
    if (catalogError) throw catalogError;

    const catalog = ((catalogRows || []) as AchievementRow[])
      .filter((row) => row?.is_active !== false && Boolean(row?.key))
      .map((row) => {
        const definition = APP_ACHIEVEMENT_BY_KEY.get(row.key);
        if (!definition) return null;
        return {
          ...row,
          definition,
        };
      })
      .filter(Boolean) as Array<AchievementRow & { definition: any }>;

    const catalogByKey = new Map<string, (typeof catalog)[number]>();
    for (const row of catalog) {
      catalogByKey.set(cleanKey(row.key), row);
    }

    const requested = new Set<string>();
    if (body.grant_all) {
      for (const row of catalog) requested.add(cleanKey(row.key));
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

    const finalCatalog = [...requested]
      .map((key) => catalogByKey.get(key))
      .filter(Boolean) as typeof catalog;

    const nowIso = new Date().toISOString();
    const grantedAchievementKeys = finalCatalog.map((row) => row.key);
    const legacyBadgeKeys = [...new Set(finalCatalog.map((row) => row.badge_key || row.key).filter(Boolean))];
    const appUnlockRows: AppUnlockRow[] = finalCatalog.map((row) => ({
      badge_id: row.definition.app_badge_id,
      achievement_key: row.definition.app_achievement_key,
      milestone_value: row.definition.app_milestone_value,
      unlocked_at: nowIso,
    }));
    const appBadgeIds = appUnlockRows.map((row) => row.badge_id);

    let unlockedOwnerId: string | null = null;
    let lastOwnerError: any = null;

    for (const ownerId of unlockOwnerCandidates) {
      const achievementUpserts = finalCatalog.map((row) => ({
        user_id: ownerId,
        achievement_id: row.id,
        achievement_key: row.key,
        unlocked_at: nowIso,
        source: "admin_panel",
        granted_by: user.id,
      }));

      const { error: userAchievementError } = await service
        .from("user_achievements")
        .upsert(achievementUpserts, { onConflict: "user_id,achievement_key" });
      if (userAchievementError) {
        const message = String(userAchievementError.message || "").toLowerCase();
        const ownerMismatch = userAchievementError.code === "23503" || message.includes("foreign key");
        if (ownerMismatch) {
          lastOwnerError = userAchievementError;
          continue;
        }
        throw userAchievementError;
      }

      const { error: userBadgeError } = await service
        .from("user_badges")
        .upsert(
          legacyBadgeKeys.map((badgeKey) => ({
            user_id: ownerId,
            badge_key: badgeKey,
            unlocked_at: nowIso,
            source: "achievement_granted_by_admin",
            granted_by: user.id,
          })),
          { onConflict: "user_id,badge_key" },
        );
      if (userBadgeError) {
        const message = String(userBadgeError.message || "").toLowerCase();
        const ownerMismatch = userBadgeError.code === "23503" || message.includes("foreign key");
        if (ownerMismatch) {
          lastOwnerError = userBadgeError;
          continue;
        }
        throw userBadgeError;
      }

      const { error: unlockError } = await service
        .from("user_achievement_unlocks")
        .upsert(
          appUnlockRows.map((row) => ({ ...row, user_id: ownerId })),
          { onConflict: "user_id,badge_id" },
        );
      if (unlockError) {
        const message = String(unlockError.message || "").toLowerCase();
        const ownerMismatch = unlockError.code === "23503" || message.includes("foreign key");
        if (ownerMismatch) {
          lastOwnerError = unlockError;
          continue;
        }
        throw unlockError;
      }

      unlockedOwnerId = ownerId;
      break;
    }

    if (!unlockedOwnerId) {
      throw lastOwnerError || new Error("Could not resolve grant owner for achievement grant.");
    }

    const syncProfile = profile || (resolvedAuthUserId ? await getProfileByUserId(service, resolvedAuthUserId) : null);
    const profilePatch: Record<string, unknown> = {};
    if (syncProfile) {
      if ("achievement_keys" in syncProfile) {
        profilePatch.achievement_keys = mergeStringArrays((syncProfile as any).achievement_keys, grantedAchievementKeys);
      }
      if ("unlocked_achievement_keys" in syncProfile) {
        profilePatch.unlocked_achievement_keys = mergeStringArrays((syncProfile as any).unlocked_achievement_keys, grantedAchievementKeys);
      }
      if ("badge_keys" in syncProfile) {
        profilePatch.badge_keys = mergeStringArrays((syncProfile as any).badge_keys, legacyBadgeKeys);
      }
      if ("unlocked_badge_keys" in syncProfile) {
        profilePatch.unlocked_badge_keys = mergeStringArrays((syncProfile as any).unlocked_badge_keys, appBadgeIds);
      }
      if ("achievement_unlocks" in syncProfile) {
        profilePatch.achievement_unlocks = mergeAchievementUnlockPayload((syncProfile as any).achievement_unlocks, appUnlockRows);
      }
      if ("achievements" in syncProfile) {
        const currentAchievements = (syncProfile as any).achievements;
        if (Array.isArray(currentAchievements)) {
          profilePatch.achievements = mergeStringArrays(currentAchievements, grantedAchievementKeys);
        } else {
          const current = (currentAchievements && typeof currentAchievements === "object")
            ? currentAchievements as Record<string, unknown>
            : {};
          profilePatch.achievements = {
            ...current,
            unlocked_keys: mergeStringArrays(current.unlocked_keys, grantedAchievementKeys),
            unlocked_badge_keys: mergeStringArrays(current.unlocked_badge_keys, appBadgeIds),
            last_admin_granted_at: nowIso,
          };
        }
      }
      if ("badges" in syncProfile) {
        const currentBadges = (syncProfile as any).badges;
        if (Array.isArray(currentBadges)) {
          profilePatch.badges = mergeStringArrays(currentBadges, appBadgeIds);
        } else {
          const current = (currentBadges && typeof currentBadges === "object")
            ? currentBadges as Record<string, unknown>
            : {};
          profilePatch.badges = {
            ...current,
            unlocked_keys: mergeStringArrays(current.unlocked_keys, appBadgeIds),
            last_admin_granted_at: nowIso,
          };
        }
      }
      if (Object.keys(profilePatch).length) {
        await updateProfileByUserId(service, requestedUserId, profilePatch);
      }
    }

    let authMetadataSynced = false;
    if (resolvedAuthUserId) {
      const userMetadata = (resolvedAuthUserRecord?.user_metadata && typeof resolvedAuthUserRecord.user_metadata === "object")
        ? { ...resolvedAuthUserRecord.user_metadata }
        : {};
      const metadataPatch = {
        ...userMetadata,
        achievement_keys: mergeStringArrays(userMetadata.achievement_keys, grantedAchievementKeys),
        unlocked_achievement_keys: mergeStringArrays(userMetadata.unlocked_achievement_keys, grantedAchievementKeys),
        badge_keys: mergeStringArrays(userMetadata.badge_keys, legacyBadgeKeys),
        unlocked_badge_keys: mergeStringArrays(userMetadata.unlocked_badge_keys, appBadgeIds),
        achievements: (() => {
          if (Array.isArray(userMetadata.achievements)) {
            return mergeStringArrays(userMetadata.achievements, grantedAchievementKeys);
          }
          const merged = mergeStringObjectArray(userMetadata.achievements, grantedAchievementKeys);
          return merged || {
            unlocked_keys: grantedAchievementKeys,
            unlocked_badge_keys: appBadgeIds,
            last_admin_granted_at: nowIso,
          };
        })(),
        badges: (() => {
          if (Array.isArray(userMetadata.badges)) {
            return mergeStringArrays(userMetadata.badges, appBadgeIds);
          }
          const merged = mergeStringObjectArray(userMetadata.badges, appBadgeIds);
          return merged || {
            unlocked_keys: appBadgeIds,
            last_admin_granted_at: nowIso,
          };
        })(),
        last_admin_granted_at: nowIso,
      };

      const { error: authMetadataError } = await service.auth.admin.updateUserById(resolvedAuthUserId, {
        user_metadata: metadataPatch,
      });
      if (authMetadataError) throw authMetadataError;
      authMetadataSynced = true;
    }

    await logAdminAction(service, user, "admin_grant_achievements", "profile", requestedUserId, {
      grant_all: Boolean(body.grant_all),
      requested_keys: [...requested],
      granted_achievements: finalCatalog.length,
      unlocked_badges: appBadgeIds.length,
      unlock_owner_id: unlockedOwnerId,
      resolved_auth_user_id: resolvedAuthUserId,
      profile_synced_fields: Object.keys(profilePatch),
      auth_metadata_synced: authMetadataSynced,
    });

    return json({
      success: true,
      granted_achievements: finalCatalog.length,
      unlocked_badges: appBadgeIds.length,
      granted_keys: grantedAchievementKeys,
      granted_badge_ids: appBadgeIds,
      unlock_owner_id: unlockedOwnerId,
      resolved_auth_user_id: resolvedAuthUserId,
      profile_synced_fields: Object.keys(profilePatch),
      auth_metadata_synced: authMetadataSynced,
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Could not grant achievements.", (err as any)?.status || 500);
  }
});
