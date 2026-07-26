import { AsyncLocalStorage } from "node:async_hooks";

type Ctx = { waitUntil?: (p: Promise<unknown>) => void };

export const requestContext = new AsyncLocalStorage<Ctx>();

/**
 * Fire-and-forget: mantém a Promise viva no runtime (Cloudflare Workers)
 * usando ctx.waitUntil quando disponível, senão apenas silencia rejeições.
 * Permite ao webhook responder 200 imediatamente e processar em background.
 */
export function runInBackground(promise: Promise<unknown>) {
  const ctx = requestContext.getStore();
  const safe = promise.catch((err) => {
    console.error("[background task] failed", err);
  });
  if (ctx?.waitUntil) {
    try { ctx.waitUntil(safe); } catch { /* noop */ }
  }
}
