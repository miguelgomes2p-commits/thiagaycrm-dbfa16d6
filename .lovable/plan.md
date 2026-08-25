# Criar workspace pelo painel Admin Global

## Problema
O fluxo de criação de workspace só existe na tela de onboarding, que aparece apenas para quem não tem nenhum workspace. Como sua conta continua vinculada a outros workspaces (City Car etc.), o onboarding nunca abre e não há botão em nenhum lugar para criar um novo. A trava de "um workspace por usuário" também bloquearia a criação vinda do app normal — ela só libera admin global e suporte.

## Ideia
Adicionar a criação de workspace como recurso do painel Admin (aba já restrita a miguelgomes2p@gmail.com), de forma dinâmica:

1. Botão "Criar workspace" no topo da aba Admin > Workspaces.
2. Diálogo com: nome, slug gerado automaticamente (editável), modo de atendimento (Individual / Compartilhado) e um seletor de dono:
   - "Eu (admin global)" — cria e já entra como owner;
   - "Sem dono agora" — cria o workspace e você entra como owner apenas para configurar, podendo sair depois com o botão de sair já existente;
   - opcionalmente escolher um usuário existente da lista como owner (útil para provisionar cliente novo).
3. Depois de criar, o workspace já aparece na lista, e um botão "Abrir" define ele como workspace ativo e leva ao CRM — resolvendo o "entra direto no City Car".
4. Para você poder alternar sem depender do onboarding, o seletor de workspace continua sendo a forma de trocar; a criação só passa a existir também aqui.

## Detalhes técnicos
- Nova server function `createWorkspaceAsSuperAdmin` em `src/lib/admin.functions.ts`, protegida por `requireSupabaseAuth` + `assertSuperAdmin`, usando o cliente admin para chamar `create_workspace_with_mode` com o `_user_id` do dono escolhido (a trava de workspace único continua valendo para usuários comuns: se o dono escolhido já pertencer a outro workspace, o erro da trigger é exibido com mensagem clara).
- Slug único garantido com sufixo aleatório, igual ao onboarding.
- UI: diálogo em `src/routes/_authenticated/app.admin.tsx`, invalidando as queries `admin-workspaces` e `my-workspaces` após criar; ação "Abrir" usa `setActiveWorkspaceId` de `useWorkspace.ts`.
- Nenhuma mudança de schema é necessária; nenhuma trigger ou política é alterada.
