import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import primaLogo from "@/assets/prima-qualita-logo.png";
import {
  FileText,
  DollarSign,
  Users,
  Building2,
  UserCog,
  MessageSquare,
  LogOut,
  LayoutDashboard,
} from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isGestor, setIsGestor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserProfile();
    } else if (user === null && !loading) {
      // Only navigate if explicitly null and not loading
      navigate("/auth");
    }
  }, [user, loading]);

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      // PRIMEIRO: Verificar se é fornecedor
      const { data: fornecedorData } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fornecedorData) {
        // É fornecedor - redirecionar para portal
        navigate("/portal-fornecedor");
        return;
      }

      // SEGUNDO: Carregar profile de usuário interno
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        // Usuário não é fornecedor nem tem profile - acesso negado
        toast({
          title: "Acesso negado",
          description: "Usuário não autorizado a acessar o sistema.",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        navigate("/auth");
        return;
      }

      setProfile(profileData);

      // Check if first access
      if (profileData?.primeiro_acesso || profileData?.senha_temporaria) {
        navigate("/troca-senha");
        return;
      }

      // Check if user is gestor
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "gestor")
        .maybeSingle();

      if (roleError && roleError.code !== "PGRST116") throw roleError;
      setIsGestor(!!roleData);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar perfil",
        description: error.message,
        variant: "destructive",
      });
      await supabase.auth.signOut();
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Logout realizado",
        description: "Até logo!",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Erro ao fazer logout",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const menuItems = [
    {
      title: "Processos de Compras",
      description: "Gerencie todos os processos de compras por contrato e ano",
      icon: FileText,
      href: "/processos-compras",
      color: "from-primary to-primary/70",
    },
    {
      title: "Cotação de Preços",
      description: "Envie cotações e gerencie respostas de fornecedores",
      icon: DollarSign,
      href: "/cotacoes",
      color: "from-secondary to-secondary/70",
    },
    {
      title: "Seleção de Fornecedores",
      description: "Conduza processos de seleção e dispute de preços",
      icon: Users,
      href: "/selecoes",
      color: "from-accent to-accent/70",
    },
    {
      title: "Credenciamento",
      description: "Credenciamento de PJs médicas",
      icon: FileText,
      href: "/credenciamentos",
      color: "from-primary/70 to-accent/70",
    },
    {
      title: "Contratações Específicas",
      description: "Gerenciamento de contratações específicas",
      icon: FileText,
      href: "/contratacoes-especificas",
      color: "from-secondary/70 to-primary/70",
    },
    {
      title: "Contratos",
      description: "Processos enviados para contratação",
      icon: FileText,
      href: "/contratos",
      color: "from-accent/70 to-secondary/70",
    },
    {
      title: "Cadastro de Usuários",
      description: "Gerencie gestores e colaboradores do sistema",
      icon: UserCog,
      href: "/usuarios",
      color: "from-primary/80 to-secondary/80",
    },
    {
      title: "Cadastro de Fornecedores",
      description: "Visualize e gerencie cadastros de fornecedores",
      icon: Building2,
      href: "/fornecedores",
      color: "from-secondary/80 to-primary/80",
    },
    {
      title: "Contato",
      description: "Canal de comunicação com fornecedores",
      icon: MessageSquare,
      href: "/contatos",
      color: "from-accent/80 to-primary/60",
    },
  ];

  if (isGestor) {
    menuItems.push({
      title: "Log de Auditoria",
      description: "Visualize todas as ações realizadas no sistema",
      icon: LayoutDashboard,
      href: "/auditoria",
      color: "from-destructive/70 to-destructive/50",
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Sistema de Compras</h1>
              <p className="text-sm text-muted-foreground">Prima Qualitá Saúde</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{profile?.nome_completo}</p>
              <p className="text-xs text-muted-foreground">
                {isGestor ? "Gestor" : "Colaborador"}
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={handleLogout} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Bem-vindo ao Sistema de Compras
          </h2>
          <p className="text-muted-foreground">
            Selecione uma opção abaixo para começar a gerenciar seus processos
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item) => (
            <Card
              key={item.href}
              className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-2 hover:border-primary/50"
              onClick={() => navigate(item.href)}
            >
              <CardHeader>
                <div
                  className={`w-12 h-12 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                >
                  <item.icon className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl group-hover:text-primary transition-colors">
                  {item.title}
                </CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
