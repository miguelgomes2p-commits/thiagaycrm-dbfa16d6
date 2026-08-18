# Correção mínima do endpoint triage-complete em produção

## Diagnóstico confirmado

- `POST https://crm.lupusassessoria.com/api/public/internal/conversations/triage-complete` retorna **HTTP 404 HTML em ~744 ms**; nenhum log do handler é emitido.
- A mesma rota também retorna 404 no domínio estável da implantação atual. Logo, a requisição não chega ao handler e o erro do n8n não é causado pelo body, Round Robin, RLS ou deadlock.
- No código atual, a rota está registrada no route tree e o handler existe.
- Executado localmente com a autenticação real configurada, o mesmo POST retornou **HTTP 200 em ~420 ms**:
  ```json
  {
    "success": true,
    "status": "already_assigned",
    "conversation_id": "6854df91-1256-45a9-b2c7-fac78be4e16c",
    "assigned_agent": {
      "id": "d28a2cc1-9747-4582-ac94-47574b600678",
      "name": "Luis victor santos de lima"
    }
  }
  ```
- A conversa existe, pertence a um workspace `shared` e já está atribuída. Não há sessão bloqueada/deadlock ativo nem erro recente da função `complete_triage_and_assign` nos logs do banco.
- A função atômica não aguarda WhatsApp, IA, Evolution, n8n ou serviços externos. A notificação de atribuição é um insert local disparado por trigger apenas em uma nova atribuição.
- Causa raiz: **a implantação publicada está anterior ao commit que adicionou a rota fixa**. O último ponto executado é o roteador/404; `TRIAGE_REQUEST_RECEIVED` nunca ocorre em produção.

## Implementação

1. Manter inalterados URL, método, autenticação, body e `Idempotency-Key` do n8n.
2. Fazer um patch somente em `src/lib/triage-complete.ts` para incluir os marcos solicitados, sem secrets:
   - `TRIAGE_REQUEST_RECEIVED`
   - `TRIAGE_BODY_PARSED`
   - `TRIAGE_CONVERSATION_ID`
   - `TRIAGE_CONVERSATION_FOUND`
   - `TRIAGE_WORKSPACE_FOUND`
   - `TRIAGE_ROUND_ROBIN_STARTED`
   - `TRIAGE_ROUND_ROBIN_FINISHED`
   - `TRIAGE_RESPONSE_RETURNED`
   - `TRIAGE_ERROR` com nome, mensagem, código e stack
3. Registrar duração total e duração da RPC. Preservar o `try/catch` que converte qualquer exceção em JSON HTTP válido.
4. Não alterar a função atômica nem os triggers, pois o teste real confirmou resposta rápida e os dados/logs não indicam bloqueio.
5. Publicar a versão atualizada para que a rota fixa passe a existir no ambiente de produção.

## Validação em produção

1. Repetir o POST real no domínio customizado com o UUID informado, Bearer configurado e `Idempotency-Key`.
2. Confirmar nos logs que todos os marcos alcançados aparecem em ordem e medir a duração.
3. Confirmar HTTP 200 e JSON `already_assigned` para esta conversa já atribuída.
4. Repetir com a mesma chave e confirmar o mesmo responsável, sem nova atribuição.
5. Testar credencial ausente/incorreta e JSON inválido, confirmando respostas JSON 401/400 em vez de abort ou HTML.
6. Verificar que o patch ficou restrito à rota de triagem e não alterou Inbox, WhatsApp, Evolution, IA, n8n, Financeiro, Fiscal, Estoque, Organograma ou Automation Studio.
