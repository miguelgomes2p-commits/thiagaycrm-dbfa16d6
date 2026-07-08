import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles, User as UserIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/ai")({
  component: AIAssistant,
});

const SUGGESTIONS = [
  "Resuma minhas conversas abertas",
  "Escreva um email de follow-up para um lead frio",
  "Sugira 3 mensagens iniciais para WhatsApp",
  "Como posso melhorar minha conversão?",
];

function AIAssistant() {
  const [input, setInput] = useState("");
  const [authHeader, setAuthHeader] = useState<string | undefined>();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthHeader(data.session?.access_token ? `Bearer ${data.session.access_token}` : undefined);
    });
  }, []);

  const { messages, sendMessage, status, error } = useChat({
    api: "/api/ai/chat",
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });

  useEffect(() => { if (error) toast.error(error.message); }, [error]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const busy = status === "streaming" || status === "submitted";

  async function submit(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl gradient-brand grid place-items-center">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Assistente IA</h1>
            <p className="text-xs text-muted-foreground">Powered by Lovable AI · Gemini</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <Sparkles className="h-10 w-10 mx-auto text-primary opacity-60 mb-4" />
              <h2 className="text-xl font-semibold">Como posso ajudar hoje?</h2>
              <p className="text-sm text-muted-foreground mt-1">Peça resumos, escreva mensagens, gere propostas, analise leads.</p>
              <div className="grid sm:grid-cols-2 gap-2 mt-8 max-w-xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-left card-elevated p-3 text-sm hover:border-primary/50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => {
            const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
            return (
              <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role !== "user" && (
                  <div className="h-8 w-8 rounded-lg gradient-brand grid place-items-center shrink-0">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div className={cn(
                  "max-w-2xl rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                  m.role === "user" ? "gradient-brand text-primary-foreground" : "card-elevated"
                )}>
                  {text || <span className="opacity-60 italic">…</span>}
                </div>
                {m.role === "user" && (
                  <div className="h-8 w-8 rounded-lg bg-surface border border-border grid place-items-center shrink-0">
                    <UserIcon className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Pergunte qualquer coisa sobre suas vendas..."
            disabled={busy}
            className="h-11"
          />
          <Button onClick={() => submit()} disabled={busy || !input.trim()} className="h-11 gradient-brand text-primary-foreground border-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
