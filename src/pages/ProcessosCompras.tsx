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
import { ArrowLeft, Plus, Edit, Trash2, FileText, Paperclip, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DialogContrato } from "@/components/contratos/DialogContrato";
import { DialogProcesso } from "@/components/processos/DialogProcesso";
import { DialogAnexosProcesso } from "@/components/processos/DialogAnexosProcesso";
import { stripHtml, truncateText } from "@/lib/htmlUtils";

interface Contrato {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  data_inicio: string;
  data_fim: string;
  status: "ativo" | "encerrado" | "suspenso";
  observacoes?: string;
}

interface Processo {
  id: string;
  contrato_gestao_id: string;
  ano_referencia: number;
  numero_processo_interno: string;
  objeto_resumido: string;
  tipo: "material" | "servico" | "mao_obra_exclusiva" | "outros";
  centro_custo?: string;
  valor_estimado_anual: number;
  valor_total_cotacao?: number;
  status_processo: "planejado" | "em_cotacao" | "cotacao_concluida" | "em_selecao" | "contratado" | "concluido" | "cancelado" | "contratacao";
  data_abertura?: string;
  data_encerramento_prevista?: string;
  observacoes?: string;
  requer_cotacao?: boolean;
  requer_selecao?: boolean;
  criterio_julgamento?: string;
  credenciamento?: boolean;
  contratacao_especifica?: boolean;
}

