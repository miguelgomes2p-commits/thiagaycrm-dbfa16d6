import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Plus, Trash2, Star, Search, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  geocodeAddress,
  type WorkspaceLocation,
} from "@/lib/locations.functions";
import { LocationMessageCard } from "@/components/chat/LocationMessageCard";

type Draft = {
  id?: string;
  name: string;
  address: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: string;
  longitude: string;
  is_default: boolean;
  is_active: boolean;
};

const EMPTY: Draft = {
  name: "", address: "", street: "", number: "", complement: "", neighborhood: "",
  city: "", state: "", postal_code: "", country: "BR", latitude: "", longitude: "",
  is_default: false, is_active: true,
};

function toDraft(l: WorkspaceLocation): Draft {
  return {
    id: l.id,
    name: l.name ?? "",
    address: l.address ?? "",
    street: l.street ?? "",
    number: l.number ?? "",
    complement: l.complement ?? "",
    neighborhood: l.neighborhood ?? "",
    city: l.city ?? "",
    state: l.state ?? "",
    postal_code: l.postal_code ?? "",
    country: l.country ?? "BR",
    latitude: String(l.latitude ?? ""),
    longitude: String(l.longitude ?? ""),
    is_default: !!l.is_default,
    is_active: l.is_active !== false,
  };
}

