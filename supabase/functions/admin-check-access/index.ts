
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, error, json, requireAdmin } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    return json({
      admin: {
        ...admin,
        email: admin.email || user.email || null,
      },
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Access check failed.", (err as any)?.status || 500);
  }
});
