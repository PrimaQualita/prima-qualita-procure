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
const rotasContabilidade = [
  "/dashboard", 
  "/contabilidade", 
  "/contatos", 
  "/perfil"
];

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
let cachedIsContrato: boolean = false;
let cachedIsControleCompras: boolean = false;
let cachedIsJovemAprendiz: boolean = false;
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
  const [isContrato, setIsContrato] = useState(cachedIsContrato);
  const [isControleCompras, setIsControleCompras] = useState(cachedIsControleCompras);
  const [isJovemAprendiz, setIsJovemAprendiz] = useState(cachedIsJovemAprendiz);
  const [loading, setLoading] = useState(!profileLoaded);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const newUser = session?.user ?? null;
      
      // Se o usuário mudou (login com outro usuário), invalidar cache
      if (newUser && cachedUser && newUser.id !== cachedUser.id) {
        profileLoaded = false;
        cachedProfile = null;
        cachedIsGestor = false;
        cachedIsCompliance = false;
        cachedIsResponsavelLegal = false;
        cachedIsGerenteContratos = false;
        cachedIsSuperintendenteExecutivo = false;
        cachedContratosVinculados = [];
        cachedIsColaborador = false;
        cachedIsContabilidade = false;
        cachedIsContrato = false;
        cachedIsControleCompras = false;
        cachedIsJovemAprendiz = false;
      }
      
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
        cachedIsContrato = false;
        cachedIsControleCompras = false;
        cachedIsJovemAprendiz = false;
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
        setIsContrato(false);
        setIsControleCompras(false);
        setIsJovemAprendiz(false);
        
        // Limpa cache de outras páginas
        clearCotacoesCache();
      }
    });

    // Se já tem cache E é o mesmo usuário, não precisa buscar sessão de novo
    if (profileLoaded && cachedUser) {
      setLoading(false);
      return () => subscription.unsubscribe();
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      
      // Verificar se deve manter sessão (sessionStorage flag)
      if (sessionUser && !sessionStorage.getItem('manterConectado') && !localStorage.getItem('manterConectado')) {
        // Não tem flag de manter conectado - significa que é uma nova aba/sessão
        // Fazer logout silencioso
        supabase.auth.signOut({ scope: 'local' }).then(() => {
          setUser(null);
          cachedUser = null;
          profileLoaded = false;
          setLoading(false);
        });
        return;
      }
      
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
    if (!user) return;
    
    // Se cache é de outro usuário, invalidar
    if (profileLoaded && cachedProfile && cachedUser?.id !== user.id) {
      profileLoaded = false;
      cachedProfile = null;
    }
    
    // Se já carregou para ESTE usuário, não faz nada
    if (profileLoaded) return;

    try {
      // Buscar fornecedor, perfil e roles em PARALELO
      const [fornecedorResult, profileResult, rolesResult] = await Promise.all([
        supabase
          .from("fornecedores")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["gestor", "colaborador"]),
      ]);

      if (fornecedorResult.data) {
        navigate("/portal-fornecedor");
        return;
      }

      const profileData = profileResult.data;
      const profileError = profileResult.error;

      if (profileError) {
        toast({
          title: "Acesso negado",
          description: "Usuário não autorizado a acessar o sistema.",
          variant: "destructive",
        });
        await supabase.auth.signOut({ scope: 'local' });
        navigate("/auth");
        return;
      }

      // Atualiza cache global
      cachedProfile = profileData;
      cachedIsCompliance = profileData?.compliance || false;
      cachedIsResponsavelLegal = profileData?.responsavel_legal || false;
      cachedIsSuperintendenteExecutivo = profileData?.superintendente_executivo || profileData?.gerente_financeiro || false;
      cachedIsContabilidade = profileData?.contabilidade || false;
      cachedIsContrato = profileData?.contrato || false;
      cachedIsControleCompras = profileData?.controle_compras || false;
      cachedIsJovemAprendiz = profileData?.jovem_aprendiz || false;
      
      setProfile(profileData);
      setIsCompliance(cachedIsCompliance);
      setIsResponsavelLegal(cachedIsResponsavelLegal);
      setIsSuperintendenteExecutivo(cachedIsSuperintendenteExecutivo);
      setIsContabilidade(cachedIsContabilidade);
      setIsContrato(cachedIsContrato);
      setIsControleCompras(cachedIsControleCompras);
      setIsJovemAprendiz(cachedIsJovemAprendiz);

      if (profileData?.primeiro_acesso || profileData?.senha_temporaria) {
        navigate("/troca-senha");
        return;
      }

      const rolesSet = new Set((rolesResult.data || []).map(r => r.role));
      
      cachedIsGestor = rolesSet.has("gestor") || profileData?.gestor === true;
      setIsGestor(cachedIsGestor);

      cachedIsColaborador = rolesSet.has("colaborador");
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
      await supabase.auth.signOut({ scope: 'local' });
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Limpar flags de sessão
      sessionStorage.removeItem('manterConectado');
      localStorage.removeItem('manterConectado');
      
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
                          (isContabilidade || cachedIsContabilidade) ||
                          (isControleCompras || cachedIsControleCompras);
  
  const apenasGerenteContratos = (isGerenteContratos || cachedIsGerenteContratos) && !temOutrosPapeis;

  // Verifica se é APENAS contabilidade (sem outros papéis)
  const temOutrosPapeisAlemContabilidade = (isGestor || cachedIsGestor) || 
                          (isColaborador || cachedIsColaborador) || 
                          (isCompliance || cachedIsCompliance) || 
                          (isResponsavelLegal || cachedIsResponsavelLegal) || 
                          (isSuperintendenteExecutivo || cachedIsSuperintendenteExecutivo) ||
                          (isGerenteContratos || cachedIsGerenteContratos) ||
                          (isControleCompras || cachedIsControleCompras);
  
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
            isControleCompras={isControleCompras || cachedIsControleCompras}
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
                isContrato: isContrato || cachedIsContrato,
                isControleCompras: isControleCompras || cachedIsControleCompras,
                profile: profile || cachedProfile,
                userId: user?.id || cachedUser?.id,
                contratosVinculados: contratosVinculados.length > 0 ? contratosVinculados : cachedContratosVinculados
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
    !isGestor && !isColaborador && !isCompliance && !isResponsavelLegal && !isSuperintendenteExecutivo && !isContabilidade && !isControleCompras;
  
  const apenasContabilidadeAtual = isContabilidade && 
    !isGestor && !isColaborador && !isCompliance && !isResponsavelLegal && !isSuperintendenteExecutivo && !isGerenteContratos && !isControleCompras;

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
          isControleCompras={isControleCompras}
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
              isContrato,
              isControleCompras,
              profile,
              userId: user?.id,
              contratosVinculados
            }} />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
