import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/),
});

export const createWorkspaceWithDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Impersonate caller by setting request.jwt.claims so auth.uid() in the SQL function resolves.
    const { data: result, error } = await supabaseAdmin.rpc(
      "create_workspace_with_defaults" as never,
      { _name: data.name, _slug: data.slug, _user_id: context.userId } as never,
    );
    if (error) throw new Error(error.message);
    return { workspaceId: result as unknown as string };
  });

const SeedInput = z.object({ workspaceId: z.string().uuid() });

export const seedRenaveEndpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SeedInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Authorize: caller must be owner/admin of the workspace.
    const { data: role, error: roleErr } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role || (role.role !== "owner" && role.role !== "admin")) {
      throw new Error("forbidden");
    }
    const { data: inserted, error } = await supabaseAdmin.rpc(
      "renave_seed_endpoints" as never,
      { _workspace_id: data.workspaceId } as never,
    );
    if (error) throw new Error(error.message);
    return { inserted: Number(inserted ?? 0) };
  });
