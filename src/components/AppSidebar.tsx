import { useNavigate, useLocation } from "react-router-dom";
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
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";

interface AppSidebarProps {
  isGestor: boolean;
}

export function AppSidebar({ isGestor }: AppSidebarProps) {
  const { open } = useSidebar();
  const location = useLocation();

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

  return (
    <Sidebar collapsible="icon">
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
    </Sidebar>
  );
}

