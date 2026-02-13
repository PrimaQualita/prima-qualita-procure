import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, FileText, XCircle, CheckCircle, Clock, Ban } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

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
  canEdit: boolean;
}

const statusLabels: Record<string, string> = {
  pronto_para_contratar: "Pronto para Contratar",
  em_contratacao: "Em Contratação",
  contratado: "Contratado",
  cancelado: "Cancelado",
};

const statusColors: Record<string, string> = {
  pronto_para_contratar: "bg-blue-100 text-blue-800",
  em_contratacao: "bg-yellow-100 text-yellow-800",
  contratado: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
};

const statusIcons: Record<string, any> = {
  pronto_para_contratar: Clock,
  em_contratacao: FileText,
  contratado: CheckCircle,
  cancelado: Ban,
};

export function TabProcessosParaContratar({ contratoGestaoId, contratoGestaoNome, canEdit }: Props) {
  const [processos, setProcessos] = useState<ProcessoParaContratar[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  
  // Dialog alteração de status
  const [dialogStatusOpen, setDialogStatusOpen] = useState(false);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoParaContratar | null>(null);
  const [novoStatus, setNovoStatus] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  useEffect(() => {
    loadProcessos();
  }, [contratoGestaoId]);

  const loadProcessos = async () => {
    try {
      const { data, error } = await supabase
        .from("processos_para_contratar")
        .select("*")
        .eq("contrato_gestao_id", contratoGestaoId)
        .order("created_at", { ascending: false });

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
    if (novoStatus === "cancelado" && !motivoCancelamento.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }

    try {
      const statusAnterior = processoSelecionado.status;
      const updateData: any = { status: novoStatus };
      if (novoStatus === "cancelado") {
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

  const processosFiltrados = processos.filter((p) => {
    const matchTexto = !filtro || 
      p.numero_processo.toLowerCase().includes(filtro.toLowerCase()) ||
      (p.objeto || "").toLowerCase().includes(filtro.toLowerCase()) ||
      (p.fornecedor_vencedor_nome || "").toLowerCase().includes(filtro.toLowerCase());
    const matchStatus = filtroStatus === "todos" || p.status === filtroStatus;
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
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pronto_para_contratar">Pronto para Contratar</SelectItem>
            <SelectItem value="em_contratacao">Em Contratação</SelectItem>
            <SelectItem value="contratado">Contratado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
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
                <TableHead className="text-right min-w-[120px]">Ações</TableHead>
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
                    <TableCell className="text-xs sm:text-sm max-w-[200px] truncate">{processo.objeto || "—"}</TableCell>
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
                      {canEdit && processo.status !== "cancelado" && processo.status !== "contratado" && (
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
                          Alterar Status
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
                  {processoSelecionado?.status !== "pronto_para_contratar" && (
                    <SelectItem value="pronto_para_contratar">Pronto para Contratar</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {novoStatus === "cancelado" && (
              <div className="space-y-2">
                <Label>Motivo do Cancelamento *</Label>
                <Textarea
                  value={motivoCancelamento}
                  onChange={(e) => setMotivoCancelamento(e.target.value)}
                  placeholder="Informe o motivo do cancelamento..."
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
    </div>
  );
}
