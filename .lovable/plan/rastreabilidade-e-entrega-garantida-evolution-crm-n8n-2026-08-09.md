# Rastreabilidade e entrega garantida Evolution → CRM → n8n

## Diagnóstico resumido

O ponto de falha está entre CRM e n8n, não na entrada. A fila `webhook_events` está saudável (97.902 eventos, 100% `done`, zero `failed`/`pending`), então a Evolution entrega e o CRM persiste. O que se perde é a chamada ao n8n.

Causas encontradas:

1. `forwardToN8n` é chamado com `void` (fire-and-forget) dentro do drain. Em runtime serverless, quando a resposta HTTP é devolvida, promessas pendentes são descartadas — a chamada ao n8n morre pela metade de forma aleatória. É exatamente o padrão "às vezes funciona, às vezes não".
2. O resultado do n8n não influencia o estado do evento: o evento vira `done` mesmo se o n8n nunca foi chamado. Não existe retry, nem `dead_letter`, nem campos de auditoria da entrega.
3. Timeout de 5s com `AbortController`: fluxos de IA no n8n que demoram mais são abortados e a mensagem é perdida silenciosamente.
4. Caminhos alternativos não encaminham para o n8n: o fallback síncrono dos dois webhooks e o "Puxar mensagens" processam a mensagem no CRM mas nunca chamam o n8n. Isso explica mensagens que aparecem no chat sem acionar a IA.
5. Sem idempotência: se o processamento do evento falhar e ele for retentado, o n8n é chamado de novo — risco de atendimento duplicado.
6. Os dois jobs de cron passam `?kind=realtime` / `?kind=history`, mas o handler ignora o parâmetro e sempre drena as duas filas. Os jobs competem entre si e o de 5s pode ficar preso drenando histórico.

## Correções (todas aditivas)

### 1. Tabela de entregas ao n8n
Nova tabela `n8n_deliveries` (migration aditiva, nada removido):
`id, workspace_id, whatsapp_number_id, webhook_event_id, wa_message_id, trace_id, request_id, phone, status (pending|processing|delivered|retry|dead_letter), attempts, next_retry_at, last_attempt_at, http_status, response_body, error, created_at, updated_at`
com `UNIQUE (whatsapp_number_id, wa_message_id)` — chave de idempotência: a mesma mensagem nunca gera duas entregas.

Colunas aditivas em `webhook_events`: `n8n_requested_at`, `n8n_http_status`, `n8n_status`, `trace_id`, `wa_message_id`.

### 2. Encaminhamento confiável
- Substituir o `void forwardToN8n(...)` por gravação de uma linha `pending` em `n8n_deliveries` (rápido, transacional) e entrega feita por um drenador próprio, com `await`.
- Timeout subiu para 30s; headers `X-CRM-Trace-ID` e `X-WA-Message-ID` em toda chamada.
- Retry com backoff: imediato → 5s → 20s → 60s → 5min → `dead_letter`.
- Nenhum evento é marcado como concluído por causa de erro do n8n; a entrega tem ciclo de vida próprio.

### 3. Cobrir os caminhos que hoje não chamam o n8n
Fallback síncrono dos webhooks e sync manual passam a enfileirar a entrega igual ao caminho normal (com a mesma chave idempotente, então não duplica).

### 4. Watchdog
Job novo a cada 60s: entregas em `processing` há mais de 60s voltam para `retry`; eventos `processing` presos voltam para `pending` (já existe parcialmente, será estendido). Sobrevive à morte de um worker.

### 5. Cron
O drain passa a respeitar `?kind=`: o job de 5s drena só `realtime`, o de 30s só `history`. Novo job de 5s para drenar `n8n_deliveries`.

### 6. Painel de saúde
Nova aba técnica em WhatsApp (admin): status da instância, último webhook recebido, última mensagem processada, pendentes/erros, e a tabela
`Horário | Message ID | Telefone | Evolution | CRM | n8n | Tentativas | Status | Erro`
com busca por `wa_message_id`, `trace_id` ou telefone.

### 7. Eventos na Evolution
Manter a assinatura atual; garantir apenas `MESSAGES_UPSERT` e `CONNECTION_UPDATE` presentes. Nada é removido do que já funciona.

## Fora de escopo
Envio manual pelo CRM, criação de contatos/conversas, formato das mensagens, frontend de conversas e migrations antigas permanecem intactos.
