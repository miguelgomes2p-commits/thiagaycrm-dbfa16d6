import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Car, LayoutGrid, List, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { VehicleCard } from "@/components/vehicles/VehicleCard";
import { VehicleFormDialog } from "@/components/vehicles/VehicleFormDialog";
import { VehicleDetailDialog } from "@/components/vehicles/VehicleDetailDialog";
import { useVehicleCovers, useVehicles, useVehiclesRealtime, VEHICLES_PAGE_SIZE, type VehicleFilters } from "@/hooks/useVehicles";
import {
  VEHICLE_STATUS_CLASS, VEHICLE_STATUS_LABEL, formatBRL, formatKm, formatYear, vehicleTitle, type Vehicle,
} from "@/lib/vehicles";

export const Route = createFileRoute("/_authenticated/app/inventory")({
  component: InventoryPage,
  head: () => ({
    meta: [
      { title: "Estoque de Veículos | Lupus CRM" },
      { name: "description", content: "Gerencie o estoque de veículos, fotos, preços e o interesse de cada lead." },
      { property: "og:title", content: "Estoque de Veículos | Lupus CRM" },
      { property: "og:description", content: "Catálogo interno de veículos integrado ao pipeline de vendas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function InventoryPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<VehicleFilters>({ status: "all" });
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [detail, setDetail] = useState<Vehicle | null>(null);

  useVehiclesRealtime(ws?.id);
  const listQ = useVehicles(ws?.id, filters, page);
  const rows = listQ.data?.rows ?? [];
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const coversQ = useVehicleCovers(ids);
  const total = listQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / VEHICLES_PAGE_SIZE));

  function applySearch() {
    setPage(0);
    setFilters((f) => ({ ...f, search }));
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" /> Estoque
          </h1>
          <p className="text-sm text-muted-foreground">{total} veículo(s) cadastrado(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button type="button" onClick={() => setView("grid")}
              className={cn("p-2 cursor-pointer", view === "grid" && "bg-muted")} aria-label="Ver em grade">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setView("list")}
              className={cn("p-2 cursor-pointer", view === "list" && "bg-muted")} aria-label="Ver em lista">
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button className="cursor-pointer" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo veículo
          </Button>
        </div>
      </div>

      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-52">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Marca, modelo, placa ou código..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }} />
          </div>
        </div>
        <Select value={filters.status ?? "all"} onValueChange={(v) => { setPage(0); setFilters((f) => ({ ...f, status: v as VehicleFilters["status"] })); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="available">Disponível</SelectItem>
            <SelectItem value="reserved">Reservado</SelectItem>
            <SelectItem value="sold">Vendido</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Input className="w-28" placeholder="Ano mín." inputMode="numeric"
          onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, yearMin: e.target.value ? Number(e.target.value) : null })); }} />
        <Input className="w-32" placeholder="Preço máx." inputMode="numeric"
          onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, priceMax: e.target.value ? Number(e.target.value) : null })); }} />
        <Input className="w-28" placeholder="KM máx." inputMode="numeric"
          onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, mileageMax: e.target.value ? Number(e.target.value) : null })); }} />
        <Button variant="outline" className="cursor-pointer" onClick={applySearch}>Filtrar</Button>
      </Card>

      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando estoque...</p>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Car className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">Nenhum veículo no estoque</p>
          <p className="text-xs text-muted-foreground">Cadastre o primeiro veículo para vinculá-lo aos seus leads.</p>
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {rows.map((v) => (
            <VehicleCard key={v.id} vehicle={v} cover={coversQ.data?.[v.id]} onClick={() => setDetail(v)} />
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((v) => (
            <button key={v.id} type="button" onClick={() => setDetail(v)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 cursor-pointer">
              <div className="h-12 w-16 rounded bg-muted overflow-hidden flex items-center justify-center shrink-0">
                {coversQ.data?.[v.id]
                  ? <img src={coversQ.data[v.id]!} alt={vehicleTitle(v)} className="h-full w-full object-cover" />
                  : <Car className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{vehicleTitle(v)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatYear(v)} · {formatKm(v.mileage)} · {v.plate ?? "sem placa"}
                </p>
              </div>
              <span className="text-sm font-semibold text-primary">{formatBRL(v.price)}</span>
              <Badge className={cn("border-0", VEHICLE_STATUS_CLASS[v.status])}>{VEHICLE_STATUS_LABEL[v.status]}</Badge>
            </button>
          ))}
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" className="cursor-pointer" disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span className="text-xs text-muted-foreground">Página {page + 1} de {pages}</span>
          <Button variant="outline" size="sm" className="cursor-pointer" disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      )}

      {ws && (
        <VehicleFormDialog open={formOpen} onOpenChange={setFormOpen} workspaceId={ws.id} vehicle={editing} />
      )}
      <VehicleDetailDialog
        vehicle={detail}
        onOpenChange={(o) => { if (!o) setDetail(null); }}
        onEdit={(v) => { setDetail(null); setEditing(v); setFormOpen(true); }}
      />
    </div>
  );
}
