## Objetivo

Ligar a integração RENAVE/SERPRO de verdade: hoje só existem tabelas + UI. Depois deste plano, os botões de operação disparam chamadas reais à API oficial, com autenticação por certificado do cliente, e a fila reprocessa falhas automaticamente.

## Escopo

### 1. Armazenamento seguro do certificado `.p12`
- Novo bucket privado `renave-certs` (Storage) para guardar `pfx` por workspace.
- Ajustar `renave_config` para referenciar `cert_path` + guardar `cert_password_encrypted` (via `pgsodium` se disponível, caso contrário coluna cifrada no servidor).
- Upload/rotação feita só por `owner/admin` do workspace.

### 2. Executor HTTP com mTLS + OAuth (`src/lib/renave.functions.ts`)
- `getRenaveToken(workspaceId)` — obtém `access_token` no endpoint OAuth do cliente, com cache em `renave_config.oauth_token_cache` (expiração).
- `renaveCall(workspaceId, endpointCode, { path, query, body })`:
  1. Busca o endpoint em `renave_endpoints` e config do workspace.
  2. Baixa o `.p12` do Storage + senha decifrada.
  3. Monta `https.Agent({ pfx, passphrase })` e faz a requisição usando `undici` (nativo em Node).
  4. Persiste request/response em `renave_http_logs` e atualiza `renave_operations`.
- Runtime: server function (Node) — validar em runtime; se o worker Cloudflare não suportar `pfx`, colocamos o executor num handler dedicado e desabilitamos o botão com mensagem clara pedindo self-host/Node.

### 3. Worker da fila
- Server route pública `/api/public/hooks/drain-renave-queue` que:
  - Puxa `renave_queue` com `status='pending' AND next_run_at <= now()`.
  - Processa em lotes, com retry exponencial e limite de tentativas.
  - Marca operação como `sucesso`/`falha` e atualiza status do veículo.
- Job `pg_cron` a cada 30s chamando essa rota via `pg_net`.

### 4. Ligar os botões da UI (`app.renave.tsx`)
- Ao registrar entrada/saída/consulta:
  1. Cria `renave_operation` (`pendente`).
  2. Enfileira em `renave_queue`.
  3. Dispara execução imediata (chama o executor direto para feedback instantâneo).
- Reprocessar operação com falha (botão "Reexecutar").
- Ver detalhes de log HTTP por operação (drawer com request/response e status).

### 5. Configuração por cliente (o que sobra pro admin)
- Upload do `.p12` + senha.
- URL base do SERPRO (default preenchido) + URL do OAuth token + `client_id`/`client_secret`.
- CNPJ do estabelecimento, `idEstoque` padrão.
- Toggle "modo homologação × produção".

## Detalhes técnicos

- Cloudflare Workers/`workerd` tem suporte limitado a `tls`/`pfx`. Se falhar em produção, exponho um endpoint interno em Node (mesma stack, forçando runtime Node) ou instruo a rodar o executor num serviço externo (n8n) chamando `renaveCall` via HTTP interno. Isso será validado no primeiro request e reportado com mensagem clara na UI.
- `pgsodium` é a preferência para senha do `.p12`; se não estiver disponível no projeto, uso cifra AES-GCM com chave em `SUPABASE_SERVICE_ROLE_KEY`-derivada (persistida em coluna `bytea`).
- Todos os `createServerFn` protegidos usam `requireSupabaseAuth` + checagem `has_workspace_role(_, _, ARRAY['owner','admin'])` antes de operar.
- Rota `/api/public/hooks/drain-renave-queue` autentica por header `x-renave-cron-secret` (nova secret) para evitar disparo externo.

## Fora do escopo agora

- Front específico para cada tipo de operação (ex.: wizard de entrada com validação de NF). Botões usarão formulário genérico + JSON template do endpoint.
- Webhook de callback do SERPRO (a API é síncrona nos endpoints atuais).
- Emissão de PDFs adicionais além dos que a API retorna.

## Entregáveis

1. Migration: bucket `renave-certs`, coluna `cert_path`/`cert_password_enc` em `renave_config`, coluna `oauth_token_cache` (jsonb), grants, políticas.
2. `src/lib/renave.server.ts` (helpers: fetch mTLS, decrypt, storage).
3. `src/lib/renave.functions.ts` (`getRenaveToken`, `renaveCall`, `enqueueRenaveOperation`, `retryRenaveOperation`).
4. `src/routes/api/public/hooks/drain-renave-queue.ts` + `pg_cron` a cada 30s.
5. Atualização em `app.renave.tsx`: upload de certificado, ações que executam de verdade, drawer de logs, botão "Reexecutar".
6. Secret nova: `RENAVE_CRON_SECRET`.

## Riscos

- **Runtime sem mTLS:** primeiro request pode falhar; se acontecer, retorno com plano B (executor externo) no mesmo dia.
- **Homologação SERPRO:** cada cliente precisa ter `.p12` válido e conta habilitada — sem isso, nada roda. Isso é config, não código.
- **Rate limit SERPRO:** a fila cobre isso com backoff.
