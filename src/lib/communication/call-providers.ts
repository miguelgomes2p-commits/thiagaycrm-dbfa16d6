/**
 * Arquitetura de chamadas do Lupus CRM.
 *
 * Regra de ouro: um provider só é registrado como "supported" quando existe
 * infraestrutura REAL por trás. Nada de chamada simulada.
 *
 * Estado atual:
 *  - NativePhoneCallProvider  -> real (discador do sistema via tel:)
 *  - WhatsAppBusinessCallingProvider -> não suportado (exige WhatsApp Cloud API
 *    com Calling API habilitada + webhooks server-side). Ver `reason`.
 *  - WebRTCCallProvider -> não suportado (exige signaling + STUN/TURN próprios).
 */

export type CallType = "phone" | "whatsapp" | "webrtc";

export type CallState =
  | "idle"
  | "requesting_permission"
  | "initiating"
  | "ringing"
  | "connecting"
  | "connected"
  | "declined"
  | "ended"
  | "failed";

export type CallCapability = {
  supported: boolean;
  type: CallType;
  label: string;
  reason?: string;
};

export type CallTarget = {
  conversationId: string;
  workspaceId: string;
  contactName: string | null;
  /** E.164 sem formatação, ex.: +5511999999999 */
  phone: string | null;
  /** provider de WhatsApp vinculado à conversa (evolution | cloud_api | zapi | null) */
  waProvider: string | null;
  isGroup: boolean;
};

export type CallSession = {
  id: string;
  type: CallType;
  state: CallState;
  startedAt: number;
};

export interface CallProvider {
  readonly type: CallType;
  canCall(target: CallTarget): Promise<CallCapability>;
  initiateCall(target: CallTarget): Promise<CallSession>;
  endCall(callId: string): Promise<void>;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  const onlyDigits = digits.replace(/\D/g, "");
  if (onlyDigits.length < 8) return null;
  return digits.startsWith("+") ? digits : `+${onlyDigits}`;
}

export function isTelSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  // Heurística: mobile e apps nativos sempre têm discador.
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

/** 1. PHONE CALL — abre o discador nativo. Real e sem backend. */
export class NativePhoneCallProvider implements CallProvider {
  readonly type = "phone" as const;

  async canCall(target: CallTarget): Promise<CallCapability> {
    const phone = normalizePhone(target.phone);
    if (target.isGroup) {
      return { supported: false, type: "phone", label: "Ligar pelo telefone", reason: "Conversas em grupo não possuem número para ligação." };
    }
    if (!phone) {
      return { supported: false, type: "phone", label: "Ligar pelo telefone", reason: "Este contato não possui telefone cadastrado." };
    }
    return { supported: true, type: "phone", label: "Ligar pelo telefone" };
  }

  async initiateCall(target: CallTarget): Promise<CallSession> {
    const phone = normalizePhone(target.phone);
    if (!phone) throw new Error("Contato sem telefone válido.");
    if (typeof window !== "undefined") window.location.href = `tel:${phone}`;
    return { id: `tel-${Date.now()}`, type: "phone", state: "initiating", startedAt: Date.now() };
  }

  async endCall(): Promise<void> {
    // A chamada é conduzida pelo discador do sistema; não há ciclo de vida no CRM.
  }
}

/** 3. WHATSAPP BUSINESS CALLING — adapter preparado, ainda não habilitado. */
export class WhatsAppBusinessCallingProvider implements CallProvider {
  readonly type = "whatsapp" as const;

  async canCall(target: CallTarget): Promise<CallCapability> {
    const base = { supported: false, type: "whatsapp" as const, label: "Chamada pelo WhatsApp" };
    if (target.waProvider === "evolution" || target.waProvider === "zapi") {
      return {
        ...base,
        reason: "O provedor conectado (Evolution/Baileys) não expõe API oficial de chamadas WhatsApp.",
      };
    }
    if (target.waProvider === "cloud_api") {
      return {
        ...base,
        reason: "WhatsApp Business Calling API ainda não habilitada para este número (requer permissão na Meta e webhooks de chamada).",
      };
    }
    return { ...base, reason: "Nenhum provedor WhatsApp compatível com chamadas neste workspace." };
  }

  async initiateCall(): Promise<CallSession> {
    throw new Error("WhatsApp Calling não está habilitado neste workspace.");
  }

  async endCall(): Promise<void> {}
}

/** 2. CRM VOIP (WebRTC) — desativado até existir signaling + TURN. */
export class WebRTCCallProvider implements CallProvider {
  readonly type = "webrtc" as const;

  async canCall(): Promise<CallCapability> {
    return {
      supported: false,
      type: "webrtc",
      label: "Chamada pelo CRM",
      reason: "VoIP do CRM requer servidor de signaling e TURN — ainda não provisionados.",
    };
  }

  async initiateCall(): Promise<CallSession> {
    throw new Error("VoIP do CRM não está disponível.");
  }

  async endCall(): Promise<void> {}
}

const providers: CallProvider[] = [
  new NativePhoneCallProvider(),
  new WhatsAppBusinessCallingProvider(),
  new WebRTCCallProvider(),
];

export function getCallProviders(): CallProvider[] {
  return providers;
}

export function getCallProvider(type: CallType): CallProvider | undefined {
  return providers.find((p) => p.type === type);
}

export async function resolveCallCapabilities(target: CallTarget): Promise<CallCapability[]> {
  return Promise.all(providers.map((p) => p.canCall(target)));
}
