import { createFileRoute, Outlet, Link, useLocation, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces, useCurrentProfile } from "@/hooks/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, KanbanSquare, MessageSquare, Bot,
  Settings, LogOut, Search, Bell, ChevronsLeft, ChevronsRight, Plus, CheckSquare, Phone, Car, Tag, ShieldAlert

} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/app")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: memberships } = await supabase
      .from("workspace_members").select("workspace_id").limit(1);
    if (!memberships || memberships.length === 0) {
      throw redirect({ to: "/onboarding" });
    }
  },
  component: AppShell,
});

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/app/contacts", label: "Contatos", icon: Users },
  { to: "/app/conversations", label: "Conversas", icon: MessageSquare },
  { to: "/app/whatsapp", label: "WhatsApp", icon: Phone },
  { to: "/app/labels", label: "Etiquetas", icon: Tag },
  { to: "/app/tasks", label: "Tarefas", icon: CheckSquare },
  { to: "/app/renave", label: "RENAVE", icon: Car },


  { to: "/app/ai", label: "Assistente IA", icon: Bot },
  { to: "/app/settings", label: "Configurações", icon: Settings },
];

function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { data: workspaces } = useMyWorkspaces();
  const { data: profile } = useCurrentProfile();
  const { data: authUser } = useQuery({
    queryKey: ["auth-user-email"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
  const isSuperAdmin = authUser?.email?.toLowerCase() === "miguelgomes2p@gmail.com";
  const qc = useQueryClient();
  const current = workspaces?.[0];

  useEffect(() => {
    // Global CMD+K placeholder
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.full_name ?? "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-64"
      )}>
        <div className="h-14 px-3 flex items-center gap-2 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-lg bg-background/40 border border-sidebar-border grid place-items-center shrink-0 overflow-hidden">
            <img src="/lupus-logo.jpeg" alt="Lupus" className="h-full w-full object-cover" />
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-sidebar-foreground truncate">Lupus CRM</div>
              <div className="text-[11px] text-muted-foreground truncate">{current?.name ?? "—"}</div>
            </div>
          )}
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as "/app"}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-sidebar-accent/50"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Recolher</>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center gap-3 px-4 md:px-6 shrink-0">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar leads, contatos, conversas..." className="pl-9 h-9 bg-surface/50" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gradient-brand text-primary-foreground border-0 hidden md:inline-flex">
              <Plus className="h-4 w-4 mr-1" /> Novo lead
            </Button>
            <Button size="icon" variant="ghost"><Bell className="h-4 w-4" /></Button>
            <div className="relative group">
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback className="bg-primary/20 text-primary text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute right-0 top-full mt-2 w-56 card-elevated p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="px-2 py-2 border-b border-border">
                  <div className="text-sm font-medium truncate">{profile?.full_name ?? "Usuário"}</div>
                  <div className="text-xs text-muted-foreground truncate">{current?.name}</div>
                </div>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded hover:bg-accent/10 mt-1"
                >
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
