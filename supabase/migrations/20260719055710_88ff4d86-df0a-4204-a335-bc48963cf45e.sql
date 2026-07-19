
-- 1. Criar schema privado não exposto pela API para funções sensíveis
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- 2. Converter helpers de RLS para SECURITY INVOKER (removem-se do finding)
--    Elas só fazem SELECT em workspace_members; RLS dessa tabela já permite ao usuário ver a própria filiação.
ALTER FUNCTION public.has_workspace_role(uuid, uuid, app_role[]) SECURITY INVOKER;
ALTER FUNCTION public.is_workspace_member(uuid, uuid) SECURITY INVOKER;

-- 3. Revogar EXECUTE das funções trigger (não precisam ser chamadas por clientes)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_conversation_autotag_wa() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_whatsapp_number_label(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4. assign_next_agent é chamada via service_role no webhook; revogar do público
REVOKE EXECUTE ON FUNCTION public.assign_next_agent(uuid) FROM PUBLIC, anon, authenticated;

-- 5. Mover funções DEFINER chamadas pelo cliente para o schema privado
ALTER FUNCTION public.create_workspace_with_defaults(text, text) SET SCHEMA private;
ALTER FUNCTION public.renave_seed_endpoints(uuid) SET SCHEMA private;
REVOKE EXECUTE ON FUNCTION private.create_workspace_with_defaults(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.renave_seed_endpoints(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_workspace_with_defaults(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.renave_seed_endpoints(uuid) TO service_role;
