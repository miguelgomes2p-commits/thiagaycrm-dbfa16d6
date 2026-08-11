import { createFileRoute } from "@tanstack/react-router";

/**
 * Drena o event bus do Automation Studio.
 * Chamado pelo agendador interno (pg_cron). Não recebe dados do cliente e não
 * expõe nenhuma informação: apenas processa a fila e devolve contadores.
 */
export const Route = createFileRoute("/api/public/hooks/drain-automations")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { processPendingEvents, processDueJobs } = await import("@/lib/automation-engine.server");
          const events = await processPendingEvents();
          const jobs = await processDueJobs();
          return Response.json({ ok: true, ...events, ...jobs });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" },
            { status: 500 },
          );
        }
      },
    },
  },
});
