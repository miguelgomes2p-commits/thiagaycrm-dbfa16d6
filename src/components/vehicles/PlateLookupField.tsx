import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { lookupVehicleByPlate } from "@/lib/vehicle-lookup.functions";
import { isValidPlate, normalizePlate, type VehicleLookupResult } from "@/lib/vehicle-lookup/types";
import { formatBRL } from "@/lib/vehicles";

const MSG_NOT_FOUND =
  "Não encontramos informações para esta placa. Você pode continuar cadastrando o veículo manualmente.";
const MSG_UNAVAILABLE =
  "Não foi possível consultar o veículo agora. Tente novamente ou continue o cadastro manualmente.";

/**
 * Campo Placa + consulta opcional (DadosAPI).
 * Nunca bloqueia o cadastro manual: qualquer falha só exibe um aviso.
 */
export function PlateLookupField({
  value, onChange, workspaceId, onApply,
}: {
  value: string;
  onChange: (v: string) => void;
  workspaceId: string;
  onApply: (result: VehicleLookupResult) => void;
}) {
  const lookup = useServerFn(lookupVehicleByPlate);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VehicleLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cache em memória: mesma placa não gera nova cobrança na sessão do formulário.
  const cache = useRef(new Map<string, VehicleLookupResult>());

  const plate = normalizePlate(value);
  const valid = isValidPlate(plate);

  async function run() {
    if (!valid || loading) return;
    setError(null);
    const cached = cache.current.get(plate);
    if (cached) { setResult(cached); return; }

    setLoading(true);
    try {
      const res = await lookup({ data: { plate, workspaceId } });
      if (res.ok) {
        cache.current.set(plate, res.result);
        setResult(res.result);
      } else {
        setResult(null);
        setError(res.code === "not_found" ? MSG_NOT_FOUND : MSG_UNAVAILABLE);
      }
    } catch {
      setResult(null);
      setError(MSG_UNAVAILABLE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Placa</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder="ABC1D23"
          onChange={(e) => onChange(normalizePlate(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(); } }}
        />
        <Button type="button" variant="outline" className="cursor-pointer shrink-0"
          disabled={!valid || loading} onClick={() => void run()}>
          {loading
            ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Consultando...</>
            : <><Search className="h-4 w-4 mr-1.5" /> Consultar</>}
        </Button>
      </div>

      {error && (
        <Card className="p-3 flex gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>{error}</span>
        </Card>
      )}

      {result && (
        <Card className="p-3 space-y-2">
          <p className="text-xs font-medium text-success flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Veículo encontrado
          </p>
          <p className="text-sm font-semibold">
            {[result.brand, result.model, result.version].filter(Boolean).join(" ") || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              result.year_manufacture && result.year_model
                ? `${result.year_manufacture}/${result.year_model}`
                : (result.year_model ?? result.year_manufacture ?? null),
              result.fuel,
              result.color,
              result.extra.cilindrada,
              result.extra.potencia,
            ].filter(Boolean).join(" · ")}
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {result.fipe?.valor != null && (
              <div>
                <p className="text-muted-foreground">FIPE (referência)</p>
                <p className="font-medium">{formatBRL(result.fipe.valor)}</p>
                {result.fipe.mes_referencia && (
                  <p className="text-[11px] text-muted-foreground">ref. {result.fipe.mes_referencia}</p>
                )}
              </div>
            )}
            {(result.extra.municipio || result.extra.uf) && (
              <div>
                <p className="text-muted-foreground">Emplacamento</p>
                <p className="font-medium">{[result.extra.municipio, result.extra.uf].filter(Boolean).join(" - ")}</p>
              </div>
            )}
            {result.extra.situacao && (
              <div>
                <p className="text-muted-foreground">Situação</p>
                <p className="font-medium">{result.extra.situacao}</p>
              </div>
            )}
          </div>
          <Button type="button" size="sm" className="cursor-pointer" onClick={() => onApply(result)}>
            Usar dados no cadastro
          </Button>
        </Card>
      )}
    </div>
  );
}
