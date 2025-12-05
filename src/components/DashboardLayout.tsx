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

// Cache GLOBAL do perfil para evitar flash de loading entre páginas
let cachedUser: User | null = null;
let cachedProfile: any = null;
let cachedIsGestor: boolean = false;
let cachedIsCompliance: boolean = false;
let cachedIsResponsavelLegal: boolean = false;
let profileLoaded: boolean = false;

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  // Usa cache imediatamente se disponível
  const [user, setUser] = useState<User | null>(cachedUser);
  const [profile, setProfile] = useState<any>(cachedProfile);
  const [isGestor, setIsGestor] = useState(cachedIsGestor);
  const [isCompliance, setIsCompliance] = useState(cachedIsCompliance);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(cachedIsResponsavelLegal);
  const [loading, setLoading] = useState(!profileLoaded);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      cachedUser = newUser;
      
      if (event === 'SIGNED_OUT') {
        // Limpa cache no logout
        cachedUser = null;
        cachedProfile = null;
        cachedIsGestor = false;
        cachedIsCompliance = false;
        cachedIsResponsavelLegal = false;
        profileLoaded = false;
        setProfile(null);
        setIsGestor(false);
        setIsCompliance(false);
        setIsResponsavelLegal(false);
      }
    });

    // Se já tem cache, não precisa buscar sessão de novo
    if (profileLoaded && cachedUser) {
      setLoading(false);
      return () => subscription.unsubscribe();
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      cachedUser = sessionUser;
      
      if (!sessionUser) {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Se já carregou perfil, não carrega de novo
    if (profileLoaded) {
      setLoading(false);
      return;
    }
    
    if (user) {
      loadUserProfile();
    } else if (user === null && !loading) {
      navigate("/auth");
    }
  }, [user, loading]);

  const loadUserProfile = async () => {
    // Proteção dupla: se já carregou, não faz nada
    if (!user || profileLoaded) return;

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

      // Atualiza cache global
      cachedProfile = profileData;
      cachedIsCompliance = profileData?.compliance || false;
      cachedIsResponsavelLegal = profileData?.responsavel_legal || false;
      
      setProfile(profileData);
      setIsCompliance(cachedIsCompliance);
      setIsResponsavelLegal(cachedIsResponsavelLegal);

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
      
      cachedIsGestor = !!roleData;
      setIsGestor(cachedIsGestor);
      
      // Marca como carregado GLOBALMENTE
      profileLoaded = true;
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

  // Se tem cache, renderiza imediatamente sem loading
  if (profileLoaded && cachedProfile) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar 
            isGestor={isGestor || cachedIsGestor} 
            profile={profile || cachedProfile} 
            isCompliance={isCompliance || cachedIsCompliance}
            isResponsavelLegal={isResponsavelLegal || cachedIsResponsavelLegal}
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

  // Mostra loading apenas na primeira vez
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
