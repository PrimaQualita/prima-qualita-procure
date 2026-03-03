import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toZonedTime } from "date-fns-tz";
import { differenceInDays } from "date-fns";
import {
  FileText,
  DollarSign,
  Users,
  Building2,
  UserCog,
  MessageSquare,
  LayoutDashboard,
  Home,
  ClipboardList,
  FileCheck,
  FolderKanban,
  Briefcase,
  LogOut,
  UserCircle,
  Camera,
  Calculator,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import primaLogo from "@/assets/prima-qualita-logo-horizontal.png";

interface AppSidebarProps {
  isGestor: boolean;
  profile: any;
  isCompliance?: boolean;
  isResponsavelLegal?: boolean;
  isGerenteContratos?: boolean;
  isSuperintendenteExecutivo?: boolean;
  isColaborador?: boolean;
  isGerenteFinanceiro?: boolean;
  isContabilidade?: boolean;
}

export function AppSidebar({ 
  isGestor, 
  profile, 
  isCompliance = false, 
  isResponsavelLegal = false, 
  isGerenteContratos = false,
  isSuperintendenteExecutivo = false,
  isColaborador = false,
  isGerenteFinanceiro = false,
  isContabilidade = false
}: AppSidebarProps) {
  const { open } = useSidebar();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [contractAlertCount, setContractAlertCount] = useState(0);

  useEffect(() => {
    if (profile?.avatar_url) {
      loadAvatar(profile.avatar_url);
    } else {
      setAvatarUrl(null);
    }
  }, [profile?.avatar_url, profile?.id]);

  // Carregar contagem de mensagens não lidas
  useEffect(() => {
    if (!profile?.id) return;

    const loadUnreadCount = async () => {
      try {
        const { count, error } = await supabase
          .from('mensagens_contato_destinatarios')
          .select('*', { count: 'exact', head: true })
          .eq('destinatario_interno_id', profile.id)
          .eq('lida', false)
          .eq('excluida', false);

        if (!error && count !== null) {
          setUnreadCount(count);
        }
      } catch (error) {
        console.error('Erro ao carregar mensagens não lidas:', error);
      }
    };

    loadUnreadCount();

    const channel = supabase
      .channel('unread-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mensagens_contato_destinatarios'
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Carregar contagem de alertas de contratos (a vencer + vencidos sem tratamento)
  useEffect(() => {
    if (!profile?.id) return;

    const loadContractAlerts = async () => {
      try {
        if (typeof document !== "undefined" && document.hidden) return;

        const { data, error } = await supabase
          .from("contratos_terceiros")
          .select("id, fim_vigencia_atual, status, ciente_nao_renovar")
          .not("fim_vigencia_atual", "is", null);

        if (error) throw error;

        const hoje = toZonedTime(new Date(), "America/Sao_Paulo");
        const contratosValidos = (data || []).filter((c) => !c.ciente_nao_renovar);

        const aVencer = contratosValidos.filter((c) => {
          if (c.status !== "vigente") return false;
          const fimDate = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
          const dias = differenceInDays(fimDate, hoje);
          return dias >= 0 && dias <= 45;
        });

        const vencidos = contratosValidos.filter((c) => {
          if (c.status === "encerrado" || c.status === "rescindido") return false;
          const fimDate = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
          return fimDate < hoje;
        });

        setContractAlertCount(aVencer.length + vencidos.length);
      } catch {
        // silent
      }
    };

    loadContractAlerts();
    const interval = setInterval(loadContractAlerts, 60000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  const loadAvatar = async (path: string) => {
    try {
      const { data } = await supabase.storage
        .from('avatars')
        .getPublicUrl(path);
      
      if (data) {
        setAvatarUrl(data.publicUrl);
      }
    } catch (error) {
      console.error('Erro ao carregar avatar:', error);
    }
  };

  // Menu para Gerente de Contratos (apenas 3 opções)
  const menuGerenteContratos = [
    {
      title: "Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
    },
    {
      title: "Processos de Compras",
      icon: FileText,
      href: "/processos-compras",
    },
    {
      title: "Contato",
      icon: MessageSquare,
      href: "/contatos",
    },
  ];

  // Menu para Contabilidade (apenas Dashboard, Contabilidade e Contato)
  const menuContabilidade = [
    {
      title: "Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
    },
    {
      title: "Contabilidade",
      icon: Calculator,
      href: "/contabilidade",
    },
    {
      title: "Contato",
      icon: MessageSquare,
      href: "/contatos",
    },
  ];

  // Menu completo para usuários internos
  const menuCompleto = [
    {
      title: "Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
    },
    {
      title: "Processos de Compras",
      icon: FileText,
      href: "/processos-compras",
    },
    {
      title: "Cotação de Preços",
      icon: DollarSign,
      href: "/cotacoes",
    },
    {
      title: "Seleção de Fornecedores",
      icon: Users,
      href: "/selecoes",
    },
    {
      title: "Credenciamento",
      icon: ClipboardList,
      href: "/credenciamentos",
    },
    {
      title: "Contratações Específicas",
      icon: FileCheck,
      href: "/contratacoes-especificas",
    },
    {
      title: "Contratos",
      icon: Briefcase,
      href: "/contratos",
    },
  ];

  // Verifica se o usuário é APENAS gerente de contratos (sem outros papéis)
  const temOutrosPapeis = isGestor || isColaborador || isCompliance || isResponsavelLegal || isSuperintendenteExecutivo || isContabilidade;
  const apenasGerenteContratos = isGerenteContratos && !temOutrosPapeis;
  
  // Verifica se o usuário é APENAS contabilidade (sem outros papéis)
  const temOutrosPapeisAlemContabilidade = isGestor || isColaborador || isCompliance || isResponsavelLegal || isSuperintendenteExecutivo || isGerenteContratos;
  const apenasContabilidade = isContabilidade && !temOutrosPapeisAlemContabilidade;
  
  // Seleciona o menu correto baseado no tipo de usuário
  const menuItems = apenasGerenteContratos 
    ? [...menuGerenteContratos] 
    : apenasContabilidade 
      ? [...menuContabilidade] 
      : [...menuCompleto];

  // Adicionar menu Compliance APENAS se for Compliance ou Superintendente Executivo (e não for apenas gerente de contratos)
  if (!apenasGerenteContratos && !apenasContabilidade && (isCompliance || isSuperintendenteExecutivo)) {
    menuItems.push({
      title: "Compliance",
      icon: FileCheck,
      href: "/compliance",
    });
  }

  // Contabilidade aparece para gestores, colaboradores, ou usuários com perfil contabilidade
  if (!apenasGerenteContratos && !apenasContabilidade && (isGestor || isColaborador || isGerenteFinanceiro || isContabilidade)) {
    menuItems.push({
      title: "Contabilidade",
      icon: Calculator,
      href: "/contabilidade",
    });
  }

  // Cadastro de Fornecedores
  if (!apenasGerenteContratos && !apenasContabilidade) {
    menuItems.push({
      title: "Cadastro de Fornecedores",
      icon: Building2,
      href: "/fornecedores",
    });
  }

  // Cadastro de Usuários
  if (!apenasGerenteContratos && !apenasContabilidade) {
    menuItems.push({
      title: "Cadastro de Usuários",
      icon: UserCog,
      href: "/usuarios",
    });
  }

  // Contato (para todos os usuários com menu completo)
  if (!apenasGerenteContratos && !apenasContabilidade) {
    menuItems.push({
      title: "Contato",
      icon: MessageSquare,
      href: "/contatos",
    });
  }

  // Gestão de Storage - apenas Compliance e Superintendente Executivo
  if (!apenasGerenteContratos && !apenasContabilidade && (isCompliance || isSuperintendenteExecutivo)) {
    menuItems.push({
      title: "Gestão de Storage",
      icon: Camera,
      href: "/gestao-storage",
    });
  }

  // Log de Auditoria - apenas Compliance e Superintendente Executivo
  if (!apenasGerenteContratos && !apenasContabilidade && (isCompliance || isSuperintendenteExecutivo)) {
    menuItems.push({
      title: "Log de Auditoria",
      icon: Home,
      href: "/auditoria",
    });
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Logout realizado com sucesso!");
      navigate("/auth");
    } catch (error: any) {
      toast.error("Erro ao fazer logout: " + error.message);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className={`flex flex-col items-center ${open ? 'p-4' : 'p-2'}`}>
          <img 
            src={primaLogo} 
            alt="Prima Qualitá" 
            className={`${open ? 'h-12' : 'h-8'} w-auto object-contain transition-all`}
          />
          {open && (
            <div className="mt-3 text-center">
              <h2 className="text-sm font-semibold text-sidebar-foreground">Sistema de Compras</h2>
              <p className="text-xs text-sidebar-foreground/70 mt-0.5">Prima Qualitá Saúde</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.href}
                      end
                      className="hover:bg-muted/50 relative"
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <div className="relative">
                        <item.icon className="h-4 w-4" />
                        {item.href === "/contatos" && unreadCount > 0 && !open && (
                          <Badge 
                            variant="destructive" 
                            className="absolute -top-2 -right-2 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </Badge>
                        )}
                        {item.href === "/contratos" && contractAlertCount > 0 && !open && (
                          <Badge 
                            variant="destructive" 
                            className="absolute -top-2 -right-2 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
                          >
                            {contractAlertCount > 99 ? "99+" : contractAlertCount}
                          </Badge>
                        )}
                      </div>
                      {open && (
                        <span className="flex items-center gap-2">
                          {item.title}
                          {item.href === "/contatos" && unreadCount > 0 && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </Badge>
                          )}
                          {item.href === "/contratos" && contractAlertCount > 0 && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                              {contractAlertCount > 99 ? "99+" : contractAlertCount}
                            </Badge>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-auto py-3 hover:bg-muted/50">
                  <Avatar className="h-10 w-10 border-2 border-primary/20">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={profile?.nome_completo} />}
                    <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                      {getInitials(profile?.nome_completo || "")}
                    </AvatarFallback>
                  </Avatar>
                  {open && (
                    <div className="flex flex-col items-start overflow-hidden flex-1 ml-2">
                      <span className="text-sm font-semibold truncate w-full text-sidebar-foreground">
                        {profile?.nome_completo || "Usuário"}
                      </span>
                      <span className="text-xs text-sidebar-foreground/70 font-medium">
                        {isGestor ? "Gestor" : isColaborador ? "Colaborador" : apenasGerenteContratos ? "Gerente de Contratos" : apenasContabilidade ? "Contabilidade" : "Usuário"}
                      </span>
                    </div>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/perfil")}>
                  <UserCircle className="mr-2 h-4 w-4" />
                  <span>Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}


