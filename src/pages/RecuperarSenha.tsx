import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RequisitosSenha } from "@/components/RequisitosSenha";
import { validarSenhaForte } from "@/lib/validators";
import { Eye, EyeOff, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import primaLogo from "@/assets/prima-qualita-logo.png";

const RecuperarSenha = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState<"email" | "sent" | "reset">("email");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validacaoSenha, setValidacaoSenha] = useState(validarSenhaForte(""));

  useEffect(() => {
    // Verificar se o usuário chegou através do link de recuperação
    const checkRecoverySession = async () => {
      // Detectar hash fragment do URL (tokens do Supabase)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      if (accessToken && type === 'recovery') {
        // Usuário veio do link de recuperação, mostrar formulário de nova senha
        setStep("reset");
        return;
      }

      // Verificar também via query params (caso o redirect seja diferente)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      
      if (code) {
        try {
          // Trocar o code por uma sessão
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            setStep("reset");
            return;
          }
        } catch (e) {
          console.error("Erro ao processar código:", e);
        }
      }
    };

    checkRecoverySession();

    // Escutar eventos de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStep("reset");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Chamar nossa edge function personalizada
      const { data, error } = await supabase.functions.invoke('enviar-email-recuperacao', {
        body: {
          email: email,
          redirectTo: `${window.location.origin}/recuperar-senha`,
        },
      });

      if (error) throw error;

      setStep("sent");
      toast({
        title: "E-mail enviado!",
        description: "Verifique sua caixa de entrada e clique no link para redefinir sua senha.",
      });
    } catch (error: any) {
      console.error("Erro ao enviar email:", error);
      toast({
        title: "Erro ao enviar e-mail",
        description: error.message || "Não foi possível enviar o e-mail. Verifique o endereço informado.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    const validacao = validarSenhaForte(newPassword);
    if (!validacao.valida) {
      toast({
        title: "Senha fraca",
        description: "A senha deve atender a todos os requisitos de segurança.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Atualizar a senha do usuário autenticado via link
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // Obter o usuário atual para atualizar profile
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        await supabase
          .from("profiles")
          .update({
            primeiro_acesso: false,
            senha_temporaria: false,
          })
          .eq("id", user.id);
      }

      toast({
        title: "Senha alterada com sucesso!",
        description: "Você já pode fazer login com sua nova senha.",
      });

      // Fazer logout e redirecionar para login
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Erro ao redefinir senha",
        description: error.message || "Não foi possível redefinir a senha. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = (value: string) => {
    setNewPassword(value);
    setValidacaoSenha(validarSenhaForte(value));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-16" />
          </div>
          <CardTitle className="text-2xl text-center">
            {step === "reset" ? "Nova Senha" : "Recuperar Senha"}
          </CardTitle>
          <CardDescription className="text-center">
            {step === "email" && "Informe seu e-mail cadastrado para receber o link de recuperação"}
            {step === "sent" && "Verifique seu e-mail"}
            {step === "reset" && "Digite sua nova senha"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" && (
            <form onSubmit={handleSendEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail cadastrado</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar Link de Recuperação"}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/auth")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o login
              </Button>
            </form>
          )}

          {step === "sent" && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Enviamos um e-mail para <strong>{email}</strong> com um link para redefinir sua senha.
                </p>
                <p className="text-sm text-muted-foreground">
                  Clique no link do e-mail para continuar. Verifique também sua pasta de spam.
                </p>
              </div>
              
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setStep("email")}
              >
                Enviar novamente
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/auth")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o login
              </Button>
            </div>
          )}

          {step === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <RequisitosSenha validacao={validacaoSenha} />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Redefinindo..." : "Redefinir Senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RecuperarSenha;
