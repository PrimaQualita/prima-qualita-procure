// @ts-nocheck - Propriedades do usuário podem não existir no schema atual
import { useState, useEffect } from "react";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

const getPageTitle = (pathname: string) => {
  const routes: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/processos-compras": "Processos de Compras",
    "/cotacoes": "Cotação de Preços",
    "/selecoes": "Seleção de Fornecedores",
    "/credenciamentos": "Credenciamento",
    "/contratacoes-especificas": "Contratações Específicas",
    "/contratos": "Contratos",
    "/usuarios": "Cadastro de Usuários",
    "/fornecedores": "Cadastro de Fornecedores",
    "/contatos": "Contato",
    "/auditoria": "Log de Auditoria",
    "/compliance": "Compliance",
    "/perfil": "Meu Perfil",
  };
  return routes[pathname] || "Sistema de Compras";
};

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isGestor, setIsGestor] = useState(false);
  const [isCompliance, setIsCompliance] = useState(false);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserProfile();
    } else if (user === null && !loading) {
      navigate("/auth");
    }
  }, [user, loading]);

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const { data: fornecedorData } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fornecedorData) {
        navigate("/portal-fornecedor");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
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
      setIsCompliance(profileData?.compliance || false);
      setIsResponsavelLegal(profileData?.responsavel_legal || false);

      if (profileData?.primeiro_acesso || profileData?.senha_temporaria) {
        navigate("/troca-senha");
        return;
      }

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar 
          isGestor={isGestor} 
          profile={profile} 
          isCompliance={isCompliance}
          isResponsavelLegal={isResponsavelLegal}
        />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b bg-background flex items-center px-6 gap-4">
            <SidebarTrigger />
            <h1 className="text-2xl font-bold text-foreground">{getPageTitle(location.pathname)}</h1>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
