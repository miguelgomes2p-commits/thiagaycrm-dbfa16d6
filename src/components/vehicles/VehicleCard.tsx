import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Car, Star } from "lucide-react";
import {
  VEHICLE_STATUS_CLASS, VEHICLE_STATUS_LABEL, formatBRL, formatKm, formatYear, vehicleTitle, type Vehicle,
} from "@/lib/vehicles";

export function VehicleCard({
  vehicle, cover, onClick, compact,
}: { vehicle: Vehicle; cover?: string | null; onClick?: () => void; compact?: boolean }) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "group overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 border-border",
        vehicle.status === "sold" && "opacity-70",
      )}
    >
      <div className={cn("relative overflow-hidden bg-muted", compact ? "h-28" : "aspect-[4/3]")}>
        {cover ? (
          <img
            src={cover}
            alt={vehicleTitle(vehicle)}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-muted to-muted/40">
            <Car className="h-7 w-7 text-muted-foreground/60" />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Sem foto</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-foreground/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <Badge className={cn("absolute top-2 left-2 border-0", VEHICLE_STATUS_CLASS[vehicle.status])}>
          {VEHICLE_STATUS_LABEL[vehicle.status]}
        </Badge>
        {vehicle.featured && (
          <span className="absolute top-2 right-2 rounded-full bg-primary p-1 text-primary-foreground">
            <Star className="h-3 w-3" />
          </span>
        )}
      </div>

      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold leading-tight truncate">{vehicleTitle(vehicle)}</p>
        <p className="text-xs text-muted-foreground">
          {formatYear(vehicle)} · {formatKm(vehicle.mileage)}
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm font-bold text-primary">{formatBRL(vehicle.price)}</span>
          {vehicle.stock_code && (
            <span className="text-[10px] font-mono text-muted-foreground">{vehicle.stock_code}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
