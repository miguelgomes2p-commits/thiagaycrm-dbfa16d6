# Push Notifications — diagnóstico e arquitetura proposta

## 1. Diagnóstico do que já existe

**PWA:** sim, já é PWA real. `vite-plugin-pwa` (`generateSW`) configurado em `vite.config.ts`, com `registerType: "autoUpdate"`, `injectRegister: null` e SW final em `/sw.js`.

**Service Worker:** gerado pelo Workbox no build (não existe arquivo manual). Registro controlado por `src/lib/pwa.ts` (bloqueia dev/preview/iframe, suporta `?sw=off`) e UI em `src/components/pwa/PwaLayer.tsx`. **Não será substituído.**

**Manifest:** gerado pelo plugin (`/manifest.webmanifest`), referenciado em `src/routes/__root.tsx`, ícones já existentes em `public/` (192, 512, maskable). Nada será trocado.

**Mensagens recebidas:** processadas em `src/lib/evolution-message-processor.server.ts` (insert em `messages` com `direction: inbound|outbound` e `sender_type: contact|user`), acionado pelos webhooks em `src/routes/api/public/webhooks/*`.

**Atribuição de lead:** feita 100% no banco pelos triggers `tg_conversation_autoassign` / função `assign_next_agent` (least-loaded). O responsável é `conversations.assigned_to`. Nada disso será tocado.

**Usuário logado / workspaces:** auth Supabase; perfis em `profiles`, vínculo e papel em `workspace_members`, tenant em `workspaces`. Notificação interna já existe: tabela `notifications` + `NotificationBell.tsx` (realtime) — o Push será uma camada paralela, sem alterar isso.

**Rota da conversa:** já existe deep link `/app/conversations?c=<conversation_id>` (`validateSearch` na rota). O clique da notificação usará exatamente essa rota.

**Backend que dispara o Push:** TanStack server routes/functions rodando no Worker (não há edge functions Supabase). O disparo real usará uma rota `/api/public/hooks/drain-push`, no mesmo padrão dos drains já existentes.

## 2. O que será criado (nada é alteração de fluxo existente)

**Banco (novas tabelas isoladas + 1 flag):**
- `push_subscriptions` — `workspace_id, user_id, endpoint (unique), p256dh, auth, device_label, user_agent, enabled, created_at, updated_at, last_used_at`. RLS: cada usuário só vê/cria/remove as suas; `service_role` total.
- `push_queue` — fila de eventos (`event_type`, `workspace_id`, `user_id`, `conversation_id`, `dedupe_key UNIQUE`, `title`, `body`, `status`, `attempts`, `error`). A `dedupe_key` (ex.: `msg:<message_id>:<user_id>`) garante idempotência mesmo com webhook repetido.
- `workspaces.feature_push` (default `false`) — feature flag/rollback por workspace.

**Triggers novos (apenas AFTER INSERT/UPDATE, nunca bloqueiam a transação):**
- em `messages`: enfileira `NEW_CUSTOMER_MESSAGE` só quando `direction = 'inbound'` **e** `sender_type = 'contact'` **e** a conversa tem `assigned_to`. Nunca para vendedor/IA/sistema/automação.
- em `conversations`: enfileira `NEW_LEAD_ASSIGNED` quando `assigned_to` passa de nulo para um usuário (só reage ao resultado do Round Robin; não altera o algoritmo).
- Ambos disparam o drain via `pg_net` (assíncrono, best effort) — igual ao padrão de `webhook_events` já usado no projeto.

**Arquivos novos:**
- `public/push-sw.js` — handlers `push` e `notificationclick` (foca janela aberta ou abre `/app/conversations?c=...`; se a conversa não existir, o CRM abre normal).
- `src/lib/push.server.ts` — `PushNotificationService`: `sendToUser()`, `sendTest()`, `cleanupInvalidSubscriptions()` (remove/desativa em 404/410), envio Web Push com VAPID via WebCrypto (biblioteca compatível com o runtime edge).
- `src/lib/push.functions.ts` — `subscribeDevice`, `unsubscribeDevice`, `listMyDevices`, `sendTestPush` (autenticadas, validando `workspace_id` no servidor).
- `src/routes/api/public/hooks/drain-push.ts` — consome `push_queue` e envia (best effort, com log).
- `src/components/notifications/PushSettingsCard.tsx` — card discreto “Notificações Push” com status, **Ativar notificações**, **Desativar neste dispositivo** e **Enviar notificação de teste**. Prompt nativo só após clique do usuário.

**Arquivos existentes modificados (mínimo cirúrgico):**
- `vite.config.ts`: apenas `workbox.importScripts: ["/push-sw.js"]` — o SW gerado continua idêntico, só passa a importar os handlers de push.
- `src/routes/_authenticated/app.settings.tsx`: 1 linha renderizando o card novo.
- `src/lib/admin.functions.ts` + `app.admin.tsx`: expor a flag `feature_push` (mesmo padrão de Estoque/Fiscal).

Chaves `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` serão pedidas/armazenadas como segredos, geradas **uma única vez** (nunca no build/deploy). A pública também será exposta ao frontend via variável pública.

## 3. Riscos e mitigação

- **Risco SW:** `importScripts` é adição, não substituição — cache, update e instalação da PWA seguem iguais. Se `push-sw.js` falhar, o SW continua funcionando.
- **Risco chat/WhatsApp:** nenhuma linha do processador de mensagens ou dos webhooks é alterada; a reação vem de trigger de banco após o commit.
- **Risco latência:** o disparo é assíncrono (fila + `pg_net`), fora do caminho da mensagem.
- **Rollback:** desligar `feature_push` do workspace (ou apagar o segredo VAPID) desativa tudo; o CRM segue idêntico ao de hoje.
- **iOS:** funciona apenas com a PWA instalada na tela inicial (limitação do próprio iOS); a UI informará isso quando for o caso.

## 4. Fora de escopo (não será implementado)

SLA, escalonamento, alertas de 3/5 min, reatribuição, ranking, dashboards, push de IA, e-mail/SMS/WhatsApp, Firebase, app nativo. Só os eventos `NEW_LEAD_ASSIGNED` e `NEW_CUSTOMER_MESSAGE`.
