// Evolution API v2 client (self-hosted or Z-API-compatible).
// Docs: https://doc.evolution-api.com/
//
// Base URL example: https://sua-evolution.up.railway.app
// API key: header "apikey"

type Json = Record<string, unknown>;

async function req<T>(baseUrl: string, apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const url = baseUrl.replace(/\/+$/, "") + path;
  const maxAttempts = 3;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
    } catch (e) {
      lastErr = new Error(
        `Não foi possível contatar a Evolution API (${e instanceof Error ? e.message : String(e)}). Verifique se o servidor está online.`,
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw lastErr;
    }
    const text = await res.text();
    if (res.ok) return text ? (JSON.parse(text) as T) : ({} as T);

    // Servidor acordando (Render/Railway cold start) — tenta de novo.
    if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
      continue;
    }

    let msg = text;
    // Se veio HTML (página de erro de proxy), não jogue o HTML todo para o usuário.
    if (text.trim().startsWith("<")) {
      msg =
        res.status === 502 || res.status === 503 || res.status === 504
          ? "servidor Evolution indisponível no momento (provavelmente iniciando). Aguarde alguns segundos e tente novamente."
          : `resposta inesperada do servidor (HTTP ${res.status}).`;
    } else {
      try {
        const j = JSON.parse(text) as { message?: string | string[]; error?: string };
        const raw = Array.isArray(j.message) ? j.message.join("; ") : j.message ?? j.error;
        if (raw) msg = raw;
      } catch { /* keep raw */ }
    }
    throw new Error(`Evolution ${res.status}: ${msg}`);
  }
  throw lastErr ?? new Error("Evolution: falha desconhecida");
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

export function evolutionSendMedia(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  mediaType: "image" | "audio" | "video" | "document",
  base64: string,
  mimeType: string,
  fileName: string,
  caption?: string,
) {
  return req<{ key?: { id?: string; remoteJid?: string; fromMe?: boolean } }>(
    baseUrl,
    apiKey,
    `/message/sendMedia/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number,
        mediatype: mediaType,
        mimetype: mimeType,
        media: base64,
        fileName,
        caption: caption || undefined,
      }),
    },
  );
}

export function evolutionSendWhatsAppAudio(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  audioBase64OrUrl: string,
) {
  return req<{ key?: { id?: string; remoteJid?: string; fromMe?: boolean } }>(
    baseUrl,
    apiKey,
    `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({ number, audio: audioBase64OrUrl, encoding: true }),
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

// Retrieves the media (image/audio/video/document/sticker) attached to a message
// as a base64 blob. Evolution v2 endpoint: POST /chat/getBase64FromMediaMessage/{instance}
// Body: { message: { key }, convertToMp4?: boolean }
export function evolutionGetBase64FromMedia(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
) {
  const mediaMessage = message?.key ? { key: message.key } : message;
  return req<{ base64?: string; buffer?: string | null; mimetype?: string; mediaType?: string; fileName?: string; size?: { fileLength?: string } }>(
    baseUrl,
    apiKey,
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({ message: mediaMessage, convertToMp4: false }),
    },
  );
}

// Fetches WhatsApp profile picture URL for a given jid/number.
// POST /chat/fetchProfilePictureUrl/{instance} { number }
export function evolutionFetchProfilePic(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
) {
  return req<{ profilePictureUrl?: string }>(
    baseUrl,
    apiKey,
    `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
    { method: "POST", body: JSON.stringify({ number }) },
  );
}

