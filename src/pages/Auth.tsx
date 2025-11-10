import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { validarCPF, mascaraCPF, validarSenhaForte } from "@/lib/validators";
import { RequisitosSenha } from "@/components/RequisitosSenha";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [cpf, setCpf] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState(""); // Email ou CPF
  const [validacaoSenha, setValidacaoSenha] = useState(validarSenhaForte(""));

  // Removed auto-redirect to prevent login screen issues
  // User must explicitly login

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Verificar se é CPF ou email
      const isCPF = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(loginIdentifier);
      let emailToLogin = loginIdentifier;

      if (isCPF) {
        // Buscar email pelo CPF
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("email")
          .eq("cpf", loginIdentifier)
          .single();

        if (profileError || !profile) {
          throw new Error("CPF não encontrado no sistema");
        }
        emailToLogin = profile.email;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToLogin,
        password,
      });

      if (error) throw error;

      if (data.session) {
        // Verificar se é primeiro acesso
        const { data: profile } = await supabase
          .from("profiles")
          .select("primeiro_acesso, senha_temporaria")
          .eq("id", data.session.user.id)
          .single();

        if (profile?.primeiro_acesso || profile?.senha_temporaria) {
          toast({
            title: "Primeiro acesso detectado",
            description: "Por favor, crie uma nova senha.",
          });
          navigate("/troca-senha");
        } else {
          // Update last login
          await supabase
            .from("profiles")
            .update({ data_ultimo_login: new Date().toISOString() })
            .eq("id", data.session.user.id);

          toast({
            title: "Login realizado com sucesso!",
            description: "Bem-vindo ao Sistema de Compras.",
          });
          navigate("/dashboard");
        }
      }
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message || "Email/CPF ou senha incorretos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    // Validar senha forte
    const validacao = validarSenhaForte(password);
    if (!validacao.valida) {
      toast({
        title: "Senha fraca",
        description: "A senha deve atender a todos os requisitos de segurança.",
        variant: "destructive",
      });
      return;
    }

    // Validar CPF
    if (!validarCPF(cpf)) {
      toast({
        title: "CPF Inválido",
        description: "Por favor, informe um CPF válido.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Verificar se já existe um perfil com este CPF
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("email, cpf")
        .or(`email.eq.${email},cpf.eq.${cpf}`)
        .maybeSingle();

      if (existingProfile) {
        toast({
          title: "Usuário já cadastrado",
          description: `Já existe um cadastro com este ${
            existingProfile.email === email ? "e-mail" : "CPF"
          }. Por favor, faça login.`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nome_completo: nomeCompleto,
            cpf,
          },
        },
      });

      if (error) {
        // Tratamento específico para usuário já existente no auth
        if (error.message.includes("already registered") || error.message.includes("User already registered")) {
          toast({
            title: "E-mail já cadastrado",
            description: "Este e-mail já está em uso. Tente fazer login ou use outro e-mail.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        throw error;
      }

      if (data.user) {
        // Create profile
        const { error: profileError } = await supabase.from("profiles").insert([
          {
            id: data.user.id,
            nome_completo: nomeCompleto,
            cpf,
            email,
          },
        ]);

        if (profileError) {
          // Se falhar ao criar perfil, tentar deletar o usuário auth criado
          console.error("Erro ao criar perfil:", profileError);
          toast({
            title: "Erro no cadastro",
            description: "Houve um problema ao criar seu perfil. Tente novamente.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Create role (default: colaborador)
        const { error: roleError } = await supabase.from("user_roles").insert([
          {
            user_id: data.user.id,
            role: "colaborador",
          },
        ]);

        if (roleError) {
          console.error("Erro ao criar role:", roleError);
        }

        toast({
          title: "Cadastro realizado com sucesso!",
          description: "Você já pode fazer login.",
        });

        // Limpar campos
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setNomeCompleto("");
        setCpf("");
        setValidacaoSenha(validarSenhaForte(""));
      }
    } catch (error: any) {
      console.error("Erro completo:", error);
      toast({
        title: "Erro no cadastro",
        description: error.message || "Ocorreu um erro ao criar sua conta.",
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
          <CardTitle className="text-2xl text-center">Sistema de Compras</CardTitle>
          <CardDescription className="text-center">
            Portal de Gestão de Processos de Compras
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Cadastro</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-identifier">E-mail ou CPF</Label>
                  <Input
                    id="login-identifier"
                    type="text"
                    placeholder="seu@email.com ou 000.000.000-00"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <div className="mb-4 p-3 bg-muted/50 rounded-lg border text-center">
                <p className="text-sm text-muted-foreground">
                  Novo fornecedor?{" "}
                  <Button
                    variant="link"
                    className="p-0 h-auto text-primary"
                    onClick={() => navigate("/cadastro-fornecedor")}
                  >
                    Clique aqui para o cadastro completo
                  </Button>
                </p>
              </div>
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome Completo</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Seu nome completo"
                    value={nomeCompleto}
                    onChange={(e) => setNomeCompleto(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-cpf">CPF</Label>
                  <Input
                    id="signup-cpf"
                    type="text"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(mascaraCPF(e.target.value))}
                    required
                    maxLength={14}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">E-mail</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setValidacaoSenha(validarSenhaForte(e.target.value));
                    }}
                    required
                    minLength={8}
                  />
                </div>
                
                <RequisitosSenha validacao={validacaoSenha} />
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirmar Senha</Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Cadastrando..." : "Cadastrar"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