const ProcessosCompras = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isGestor, setIsGestor] = useState(false);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Estados para contratos
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [filtroContrato, setFiltroContrato] = useState("");
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [dialogContratoOpen, setDialogContratoOpen] = useState(false);
  const [contratoParaEditar, setContratoParaEditar] = useState<Contrato | null>(null);
  const [contratoParaExcluir, setContratoParaExcluir] = useState<string | null>(null);
  
  // Estados para processos
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [filtroProcesso, setFiltroProcesso] = useState("");
  const [dialogProcessoOpen, setDialogProcessoOpen] = useState(false);
  const [processoParaEditar, setProcessoParaEditar] = useState<Processo | null>(null);
  const [processoParaExcluir, setProcessoParaExcluir] = useState<string | null>(null);
  const [dialogAnexosOpen, setDialogAnexosOpen] = useState(false);
  const [processoParaAnexos, setProcessoParaAnexos] = useState<Processo | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (userId) {
      loadContratos();
    }
  }, [userId]);

  useEffect(() => {
    if (contratoSelecionado) {
      loadProcessos(contratoSelecionado.id);
    }
  }, [contratoSelecionado]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    setUserId(session.user.id);

    // Verificar se é gestor
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "gestor")
      .maybeSingle();

    setIsGestor(!!roleData);

    // Verificar se é responsável legal
    const { data: profileData } = await supabase
      .from("profiles")
      .select("responsavel_legal")
      .eq("id", session.user.id)
      .maybeSingle();

    setIsResponsavelLegal(!!profileData?.responsavel_legal);
    setLoading(false);
  };

  const loadContratos = async () => {
    try {
      const { data, error } = await supabase
        .from("contratos_gestao")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContratos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar contratos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadProcessos = async (contratoId: string) => {
    try {
      const { data, error } = await supabase
        .from("processos_compras")
        .select("*")
        .eq("contrato_gestao_id", contratoId)
        .order("numero_processo_interno", { ascending: true });

      if (error) throw error;
      setProcessos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar processos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSaveContrato = async (contrato: Omit<Contrato, "id">) => {
    try {
      if (contratoParaEditar) {
        const { error } = await supabase
          .from("contratos_gestao")
          .update(contrato)
          .eq("id", contratoParaEditar.id);

        if (error) throw error;
        toast({ title: "Contrato atualizado com sucesso!" });
      } else {
        const { error } = await supabase.from("contratos_gestao").insert([contrato]);
        if (error) throw error;
        toast({ title: "Contrato criado com sucesso!" });
      }
      loadContratos();
      setContratoParaEditar(null);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar contrato",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteContrato = async () => {
    if (!contratoParaExcluir) return;

    try {
      const { error } = await supabase
        .from("contratos_gestao")
        .delete()
        .eq("id", contratoParaExcluir);

      if (error) throw error;
      toast({ title: "Contrato excluído com sucesso!" });
      loadContratos();
      if (contratoSelecionado?.id === contratoParaExcluir) {
        setContratoSelecionado(null);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao excluir contrato",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setContratoParaExcluir(null);
    }
  };

  const handleSaveProcesso = async (processo: Omit<Processo, "id">) => {
    try {
      if (processoParaEditar) {
        const { error } = await supabase
          .from("processos_compras")
          .update(processo)
          .eq("id", processoParaEditar.id);

        if (error) throw error;
        toast({ title: "Processo atualizado com sucesso!" });
      } else {
        const { error } = await supabase.from("processos_compras").insert([processo]);
        if (error) throw error;
        toast({ title: "Processo criado com sucesso!" });
      }
      if (contratoSelecionado) {
        loadProcessos(contratoSelecionado.id);
      }
      setProcessoParaEditar(null);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar processo",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteProcesso = async () => {
    if (!processoParaExcluir) return;

    try {
      // 1. Deletar todos os arquivos relacionados ao processo
      const { data: resultDeletar, error: errorDeletar } = await supabase.functions.invoke(
        'deletar-processo',
        {
          body: { processoId: processoParaExcluir }
        }
      );

      if (errorDeletar) {
        console.error('Erro ao deletar arquivos:', errorDeletar);
        toast({
          title: "Erro ao deletar arquivos do processo",
          description: errorDeletar.message,
          variant: "destructive",
        });
        return;
      }

      console.log('Arquivos deletados:', resultDeletar);

      // 2. Deletar o processo do banco
      const { error } = await supabase
        .from("processos_compras")
        .delete()
        .eq("id", processoParaExcluir);

      if (error) throw error;
      
      toast({ 
        title: "Processo excluído com sucesso!",
        description: `${resultDeletar?.arquivosDeletados || 0} arquivos removidos`
      });
      
      if (contratoSelecionado) {
        loadProcessos(contratoSelecionado.id);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao excluir processo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessoParaExcluir(null);
    }
  };

  const contratosFiltrados = contratos.filter(
    (c) =>
      c.nome_contrato.toLowerCase().includes(filtroContrato.toLowerCase()) ||
      c.ente_federativo.toLowerCase().includes(filtroContrato.toLowerCase())
  );

  const processosFiltrados = processos.filter(
    (p) =>
      p.numero_processo_interno.toLowerCase().includes(filtroProcesso.toLowerCase()) ||
      p.objeto_resumido.toLowerCase().includes(filtroProcesso.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      ativo: "default",
      encerrado: "secondary",
      suspenso: "destructive",
      planejado: "default",
      em_cotacao: "default",
      cotacao_concluida: "default",
      em_selecao: "default",
      contratado: "default",
      concluido: "secondary",
      cancelado: "destructive",
    };
    
    const labels: Record<string, string> = {
      planejado: "ABERTO",
      concluido: "CONCLUÍDO",
      ativo: "ATIVO",
      encerrado: "ENCERRADO",
      suspenso: "SUSPENSO",
      em_cotacao: "EM COTAÇÃO",
      cotacao_concluida: "COTAÇÃO CONCLUÍDA",
      em_selecao: "EM SELEÇÃO",
      contratado: "CONTRATADO",
      cancelado: "CANCELADO",
    };
    
    return <Badge variant={variants[status] || "default"}>{labels[status] || status.replace(/_/g, " ").toUpperCase()}</Badge>;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {!contratoSelecionado ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contratos de Gestão</CardTitle>
                  <CardDescription>
                    Gerencie todos os contratos de gestão
                  </CardDescription>
                </div>
                <Button onClick={() => {
                  setContratoParaEditar(null);
                  setDialogContratoOpen(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Contrato
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar por nome ou ente federativo..."
                  value={filtroContrato}
                  onChange={(e) => setFiltroContrato(e.target.value)}
                />
              </div>

              {contratosFiltrados.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {contratos.length === 0 
                    ? "Nenhum contrato de gestão cadastrado. Clique em 'Novo Contrato' para começar."
                    : "Nenhum contrato encontrado com os filtros aplicados."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome do Contrato</TableHead>
                      <TableHead>Ente Federativo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contratosFiltrados.map((contrato) => (
                      <TableRow key={contrato.id}>
                        <TableCell className="font-medium">{contrato.nome_contrato}</TableCell>
                        <TableCell>{contrato.ente_federativo}</TableCell>
                        <TableCell>
                          {new Date(contrato.data_inicio).toLocaleDateString()} até{" "}
                          {new Date(contrato.data_fim).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{getStatusBadge(contrato.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setContratoSelecionado(contrato)}
                            >
                              <ChevronRight className="h-4 w-4 mr-2" />
                              Ver Processos
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setContratoParaEditar(contrato);
                                setDialogContratoOpen(true);
                              }}
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {isResponsavelLegal && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setContratoParaExcluir(contrato.id)}
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
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processos de Compras</CardTitle>
                  <CardDescription>
                    Contrato: {contratoSelecionado.nome_contrato}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => {
                    setProcessoParaEditar(null);
                    setDialogProcessoOpen(true);
                  }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Processo
                  </Button>
                  <Button variant="outline" onClick={() => setContratoSelecionado(null)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar por número ou objeto..."
                  value={filtroProcesso}
                  onChange={(e) => setFiltroProcesso(e.target.value)}
                />
              </div>

              {processosFiltrados.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {processos.length === 0
                    ? "Nenhum processo cadastrado para este contrato. Clique em 'Novo Processo' para começar."
                    : "Nenhum processo encontrado com os filtros aplicados."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Processo</TableHead>
                      <TableHead>Objeto</TableHead>
                      <TableHead>Ano</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Anexos</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processosFiltrados.map((processo) => (
                      <TableRow key={processo.id}>
                        <TableCell className="font-medium">{processo.numero_processo_interno}</TableCell>
                        <TableCell className="max-w-[400px] whitespace-normal">
                          {stripHtml(processo.objeto_resumido)}
                        </TableCell>
                        <TableCell>{processo.ano_referencia}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{processo.tipo.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(processo.valor_total_cotacao || 0)}
                        </TableCell>
                        <TableCell>{getStatusBadge(processo.status_processo)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setProcessoParaAnexos(processo);
                              setDialogAnexosOpen(true);
                            }}
                            title="Gerenciar Anexos"
                          >
                            <Paperclip className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setProcessoParaEditar(processo);
                                setDialogProcessoOpen(true);
                              }}
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {isGestor && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setProcessoParaExcluir(processo.id)}
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
        )}
      </div>

      <DialogContrato
        open={dialogContratoOpen}
        onOpenChange={setDialogContratoOpen}
        contrato={contratoParaEditar}
        onSave={handleSaveContrato}
      />

      <DialogProcesso
        open={dialogProcessoOpen}
        onOpenChange={setDialogProcessoOpen}
        processo={processoParaEditar}
        contratoId={contratoSelecionado?.id || ""}
        onSave={handleSaveProcesso}
      />

      <AlertDialog open={!!contratoParaExcluir} onOpenChange={() => setContratoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteContrato}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!processoParaExcluir} onOpenChange={() => setProcessoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este processo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProcesso}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {processoParaAnexos && (
        <DialogAnexosProcesso
          open={dialogAnexosOpen}
          onOpenChange={setDialogAnexosOpen}
          processoId={processoParaAnexos.id}
          processoNumero={processoParaAnexos.numero_processo_interno}
        />
      )}
    </div>
  );
};

export default ProcessosCompras;
