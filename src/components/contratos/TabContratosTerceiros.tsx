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
import { Plus, Pencil, Trash2, FileText, Upload, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import { DialogDocumentosContrato } from "./DialogDocumentosContrato";

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

interface Props {
  contratoGestaoId: string;
  contratoGestaoNome: string;
  canEdit: boolean;
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

export function TabContratosTerceiros({ contratoGestaoId, contratoGestaoNome, canEdit }: Props) {
  const [contratos, setContratos] = useState<ContratoTerceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [fornecedores, setFornecedores] = useState<any[]>([]);

  // Dialog CRUD
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<ContratoTerceiro | null>(null);
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
  }, [contratoGestaoId]);

  const loadContratos = async () => {
    try {
      const { data, error } = await supabase
        .from("contratos_terceiros")
        .select("*, fornecedores(razao_social, cnpj)")
        .eq("contrato_gestao_id", contratoGestaoId)
        .order("created_at", { ascending: false });

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
        
        const { error: uploadError } = await supabase.storage
          .from("processo-anexos")
          .upload(path, arquivo);

        if (uploadError) throw uploadError;

        // Deletar arquivo anterior se existir
        if (editando?.storage_path_arquivo) {
          await supabase.storage.from("processo-anexos").remove([editando.storage_path_arquivo]);
        }

        const { data: urlData } = supabase.storage.from("processo-anexos").getPublicUrl(path);
        urlArquivo = urlData.publicUrl;
        storagePath = path;
      }

      const payload = {
        contrato_gestao_id: contratoGestaoId,
        codigo_interno: formData.codigo_interno.trim(),
        objeto: formData.objeto.trim(),
        fornecedor_id: formData.fornecedor_id || null,
        data_assinatura: formData.data_assinatura || null,
        inicio_vigencia: formData.inicio_vigencia || null,
        fim_vigencia_atual: formData.fim_vigencia_atual || null,
        status: formData.status,
        valor_inicial: parseFloat(formData.valor_inicial) || 0,
        valor_atual: parseFloat(formData.valor_atual) || 0,
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

        await registrarAuditoria({
          acao: 'edição',
          entidade: 'Contrato com Terceiro',
          entidade_id: editando.id,
          detalhes: {
            tipo: 'Contrato com Terceiro',
            codigo_interno: formData.codigo_interno,
            contrato_gestao: contratoGestaoNome,
            objeto: formData.objeto,
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

        await registrarAuditoria({
          acao: 'criação',
          entidade: 'Contrato com Terceiro',
          detalhes: {
            tipo: 'Contrato com Terceiro',
            codigo_interno: formData.codigo_interno,
            contrato_gestao: contratoGestaoNome,
            objeto: formData.objeto,
          },
        });
        toast.success("Contrato criado!");
      }

      setDialogOpen(false);
      setEditando(null);
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

      const { error } = await supabase
        .from("contratos_terceiros")
        .delete()
        .eq("id", contratoParaExcluir.id);
      if (error) throw error;

      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'Contrato com Terceiro',
        entidade_id: contratoParaExcluir.id,
        detalhes: {
          tipo: 'Contrato com Terceiro',
          codigo_interno: contratoParaExcluir.codigo_interno,
          contrato_gestao: contratoGestaoNome,
          objeto: contratoParaExcluir.objeto,
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
      valor_inicial: contrato.valor_inicial?.toString() || "",
      valor_atual: contrato.valor_atual?.toString() || "",
      criterio_reajuste: contrato.criterio_reajuste || "",
      conta_gerencial: contrato.conta_gerencial || "",
    });
    setArquivo(null);
    setDialogOpen(true);
  };

  const contratosFiltrados = contratos.filter((c) =>
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
                <TableHead>Código</TableHead>
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
                        {contrato.status === "rascunho" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="text-xs"
                            onClick={() => { setContratoParaExcluir(contrato); setConfirmDeleteOpen(true); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
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
              <Label>Código Interno *</Label>
              <Input value={formData.codigo_interno} onChange={(e) => setFormData({...formData, codigo_interno: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Select value={formData.fornecedor_id} onValueChange={(v) => setFormData({...formData, fornecedor_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {fornecedores.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.razao_social} ({f.cnpj})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Input type="number" step="0.01" value={formData.valor_inicial} onChange={(e) => setFormData({...formData, valor_inicial: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Valor Atual (R$)</Label>
              <Input type="number" step="0.01" value={formData.valor_atual} onChange={(e) => setFormData({...formData, valor_atual: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Critério de Reajuste</Label>
              <Input value={formData.criterio_reajuste} onChange={(e) => setFormData({...formData, criterio_reajuste: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Conta Gerencial</Label>
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
