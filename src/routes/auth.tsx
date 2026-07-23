import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { acceptWorkspaceInvitation } from "@/lib/workspace.functions";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft, UserPlus, ShieldCheck, RefreshCw } from "lucide-react";

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("password should contain") || m.includes("weakpassword") || m.includes("password is known") || m.includes("pwned") || m.includes("compromised"))
    return "Senha muito fraca ou vazada. Use pelo menos 8 caracteres com letras maiúsculas, minúsculas, números e símbolos.";
  if (m.includes("password should be at least")) return "A senha deve ter pelo menos 6 caracteres.";
  if (m.includes("invalid login credentials")) return "Email ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu email antes de entrar.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Este email já está cadastrado. Faça login.";
  if (m.includes("invalid email")) return "Email inválido.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (m.includes("network")) return "Falha de conexão. Verifique sua internet.";
  return msg;
}

function newChallenge() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { invite } = Route.useSearch();
  const acceptInvite = useServerFn(acceptWorkspaceInvitation);
  const [loading, setLoading] = useState(false);
  const [existingSession, setExistingSession] = useState<null | { email: string | null }>(null);
  const [inviteAccepted, setInviteAccepted] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [challenge, setChallenge] = useState(() => newChallenge());
  const [captchaInput, setCaptchaInput] = useState("");
  const requiresCaptcha = failCount >= 2;

  function refreshChallenge() {
    setChallenge(newChallenge());
    setCaptchaInput("");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setExistingSession({ email: data.session.user.email ?? null });
      }
    });
  }, []);

  async function acceptInviteIfNeeded() {
    if (!invite || inviteAccepted) return;
    await acceptInvite({ data: { token: invite } });
    setInviteAccepted(true);
    toast.success("Convite aceito. Você já está no workspace.");
  }

  async function handleContinue() {
    try {
      setLoading(true);
      await acceptInviteIfNeeded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aceitar convite");
      setLoading(false);
      return;
    }
    navigate({ to: "/app" });
  }

  async function handleSignOutExisting() {
    setLoading(true);
    await supabase.auth.signOut();
    localStorage.removeItem("lupus:lastActivity");
    localStorage.removeItem("lupus:sessionStart");
    setExistingSession(null);
    setInviteAccepted(false);
    setLoading(false);
  }


  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth" + (invite ? `?invite=${encodeURIComponent(invite)}` : ""),
    });
    if (result.error) {
      toast.error("Falha no login com Google");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    try {
      await acceptInviteIfNeeded();
      navigate({ to: "/app" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aceitar convite");
      setLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent<HTMLFormElement>, mode: "signin" | "signup") {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "");
    if (mode === "signup" || requiresCaptcha) {
      if (parseInt(captchaInput, 10) !== challenge.answer) {
        toast.error("Verificação de segurança incorreta. Resolva o desafio.");
        refreshChallenge();
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin + "/auth" + (invite ? `?invite=${encodeURIComponent(invite)}` : ""),
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Redirecionando...");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      setFailCount(0);
      await acceptInviteIfNeeded();
      navigate({ to: "/app" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erro na autenticação";
      toast.error(translateAuthError(raw));
      setFailCount((c) => c + 1);
      refreshChallenge();
    } finally {
      setLoading(false);
    }
  }

  function CaptchaField() {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <Label className="flex items-center gap-1.5 text-xs font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Verificação de segurança
        </Label>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono tabular-nums select-none">
            {challenge.a} + {challenge.b} = ?
          </span>
          <Input
            type="number"
            inputMode="numeric"
            value={captchaInput}
            onChange={(e) => setCaptchaInput(e.target.value)}
            placeholder="Resposta"
            className="h-9 w-24"
            required
          />
          <Button type="button" variant="ghost" size="icon" onClick={refreshChallenge} className="h-9 w-9" aria-label="Novo desafio">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden md:flex flex-col justify-between p-10 relative overflow-hidden bg-sidebar">
        <div className="absolute inset-0 -z-10 opacity-40">
          <div className="absolute -top-24 -left-24 h-[400px] w-[400px] rounded-full bg-primary/40 blur-[100px]" />
          <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-accent/30 blur-[100px]" />
        </div>
        <Link to="/" className="flex items-center gap-2 text-sidebar-foreground">
          <div className="h-9 w-9 rounded-lg overflow-hidden border border-sidebar-border">
            <img src="/lupus-logo.jpeg" alt="Lupus" className="h-full w-full object-cover" />
          </div>
          <span className="font-semibold">Lupus CRM</span>
        </Link>
        <div>
          <h2 className="text-3xl font-bold text-sidebar-foreground leading-tight">
            Toda venda começa<br />
            com uma <span className="text-gradient-brand">conversa.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-sm">
            Pipeline visual, inbox omnichannel e IA nativa. Multi-tenant, seguro e pronto para escalar.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} Lupus CRM</div>
      </div>

      {/* Right auth panel */}
      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Bem-vindo</h1>
          <p className="text-sm text-muted-foreground mt-1">Entre ou crie sua conta para continuar.</p>

          {invite && (
            <div className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-primary">
                <UserPlus className="h-4 w-4" /> Convite de workspace
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Use o mesmo email que recebeu o convite para entrar diretamente na equipe.
              </p>
            </div>
          )}

          {existingSession && (
            <div className="mt-6 rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-foreground">
                Você já está autenticado{existingSession.email ? ` como ` : "."}
                {existingSession.email && <span className="font-medium">{existingSession.email}</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Por segurança, confirme se deseja continuar nesta sessão ou saia para entrar com outra conta.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={handleContinue} disabled={loading} className="gradient-brand">
                  Continuar
                </Button>
                <Button size="sm" variant="outline" onClick={handleSignOutExisting} disabled={loading}>
                  Sair e trocar de conta
                </Button>
              </div>
            </div>
          )}


          <Button onClick={handleGoogle} disabled={loading} variant="outline" className="w-full mt-6 h-11">
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .55 4.1 1.6l3-3C17.4 1.7 14.9.5 12 .5 7.3.5 3.2 3.2 1.3 7.2l3.5 2.7C5.7 7 8.6 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.5h6.5c-.3 1.5-1.2 2.7-2.5 3.6l3.5 2.7c2.1-1.9 3.5-4.8 3.5-8.5z"/><path fill="#FBBC05" d="M4.8 14.4c-.3-.9-.5-1.8-.5-2.8s.2-1.9.5-2.8L1.3 6.1C.5 7.9 0 9.9 0 12s.5 4.1 1.3 5.9l3.5-2.7z"/><path fill="#34A853" d="M12 24c3 0 5.5-1 7.4-2.8l-3.5-2.7c-1 .7-2.3 1.1-3.9 1.1-3.4 0-6.3-2-7.2-4.9l-3.5 2.7C3.2 20.8 7.3 24 12 24z"/></svg>
            Continuar com Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={(e) => handleEmail(e, "signin")} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="e1">Email</Label>
                  <Input id="e1" name="email" type="email" required placeholder="voce@empresa.com" />
                </div>
                <div>
                  <Label htmlFor="p1">Senha</Label>
                  <Input id="p1" name="password" type="password" required placeholder="••••••••" />
                </div>
                {requiresCaptcha && <CaptchaField />}
                <Button type="submit" disabled={loading} className="w-full gradient-brand text-primary-foreground border-0 h-11">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4 mr-2" /> Entrar</>}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={(e) => handleEmail(e, "signup")} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="n2">Nome completo</Label>
                  <Input id="n2" name="fullName" required placeholder="Seu nome" />
                </div>
                <div>
                  <Label htmlFor="e2">Email</Label>
                  <Input id="e2" name="email" type="email" required placeholder="voce@empresa.com" />
                </div>
                <div>
                  <Label htmlFor="p2">Senha</Label>
                  <Input id="p2" name="password" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" />
                </div>
                <Button type="submit" disabled={loading} className="w-full gradient-brand text-primary-foreground border-0 h-11">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
