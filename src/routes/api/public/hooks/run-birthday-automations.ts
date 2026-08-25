import { createFileRoute } from "@tanstack/react-router";

/**
 * Job diário de aniversários (pg_cron, 09:00 America/Sao_Paulo).
 *
 * Encontra os contatos que fazem aniversário "hoje" (fuso do Brasil), garante
 * idempotência anual via contact_birthday_sends e apenas publica um evento
 * `contact.birthday` em crm_events — o automation-engine já cuida de avaliar
 * condições e executar as automações publicadas.
 */
export const Route = createFileRoute("/api/public/hooks/run-birthday-automations")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

const BATCH = 50;

/** Data "hoje" no fuso America/Sao_Paulo. */
function todayInBrazil(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

async function handler() {
  const started = Date.now();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { year, month, day } = todayInBrazil();

  // Datas que devem disparar hoje. Em anos não bissextos, 29/02 cai em 01/03.
  const targets: Array<{ month: number; day: number }> = [{ month, day }];
  if (month === 3 && day === 1 && !isLeapYear(year)) targets.push({ month: 2, day: 29 });

  const { data: contacts, error } = await supabaseAdmin
    .from("contacts")
    .select("id, workspace_id, birthdate")
    .not("birthdate", "is", null)
    .limit(5000);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const birthdayToday = (contacts ?? []).filter((c) => {
    if (!c.birthdate) return false;
    const [, m, d] = String(c.birthdate).split("-").map(Number);
    return targets.some((t) => t.month === m && t.day === d);
  });

  if (birthdayToday.length === 0) {
    return Response.json({ ok: true, matched: 0, dispatched: 0, ms: Date.now() - started });
  }

  // Já enviados neste ano
  const { data: sent } = await supabaseAdmin
    .from("contact_birthday_sends")
    .select("contact_id")
    .eq("year", year)
    .in("contact_id", birthdayToday.map((c) => c.id));
  const alreadySent = new Set((sent ?? []).map((s) => s.contact_id));

  const pending = birthdayToday.filter((c) => !alreadySent.has(c.id)).slice(0, BATCH);

  let dispatched = 0;
  let failed = 0;

  for (const c of pending) {
    const { error: evError } = await supabaseAdmin.from("crm_events").insert({
      workspace_id: c.workspace_id,
      event_type: "contact.birthday",
      entity_type: "contact",
      entity_id: c.id,
      payload: { birthdate: c.birthdate, year } as never,
      status: "pending",
    });
    if (evError) {
      failed++;
      continue;
    }
    // Só marca depois do evento criado, permitindo retry seguro.
    await supabaseAdmin
      .from("contact_birthday_sends")
      .insert({ workspace_id: c.workspace_id, contact_id: c.id, year });
    dispatched++;
  }

  return Response.json({
    ok: true,
    matched: birthdayToday.length,
    dispatched,
    failed,
    remaining: Math.max(0, birthdayToday.length - alreadySent.size - dispatched),
    ms: Date.now() - started,
  });
}