export function WorkspaceLocationsSection({
  workspaceId,
  canManage,
}: {
  workspaceId?: string | null;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLocations);
  const createFn = useServerFn(createLocation);
  const updateFn = useServerFn(updateLocation);
  const deleteFn = useServerFn(deleteLocation);
  const geocodeFn = useServerFn(geocodeAddress);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");

  const q = useQuery({
    enabled: !!workspaceId,
    queryKey: ["workspace-locations-admin", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId! } }),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["workspace-locations-admin", workspaceId] });
    qc.invalidateQueries({ queryKey: ["workspace-locations"] });
  }

  const geocodeM = useMutation({
    mutationFn: () => geocodeFn({ data: { query: search } }),
    onSuccess: (results) => {
      const r = results[0];
      if (!r) { toast.error("Endereço não encontrado. Tente incluir cidade e estado."); return; }
      setDraft((d) => ({
        ...(d ?? EMPTY),
        address: r.display_name || (d?.address ?? ""),
        street: r.street ?? d?.street ?? "",
        number: r.number ?? d?.number ?? "",
        neighborhood: r.neighborhood ?? d?.neighborhood ?? "",
        city: r.city ?? d?.city ?? "",
        state: r.state ?? d?.state ?? "",
        postal_code: r.postal_code ?? d?.postal_code ?? "",
        country: r.country ?? d?.country ?? "BR",
        latitude: String(r.latitude),
        longitude: String(r.longitude),
      }));
      toast.success("Coordenadas encontradas. Confira no mapa antes de salvar.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveM = useMutation({
    mutationFn: async () => {
      const d = draft!;
      const lat = Number(d.latitude);
      const lng = Number(d.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Latitude/longitude inválidas.");
      const payload = {
        workspaceId: workspaceId!,
        name: d.name.trim(),
        address: d.address.trim() || null,
        street: d.street.trim() || null,
        number: d.number.trim() || null,
        complement: d.complement.trim() || null,
        neighborhood: d.neighborhood.trim() || null,
        city: d.city.trim() || null,
        state: d.state.trim() || null,
        postal_code: d.postal_code.trim() || null,
        country: d.country.trim() || null,
        latitude: lat,
        longitude: lng,
        is_default: d.is_default,
        is_active: d.is_active,
      };
      return d.id ? updateFn({ data: { id: d.id, ...payload } }) : createFn({ data: payload });
    },
    onSuccess: () => { toast.success("Local salvo"); setDraft(null); setSearch(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultM = useMutation({
    mutationFn: (id: string) => updateFn({ data: { id, workspaceId: workspaceId!, is_default: true } }),
    onSuccess: () => { toast.success("Localização padrão atualizada"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeM = useMutation({
    mutationFn: (p: { id: string; is_active: boolean }) =>
      updateFn({ data: { id: p.id, workspaceId: workspaceId!, is_active: p.is_active } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id, workspaceId: workspaceId! } }),
    onSuccess: () => { toast.success("Local removido"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const locations = q.data ?? [];
  const lat = Number(draft?.latitude);
  const lng = Number(draft?.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  return (
    <section className="card-elevated p-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Localização da empresa</h2>
        </div>
        {canManage && !draft && (
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setDraft({ ...EMPTY, is_default: locations.length === 0 })}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar local
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Cadastre o endereço da loja uma única vez. Os vendedores enviam essa localização no chat com um clique,
        sem depender do GPS do celular.
      </p>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando locais…</p>}

      {!q.isLoading && locations.length === 0 && !draft && (
        <p className="text-sm text-muted-foreground">
          Nenhum local cadastrado. {canManage ? "Adicione o endereço da loja para liberar o envio no chat." : "Peça a um administrador para cadastrar."}
        </p>
      )}

      <div className="divide-y divide-border">
        {locations.map((l) => (
          <div key={l.id} className="py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                {l.name}
                {l.is_default && (
                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                    <Star className="h-3 w-3" /> padrão
                  </span>
                )}
                {!l.is_active && <span className="text-[10px] text-muted-foreground">inativo</span>}
              </div>
              <div className="text-xs text-muted-foreground truncate">{l.address ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground/80 font-mono">
                {Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-1.5 shrink-0">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Switch checked={l.is_active !== false} onCheckedChange={(v) => activeM.mutate({ id: l.id, is_active: v })} />
                  Ativo
                </label>
                {!l.is_default && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 cursor-pointer" title="Definir como padrão" onClick={() => defaultM.mutate(l.id)}>
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 cursor-pointer" title="Editar" onClick={() => setDraft(toDraft(l))}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                  title="Remover"
                  onClick={() => confirm(`Remover o local "${l.name}"?`) && delM.mutate(l.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && draft && (
        <div className="mt-4 rounded-lg border border-border bg-surface/40 p-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">Buscar endereço</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Av. Paulista 1000, São Paulo SP"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (search.trim().length > 3) geocodeM.mutate(); } }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="self-end cursor-pointer"
              disabled={geocodeM.isPending || search.trim().length < 4}
              onClick={() => geocodeM.mutate()}
            >
              {geocodeM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Nome do local *</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Loja Centro" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Endereço completo (exibido ao cliente)</Label>
              <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            </div>
            <div><Label className="text-xs">Rua</Label><Input value={draft.street} onChange={(e) => setDraft({ ...draft, street: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Número</Label><Input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} /></div>
              <div><Label className="text-xs">Compl.</Label><Input value={draft.complement} onChange={(e) => setDraft({ ...draft, complement: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Bairro</Label><Input value={draft.neighborhood} onChange={(e) => setDraft({ ...draft, neighborhood: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Cidade</Label><Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></div>
              <div><Label className="text-xs">UF</Label><Input value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">CEP</Label><Input value={draft.postal_code} onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })} /></div>
              <div><Label className="text-xs">País</Label><Input value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Latitude *</Label><Input value={draft.latitude} onChange={(e) => setDraft({ ...draft, latitude: e.target.value })} placeholder="-23.561" /></div>
              <div><Label className="text-xs">Longitude *</Label><Input value={draft.longitude} onChange={(e) => setDraft({ ...draft, longitude: e.target.value })} placeholder="-46.656" /></div>
            </div>
          </div>

          {hasCoords && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5">Confirme no mapa como o cliente verá:</p>
              <LocationMessageCard loc={{ latitude: lat, longitude: lng, name: draft.name || "Localização", address: draft.address || null }} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={draft.is_default} onCheckedChange={(v) => setDraft({ ...draft, is_default: v })} />
              Localização padrão
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              Ativa
            </label>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="cursor-pointer" onClick={() => { setDraft(null); setSearch(""); }} disabled={saveM.isPending}>
              Cancelar
            </Button>
            <Button
              className="gradient-brand text-primary-foreground border-0 cursor-pointer"
              disabled={saveM.isPending || draft.name.trim().length < 2 || !hasCoords}
              onClick={() => saveM.mutate()}
            >
              {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar local"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
