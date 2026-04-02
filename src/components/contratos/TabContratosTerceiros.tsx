import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, FileText, Upload, Eye, Download, FileSpreadsheet } from "lucide-react";
import { DialogImportarContratos } from "./DialogImportarContratos";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import { DialogDocumentosContrato } from "./DialogDocumentosContrato";

// Helpers para formatação de moeda
const formatCurrency = (value: string): string => {
  // Remove tudo que não for dígito
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyToNumber = (value: string): number => {
  if (!value) return 0;
  // Remove pontos de milhar e troca vírgula por ponto
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
};

const numberToCurrencyString = (num: number | null | undefined): string => {
  if (!num && num !== 0) return "";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface ContratoTerceiro {
  id: string;
  contrato_gestao_id: string;
  processo_para_contratar_id: string | null;
  codigo_interno: string;
  objeto: string;
  fornecedor_id: string | null;
  data_assinatura: string | null;
  inicio_vigencia: string | null;
  fim_vigencia_atual: string | null;
  status: string;
  valor_inicial: number;
  valor_atual: number;
  criterio_reajuste: string | null;
  conta_gerencial: string | null;
  url_arquivo_principal: string | null;
  storage_path_arquivo: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: { razao_social: string; cnpj: string } | null;
}

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  vigente: "Vigente",
  encerrado: "Encerrado",
  rescindido: "Rescindido",
};

const statusColors: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-800",
  vigente: "bg-green-100 text-green-800",
  encerrado: "bg-blue-100 text-blue-800",
  rescindido: "bg-red-100 text-red-800",
};

interface Props {
  contratoGestaoId: string;
  contratoGestaoNome: string;
  processoCompraId?: string;
  processoCompraIds?: string[];
  canEdit: boolean;
  processoParaContrato?: any;
  onProcessoContratoUsado?: () => void;
}

