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

async function graphUploadMedia(phoneNumberId: string, token: string, file: Blob, fileName: string) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", file, fileName);
  const res = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Meta ${res.status}: ${body}`);
  return JSON.parse(body) as { id: string };
}

export async function sendWaMedia(
  phoneNumberId: string,
  token: string,
  to: string,
  file: Uint8Array,
  mimeType: string,
  fileName: string,
  caption?: string,
) {
  const media = await graphUploadMedia(phoneNumberId, token, new Blob([file], { type: mimeType }), fileName);
  const type = mimeType.startsWith("image/") ? "image"
    : mimeType.startsWith("audio/") ? "audio"
    : mimeType.startsWith("video/") ? "video"
    : "document";
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type,
    [type]: {
      id: media.id,
      ...(caption && type !== "audio" ? { caption } : {}),
      ...(type === "document" ? { filename: fileName } : {}),
    },
  };
  return graphRequest<{ messages: { id: string }[] }>(`/${phoneNumberId}/messages`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
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

export function subscribeWabaToMessages(wabaId: string, token: string) {
  return graphRequest<{ success?: boolean }>(
    `/${wabaId}/subscribed_apps?subscribed_fields=${encodeURIComponent("messages")}`,
    token,
    { method: "POST" },
  );
}

export function listWabaSubscriptions(wabaId: string, token: string) {
  return graphRequest<{
    data?: Array<{ id?: string; name?: string; subscribed_fields?: string[] }>;
  }>(`/${wabaId}/subscribed_apps?fields=id,name,subscribed_fields&limit=25`, token, { method: "GET" });
}

export function verifyMetaSignature(appSecret: string, rawBody: string, headerSig: string | null) {
  if (!headerSig) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(headerSig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
