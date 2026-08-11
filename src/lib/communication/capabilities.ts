/**
 * Serviço central de detecção de capacidades de comunicação.
 * Nenhuma UI deve hardcodar disponibilidade — tudo passa por aqui.
 */

export type CameraSource = "web" | "native" | "file-fallback" | "none";

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

export type CameraCapability = {
  available: boolean;
  source: CameraSource;
  canSwitch: boolean;
  secureContext: boolean;
};

export function getCameraCapability(): CameraCapability {
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

