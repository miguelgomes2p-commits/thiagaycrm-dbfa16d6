import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listWorkspaces from "./tools/list-workspaces";
import listLeads from "./tools/list-leads";
import listContacts from "./tools/list-contacts";
import listConversations from "./tools/list-conversations";
import getConversationMessages from "./tools/get-conversation-messages";
import listVehicles from "./tools/list-vehicles";
import listTasks from "./tools/list-tasks";
import createTask from "./tools/create-task";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "lupus-crm-prd",
  title: "Lupus CRM PRD",
  version: "0.1.0",
  instructions:
    "Ferramentas do Lupus CRM (CRM automotivo). Use list_workspaces primeiro para descobrir o workspace_id. Depois consulte leads do pipeline (list_leads), contatos (list_contacts), conversas de WhatsApp e suas mensagens (list_conversations, get_conversation_messages), estoque de veículos (list_vehicles) e tarefas (list_tasks, create_task). Todos os dados são limitados ao que o usuário autenticado pode ver no CRM.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listWorkspaces,
    listLeads,
    listContacts,
    listConversations,
    getConversationMessages,
    listVehicles,
    listTasks,
    createTask,
  ],
});
