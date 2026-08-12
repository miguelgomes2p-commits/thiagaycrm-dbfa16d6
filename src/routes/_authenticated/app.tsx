import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces, useCurrentProfile, setActiveWorkspaceId } from "@/hooks/useWorkspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, KanbanSquare, MessageSquare, Bot,
  Settings, LogOut, Search, ChevronsLeft, ChevronsRight, CheckSquare, Phone, Car, Tag, ShieldAlert, Menu, Workflow, Check, ChevronDown
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; feature?: "renave" | "ai" };
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/app/contacts", label: "Contatos", icon: Users },
  { to: "/app/conversations", label: "Conversas", icon: MessageSquare },
  { to: "/app/whatsapp", label: "WhatsApp", icon: Phone },
  { to: "/app/labels", label: "Etiquetas", icon: Tag },
  { to: "/app/tasks", label: "Tarefas", icon: CheckSquare },
  { to: "/app/inventory", label: "Estoque", icon: Car },
  { to: "/app/fiscal", label: "Fiscal", icon: FileText },
  { to: "/app/renave", label: "RENAVE", icon: Car, feature: "renave" },
  { to: "/app/ai", label: "Assistente IA", icon: Bot, feature: "ai" },
  { to: "/app/settings", label: "Configurações", icon: Settings },
];

function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { data: workspaces, isLoading: wsLoading, isFetching: wsFetching } = useMyWorkspaces();
  const { data: profile } = useCurrentProfile();
  const { data: authUser } = useQuery({
    queryKey: ["auth-user-email"],
    queryFn: async () => (await supabase.auth.getSession()).data.session?.user,
  });
  const isSuperAdmin = authUser?.email?.toLowerCase() === "miguelgomes2p@gmail.com";
  const BETA_EMAILS = ["miguelgomes2p@gmail.com", "tj1605123@gmail.com"];
  const isAutomationBeta = !!authUser?.email && BETA_EMAILS.includes(authUser.email.toLowerCase());
  const qc = useQueryClient();
  const current = workspaces?.[0];

  // Only redirect to onboarding once we're sure the user truly has no workspace
  // (query settled with an empty result). Avoids bouncing while the cache is
  // stale/refetching right after workspace creation.
  useEffect(() => {
    if (!wsLoading && !wsFetching && workspaces && workspaces.length === 0) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspaces, wsLoading, wsFetching, navigate]);

  // Realtime global leve: mantém a lista de conversas fresca sem polling pesado.
  // O fallback de sincronização com Evolution não pode rodar por usuário/aba; isso
  // amplifica carga no Worker, Evolution e banco e causa comportamento intermitente.
  useEffect(() => {
    if (!current?.id || typeof window === "undefined" || typeof document === "undefined") return;
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateConversations = () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["conversations", current.id] });
      }, 350);
    };

    const ch = supabase
      .channel(`ws-${current.id}-live`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${current.id}` },
        invalidateConversations)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `workspace_id=eq.${current.id}` },
        invalidateConversations)
      .subscribe();

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      supabase.removeChannel(ch);
    };
  }, [current?.id, qc]);


  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.full_name ?? "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const filteredNav = NAV.filter((item) => {
    if (item.feature === "renave") return !!current?.feature_renave;
    if (item.feature === "ai") return !!current?.feature_ai;
    return true;
  });
  const allNav = [
    ...filteredNav,
    ...(isAutomationBeta ? [{ to: "/app/automations", label: "Automações BETA", icon: Workflow } as NavItem] : []),
    ...(isSuperAdmin ? [{ to: "/app/admin", label: "Admin Global", icon: ShieldAlert } as NavItem] : []),
  ];

  const [mobileOpen, setMobileOpen] = useState(false);

  // Seletor de workspace: aparece quando o usuário (ex.: admin global) tem mais de um.
  const WorkspaceSwitcher = ({ onPick }: { onPick?: () => void }) => {
    if (!workspaces || workspaces.length < 2) {
      return <div className="text-[11px] text-muted-foreground truncate">{current?.name ?? "—"}</div>;
    }
    return (
      <div className="relative group/ws">
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer max-w-full">
          <span className="truncate">{current?.name ?? "—"}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
        <div className="absolute left-0 top-full mt-1 w-60 card-elevated p-1 z-50 opacity-0 invisible group-hover/ws:opacity-100 group-hover/ws:visible transition-all max-h-72 overflow-y-auto">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setActiveWorkspaceId(w.id);
                qc.invalidateQueries();
                onPick?.();
              }}
              className="w-full flex items-center gap-2 px-2 py-2 text-xs rounded hover:bg-accent/10 text-left cursor-pointer"
            >
              <Check className={cn("h-3.5 w-3.5 shrink-0", w.id === current?.id ? "text-primary" : "opacity-0")} />
              <span className="truncate flex-1">{w.name}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{w.role}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const NavList = ({ dense = false, onNavigate }: { dense?: boolean; onNavigate?: () => void }) => (
    <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
      {allNav.map((item) => {
        const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to as "/app"}
            onClick={onNavigate}
            className={cn(
              "relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-md text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:content-[''] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              dense && "py-2.5"
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-64"
      )}>
        <div className="h-14 px-3 flex items-center gap-2 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-lg bg-background/40 border border-sidebar-border grid place-items-center shrink-0 overflow-hidden">
            <img src="/lupus-logo.jpeg" alt="Lupus" className="h-full w-full object-cover" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-sidebar-foreground truncate">Lupus CRM</div>
              <WorkspaceSwitcher />
            </div>
          )}
        </div>
        {collapsed ? (
          <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
            {allNav.map((item) => {
              const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to as "/app"}
                  title={item.label}
                  className={cn(
                    "relative flex items-center justify-center px-0 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground before:content-[''] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                </Link>
              );
            })}
          </nav>
        ) : (
          <NavList />
        )}
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
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center gap-2 md:gap-3 px-3 md:px-6 shrink-0">
          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="md:hidden shrink-0" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
              <div className="h-14 px-3 flex items-center gap-2 border-b border-sidebar-border">
                <div className="h-9 w-9 rounded-lg bg-background/40 border border-sidebar-border grid place-items-center shrink-0 overflow-hidden">
                  <img src="/lupus-logo.jpeg" alt="Lupus" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-sidebar-foreground truncate">Lupus CRM</div>
                  <WorkspaceSwitcher onPick={() => setMobileOpen(false)} />
                </div>
              </div>
              <div className="flex flex-col h-[calc(100%-3.5rem)]">
                <NavList dense onNavigate={() => setMobileOpen(false)} />
                <button
                  onClick={signOut}
                  className="m-2 flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
                >
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-2 min-w-0 flex-1">
            <div className="h-7 w-7 rounded-md overflow-hidden shrink-0">
              <img src="/lupus-logo.jpeg" alt="Lupus" className="h-full w-full object-cover" />
            </div>
            <span className="text-sm font-semibold truncate">Lupus CRM</span>
          </div>

          {/* Desktop search */}
          <div className="hidden md:block flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar leads, contatos, conversas..." className="pl-9 h-9 bg-surface/50" />
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            <NotificationBell userId={authUser?.id} />
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
