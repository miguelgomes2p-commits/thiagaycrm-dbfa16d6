import { createFileRoute, Outlet, Link, useLocation, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces, useCurrentProfile } from "@/hooks/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, KanbanSquare, MessageSquare, Bot,
  Settings, LogOut, Search, Bell, ChevronsLeft, ChevronsRight, Plus, CheckSquare, Phone, Car, Tag, ShieldAlert, Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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

  const allNav = [
    ...NAV,
    ...(isSuperAdmin ? [{ to: "/app/admin", label: "Admin Global", icon: ShieldAlert } as NavItem] : []),
  ];

  const [mobileOpen, setMobileOpen] = useState(false);

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
              <div className="text-[11px] text-muted-foreground truncate">{current?.name ?? "—"}</div>
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
                  <div className="text-[11px] text-muted-foreground truncate">{current?.name ?? "—"}</div>
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
            <Button size="sm" className="gradient-brand text-primary-foreground border-0 hidden md:inline-flex">
              <Plus className="h-4 w-4 mr-1" /> Novo lead
            </Button>
            <Button size="icon" variant="ghost" className="h-9 w-9"><Bell className="h-4 w-4" /></Button>
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
