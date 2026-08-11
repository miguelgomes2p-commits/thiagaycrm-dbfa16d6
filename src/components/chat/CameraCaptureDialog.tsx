import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, X, Image as ImageIcon, RotateCcw, Send, Loader2 } from "lucide-react";
import { countVideoInputs, hasGetUserMedia } from "@/lib/communication/capabilities";
import { cn } from "@/lib/utils";

type Facing = "environment" | "user";

function friendlyCameraError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Não foi possível acessar a câmera. Verifique a permissão do navegador.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Nenhuma câmera foi encontrada neste dispositivo.";
    case "NotReadableError":
      return "A câmera está em uso por outro aplicativo. Feche-o e tente novamente.";
    default:
      return "Não foi possível iniciar a câmera. Tente novamente ou selecione uma imagem.";
  }
}

/**
 * Modal de captura de foto.
 * A foto capturada é entregue como File JPEG e segue EXATAMENTE o mesmo fluxo de
 * upload/envio de uma imagem escolhida da galeria (onCapture -> sendAttachment).
 */
export function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
  sending = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCapture: (file: File) => void | Promise<void>;
  sending?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);

  const stopStream = useCallback(() => {
    // Encerra tracks -> desliga câmera e LED, e remove a referência ao MediaStream.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearShot = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setShot(null);
  }, []);

  const startStream = useCallback(
    async (mode: Facing) => {
      setError(null);
      setStarting(true);
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCanSwitch((await countVideoInputs()) > 1);
      } catch (e) {
        stopStream();
        setError(friendlyCameraError(e));
      } finally {
        setStarting(false);
      }
    },
    [stopStream],
  );

  // Permissão só é solicitada quando o modal abre por ação explícita do usuário.
  useEffect(() => {
    if (!open) return;
    if (!hasGetUserMedia()) {
      // Fallback direto: input file com capture.
      fallbackInputRef.current?.click();
      onOpenChange(false);
      return;
    }
    void startStream(facing);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Garantia extra: ao desmontar, nunca deixar stream vivo.
  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [stopStream]);

  function close() {
    stopStream();
    clearShot();
    onOpenChange(false);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    // Usa a resolução real do sensor entregue pelo track (sem screenshot de baixa qualidade).
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      // 0.92 preserva legibilidade de documentos, placas e avarias.
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setShot({ file, url });
    stopStream();
  }

  async function confirmSend() {
    if (!shot) return;
    await onCapture(shot.file);
    clearShot();
    onOpenChange(false);
  }

  function retake() {
    clearShot();
    void startStream(facing);
  }

  function switchCamera() {
    const next: Facing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    void startStream(next);
  }

  return (
    <>
      {/* Fallback nativo (sem getUserMedia) e seleção de galeria */}
      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onCapture(f);
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            void onCapture(f);
            close();
          }
        }}
      />

      <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
        <DialogContent
          className="p-0 gap-0 max-w-[100vw] sm:max-w-lg w-full h-[100dvh] sm:h-auto sm:rounded-lg bg-black border-0 overflow-hidden [&>button]:hidden"
        >
          <div className="relative flex h-full min-h-[60vh] sm:min-h-[70vh] flex-col">
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-3">
              <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70" onClick={close} aria-label="Fechar câmera">
                <X className="h-5 w-5" />
              </Button>
              {!shot && canSwitch && (
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70" onClick={switchCamera} aria-label="Alternar câmera">
                  <RefreshCw className="h-5 w-5" />
                </Button>
              )}
            </div>

            <div className="flex-1 grid place-items-center overflow-hidden">
              {error ? (
                <div className="p-6 text-center text-white space-y-4 max-w-sm">
                  <Camera className="h-10 w-10 mx-auto opacity-50" />
                  <p className="text-sm">{error}</p>
                  <div className="flex flex-col gap-2">
                    <Button variant="secondary" onClick={() => void startStream(facing)}>
                      <RotateCcw className="h-4 w-4 mr-2" /> Tentar novamente
                    </Button>
                    <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => galleryInputRef.current?.click()}>
                      <ImageIcon className="h-4 w-4 mr-2" /> Selecionar da galeria
                    </Button>
                  </div>
                </div>
              ) : shot ? (
                <img src={shot.url} alt="Foto capturada" className="max-h-full max-w-full object-contain" />
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={cn("h-full w-full object-cover", facing === "user" && "scale-x-[-1]")}
                />
              )}
              {starting && !error && (
                <div className="absolute inset-0 grid place-items-center bg-black/50 text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>

            {!error && (
              <div className="z-20 flex items-center justify-center gap-6 bg-black/70 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {shot ? (
                  <>
                    <Button variant="ghost" className="text-white hover:bg-white/10 min-h-11" onClick={retake} disabled={sending}>
                      <RotateCcw className="h-4 w-4 mr-2" /> Refazer
                    </Button>
                    <Button className="gradient-brand text-primary-foreground border-0 min-h-11 px-6" onClick={() => void confirmSend()} disabled={sending}>
                      {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Enviar
                    </Button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void capture()}
                    disabled={starting}
                    aria-label="Capturar foto"
                    className="h-16 w-16 rounded-full border-4 border-white/80 bg-white/20 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <span className="block h-full w-full rounded-full bg-white/90" />
                  </button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
