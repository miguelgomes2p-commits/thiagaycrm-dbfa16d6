export async function logEvolutionError(params: {
  workspaceId?: string | null;
  whatsappNumberId?: string | null;
  operation: string;
  baseUrl?: string | null;
  instanceName?: string | null;
  error: unknown;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const e = params.error as {
      status?: number;
      bodyText?: string;
      url?: string;
      method?: string;
      requestBody?: unknown;
      message?: string;
      friendlyMessage?: string;
    };
    const isEvoErr = typeof e?.status === "number" && typeof e?.url === "string";
    await supabaseAdmin.from("evolution_error_logs").insert({
      workspace_id: params.workspaceId ?? null,
      whatsapp_number_id: params.whatsappNumberId ?? null,
      operation: params.operation,
      method: isEvoErr ? e.method ?? null : null,
      url: isEvoErr ? e.url ?? null : null,
      status: isEvoErr ? e.status ?? null : null,
      request_body: isEvoErr && e.requestBody !== undefined
        ? (e.requestBody as never)
        : null,
      response_body: isEvoErr ? e.bodyText ?? null : null,
      error_message: e?.friendlyMessage ?? e?.message ?? String(params.error),
      base_url: params.baseUrl ?? null,
      instance_name: params.instanceName ?? null,
    });
  } catch (err) {
    console.error("[evolution] failed to log error:", err);
  }
}