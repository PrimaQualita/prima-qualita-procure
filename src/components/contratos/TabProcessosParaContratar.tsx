import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, FileText, Clock, CheckCircle, Ban, Pencil, Trash2, Eye, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import { stripHtml } from "@/lib/htmlUtils";

interface ProcessoParaContratar {
  id: string;
  processo_compra_id: string;
  contrato_gestao_id: string;
  numero_processo: string;
  tipo_processo: string;
  data_finalizacao: string;
  fornecedor_vencedor_nome: string | null;
  fornecedor_vencedor_id: string | null;
  objeto: string | null;
  valor_aprovado: number;
  conta_gerencial: string | null;
  url_dossie: string | null;
  status: string;
  motivo_cancelamento: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  contratoGestaoId: string;
  contratoGestaoNome: string;
  processoCompraId?: string;
  processoCompraIds?: string[];
  canEdit: boolean;
  onCriarContrato?: (processo: ProcessoParaContratar) => void;
}

const statusLabels: Record<string, string> = {
  pronto_para_contratar: "Pronto para Contratar",
  em_contratacao: "Em Contratação",
  contratado: "Contratado",
  cancelado: "Cancelado",
  ignorado: "Ignorado",
};

const statusColors: Record<string, string> = {
  pronto_para_contratar: "bg-blue-100 text-blue-800",
  em_contratacao: "bg-yellow-100 text-yellow-800",
  contratado: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
  ignorado: "bg-gray-100 text-gray-800",
};

const statusIcons: Record<string, any> = {
  pronto_para_contratar: Clock,
  em_contratacao: FileText,
  contratado: CheckCircle,
  cancelado: Ban,
};

