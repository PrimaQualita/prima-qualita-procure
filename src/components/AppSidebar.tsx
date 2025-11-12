import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  LogOut,
  UserCircle,
  Camera,
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
import { Button } from "@/components/ui/button";
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
}

export function AppSidebar({ isGestor, profile }: AppSidebarProps) {
  const { open } = useSidebar();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.avatar_url) {
      loadAvatar(profile.avatar_url);
    }
  }, [profile?.avatar_url]);

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

  const menuItems = [
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
      icon: FolderKanban,
      href: "/contratos",
    },
    {
      title: "Cadastro de Usuários",
      icon: UserCog,
      href: "/usuarios",
    },
    {
      title: "Cadastro de Fornecedores",
      icon: Building2,
      href: "/fornecedores",
    },
    {
      title: "Contato",
      icon: MessageSquare,
      href: "/contatos",
    },
  ];

  if (isGestor) {
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
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
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
                        {isGestor ? "Gestor" : "Colaborador"}
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


