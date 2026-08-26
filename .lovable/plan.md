# Consulta de veículo por placa (DadosAPI) — análise e plano

## 1. Onde está o cadastro de estoque hoje
- Página: `src/routes/_authenticated/app.inventory.tsx` (lista, filtros, abre o diálogo).
- Formulário: `src/components/vehicles/VehicleFormDialog.tsx` — estado local `FormState`, salva direto via `supabase.from("vehicles").insert/update`.
- Domínio/util: `src/lib/vehicles.ts` (tipos, `FUEL_OPTIONS`, `TRANSMISSION_OPTIONS`, `parseBRLNumber`, `parseYearRange`).
- Subcomponentes: `VehicleGalleryManager` (fotos), `VehicleOriginSection` (origem/propriedade), seção financeira beta.
- Validação atual: apenas Marca e Modelo obrigatórios. Nada mais bloqueia o cadastro manual.

## 2. Tabelas envolvidas
- `public.vehicles` — tabela do estoque, ligada a `workspace_id`, com RLS por workspace (4 policies) e `deleted_at` para soft delete. Possui coluna `metadata jsonb` e `external_ref`.
- `vehicle_media` (fotos), `vehicle_financials` / `vehicle_expenses` (custos, beta), `lead_vehicle_interests` (leads).
- `renave_vehicles` é outro módulo (RENAVE/SERPRO) e NÃO deve ser tocado.

## 3. Mapa DadosAPI → CRM

| DadosAPI | Campo em `vehicles` | Situação |
|---|---|---|
| placa | `plate` | existe |
| renavam | `renavam` | existe |
| marca | `brand` | existe |
| modelo | `model` | existe |
| versao | `version` | existe |
| anoFabricacao | `year_manufacture` | existe |
| anoModelo | `year_model` | existe |
| cor | `color` | existe |
| combustivel | `fuel` | existe (normalizar para `FUEL_OPTIONS`) |
| cilindrada | `engine` (texto, ex. "999 cc") | existe, aproximado |
| especie / tipo / carroceria | `category` (parcial) | parcial |
| chassi mascarado | `chassis` | existe, mas vem mascarado — sugiro NÃO preencher automaticamente |

Sem correspondência hoje: potência (cv), quantidade de eixos, peso bruto total, capacidade de passageiros, número do motor, município, UF, situação do veículo, data do último licenciamento, categoria (oficial), procedência, e todo o bloco FIPE (código, descrição, valor, mês de referência).

## 4. Campos faltantes — recomendação (sem migration)
Recomendo **zero alteração de schema na v1**: gravar tudo o que não tem coluna dentro de `vehicles.metadata`, em uma chave isolada:

```text
metadata.plate_lookup = {
  provider: "dadosapi",
  fetched_at: ISO,
  plate: "ABC1D23",
  raw: { ...campos normalizados... },
  fipe: { codigo, descricao, valor, mes_referencia }
}
```

Vantagens: nada quebra, nenhum RLS/GRANT novo, e o dado fica auditável. Se depois o uso mostrar que potência e FIPE precisam de filtro/ordenação, aí sim promovemos colunas dedicadas (`power_hp`, `fipe_code`, `fipe_value`, `fipe_reference`).

## 5. FIPE
- Valor FIPE entra como **referência**, exibido no card de resultado e depois no detalhe do veículo (badge "FIPE R$ …, ref. mm/aaaa").
- Nunca escreve em `price`. O campo Preço continua manual.
- Fica em `metadata.plate_lookup.fipe`.

## 6. Arquivos a alterar
- `src/components/vehicles/VehicleFormDialog.tsx` — adicionar botão "Consultar" ao lado do campo Placa + card de resultado + botão "Usar dados no cadastro" (aplica patch no `FormState`). Nenhuma outra parte do layout muda.
- `src/lib/vehicles.ts` — apenas helpers de placa (`normalizePlate`, `isValidPlate`) e normalização de combustível.
- `src/components/vehicles/VehicleDetailDialog.tsx` (opcional) — exibir o bloco FIPE quando existir em `metadata`.

