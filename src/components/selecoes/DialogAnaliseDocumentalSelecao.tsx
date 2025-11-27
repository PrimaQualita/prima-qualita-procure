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
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ExternalLink, FileText, CheckCircle, AlertCircle, Download, Eye, Send, Clock, XCircle, RefreshCw, Undo2, UserX, UserCheck, MessageSquare, Handshake, Gavel, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { gerarRespostaRecursoPDF } from "@/lib/gerarRespostaRecursoPDF";
import { gerarRecursoPDF } from "@/lib/gerarRecursoPDF";

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
  const [dialogEscolhaTipoInabilitacao, setDialogEscolhaTipoInabilitacao] = useState(false);
  const [tipoInabilitacao, setTipoInabilitacao] = useState<'completa' | 'parcial'>('completa');
  const [itensSelecionadosInabilitacao, setItensSelecionadosInabilitacao] = useState<number[]>([]);
  const [fornecedorParaInabilitar, setFornecedorParaInabilitar] = useState<FornecedorData | null>(null);
  const [motivoInabilitacao, setMotivoInabilitacao] = useState("");
  const [segundosColocados, setSegundosColocados] = useState<SegundoColocado[]>([]);
  const [reabrirParaNegociacao, setReabrirParaNegociacao] = useState(false);
  const [criterioJulgamento, setCriterioJulgamento] = useState<string>("global");
  
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
  
  // State para aprovação geral do fornecedor
  const [fornecedoresAprovadosGeral, setFornecedoresAprovadosGeral] = useState<Set<string>>(new Set());
  
  // States para recursos de inabilitação
  const [recursosInabilitacao, setRecursosInabilitacao] = useState<Record<string, any>>({});
  const [dialogResponderRecurso, setDialogResponderRecurso] = useState(false);
  const [recursoParaResponder, setRecursoParaResponder] = useState<any>(null);
  const [respostaRecurso, setRespostaRecurso] = useState("");
  const [deferirRecurso, setDeferirRecurso] = useState(true);
  const [gerandoPdfRecurso, setGerandoPdfRecurso] = useState(false);
  const [selecaoInfo, setSelecaoInfo] = useState<{titulo: string; numero: string; numeroProcesso: string} | null>(null);
  
  // State para confirmar exclusão de PDF
  const [confirmDeletePdf, setConfirmDeletePdf] = useState<{ open: boolean; recursoId: string | null; tipo: 'recurso' | 'resposta' | null }>({ open: false, recursoId: null, tipo: null });

  useEffect(() => {
    if (open && selecaoId) {
      loadFornecedoresVencedores();
    }
  }, [open, selecaoId]);

  // Buscar segundos colocados quando itens selecionados mudarem na inabilitação parcial
  useEffect(() => {
    const fetchSegundos = async () => {
      if (dialogInabilitar && tipoInabilitacao === 'parcial' && fornecedorParaInabilitar && itensSelecionadosInabilitacao.length > 0) {
        const segundos = await buscarSegundosColocados(itensSelecionadosInabilitacao, fornecedorParaInabilitar.fornecedor.id);
        setSegundosColocados(segundos);
      }
    };
    fetchSegundos();
  }, [dialogInabilitar, tipoInabilitacao, itensSelecionadosInabilitacao, fornecedorParaInabilitar]);

  const loadFornecedoresVencedores = async () => {
    setLoading(true);
    try {
      // Buscar dados da seleção e itens para obter quantidades
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("cotacao_relacionada_id, titulo_selecao, numero_selecao, criterios_julgamento")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      // Salvar critério de julgamento
      setCriterioJulgamento(selecaoData?.criterios_julgamento || "global");

      // Salvar cotacao_relacionada_id para uso em outras funções
      const cotacaoId = selecaoData?.cotacao_relacionada_id;
      setCotacaoRelacionadaId(cotacaoId || null);

      // Buscar o número do processo através da cotação
      let numeroProcesso = "";
      if (cotacaoId) {
        const { data: cotacaoData } = await supabase
          .from("cotacoes_precos")
          .select("processos_compras (numero_processo_interno)")
          .eq("id", cotacaoId)
          .single();
        
        numeroProcesso = (cotacaoData as any)?.processos_compras?.numero_processo_interno || "";
      }

      // Salvar info da seleção para uso no PDF
      setSelecaoInfo({
        titulo: selecaoData?.titulo_selecao || "",
        numero: selecaoData?.numero_selecao || "",
        numeroProcesso
      });

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
      
      // Carregar aprovações persistidas do banco de dados
      const fornecedorIds = fornecedoresArray.map(f => f.id);
      if (fornecedorIds.length > 0) {
        const { data: aprovacoesData } = await supabase
          .from("selecao_propostas_fornecedor")
          .select("fornecedor_id, aprovado_analise_documental")
          .eq("selecao_id", selecaoId)
          .in("fornecedor_id", fornecedorIds)
          .eq("aprovado_analise_documental", true);
        
        if (aprovacoesData && aprovacoesData.length > 0) {
          const aprovadosSet = new Set(aprovacoesData.map(a => a.fornecedor_id));
          setFornecedoresAprovadosGeral(aprovadosSet);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar fornecedores vencedores:", error);
      toast.error("Erro ao carregar fornecedores vencedores");
    } finally {
      setLoading(false);
    }
    
    // Carregar recursos de inabilitação
    loadRecursosInabilitacao();
  };

  const loadRecursosInabilitacao = async () => {
    try {
      const { data: recursos, error } = await supabase
        .from("recursos_inabilitacao_selecao")
        .select("*")
        .eq("selecao_id", selecaoId);

      if (error) throw error;

      // Criar mapa de recursos por inabilitacao_id
      const recursosMap: Record<string, any> = {};
      (recursos || []).forEach((recurso: any) => {
        recursosMap[recurso.inabilitacao_id] = recurso;
      });
      setRecursosInabilitacao(recursosMap);
    } catch (error) {
      console.error("Erro ao carregar recursos:", error);
    }
  };

  const handleResponderRecurso = async (deferido: boolean) => {
    if (!recursoParaResponder) return;

    setGerandoPdfRecurso(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Buscar dados do usuário gestor
      const { data: profileData } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", userData?.user?.id)
        .single();

      // Buscar dados do fornecedor e inabilitação
      const { data: inabilitacao } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("*, fornecedores(razao_social, cnpj)")
        .eq("id", recursoParaResponder.inabilitacao_id)
        .single();

      const dataRespostaGestor = new Date().toISOString();
      
      const { error } = await supabase
        .from("recursos_inabilitacao_selecao")
        .update({
          status_recurso: deferido ? "deferido" : "indeferido",
          resposta_gestor: respostaRecurso,
          data_resposta_gestor: dataRespostaGestor,
          usuario_gestor_id: userData?.user?.id
        })
        .eq("id", recursoParaResponder.id);

      if (error) throw error;

      // Se deferido, reverter a inabilitação automaticamente
      if (deferido) {
        const { error: revertError } = await supabase
          .from("fornecedores_inabilitados_selecao")
          .update({
            revertido: true,
            motivo_reversao: `Recurso deferido: ${respostaRecurso}`,
            data_reversao: new Date().toISOString(),
            usuario_reverteu_id: userData?.user?.id
          })
          .eq("id", recursoParaResponder.inabilitacao_id);

        if (revertError) throw revertError;
      }

      // Gerar PDF da resposta ao recurso
      try {
        const pdfResult = await gerarRespostaRecursoPDF(
          deferido ? "provimento" : "negado",
          respostaRecurso,
          profileData?.nome_completo || "Gestor",
          profileData?.cpf || "",
          inabilitacao?.fornecedores?.razao_social || "Fornecedor",
          selecaoInfo?.numeroProcesso || ""
        );

        if (pdfResult?.url) {
          // Salvar URL do PDF no recurso
          await supabase
            .from("recursos_inabilitacao_selecao")
            .update({
              url_pdf_resposta: pdfResult.url,
              nome_arquivo_resposta: pdfResult.fileName,
              protocolo_resposta: pdfResult.protocolo
            })
            .eq("id", recursoParaResponder.id);

          // PDF gerado com sucesso - abrir em nova aba
          window.open(pdfResult.url, "_blank");
        }
      } catch (pdfError) {
        console.error("Erro ao gerar PDF:", pdfError);
        // Não bloqueia o processo se o PDF falhar
      }

      toast.success(`Recurso ${deferido ? "deferido" : "indeferido"} com sucesso!`);
      setDialogResponderRecurso(false);
      setRecursoParaResponder(null);
      setRespostaRecurso("");
      loadFornecedoresVencedores();
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao responder recurso:", error);
      toast.error("Erro ao responder recurso");
    } finally {
      setGerandoPdfRecurso(false);
    }
  };

  const handleGerarPdfRecurso = async (recurso: any, inabilitacao: any, fornecedor: any) => {
    try {
      toast.info("Gerando PDF do recurso...");
      const pdfResult = await gerarRecursoPDF(
        recurso.motivo_recurso,
        fornecedor.razao_social,
        fornecedor.cnpj,
        selecaoInfo?.numeroProcesso || "",
        inabilitacao.motivo_inabilitacao,
        selecaoInfo?.numero || ""
      );
      await supabase.from("recursos_inabilitacao_selecao").update({
        url_pdf_recurso: pdfResult.url,
        nome_arquivo_recurso: pdfResult.fileName,
        protocolo_recurso: pdfResult.protocolo
      }).eq("id", recurso.id);
      loadRecursosInabilitacao();
      toast.success("PDF do recurso gerado!");
      window.open(pdfResult.url, "_blank");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF do recurso");
    }
  };

  const handleGerarPdfResposta = async (recurso: any, fornecedor: any) => {
    try {
      toast.info("Gerando PDF da resposta...");
      const { data: userData } = await supabase.auth.getUser();
      const { data: profileData } = await supabase.from("profiles").select("nome_completo, cpf").eq("id", userData?.user?.id).single();
      
      const pdfResult = await gerarRespostaRecursoPDF(
        recurso.status_recurso === "deferido" ? "provimento" : "negado",
        recurso.resposta_gestor || "",
        profileData?.nome_completo || "Gestor",
        profileData?.cpf || "",
        fornecedor.razao_social,
        selecaoInfo?.numeroProcesso || "",
        selecaoInfo?.numero || ""
      );
      await supabase.from("recursos_inabilitacao_selecao").update({
        url_pdf_resposta: pdfResult.url,
        nome_arquivo_resposta: pdfResult.fileName,
        protocolo_resposta: pdfResult.protocolo
      }).eq("id", recurso.id);
      loadRecursosInabilitacao();
      toast.success("PDF da resposta gerado!");
      window.open(pdfResult.url, "_blank");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF da resposta");
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

  // Handler para excluir PDF de recurso/resposta
  const handleExcluirPdfRecurso = async () => {
    if (!confirmDeletePdf.recursoId || !confirmDeletePdf.tipo) return;
    
    try {
      if (confirmDeletePdf.tipo === 'recurso') {
        await supabase.from("recursos_inabilitacao_selecao").update({ url_pdf_recurso: null, nome_arquivo_recurso: null, protocolo_recurso: null }).eq("id", confirmDeletePdf.recursoId);
      } else {
        await supabase.from("recursos_inabilitacao_selecao").update({ url_pdf_resposta: null, nome_arquivo_resposta: null, protocolo_resposta: null }).eq("id", confirmDeletePdf.recursoId);
      }
      toast.success("PDF excluído com sucesso");
      loadRecursosInabilitacao();
    } catch (error) {
      console.error("Erro ao excluir PDF:", error);
      toast.error("Erro ao excluir PDF");
    } finally {
      setConfirmDeletePdf({ open: false, recursoId: null, tipo: null });
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

  const buscarSegundosColocados = async (itens: number[], fornecedorExcluirId: string) => {
    try {
      const segundos: SegundoColocado[] = [];
      
      // Buscar todos os fornecedores inabilitados nesta seleção
      const { data: inabilitados } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);
      
      const inabilitadosIds = new Set(inabilitados?.map(i => i.fornecedor_id) || []);
      // Adicionar também o fornecedor que está sendo inabilitado agora
      inabilitadosIds.add(fornecedorExcluirId);
      
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
        
        // Filtrar para excluir todos os fornecedores inabilitados
        const lancesValidos = lances?.filter(l => !inabilitadosIds.has(l.fornecedor_id)) || [];
        
        // O primeiro lance válido é o segundo colocado
        if (lancesValidos.length > 0) {
          segundos.push({
            numero_item: item,
            fornecedor_id: lancesValidos[0].fornecedor_id,
            fornecedor_nome: (lancesValidos[0].fornecedores as any)?.razao_social || "N/A",
            valor_lance: lancesValidos[0].valor_lance,
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
    setReabrirParaNegociacao(false);
    setTipoInabilitacao('completa');
    setItensSelecionadosInabilitacao([]);
    
    // Se critério for global ou fornecedor tem apenas 1 item, vai direto para inabilitação
    if (criterioJulgamento === 'global' || data.fornecedor.itensVencedores.length <= 1) {
      const segundos = await buscarSegundosColocados(data.fornecedor.itensVencedores, data.fornecedor.id);
      console.log("Segundos colocados encontrados:", segundos);
      setDialogInabilitar(true);
    } else {
      // Mostra diálogo de escolha primeiro
      setDialogEscolhaTipoInabilitacao(true);
    }
  };

  const handleConfirmarTipoInabilitacao = async () => {
    if (!fornecedorParaInabilitar) return;
    
    setDialogEscolhaTipoInabilitacao(false);
    
    if (tipoInabilitacao === 'completa') {
      // Buscar segundos colocados para todos os itens
      const segundos = await buscarSegundosColocados(fornecedorParaInabilitar.fornecedor.itensVencedores, fornecedorParaInabilitar.fornecedor.id);
      console.log("Segundos colocados encontrados:", segundos);
      setDialogInabilitar(true);
    } else {
      // Mostra diálogo de inabilitação com seleção de itens
      // Pré-selecionar todos os itens
      setItensSelecionadosInabilitacao([...fornecedorParaInabilitar.fornecedor.itensVencedores]);
      setDialogInabilitar(true);
    }
  };
  
  const handleToggleItemInabilitacao = (item: number) => {
    setItensSelecionadosInabilitacao(prev => {
      if (prev.includes(item)) {
        return prev.filter(i => i !== item);
      } else {
        return [...prev, item];
      }
    });
  };
  
  const handleSelecionarTodosItens = () => {
    if (!fornecedorParaInabilitar) return;
    setItensSelecionadosInabilitacao([...fornecedorParaInabilitar.fornecedor.itensVencedores]);
  };
  
  const handleDeselecionarTodosItens = () => {
    setItensSelecionadosInabilitacao([]);
  };

  const handleInabilitarFornecedor = async () => {
    if (!fornecedorParaInabilitar || !motivoInabilitacao.trim()) {
      toast.error("Informe o motivo da inabilitação");
      return;
    }
    
    // Se for inabilitação parcial, verificar se há itens selecionados
    if (tipoInabilitacao === 'parcial' && itensSelecionadosInabilitacao.length === 0) {
      toast.error("Selecione pelo menos um item para inabilitar");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Usar itens selecionados na inabilitação parcial, ou todos na completa
      const itensAfetados = tipoInabilitacao === 'parcial' 
        ? itensSelecionadosInabilitacao 
        : fornecedorParaInabilitar.fornecedor.itensVencedores;
      const fornecedorInabId = fornecedorParaInabilitar.fornecedor.id;

      // RECALCULAR segundos colocados AGORA para garantir dados frescos
      const segundosAtualizados = await buscarSegundosColocados(itensAfetados, fornecedorInabId);
      console.log("Segundos colocados recalculados na inabilitação:", segundosAtualizados);

      // Registrar inabilitação
      const { error: inabError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .insert({
          selecao_id: selecaoId,
          fornecedor_id: fornecedorInabId,
          itens_afetados: itensAfetados,
          motivo_inabilitacao: motivoInabilitacao,
          usuario_inabilitou_id: user.id,
        });

      if (inabError) throw inabError;

      // Remover indicativo de vencedor dos itens do fornecedor inabilitado
      const { error: removeVencedorError } = await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: false })
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorInabId)
        .in("numero_item", itensAfetados);

      if (removeVencedorError) throw removeVencedorError;

      if (reabrirParaNegociacao && onReabrirNegociacao) {
        // Reabrir itens para negociação com o segundo colocado
        for (const item of itensAfetados) {
          const segundoColocado = segundosAtualizados.find(s => s.numero_item === item);
          console.log(`Item ${item}: segundo colocado = `, segundoColocado);
          
          await supabase
            .from("itens_abertos_lances")
            .update({
              aberto: true,
              em_negociacao: segundoColocado ? true : false,
              nao_negociar: !segundoColocado,
              data_fechamento: segundoColocado ? null : new Date().toISOString(),
              negociacao_concluida: !segundoColocado,
              fornecedor_negociacao_id: segundoColocado?.fornecedor_id || null,
            })
            .eq("selecao_id", selecaoId)
            .eq("numero_item", item);
        }
        toast.success("Fornecedor inabilitado. Itens reabertos para negociação com os segundos colocados.");
        // NÃO chamar onReabrirNegociacao aqui pois já fizemos o update com o segundo colocado correto
        // A callback em DetalheSelecao.tsx sobrescreveria com o fornecedor errado
      } else {
        // Processar cada item afetado
        for (const item of itensAfetados) {
          const segundoColocado = segundosAtualizados.find(s => s.numero_item === item);
          console.log(`Item ${item} (sem reabrir): segundo colocado = `, segundoColocado);
          
          if (segundoColocado) {
            // Verificar se o segundo colocado não está inabilitado
            const { data: segInab } = await supabase
              .from("fornecedores_inabilitados_selecao")
              .select("id")
              .eq("selecao_id", selecaoId)
              .eq("fornecedor_id", segundoColocado.fornecedor_id)
              .eq("revertido", false)
              .maybeSingle();

            if (!segInab) {
              // Marcar segundo colocado como vencedor
              await supabase
                .from("lances_fornecedores")
                .update({ indicativo_lance_vencedor: true })
                .eq("selecao_id", selecaoId)
                .eq("fornecedor_id", segundoColocado.fornecedor_id)
                .eq("numero_item", segundoColocado.numero_item);

              // Atualizar o fornecedor de negociação para o segundo colocado
              console.log(`Atualizando item ${item} para fornecedor_negociacao_id = ${segundoColocado.fornecedor_id}`);
              const { error: updateItemError } = await supabase
                .from("itens_abertos_lances")
                .update({
                  fornecedor_negociacao_id: segundoColocado.fornecedor_id,
                  em_negociacao: true,
                  negociacao_concluida: false,
                  aberto: true,
                  data_fechamento: null,
                })
                .eq("selecao_id", selecaoId)
                .eq("numero_item", item);
              
              if (updateItemError) {
                console.error(`Erro ao atualizar item ${item}:`, updateItemError);
              } else {
                console.log(`Item ${item} atualizado com sucesso para ${segundoColocado.fornecedor_nome}`);
              }
            } else {
              // Segundo colocado também inabilitado - fechar item
              await supabase
                .from("itens_abertos_lances")
                .update({
                  fornecedor_negociacao_id: null,
                  em_negociacao: false,
                  negociacao_concluida: true,
                  nao_negociar: true,
                  aberto: false,
                  data_fechamento: new Date().toISOString(),
                })
                .eq("selecao_id", selecaoId)
                .eq("numero_item", item);
            }
          } else {
            // Sem segundo colocado - fechar item sem negociação
            await supabase
              .from("itens_abertos_lances")
              .update({
                fornecedor_negociacao_id: null,
                em_negociacao: false,
                negociacao_concluida: true,
                nao_negociar: true,
                aberto: false,
                data_fechamento: new Date().toISOString(),
              })
              .eq("selecao_id", selecaoId)
              .eq("numero_item", item);
          }
        }
        
        const temSegundos = segundosAtualizados.length > 0;
        toast.success(temSegundos 
          ? "Fornecedor inabilitado. Segundos colocados assumem os itens."
          : "Fornecedor inabilitado. Itens sem segundo colocado foram fechados.");
      }

      setDialogInabilitar(false);
      setFornecedorParaInabilitar(null);
      setMotivoInabilitacao("");
      setReabrirParaNegociacao(false);
      setSegundosColocados([]);
      setTipoInabilitacao('completa');
      setItensSelecionadosInabilitacao([]);
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

      // Atualizar itens_abertos_lances para fechar os itens e devolver ao fornecedor original
      // Se o item estava em negociação apenas por causa da inabilitação, deve fechar
      const { error: updateItensError } = await supabase
        .from("itens_abertos_lances")
        .update({ 
          fornecedor_negociacao_id: inabilitacaoParaReverter.fornecedor.id,
          em_negociacao: false,
          negociacao_concluida: true,
          nao_negociar: true,
          aberto: false,
          data_fechamento: new Date().toISOString()
        })
        .eq("selecao_id", selecaoId)
        .in("numero_item", inabilitacaoParaReverter.inabilitado.itens_afetados);

      if (updateItensError) {
        console.error("Erro ao atualizar itens de negociação:", updateItensError);
      }

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
                {fornecedoresAprovadosGeral.has(data.fornecedor.id) ? (
                  /* Fornecedor já aprovado - mostrar badge e botão de reversão */
                  <>
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Fornecedor Aprovado
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          // Remover aprovação do banco de dados
                          const { error } = await supabase
                            .from("selecao_propostas_fornecedor")
                            .update({
                              aprovado_analise_documental: false,
                              data_aprovacao_documental: null
                            })
                            .eq("selecao_id", selecaoId)
                            .eq("fornecedor_id", data.fornecedor.id);
                          
                          if (error) throw error;
                          
                          setFornecedoresAprovadosGeral(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(data.fornecedor.id);
                            return newSet;
                          });
                          toast.success("Aprovação revertida");
                        } catch (error) {
                          console.error("Erro ao reverter aprovação:", error);
                          toast.error("Erro ao reverter aprovação");
                        }
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Reverter Decisão
                    </Button>
                  </>
                ) : (
                  /* Fornecedor ainda não aprovado - mostrar status e botões */
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
                        onClick={async () => {
                          try {
                            // Persistir aprovação no banco de dados
                            const { error } = await supabase
                              .from("selecao_propostas_fornecedor")
                              .update({
                                aprovado_analise_documental: true,
                                data_aprovacao_documental: new Date().toISOString()
                              })
                              .eq("selecao_id", selecaoId)
                              .eq("fornecedor_id", data.fornecedor.id);
                            
                            if (error) throw error;
                            
                            setFornecedoresAprovadosGeral(prev => new Set(prev).add(data.fornecedor.id));
                            toast.success(`Fornecedor ${data.fornecedor.razao_social} aprovado com sucesso!`);
                          } catch (error) {
                            console.error("Erro ao aprovar fornecedor:", error);
                            toast.error("Erro ao aprovar fornecedor");
                          }
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
                )}
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
                      await buscarSegundosColocados(data.inabilitado?.itens_afetados || [], data.fornecedor.id);
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
      
      {/* Seção de Recurso para Fornecedores Inabilitados */}
      {isInabilitado && data.inabilitado && recursosInabilitacao[data.inabilitado.id] && (
        <CardContent className="pt-0 border-t mt-3">
          {(() => {
            const recurso = recursosInabilitacao[data.inabilitado!.id];
            return (
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Gavel className="h-4 w-4" />
                  Recurso de Inabilitação
                </h4>
                
                {recurso.status_recurso === "aguardando_envio" && (
                  <Badge variant="outline">Aguardando envio do fornecedor</Badge>
                )}
                
                {recurso.status_recurso === "expirado" && (
                  <Badge variant="secondary">Prazo expirado - Sem recurso</Badge>
                )}
                
                {recurso.status_recurso === "enviado" && (
                  <div className="space-y-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-amber-500">Recurso Pendente de Análise</Badge>
                      <span className="text-xs text-muted-foreground">
                        Enviado em: {format(new Date(recurso.data_envio_recurso), "dd/MM/yyyy 'às' HH:mm")}
                      </span>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-amber-700 mb-1">Razões do fornecedor:</p>
                      <p className="whitespace-pre-wrap text-amber-900">{recurso.motivo_recurso}</p>
                    </div>
                    
                    {/* PDF do Recurso do Fornecedor */}
                    {recurso.url_pdf_recurso && (
                      <div className="flex items-center gap-2 bg-white p-2 rounded border">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm flex-1">{recurso.nome_arquivo_recurso || "Recurso do Fornecedor"}</span>
                        <Button size="sm" variant="outline" onClick={() => window.open(recurso.url_pdf_recurso, '_blank')}>
                          <Eye className="h-3 w-3 mr-1" />
                          Ver
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={recurso.url_pdf_recurso} download={recurso.nome_arquivo_recurso}>
                            <Download className="h-3 w-3 mr-1" />
                            Baixar
                          </a>
                        </Button>
                      </div>
                    )}
                    
                    <Button
                      size="sm"
                      onClick={() => {
                        setRecursoParaResponder(recurso);
                        setRespostaRecurso("");
                        setDialogResponderRecurso(true);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Responder Recurso
                    </Button>
                  </div>
                )}
                
                {recurso.status_recurso === "deferido" && (
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200 space-y-3">
                    <Badge className="bg-green-500">Recurso Deferido</Badge>
                    
                    {/* Quadro com texto do Recurso */}
                    {recurso.motivo_recurso && (
                      <div className="bg-white p-3 rounded border border-green-300">
                        <p className="text-xs font-semibold text-green-700 mb-1">Razões do Recurso:</p>
                        <div className="max-h-24 overflow-y-auto text-sm text-gray-700">
                          {recurso.motivo_recurso}
                        </div>
                      </div>
                    )}
                    
                    {/* Quadro com texto da Resposta */}
                    {recurso.resposta_gestor && (
                      <div className="bg-white p-3 rounded border border-green-300">
                        <p className="text-xs font-semibold text-green-700 mb-1">Resposta do Gestor:</p>
                        <div className="max-h-24 overflow-y-auto text-sm text-gray-700">
                          {recurso.resposta_gestor}
                        </div>
                      </div>
                    )}
                    
                    {/* PDFs do Recurso e Resposta */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {recurso.url_pdf_recurso ? (
                        <div className="flex items-center gap-1 bg-white p-2 rounded border text-xs">
                          <FileText className="h-3 w-3 text-amber-600" />
                          <span>Recurso</span>
                          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => window.open(recurso.url_pdf_recurso, '_blank')}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1" asChild>
                            <a href={recurso.url_pdf_recurso} download><Download className="h-3 w-3" /></a>
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1 text-destructive" onClick={() => {
                            setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: 'recurso' });
                          }}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleGerarPdfRecurso(recurso, data.inabilitado, data.fornecedor)}>
                          <FileDown className="h-3 w-3 mr-1" />
                          Gerar PDF Recurso
                        </Button>
                      )}
                      {recurso.url_pdf_resposta ? (
                        <div className="flex items-center gap-1 bg-white p-2 rounded border text-xs">
                          <FileText className="h-3 w-3 text-green-600" />
                          <span>Resposta</span>
                          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => window.open(recurso.url_pdf_resposta, '_blank')}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1" asChild>
                            <a href={recurso.url_pdf_resposta} download><Download className="h-3 w-3" /></a>
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1 text-destructive" onClick={() => {
                            setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: 'resposta' });
                          }}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleGerarPdfResposta(recurso, data.fornecedor)}>
                          <FileDown className="h-3 w-3 mr-1" />
                          Gerar PDF Resposta
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                
                {recurso.status_recurso === "indeferido" && (
                  <div className="bg-red-50 p-3 rounded-lg border border-red-200 space-y-3">
                    <Badge variant="destructive">Recurso Indeferido</Badge>
                    
                    {/* Quadro com texto do Recurso */}
                    {recurso.motivo_recurso && (
                      <div className="bg-white p-3 rounded border border-red-300">
                        <p className="text-xs font-semibold text-red-700 mb-1">Razões do Recurso:</p>
                        <div className="max-h-24 overflow-y-auto text-sm text-gray-700">
                          {recurso.motivo_recurso}
                        </div>
                      </div>
                    )}
                    
                    {/* Quadro com texto da Resposta */}
                    {recurso.resposta_gestor && (
                      <div className="bg-white p-3 rounded border border-red-300">
                        <p className="text-xs font-semibold text-red-700 mb-1">Resposta do Gestor:</p>
                        <div className="max-h-24 overflow-y-auto text-sm text-gray-700">
                          {recurso.resposta_gestor}
                        </div>
                      </div>
                    )}
                    
                    {/* PDFs do Recurso e Resposta */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {recurso.url_pdf_recurso ? (
                        <div className="flex items-center gap-1 bg-white p-2 rounded border text-xs">
                          <FileText className="h-3 w-3 text-amber-600" />
                          <span>Recurso</span>
                          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => window.open(recurso.url_pdf_recurso, '_blank')}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1" asChild>
                            <a href={recurso.url_pdf_recurso} download><Download className="h-3 w-3" /></a>
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1 text-destructive" onClick={() => {
                            setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: 'recurso' });
                          }}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleGerarPdfRecurso(recurso, data.inabilitado, data.fornecedor)}>
                          <FileDown className="h-3 w-3 mr-1" />
                          Gerar PDF Recurso
                        </Button>
                      )}
                      {recurso.url_pdf_resposta ? (
                        <div className="flex items-center gap-1 bg-white p-2 rounded border text-xs">
                          <FileText className="h-3 w-3 text-red-600" />
                          <span>Resposta</span>
                          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => window.open(recurso.url_pdf_resposta, '_blank')}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1" asChild>
                            <a href={recurso.url_pdf_resposta} download><Download className="h-3 w-3" /></a>
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1 text-destructive" onClick={() => {
                            setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: 'resposta' });
                          }}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleGerarPdfResposta(recurso, data.fornecedor)}>
                          <FileDown className="h-3 w-3 mr-1" />
                          Gerar PDF Resposta
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      )}
      
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

      {/* Dialog para escolher tipo de inabilitação */}
      <AlertDialog open={dialogEscolhaTipoInabilitacao} onOpenChange={setDialogEscolhaTipoInabilitacao}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-destructive" />
              Tipo de Inabilitação
            </AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-4">
                Como deseja inabilitar o fornecedor{" "}
                <strong>{fornecedorParaInabilitar?.fornecedor.razao_social}</strong>?
              </p>
              <p className="text-sm text-muted-foreground">
                Este fornecedor venceu os itens: {fornecedorParaInabilitar?.fornecedor.itensVencedores.sort((a, b) => a - b).join(", ")}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3 py-4">
            <div 
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${tipoInabilitacao === 'parcial' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              onClick={() => setTipoInabilitacao('parcial')}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 ${tipoInabilitacao === 'parcial' ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                <div>
                  <p className="font-medium">Inabilitar apenas itens específicos</p>
                  <p className="text-sm text-muted-foreground">
                    Selecione quais itens o fornecedor será inabilitado
                  </p>
                </div>
              </div>
            </div>
            
            <div 
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${tipoInabilitacao === 'completa' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              onClick={() => setTipoInabilitacao('completa')}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 ${tipoInabilitacao === 'completa' ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                <div>
                  <p className="font-medium">Inabilitar fornecedor completamente</p>
                  <p className="text-sm text-muted-foreground">
                    Inabilitar todos os itens que o fornecedor venceu
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarTipoInabilitacao}>
              Continuar
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
              {tipoInabilitacao === 'parcial' ? 'Inabilitar Itens Específicos' : 'Inabilitar Fornecedor'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Você está prestes a inabilitar o fornecedor{" "}
                  <strong>{fornecedorParaInabilitar?.fornecedor.razao_social}</strong> 
                  {tipoInabilitacao === 'parcial' ? ' nos itens selecionados' : ' na análise documental'}.
                </p>
                
                {tipoInabilitacao === 'parcial' ? (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Selecione os itens para inabilitar:</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleSelecionarTodosItens}
                        >
                          Todos
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleDeselecionarTodosItens}
                        >
                          Nenhum
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {fornecedorParaInabilitar?.fornecedor.itensVencedores.sort((a, b) => a - b).map((item) => (
                        <div 
                          key={item}
                          className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${
                            itensSelecionadosInabilitacao.includes(item) 
                              ? 'border-destructive bg-destructive/10' 
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => handleToggleItemInabilitacao(item)}
                        >
                          <Checkbox
                            checked={itensSelecionadosInabilitacao.includes(item)}
                            onCheckedChange={() => handleToggleItemInabilitacao(item)}
                          />
                          <span className="text-sm">Item {item}</span>
                        </div>
                      ))}
                    </div>
                    {itensSelecionadosInabilitacao.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {itensSelecionadosInabilitacao.length} item(ns) selecionado(s)
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium">Itens afetados:</p>
                    <p className="text-sm">{fornecedorParaInabilitar?.fornecedor.itensVencedores.sort((a, b) => a - b).join(", ")}</p>
                  </div>
                )}

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
            
            {onReabrirNegociacao && (
              <div className="flex items-center space-x-2 p-3 bg-primary/10 rounded-lg">
                <Checkbox
                  id="reabrirNegociacao"
                  checked={reabrirParaNegociacao}
                  onCheckedChange={(checked) => setReabrirParaNegociacao(checked === true)}
                />
                <label
                  htmlFor="reabrirNegociacao"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Reabrir itens para negociação após inabilitação
                </label>
              </div>
            )}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleInabilitarFornecedor}
              className="bg-destructive hover:bg-destructive/90"
              disabled={tipoInabilitacao === 'parcial' && itensSelecionadosInabilitacao.length === 0}
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

      {/* Dialog para responder recurso de inabilitação */}
      <AlertDialog open={dialogResponderRecurso} onOpenChange={setDialogResponderRecurso}>
        <AlertDialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle className="flex items-center gap-2 text-primary">
              <Gavel className="h-5 w-5" />
              Responder Recurso de Inabilitação
            </AlertDialogTitle>
            <AlertDialogDescription>
              Analise as razões apresentadas pelo fornecedor e fundamenta sua decisão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
            {recursoParaResponder && (
              <div className="bg-muted/50 p-3 rounded-lg border max-h-48 overflow-y-auto">
                <p className="text-xs text-muted-foreground mb-1">Razões do fornecedor:</p>
                <p className="text-sm whitespace-pre-wrap">{recursoParaResponder.motivo_recurso}</p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label className="font-semibold">Decisão *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decisao"
                    checked={deferirRecurso}
                    onChange={() => setDeferirRecurso(true)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium text-green-700">Deferir (Aceitar)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decisao"
                    checked={!deferirRecurso}
                    onChange={() => setDeferirRecurso(false)}
                    className="w-4 h-4 text-destructive"
                  />
                  <span className="text-sm font-medium text-red-700">Indeferir (Rejeitar)</span>
                </label>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="font-semibold">Fundamentação da Decisão *</Label>
              <Textarea
                placeholder="Justifique sua decisão detalhadamente..."
                value={respostaRecurso}
                onChange={(e) => setRespostaRecurso(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
            
            {deferirRecurso && (
              <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                <p className="text-sm text-green-700">
                  <strong>Atenção:</strong> Ao deferir o recurso, a inabilitação será automaticamente revertida e o fornecedor voltará a participar da seleção.
                </p>
              </div>
            )}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gerandoPdfRecurso}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleResponderRecurso(deferirRecurso)}
              disabled={!respostaRecurso.trim() || gerandoPdfRecurso}
              className={deferirRecurso ? "bg-green-600 hover:bg-green-700" : "bg-destructive hover:bg-destructive/90"}
            >
              {gerandoPdfRecurso ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Processando...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-1" />
                  {deferirRecurso ? "Deferir Recurso" : "Indeferir Recurso"}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmação para excluir PDF */}
      <AlertDialog open={confirmDeletePdf.open} onOpenChange={(open) => !open && setConfirmDeletePdf({ open: false, recursoId: null, tipo: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir PDF</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este PDF de {confirmDeletePdf.tipo === 'recurso' ? 'recurso' : 'resposta'}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirPdfRecurso} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
