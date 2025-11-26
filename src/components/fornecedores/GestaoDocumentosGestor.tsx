import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { FileText, ExternalLink, AlertCircle, Edit, Trash2, RefreshCw, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, startOfDay, parseISO, format } from "date-fns";

interface Documento {
  id: string;
  tipo_documento: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_validade: string | null;
  data_upload: string;
  em_vigor: boolean;
}

interface Props {
  fornecedorId: string;
}

const DOCUMENTOS_VALIDADE = [
  { tipo: "contrato_social", label: "Contrato Social Consolidado", temValidade: false },
  { tipo: "cartao_cnpj", label: "Cartão CNPJ", temValidade: false },
  { tipo: "inscricao_estadual_municipal", label: "Inscrição Estadual ou Municipal", temValidade: false },
  { tipo: "cnd_federal", label: "CND Federal", temValidade: true },
  { tipo: "cnd_tributos_estaduais", label: "CND Tributos Estaduais", temValidade: true },
  { tipo: "cnd_divida_ativa_estadual", label: "CND Dívida Ativa Estadual", temValidade: true },
  { tipo: "cnd_tributos_municipais", label: "CND Tributos Municipais", temValidade: true },
  { tipo: "cnd_divida_ativa_municipal", label: "CND Dívida Ativa Municipal", temValidade: true },
  { tipo: "crf_fgts", label: "CRF FGTS", temValidade: true },
  { tipo: "cndt", label: "CNDT", temValidade: true },
  { tipo: "certificado_gestor", label: "Certificado de Fornecedor", temValidade: true },
];

