import { useState, useEffect } from "react";
import { format, differenceInDays, startOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ExternalLink, FileText, CheckCircle, AlertCircle, Download, Eye, Send, Clock, XCircle, RefreshCw, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DocumentoExistente {
  id: string;
  tipo_documento: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_emissao: string | null;
  data_validade: string | null;
  em_vigor: boolean;
  atualizacao_solicitada?: boolean;
}

interface CampoDocumento {
  id?: string;
  nome_campo: string;
  descricao: string;
  obrigatorio: boolean;
  ordem: number;
  status_solicitacao?: string;
  data_solicitacao?: string;
  data_conclusao?: string;
  data_aprovacao?: string;
  documentos_finalizacao_fornecedor?: DocumentoFinalizacao[];
}

interface DocumentoFinalizacao {
  id: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_upload: string;
}

interface FornecedorVencedor {
  id: string;
  razao_social: string;
  cnpj: string;
  email: string;
  itensVencedores: number[];
  valorTotal: number;
}

interface FornecedorData {
  fornecedor: FornecedorVencedor;
  documentosExistentes: DocumentoExistente[];
  campos: CampoDocumento[];
  todosDocumentosAprovados: boolean;
}

interface DialogAnaliseDocumentalSelecaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecaoId: string;
  onSuccess?: () => void;
}

