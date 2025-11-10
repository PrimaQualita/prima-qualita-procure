import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const TrocaSenha = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");

  const handleTrocaSenha = async (e: React.FormEvent) => {
    e.preventDefault();

    if (novaSenha !== confirmaSenha) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    if (novaSenha.length < 6) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter no mínimo 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Atualizar senha do usuário
      const { error: updateError } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (updateError) throw updateError;

      // Obter usuário atual
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Atualizar flag de primeiro acesso
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            primeiro_acesso: false,
            senha_temporaria: false,
            data_ultimo_login: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (profileError) throw profileError;
      }

      toast({
        title: "Senha alterada com sucesso!",
        description: "Você será redirecionado para o sistema.",
      });

      setTimeout(() => {
        navigate("/dashboard");
      }, 1500);
    } catch (error: any) {
      toast({
        title: "Erro ao alterar senha",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-16" />
          </div>
          <CardTitle className="text-2xl text-center">Primeiro Acesso</CardTitle>
          <CardDescription className="text-center">
            Por segurança, você precisa criar uma nova senha
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Esta é sua primeira vez no sistema. Por favor, crie uma nova senha segura para
              proteger sua conta.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleTrocaSenha} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova Senha</Label>
              <Input
                id="nova-senha"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirma-senha">Confirmar Nova Senha</Label>
              <Input
                id="confirma-senha"
                type="password"
                placeholder="Digite a senha novamente"
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Alterando senha..." : "Confirmar Nova Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrocaSenha;