export function TabContratosTerceiros({ contratoGestaoId, contratoGestaoNome, processoCompraId, processoCompraIds, canEdit, processoParaContrato, onProcessoContratoUsado }: Props) {
  const [contratos, setContratos] = useState<ContratoTerceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [fornecedores, setFornecedores] = useState<any[]>([]);

  // Dialog CRUD
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<ContratoTerceiro | null>(null);
  const [processoParaContratarId, setProcessoParaContratarId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    codigo_interno: "",
    objeto: "",
    fornecedor_id: "",
    data_assinatura: "",
    inicio_vigencia: "",
    fim_vigencia_atual: "",
    status: "rascunho",
    valor_inicial: "",
    valor_atual: "",
    criterio_reajuste: "",
    conta_gerencial: "",
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Confirm delete
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [contratoParaExcluir, setContratoParaExcluir] = useState<ContratoTerceiro | null>(null);

  // Dialog documentos
  const [dialogDocumentosOpen, setDialogDocumentosOpen] = useState(false);
  const [contratoDocumentos, setContratoDocumentos] = useState<ContratoTerceiro | null>(null);

  useEffect(() => {
    loadContratos();
    loadFornecedores();
  }, [contratoGestaoId, processoCompraIds]);

  // Auto-abrir dialog de criação quando vier de "Criar Contrato" no ProcessosParaContratar
  useEffect(() => {
    if (processoParaContrato) {
      setEditando(null);
      setProcessoParaContratarId(processoParaContrato.id || null);
      setFormData({
        codigo_interno: "",
        objeto: processoParaContrato.objeto || "",
        fornecedor_id: processoParaContrato.fornecedor_vencedor_id || "",
        data_assinatura: "",
        inicio_vigencia: "",
        fim_vigencia_atual: "",
        status: "rascunho",
        valor_inicial: numberToCurrencyString(processoParaContrato.valor_aprovado),
        valor_atual: numberToCurrencyString(processoParaContrato.valor_aprovado),
        criterio_reajuste: "",
        conta_gerencial: processoParaContrato.conta_gerencial || "",
      });
      setArquivo(null);
      setDialogOpen(true);
      onProcessoContratoUsado?.();
    }
  }, [processoParaContrato]);

  const loadContratos = async () => {
    try {
      let query = supabase
        .from("contratos_terceiros")
        .select("*, fornecedores(razao_social, cnpj)")
        .eq("contrato_gestao_id", contratoGestaoId);

      // Filter by processoCompraIds (array) or single processoCompraId
      // Only filter if IDs are provided - otherwise show ALL contracts (including legacy ones without process)
      if (processoCompraIds && processoCompraIds.length > 0) {
        const { data: pcData } = await supabase
          .from("processos_para_contratar")
          .select("id")
          .in("processo_compra_id", processoCompraIds);
        const pcIds = pcData?.map(p => p.id) || [];
        if (pcIds.length > 0) {
          // Show contracts linked to filtered processes OR contracts without a process link (legacy)
          query = query.or(`processo_para_contratar_id.in.(${pcIds.join(",")}),processo_para_contratar_id.is.null`);
        } else {
          // No matching processes - only show legacy contracts (without process link)
          query = query.is("processo_para_contratar_id", null);
        }
      } else if (processoCompraId) {
        const { data: pcData } = await supabase
          .from("processos_para_contratar")
          .select("id")
          .eq("processo_compra_id", processoCompraId);
        const pcIds = pcData?.map(p => p.id) || [];
        if (pcIds.length > 0) {
          query = query.or(`processo_para_contratar_id.in.(${pcIds.join(",")}),processo_para_contratar_id.is.null`);
        } else {
          query = query.is("processo_para_contratar_id", null);
        }
      }
      // If no processoCompraIds and no processoCompraId, load ALL contracts for this contrato_gestao

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setContratos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar contratos");
    } finally {
      setLoading(false);
    }
  };

  const loadFornecedores = async () => {
    const { data } = await supabase
      .from("fornecedores")
      .select("id, razao_social, cnpj")
      .eq("ativo", true)
      .eq("status_aprovacao", "aprovado")
      .order("razao_social");
    setFornecedores(data || []);
  };

  const sanitizeFileName = (name: string) => {
    return name
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");
  };

  const handleSalvar = async () => {
    if (!formData.codigo_interno.trim() || !formData.objeto.trim()) {
      toast.error("Preencha os campos obrigatórios (Código e Objeto)");
      return;
    }

    try {
      setUploading(true);
      let urlArquivo = editando?.url_arquivo_principal || null;
      let storagePath = editando?.storage_path_arquivo || null;

      // Upload de arquivo
      if (arquivo) {
        const safeName = sanitizeFileName(arquivo.name);
        const path = `contratos/${contratoGestaoId}/${formData.codigo_interno}/${Date.now()}_${safeName}`;
        const oldStoragePath = editando?.storage_path_arquivo || null;
        
        const { error: uploadError } = await supabase.storage
          .from("processo-anexos")
          .upload(path, arquivo);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("processo-anexos").getPublicUrl(path);
        urlArquivo = urlData.publicUrl;
        storagePath = path;

        // Deletar arquivo anterior APÓS sucesso do upload
        if (oldStoragePath) {
          await supabase.storage.from("processo-anexos").remove([oldStoragePath]);
        }
      }

      const payload = {
        contrato_gestao_id: contratoGestaoId,
        processo_para_contratar_id: editando ? editando.processo_para_contratar_id : processoParaContratarId,
        codigo_interno: formData.codigo_interno.trim(),
        objeto: formData.objeto.trim(),
        fornecedor_id: formData.fornecedor_id || null,
        data_assinatura: formData.data_assinatura || null,
        inicio_vigencia: formData.inicio_vigencia || null,
        fim_vigencia_atual: formData.fim_vigencia_atual || null,
        status: formData.status,
        valor_inicial: parseCurrencyToNumber(formData.valor_inicial),
        valor_atual: parseCurrencyToNumber(formData.valor_atual),
        criterio_reajuste: formData.criterio_reajuste || null,
        conta_gerencial: formData.conta_gerencial || null,
        url_arquivo_principal: urlArquivo,
        storage_path_arquivo: storagePath,
      };

      if (editando) {
        const { error } = await supabase
          .from("contratos_terceiros")
          .update(payload)
          .eq("id", editando.id);
        if (error) throw error;

        // Buscar numero_processo para auditoria
        let numProcesso = '';
        if (editando.processo_para_contratar_id) {
          const { data: ppc } = await supabase.from("processos_para_contratar").select("processo_compra_id").eq("id", editando.processo_para_contratar_id).maybeSingle();
          if (ppc?.processo_compra_id) {
            const { data: pc } = await supabase.from("processos_compras").select("numero_processo_interno").eq("id", ppc.processo_compra_id).maybeSingle();
            numProcesso = pc?.numero_processo_interno || '';
          }
        }

        await registrarAuditoria({
          acao: 'edição',
          entidade: 'Contrato com Terceiro',
          entidade_id: editando.id,
          detalhes: {
            tipo: 'Contrato com Terceiro',
            codigo_interno: formData.codigo_interno,
            contrato_gestao: contratoGestaoNome,
            objeto: formData.objeto,
            numero_processo: numProcesso,
            arquivo_substituido: arquivo ? 'Sim' : 'Não',
          },
        });
        toast.success("Contrato atualizado!");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("contratos_terceiros")
          .insert({ ...payload, usuario_criador_id: user?.id });
        if (error) throw error;

        // Buscar numero_processo para auditoria
        let numProcesso = '';
        if (processoParaContratarId) {
          const { data: ppc } = await supabase.from("processos_para_contratar").select("processo_compra_id").eq("id", processoParaContratarId).maybeSingle();
          if (ppc?.processo_compra_id) {
            const { data: pc } = await supabase.from("processos_compras").select("numero_processo_interno").eq("id", ppc.processo_compra_id).maybeSingle();
            numProcesso = pc?.numero_processo_interno || '';
          }
        }

        await registrarAuditoria({
          acao: 'criação',
          entidade: 'Contrato com Terceiro',
          detalhes: {
            tipo: 'Contrato com Terceiro',
            codigo_interno: formData.codigo_interno,
            contrato_gestao: contratoGestaoNome,
            objeto: formData.objeto,
            numero_processo: numProcesso,
          },
        });
        toast.success("Contrato criado!");

        // Marcar processo como contratado
        const ppcId = processoParaContratarId;
        if (ppcId) {
          await supabase.from("processos_para_contratar").update({ status: "contratado" }).eq("id", ppcId);
        }
      }

      setDialogOpen(false);
      setEditando(null);
      setProcessoParaContratarId(null);
      setArquivo(null);
      await loadContratos();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleExcluir = async () => {
    if (!contratoParaExcluir) return;
    try {
      // Deletar documentos do contrato e seus arquivos
      const { data: docs } = await supabase
        .from("documentos_contrato")
        .select("storage_path")
        .eq("contrato_terceiro_id", contratoParaExcluir.id);

      const pathsToDelete: string[] = [];
      docs?.forEach(d => { if (d.storage_path) pathsToDelete.push(d.storage_path); });
      if (contratoParaExcluir.storage_path_arquivo) pathsToDelete.push(contratoParaExcluir.storage_path_arquivo);

      if (pathsToDelete.length > 0) {
        await supabase.storage.from("processo-anexos").remove(pathsToDelete);
      }

      const processoParaContratarId = contratoParaExcluir.processo_para_contratar_id;

      const { error } = await supabase
        .from("contratos_terceiros")
        .delete()
        .eq("id", contratoParaExcluir.id);
      if (error) throw error;

      // Reverter processo para contratar para "pronto_para_contratar"
      if (processoParaContratarId) {
        await supabase.from("processos_para_contratar").update({ status: "pronto_para_contratar" }).eq("id", processoParaContratarId);
      }

      // Buscar numero_processo para auditoria
      let numProcesso = '';
      if (contratoParaExcluir.processo_para_contratar_id) {
        const { data: ppc } = await supabase.from("processos_para_contratar").select("processo_compra_id").eq("id", contratoParaExcluir.processo_para_contratar_id).maybeSingle();
        if (ppc?.processo_compra_id) {
          const { data: pc } = await supabase.from("processos_compras").select("numero_processo_interno").eq("id", ppc.processo_compra_id).maybeSingle();
          numProcesso = pc?.numero_processo_interno || '';
        }
      }

      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'Contrato com Terceiro',
        entidade_id: contratoParaExcluir.id,
        detalhes: {
          tipo: 'Contrato com Terceiro',
          codigo_interno: contratoParaExcluir.codigo_interno,
          contrato_gestao: contratoGestaoNome,
          objeto: contratoParaExcluir.objeto,
          numero_processo: numProcesso,
          arquivos_removidos: pathsToDelete.length,
        },
      });

      toast.success("Contrato excluído!");
      setConfirmDeleteOpen(false);
      setContratoParaExcluir(null);
      await loadContratos();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  const abrirDialogCriar = () => {
    setEditando(null);
    setProcessoParaContratarId(null);
    setFormData({
      codigo_interno: "",
      objeto: "",
      fornecedor_id: "",
      data_assinatura: "",
      inicio_vigencia: "",
      fim_vigencia_atual: "",
      status: "rascunho",
      valor_inicial: "",
      valor_atual: "",
      criterio_reajuste: "",
      conta_gerencial: "",
    });
    setArquivo(null);
    setDialogOpen(true);
  };

  const abrirDialogEditar = (contrato: ContratoTerceiro) => {
    setEditando(contrato);
    setFormData({
      codigo_interno: contrato.codigo_interno,
      objeto: contrato.objeto,
      fornecedor_id: contrato.fornecedor_id || "",
      data_assinatura: contrato.data_assinatura || "",
      inicio_vigencia: contrato.inicio_vigencia || "",
      fim_vigencia_atual: contrato.fim_vigencia_atual || "",
      status: contrato.status,
      valor_inicial: numberToCurrencyString(contrato.valor_inicial),
      valor_atual: numberToCurrencyString(contrato.valor_atual),
      criterio_reajuste: contrato.criterio_reajuste || "",
      conta_gerencial: contrato.conta_gerencial || "",
    });
    setArquivo(null);
    setDialogOpen(true);
  };

  // Filtrar contratos rescindidos/encerrados (vão para aba Vencidos/Encerrados)
  const contratosAtivos = contratos.filter(c => c.status !== "rescindido" && c.status !== "encerrado");

  const contratosFiltrados = contratosAtivos.filter((c) =>
    c.codigo_interno.toLowerCase().includes(filtro.toLowerCase()) ||
    c.objeto.toLowerCase().includes(filtro.toLowerCase()) ||
    (c.fornecedores?.razao_social || "").toLowerCase().includes(filtro.toLowerCase())
  );

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <Input
          placeholder="Buscar por código, objeto ou fornecedor..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="flex-1 text-sm"
        />
        {canEdit && (
          <Button onClick={abrirDialogCriar} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Novo Contrato
          </Button>
        )}
      </div>

      {contratosFiltrados.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum contrato com terceiro cadastrado
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Contrato/Ano</TableHead>
                <TableHead>Objeto</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Valor Atual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contratosFiltrados.map((contrato) => (
                <TableRow key={contrato.id}>
                  <TableCell className="font-medium text-xs sm:text-sm">{contrato.codigo_interno}</TableCell>
                  <TableCell className="text-xs sm:text-sm max-w-[200px] truncate">{contrato.objeto}</TableCell>
                  <TableCell className="text-xs sm:text-sm">
                    {contrato.fornecedores?.razao_social || "—"}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm">
                    {contrato.inicio_vigencia && contrato.fim_vigencia_atual
                      ? `${format(new Date(contrato.inicio_vigencia + "T12:00:00"), "dd/MM/yy")} - ${format(new Date(contrato.fim_vigencia_atual + "T12:00:00"), "dd/MM/yy")}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm">
                    {contrato.valor_atual > 0 
                      ? `R$ ${contrato.valor_atual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` 
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${statusColors[contrato.status] || ""}`}>
                      {statusLabels[contrato.status] || contrato.status}
                    </Badge>
                    {contrato.status === "vigente" && contrato.fim_vigencia_atual && (() => {
                      const hoje = toZonedTime(new Date(), "America/Sao_Paulo");
                      const fimDate = new Date(contrato.fim_vigencia_atual + "T23:59:59-03:00");
                      const dias = differenceInDays(fimDate, hoje);
                      if (dias >= 0) {
                        return <span className={`text-[10px] block ${dias <= 45 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{dias} dias</span>;
                      } else {
                        return <span className="text-[10px] block text-red-600 font-semibold">Vencido</span>;
                      }
                    })()}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setContratoDocumentos(contrato);
                        setDialogDocumentosOpen(true);
                      }}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      Docs
                    </Button>
                    {contrato.url_arquivo_principal && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => window.open(contrato.url_arquivo_principal!, "_blank")}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                    {canEdit && (
                      <>
                         <Button variant="outline" size="sm" className="text-xs" onClick={() => abrirDialogEditar(contrato)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs"
                          onClick={() => { setContratoParaExcluir(contrato); setConfirmDeleteOpen(true); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog Criar/Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Contrato" : "Novo Contrato com Terceiro"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nº do Contrato-Ano *</Label>
              <Input value={formData.codigo_interno} onChange={(e) => setFormData({...formData, codigo_interno: e.target.value})} placeholder="Ex: 001-2026" />
            </div>
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              {formData.fornecedor_id ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50 min-h-[40px]">
                  <span className="text-sm">
                    {fornecedores.find(f => f.id === formData.fornecedor_id)?.razao_social || "Fornecedor vinculado"}
                  </span>
                </div>
              ) : (
                <Select value={formData.fornecedor_id} onValueChange={(v) => setFormData({...formData, fornecedor_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {fornecedores.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.razao_social} ({f.cnpj})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Objeto *</Label>
              <Textarea value={formData.objeto} onChange={(e) => setFormData({...formData, objeto: e.target.value})} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Data de Assinatura</Label>
              <Input type="date" value={formData.data_assinatura} onChange={(e) => setFormData({...formData, data_assinatura: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="vigente">Vigente</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                  <SelectItem value="rescindido">Rescindido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Início Vigência</Label>
              <Input type="date" value={formData.inicio_vigencia} onChange={(e) => setFormData({...formData, inicio_vigencia: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Fim Vigência</Label>
              <Input type="date" value={formData.fim_vigencia_atual} onChange={(e) => setFormData({...formData, fim_vigencia_atual: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Valor Inicial (R$)</Label>
              <Input value={formData.valor_inicial} onChange={(e) => setFormData({...formData, valor_inicial: formatCurrency(e.target.value)})} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Valor Atual (R$)</Label>
              <Input value={formData.valor_atual} onChange={(e) => setFormData({...formData, valor_atual: formatCurrency(e.target.value)})} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Critério de Reajuste</Label>
              <Input value={formData.criterio_reajuste} onChange={(e) => setFormData({...formData, criterio_reajuste: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Rubrica</Label>
              <Input value={formData.conta_gerencial} onChange={(e) => setFormData({...formData, conta_gerencial: e.target.value})} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Arquivo Principal do Contrato {editando?.url_arquivo_principal ? "(substituir)" : ""}</Label>
              <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
              {editando?.url_arquivo_principal && !arquivo && (
                <p className="text-xs text-muted-foreground">Arquivo atual mantido. Selecione um novo para substituir.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={uploading}>
              {uploading ? "Salvando..." : editando ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={handleExcluir}
        title="Excluir Contrato"
        description={`Tem certeza que deseja excluir o contrato "${contratoParaExcluir?.codigo_interno}"? Todos os documentos vinculados serão removidos permanentemente.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
      />

      {/* Dialog Documentos do Contrato */}
      {contratoDocumentos && (
        <DialogDocumentosContrato
          open={dialogDocumentosOpen}
          onOpenChange={setDialogDocumentosOpen}
          contratoTerceiro={contratoDocumentos}
          contratoGestaoNome={contratoGestaoNome}
          canEdit={canEdit}
          onContratoAtualizado={loadContratos}
        />
      )}
    </div>
  );
}
