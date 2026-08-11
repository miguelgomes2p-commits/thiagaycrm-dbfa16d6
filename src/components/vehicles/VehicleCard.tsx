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
        "overflow-hidden cursor-pointer transition-shadow hover:shadow-md border-border",
        vehicle.status === "sold" && "opacity-70",
      )}
    >
      <div className={cn("relative bg-muted flex items-center justify-center", compact ? "h-28" : "h-40")}>
        {cover ? (
          <img src={cover} alt={vehicleTitle(vehicle)} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Car className="h-8 w-8 text-muted-foreground" />
        )}
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
