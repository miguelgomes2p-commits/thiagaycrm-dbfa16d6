import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GripVertical, ImagePlus, Loader2, Star, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVehicleMedia } from "@/hooks/useVehicles";
import { VEHICLE_MEDIA_BUCKET, uploadVehiclePhoto } from "@/lib/vehicles";

export type PendingPhoto = { id: string; file: File; url: string };

export function makePendingPhotos(files: FileList | File[]): PendingPhoto[] {
  return Array.from(files)
    .filter((f) => f.type.startsWith("image") || f.type.startsWith("video"))
    .slice(0, 20)
    .map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
}

/**
 * Envia as fotos guardadas em memória (etapa de criação) assim que o veículo existe.
 * A primeira foto vira a capa quando o veículo ainda não tem nenhuma.
 */
export async function flushPendingPhotos(params: {
  pending: PendingPhoto[];
  vehicleId: string;
  workspaceId: string;
  startIndex?: number;
  onProgress?: (done: number, total: number) => void;
}) {
  const { pending, vehicleId, workspaceId, startIndex = 0, onProgress } = params;
  let done = 0;
  let failed = 0;
  for (const [i, p] of pending.entries()) {
    const { error } = await uploadVehiclePhoto({
      file: p.file,
      vehicleId,
      workspaceId,
      sortOrder: startIndex + i,
      isCover: startIndex === 0 && i === 0,
    });
    if (error) failed++;
    done++;
    onProgress?.(done, pending.length);
  }
  return { failed };
}

/* ------------------------------------------------------------------ */

type Item = {
  key: string;
  url: string | null;
  isCover: boolean;
  pending: boolean;
  mediaId?: string;
  storagePath?: string;
};

/**
 * Galeria do formulário: dropzone, capa em destaque, reordenação por
 * arrastar e suporte a fotos ainda não salvas (veículo em criação).
 */
export function VehicleGalleryManager({
  vehicleId,
  workspaceId,
  pending,
  onPendingChange,
}: {
  vehicleId: string | null;
  workspaceId: string;
  pending: PendingPhoto[];
  onPendingChange: (p: PendingPhoto[]) => void;
}) {
  const qc = useQueryClient();
  const mediaQ = useVehicleMedia(vehicleId ?? undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragKey, setDragKey] = useState<string | null>(null);

  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = mediaQ.data ?? [];
  const items: Item[] = vehicleId
    ? saved.map((m) => ({ key: m.id, url: m.url, isCover: m.is_cover, pending: false, mediaId: m.id, storagePath: m.storage_path }))
    : pending.map((p, i) => ({ key: p.id, url: p.url, isCover: i === 0, pending: true }));

  const accept = useCallback(async (files: FileList | File[] | null) => {
    if (!files || (files as FileList).length === 0) return;
    const list = makePendingPhotos(files);
    if (list.length === 0) return;
    if (!vehicleId) { onPendingChange([...pending, ...list]); return; }
    setUploading(true);
    setProgress({ done: 0, total: list.length });
    const { failed } = await flushPendingPhotos({
      pending: list,
      vehicleId,
      workspaceId,
      startIndex: saved.length,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setUploading(false);
    setProgress({ done: 0, total: 0 });
    list.forEach((p) => URL.revokeObjectURL(p.url));
    if (failed) toast.error(`${failed} foto(s) não puderam ser enviadas`);
    qc.invalidateQueries({ queryKey: ["vehicle-media", vehicleId] });
    qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
  }, [vehicleId, workspaceId, pending, onPendingChange, saved.length, qc]);

  async function remove(item: Item) {
    if (item.pending) {
      onPendingChange(pending.filter((p) => p.id !== item.key));
      return;
    }
    await supabase.from("vehicle_media").delete().eq("id", item.mediaId!);
    if (item.storagePath) await supabase.storage.from(VEHICLE_MEDIA_BUCKET).remove([item.storagePath]);
    qc.invalidateQueries({ queryKey: ["vehicle-media", vehicleId] });
    qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
  }

  async function setCover(item: Item) {
    if (item.pending) {
      const idx = pending.findIndex((p) => p.id === item.key);
      if (idx <= 0) return;
      const next = [...pending];
      const [moved] = next.splice(idx, 1);
      onPendingChange([moved!, ...next]);
      return;
    }
    await supabase.from("vehicle_media").update({ is_cover: false } as never).eq("vehicle_id", vehicleId!);
    await supabase.from("vehicle_media").update({ is_cover: true } as never).eq("id", item.mediaId!);
    qc.invalidateQueries({ queryKey: ["vehicle-media", vehicleId] });
    qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
  }

  async function reorder(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    const keys = items.map((i) => i.key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from < 0 || to < 0) return;

    if (!vehicleId) {
      const next = [...pending];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      onPendingChange(next);
      return;
    }
    const next = [...saved];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    await Promise.all(
      next.map((m, i) => supabase.from("vehicle_media").update({ sort_order: i } as never).eq("id", m.id)),
    );
    qc.invalidateQueries({ queryKey: ["vehicle-media", vehicleId] });
    qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
  }

  const cover = items.find((i) => i.isCover) ?? items[0];
  const rest = items.filter((i) => i.key !== cover?.key);

  return (
    <div className="pt-3 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <Label>Fotos {items.length > 0 && <span className="text-muted-foreground font-normal">({items.length})</span>}</Label>
        <Button type="button" size="sm" variant="outline" className="cursor-pointer"
          onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
          Enviar
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { void accept(e.target.files); e.target.value = ""; }} />
      </div>

      {uploading && progress.total > 0 && (
        <div className="space-y-1">
          <Progress value={(progress.done / progress.total) * 100} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">Enviando {progress.done} de {progress.total} foto(s)...</p>
        </div>
      )}

      {cover && (
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted aspect-[16/9] group">
          {cover.url && <img src={cover.url} alt="Foto de capa" className="h-full w-full object-cover" />}
          <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Capa
          </span>
          <Button type="button" size="icon" variant="destructive"
            className="absolute top-2 right-2 h-7 w-7 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => remove(cover)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {rest.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {rest.map((it) => (
            <div
              key={it.key}
              draggable
              onDragStart={() => setDragKey(it.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragKey) void reorder(dragKey, it.key); setDragKey(null); }}
              className={cn(
                "relative group aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted cursor-grab active:cursor-grabbing",
                dragKey === it.key && "opacity-50",
              )}
            >
              {it.url && <img src={it.url} alt="Foto do veículo" className="h-full w-full object-cover" />}
              <GripVertical className="absolute top-1 left-1 h-3.5 w-3.5 text-white/80 drop-shadow" />
              <div className="absolute inset-0 bg-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <Button type="button" size="icon" variant="secondary" className="h-7 w-7 cursor-pointer"
                  title="Definir como capa" onClick={() => setCover(it)}>
                  <Star className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="destructive" className="h-7 w-7 cursor-pointer"
                  title="Remover" onClick={() => remove(it)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void accept(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
        )}
      >
        <ImagePlus className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs font-medium">Arraste fotos aqui ou clique para escolher</p>
        <p className="text-[11px] text-muted-foreground">
          {vehicleId ? "As fotos são enviadas na hora." : "As fotos serão enviadas quando você cadastrar o veículo."}
        </p>
      </div>
    </div>
  );
}
