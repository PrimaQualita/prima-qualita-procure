// @ts-nocheck - Propriedades do usuário podem não existir no schema atual
import { useState, useEffect } from "react";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { clearCotacoesCache } from "@/pages/Cotacoes";
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
    "/gestao-storage": "Gestão de Storage",
  };
  return routes[pathname] || "Sistema de Compras";
};

// Rotas permitidas para Gerente de Contratos (quando é APENAS gerente de contratos)
const rotasGerenteContratos = ["/dashboard", "/processos-compras", "/contatos", "/perfil"];

// Rotas permitidas para Contabilidade (quando é APENAS contabilidade)
const rotasContabilidade = ["/dashboard", "/contabilidade", "/contatos", "/perfil"];

// Cache GLOBAL do perfil para evitar flash de loading entre páginas
let cachedUser: User | null = null;
let cachedProfile: any = null;
let cachedIsGestor: boolean = false;
let cachedIsCompliance: boolean = false;
let cachedIsResponsavelLegal: boolean = false;
let cachedIsGerenteContratos: boolean = false;
let cachedIsSuperintendenteExecutivo: boolean = false;
let cachedContratosVinculados: string[] = [];
let cachedIsColaborador: boolean = false;
let cachedIsContabilidade: boolean = false;
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
  const [isGerenteContratos, setIsGerenteContratos] = useState(cachedIsGerenteContratos);
  const [isSuperintendenteExecutivo, setIsSuperintendenteExecutivo] = useState(cachedIsSuperintendenteExecutivo);
  const [contratosVinculados, setContratosVinculados] = useState<string[]>(cachedContratosVinculados);
  const [isColaborador, setIsColaborador] = useState(cachedIsColaborador);
  const [isContabilidade, setIsContabilidade] = useState(cachedIsContabilidade);
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
        cachedIsGerenteContratos = false;
        cachedIsSuperintendenteExecutivo = false;
        cachedContratosVinculados = [];
        cachedIsColaborador = false;
        cachedIsContabilidade = false;
        profileLoaded = false;
        setProfile(null);
        setIsGestor(false);
        setIsCompliance(false);
        setIsResponsavelLegal(false);
        setIsGerenteContratos(false);
        setIsSuperintendenteExecutivo(false);
        setContratosVinculados([]);
        setIsColaborador(false);
        setIsContabilidade(false);
        
        // Limpa cache de outras páginas
        clearCotacoesCache();
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
      cachedIsSuperintendenteExecutivo = profileData?.superintendente_executivo || profileData?.gerente_financeiro || false;
      cachedIsContabilidade = profileData?.contabilidade || false;
      
      setProfile(profileData);
      setIsCompliance(cachedIsCompliance);
      setIsResponsavelLegal(cachedIsResponsavelLegal);
      setIsSuperintendenteExecutivo(cachedIsSuperintendenteExecutivo);
      setIsContabilidade(cachedIsContabilidade);

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

      // Verificar se é gestor ou colaborador (usuário interno com permissões completas)
      const { data: colaboradorData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["gestor", "colaborador"])
        .maybeSingle();

      const isUsuarioInterno = !!colaboradorData;
      
      // Verificar se é colaborador
      const { data: colaboradorRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "colaborador")
        .maybeSingle();
      
      cachedIsColaborador = !!colaboradorRole;
      setIsColaborador(cachedIsColaborador);

      // Verificar se é gerente de contratos (sempre verifica, independente de outros papéis)
      if (profileData?.gerente_contratos) {
        const { data: vinculos } = await supabase
          .from("gerentes_contratos_gestao")
          .select("contrato_gestao_id")
          .eq("usuario_id", user.id);

        if (vinculos && vinculos.length > 0) {
          cachedIsGerenteContratos = true;
          cachedContratosVinculados = vinculos.map(v => v.contrato_gestao_id);
          setIsGerenteContratos(true);
          setContratosVinculados(cachedContratosVinculados);
        }
      }
      
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

  // Verifica se é APENAS gerente de contratos (sem outros papéis)
  const temOutrosPapeis = (isGestor || cachedIsGestor) || 
                          (isColaborador || cachedIsColaborador) || 
                          (isCompliance || cachedIsCompliance) || 
                          (isResponsavelLegal || cachedIsResponsavelLegal) || 
                          (isSuperintendenteExecutivo || cachedIsSuperintendenteExecutivo) ||
                          (isContabilidade || cachedIsContabilidade);
  
  const apenasGerenteContratos = (isGerenteContratos || cachedIsGerenteContratos) && !temOutrosPapeis;

  // Verifica se é APENAS contabilidade (sem outros papéis)
  const temOutrosPapeisAlemContabilidade = (isGestor || cachedIsGestor) || 
                          (isColaborador || cachedIsColaborador) || 
                          (isCompliance || cachedIsCompliance) || 
                          (isResponsavelLegal || cachedIsResponsavelLegal) || 
                          (isSuperintendenteExecutivo || cachedIsSuperintendenteExecutivo) ||
                          (isGerenteContratos || cachedIsGerenteContratos);
  
  const apenasContabilidade = (isContabilidade || cachedIsContabilidade) && !temOutrosPapeisAlemContabilidade;

  // Proteção de rota para Gerente de Contratos e Contabilidade
  useEffect(() => {
    if (profileLoaded) {
      const rotaAtual = location.pathname;
      
      if (apenasGerenteContratos && !rotasGerenteContratos.includes(rotaAtual)) {
        toast({
          title: "Acesso não autorizado",
          description: "Você não tem permissão para acessar esta página.",
          variant: "destructive",
        });
        navigate("/dashboard");
      }
      
      if (apenasContabilidade && !rotasContabilidade.includes(rotaAtual)) {
        toast({
          title: "Acesso não autorizado",
          description: "Você não tem permissão para acessar esta página.",
          variant: "destructive",
        });
        navigate("/dashboard");
      }
    }
  }, [location.pathname, profileLoaded, apenasGerenteContratos, apenasContabilidade]);

  // Se tem cache, renderiza imediatamente sem loading
  if (profileLoaded && cachedProfile) {
    // Bloqueia renderização se gerente de contratos ou contabilidade tentando acessar rota não permitida
    if ((apenasGerenteContratos && !rotasGerenteContratos.includes(location.pathname)) ||
        (apenasContabilidade && !rotasContabilidade.includes(location.pathname))) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-muted-foreground">Redirecionando...</p>
        </div>
      );
    }

    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar 
            isGestor={isGestor || cachedIsGestor} 
            profile={profile || cachedProfile} 
            isCompliance={isCompliance || cachedIsCompliance}
            isResponsavelLegal={isResponsavelLegal || cachedIsResponsavelLegal}
            isGerenteContratos={isGerenteContratos || cachedIsGerenteContratos}
            isSuperintendenteExecutivo={isSuperintendenteExecutivo || cachedIsSuperintendenteExecutivo}
            isColaborador={isColaborador || cachedIsColaborador}
            isContabilidade={isContabilidade || cachedIsContabilidade}
          />
          <div className="flex-1 flex flex-col">
            <header className="h-16 border-b bg-background flex items-center px-6 gap-4">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold text-foreground">{getPageTitle(location.pathname)}</h1>
            </header>
            <main className="flex-1">
              <Outlet context={{ 
                isGestor: isGestor || cachedIsGestor, 
                isCompliance: isCompliance || cachedIsCompliance,
                isResponsavelLegal: isResponsavelLegal || cachedIsResponsavelLegal,
                isColaborador: isColaborador || cachedIsColaborador,
                isSuperintendenteExecutivo: isSuperintendenteExecutivo || cachedIsSuperintendenteExecutivo,
                isGerenteContratos: isGerenteContratos || cachedIsGerenteContratos,
                isContabilidade: isContabilidade || cachedIsContabilidade,
                profile: profile || cachedProfile,
                userId: user?.id || cachedUser?.id
              }} />
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

  // Proteção também para estado não cacheado
  const apenasGerenteContratosAtual = isGerenteContratos && 
    !isGestor && !isColaborador && !isCompliance && !isResponsavelLegal && !isSuperintendenteExecutivo && !isContabilidade;
  
  const apenasContabilidadeAtual = isContabilidade && 
    !isGestor && !isColaborador && !isCompliance && !isResponsavelLegal && !isSuperintendenteExecutivo && !isGerenteContratos;

  if ((apenasGerenteContratosAtual && !rotasGerenteContratos.includes(location.pathname)) ||
      (apenasContabilidadeAtual && !rotasContabilidade.includes(location.pathname))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirecionando...</p>
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
          isGerenteContratos={isGerenteContratos}
          isSuperintendenteExecutivo={isSuperintendenteExecutivo}
          isColaborador={isColaborador}
          isContabilidade={isContabilidade}
        />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b bg-background flex items-center px-6 gap-4">
            <SidebarTrigger />
            <h1 className="text-2xl font-bold text-foreground">{getPageTitle(location.pathname)}</h1>
          </header>
          <main className="flex-1">
            <Outlet context={{ 
              isGestor, 
              isCompliance,
              isResponsavelLegal,
              isColaborador,
              isSuperintendenteExecutivo,
              isGerenteContratos,
              isContabilidade,
              profile,
              userId: user?.id
            }} />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
