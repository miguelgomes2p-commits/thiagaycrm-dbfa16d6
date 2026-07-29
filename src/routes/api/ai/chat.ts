import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { Database } from "@/integrations/supabase/types";

const SYSTEM = `Você é o assistente IA do Lupus CRM, um CRM conversacional em português brasileiro.
Ajude o usuário com: resumir conversas, escrever mensagens para clientes, sugerir próximas ações,
qualificar leads, gerar propostas curtas, corrigir português e traduzir textos.
Seja direto, profissional e use markdown quando útil. Sempre em português (a menos que o usuário peça outro idioma).`;

function unauthorized(msg = "Unauthorized") {
  return new Response(msg, { status: 401 });
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  const isNew = supabaseKey.startsWith("sb_publishable_") || supabaseKey.startsWith("sb_secret_");
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNew && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return unauthorized();
        const token = auth.slice(7).trim();
        if (!token || token.split(".").length !== 3) return unauthorized("Invalid token");

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: {
            fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        if (claimsError || !claimsData?.claims?.sub) return unauthorized("Invalid token");
        const userId = claimsData.claims.sub as string;

        // Confirm the user belongs to at least one workspace
        const { data: membership, error: memberError } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (memberError) return new Response("Forbidden", { status: 403 });
        if (!membership) return new Response("Forbidden: no active workspace", { status: 403 });

        const body = (await request.json()) as { messages?: unknown };
        if (!Array.isArray(body.messages)) {
          return new Response("Missing messages", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-2.5-flash");

        const result = streamText({
          model,
          system: SYSTEM,
          messages: await convertToModelMessages(body.messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
