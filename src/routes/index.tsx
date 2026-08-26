import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight, LayoutGrid, MessageSquare, Bot, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroMockup, StageCard } from "@/components/landing/MockupCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lupus CRM — WhatsApp, pipeline e NF-e para revenda de veículos" },
      {
        name: "description",
        content:
          "CRM para revenda de veículos: conversa do WhatsApp vira lead, o lead vira negociação e a venda sai com NF-e e RENAVE. Tudo em uma tela.",
      },
      { property: "og:title", content: "Lupus CRM — do WhatsApp à NF-e emitida" },
      {
        property: "og:description",
        content:
          "Pipeline Kanban, inbox de WhatsApp unificada, assistente de IA e emissão de NF-e com RENAVE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
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
];

const STEPS = [
  {
    title: "Cliente manda mensagem no WhatsApp",
    desc: "A mensagem chega na inbox unificada, com o número certo e o vendedor da vez já atribuído.",
  },
  {
    title: "Vira lead automaticamente",
    desc: "O contato entra no pipeline como lead qualificado, com etiquetas, dono e histórico completo.",
  },
  {
    title: "Fecha negociação com NF-e emitida",
    desc: "Ao marcar como vendido, a nota sai e o veículo é registrado no RENAVE — sem trocar de tela.",
  },
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,padding] duration-200 ${
        scrolled
          ? "bg-background/70 backdrop-blur-md border-b border-border"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div
        className={`mx-auto max-w-7xl px-6 flex items-center justify-between transition-[padding] duration-200 ${
          scrolled ? "py-2" : "py-4"
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md overflow-hidden border border-border">
            <img src="/lupus-logo.jpeg" alt="Lupus CRM" className="h-full w-full object-cover" />
          </div>
          <span className="font-semibold tracking-tight">Lupus CRM</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#como-funciona" className="hover:text-foreground transition-colors">
            Como funciona
          </a>
          <a href="#recursos" className="hover:text-foreground transition-colors">
            Recursos
          </a>
          <a href="#cta" className="hover:text-foreground transition-colors">
            Começar
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm">
              Entrar
            </Button>
          </Link>
          <Link to="/auth">
            <Button size="sm">Começar grátis</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  const mockY = useTransform(smooth, [0, 1], [0, reduce ? 0 : 120]);
  const gridY = useTransform(smooth, [0, 1], [0, reduce ? 0 : 48]);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  };

  return (
    <section ref={ref} className="relative overflow-hidden">
      {/* Themed grid layer — slowest parallax */}
      <motion.div
        aria-hidden
        style={{
          y: gridY,
          rotate: -2,
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(70% 60% at 50% 35%, #000 0%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(70% 60% at 50% 35%, #000 0%, transparent 100%)",
          opacity: 0.5,
        }}
        className="pointer-events-none absolute -inset-x-24 -top-24 h-[140%] will-change-transform"
      />


      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative mx-auto max-w-7xl px-6 pt-28 pb-16 md:pt-36 md:pb-24"
      >
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <motion.span
              variants={item}
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: "#FCEBEB", color: "#991B1B" }}
            >
              Feito para revenda de veículos
            </motion.span>
            <motion.h1
              variants={item}
              className="mt-5 text-4xl md:text-5xl font-medium tracking-tight leading-[1.1]"
            >
              Da mensagem no WhatsApp à nota fiscal emitida.
            </motion.h1>
            <motion.p variants={item} className="mt-5 text-base text-muted-foreground max-w-lg">
              Sem trocar de tela: a conversa vira lead, o lead vira negociação e a venda do veículo
              já sai com NF-e e RENAVAM.
            </motion.p>
            <motion.div variants={item} className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/auth">
                <Button size="lg" className="h-11 px-5">
                  Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#como-funciona">
                <Button size="lg" variant="outline" className="h-11 px-5">
                  Ver como funciona
                </Button>
              </a>
            </motion.div>
          </div>

          <motion.div variants={item} style={{ y: mockY }} className="will-change-transform">
            <HeroMockup />
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

function HowItWorksStacked() {
  return (
    <section id="como-funciona" className="mx-auto max-w-7xl px-6 py-20 border-t border-border">
      <h2 className="text-2xl md:text-3xl font-medium tracking-tight">Como funciona</h2>
      <div className="mt-10 space-y-10">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4 }}
          >
            <div className="text-xs text-muted-foreground">Etapa {i + 1}</div>
            <h3 className="mt-1 font-medium">{s.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
            <div className="mt-4">
              <StageCard stage={i as 0 | 1 | 2} />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function HowItWorksSticky() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next: 0 | 1 | 2 = v < 0.36 ? 0 : v < 0.7 ? 1 : 2;
    setStage((prev) => (prev === next ? prev : next));
  });

  return (
    <section
      id="como-funciona"
      ref={ref}
      className="relative border-t border-border"
      style={{ height: "300vh" }}
    >
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        <div className="mx-auto w-full max-w-7xl px-6 grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight">Como funciona</h2>
            <div className="mt-8 space-y-6">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.title}
                  animate={{
                    opacity: stage === i ? 1 : 0.35,
                    x: stage === i ? 0 : -4,
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="border-l-2 pl-4 transition-colors duration-300"
                  style={{ borderColor: stage === i ? "var(--primary)" : "var(--border)" }}
                >
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-md">{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
          <div>
            <StageCard stage={stage} />
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const reduce = useReducedMotion();
  const isDesktop = useIsDesktop();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !isDesktop || reduce) return <HowItWorksStacked />;
  return <HowItWorksSticky />;
}


function Features() {
  const reduce = useReducedMotion();
  return (
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
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: reduce ? 0 : 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.08 }}
            whileHover={reduce ? undefined : { y: -4 }}
            className="group rounded-lg border border-border bg-card p-6 transition-colors duration-200 hover:border-primary will-change-transform"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background">
              <f.icon className="h-4 w-4 text-primary" />
            </div>
            <h3 className="mt-4 font-medium">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 30 });
  const sy = useSpring(y, { stiffness: 220, damping: 30 });
  const [hover, setHover] = useState(false);
  const background = useTransform(
    [sx, sy],
    ([mx, my]: number[]) =>
      `radial-gradient(220px circle at ${mx}px ${my}px, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)`,
  );

  return (
    <section id="cta" className="mx-auto max-w-4xl px-6 py-20">
      <div
        onMouseMove={(e) => {
          if (reduce) return;
          const r = e.currentTarget.getBoundingClientRect();
          x.set(e.clientX - r.left);
          y.set(e.clientY - r.top);
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative overflow-hidden rounded-lg border border-border bg-card p-10 md:p-12 text-center"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {!reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background }}
            animate={{ opacity: hover ? 1 : 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
        <div className="relative">
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
      </div>
    </section>
  );
}

function Landing() {
  const navigate = useNavigate();

  // Aberto pelo ícone (PWA instalado / app nativo): vai direto para o CRM,
  // sem passar pela landing. No navegador web nada muda.
  useEffect(() => {
    if (isStandalone() || isNativeApp()) {
      void navigate({ to: "/app", replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <FinalCTA />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} Lupus CRM</span>
          <span>Multi-tenant · Realtime</span>
        </div>
      </footer>
    </div>
  );
}
