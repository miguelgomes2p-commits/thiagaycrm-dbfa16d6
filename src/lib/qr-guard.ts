// Client-side QR generation guard to protect against WhatsApp/Meta anti-abuse blocks.
// Non-invasive: only throws BEFORE the request is sent — never changes server behavior.

const COOLDOWN_MS = 2 * 60 * 1000; // 2 min between QR generations for the same key
const WINDOW_MS = 10 * 60 * 1000; // 10 min rolling window
const MAX_ATTEMPTS = 3; // max attempts inside the window before lockout
const LOCKOUT_MS = 10 * 60 * 1000; // lockout duration after exceeding MAX_ATTEMPTS

type GuardState = { attempts: number[]; lockedUntil?: number };

const storageKey = (key: string) => `lupus:qr-guard:${key}`;

function read(key: string): GuardState {
  if (typeof window === "undefined") return { attempts: [] };
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return { attempts: [] };
    const parsed = JSON.parse(raw) as GuardState;
    return { attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [], lockedUntil: parsed.lockedUntil };
  } catch {
    return { attempts: [] };
  }
}

function write(key: string, state: GuardState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(state));
  } catch {
    // storage unavailable — ignore
  }
}

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return `${m} min`;
}

/** Throws if the QR-generating action must be blocked; records the attempt otherwise. */
export function assertQrAllowed(key: string): void {
  const now = Date.now();
  const state = read(key);

  if (state.lockedUntil && state.lockedUntil > now) {
    throw new Error(
      `Muitas tentativas de gerar QR Code. Aguarde ${fmt(state.lockedUntil - now)} antes de tentar novamente. Isso evita bloqueio pela Meta/WhatsApp.`,
    );
  }

  // prune attempts outside window
  const attempts = state.attempts.filter((t) => now - t < WINDOW_MS);
  const last = attempts[attempts.length - 1];

  if (last && now - last < COOLDOWN_MS) {
    throw new Error(
      `Aguarde ${fmt(COOLDOWN_MS - (now - last))} antes de gerar um novo QR Code. Gerar QR em intervalos curtos pode bloquear o número no WhatsApp.`,
    );
  }

  if (attempts.length >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_MS;
    write(key, { attempts, lockedUntil });
    throw new Error(
      `Limite de ${MAX_ATTEMPTS} tentativas em 10 minutos atingido. Aguarde ${fmt(LOCKOUT_MS)} para evitar bloqueio pela Meta.`,
    );
  }

  attempts.push(now);
  write(key, { attempts });
}

/** Read-only status for UI hints. */
export function qrGuardStatus(key: string): { blocked: boolean; waitMs: number; reason?: string } {
  const now = Date.now();
  const state = read(key);
  if (state.lockedUntil && state.lockedUntil > now) {
    return { blocked: true, waitMs: state.lockedUntil - now, reason: "lockout" };
  }
  const attempts = state.attempts.filter((t) => now - t < WINDOW_MS);
  const last = attempts[attempts.length - 1];
  if (last && now - last < COOLDOWN_MS) {
    return { blocked: true, waitMs: COOLDOWN_MS - (now - last), reason: "cooldown" };
  }
  return { blocked: false, waitMs: 0 };
}
