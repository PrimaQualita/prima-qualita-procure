import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Plus, Shield, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DialogUsuario } from "@/components/usuarios/DialogUsuario";


interface Usuario {
  id: string;
  nome_completo: string;
  email: string;
  cpf: string;
  data_nascimento?: string;
  ativo: boolean;
  role?: string;
}

const Usuarios = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [filtro, setFiltro] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isGestor, setIsGestor] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Verificar se é gestor
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "gestor")
      .maybeSingle();

    if (!roleData) {
      toast({
        title: "Acesso negado",
        description: "Apenas gestores podem acessar esta página.",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    setIsGestor(true);
    loadUsuarios();
    setLoading(false);
  };

  const loadUsuarios = async () => {
    try {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false});

      if (profileError) throw profileError;
      
      // Load roles for each user
      const usuariosComRoles = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", profile.id)
            .limit(1)
            .maybeSingle();
          
          return {
            ...profile,
            role: roleData?.role || "sem_role"
          };
        })
      );

      setUsuarios(usuariosComRoles);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar usuários",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    try {
      const newRole = currentRole === "gestor" ? "colaborador" : "gestor";

      // Deletar role atual
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      // Criar nova role
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert([{ user_id: userId, role: newRole }]);

      if (insertError) throw insertError;

      toast({
        title: "Perfil atualizado",
        description: `Usuário agora é ${newRole}.`,
      });

      loadUsuarios();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar perfil",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const usuariosFiltrados = usuarios.filter(
    (u) =>
      u.nome_completo.toLowerCase().includes(filtro.toLowerCase()) ||
      u.email.toLowerCase().includes(filtro.toLowerCase()) ||
      u.cpf.includes(filtro)
  );


  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Gestão de Contratos e Processos</h1>
              <p className="text-sm text-muted-foreground">Cadastro de Usuários</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Cadastro de Usuários</CardTitle>
                <CardDescription>
                  Gerencie gestores e colaboradores do sistema
                </CardDescription>
              </div>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Usuário
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Buscar por nome, email ou CPF..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>

            {usuariosFiltrados.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum usuário encontrado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Gestor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuariosFiltrados.map((usuario) => (
                    <TableRow key={usuario.id}>
                      <TableCell className="font-medium">{usuario.nome_completo}</TableCell>
                      <TableCell>{usuario.email}</TableCell>
                      <TableCell>{usuario.cpf}</TableCell>
                      <TableCell>
                        {usuario.role === "gestor" ? (
                          <Badge variant="default" className="gap-1">
                            <Shield className="h-3 w-3" />
                            Gestor
                          </Badge>
                        ) : usuario.role === "colaborador" ? (
                          <Badge variant="secondary" className="gap-1">
                            <User className="h-3 w-3" />
                            Colaborador
                          </Badge>
                        ) : (
                          <Badge variant="outline">Sem perfil</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {usuario.ativo ? (
                          <Badge variant="default">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={usuario.role === "gestor"}
                          onCheckedChange={() => handleToggleRole(usuario.id, usuario.role || "colaborador")}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <DialogUsuario
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={loadUsuarios}
        />
      </div>
    </div>
  );
};

export default Usuarios;