export default function GestaoDocumentosGestor({ fornecedorId }: Props) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documentoEditando, setDocumentoEditando] = useState<Documento | null>(null);
  const [novaDataValidade, setNovaDataValidade] = useState("");
  const [processando, setProcessando] = useState(false);
  const [documentoParaExcluir, setDocumentoParaExcluir] = useState<Documento | null>(null);
  const [dialogSolicitarAtualizacao, setDialogSolicitarAtualizacao] = useState(false);
  const [documentoSolicitarAtualizacao, setDocumentoSolicitarAtualizacao] = useState<Documento | null>(null);
  const [motivoAtualizacao, setMotivoAtualizacao] = useState("");

  useEffect(() => {
    loadDocumentos();
  }, [fornecedorId]);

  const loadDocumentos = async () => {
    try {
      const { data, error } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .order("data_upload", { ascending: false });

      if (error) throw error;
      setDocumentos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar documentos");
    } finally {
      setLoading(false);
    }
  };

  const getStatusValidade = (dataValidade: string | null) => {
    if (!dataValidade) {
      return { 
        label: "Sem validade", 
        variant: "outline" as const, 
        diasRestantes: null as number | null,
        cor: "text-gray-600" 
      };
    }

    const hoje = startOfDay(new Date());
    const validade = startOfDay(parseISO(dataValidade));
    const diasRestantes = differenceInDays(validade, hoje);

    if (diasRestantes < 0) {
      return { 
        label: "Vencido", 
        variant: "destructive" as const, 
        diasRestantes: diasRestantes as number | null,
        cor: "text-red-600 bg-red-50"
      };
    } else if (diasRestantes <= 30) {
      return { 
        label: `Vence em ${diasRestantes} dias`, 
        variant: "outline" as const, 
        diasRestantes: diasRestantes as number | null,
        cor: "text-yellow-600 bg-yellow-50"
      };
    } else {
      return { 
        label: `Válido (${diasRestantes} dias)`, 
        variant: "outline" as const, 
        diasRestantes: diasRestantes as number | null,
        cor: "text-green-600 bg-green-50"
      };
    }
  };

  const handleAbrirDialogEditar = (doc: Documento) => {
    setDocumentoEditando(doc);
    // Extrair apenas a parte da data do ISO string
    const dataISO = doc.data_validade?.split('T')[0] || "";
    setNovaDataValidade(dataISO);
    setDialogOpen(true);
  };

  const handleSalvarDataValidade = async () => {
    if (!documentoEditando) return;

    const docConfig = DOCUMENTOS_VALIDADE.find(d => d.tipo === documentoEditando.tipo_documento);
    if (docConfig?.temValidade && !novaDataValidade) {
      toast.error("Informe a data de validade");
      return;
    }

    setProcessando(true);
    try {
      // Converter data para formato ISO sem problemas de timezone
      const dataValidadeISO = novaDataValidade 
        ? `${novaDataValidade}T00:00:00.000Z`
        : null;

      const { error } = await supabase
        .from("documentos_fornecedor")
        .update({ data_validade: dataValidadeISO })
        .eq("id", documentoEditando.id);

      if (error) throw error;

      toast.success("Data de validade atualizada com sucesso!");
      setDialogOpen(false);
      loadDocumentos();
    } catch (error: any) {
      console.error("Erro ao atualizar data de validade:", error);
      toast.error("Erro ao atualizar data de validade");
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluirDocumento = async () => {
    if (!documentoParaExcluir) return;

    setProcessando(true);
    try {
      // 1. Deletar arquivo do storage
      const pathMatch = documentoParaExcluir.url_arquivo.match(/processo-anexos\/(.+)$/);
      if (pathMatch) {
        const filePath = pathMatch[1];
        const { error: storageError } = await supabase.storage
          .from('processo-anexos')
          .remove([filePath]);
        
        if (storageError) {
          console.error("Erro ao deletar arquivo do storage:", storageError);
        }
      }

      // 2. Deletar registro do banco
      const { error } = await supabase
        .from("documentos_fornecedor")
        .delete()
        .eq("id", documentoParaExcluir.id);

      if (error) throw error;

      toast.success("Documento excluído com sucesso!");
      setDocumentoParaExcluir(null);
      loadDocumentos();
    } catch (error: any) {
      console.error("Erro ao excluir documento:", error);
      toast.error("Erro ao excluir documento");
    } finally {
      setProcessando(false);
    }
  };


  const getTipoDocumentoLabel = (tipo: string) => {
    return DOCUMENTOS_VALIDADE.find(d => d.tipo === tipo)?.label || tipo;
  };

  const handleAbrirDialogSolicitarAtualizacao = (doc: Documento) => {
    setDocumentoSolicitarAtualizacao(doc);
    setMotivoAtualizacao("");
    setDialogSolicitarAtualizacao(true);
  };

  const handleSolicitarAtualizacao = async () => {
    if (!documentoSolicitarAtualizacao) return;

    if (!motivoAtualizacao.trim()) {
      toast.error("Informe o motivo da solicitação de atualização");
      return;
    }

    setProcessando(true);
    try {
      const { error } = await supabase
        .from("documentos_fornecedor")
        .update({ 
          atualizacao_solicitada: true,
          motivo_solicitacao_atualizacao: motivoAtualizacao.trim(),
          data_solicitacao_atualizacao: new Date().toISOString()
        })
        .eq("id", documentoSolicitarAtualizacao.id);

      if (error) throw error;

      toast.success("Solicitação de atualização enviada com sucesso!");
      setDialogSolicitarAtualizacao(false);
      setDocumentoSolicitarAtualizacao(null);
      setMotivoAtualizacao("");
      loadDocumentos();
    } catch (error: any) {
      console.error("Erro ao solicitar atualização:", error);
      toast.error("Erro ao solicitar atualização");
    } finally {
      setProcessando(false);
    }
  };

  const getDocumentoMaisRecente = (tipo: string) => {
    return documentos.find(d => d.tipo_documento === tipo && d.em_vigor);
  };

  if (loading) {
    return <div className="text-center py-8">Carregando documentos...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Documentos e Certidões do Fornecedor</CardTitle>
          <CardDescription>
            Visualize e gerencie as datas de validade dos documentos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Última Atualização</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DOCUMENTOS_VALIDADE.map((docConfig) => {
                const doc = getDocumentoMaisRecente(docConfig.tipo);
                const statusValidade = doc?.data_validade 
                  ? getStatusValidade(doc.data_validade) 
                  : { 
                      label: docConfig.temValidade ? "Pendente" : "-", 
                      variant: "outline" as const, 
                      cor: "text-gray-600",
                      diasRestantes: null as number | null
                    };

                return (
                  <TableRow key={docConfig.tipo}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {docConfig.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      {doc ? doc.data_upload.split('T')[0].split('-').reverse().join('/') : "-"}
                    </TableCell>
                    <TableCell>
                      {doc?.data_validade 
                        ? format(parseISO(doc.data_validade), 'dd/MM/yyyy')
                        : docConfig.temValidade ? "-" : "Sem validade"}
                    </TableCell>
                    <TableCell>
                      {doc ? (
                        docConfig.temValidade ? (
                          <Badge variant={statusValidade.variant} className={statusValidade.cor}>
                            {statusValidade.diasRestantes !== null && statusValidade.diasRestantes !== undefined && statusValidade.diasRestantes < 0 && (
                              <AlertCircle className="h-3 w-3 mr-1" />
                            )}
                            {statusValidade.label}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      ) : (
                        <Badge variant="outline" className="text-gray-600">
                          {docConfig.temValidade ? "Não enviado" : "-"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {doc && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                const pathMatch = doc.url_arquivo.match(/processo-anexos\/(.+)$/);
                                if (!pathMatch) {
                                  toast.error("URL do documento inválida");
                                  return;
                                }
                                const filePath = pathMatch[1];
                                const { data, error } = await supabase.storage
                                  .from('processo-anexos')
                                  .createSignedUrl(filePath, 60);
                                if (error) throw error;
                                if (!data?.signedUrl) throw new Error("Não foi possível gerar URL de acesso");
                                
                                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                                const fullUrl = data.signedUrl.startsWith('http') 
                                  ? data.signedUrl 
                                  : `${supabaseUrl}/storage/v1${data.signedUrl}`;
                                
                                window.open(fullUrl, '_blank');
                              } catch (error) {
                                console.error("Erro ao abrir documento:", error);
                                toast.error("Erro ao visualizar documento");
                              }
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {docConfig.temValidade && (
                                <DropdownMenuItem onClick={() => handleAbrirDialogEditar(doc)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar Validade
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleAbrirDialogSolicitarAtualizacao(doc)}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Solicitar Atualização
                              </DropdownMenuItem>
                              {docConfig.tipo === "certificado_gestor" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDocumentoParaExcluir(doc)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Excluir
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog para editar data de validade */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Data de Validade</DialogTitle>
            <DialogDescription>
              {documentoEditando && getTipoDocumentoLabel(documentoEditando.tipo_documento)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data_validade">Data de Validade *</Label>
              <Input
                id="data_validade"
                type="date"
                value={novaDataValidade}
                onChange={(e) => setNovaDataValidade(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Esta alteração será refletida automaticamente no Portal do Fornecedor
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={processando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarDataValidade}
              disabled={processando}
            >
              {processando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para solicitar atualização */}
      <Dialog open={dialogSolicitarAtualizacao} onOpenChange={setDialogSolicitarAtualizacao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Atualização de Documento</DialogTitle>
            <DialogDescription>
              {documentoSolicitarAtualizacao && getTipoDocumentoLabel(documentoSolicitarAtualizacao.tipo_documento)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="motivo_atualizacao">Motivo da Solicitação *</Label>
              <Textarea
                id="motivo_atualizacao"
                placeholder="Informe o motivo pelo qual o documento precisa ser atualizado..."
                value={motivoAtualizacao}
                onChange={(e) => setMotivoAtualizacao(e.target.value)}
                rows={4}
              />
              <p className="text-sm text-muted-foreground">
                O fornecedor será notificado para enviar uma nova versão do documento
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogSolicitarAtualizacao(false)}
              disabled={processando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSolicitarAtualizacao}
              disabled={processando}
            >
              {processando ? "Enviando..." : "Solicitar Atualização"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog para confirmar exclusão */}
      <AlertDialog open={!!documentoParaExcluir} onOpenChange={(open) => !open && setDocumentoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.
              {documentoParaExcluir && (
                <div className="mt-2 p-2 bg-muted rounded">
                  <p className="font-medium">{getTipoDocumentoLabel(documentoParaExcluir.tipo_documento)}</p>
                  <p className="text-sm text-muted-foreground">{documentoParaExcluir.nome_arquivo}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluirDocumento}
              disabled={processando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processando ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
