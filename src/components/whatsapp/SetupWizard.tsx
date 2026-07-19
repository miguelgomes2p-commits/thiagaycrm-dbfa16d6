import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Building2,
  AppWindow,
  MessageCircle,
  Webhook,
  KeyRound,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StepId = "business" | "app" | "product" | "webhook" | "token" | "connect";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  webhookUrl?: string;
  verifyToken?: string;
  onConnect: (values: {
    label: string;
    displayNumber: string;
    phoneNumberId: string;
    wabaId: string;
    appId?: string;
    accessToken: string;
  }) => void;
  connecting?: boolean;
}

const STEPS: {
  id: StepId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "business", title: "Meta Business", icon: Building2 },
  { id: "app", title: "Criar App", icon: AppWindow },
  { id: "product", title: "Produto WhatsApp", icon: MessageCircle },
  { id: "webhook", title: "Webhook", icon: Webhook },
  { id: "token", title: "Token permanente", icon: KeyRound },
  { id: "connect", title: "Conectar no CRM", icon: Rocket },
];

export function WhatsappSetupWizard({
  open,
  onOpenChange,
  webhookUrl,
  verifyToken,
  onConnect,
  connecting,
}: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const goNext = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const goPrev = () => setStepIdx((i) => Math.max(i - 1, 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Conectar WhatsApp Business — Guia passo a passo
          </DialogTitle>
        </DialogHeader>

        {/* Progress rail */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const done = i < stepIdx;
              const active = i === stepIdx;
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex items-center gap-1 flex-1 last:flex-none">
                  <button
                    onClick={() => setStepIdx(i)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 px-2 py-1 rounded-md transition min-w-0",
                      active && "text-primary",
                      !active && !done && "text-muted-foreground hover:text-foreground",
                      done && "text-success",
                    )}
                  >
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full grid place-items-center border-2 shrink-0",
                        active && "border-primary bg-primary/10",
                        done && "border-success bg-success/10",
                        !active && !done && "border-border",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className="text-[10px] font-medium hidden sm:block truncate max-w-[80px]">
                      {s.title}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn("h-0.5 flex-1 rounded", done ? "bg-success" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step.id === "business" && <StepBusiness />}
          {step.id === "app" && <StepApp />}
          {step.id === "product" && <StepProduct />}
          {step.id === "webhook" && <StepWebhook webhookUrl={webhookUrl} verifyToken={verifyToken} />}
          {step.id === "token" && <StepToken />}
          {step.id === "connect" && <StepConnect onSubmit={onConnect} loading={!!connecting} />}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
          <Button variant="ghost" onClick={goPrev} disabled={stepIdx === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Passo {stepIdx + 1} de {STEPS.length}
          </span>
          {stepIdx < STEPS.length - 1 ? (
            <Button onClick={goNext} className="gradient-brand text-primary-foreground border-0">
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Steps ---------- */

function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 text-sm">{children}</div>;
}

function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
    >
      <ExternalLink className="h-3.5 w-3.5" /> {label}
    </a>
  );
}

function Ol({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2 list-decimal list-inside marker:text-primary marker:font-semibold">
      {items.map((it, i) => (
        <li key={i} className="leading-relaxed">
          {it}
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/90">
      💡 {children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground/90">
      ⚠️ {children}
    </div>
  );
}

function StepBusiness() {
  return (
    <Section>
      <div>
        <h3 className="text-base font-semibold mb-1">1. Meta Business Portfolio</h3>
        <p className="text-muted-foreground">
          Você já tem <strong>Lupus Assessoria</strong> criada no Business Manager — ✅ esse passo está feito.
        </p>
      </div>
      <OpenLink href="https://business.facebook.com" label="Abrir Meta Business Suite" />
      <Tip>
        Se um dia precisar, um Business Portfolio é criado em <em>business.facebook.com → Criar conta</em>. Um usuário do Facebook pode ter até 2 portfolios.
      </Tip>
      <div>
        <p className="font-medium mb-1">Confira antes de avançar:</p>
        <Ol
          items={[
            <>Você está logado no Facebook pessoal <strong>vinculado</strong> ao portfolio Lupus.</>,
            <>Seu perfil tem função de <strong>Admin</strong> no portfolio (Configurações → Pessoas).</>,
          ]}
        />
      </div>
    </Section>
  );
}

function StepApp() {
  return (
    <Section>
      <div>
        <h3 className="text-base font-semibold mb-1">2. Criar o App em Meta for Developers</h3>
        <p className="text-muted-foreground">
          O App é o "container" que conecta seu CRM à API do WhatsApp.
        </p>
      </div>
      <OpenLink href="https://developers.facebook.com/apps" label="Abrir Meta for Developers → Meus Apps" />
      <Ol
        items={[
          <>Clique em <strong>Criar app</strong> (canto superior direito).</>,
          <>Em <em>Detalhes do app</em>: dê um nome como <code className="text-xs bg-muted px-1 py-0.5 rounded">Lupus CRM</code> e um email de contato.</>,
          <>Em <em>Caso de uso</em>: selecione <strong>"Outro"</strong> e clique <em>Avançar</em>.</>,
          <>Em <em>Tipo de app</em>: selecione <strong>"Empresarial" (Business)</strong> e clique <em>Avançar</em>.</>,
          <>Em <em>Portfólio empresarial</em>: escolha <strong>Lupus Assessoria</strong> e finalize com <em>Criar app</em>.</>,
          <>A Meta pode pedir sua senha do Facebook para confirmar.</>,
        ]}
      />
      <Tip>
        Você será direcionado ao painel do App. Anote o <strong>App ID</strong> exibido no topo — é opcional no CRM, mas útil.
      </Tip>
    </Section>
  );
}

function StepProduct() {
  return (
    <Section>
      <div>
        <h3 className="text-base font-semibold mb-1">3. Abrir o API Setup e pegar os IDs</h3>
        <p className="text-muted-foreground">
          A Meta mudou a navegação: em muitos apps não aparece um menu lateral chamado <strong>WhatsApp</strong>. O caminho atual fica dentro do caso de uso.
        </p>
      </div>
      <Ol
        items={[
          <>No painel do App, fique em <strong>Personalizar caso de uso → Conectar-se com os clientes pelo WhatsApp</strong>.</>,
          <>Abra a aba/seção <strong>Início rápido</strong> ou <strong>Quickstart</strong>.</>,
          <>
            Clique no botão azul <strong>"Começar a usar a API"</strong> ou <strong>"Start using the API"</strong>.
          </>,
          <>Você será levado para a tela <strong>API Setup</strong>. Se aparecer a etapa de teste, procure o link/aba <strong>Configuração de produção</strong>.</>,
          <>Na área <strong>API Setup</strong>, conecte o app a uma <strong>WhatsApp Business Account</strong>: selecione a conta existente da Lupus ou crie uma nova.</>,
          <>Depois de conectar, copie o <strong>WhatsApp Business Account ID</strong> — esse é o <strong>WABA ID</strong>.</>,
          <>Na seção <strong>Enviar e receber mensagens</strong>, escolha o número no campo <strong>De / From</strong>. Perto desse número aparece o <strong>Phone Number ID</strong>.</>,
          <>Guarde estes dois valores para colar no CRM:
            <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-xs">
              <li><strong>Phone number ID</strong> (identificador de número)</li>
              <li><strong>WhatsApp Business Account ID</strong> (WABA ID)</li>
            </ul>
          </>,
        ]}
      />
      <Tip>
        Se você não vê “WhatsApp” em lugar nenhum, procure por <strong>Quickstart</strong>, <strong>API Setup</strong> ou pelo botão <strong>Start using the API</strong>. Esses são os nomes atuais usados pela Meta em 2026.
      </Tip>
      <Warn>
        O número de teste só serve para testar com destinatários cadastrados. Para clientes reais, use a área de <strong>Configuração de produção</strong> e o número comercial registrado.
      </Warn>
    </Section>
  );
}

function StepWebhook({ webhookUrl, verifyToken }: { webhookUrl?: string; verifyToken?: string }) {
  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("Copiado");
  };
  return (
    <Section>
      <div>
        <h3 className="text-base font-semibold mb-1">4. Configurar o Webhook</h3>
        <p className="text-muted-foreground">
          O webhook é o endereço que a Meta chama toda vez que uma mensagem chega. O CRM já gera os dois valores por número — se você <strong>ainda não conectou nenhum número</strong>, pule para o passo 6, conecte primeiro e volte aqui.
        </p>
      </div>

      {webhookUrl && verifyToken ? (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Callback URL</Label>
            <div className="flex gap-1 mt-1">
              <Input readOnly value={webhookUrl} className="h-9 text-xs font-mono" />
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => copy(webhookUrl)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Verify Token</Label>
            <div className="flex gap-1 mt-1">
              <Input readOnly value={verifyToken} className="h-9 text-xs font-mono" />
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => copy(verifyToken)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Warn>Nenhum número conectado ainda — conclua o passo 6 primeiro para o CRM gerar sua Callback URL e Verify Token.</Warn>
      )}

      <Ol
        items={[
          <>No App Meta, abra <strong>Personalizar caso de uso → Conectar-se com os clientes pelo WhatsApp → Configuração</strong>. Se não aparecer, entre pelo <strong>API Setup</strong> e procure a seção <strong>Webhooks</strong>.</>,
          <>Na seção <strong>Webhook</strong>, clique em <em>Editar</em> ao lado de "Callback URL".</>,
          <>Cole a <strong>Callback URL</strong> e o <strong>Verify Token</strong> exibidos acima.</>,
          <>Clique <em>Verificar e salvar</em> — deve aparecer ✓ em verde.</>,
          <>Em "Campos de webhook", clique em <em>Gerenciar</em> e assine o campo <strong>messages</strong>.</>,
          <>Opcional: assine também <code className="text-xs bg-muted px-1 py-0.5 rounded">message_template_status_update</code>.</>,
        ]}
      />
    </Section>
  );
}

function StepToken() {
  return (
    <Section>
      <div>
        <h3 className="text-base font-semibold mb-1">5. Gerar Access Token permanente</h3>
        <p className="text-muted-foreground">
          O token temporário da tela API Setup expira em <strong>24 horas</strong> e derruba a integração. Para produção, gere um via System User.
        </p>
      </div>
      <OpenLink href="https://business.facebook.com/settings/system-users" label="Abrir Business Settings → System Users" />
      <Ol
        items={[
          <>Confirme que está no portfólio <strong>Lupus Assessoria</strong> (topo da página).</>,
          <>Menu lateral: <strong>Usuários → Usuários do sistema</strong>. Clique <em>Adicionar</em>.</>,
          <>Nome: <code className="text-xs bg-muted px-1 py-0.5 rounded">lupus-crm-bot</code> · Função do sistema: <strong>Admin</strong>. Confirme.</>,
          <>Selecione o System User criado → botão <strong>"Adicionar ativos"</strong> → aba <strong>Apps</strong> → escolha <em>Lupus CRM</em> → marque <strong>Controle total</strong> → <em>Salvar</em>.</>,
          <>Adicione também os ativos <strong>Contas do WhatsApp</strong> (WABA da Lupus, controle total) e <strong>Páginas</strong> se aplicável.</>,
          <>Ainda no System User, clique <strong>"Gerar novo token"</strong>.</>,
          <>Selecione o app <em>Lupus CRM</em>. Em <strong>Expiração</strong> escolha <strong>Nunca</strong>.</>,
          <>Marque as permissões:
            <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-xs">
              <li><code className="bg-muted px-1 rounded">whatsapp_business_messaging</code></li>
              <li><code className="bg-muted px-1 rounded">whatsapp_business_management</code></li>
              <li><code className="bg-muted px-1 rounded">business_management</code> (opcional, para sincronizar templates)</li>
            </ul>
          </>,
          <>Clique <em>Gerar token</em> → <strong>copie imediatamente</strong> (só é mostrado uma vez).</>,
        ]}
      />
      <Warn>
        Guarde esse token como uma senha. Ele começa com <code className="text-xs bg-muted px-1 py-0.5 rounded">EAAG…</code> e concede acesso total ao seu WhatsApp Business.
      </Warn>
    </Section>
  );
}

function StepConnect({
  onSubmit,
  loading,
}: {
  onSubmit: (v: {
    label: string;
    displayNumber: string;
    phoneNumberId: string;
    wabaId: string;
    appId?: string;
    accessToken: string;
  }) => void;
  loading: boolean;
}) {
  return (
    <Section>
      <div>
        <h3 className="text-base font-semibold mb-1">6. Conectar no CRM</h3>
        <p className="text-muted-foreground">
          Cole os valores que você copiou nos passos 3 e 5. O CRM valida com a Meta antes de salvar.
        </p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          onSubmit({
            label: String(fd.get("label")),
            displayNumber: String(fd.get("displayNumber")),
            phoneNumberId: String(fd.get("phoneNumberId")),
            wabaId: String(fd.get("wabaId")),
            appId: String(fd.get("appId") || "") || undefined,
            accessToken: String(fd.get("accessToken")),
          });
        }}
      >
        <div>
          <Label>Rótulo interno *</Label>
          <Input name="label" required placeholder="Ex: Vendas Lupus" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Número (exibição) *</Label>
            <Input name="displayNumber" required placeholder="+55 11 91234-5678" />
          </div>
          <div>
            <Label>App ID (opcional)</Label>
            <Input name="appId" placeholder="123..." />
          </div>
        </div>
        <div>
          <Label>Phone Number ID * <span className="text-muted-foreground font-normal">(passo 3)</span></Label>
          <Input name="phoneNumberId" required placeholder="123456789012345" className="font-mono text-xs" />
        </div>
        <div>
          <Label>WABA ID * <span className="text-muted-foreground font-normal">(passo 3)</span></Label>
          <Input name="wabaId" required placeholder="987654321098765" className="font-mono text-xs" />
        </div>
        <div>
          <Label>Access Token permanente * <span className="text-muted-foreground font-normal">(passo 5)</span></Label>
          <textarea
            name="accessToken"
            required
            placeholder="EAAG..."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs resize-none"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full gradient-brand text-primary-foreground border-0">
          {loading ? "Validando com Meta…" : "Conectar número"}
        </Button>
      </form>
      <Tip>Depois de conectar, volte ao passo 4 para colar a Callback URL/Verify Token gerados no painel Meta.</Tip>
    </Section>
  );
}
