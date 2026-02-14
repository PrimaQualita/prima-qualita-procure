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
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

interface DocumentoContrato {
  id: string;
  contrato_terceiro_id: string;
  tipo: string;
  nome: string;
  data_documento: string | null;
  natureza: string | null;
  novo_prazo: string | null;
  percentual_indice: number | null;
  novo_valor: number | null;
  justificativa: string | null;
  url_arquivo: string | null;
  storage_path: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoTerceiro: any;
  contratoGestaoNome: string;
  canEdit: boolean;
  onContratoAtualizado: () => void;
}

const tipoLabels: Record<string, string> = {
  termo_aditivo: "Termo Aditivo",
  apostilamento: "Apostilamento",
  rescisao: "Rescisão",
  outros: "Outros",
};

const naturezaLabels: Record<string, string> = {
  prazo: "Prazo",
  reajuste: "Reajuste",
  realinhamento: "Realinhamento",
  quantidade: "Quantidade",
  escopo: "Escopo",
  outro: "Outro",
};

export function DialogDocumentosContrato({
  open, onOpenChange, contratoTerceiro, contratoGestaoNome, canEdit, onContratoAtualizado
}: Props) {
  const [documentos, setDocumentos] = useState<DocumentoContrato[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog CRUD
  const [dialogFormOpen, setDialogFormOpen] = useState(false);
  const [editando, setEditando] = useState<DocumentoContrato | null>(null);
  const [formData, setFormData] = useState({
    tipo: "termo_aditivo",
    nome: "",
    data_documento: "",
    natureza: "",
    novo_prazo: "",
    percentual_indice: "",
    novo_valor: "",
    justificativa: "",
    data_assinatura_doc: "",
    data_rescisao: "",
    inicio_vigencia_doc: "",
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [docParaExcluir, setDocParaExcluir] = useState<DocumentoContrato | null>(null);

  useEffect(() => {
    if (open) loadDocumentos();
  }, [open, contratoTerceiro?.id]);

  const loadDocumentos = async () => {
    try {
      const { data, error } = await supabase
        .from("documentos_contrato")
        .select("*")
        .eq("contrato_terceiro_id", contratoTerceiro.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDocumentos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar documentos");
    } finally {
      setLoading(false);
    }
  };

  const sanitizeFileName = (name: string) => {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  };

  const handleSalvar = async () => {
    if (!formData.nome.trim()) {
      toast.error("Informe o nome do documento");
      return;
    }
    if (!arquivo && !editando?.url_arquivo) {
      toast.error("Anexe um arquivo ao documento");
      return;
    }

    try {
      setUploading(true);
      let urlArquivo = editando?.url_arquivo || null;
      let storagePath = editando?.storage_path || null;

      if (arquivo) {
        const safeName = sanitizeFileName(arquivo.name);
        const path = `contratos/${contratoTerceiro.contrato_gestao_id}/${contratoTerceiro.codigo_interno}/docs/${Date.now()}_${safeName}`;
        
        const { error: uploadError } = await supabase.storage.from("processo-anexos").upload(path, arquivo);
        if (uploadError) throw uploadError;

        // Deletar anterior
        if (editando?.storage_path) {
          await supabase.storage.from("processo-anexos").remove([editando.storage_path]);
        }

        const { data: urlData } = supabase.storage.from("processo-anexos").getPublicUrl(path);
        urlArquivo = urlData.publicUrl;
        storagePath = path;
      }

      const parsedPercentual = formData.percentual_indice ? parseFloat(formData.percentual_indice.replace(/\./g, "").replace(",", ".")) : null;
      const parsedNovoValor = formData.novo_valor ? parseFloat(formData.novo_valor.replace(/\./g, "").replace(",", ".")) : null;

      const payload = {
        contrato_terceiro_id: contratoTerceiro.id,
        tipo: formData.tipo,
        nome: formData.nome.trim(),
        data_documento: formData.data_documento || null,
        natureza: formData.natureza || null,
        novo_prazo: formData.novo_prazo || null,
        percentual_indice: parsedPercentual && !isNaN(parsedPercentual) ? parsedPercentual : null,
        novo_valor: parsedNovoValor && !isNaN(parsedNovoValor) ? parsedNovoValor : null,
        justificativa: formData.justificativa || null,
        url_arquivo: urlArquivo,
        storage_path: storagePath,
      };

      if (editando) {
        const { error } = await supabase.from("documentos_contrato").update(payload).eq("id", editando.id);
        if (error) throw error;
        toast.success("Documento atualizado!");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("documentos_contrato").insert({ ...payload, usuario_criador_id: user?.id });
        if (error) throw error;
        toast.success("Documento adicionado!");
      }

      // Atualizar vigência/valor do contrato conforme natureza
      if (formData.natureza === "prazo" && formData.novo_prazo) {
        const updateData: any = { fim_vigencia_atual: formData.novo_prazo, status: "vigente" };
        if (formData.inicio_vigencia_doc) {
          updateData.inicio_vigencia = formData.inicio_vigencia_doc;
        }
        await supabase.from("contratos_terceiros").update(updateData).eq("id", contratoTerceiro.id);
      }
      if ((formData.natureza === "reajuste" || formData.natureza === "realinhamento" || formData.natureza === "quantidade") && formData.novo_valor) {
        const novoValorNum = parseFloat(formData.novo_valor.replace(/\./g, "").replace(",", "."));
        if (!isNaN(novoValorNum)) {
          await supabase.from("contratos_terceiros").update({ valor_atual: novoValorNum }).eq("id", contratoTerceiro.id);
        }
      }
      // Se é rescisão, alterar status do contrato para rescindido
      if (formData.tipo === "rescisao") {
        await supabase.from("contratos_terceiros").update({ status: "rescindido" }).eq("id", contratoTerceiro.id);
      }

      await registrarAuditoria({
        acao: editando ? 'edição' : 'criação',
        entidade: 'Documento de Contrato',
        entidade_id: editando?.id,
        detalhes: {
          tipo: tipoLabels[formData.tipo] || formData.tipo,
          nome_documento: formData.nome,
          natureza: naturezaLabels[formData.natureza] || formData.natureza,
          contrato_codigo: contratoTerceiro.codigo_interno,
          contrato_gestao: contratoGestaoNome,
          arquivo_substituido: arquivo && editando ? 'Sim' : 'Não',
        },
      });

      setDialogFormOpen(false);
      setEditando(null);
      setArquivo(null);
      await loadDocumentos();
      onContratoAtualizado();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleExcluir = async () => {
    if (!docParaExcluir) return;
    try {
      if (docParaExcluir.storage_path) {
        await supabase.storage.from("processo-anexos").remove([docParaExcluir.storage_path]);
      }
      const { error } = await supabase.from("documentos_contrato").delete().eq("id", docParaExcluir.id);
      if (error) throw error;

      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'Documento de Contrato',
        entidade_id: docParaExcluir.id,
        detalhes: {
          tipo: tipoLabels[docParaExcluir.tipo] || docParaExcluir.tipo,
          nome_documento: docParaExcluir.nome,
          contrato_codigo: contratoTerceiro.codigo_interno,
          contrato_gestao: contratoGestaoNome,
        },
      });

      toast.success("Documento excluído!");
      setConfirmDeleteOpen(false);
      setDocParaExcluir(null);
      await loadDocumentos();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  const abrirCriar = () => {
    setEditando(null);
    setFormData({ tipo: "termo_aditivo", nome: "", data_documento: "", natureza: "", novo_prazo: "", percentual_indice: "", novo_valor: "", justificativa: "", data_assinatura_doc: "", data_rescisao: "", inicio_vigencia_doc: "" });
    setArquivo(null);
    setDialogFormOpen(true);
  };

  const abrirEditar = (doc: DocumentoContrato) => {
    setEditando(doc);
    setFormData({
      tipo: doc.tipo,
      nome: doc.nome,
      data_documento: doc.data_documento || "",
      natureza: doc.natureza || "",
      novo_prazo: doc.novo_prazo || "",
      percentual_indice: doc.percentual_indice?.toString() || "",
      novo_valor: doc.novo_valor ? doc.novo_valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
      justificativa: doc.justificativa || "",
      data_assinatura_doc: "",
      data_rescisao: "",
      inicio_vigencia_doc: "",
    });
    setArquivo(null);
    setDialogFormOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Documentos do Contrato: {contratoTerceiro.codigo_interno}</DialogTitle>
          <DialogDescription>{contratoTerceiro.objeto}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {canEdit && (
            <Button onClick={abrirCriar} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Adicionar Documento
            </Button>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : documentos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento cadastrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Natureza</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{tipoLabels[doc.tipo] || doc.tipo}</Badge>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm">{doc.nome}</TableCell>
                    <TableCell className="text-xs">{naturezaLabels[doc.natureza || ""] || doc.natureza || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {doc.data_documento ? format(new Date(doc.data_documento + "T12:00:00"), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {doc.url_arquivo && (
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => window.open(doc.url_arquivo!, "_blank")}>
                          <Eye className="h-3 w-3" />
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => abrirEditar(doc)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="destructive" size="sm" className="text-xs" onClick={() => { setDocParaExcluir(doc); setConfirmDeleteOpen(true); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Sub-dialog criar/editar documento */}
        <Dialog open={dialogFormOpen} onOpenChange={setDialogFormOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Documento" : "Novo Documento"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={formData.tipo} onValueChange={(v) => setFormData({...formData, tipo: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="termo_aditivo">Termo Aditivo</SelectItem>
                    <SelectItem value="apostilamento">Apostilamento</SelectItem>
                    <SelectItem value="rescisao">Rescisão</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Natureza</Label>
                <Select value={formData.natureza} onValueChange={(v) => setFormData({...formData, natureza: v})}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prazo">Prazo</SelectItem>
                    <SelectItem value="reajuste">Reajuste</SelectItem>
                    <SelectItem value="realinhamento">Realinhamento</SelectItem>
                    <SelectItem value="quantidade">Quantidade</SelectItem>
                    <SelectItem value="escopo">Escopo</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome *</Label>
                <Input value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={formData.data_documento} onChange={(e) => setFormData({...formData, data_documento: e.target.value})} />
              </div>
              {formData.natureza === "prazo" && (
                <div className="space-y-2">
                  <Label>Novo Prazo</Label>
                  <Input type="date" value={formData.novo_prazo} onChange={(e) => setFormData({...formData, novo_prazo: e.target.value})} />
                </div>
              )}
              {(formData.natureza === "reajuste" || formData.natureza === "realinhamento") && (
                <div className="space-y-2">
                  <Label>Percentual / Índice</Label>
                  <Input type="number" step="0.01" value={formData.percentual_indice} onChange={(e) => setFormData({...formData, percentual_indice: e.target.value})} />
                </div>
              )}
              {(formData.natureza === "reajuste" || formData.natureza === "realinhamento" || formData.natureza === "quantidade") && (
                <div className="space-y-2">
                  <Label>Novo Valor (R$)</Label>
                  <Input value={formData.novo_valor} onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    if (!digits) { setFormData({...formData, novo_valor: ""}); return; }
                    const num = parseInt(digits, 10) / 100;
                    setFormData({...formData, novo_valor: num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })});
                  }} placeholder="0,00" />
                </div>
              )}
              {/* Rescisão fields */}
              {formData.tipo === "rescisao" && (
                <>
                  <div className="space-y-2">
                    <Label>Data de Assinatura</Label>
                    <Input type="date" value={formData.data_assinatura_doc} onChange={(e) => setFormData({...formData, data_assinatura_doc: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data da Rescisão</Label>
                    <Input type="date" value={formData.data_rescisao} onChange={(e) => setFormData({...formData, data_rescisao: e.target.value})} />
                  </div>
                </>
              )}
              {/* Campos para Termo Aditivo - Prazo e Vigência */}
              {formData.tipo === "termo_aditivo" && formData.natureza === "prazo" && (
                <div className="space-y-2">
                  <Label>Início da Nova Vigência</Label>
                  <Input type="date" value={formData.inicio_vigencia_doc} onChange={(e) => setFormData({...formData, inicio_vigencia_doc: e.target.value})} />
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label>Justificativa / Motivo</Label>
                <Textarea value={formData.justificativa} onChange={(e) => setFormData({...formData, justificativa: e.target.value})} rows={2} placeholder={formData.tipo === "rescisao" ? "Motivo da rescisão..." : "Justificativa..."} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Arquivo {editando?.url_arquivo ? "(substituir)" : ""}</Label>
                <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogFormOpen(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={uploading}>{uploading ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          onConfirm={handleExcluir}
          title="Excluir Documento"
          description={`Excluir "${docParaExcluir?.nome}"? O arquivo será removido permanentemente.`}
          confirmText="Excluir"
          cancelText="Cancelar"
          variant="destructive"
        />
      </DialogContent>
    </Dialog>
  );
}
