# Correção definitiva do callback de triagem n8n

## Diagnóstico confirmado

Os logs de produção mostram que o n8n está chamando:

```text
/api/public/internal/conversations//triage-complete
```

O valor usado em `$json.conversation_id` está vazio nesse ponto do workflow. A infraestrutura normaliza o caminho para `/conversations/triage-complete`, que não possui rota e retorna 404. Chamadas com um UUID real já retornaram HTTP 200 tanto no domínio customizado quanto no domínio estável, portanto o endpoint atual e o domínio estão operacionais.

## Implementação

1. Criar um endpoint fixo, sem parâmetro obrigatório na URL:
   ```text
   POST /api/public/internal/conversations/triage-complete
   ```
2. Resolver o ID da conversa no servidor a partir do payload que o CRM já envia ao n8n, priorizando:
   - `crm_context.conversation_id`
   - `conversation_id`
   - formatos aninhados compatíveis já presentes no workflow
3. Validar o ID como UUID e responder sempre em JSON:
   - `400 missing_conversation_id` quando ausente
   - `400 invalid_conversation_id` quando inválido
   - `401 unauthorized` para credencial incorreta
   - respostas atuais de sucesso/Round Robin sem alteração
4. Reutilizar a mesma lógica interna do endpoint dinâmico atual para evitar divergência entre as duas rotas e preservar:
   - autenticação Bearer
   - idempotência
   - `complete_triage_and_assign`
   - Round Robin atômico
   - logs estruturados
5. Manter a rota atual com UUID no caminho por compatibilidade, sem alterar contratos existentes.
6. Ajustar a integração para usar a URL fixa, eliminando definitivamente a concatenação com `$json.conversation_id` no n8n.

## Validação

- Testar a URL fixa com `crm_context.conversation_id` válido e confirmar HTTP 200 JSON.
- Testar ID ausente, inválido, credencial inválida e repetição idempotente.
- Confirmar nos logs que a requisição entra no handler e que não há mais caminhos com `//triage-complete` ou respostas HTML 404.
- Confirmar que nenhuma regra de atribuição, workspace ou Round Robin foi modificada.

## Ação de segurança necessária

O token Bearer aparece visível no anexo. Ele deve ser rotacionado após a correção e atualizado no n8n; não será registrado nem incluído no código.