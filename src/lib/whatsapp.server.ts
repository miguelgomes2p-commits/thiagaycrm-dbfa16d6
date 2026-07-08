import { createHmac, timingSafeEqual } from "crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = body;
    try {
      const j = JSON.parse(body) as { error?: { message?: string; code?: number } };
      if (j.error?.message) msg = `${j.error.message}${j.error.code ? ` (code ${j.error.code})` : ""}`;
    } catch { /* keep raw */ }
    throw new Error(`Meta ${res.status}: ${msg}`);
  }
  return body ? (JSON.parse(body) as T) : ({} as T);
}

export function graphFetch<T>(path: string, token: string, init?: RequestInit) {
  return graphRequest<T>(path, token, init);
}

export function sendWaText(phoneNumberId: string, token: string, to: string, body: string) {
  return graphRequest<{ messages: { id: string }[] }>(
    `/${phoneNumberId}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body, preview_url: true },
      }),
    },
  );
}

export function sendWaTemplate(
  phoneNumberId: string,
  token: string,
  to: string,
  name: string,
  language: string,
  components?: unknown[],
) {
  return graphRequest<{ messages: { id: string }[] }>(
    `/${phoneNumberId}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name, language: { code: language }, components: components ?? [] },
      }),
    },
  );
}

export function listWaTemplates(wabaId: string, token: string) {
  return graphRequest<{
    data: Array<{ id: string; name: string; language: string; status: string; category: string; components: unknown[] }>;
  }>(`/${wabaId}/message_templates?limit=200`, token, { method: "GET" });
}

export function verifyMetaSignature(appSecret: string, rawBody: string, headerSig: string | null) {
  if (!headerSig) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(headerSig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
