// Server-only helpers for RENAVE / SERPRO integration.
// NEVER import this from client-reachable modules directly — load with dynamic
// import inside a server function/route handler.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// -------------------- crypto (AES-256-GCM) --------------------

function getEncKey(): Buffer {
  const hex = process.env.RENAVE_ENC_KEY;
  if (!hex || hex.length < 32) {
    throw new Error("RENAVE_ENC_KEY não configurada no ambiente do servidor.");
  }
  // key generator produces alphanumeric; hash to 32 bytes to normalize length
  const buf = Buffer.from(hex, "utf8");
  if (buf.length === 32) return buf;
  // derive: sha256(hex) -> 32 bytes
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(hex).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const key = getEncKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Formato de secret cifrada inválido.");
  }
  const key = getEncKey();
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// -------------------- storage: baixar .p12 --------------------

export async function downloadCertPfx(storagePath: string): Promise<Buffer> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from("renave-certs")
    .download(storagePath);
  if (error || !data) {
    throw new Error(`Falha ao baixar certificado: ${error?.message ?? "sem dados"}`);
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

// -------------------- template rendering --------------------

export function renderPath(template: string, params: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, k) => {
    const v = params[k];
    if (v == null || v === "") throw new Error(`Parâmetro obrigatório ausente: ${k}`);
    return encodeURIComponent(String(v));
  });
}

// -------------------- HTTP com mTLS --------------------

export type RenaveHttpResult = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  bodyText: string;
  durationMs: number;
};

export async function renaveHttpRequest(opts: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  pfx: Buffer;
  passphrase: string;
  timeoutMs?: number;
}): Promise<RenaveHttpResult> {
  const started = Date.now();
  // Node's undici supports mTLS via Agent connect options.
  const { Agent, fetch: undiciFetch } = await import("undici");
  const dispatcher = new Agent({
    connect: {
      pfx: [{ buf: opts.pfx, passphrase: opts.passphrase }],
    },
    connectTimeout: 15_000,
    headersTimeout: opts.timeoutMs ?? 30_000,
    bodyTimeout: opts.timeoutMs ?? 30_000,
  });

  try {
    const res = await undiciFetch(opts.url, {
      method: opts.method,
      headers: {
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      dispatcher,
    });
    const bodyText = await res.text();
    let parsed: unknown = bodyText;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      /* mantém como texto */
    }
    const headersObj: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headersObj[k] = v;
    });
    return {
      status: res.status,
      headers: headersObj,
      body: parsed,
      bodyText,
      durationMs: Date.now() - started,
    };
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

// -------------------- OAuth token cache --------------------

type CachedToken = {
  access_token: string;
  expires_at: number; // epoch ms
  token_type?: string;
};

export async function fetchOAuthToken(cfg: {
  oauthUrl: string;
  clientId: string;
  clientSecret: string;
  pfx: Buffer;
  passphrase: string;
}): Promise<CachedToken> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const started = Date.now();
  const { Agent, fetch: undiciFetch } = await import("undici");
  const dispatcher = new Agent({
    connect: { pfx: [{ buf: cfg.pfx, passphrase: cfg.passphrase }] },
    connectTimeout: 15_000,
  });
  try {
    const res = await undiciFetch(cfg.oauthUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      dispatcher,
    });
    const txt = await res.text();
    if (!res.ok) {
      throw new Error(`OAuth ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json = JSON.parse(txt) as {
      access_token: string;
      expires_in?: number;
      token_type?: string;
    };
    const ttl = (json.expires_in ?? 3600) * 1000;
    return {
      access_token: json.access_token,
      token_type: json.token_type,
      // deduz 60s de folga
      expires_at: Date.now() + Math.max(60_000, ttl - 60_000),
    };
  } finally {
    await dispatcher.close().catch(() => {});
    void started;
  }
}