export function TabProcessosParaContratar({ contratoGestaoId, contratoGestaoNome, processoCompraId, processoCompraIds, canEdit, onCriarContrato }: Props) {
  const [processos, setProcessos] = useState<ProcessoParaContratar[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("pendentes");
  
  // Dialog alteração de status
  const [dialogStatusOpen, setDialogStatusOpen] = useState(false);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoParaContratar | null>(null);
  const [novoStatus, setNovoStatus] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  // Dialog visualização
  const [dialogVisualizarOpen, setDialogVisualizarOpen] = useState(false);
  const [processoVisualizar, setProcessoVisualizar] = useState<ProcessoParaContratar | null>(null);

  // Confirm delete
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [processoParaExcluir, setProcessoParaExcluir] = useState<ProcessoParaContratar | null>(null);

  useEffect(() => {
    loadProcessos();
  }, [contratoGestaoId, processoCompraIds]);

  const loadProcessos = async () => {
    try {
      let query = supabase
        .from("processos_para_contratar")
        .select("*")
        .eq("contrato_gestao_id", contratoGestaoId);
      
      if (processoCompraIds && processoCompraIds.length > 0) {
        query = query.in("processo_compra_id", processoCompraIds);
      } else if (processoCompraId) {
        query = query.eq("processo_compra_id", processoCompraId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setProcessos(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar processos:", error);
      toast.error("Erro ao carregar processos para contratar");
    } finally {
      setLoading(false);
    }
  };

  const handleAlterarStatus = async () => {
    if (!processoSelecionado || !novoStatus) return;
    if ((novoStatus === "cancelado" || novoStatus === "ignorado") && !motivoCancelamento.trim()) {
      toast.error(novoStatus === "ignorado" ? "Informe o motivo para ignorar" : "Informe o motivo do cancelamento");
      return;
    }

    try {
      const statusAnterior = processoSelecionado.status;
      const updateData: any = { status: novoStatus };
      if (novoStatus === "cancelado" || novoStatus === "ignorado") {
        updateData.motivo_cancelamento = motivoCancelamento;
      }

      const { error } = await supabase
        .from("processos_para_contratar")
        .update(updateData)
        .eq("id", processoSelecionado.id);

      if (error) throw error;

      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Processo para Contratar',
        entidade_id: processoSelecionado.id,
        detalhes: {
          tipo: 'Alteração de Status',
          numero_processo: processoSelecionado.numero_processo,
          contrato_gestao: contratoGestaoNome,
          status_anterior: statusLabels[statusAnterior] || statusAnterior,
          status_novo: statusLabels[novoStatus] || novoStatus,
          motivo_cancelamento: novoStatus === 'cancelado' ? motivoCancelamento : undefined,
        },
      });

      toast.success("Status atualizado com sucesso!");
      setDialogStatusOpen(false);
      setProcessoSelecionado(null);
      setNovoStatus("");
      setMotivoCancelamento("");
      await loadProcessos();
    } catch (error: any) {
      toast.error("Erro ao atualizar status: " + error.message);
    }
  };

  const handleExcluir = async () => {
    if (!processoParaExcluir) return;
    try {
      const { error } = await supabase
        .from("processos_para_contratar")
        .delete()
        .eq("id", processoParaExcluir.id);

      if (error) throw error;

      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'Processo para Contratar',
        entidade_id: processoParaExcluir.id,
        detalhes: {
          tipo: 'Exclusão de Processo para Contratar',
          numero_processo: processoParaExcluir.numero_processo,
          contrato_gestao: contratoGestaoNome,
          fornecedor: processoParaExcluir.fornecedor_vencedor_nome || 'N/A',
        },
      });

      toast.success("Registro excluído!");
      setConfirmDeleteOpen(false);
      setProcessoParaExcluir(null);
      await loadProcessos();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  const objetoLimpo = (objeto: string | null) => {
    if (!objeto) return "—";
    return stripHtml(objeto);
  };

  const processosFiltrados = processos.filter((p) => {
    const matchTexto = !filtro || 
      p.numero_processo.toLowerCase().includes(filtro.toLowerCase()) ||
      objetoLimpo(p.objeto).toLowerCase().includes(filtro.toLowerCase()) ||
      (p.fornecedor_vencedor_nome || "").toLowerCase().includes(filtro.toLowerCase());
    const matchStatus = filtroStatus === "todos" 
      ? true 
      : filtroStatus === "pendentes"
        ? (p.status !== "contratado" && p.status !== "cancelado" && p.status !== "ignorado")
        : p.status === filtroStatus;
    return matchTexto && matchStatus;
  });

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Buscar por processo, objeto ou fornecedor..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="flex-1 text-sm"
        />
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pendentes">Pendentes</SelectItem>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pronto_para_contratar">Pronto para Contratar</SelectItem>
            <SelectItem value="em_contratacao">Em Contratação</SelectItem>
            <SelectItem value="contratado">Contratado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
            <SelectItem value="ignorado">Ignorado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {processosFiltrados.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {processos.length === 0 
            ? "Nenhum processo finalizado para contratar neste contrato de gestão"
            : "Nenhum processo encontrado com os filtros aplicados"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">Processo</TableHead>
                <TableHead className="min-w-[100px]">Tipo</TableHead>
                <TableHead className="min-w-[150px]">Fornecedor</TableHead>
                <TableHead className="min-w-[200px]">Objeto</TableHead>
                <TableHead className="min-w-[100px]">Valor</TableHead>
                <TableHead className="min-w-[100px]">Status</TableHead>
                <TableHead className="min-w-[100px]">Data</TableHead>
                <TableHead className="text-right min-w-[220px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processosFiltrados.map((processo) => {
                const StatusIcon = statusIcons[processo.status] || Clock;
                return (
                  <TableRow key={processo.id}>
                    <TableCell className="font-medium text-xs sm:text-sm">{processo.numero_processo}</TableCell>
                    <TableCell className="text-xs sm:text-sm">{processo.tipo_processo}</TableCell>
                    <TableCell className="text-xs sm:text-sm">{processo.fornecedor_vencedor_nome || "—"}</TableCell>
                    <TableCell className="text-xs sm:text-sm max-w-[200px] truncate" title={objetoLimpo(processo.objeto)}>
                      {objetoLimpo(processo.objeto)}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm">
                      {processo.valor_aprovado > 0 
                        ? `R$ ${processo.valor_aprovado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` 
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColors[processo.status] || ""}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusLabels[processo.status] || processo.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm">
                      {format(new Date(processo.data_finalizacao), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {/* Criar Contrato */}
                      {canEdit && (processo.status === "pronto_para_contratar" || processo.status === "em_contratacao") && onCriarContrato && (
                        <Button
                          variant="default"
                          size="sm"
                          className="text-xs"
                          onClick={() => onCriarContrato(processo)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Contrato
                        </Button>
                      )}
                      {/* Ignorar Contratação */}
                      {canEdit && (processo.status === "pronto_para_contratar" || processo.status === "em_contratacao") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setProcessoSelecionado(processo);
                            setNovoStatus("ignorado");
                            setMotivoCancelamento("");
                            setDialogStatusOpen(true);
                          }}
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Ignorar
                        </Button>
                      )}
                      {/* Visualizar */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setProcessoVisualizar(processo);
                          setDialogVisualizarOpen(true);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      {/* Dossiê */}
                      {processo.url_dossie && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => window.open(processo.url_dossie!, "_blank")}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Dossiê
                        </Button>
                      )}
                      {/* Alterar Status */}
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setProcessoSelecionado(processo);
                            setNovoStatus("");
                            setMotivoCancelamento("");
                            setDialogStatusOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Status
                        </Button>
                      )}
                      {/* Excluir */}
                      {canEdit && processo.status === "cancelado" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setProcessoParaExcluir(processo);
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog Alterar Status */}
      <Dialog open={dialogStatusOpen} onOpenChange={setDialogStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status do Processo</DialogTitle>
            <DialogDescription>
              Processo: {processoSelecionado?.numero_processo}
              {processoSelecionado?.fornecedor_vencedor_nome && (
                <> — Fornecedor: {processoSelecionado.fornecedor_vencedor_nome}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Novo Status</Label>
              <Select value={novoStatus} onValueChange={setNovoStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  {processoSelecionado?.status !== "em_contratacao" && (
                    <SelectItem value="em_contratacao">Em Contratação</SelectItem>
                  )}
                  {processoSelecionado?.status !== "contratado" && (
                    <SelectItem value="contratado">Contratado</SelectItem>
                  )}
                  {processoSelecionado?.status !== "cancelado" && (
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  )}
                  {processoSelecionado?.status !== "ignorado" && (
                    <SelectItem value="ignorado">Ignorado</SelectItem>
                  )}
                  {processoSelecionado?.status !== "pronto_para_contratar" && (
                    <SelectItem value="pronto_para_contratar">Pronto para Contratar</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {(novoStatus === "cancelado" || novoStatus === "ignorado") && (
              <div className="space-y-2">
                <Label>{novoStatus === "ignorado" ? "Motivo *" : "Motivo do Cancelamento *"}</Label>
                <Textarea
                  value={motivoCancelamento}
                  onChange={(e) => setMotivoCancelamento(e.target.value)}
                  placeholder={novoStatus === "ignorado" ? "Informe o motivo para ignorar a contratação..." : "Informe o motivo do cancelamento..."}
                  rows={3}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogStatusOpen(false)}>Cancelar</Button>
            <Button onClick={handleAlterarStatus} disabled={!novoStatus}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Visualizar */}
      <Dialog open={dialogVisualizarOpen} onOpenChange={setDialogVisualizarOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Processo</DialogTitle>
          </DialogHeader>
          {processoVisualizar && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="font-medium">Processo:</span> {processoVisualizar.numero_processo}</div>
                <div><span className="font-medium">Tipo:</span> {processoVisualizar.tipo_processo}</div>
                <div><span className="font-medium">Fornecedor:</span> {processoVisualizar.fornecedor_vencedor_nome || "—"}</div>
                <div><span className="font-medium">Valor:</span> {processoVisualizar.valor_aprovado > 0 ? `R$ ${processoVisualizar.valor_aprovado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</div>
                <div><span className="font-medium">Status:</span> {statusLabels[processoVisualizar.status] || processoVisualizar.status}</div>
                <div><span className="font-medium">Data:</span> {format(new Date(processoVisualizar.data_finalizacao), "dd/MM/yyyy", { locale: ptBR })}</div>
              </div>
              <div>
                <span className="font-medium">Objeto:</span>
                <p className="mt-1 text-muted-foreground">{objetoLimpo(processoVisualizar.objeto)}</p>
              </div>
              {processoVisualizar.conta_gerencial && (
                <div><span className="font-medium">Rubrica:</span> {processoVisualizar.conta_gerencial}</div>
              )}
              {processoVisualizar.motivo_cancelamento && (
                <div>
                  <span className="font-medium">Motivo do Cancelamento:</span>
                  <p className="mt-1 text-destructive">{processoVisualizar.motivo_cancelamento}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogVisualizarOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={handleExcluir}
        title="Excluir Registro"
        description={`Tem certeza que deseja excluir o registro do processo "${processoParaExcluir?.numero_processo}" - ${processoParaExcluir?.fornecedor_vencedor_nome || 'sem fornecedor'}?`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
      />
    </div>
  );
}