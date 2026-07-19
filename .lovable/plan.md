## Objetivo

Transformar o Inbox de "lista plana única" para uma central organizada por **etiquetas customizáveis**, onde o número WhatsApp de origem é uma etiqueta automática (do sistema) e o usuário pode criar quantas etiquetas quiser (ex.: "VIP", "Aguardando pagamento", "Suporte técnico", "Frio", "Quente").

## O que muda no banco

Três tabelas novas:

- `labels` — etiquetas do workspace. Campos de domínio: `name`, `color` (hex/oklch), `kind` (`system` p/ auto-geradas como número WA e canal, `custom` p/ criadas pelo usuário), `scope` (`conversation` | `contact` | `lead` — começaremos com `conversation`, mas deixamos preparado), `sort_order`.
- `conversation_labels` — N:N entre `conversations` e `labels`. Campos: `conversation_id`, `label_id`, `assigned_by` (user ou `system`), `assigned_at`.
- (opcional futuro) `contact_labels` / `lead_labels` — mesma estrutura, para a fase 2.

Automatismo: quando uma conversa WhatsApp é criada pelo webhook, insere automaticamente uma `conversation_labels` apontando pra etiqueta system daquele `whatsapp_number_id` (criada on-the-fly se não existir, cor derivada do número).

## O que muda no CRM

### 1. Página nova: `Configurações → Etiquetas` (`/app/settings/labels`)
- Lista todas as etiquetas do workspace
- Criar / editar / arquivar etiqueta (nome, cor via color-picker, escopo)
- Etiquetas `system` são visíveis mas não editáveis (nome/cor travados; só dá pra ocultar)
- Reordenar via drag (define `sort_order` — usado como ordem padrão de agrupamento no Inbox)

### 2. Inbox (`/app/conversations`) — nova UX

**Sidebar esquerda vira 2 colunas colapsáveis:**

```text
┌──────────┬───────────────┬─────────────────────┐
│ Etiquetas│  Conversas    │  Thread ativa       │
│  (chips) │  (agrupadas)  │                     │
└──────────┴───────────────┴─────────────────────┘
```

- **Coluna 1 (Etiquetas)** — chips clicáveis com contador de não-lidas por etiqueta. Multi-seleção (AND/OR configurável). Seção "Números WhatsApp" (system) e "Personalizadas" separadas visualmente. Botão "+ Nova etiqueta" abre modal rápido.
- **Coluna 2 (Conversas)** — lista filtrada + agrupada. Header com dois controles:
  - **Agrupar por:** Nenhum · Etiqueta · Número WA · Status · Responsável
  - **Ordenar por:** Mais recente · Mais antiga · Não lidas primeiro · Nome do contato
- Cada card ganha uma linha de "pills" coloridas com as etiquetas da conversa (máx 3 visíveis + "+N").

**Header da thread ativa** ganha um `LabelPicker` (combobox) — o agente adiciona/remove etiquetas em 1 clique enquanto atende.

### 3. Realtime
Assinar mudanças em `conversation_labels` pra atualizar chips/contadores sem reload.

## Detalhes técnicos

- Contador de não-lidas por etiqueta: view SQL `label_unread_counts` (workspace_id, label_id, unread_count) baseada em `messages.direction='inbound'` + last read timestamp da conversa.
- Cores: usamos oklch tokens quando `system`; hex custom quando `custom`. Renderização via CSS var inline no chip.
- Persistência dos filtros/ordem: `localStorage` por workspace (`inbox-view-v1`) — não precisa de tabela.
- Componente reutilizável `<LabelBadge>` e `<LabelPicker>` em `src/components/labels/` — será usado depois em Contatos, Leads e Tarefas (por isso o campo `scope` desde já).
- Migration com GRANTs + RLS (member do workspace pode ler; admin/owner cria/edita/apaga; qualquer member atribui/remove etiquetas).

## Fora do escopo desta fase
- Etiquetas em Contatos, Leads e Tarefas (fica preparado mas UI vem depois)
- Regras automáticas ("se mensagem contém X, aplicar etiqueta Y") — próxima fase
- Relatórios por etiqueta

## Passos de implementação

1. Migration: `labels`, `conversation_labels`, view `label_unread_counts`, trigger que aplica label do número WA ao criar conversa.
2. Server function que, no webhook do WhatsApp, garante label `system` do número.
3. Componentes: `LabelBadge`, `LabelPicker`, `LabelChipRail`.
4. Página `/app/settings/labels` (CRUD + drag reorder).
5. Refatorar `/app/conversations`: chips lateral, agrupamento, ordenação, picker no header, pills no card.
6. Realtime de `conversation_labels`.

Posso disparar a migration (passo 1) agora?