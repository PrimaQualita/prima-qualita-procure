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
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DialogContato } from "@/components/contatos/DialogContato";

interface Contato {
  id: string;
  tipo_usuario: string;
  assunto: string;
  categoria: string;
  mensagem: string;
  status_atendimento: "aberto" | "em_analise" | "fechado" | "respondido";
  created_at: string;
  data_resposta?: string;
  resposta_interna?: string;
  usuario_interno_id?: string;
  fornecedor_id?: string;
}

const Contatos = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [filtro, setFiltro] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contatoSelecionado, setContatoSelecionado] = useState<Contato | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    loadContatos();
    setLoading(false);
  };

  const loadContatos = async () => {
    try {
      const { data, error } = await supabase
        .from("contatos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContatos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar contatos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleResponder = async (contatoId: string, resposta: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("contatos")
        .update({
          resposta_interna: resposta,
          data_resposta: new Date().toISOString(),
          usuario_interno_id: user.id,
          status_atendimento: "respondido",
        })
        .eq("id", contatoId);

      if (error) throw error;
      toast({ title: "Resposta enviada com sucesso!" });
      loadContatos();
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar resposta",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const contatosFiltrados = contatos.filter(
    (c) =>
      c.assunto.toLowerCase().includes(filtro.toLowerCase()) ||
      c.categoria.toLowerCase().includes(filtro.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      aberto: "destructive",
      em_analise: "default",
      respondido: "secondary",
      fechado: "secondary",
    };
    return <Badge variant={variants[status] || "default"}>{status.replace(/_/g, " ").toUpperCase()}</Badge>;
  };

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
              <p className="text-sm text-muted-foreground">Canal de Contato</p>
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
                <CardTitle>Canal de Contato</CardTitle>
                <CardDescription>
                  Mensagens e solicitações de fornecedores
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Buscar por assunto ou categoria..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>

            {contatosFiltrados.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {contatos.length === 0
                  ? "Nenhuma mensagem recebida."
                  : "Nenhuma mensagem encontrada com os filtros aplicados."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contatosFiltrados.map((contato) => (
                    <TableRow key={contato.id}>
                      <TableCell>
                        {new Date(contato.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{contato.tipo_usuario}</Badge>
                      </TableCell>
                      <TableCell>{contato.categoria}</TableCell>
                      <TableCell className="font-medium">{contato.assunto}</TableCell>
                      <TableCell>{getStatusBadge(contato.status_atendimento)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setContatoSelecionado(contato);
                            setDialogOpen(true);
                          }}
                          title="Ver detalhes"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {contatoSelecionado && (
        <DialogContato
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          contato={contatoSelecionado}
          onResponder={handleResponder}
        />
      )}
    </div>
  );
};

export default Contatos;
