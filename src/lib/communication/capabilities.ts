/**
 * Serviço central de detecção de capacidades de comunicação.
 * Nenhuma UI deve hardcodar disponibilidade — tudo passa por aqui.
 */

export type CameraSource = "web" | "native" | "file-fallback" | "none";

export type CommunicationFlags = {
  camera_capture_enabled: boolean;
  phone_call_enabled: boolean;
  whatsapp_calling_enabled: boolean;
  crm_voip_enabled: boolean;
};

/** Defaults seguros. WhatsApp Calling e VoIP ficam desligados até existir backend real. */
export const DEFAULT_COMMUNICATION_FLAGS: CommunicationFlags = {
  camera_capture_enabled: true,
  phone_call_enabled: true,
  whatsapp_calling_enabled: false,
  crm_voip_enabled: false,
};

export type CommunicationCapabilities = {
  camera: { available: boolean; source: CameraSource; canSwitch: boolean; secureContext: boolean };
  calls: { phone: boolean; whatsapp: boolean; webrtc: boolean };
};

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function isSecureCameraContext(): boolean {
  if (typeof window === "undefined") return false;
  // getUserMedia exige secure context (https, localhost ou WebView nativa).
  return Boolean(window.isSecureContext);
}

export function hasGetUserMedia(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    isSecureCameraContext()
  );
}

/** Só pode ser chamado após permissão concedida em alguns browsers; usado apenas para "alternar câmera". */
export async function countVideoInputs(): Promise<number> {
  try {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return 0;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput").length;
  } catch {
    return 0;
  }
}

export function getCameraCapability(flags: CommunicationFlags = DEFAULT_COMMUNICATION_FLAGS) {
  if (!flags.camera_capture_enabled) {
    return { available: false, source: "none" as CameraSource, canSwitch: false, secureContext: isSecureCameraContext() };
  }
  if (hasGetUserMedia()) {
    return {
      available: true,
      source: (isNativeShell() ? "native" : "web") as CameraSource,
      canSwitch: true,
      secureContext: true,
    };
  }
  // Fallback: input file com capture continua funcionando em qualquer contexto.
  return { available: true, source: "file-fallback" as CameraSource, canSwitch: false, secureContext: isSecureCameraContext() };
}

export function getCommunicationCapabilities(opts?: {
  flags?: Partial<CommunicationFlags>;
  hasPhoneNumber?: boolean;
}): CommunicationCapabilities {
  const flags = { ...DEFAULT_COMMUNICATION_FLAGS, ...(opts?.flags ?? {}) };
  return {
    camera: getCameraCapability(flags),
    calls: {
      phone: flags.phone_call_enabled && Boolean(opts?.hasPhoneNumber),
      // Só habilita quando existir provider real configurado (ver call-providers.ts).
      whatsapp: false,
      webrtc: false,
    },
  };
}
