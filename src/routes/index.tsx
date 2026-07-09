import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MessageSquare, Sparkles, Zap, LayoutGrid, ShieldCheck, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-lg bg-background/70 border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg overflow-hidden border border-border">
              <img src="/lupus-logo.jpeg" alt="Lupus" className="h-full w-full object-cover" />
            </div>
            <span className="font-semibold tracking-tight">Lupus CRM</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#recursos" className="hover:text-foreground">Recursos</a>
            <a href="#ia" className="hover:text-foreground">IA</a>
            <a href="#precos" className="hover:text-foreground">Preços</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="gradient-brand text-primary-foreground border-0">Começar grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-primary/20 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-7xl px-6 py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/50 px-3 py-1 text-xs text-muted-foreground mb-8">
            <Sparkles className="h-3 w-3 text-primary" />
            CRM conversacional com IA nativa
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Toda venda começa <br />
            com uma <span className="text-gradient-brand">conversa.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Pipeline visual, inbox omnichannel e assistente de IA em uma única tela.
            Automatize follow-ups, resuma conversas e feche mais negócios.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gradient-brand text-primary-foreground border-0 h-12 px-6">
                Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="h-12 px-6">Ver demo</Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center tracking-tight">Tudo em um só lugar</h2>
        <p className="mt-4 text-center text-muted-foreground max-w-2xl mx-auto">
          Contatos, pipeline, conversas e IA. Sem alternar entre 10 abas.
        </p>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            { icon: LayoutGrid, title: "Pipeline Kanban", desc: "Arraste cartões entre etapas, veja valor e prioridade em segundos." },
            { icon: MessageSquare, title: "Inbox omnichannel", desc: "WhatsApp, Instagram, Email e mais em uma caixa unificada." },
            { icon: Bot, title: "IA integrada", desc: "Assistente que responde, resume, qualifica leads e gera propostas." },
            { icon: Zap, title: "Automações visuais", desc: "Construtor no estilo n8n para orquestrar seu fluxo de vendas." },
            { icon: ShieldCheck, title: "Multi-tenant seguro", desc: "Cada empresa isolada por RLS. Pronto para milhares de usuários." },
            { icon: Sparkles, title: "Design moderno", desc: "Interface responsiva, dark mode, atalhos e comando global." },
          ].map((f) => (
            <div key={f.title} className="card-elevated p-6 hover:border-primary/40 transition-colors group">
              <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center mb-4 group-hover:bg-primary/20 transition-colors">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="precos" className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="card-elevated p-12 relative overflow-hidden">
          <div className="absolute inset-0 -z-10 opacity-30 gradient-brand" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Pronto para vender mais?</h2>
          <p className="mt-3 text-muted-foreground">Crie sua conta em 30 segundos.</p>
          <Link to="/auth" className="inline-block mt-8">
            <Button size="lg" className="gradient-brand text-primary-foreground border-0 h-12 px-8">
              Começar agora <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} Lupus CRM</span>
          <span>Feito com IA · Multi-tenant · Realtime</span>
        </div>
      </footer>
    </div>
  );
}