## 7. Arquivos novos
- `src/lib/vehicle-lookup/types.ts` — contrato `VehicleLookupResult` (formato neutro, independente de fornecedor).
- `src/lib/vehicle-lookup/dadosapi.server.ts` — provider: chama a DadosAPI, normaliza para o contrato.
- `src/lib/vehicle-lookup.functions.ts` — `lookupVehicleByPlate` (`createServerFn` + `requireSupabaseAuth`), valida a placa, chama o provider, devolve resultado tipado.
- `src/components/vehicles/PlateLookupField.tsx` — campo + botão + estados (idle/loading/erro/resultado).

Arquitetura futura: o service escolhe o provider (`BasicLookupProvider` → DadosAPI hoje, SERPRO amanhã) e um `VehicleHistoryProvider` pode ser adicionado sem alterar o formulário.

## 8. Chave, backend e segurança
- Secret `DADOSAPI_API_KEY` no backend (adicionada pela ferramenta de secrets), lida com `process.env['DADOSAPI_API_KEY']` **dentro do handler**.
- Fluxo: Formulário → `createServerFn` autenticado → DadosAPI. O navegador nunca vê a chave nem a URL da API.
- A função exige sessão (`requireSupabaseAuth`) e verifica que o usuário é membro do workspace informado, então não vira endpoint público de consulta de placas.
- Nada é gravado em localStorage; a resposta bruta só é persistida no `metadata` do veículo quando o usuário salvar.

## 9. Evitar consultas duplicadas / custo
Estratégia simples, em três camadas, sem tabela nova na v1:
1. Cache em memória por sessão do formulário: consultar a mesma placa duas vezes seguidas não chama a API.
2. `useQuery` com `queryKey: ["plate-lookup", placa]` e `staleTime` longo (ex. 24 h) — reuso dentro da aba.
3. Antes de chamar a API, checar se já existe veículo no workspace com aquela placa e avisar "Esta placa já está no estoque".

Se o custo justificar depois, criamos `plate_lookup_cache` (placa + payload + fetched_at, TTL ~30 dias, leitura só via server function) — recomendo deixar para a v2.

Disparo: só no clique em "Consultar" ou Enter, com placa válida (`AAA0000` ou `AAA0A00`). Botão desabilitado enquanto inválida ou carregando.

## 10. Cadastro manual intacto
- O botão é opcional e isolado; qualquer erro só mostra toast/alerta no card.
- Erros: não encontrada → "Não encontramos informações para esta placa. Você pode continuar cadastrando o veículo manualmente."; falha/timeout/sem crédito/401 → "Não foi possível consultar o veículo agora. Tente novamente ou continue o cadastro manualmente."
- Timeout de ~10 s com `AbortSignal`; nenhuma exceção sobe para o `save()`.
- O preenchimento só acontece após "Usar dados no cadastro", e nunca sobrescreve campos que o usuário já preencheu (merge não destrutivo), exceto se ele confirmar.

## 11. Riscos
- Formato de resposta da DadosAPI ainda não verificado em produção → normalização tolerante (campos opcionais, nada quebra se faltar).
- Combustível/câmbio da API podem não bater com as listas do Select → normalizador com fallback para campo vazio.
- Chassi mascarado poluir o campo real → não preencher.
- Custo por consulta → travas do item 9.
- Multi-tenant: nenhuma mudança em `workspace_id`, RLS ou policies.

## 12. Plano de implementação (quando autorizado)
1. Registrar o secret `DADOSAPI_API_KEY`.
2. Criar `vehicle-lookup/types.ts` + provider DadosAPI + server function autenticada.
3. Helpers de placa em `src/lib/vehicles.ts`.
4. Componente `PlateLookupField` com card de resultado.
5. Plugar no `VehicleFormDialog` (campo Placa) e gravar `metadata.plate_lookup` no save.
6. (Opcional) Exibir FIPE no `VehicleDetailDialog`.
7. Testar: placa válida, inválida, inexistente, API fora do ar, e cadastro 100% manual sem tocar no botão.

Nenhum outro módulo (WhatsApp, IA, pipeline, notificações, RENAVE, fiscal, auth) é tocado.
