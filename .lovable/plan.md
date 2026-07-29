## Objetivo

Antes de disparar as chamadas do RENAVE v2 (grupo Estabelecimento), o CRM precisa emitir a NF-e modelo 55 (entrada de compra e saída de venda) automaticamente e amarrar a chave da NF-e nas operações RENAVE de entrada e saída.

## Escopo

### 1. Config do emissor (Focus NFe) por workspace
Nova tabela `nfe_config`:
- `provider` (fixo `focus_nfe`), `environment` (`homologacao`/`producao`)
- `token_homolog_enc`, `token_prod_enc` (cifrados via `RENAVE_ENC_KEY` reaproveitando `encryptSecret`)
- `cnpj_emitente`, `ie_emitente`, `regime_tributario` (1/2/3), `serie_padrao`, `proxima_numeracao` (opcional; Focus controla)
- `cfop_entrada_padrao` (ex.: 1102/2102), `cfop_saida_padrao` (5102/6102)
- `natureza_operacao_entrada`, `natureza_operacao_saida`
- Endereço do emitente (logradouro, número, bairro, CEP, município, IBGE, UF)

UI: nova aba **"NF-e"** dentro de `app.renave.tsx` (ou aba própria em `app.settings.tsx`) para preencher esses campos + botão "Testar credencial" (chama `GET /v2/empresas` no Focus).

### 2. Backend de emissão

**`src/lib/nfe.server.ts`** (server-only)
- `focusRequest(env, token, path, init)` — wrapper `fetch` com base `https://api.focusnfe.com.br` (prod) ou `https://homologacao.focusnfe.com.br` (homolog).
- `buildNfeEntradaPayload(config, veiculo, fornecedor, itemFiscal)` — monta JSON de NF-e de entrada (finalidade 1, natureza compra, CFOP entrada, item = veículo com chassi/renavam/valor).
- `buildNfeSaidaPayload(config, veiculo, comprador, itemFiscal)` — NF-e de saída (CFOP saída, destinatário = comprador PF/PJ).

**`src/lib/nfe.functions.ts`** (server functions com `requireSupabaseAuth`)
- `setNfeConfig({ workspaceId, ...campos })`
- `testNfeConnection({ workspaceId })`
- `emitNfeEntrada({ workspaceId, vehicleId, fornecedor, valor, ... })`:
  1. Gera `ref` único (`entrada-{vehicleId}-{timestamp}`).
  2. `POST /v2/nfe?ref=...` com payload.
  3. Salva linha em `nfe_documents` (`status=processando`, `ref`, `direction=entrada`, `vehicle_id`).
  4. Faz polling curto (até 3 tentativas com backoff) em `GET /v2/nfe/{ref}` — se autorizada, atualiza `chave`, `numero`, `serie`, `xml_url`, `pdf_url`, `status=autorizado`; senão fica `processando` e o worker retoma.
- `emitNfeSaida(...)` — mesmo padrão.
- `pollNfeStatus({ ref })` — reconsulta.

**Webhook Focus NFe:** `src/routes/api/public/webhooks/focus-nfe.ts`
- Focus envia POST com `ref` + status quando processa. Valida token por query (`?token=...` = `FOCUS_NFE_WEBHOOK_TOKEN`) e atualiza `nfe_documents`. Quando `status='autorizado'` e a nota é de **entrada** vinculada a um veículo, enfileira automaticamente a operação RENAVE de entrada (`registrar_entrada`) na `renave_queue` com a chave.

### 3. Tabelas novas

- `nfe_config` (1:1 por workspace) + GRANTs + RLS (`has_workspace_role(_, _, ARRAY['owner','admin'])`).
- `nfe_documents`: `id`, `workspace_id`, `vehicle_id`, `direction` (`entrada`/`saida`), `ref`, `focus_status`, `chave` (44 dígitos), `numero`, `serie`, `xml_url`, `pdf_url`, `error_message`, `payload_request` jsonb, `payload_response` jsonb, timestamps. Índices por `workspace_id`, `vehicle_id`, `chave`.
- `renave_vehicles`: adicionar `nfe_entrada_chave`, `nfe_saida_chave` (FK lógica pra `nfe_documents.chave`) — a chave é o que o RENAVE consome.

### 4. Integração com RENAVE v2 (grupo Estabelecimento)

