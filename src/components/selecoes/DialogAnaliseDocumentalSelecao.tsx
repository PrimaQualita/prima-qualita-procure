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
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ExternalLink, FileText, CheckCircle, AlertCircle, Download, Eye, Send, Clock, XCircle, RefreshCw, Undo2, UserX, UserCheck, MessageSquare, Handshake, Gavel } from "lucide-react";
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

interface FornecedorInabilitado {
  id: string;
  fornecedor_id: string;
  itens_afetados: number[];
  motivo_inabilitacao: string;
  data_inabilitacao: string;
  revertido: boolean;
}

interface FornecedorData {
  fornecedor: FornecedorVencedor;
  documentosExistentes: DocumentoExistente[];
  campos: CampoDocumento[];
  todosDocumentosAprovados: boolean;
  inabilitado?: FornecedorInabilitado;
}

interface SegundoColocado {
  numero_item: number;
  fornecedor_id: string;
  fornecedor_nome: string;
  valor_lance: number;
}

interface DialogAnaliseDocumentalSelecaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecaoId: string;
  onSuccess?: () => void;
  onReabrirNegociacao?: (itens: number[], fornecedorId: string) => void;
}

export function DialogAnaliseDocumentalSelecao({
  open,
  onOpenChange,
  selecaoId,
  onSuccess,
  onReabrirNegociacao,
}: DialogAnaliseDocumentalSelecaoProps) {
  const [loading, setLoading] = useState(false);
  const [fornecedoresData, setFornecedoresData] = useState<FornecedorData[]>([]);
  const [fornecedoresInabilitados, setFornecedoresInabilitados] = useState<FornecedorData[]>([]);
  const [novosCampos, setNovosCampos] = useState<Record<string, {nome: string; descricao: string; obrigatorio: boolean}>>({});
  const [datasLimiteDocumentos, setDatasLimiteDocumentos] = useState<Record<string, string>>({});
  const [documentosAprovados, setDocumentosAprovados] = useState<Record<string, boolean>>({});
  const [cotacaoRelacionadaId, setCotacaoRelacionadaId] = useState<string | null>(null);
  const [dialogSolicitarAtualizacao, setDialogSolicitarAtualizacao] = useState(false);
  const [documentoParaAtualizar, setDocumentoParaAtualizar] = useState<{ doc: DocumentoExistente; fornecedorId: string } | null>(null);
  const [motivoAtualizacao, setMotivoAtualizacao] = useState("");
  
  // States para inabilitação
  const [dialogInabilitar, setDialogInabilitar] = useState(false);
  const [fornecedorParaInabilitar, setFornecedorParaInabilitar] = useState<FornecedorData | null>(null);
  const [motivoInabilitacao, setMotivoInabilitacao] = useState("");
  const [segundosColocados, setSegundosColocados] = useState<SegundoColocado[]>([]);
  
  // State para reverter inabilitação
  const [dialogReverterInabilitacao, setDialogReverterInabilitacao] = useState(false);
  const [inabilitacaoParaReverter, setInabilitacaoParaReverter] = useState<FornecedorData | null>(null);
  const [motivoReversao, setMotivoReversao] = useState("");
  
  // State para reabrir negociação
  const [dialogReabrirNegociacao, setDialogReabrirNegociacao] = useState(false);
  const [inabilitacaoParaReabrirNegociacao, setInabilitacaoParaReabrirNegociacao] = useState<FornecedorData | null>(null);
  
  // State para rejeição de documento com motivo
  const [dialogRejeitarDocumento, setDialogRejeitarDocumento] = useState(false);
  const [campoParaRejeitar, setCampoParaRejeitar] = useState<string | null>(null);
  const [motivoRejeicaoDocumento, setMotivoRejeicaoDocumento] = useState("");
  
  // State para solicitar atualização de documento adicional com motivo
  const [dialogSolicitarAtualizacaoDocumento, setDialogSolicitarAtualizacaoDocumento] = useState(false);
  const [campoParaAtualizacao, setCampoParaAtualizacao] = useState<string | null>(null);
  const [motivoAtualizacaoDocumento, setMotivoAtualizacaoDocumento] = useState("");

  useEffect(() => {
    if (open && selecaoId) {
      loadFornecedoresVencedores();
    }
  }, [open, selecaoId]);

  const loadFornecedoresVencedores = async () => {
    setLoading(true);
    try {
      // Buscar dados da seleção e itens para obter quantidades
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("cotacao_relacionada_id")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;

      // Salvar cotacao_relacionada_id para uso em outras funções
      const cotacaoId = selecaoData?.cotacao_relacionada_id;
      setCotacaoRelacionadaId(cotacaoId || null);

      // Buscar itens da cotação relacionada para obter quantidades
      let itensQuantidades: Record<number, number> = {};
      if (cotacaoId) {
        const { data: itensData } = await supabase
          .from("itens_cotacao")
          .select("numero_item, quantidade")
          .eq("cotacao_id", cotacaoId);
        
        (itensData || []).forEach((item: any) => {
          itensQuantidades[item.numero_item] = item.quantidade;
        });
      }

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

      // Buscar inabilitações ativas
      const { data: inabilitacoes, error: inabilitacoesError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      if (inabilitacoesError) throw inabilitacoesError;

      const inabilitacoesMap = new Map<string, FornecedorInabilitado>();
      (inabilitacoes || []).forEach((inab: any) => {
        inabilitacoesMap.set(inab.fornecedor_id, {
          id: inab.id,
          fornecedor_id: inab.fornecedor_id,
          itens_afetados: inab.itens_afetados,
          motivo_inabilitacao: inab.motivo_inabilitacao,
          data_inabilitacao: inab.data_inabilitacao,
          revertido: inab.revertido,
        });
      });

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
        // Calcular valor total = valor_lance (unitário) × quantidade do item
        const quantidade = itensQuantidades[lance.numero_item] || 1;
        forn.valorTotal += lance.valor_lance * quantidade;
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
            inabilitado: inabilitacoesMap.get(forn.id),
          };
        })
      );

      // Separar habilitados e inabilitados
      const habilitados = fornecedoresComDados.filter(f => !f.inabilitado);
      const inabilitados = fornecedoresComDados.filter(f => f.inabilitado);

      // Ordenar por menor item vencedor
      habilitados.sort((a, b) => {
        const menorA = Math.min(...a.fornecedor.itensVencedores);
        const menorB = Math.min(...b.fornecedor.itensVencedores);
        return menorA - menorB;
      });

      setFornecedoresData(habilitados);
      setFornecedoresInabilitados(inabilitados);
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
        .order("data_upload", { ascending: false });

      if (error) throw error;
      
      // Ordem específica dos documentos
      const ordemDocumentos: Record<string, number> = {
        'contrato_social': 1,
        'cartao_cnpj': 2,
        'inscricao_estadual_municipal': 3,
        'cnd_federal': 4,
        'cnd_tributos_estaduais': 5,
        'cnd_divida_ativa_estadual': 6,
        'cnd_tributos_municipais': 7,
        'cnd_divida_ativa_municipal': 8,
        'crf_fgts': 9,
        'cndt': 10,
        'certificado_gestor': 11,
      };
      
      // Filtrar apenas o documento mais recente de cada tipo e excluir Relatorio KPMG
      const documentosPorTipo = new Map<string, DocumentoExistente>();
      (data || []).forEach((doc: DocumentoExistente) => {
        // Excluir Relatorio KPMG
        if (doc.tipo_documento === 'relatorio_kpmg') {
          return;
        }
        if (!documentosPorTipo.has(doc.tipo_documento)) {
          documentosPorTipo.set(doc.tipo_documento, doc);
        }
      });
      
      // Retornar ordenado pela ordem específica
      return Array.from(documentosPorTipo.values()).sort((a, b) => {
        const ordemA = ordemDocumentos[a.tipo_documento.toLowerCase()] || 99;
        const ordemB = ordemDocumentos[b.tipo_documento.toLowerCase()] || 99;
        return ordemA - ordemB;
      });
    } catch (error) {
      console.error("Erro ao carregar documentos:", error);
      return [];
    }
  };

  const loadCamposFornecedor = async (fornecedorId: string): Promise<CampoDocumento[]> => {
    try {
      // Para seleção de fornecedores, buscar por selecao_id
      const { data, error } = await supabase
        .from("campos_documentos_finalizacao")
        .select(`
          *,
          documentos_finalizacao_fornecedor (*)
        `)
        .eq("fornecedor_id", fornecedorId)
        .eq("selecao_id", selecaoId)
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
      // Buscar maior ordem existente para esta seleção
      const { data: maxOrdemData } = await supabase
        .from("campos_documentos_finalizacao")
        .select("ordem")
        .eq("selecao_id", selecaoId)
        .order("ordem", { ascending: false })
        .limit(1);
      
      const proximaOrdem = (maxOrdemData?.[0]?.ordem ?? 0) + 1;
      
      const dataLimite = datasLimiteDocumentos[fornecedorId];
      
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .insert({
          selecao_id: selecaoId,
          fornecedor_id: fornecedorId,
          nome_campo: novoCampo.nome,
          descricao: novoCampo.descricao || "",
          obrigatorio: novoCampo.obrigatorio ?? true,
          ordem: proximaOrdem,
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

  const handleRejeitarDocumento = async () => {
    if (!campoParaRejeitar || !motivoRejeicaoDocumento.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }

    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "rejeitado",
          data_aprovacao: null,
          descricao: motivoRejeicaoDocumento,
        })
        .eq("id", campoParaRejeitar);

      if (error) throw error;

      toast.success("Documento rejeitado");
      setDialogRejeitarDocumento(false);
      setCampoParaRejeitar(null);
      setMotivoRejeicaoDocumento("");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao rejeitar documento:", error);
      toast.error("Erro ao rejeitar documento");
    }
  };

  const handleReverterDecisao = async (campoId: string) => {
    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "em_analise",
          data_aprovacao: null,
          descricao: null,
        })
        .eq("id", campoId);

      if (error) throw error;

      toast.success("Decisão revertida");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao reverter decisão:", error);
      toast.error("Erro ao reverter decisão");
    }
  };

  const handleSolicitarAtualizacaoDocumento = async () => {
    if (!campoParaAtualizacao || !motivoAtualizacaoDocumento.trim()) {
      toast.error("Informe o motivo da solicitação de atualização");
      return;
    }

    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "pendente",
          data_aprovacao: null,
          descricao: motivoAtualizacaoDocumento,
        })
        .eq("id", campoParaAtualizacao);

      if (error) throw error;

      toast.success("Solicitação de atualização enviada ao fornecedor");
      setDialogSolicitarAtualizacaoDocumento(false);
      setCampoParaAtualizacao(null);
      setMotivoAtualizacaoDocumento("");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao solicitar atualização:", error);
      toast.error("Erro ao solicitar atualização");
    }
  };

  const buscarSegundosColocados = async (itens: number[]) => {
    try {
      const segundos: SegundoColocado[] = [];
      
      for (const item of itens) {
        // Buscar todos os lances do item ordenados por valor (menor primeiro)
        const { data: lances, error } = await supabase
          .from("lances_fornecedores")
          .select(`
            valor_lance,
            fornecedor_id,
            fornecedores (razao_social)
          `)
          .eq("selecao_id", selecaoId)
          .eq("numero_item", item)
          .order("valor_lance", { ascending: true });
        
        if (error) throw error;
        
        // O segundo lance é o segundo colocado
        if (lances && lances.length > 1) {
          segundos.push({
            numero_item: item,
            fornecedor_id: lances[1].fornecedor_id,
            fornecedor_nome: (lances[1].fornecedores as any)?.razao_social || "N/A",
            valor_lance: lances[1].valor_lance,
          });
        }
      }
      
      setSegundosColocados(segundos);
      return segundos;
    } catch (error) {
      console.error("Erro ao buscar segundos colocados:", error);
      return [];
    }
  };

  const handleAbrirInabilitacao = async (data: FornecedorData) => {
    setFornecedorParaInabilitar(data);
    setMotivoInabilitacao("");
    await buscarSegundosColocados(data.fornecedor.itensVencedores);
    setDialogInabilitar(true);
  };

  const handleInabilitarFornecedor = async () => {
    if (!fornecedorParaInabilitar || !motivoInabilitacao.trim()) {
      toast.error("Informe o motivo da inabilitação");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Registrar inabilitação
      const { error: inabError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .insert({
          selecao_id: selecaoId,
          fornecedor_id: fornecedorParaInabilitar.fornecedor.id,
          itens_afetados: fornecedorParaInabilitar.fornecedor.itensVencedores,
          motivo_inabilitacao: motivoInabilitacao,
          usuario_inabilitou_id: user.id,
        });

      if (inabError) throw inabError;

      // Remover indicativo de vencedor dos itens do fornecedor inabilitado
      const { error: removeVencedorError } = await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: false })
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorParaInabilitar.fornecedor.id)
        .in("numero_item", fornecedorParaInabilitar.fornecedor.itensVencedores);

      if (removeVencedorError) throw removeVencedorError;

      // Se tiver segundos colocados, marcar como vencedores
      for (const segundo of segundosColocados) {
        // Verificar se o segundo colocado não está inabilitado
        const { data: segInab } = await supabase
          .from("fornecedores_inabilitados_selecao")
          .select("id")
          .eq("selecao_id", selecaoId)
          .eq("fornecedor_id", segundo.fornecedor_id)
          .eq("revertido", false)
          .single();

        if (!segInab) {
          // Marcar segundo colocado como vencedor
          const { error: setVencedorError } = await supabase
            .from("lances_fornecedores")
            .update({ indicativo_lance_vencedor: true })
            .eq("selecao_id", selecaoId)
            .eq("fornecedor_id", segundo.fornecedor_id)
            .eq("numero_item", segundo.numero_item);

          if (setVencedorError) {
            console.error("Erro ao marcar segundo colocado:", setVencedorError);
          }
        }
      }

      toast.success("Fornecedor inabilitado. Segundos colocados assumem os itens.");
      setDialogInabilitar(false);
      setFornecedorParaInabilitar(null);
      setMotivoInabilitacao("");
      setSegundosColocados([]);
      loadFornecedoresVencedores();
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao inabilitar fornecedor:", error);
      toast.error("Erro ao inabilitar fornecedor");
    }
  };

  const handleReverterInabilitacao = async () => {
    if (!inabilitacaoParaReverter?.inabilitado) {
      toast.error("Inabilitação não encontrada");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Reverter a inabilitação
      const { error: revertError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .update({
          revertido: true,
          data_reversao: new Date().toISOString(),
          motivo_reversao: motivoReversao || "Reversão solicitada pelo gestor",
          usuario_reverteu_id: user.id,
        })
        .eq("id", inabilitacaoParaReverter.inabilitado.id);

      if (revertError) throw revertError;

      // Remover indicativo de vencedor dos segundos colocados que assumiram
      for (const item of inabilitacaoParaReverter.inabilitado.itens_afetados) {
        // Primeiro, remover vencedor atual do item
        await supabase
          .from("lances_fornecedores")
          .update({ indicativo_lance_vencedor: false })
          .eq("selecao_id", selecaoId)
          .eq("numero_item", item)
          .eq("indicativo_lance_vencedor", true);
      }

      // Restaurar o fornecedor original como vencedor
      const { error: restoreError } = await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: true })
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", inabilitacaoParaReverter.fornecedor.id)
        .in("numero_item", inabilitacaoParaReverter.inabilitado.itens_afetados);

      if (restoreError) throw restoreError;

      toast.success("Inabilitação revertida. Fornecedor restaurado como vencedor.");
      setDialogReverterInabilitacao(false);
      setInabilitacaoParaReverter(null);
      setMotivoReversao("");
      loadFornecedoresVencedores();
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao reverter inabilitação:", error);
      toast.error("Erro ao reverter inabilitação");
    }
  };

  const renderFornecedorCard = (data: FornecedorData, isInabilitado: boolean = false) => (
    <Card key={data.fornecedor.id} className={`border-2 ${isInabilitado ? 'border-destructive/50 bg-destructive/5' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {data.fornecedor.razao_social}
              {isInabilitado && (
                <Badge variant="destructive">
                  <UserX className="h-3 w-3 mr-1" />
                  INABILITADO
                </Badge>
              )}
            </CardTitle>
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
            {isInabilitado && data.inabilitado && (
              <p className="text-sm text-destructive mt-2">
                <span className="font-medium">Motivo:</span> {data.inabilitado.motivo_inabilitacao}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 items-end">
            {!isInabilitado ? (
              <>
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={!data.todosDocumentosAprovados}
                    onClick={() => {
                      toast.success(`Fornecedor ${data.fornecedor.razao_social} aprovado com sucesso!`);
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Aprovar Fornecedor
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleAbrirInabilitacao(data)}
                  >
                    <UserX className="h-4 w-4 mr-1" />
                    Inabilitar
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setInabilitacaoParaReverter(data);
                    setMotivoReversao("");
                    setDialogReverterInabilitacao(true);
                  }}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Reverter Inabilitação
                </Button>
                {onReabrirNegociacao && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={async () => {
                      setInabilitacaoParaReabrirNegociacao(data);
                      await buscarSegundosColocados(data.inabilitado?.itens_afetados || []);
                      setDialogReabrirNegociacao(true);
                    }}
                  >
                    <Handshake className="h-4 w-4 mr-1" />
                    Reabrir Negociação
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      {!isInabilitado && (
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
                            {statusDoc.status === "vencido" && !doc.atualizacao_solicitada && (
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
                        {campo.documentos_finalizacao_fornecedor && campo.documentos_finalizacao_fornecedor.length > 0 && (
                          <div className="flex gap-2 items-center">
                            {/* Status aprovado ou rejeitado - mostrar badge e botão de reversão */}
                            {(campo.status_solicitacao === "aprovado" || campo.status_solicitacao === "rejeitado") ? (
                              <>
                                <Badge 
                                  variant={campo.status_solicitacao === "aprovado" ? "default" : "destructive"}
                                  className={campo.status_solicitacao === "aprovado" ? "bg-green-500" : ""}
                                >
                                  {campo.status_solicitacao === "aprovado" ? (
                                    <>
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Documento OK
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Rejeitado
                                    </>
                                  )}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReverterDecisao(campo.id!)}
                                >
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  Reverter Decisão
                                </Button>
                              </>
                            ) : (
                              /* Status em_analise ou pendente - mostrar botões de ação */
                              <>
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
                                  onClick={() => {
                                    setCampoParaRejeitar(campo.id!);
                                    setMotivoRejeicaoDocumento("");
                                    setDialogRejeitarDocumento(true);
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Rejeitar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setCampoParaAtualizacao(campo.id!);
                                    setMotivoAtualizacaoDocumento("");
                                    setDialogSolicitarAtualizacaoDocumento(true);
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  Solicitar Atualização
                                </Button>
                              </>
                            )}
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
      )}
    </Card>
  );

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
            ) : fornecedoresData.length === 0 && fornecedoresInabilitados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum fornecedor vencedor identificado. Finalize a sessão de lances primeiro.
              </div>
            ) : (
              <>
                {/* Fornecedores Habilitados */}
                {fornecedoresData.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                      <UserCheck className="h-5 w-5" />
                      Fornecedores Habilitados ({fornecedoresData.length})
                    </h3>
                    {fornecedoresData.map((data) => renderFornecedorCard(data, false))}
                  </div>
                )}

                {/* Fornecedores Inabilitados */}
                {fornecedoresInabilitados.length > 0 && (
                  <div className="space-y-4 mt-8">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-destructive">
                      <UserX className="h-5 w-5" />
                      Fornecedores Inabilitados ({fornecedoresInabilitados.length})
                    </h3>
                    {fornecedoresInabilitados.map((data) => renderFornecedorCard(data, true))}
                  </div>
                )}
              </>
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

      {/* Dialog para inabilitar fornecedor */}
      <AlertDialog open={dialogInabilitar} onOpenChange={setDialogInabilitar}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />
              Inabilitar Fornecedor
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Você está prestes a inabilitar o fornecedor{" "}
                  <strong>{fornecedorParaInabilitar?.fornecedor.razao_social}</strong> na análise documental.
                </p>
                
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium">Itens afetados:</p>
                  <p className="text-sm">{fornecedorParaInabilitar?.fornecedor.itensVencedores.sort((a, b) => a - b).join(", ")}</p>
                </div>

                {segundosColocados.length > 0 && (
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-2">Segundos colocados que assumirão os itens:</p>
                    {segundosColocados.map((seg) => (
                      <p key={seg.numero_item} className="text-sm">
                        Item {seg.numero_item}: <strong>{seg.fornecedor_nome}</strong> - {formatCurrency(seg.valor_lance)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Motivo da Inabilitação *</Label>
              <Textarea
                placeholder="Descreva o motivo da inabilitação do fornecedor..."
                value={motivoInabilitacao}
                onChange={(e) => setMotivoInabilitacao(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleInabilitarFornecedor}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirmar Inabilitação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para reverter inabilitação */}
      <AlertDialog open={dialogReverterInabilitacao} onOpenChange={setDialogReverterInabilitacao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5" />
              Reverter Inabilitação
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a reverter a inabilitação do fornecedor{" "}
              <strong>{inabilitacaoParaReverter?.fornecedor.razao_social}</strong>.
              O fornecedor será restaurado como vencedor dos itens originais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Motivo da Reversão (opcional)</Label>
              <Input
                placeholder="Ex: Documentação regularizada"
                value={motivoReversao}
                onChange={(e) => setMotivoReversao(e.target.value)}
              />
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReverterInabilitacao}>
              Confirmar Reversão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para reabrir negociação */}
      <AlertDialog open={dialogReabrirNegociacao} onOpenChange={setDialogReabrirNegociacao}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5" />
              Reabrir Negociação
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Após inabilitar o fornecedor{" "}
                  <strong>{inabilitacaoParaReabrirNegociacao?.fornecedor.razao_social}</strong>,
                  você pode reabrir a negociação com os segundos colocados dos itens afetados.
                </p>
                
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium">Itens para negociação:</p>
                  <p className="text-sm">
                    {inabilitacaoParaReabrirNegociacao?.inabilitado?.itens_afetados?.sort((a, b) => a - b).join(", ")}
                  </p>
                </div>

                {segundosColocados.length > 0 && (
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-2">Segundos colocados disponíveis para negociação:</p>
                    {segundosColocados.map((seg) => (
                      <p key={seg.numero_item} className="text-sm">
                        Item {seg.numero_item}: <strong>{seg.fornecedor_nome}</strong> - {formatCurrency(seg.valor_lance)}
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  A sessão de lances será reaberta para os itens selecionados, permitindo negociar melhores condições com os fornecedores classificados.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (inabilitacaoParaReabrirNegociacao?.inabilitado && onReabrirNegociacao) {
                  // Encontrar o segundo colocado com menor valor para abrir negociação
                  const segundoColocado = segundosColocados.length > 0 
                    ? segundosColocados[0] 
                    : null;
                  
                  onReabrirNegociacao(
                    inabilitacaoParaReabrirNegociacao.inabilitado.itens_afetados,
                    segundoColocado?.fornecedor_id || ""
                  );
                  setDialogReabrirNegociacao(false);
                  setInabilitacaoParaReabrirNegociacao(null);
                  onOpenChange(false);
                }
              }}
            >
              <Gavel className="h-4 w-4 mr-1" />
              Reabrir Sessão de Lances
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para rejeição de documento com motivo */}
      <AlertDialog open={dialogRejeitarDocumento} onOpenChange={setDialogRejeitarDocumento}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Rejeitar Documento
            </AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da rejeição. O fornecedor poderá reenviar o documento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Motivo da Rejeição *</Label>
              <Textarea
                placeholder="Descreva o motivo da rejeição do documento..."
                value={motivoRejeicaoDocumento}
                onChange={(e) => setMotivoRejeicaoDocumento(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRejeitarDocumento}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirmar Rejeição
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para solicitar atualização de documento com motivo */}
      <AlertDialog open={dialogSolicitarAtualizacaoDocumento} onOpenChange={setDialogSolicitarAtualizacaoDocumento}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Solicitar Atualização do Documento
            </AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da solicitação de atualização. O fornecedor receberá a notificação e poderá reenviar o documento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Motivo da Solicitação de Atualização *</Label>
              <Textarea
                placeholder="Descreva o motivo da solicitação de atualização do documento..."
                value={motivoAtualizacaoDocumento}
                onChange={(e) => setMotivoAtualizacaoDocumento(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSolicitarAtualizacaoDocumento}>
              Confirmar Solicitação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
