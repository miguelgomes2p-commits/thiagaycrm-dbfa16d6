// Evolution API v2 client (self-hosted or Z-API-compatible).
// Docs: https://doc.evolution-api.com/
//
// Base URL example: https://sua-evolution.up.railway.app
// API key: header "apikey"

type Json = Record<string, unknown>;

async function req<T>(baseUrl: string, apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const url = baseUrl.replace(/\/+$/, "") + path;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { message?: string | string[]; error?: string };
      const raw = Array.isArray(j.message) ? j.message.join("; ") : j.message ?? j.error;
      if (raw) msg = raw;
    } catch { /* keep raw */ }
    throw new Error(`Evolution ${res.status}: ${msg}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type EvolutionInstanceCreate = {
  instance: { instanceName: string; instanceId?: string; status?: string };
  qrcode?: { base64?: string; code?: string; pairingCode?: string | null };
  hash?: string | { apikey?: string };
};

export function evolutionCreateInstance(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  webhookUrl: string,
) {
  return req<EvolutionInstanceCreate>(baseUrl, apiKey, "/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    }),
  });
}

export function evolutionConnect(baseUrl: string, apiKey: string, instanceName: string) {
  return req<{ base64?: string; code?: string; pairingCode?: string | null }>(
    baseUrl,
    apiKey,
    `/instance/connect/${encodeURIComponent(instanceName)}`,
    { method: "GET" },
  );
}

export function evolutionConnectionState(baseUrl: string, apiKey: string, instanceName: string) {
  return req<{ instance?: { state?: "open" | "close" | "connecting" | string } }>(
    baseUrl,
    apiKey,
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { method: "GET" },
  );
}

export function evolutionLogout(baseUrl: string, apiKey: string, instanceName: string) {
  return req<Json>(baseUrl, apiKey, `/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
}

export function evolutionDeleteInstance(baseUrl: string, apiKey: string, instanceName: string) {
  return req<Json>(baseUrl, apiKey, `/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
}

export function evolutionSendText(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string,
) {
  return req<{ key?: { id?: string; remoteJid?: string; fromMe?: boolean } }>(
    baseUrl,
    apiKey,
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({ number, text }),
    },
  );
}

export function evolutionSetWebhook(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  webhookUrl: string,
) {
  return req<Json>(baseUrl, apiKey, `/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    }),
  });
}