O Swagger indicado (`renave-ws/v2/api-docs?group=Estabelecimento`) exige chave da NF-e nos endpoints de entrada/saída. Ajustes:
- Atualizar seed `renave_seed_endpoints` para os endpoints v2 do grupo Estabelecimento (registrar entrada, registrar saída, consultar entrada, consultar saída, cancelar, consulta ATPV/CRLVe, download termos/PDFs).
- Base URL padrão: `https://renave.estaleiro.serpro.gov.br/renave-ws/v2` (homolog vira `homologacao.estaleiro.serpro.gov.br` — campo em `renave_config`).
- `executeRenaveEndpoint` para endpoint `registrar_entrada_v2` passa a exigir `nfe_entrada_chave` do veículo no `body`. Se ausente, tenta emitir NF-e antes (auto-emit opcional por config) ou falha com mensagem clara.

### 5. UI (`app.renave.tsx`)

- Aba **NF-e**: configuração do Focus NFe + tabela de documentos emitidos com status, botões "Ver XML" / "Ver PDF" / "Reemitir".
- Estoque → ação **"Registrar entrada"** vira wizard 2 passos:
  1. Emite NF-e de entrada (form com fornecedor, valor, CFOP override).
  2. Ao ficar `autorizado`, botão "Enviar ao RENAVE" chama `executeRenaveEndpoint('registrar_entrada_v2')` com a chave.
- Ação **"Registrar saída"**: mesmo fluxo com dados do comprador.
- Drawer do veículo mostra as duas chaves (entrada/saída) + links XML/PDF.

### 6. Secrets

- `FOCUS_NFE_WEBHOOK_TOKEN` (gerado, entra na URL do webhook que você cadastra no painel do Focus NFe: `https://<seu-dominio>/api/public/webhooks/focus-nfe?token=...`).
- Token do Focus **não** vira secret — vai cifrado em `nfe_config` por workspace (multi-tenant).

## Detalhes técnicos

- Focus NFe usa Basic Auth com token como usuário; senha vazia. `Authorization: Basic base64(token:)`.
- Homologação: XML/PDF são de teste, sem valor fiscal — perfeito pra validar o fluxo antes de produção.
- Retry: `nfe_documents.focus_status='processando'` é reconsultado pelo webhook (push) e por um botão manual "Atualizar status"; não precisa de cron dedicado.
- Cadastro de destinatário/fornecedor: se PF, usar `cpf`; se PJ, `cnpj` + `inscricao_estadual`. Guardar em campo jsonb no `nfe_documents.payload_request` pra rastreio.
- Item da NF-e (veículo): NCM `8703` (automóveis), unidade `UN`, quantidade 1, `chassi` e `renavam` em `informacoes_adicionais_item` (RENAVE lê essa amarração pela chave da NF-e).

## Fora do escopo agora

- NFC-e / NFS-e.
- Cancelamento/carta de correção via UI (dá pra chamar Focus manual; adicionamos depois se precisar).
- Cálculo tributário complexo (ICMS ST, IPI, PIS/COFINS variável) — usa alíquotas padrão configuráveis; ajuste fino fica pro contador.
- Impressão DANFE customizada — usamos o PDF do Focus.

## Entregáveis

1. Migration: `nfe_config`, `nfe_documents`, colunas em `renave_vehicles`, GRANTs/RLS, seed dos endpoints v2 Estabelecimento.
2. `src/lib/nfe.server.ts` + `src/lib/nfe.functions.ts`.
3. `src/routes/api/public/webhooks/focus-nfe.ts` (com validação de token e auto-enqueue RENAVE).
4. Atualização em `renave.server.ts` / `renave.functions.ts` para consumir chave da NF-e nos endpoints v2.
5. UI: aba NF-e + wizard de entrada/saída em `app.renave.tsx`.
6. Secret `FOCUS_NFE_WEBHOOK_TOKEN`.

## Riscos

- **Homologação Focus NFe:** você precisa ter uma empresa cadastrada em homologação no painel do Focus com o mesmo CNPJ configurado. Sem isso, `POST /v2/nfe` retorna 404.
- **RENAVE v2 x v1:** o seed atual pode estar em v1; a troca para v2 pode quebrar endpoints já cadastrados — vou renomear/migrar preservando `renave_operations` antigas.
- **Certificado A1 no Focus:** o Focus assina com o certificado que **você sobe no painel dele**, não o `.p12` do RENAVE. São dois certificados distintos (podem ser o mesmo A1, mas cadastrados em lugares diferentes).