export function DialogAnaliseDocumentalSelecao({
  open,
  onOpenChange,
  selecaoId,
  onSuccess,
}: DialogAnaliseDocumentalSelecaoProps) {
  const [loading, setLoading] = useState(false);
  const [fornecedoresData, setFornecedoresData] = useState<FornecedorData[]>([]);
  const [novosCampos, setNovosCampos] = useState<Record<string, {nome: string; descricao: string; obrigatorio: boolean}>>({});
  const [datasLimiteDocumentos, setDatasLimiteDocumentos] = useState<Record<string, string>>({});
  const [documentosAprovados, setDocumentosAprovados] = useState<Record<string, boolean>>({});
  const [dialogSolicitarAtualizacao, setDialogSolicitarAtualizacao] = useState(false);
  const [documentoParaAtualizar, setDocumentoParaAtualizar] = useState<{ doc: DocumentoExistente; fornecedorId: string } | null>(null);
  const [motivoAtualizacao, setMotivoAtualizacao] = useState("");

  useEffect(() => {
    if (open && selecaoId) {
      loadFornecedoresVencedores();
    }
  }, [open, selecaoId]);

  const loadFornecedoresVencedores = async () => {
    setLoading(true);
    try {
      // Buscar vencedores por item
      const { data: vencedoresData, error: vencedoresError } = await supabase
        .from("lances_fornecedores")
        .select(`
          numero_item,
          valor_lance,
          fornecedor_id,
          fornecedores (
            id,
            razao_social,
            cnpj,
            email
          )
        `)
        .eq("selecao_id", selecaoId)
        .eq("indicativo_lance_vencedor", true);

      if (vencedoresError) throw vencedoresError;

      // Agrupar por fornecedor
      const fornecedoresMap = new Map<string, FornecedorVencedor>();
      
      (vencedoresData || []).forEach((lance: any) => {
        const fornId = lance.fornecedor_id;
        if (!fornecedoresMap.has(fornId)) {
          fornecedoresMap.set(fornId, {
            id: fornId,
            razao_social: lance.fornecedores?.razao_social || "N/A",
            cnpj: lance.fornecedores?.cnpj || "N/A",
            email: lance.fornecedores?.email || "N/A",
            itensVencedores: [],
            valorTotal: 0,
          });
        }
        const forn = fornecedoresMap.get(fornId)!;
        forn.itensVencedores.push(lance.numero_item);
        forn.valorTotal += lance.valor_lance;
      });

      // Carregar documentos e campos de cada fornecedor
      const fornecedoresArray = Array.from(fornecedoresMap.values());
      const fornecedoresComDados: FornecedorData[] = await Promise.all(
        fornecedoresArray.map(async (forn) => {
          const [docs, campos] = await Promise.all([
            loadDocumentosFornecedor(forn.id),
            loadCamposFornecedor(forn.id),
          ]);

          const todosAprovados = verificarTodosDocumentosAprovados(forn.id, docs, campos);

          return {
            fornecedor: forn,
            documentosExistentes: docs,
            campos: campos,
            todosDocumentosAprovados: todosAprovados,
          };
        })
      );

      // Ordenar por menor item vencedor
      fornecedoresComDados.sort((a, b) => {
        const menorA = Math.min(...a.fornecedor.itensVencedores);
        const menorB = Math.min(...b.fornecedor.itensVencedores);
        return menorA - menorB;
      });

      setFornecedoresData(fornecedoresComDados);
    } catch (error) {
      console.error("Erro ao carregar fornecedores vencedores:", error);
      toast.error("Erro ao carregar fornecedores vencedores");
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentosFornecedor = async (fornecedorId: string): Promise<DocumentoExistente[]> => {
    try {
      const { data, error } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .order("tipo_documento");

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Erro ao carregar documentos:", error);
      return [];
    }
  };

  const loadCamposFornecedor = async (fornecedorId: string): Promise<CampoDocumento[]> => {
    try {
      const { data, error } = await supabase
        .from("campos_documentos_finalizacao")
        .select(`
          *,
          documentos_finalizacao_fornecedor (*)
        `)
        .eq("fornecedor_id", fornecedorId)
        .order("ordem");

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Erro ao carregar campos:", error);
      return [];
    }
  };

  const verificarTodosDocumentosAprovados = (
    fornecedorId: string,
    docs: DocumentoExistente[],
    campos: CampoDocumento[]
  ): boolean => {
    // Verificar documentos existentes
    const docsValidos = docs.every(doc => {
      if (!doc.data_validade) return true;
      const hoje = startOfDay(new Date());
      const validade = startOfDay(parseISO(doc.data_validade));
      return validade >= hoje;
    });

    // Verificar campos adicionais aprovados
    const camposAprovados = campos.every(campo => 
      campo.status_solicitacao === 'aprovado' || 
      !campo.obrigatorio
    );

    return docsValidos && camposAprovados;
  };

  const formatCNPJ = (cnpj: string) => {
    const cleaned = cnpj.replace(/\D/g, "");
    return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const getStatusDocumento = (doc: DocumentoExistente) => {
    if (!doc.data_validade) {
      return { status: "sem_validade", label: "Sem validade", color: "secondary" };
    }

    const hoje = startOfDay(new Date());
    const validade = startOfDay(parseISO(doc.data_validade));
    const diasRestantes = differenceInDays(validade, hoje);

    if (diasRestantes < 0) {
      return { status: "vencido", label: "Vencido", color: "destructive" };
    } else if (diasRestantes <= 30) {
      return { status: "proximo_vencer", label: `Vence em ${diasRestantes} dias`, color: "warning" };
    } else {
      return { status: "valido", label: "Válido", color: "success" };
    }
  };

  const handleSolicitarAtualizacao = async () => {
    if (!documentoParaAtualizar || !motivoAtualizacao.trim()) {
      toast.error("Informe o motivo da solicitação de atualização");
      return;
    }

    try {
      const { error } = await supabase
        .from("documentos_fornecedor")
        .update({
          atualizacao_solicitada: true,
          motivo_solicitacao_atualizacao: motivoAtualizacao,
          data_solicitacao_atualizacao: new Date().toISOString(),
        })
        .eq("id", documentoParaAtualizar.doc.id);

      if (error) throw error;

      toast.success("Solicitação de atualização enviada ao fornecedor");
      setDialogSolicitarAtualizacao(false);
      setDocumentoParaAtualizar(null);
      setMotivoAtualizacao("");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao solicitar atualização:", error);
      toast.error("Erro ao solicitar atualização");
    }
  };

  const handleAdicionarCampo = async (fornecedorId: string) => {
    const novoCampo = novosCampos[fornecedorId];
    if (!novoCampo?.nome?.trim()) {
      toast.error("Informe o nome do documento");
      return;
    }

    try {
      const dataLimite = datasLimiteDocumentos[fornecedorId];
      
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .insert({
          cotacao_id: selecaoId, // Reutilizando a estrutura existente
          fornecedor_id: fornecedorId,
          nome_campo: novoCampo.nome,
          descricao: novoCampo.descricao || "",
          obrigatorio: novoCampo.obrigatorio ?? true,
          ordem: 99,
          status_solicitacao: "pendente",
          data_solicitacao: dataLimite || null,
        });

      if (error) throw error;

      toast.success("Documento solicitado ao fornecedor");
      setNovosCampos(prev => ({ ...prev, [fornecedorId]: { nome: "", descricao: "", obrigatorio: true } }));
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao adicionar campo:", error);
      toast.error("Erro ao solicitar documento");
    }
  };

  const handleAprovarDocumento = async (campoId: string) => {
    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "aprovado",
          data_aprovacao: new Date().toISOString(),
        })
        .eq("id", campoId);

      if (error) throw error;

      toast.success("Documento aprovado");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao aprovar documento:", error);
      toast.error("Erro ao aprovar documento");
    }
  };

  const handleRejeitarDocumento = async (campoId: string) => {
    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "rejeitado",
          data_aprovacao: null,
        })
        .eq("id", campoId);

      if (error) throw error;

      toast.success("Documento rejeitado - fornecedor pode reenviar");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao rejeitar documento:", error);
      toast.error("Erro ao rejeitar documento");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Análise Documental - Seleção de Fornecedores
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 h-[calc(95vh-120px)]">
          <div className="space-y-6 pr-4">
            {loading ? (
              <div className="text-center py-8">Carregando fornecedores vencedores...</div>
            ) : fornecedoresData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum fornecedor vencedor identificado. Finalize a sessão de lances primeiro.
              </div>
            ) : (
              fornecedoresData.map((data, index) => (
                <Card key={data.fornecedor.id} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{data.fornecedor.razao_social}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          CNPJ: {formatCNPJ(data.fornecedor.cnpj)} | Email: {data.fornecedor.email}
                        </p>
                        <p className="text-sm mt-1">
                          <span className="font-medium">Itens vencedores:</span>{" "}
                          {data.fornecedor.itensVencedores.sort((a, b) => a - b).join(", ")}
                        </p>
                        <p className="text-sm">
                          <span className="font-medium">Valor total:</span>{" "}
                          {formatCurrency(data.fornecedor.valorTotal)}
                        </p>
                      </div>
                      <Badge variant={data.todosDocumentosAprovados ? "default" : "secondary"}>
                        {data.todosDocumentosAprovados ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Documentos OK
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pendente
                          </>
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Documentos do Cadastro */}
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Documentos do Cadastro
                      </h4>
                      {data.documentosExistentes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum documento cadastrado</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Validade</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.documentosExistentes.map((doc) => {
                              const statusDoc = getStatusDocumento(doc);
                              return (
                                <TableRow key={doc.id}>
                                  <TableCell>{doc.tipo_documento}</TableCell>
                                  <TableCell>
                                    {doc.data_validade
                                      ? format(parseISO(doc.data_validade), "dd/MM/yyyy")
                                      : "Sem validade"}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        statusDoc.status === "vencido"
                                          ? "destructive"
                                          : statusDoc.status === "proximo_vencer"
                                          ? "secondary"
                                          : "default"
                                      }
                                    >
                                      {statusDoc.label}
                                    </Badge>
                                    {doc.atualizacao_solicitada && (
                                      <Badge variant="outline" className="ml-2">
                                        <RefreshCw className="h-3 w-3 mr-1" />
                                        Atualização solicitada
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => window.open(doc.url_arquivo, "_blank")}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      {(statusDoc.status === "vencido" || statusDoc.status === "proximo_vencer") && !doc.atualizacao_solicitada && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setDocumentoParaAtualizar({ doc, fornecedorId: data.fornecedor.id });
                                            setDialogSolicitarAtualizacao(true);
                                          }}
                                        >
                                          <RefreshCw className="h-4 w-4 mr-1" />
                                          Solicitar Atualização
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    {/* Documentos Adicionais Solicitados */}
                    {data.campos.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Documentos Adicionais Solicitados
                        </h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Documento</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Arquivo</TableHead>
                              <TableHead>Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.campos.map((campo) => (
                              <TableRow key={campo.id}>
                                <TableCell>
                                  {campo.nome_campo}
                                  {campo.obrigatorio && <span className="text-red-500 ml-1">*</span>}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      campo.status_solicitacao === "aprovado"
                                        ? "default"
                                        : campo.status_solicitacao === "em_analise"
                                        ? "secondary"
                                        : campo.status_solicitacao === "rejeitado"
                                        ? "destructive"
                                        : "outline"
                                    }
                                  >
                                    {campo.status_solicitacao === "aprovado" && <CheckCircle className="h-3 w-3 mr-1" />}
                                    {campo.status_solicitacao === "em_analise" && <Clock className="h-3 w-3 mr-1" />}
                                    {campo.status_solicitacao === "rejeitado" && <XCircle className="h-3 w-3 mr-1" />}
                                    {campo.status_solicitacao || "Pendente"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {campo.documentos_finalizacao_fornecedor && campo.documentos_finalizacao_fornecedor.length > 0 ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => window.open(campo.documentos_finalizacao_fornecedor![0].url_arquivo, "_blank")}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      Ver
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">Aguardando envio</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {campo.documentos_finalizacao_fornecedor && campo.documentos_finalizacao_fornecedor.length > 0 && campo.status_solicitacao !== "aprovado" && (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => handleAprovarDocumento(campo.id!)}
                                      >
                                        <CheckCircle className="h-4 w-4 mr-1" />
                                        Aprovar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleRejeitarDocumento(campo.id!)}
                                      >
                                        <XCircle className="h-4 w-4 mr-1" />
                                        Rejeitar
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Solicitar Novo Documento */}
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Solicitar Documento Adicional
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <Label>Nome do Documento</Label>
                          <Input
                            placeholder="Ex: Certidão Específica"
                            value={novosCampos[data.fornecedor.id]?.nome || ""}
                            onChange={(e) =>
                              setNovosCampos((prev) => ({
                                ...prev,
                                [data.fornecedor.id]: {
                                  ...prev[data.fornecedor.id],
                                  nome: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Descrição (opcional)</Label>
                          <Input
                            placeholder="Instruções para o fornecedor"
                            value={novosCampos[data.fornecedor.id]?.descricao || ""}
                            onChange={(e) =>
                              setNovosCampos((prev) => ({
                                ...prev,
                                [data.fornecedor.id]: {
                                  ...prev[data.fornecedor.id],
                                  descricao: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Data Limite</Label>
                          <Input
                            type="date"
                            value={datasLimiteDocumentos[data.fornecedor.id] || ""}
                            onChange={(e) =>
                              setDatasLimiteDocumentos((prev) => ({
                                ...prev,
                                [data.fornecedor.id]: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            className="w-full"
                            onClick={() => handleAdicionarCampo(data.fornecedor.id)}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Solicitar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>

      {/* Dialog para solicitar atualização */}
      <AlertDialog open={dialogSolicitarAtualizacao} onOpenChange={setDialogSolicitarAtualizacao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar Atualização de Documento</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <p>
              Informe o motivo da solicitação de atualização para o documento:{" "}
              <strong>{documentoParaAtualizar?.doc.tipo_documento}</strong>
            </p>
            <div>
              <Label>Motivo da Solicitação</Label>
              <Input
                placeholder="Ex: Documento vencido, necessário versão atualizada"
                value={motivoAtualizacao}
                onChange={(e) => setMotivoAtualizacao(e.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSolicitarAtualizacao}>
              Enviar Solicitação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
