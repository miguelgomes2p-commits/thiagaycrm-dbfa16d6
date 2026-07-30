import { motion } from "framer-motion";
import { ArrowDown, CheckCircle2 } from "lucide-react";

export function ChatBubble() {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[80%] rounded-lg rounded-tr-sm px-3 py-2 text-sm"
        style={{ backgroundColor: "#DCF8C6", color: "#111827" }}
      >
        Tem o Corolla 2022 ainda disponível?
        <div className="mt-1 text-[10px] text-right opacity-60">14:32</div>
      </div>
    </div>
  );
}

export function LeadCard({ sold = false }: { sold?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            {sold ? "Negociação fechada" : "Novo lead"}
          </div>
          <div
            className={`mt-0.5 font-medium text-sm ${sold ? "line-through opacity-60" : ""}`}
          >
            Corolla XEi 2022
          </div>
        </div>
        {sold ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: "#E7F6EC", color: "#166534" }}
          >
            <CheckCircle2 className="h-3 w-3" /> NF-e emitida
          </span>
        ) : (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: "#FCEBEB", color: "#991B1B" }}
          >
            Quente
          </span>
        )}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {sold
          ? "Chave NF-e 3526 0710 · RENAVE atualizado"
          : "Atribuído a Miguel · Etapa: Qualificado"}
      </div>
    </div>
  );
}

/** Full hero mockup: bubble -> arrow -> lead card */
export function HeroMockup() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <ChatBubble />
      <div className="flex justify-center py-3">
        <ArrowDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <LeadCard />
    </div>
  );
}

/** One of the 3 scrollytelling states */
export function StageCard({ stage }: { stage: 0 | 1 | 2 }) {
  return (
    <motion.div
      key={stage}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border border-border bg-card p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <ChatBubble />
      {stage > 0 && (
        <>
          <div className="flex justify-center py-3">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <LeadCard sold={stage === 2} />
        </>
      )}
    </motion.div>
  );
}
