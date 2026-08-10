import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";

function NotificationItem({ n, onClick }: { n: AppNotification; onClick: () => void }) {
  const meta = (n.metadata ?? {}) as Record<string, string | undefined>;
  const context = [meta["lead_title"], meta["origin"]].filter(Boolean).join(" • ");
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-md transition-colors hover:bg-accent/10 cursor-pointer",
        !n.read_at && "bg-primary/5",
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", n.read_at ? "bg-transparent" : "bg-primary")} />
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm truncate", n.read_at ? "text-foreground/80" : "font-semibold")}>{n.title}</div>
          {meta["customer_name"] && (
            <div className="text-sm text-foreground/90 truncate">{meta["customer_name"]}</div>
          )}
          {context && <div className="text-xs text-muted-foreground truncate">{context}</div>}
          {n.body && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>}
          <div className="text-[11px] text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
          </div>
        </div>
      </div>
    </button>
  );
}

export function NotificationBell({ userId }: { userId?: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const navigate = useNavigate();
  const { items, unreadCount, markAsRead, markAllAsRead, onNewNotification } = useNotifications(userId);

  function openConversation(n: AppNotification) {
    void markAsRead(n.id);
    setOpen(false);
    if (n.conversation_id) {
      navigate({ to: "/app/conversations", search: { c: n.conversation_id } });
    }
  }

  useEffect(() => {
    onNewNotification((n) => {
      const meta = (n.metadata ?? {}) as Record<string, string | undefined>;
      toast(n.title, {
        description: meta["customer_name"] ?? n.body ?? undefined,
        action: n.conversation_id
          ? { label: "Abrir conversa", onClick: () => openConversation(n) }
          : undefined,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNewNotification]);

  const visible = filter === "unread" ? items.filter((n) => !n.read_at) : items;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-9 w-9 relative" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-sm font-semibold">Notificações</div>
          <button
            onClick={() => void markAllAsRead()}
            className="text-xs text-primary hover:underline disabled:opacity-50"
            disabled={unreadCount === 0}
          >
            Marcar todas como lidas
          </button>
        </div>
        <div className="flex gap-1 px-3 py-2 border-b border-border">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs transition-colors",
                filter === f ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent/10",
              )}
            >
              {f === "all" ? "Todas" : "Não lidas"}
            </button>
          ))}
        </div>
        <div className="max-h-[420px] overflow-y-auto p-1">
          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="text-sm font-medium">Você está em dia.</div>
              <div className="text-xs text-muted-foreground mt-1">
                Novos atendimentos atribuídos aparecerão aqui.
              </div>
            </div>
          ) : (
            visible.map((n) => <NotificationItem key={n.id} n={n} onClick={() => openConversation(n)} />)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
