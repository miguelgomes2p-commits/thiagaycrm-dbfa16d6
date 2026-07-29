import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowDown, LayoutGrid, MessageSquare, Bot, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md overflow-hidden border border-border">
              <img src="/lupus-logo.jpeg" alt="Lupus" className="h-full w-full object-cover" />
            </div>
            <span className="font-semibold tracking-tight">Lupus CRM</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#recursos" className="hover:text-foreground">Recursos</a>
            <a href="#cta" className="hover:text-foreground">Começar</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Começar grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Left */}
          <div className="animate-fade-in-up">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: "#FCEBEB", color: "#991B1B" }}
            >
              Feito para revenda de veículos
            </span>
            <h1 className="mt-5 text-4xl md:text-5xl font-medium tracking-tight leading-[1.1]">
              Da mensagem no WhatsApp à nota fiscal emitida.
            </h1>
            <p className="mt-5 text-base text-muted-foreground max-w-lg">
              Sem trocar de tela: a conversa vira lead, o lead vira negociação e a
              venda do veículo já sai com NF-e e RENAVAM.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/auth">
                <Button size="lg" className="h-11 px-5">
                  Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#recursos">
                <Button size="lg" variant="outline" className="h-11 px-5">
                  Ver como funciona
                </Button>
              </a>
            </div>
          </div>

          {/* Right — conversation-to-lead card */}
          <div className="animate-fade-in-up">
            <div
              className="rounded-lg border border-border bg-card p-4"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {/* WhatsApp bubble */}
              <div className="flex justify-end">
                <div
                  className="max-w-[80%] rounded-lg rounded-tr-sm px-3 py-2 text-sm"
                  style={{ backgroundColor: "#DCF8C6", color: "#111827" }}
                >
                  Tem o Corolla 2022 ainda disponível?
                  <div className="mt-1 text-[10px] text-right opacity-60">14:32</div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center py-3">
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Lead card */}
              <div className="rounded-md border border-border bg-muted p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Novo lead</div>
                    <div className="mt-0.5 font-medium text-sm">Corolla XEi 2022</div>
                  </div>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: "#FCEBEB", color: "#991B1B" }}
                  >
                    Quente
                  </span>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Atribuído a Miguel · Etapa: Qualificado
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto max-w-7xl px-6 py-20 border-t border-border">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight">
            Quatro módulos, um fluxo só
          </h2>
          <p className="mt-3 text-muted-foreground">
            Do primeiro contato à venda registrada no RENAVE, sem sair do CRM.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {[
            {
              icon: LayoutGrid,
              title: "Pipeline Kanban",
              desc: "Arraste leads entre etapas, defina responsáveis e acompanhe cada negociação em uma tela só.",
            },
            {
              icon: MessageSquare,
              title: "Inbox de WhatsApp unificada",
              desc: "Todas as conversas dos números conectados em uma caixa, com etiquetas, atribuição e histórico por contato.",
            },
            {
              icon: Bot,
              title: "Assistente de IA",
              desc: "Resume a conversa, sugere a próxima resposta e ajuda a qualificar o lead direto no chat.",
            },
            {
              icon: FileText,
              title: "NF-e + RENAVE",
              desc: "Emite nota fiscal de entrada e saída do veículo e envia o registro para o RENAVAM automaticamente.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-border bg-card p-6"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="mt-4 font-medium">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="mx-auto max-w-4xl px-6 py-20">
        <div
          className="rounded-lg border border-border bg-card p-10 md:p-12 text-center"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight">
            Pronto para vender mais?
          </h2>
          <p className="mt-3 text-muted-foreground">Crie sua conta em 30 segundos.</p>
          <Link to="/auth" className="inline-block mt-7">
            <Button size="lg" className="h-11 px-6">
              Começar agora <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} Lupus CRM</span>
          <span>Multi-tenant · Realtime</span>
        </div>
      </footer>
    </div>
  );
}
