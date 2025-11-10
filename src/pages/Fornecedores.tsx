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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Plus, Edit, Trash2, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DialogFornecedor } from "@/components/fornecedores/DialogFornecedor";

interface Fornecedor {
  id: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  telefone: string;
  email: string;
  nome_socio_administrador: string;
  nomes_socios_cotistas?: string;
  segmento_atividade?: string;
  ativo: boolean;
  data_cadastro?: string;
}

const Fornecedores = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [filtro, setFiltro] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fornecedorParaEditar, setFornecedorParaEditar] = useState<Fornecedor | null>(null);
  const [fornecedorParaExcluir, setFornecedorParaExcluir] = useState<string | null>(null);
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

    setIsGestor(!!roleData);
    loadFornecedores();
    setLoading(false);
  };

  const loadFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .order("data_cadastro", { ascending: false });

      if (error) throw error;
      setFornecedores(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar fornecedores",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSave = async (fornecedor: Omit<Fornecedor, "id">) => {
    try {
      if (fornecedorParaEditar) {
        const { error } = await supabase
          .from("fornecedores")
          .update(fornecedor)
          .eq("id", fornecedorParaEditar.id);

        if (error) throw error;
        toast({ title: "Fornecedor atualizado com sucesso!" });
      } else {
        const { error } = await supabase.from("fornecedores").insert([fornecedor]);
        if (error) throw error;
        toast({ title: "Fornecedor cadastrado com sucesso!" });
      }
      loadFornecedores();
      setFornecedorParaEditar(null);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar fornecedor",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!fornecedorParaExcluir) return;

    try {
      // 1. Buscar o user_id do fornecedor ANTES de excluir
      const { data: fornecedorData, error: fetchError } = await supabase
        .from("fornecedores")
        .select("user_id")
        .eq("id", fornecedorParaExcluir)
        .single();

      if (fetchError) {
        console.error("Erro ao buscar fornecedor:", fetchError);
        throw fetchError;
      }

      console.log("Fornecedor encontrado, user_id:", fornecedorData?.user_id);

      // 2. Se o fornecedor tem user_id, deletar o usuário de autenticação PRIMEIRO
      if (fornecedorData?.user_id) {
        console.log("Chamando edge function para deletar usuário:", fornecedorData.user_id);
        
        const { data: deleteUserData, error: authError } = await supabase.functions.invoke(
          "deletar-usuario-admin",
          {
            body: { userId: fornecedorData.user_id },
          }
        );

        console.log("Resposta da edge function:", deleteUserData, authError);

        if (authError) {
          console.error("Erro ao deletar usuário de autenticação:", authError);
          toast({
            title: "Erro ao excluir acesso do fornecedor",
            description: "Não foi possível remover o acesso do sistema. Tente novamente.",
            variant: "destructive",
          });
          return;
        }
      }

      // 3. Agora deletar o registro de fornecedor
      const { error: deleteError } = await supabase
        .from("fornecedores")
        .delete()
        .eq("id", fornecedorParaExcluir);

      if (deleteError) {
        console.error("Erro ao deletar fornecedor:", deleteError);
        throw deleteError;
      }

      toast({ title: "Fornecedor excluído com sucesso!" });
      loadFornecedores();
    } catch (error: any) {
      console.error("Erro no processo de exclusão:", error);
      toast({
        title: "Erro ao excluir fornecedor",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFornecedorParaExcluir(null);
    }
  };

  const fornecedoresFiltrados = fornecedores.filter(
    (f) =>
      f.razao_social.toLowerCase().includes(filtro.toLowerCase()) ||
      f.cnpj.includes(filtro) ||
      f.email.toLowerCase().includes(filtro.toLowerCase())
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
              <p className="text-sm text-muted-foreground">Cadastro de Fornecedores</p>
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
                <CardTitle>Cadastro de Fornecedores</CardTitle>
                <CardDescription>
                  Visualize e gerencie cadastros de fornecedores
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setFornecedorParaEditar(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Fornecedor
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/perguntas-due-diligence")}
                >
                  Gerenciar Perguntas Due Diligence
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Buscar por razão social, CNPJ ou email..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>

            {fornecedoresFiltrados.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {fornecedores.length === 0
                  ? "Nenhum fornecedor cadastrado. Clique em 'Novo Fornecedor' para começar."
                  : "Nenhum fornecedor encontrado com os filtros aplicados."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Razão Social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Segmento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fornecedoresFiltrados.map((fornecedor) => (
                    <TableRow key={fornecedor.id}>
                      <TableCell className="font-medium">
                        {fornecedor.razao_social}
                        {fornecedor.nome_fantasia && (
                          <span className="block text-xs text-muted-foreground">
                            {fornecedor.nome_fantasia}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{fornecedor.cnpj}</TableCell>
                      <TableCell>{fornecedor.email}</TableCell>
                      <TableCell>{fornecedor.telefone}</TableCell>
                      <TableCell>{fornecedor.segmento_atividade || "-"}</TableCell>
                      <TableCell>
                        {fornecedor.ativo ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setFornecedorParaEditar(fornecedor);
                              setDialogOpen(true);
                            }}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {isGestor && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setFornecedorParaExcluir(fornecedor.id)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <DialogFornecedor
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        fornecedor={fornecedorParaEditar}
        onSave={handleSave}
      />

      <AlertDialog open={!!fornecedorParaExcluir} onOpenChange={() => setFornecedorParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Fornecedores;
