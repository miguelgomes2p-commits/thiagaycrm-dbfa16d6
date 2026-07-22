
-- 1) Admin helper
CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role IN ('owner','admin')
  );
$$;

-- 2) Conversation access helper (used by messages & conversation_labels)
CREATE OR REPLACE FUNCTION public.can_access_conversation(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id
      AND public.is_workspace_member(c.workspace_id, _user_id)
      AND (public.is_workspace_admin(c.workspace_id, _user_id) OR c.assigned_to = _user_id)
  );
$$;

-- 3) Conversations: admin vê tudo, agente vê só o que é dele
DROP POLICY IF EXISTS "members access conversations" ON public.conversations;
CREATE POLICY "access conversations" ON public.conversations FOR ALL
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (public.is_workspace_admin(workspace_id, auth.uid()) OR assigned_to = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (public.is_workspace_admin(workspace_id, auth.uid()) OR assigned_to = auth.uid() OR assigned_to IS NULL)
  );

-- 4) Messages: via conversa
DROP POLICY IF EXISTS "members access messages" ON public.messages;
CREATE POLICY "access messages" ON public.messages FOR ALL
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_conversation(conversation_id, auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_conversation(conversation_id, auth.uid())
  );

-- 5) Leads: owner_id ou admin
DROP POLICY IF EXISTS "members access leads" ON public.leads;
CREATE POLICY "access leads" ON public.leads FOR ALL
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (public.is_workspace_admin(workspace_id, auth.uid()) OR owner_id = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (public.is_workspace_admin(workspace_id, auth.uid()) OR owner_id = auth.uid() OR owner_id IS NULL)
  );

-- 6) Contacts: owner_id ou admin (owner NULL só admin vê)
DROP POLICY IF EXISTS "members access contacts" ON public.contacts;
CREATE POLICY "access contacts" ON public.contacts FOR ALL
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (public.is_workspace_admin(workspace_id, auth.uid()) OR owner_id = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (public.is_workspace_admin(workspace_id, auth.uid()) OR owner_id = auth.uid() OR owner_id IS NULL)
  );

-- 7) Tasks: assigned_to/created_by ou admin
DROP POLICY IF EXISTS "members access tasks" ON public.tasks;
CREATE POLICY "access tasks" ON public.tasks FOR ALL
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (public.is_workspace_admin(workspace_id, auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (public.is_workspace_admin(workspace_id, auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid())
  );

-- 8) Activities: só relacionadas a leads/conversas que o usuário acessa
DROP POLICY IF EXISTS "members access activities" ON public.activities;
CREATE POLICY "access activities" ON public.activities FOR ALL
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      public.is_workspace_admin(workspace_id, auth.uid())
      OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = activities.lead_id AND l.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      public.is_workspace_admin(workspace_id, auth.uid())
      OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = activities.lead_id AND l.owner_id = auth.uid())
    )
  );

-- 9) Conversation labels: via conversa
DROP POLICY IF EXISTS "members read conv labels" ON public.conversation_labels;
DROP POLICY IF EXISTS "members write conv labels" ON public.conversation_labels;
DROP POLICY IF EXISTS "members delete conv labels" ON public.conversation_labels;
CREATE POLICY "read conv labels" ON public.conversation_labels FOR SELECT
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_conversation(conversation_id, auth.uid())
  );
CREATE POLICY "write conv labels" ON public.conversation_labels FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_conversation(conversation_id, auth.uid())
  );
CREATE POLICY "delete conv labels" ON public.conversation_labels FOR DELETE
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_conversation(conversation_id, auth.uid())
  );

-- 10) Trigger: auto-atribuir conversa nova via round-robin quando assigned_to é NULL
CREATE OR REPLACE FUNCTION public.tg_conversation_autoassign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    NEW.assigned_to := public.assign_next_agent(NEW.workspace_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS conversation_autoassign ON public.conversations;
CREATE TRIGGER conversation_autoassign
BEFORE INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_autoassign();

-- 11) Default owner_id em contacts/leads quando criado por agente
CREATE OR REPLACE FUNCTION public.tg_default_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS contacts_default_owner ON public.contacts;
CREATE TRIGGER contacts_default_owner
BEFORE INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_default_owner();

DROP TRIGGER IF EXISTS leads_default_owner ON public.leads;
CREATE TRIGGER leads_default_owner
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_default_owner();
