# Plano: Pipeline customizável + Automações

O áudio já foi corrigido nesta rodada (fix do `duration=Infinity` do WhatsApp/Opus + waveform + velocidade 1x/1.5x/2x). O restante entra em 3 fases porque **fluxo visual de automação é ~3-4x o trabalho de uma cadência simples** — recomendo entregar em partes para você já usar cada fase.

---

## Fase 1 — Pipeline personalizável (etapas)

Página nova em `/app/pipeline/settings` (ou modal dentro do Kanban).

- CRUD de etapas: nome, cor (color-picker), tipo (`open` | `won` | `lost`), posição
- Reordenação drag-and-drop (atualiza `position`)
- Múltiplas etapas `won`/`lost` permitidas (ex: "Ganho — pago", "Ganho — cortesia")
- Botão "Restaurar padrão" (recria as 5 etapas base)
- Kanban lê a cor da etapa via style inline (já usa `stage.color`, só precisa da UI de edição)

Sem mexer em: campos do card, múltiplas pipelines, tags coloridas — ficam para depois quando você pedir.

---

## Fase 2 — Motor de automação (backend)

**Regra fixa desta fase:** só envia se a conversa está **em janela de 24h** (última msg inbound do cliente há menos de 24h). Fora disso, marca a execução como `skipped_out_of_window`.

Tabelas novas:

- `automations` — nó do fluxo. Campos: `workspace_id`, `pipeline_id`, `name`, `trigger_type` (`stage_enter` | `stage_leave` | `won` | `lost` | `no_reply`), `trigger_stage_id`, `active`, `graph_json` (o fluxo visual serializado).
- `automation_runs` — uma execução. Campos: `automation_id`, `lead_id`, `conversation_id`, `current_node_id`, `status` (`running` | `waiting` | `completed` | `failed` | `stopped_by_reply`), `next_run_at`, `context_json`.
- `automation_run_events` — log de cada nó executado (auditoria).

**Nós suportados no fluxo:**

| Nó | O que faz |
|---|---|
| `send_message` | Envia texto/mídia com variáveis (`{{contact.name}}`, `{{lead.title}}`, `{{lead.value}}`, `{{review_link}}`) |
| `wait` | Aguarda X minutos/horas/dias |
| `condition` | Ramifica por: cliente respondeu?, valor do lead >/< X, tag presente, dia da semana |
| `stop_if_replied` | Para toda a run se o cliente respondeu desde o disparo anterior |
| `move_stage` | Move lead para outra etapa (ex: automaticamente para "Follow-up") |
| `add_tag` / `remove_tag` | Etiqueta o lead/conversa |
| `end` | Termina a run |

**Worker:** endpoint `/api/public/hooks/automation-tick` disparado por `pg_cron` a cada 1 min. Lê `automation_runs` com `next_run_at <= now()` e `status='waiting'`, executa o próximo nó, agenda o seguinte.

**Gatilhos:** trigger SQL em `leads` (após update de `stage_id`) chama função `enqueue_automation` que cria a `automation_run`. Trigger em `messages` (inbound) marca runs como `stopped_by_reply` quando o nó atual é `stop_if_replied` ou uma condição de reply.

Envio real usa o `sendWhatsappMessage` que já existe. Se retornar erro (fora da janela / número desconectado), a run vai para `failed` com o motivo.

---

## Fase 3 — Editor visual de fluxo (UI)

Página `/app/automations` com lista + editor.

Escolha técnica: **React Flow** (`@xyflow/react`) — biblioteca padrão pra editores nó-e-aresta, leve, com pan/zoom/minimap prontos.

- Sidebar de nós arrastáveis para o canvas
- Cada nó tem painel de propriedades à direita
- Editor de mensagem com preview e inserção de variáveis
- Botão "Testar" — executa a run com um lead de exemplo em modo dry-run (não envia, só loga)
- Templates prontos ao criar automação:
  - **"Pedido de avaliação Google"** — gatilho `won`, wait Xd (configurável), send_message com `{{review_link}}`
  - **"Follow-up cadenciado"** — gatilho `stage_enter` em qualquer etapa, 3-5 send_message com waits e `stop_if_replied` entre cada

Link do Google Reviews fica em `workspaces.settings_json` (campo `google_review_url`) — configurado uma vez por workspace, usado por todas as automações via variável.

---

## Ordem de entrega

Recomendo eu entregar **Fase 1 primeiro** (pipeline editável), depois **Fase 2 + template "Google Review" com editor simples de formulário** (não visual ainda) — assim você já tem o caso de uso mais crítico rodando. A **Fase 3 (editor visual React Flow)** vem por último porque é o pedaço mais caro em tokens.

Se preferir tudo de uma vez, também dá — só quero deixar claro que fluxo visual dobra o tempo. Confirma como quer que eu proceda?
