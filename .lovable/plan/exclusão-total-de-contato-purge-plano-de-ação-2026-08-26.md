# Exclusão total de contato (purge) — plano de ação

## O que acontece hoje (diagnóstico)

1. A tela de Contatos faz um `delete` direto na tabela de contatos.
2. No banco, a conversa **não** é apagada: o vínculo com o contato apenas vira nulo. Sobram também lead, tarefas, notas fiscais e mensagens antigas apontando para o nada.
3. Quando esse número manda mensagem de novo, o processador de WhatsApp procura a conversa pelo número (`whatsapp_number_id` + número do cliente), **acha a conversa órfã** e reaproveita ela. Como o gatilho de atribuição automática só roda na criação da conversa, a conversa continua sem responsável e sem contato — aparecendo como "Anônimo".

Ou seja: o problema não é a exclusão, é a conversa que sobrevive à exclusão.

## Plano

### 1. Função de banco `purge_contact(contact_id)`
Uma única operação transacional, com permissão validada (só membro do workspace; agente só apaga contato próprio, admin/manager/suporte apaga qualquer um do workspace):

- Apaga as **conversas** do contato → isso já remove em cascata mensagens, etiquetas da conversa, histórico de atribuição, notificações e itens de fila.
- Apaga os **leads** do contato → remove em cascata interesses em veículos, atividades e execuções de automação do lead.
- Limpa referências onde apagar seria perda de dado fiscal/histórico: tarefas do contato são apagadas; notas fiscais mantêm o registro fiscal apenas desvinculado (exigência legal).
- Apaga os envios de aniversário e o próprio contato.
- Retorna um resumo do que foi removido.

### 2. Rede de segurança na ingestão de mensagens
No processador de mensagens do WhatsApp, antes de reaproveitar uma conversa existente: se a conversa estiver **sem contato vinculado**, ela é descartada (apagada) e uma nova é criada. Isso garante fluxo do zero, com atribuição automática (round-robin / dono do número) e nome correto vindo do WhatsApp, mesmo em conversas órfãs que já existam hoje.

### 3. Limpeza das órfãs atuais
Rodar uma limpeza única removendo as conversas já existentes sem contato vinculado, para que os clientes que voltarem a mandar mensagem entrem como novo atendimento.

### 4. Ajuste na tela de Contatos
- O botão de excluir passa a chamar a exclusão total, com confirmação explícita: "Isso apaga o contato, conversas, mensagens e leads permanentemente."
- Após excluir, atualiza as listas de contatos, conversas e pipeline.

## O que não muda
- Round-robin, notificações push, etiquetas, estoque, financeiro e fiscal continuam iguais.
- Nada de exclusão em massa: sempre um contato por vez, iniciada pelo usuário.
- Registros fiscais nunca são apagados, apenas desvinculados.
