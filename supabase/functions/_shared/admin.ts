
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error("Missing required Supabase environment variables for admin functions.");
}

export function createServiceClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function error(message: string, status = 400) {
  return json({ error: message }, status);
}

function parseBearer(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.replace("Bearer ", "").trim();
}

export async function requireAdmin(req: Request, permission?: keyof AdminRecord) {
  const token = parseBearer(req);
  if (!token) throw new HttpError(401, "Missing bearer token.");

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData?.user) {
    throw new HttpError(401, "Invalid or expired admin session.");
  }

  const service = createServiceClient();
  const { data: admin, error: adminError } = await service
    .from("admin_users")
    .select("user_id,email,role,is_active,can_manage_users,can_manage_reports,can_manage_push,can_manage_billing,can_manage_config")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (adminError) throw new HttpError(500, adminError.message);
  if (!admin || !admin.is_active) throw new HttpError(403, "You do not have admin access.");

  if (permission && admin.role !== "super_admin" && !admin[permission]) {
    throw new HttpError(403, `You do not have permission to ${permission}.`);
  }

  return {
    token,
    user: authData.user,
    admin: admin as AdminRecord,
    service,
  };
}

export async function logAdminAction(
  service: SupabaseClient,
  actor: { id: string; email?: string | null },
  action: string,
  targetType?: string,
  targetId?: string,
  details: Record<string, unknown> = {},
) {
  await service.from("admin_audit_logs").insert({
    actor_user_id: actor.id,
    actor_email: actor.email ?? null,
    action,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    details,
  });
}

export async function getProfileByUserId(service: SupabaseClient, userId: string) {
  let { data } = await service
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (data) return data;

  const second = await service
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return second.data;
}

export async function updateProfileByUserId(service: SupabaseClient, userId: string, patch: Record<string, unknown>) {
  let result = await service
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (result.data) return result.data;

  result = await service
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  return result.data;
}

export function safeBody<T = Record<string, unknown>>(value: unknown): T {
  return (value && typeof value === "object" ? value : {}) as T;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type AdminRecord = {
  user_id: string;
  email?: string | null;
  role: "support" | "moderator" | "admin" | "super_admin";
  is_active: boolean;
  can_manage_users: boolean;
  can_manage_reports: boolean;
  can_manage_push: boolean;
  can_manage_billing: boolean;
  can_manage_config: boolean;
};

export async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
