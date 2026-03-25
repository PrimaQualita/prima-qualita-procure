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
import { Plus, Trash2, ExternalLink, FileText, CheckCircle, AlertCircle, AlertTriangle, Download, Eye, Send, Clock, XCircle, RefreshCw, Undo2, UserX, UserCheck, MessageSquare, Handshake, Gavel, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { gerarRespostaRecursoPDF } from "@/lib/gerarRespostaRecursoPDF";
import { gerarRecursoPDF } from "@/lib/gerarRecursoPDF";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

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
  itensLicitados: number[]; // Todos os itens que o fornecedor licitou (pode ser segundo colocado)
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
  forceReload?: number;
  onSuccess?: () => void;
  onReabrirNegociacao?: (itens: number[], fornecedorId: string) => void;
}

// Helper para gerar nome bonito do recurso
const getNomeBonitRecurso = (recurso: any, fornecedor?: FornecedorVencedor | null, tipo: 'recurso' | 'resposta' = 'recurso'): string => {
  const razaoSocial = recurso?.fornecedores?.razao_social || fornecedor?.razao_social || "Fornecedor";
  // Truncar razão social se muito longa
  const nomeResumido = razaoSocial.length > 40 ? razaoSocial.substring(0, 37) + "..." : razaoSocial;
  if (tipo === 'resposta') {
    return `Resposta Recurso - ${nomeResumido}`;
  }
  return `Recurso - ${nomeResumido}`;
};

export function DialogAnaliseDocumentalSelecao({
  open,
  onOpenChange,
  selecaoId,
  forceReload = 0,
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
  const [intencoesRecurso, setIntencoesRecurso] = useState<any[]>([]);
  const [todosRecursos, setTodosRecursos] = useState<any[]>([]);
  const [dialogResponderRecurso, setDialogResponderRecurso] = useState(false);
  const [recursoParaResponder, setRecursoParaResponder] = useState<any>(null);
  const [respostaRecurso, setRespostaRecurso] = useState("");
  const [deferirRecurso, setDeferirRecurso] = useState(true);
  const [gerandoPdfRecurso, setGerandoPdfRecurso] = useState(false);
  const [selecaoInfo, setSelecaoInfo] = useState<{titulo: string; numero: string; numeroProcesso: string; contratoGestao: string} | null>(null);
  
  // State para confirmar exclusão de PDF
  const [confirmDeletePdf, setConfirmDeletePdf] = useState<{ open: boolean; recursoId: string | null; tipo: 'recurso' | 'resposta' | null }>({ open: false, recursoId: null, tipo: null });
  
  // State para confirmar exclusão completa do recurso
  const [confirmDeleteRecurso, setConfirmDeleteRecurso] = useState<{ open: boolean; recursoId: string | null }>({ open: false, recursoId: null });
  
  // State para confirmar exclusão de documento adicional
  const [confirmDeleteDocumentoAdicional, setConfirmDeleteDocumentoAdicional] = useState<{ open: boolean; campoId: string | null; fornecedorId: string | null; nomeCampo: string }>({ open: false, campoId: null, fornecedorId: null, nomeCampo: "" });

  // States para encerramento de habilitação
  const [habilitacaoEncerrada, setHabilitacaoEncerrada] = useState(false);
  const [dataEncerramentoHabilitacao, setDataEncerramentoHabilitacao] = useState<string | null>(null);
  const [dialogEncerrarHabilitacao, setDialogEncerrarHabilitacao] = useState(false);
  const [dialogReverterEncerramento, setDialogReverterEncerramento] = useState(false);
  
  // States para provimento parcial
  const [tipoProvimento, setTipoProvimento] = useState<'total' | 'parcial'>('total');
  const [itensReabilitar, setItensReabilitar] = useState<number[]>([]);

  useEffect(() => {
    if (open && selecaoId) {
      console.log("🔄 [ANÁLISE DOC] Diálogo aberto - SEMPRE recarregar dados");
      console.log("🔄 [ANÁLISE DOC] forceReload contador:", forceReload);
      
      // LIMPAR TODO O ESTADO antes de recarregar
      setFornecedoresData([]);
      setFornecedoresInabilitados([]);
      setDocumentosAprovados({});
      setFornecedoresAprovadosGeral(new Set());
      console.log("🧹 [ANÁLISE DOC] Estado limpo - recarregando vencedores...");
      
      loadFornecedoresVencedores();
      loadRecursosInabilitacao();
    }
  }, [open, selecaoId]); // Removido forceReload - agora recarrega SEMPRE que abre
  
  // useEffect separado para forceReload quando diálogo já está aberto
  useEffect(() => {
    if (open && selecaoId && forceReload > 0) {
      console.log("🔄 [ANÁLISE DOC] forceReload mudou para:", forceReload, "- recarregando...");
      
      // LIMPAR TODO O ESTADO antes de recarregar
      setFornecedoresData([]);
      setFornecedoresInabilitados([]);
      setDocumentosAprovados({});
      setFornecedoresAprovadosGeral(new Set());
      
      loadFornecedoresVencedores();
      loadRecursosInabilitacao();
    }
  }, [forceReload]);

  // Listener realtime para mudanças em lances - ÚNICO mecanismo de atualização
  useEffect(() => {
    if (!open || !selecaoId) return;

    console.log("🎧 [REALTIME] Configurando listener para lances da seleção:", selecaoId);
    
    const channel = supabase
      .channel(`analise_doc_lances_${selecaoId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "*", // Escutar TODOS os eventos (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "lances_fornecedores",
          filter: `selecao_id=eq.${selecaoId}`,
        },
        (payload) => {
          console.log("🔔 [REALTIME] Mudança detectada em lances_fornecedores:", {
            event: payload.eventType,
            old: payload.old,
            new: payload.new,
          });
          
          // Recarregar imediatamente sem delay
          console.log("🔄 [REALTIME] Recarregando vencedores agora...");
          loadFornecedoresVencedores();
          loadRecursosInabilitacao();
        }
      )
      .subscribe((status, err) => {
        console.log("📡 [REALTIME] Status da subscription:", status);
        if (err) {
          console.error("❌ [REALTIME] Erro na subscription:", err);
        }
        if (status === 'SUBSCRIBED') {
          console.log("✅ [REALTIME] Canal subscrito com sucesso!");
        }
      });
    
    return () => {
      console.log("🔌 [REALTIME] Removendo canal de lances");
      supabase.removeChannel(channel);
    };
  }, [open, selecaoId]);

  // Listener realtime para mudanças em documentos de fornecedor - auto-refresh ao atualizar cadastro
  useEffect(() => {
    if (!open || !selecaoId) return;

    console.log("🎧 [REALTIME] Configurando listener para documentos_fornecedor");
    
    const docChannel = supabase
      .channel(`analise_doc_documentos_${selecaoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documentos_fornecedor",
        },
        (payload) => {
          console.log("🔔 [REALTIME] Mudança detectada em documentos_fornecedor:", payload.eventType);
          loadFornecedoresVencedores();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(docChannel);
    };
  }, [open, selecaoId]);

  // Buscar segundos colocados quando itens selecionados mudarem na inabilitação parcial
  useEffect(() => {
    const fetchSegundos = async () => {
      if (dialogInabilitar && tipoInabilitacao === 'parcial' && fornecedorParaInabilitar && itensSelecionadosInabilitacao.length > 0) {
        // CORREÇÃO: Filtrar para mostrar segundos apenas dos itens VENCIDOS que foram selecionados
        const itensVencedoresSelecionados = itensSelecionadosInabilitacao.filter(
          item => fornecedorParaInabilitar.fornecedor.itensVencedores.includes(item)
        );
        if (itensVencedoresSelecionados.length > 0) {
          const segundos = await buscarSegundosColocados(itensVencedoresSelecionados, fornecedorParaInabilitar.fornecedor.id);
          setSegundosColocados(segundos);
        } else {
          setSegundosColocados([]);
        }
      }
    };
    fetchSegundos();
  }, [dialogInabilitar, tipoInabilitacao, itensSelecionadosInabilitacao, fornecedorParaInabilitar]);

  const loadFornecedoresVencedores = async () => {
    setLoading(true);
    try {
      const timestamp = Date.now();
      console.log(`🔄 [ANÁLISE DOC] Carregando vencedores - timestamp: ${timestamp}`);
      
      // Buscar dados da seleção e itens para obter quantidades
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("cotacao_relacionada_id, titulo_selecao, numero_selecao, criterios_julgamento, habilitacao_encerrada, data_encerramento_habilitacao")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      // Salvar status de encerramento de habilitação
      setHabilitacaoEncerrada(selecaoData?.habilitacao_encerrada || false);
      setDataEncerramentoHabilitacao(selecaoData?.data_encerramento_habilitacao || null);

      if (selecaoError) throw selecaoError;
      
      // Salvar critério de julgamento
      setCriterioJulgamento(selecaoData?.criterios_julgamento || "global");

      // Salvar cotacao_relacionada_id para uso em outras funções
      const cotacaoId = selecaoData?.cotacao_relacionada_id;
      setCotacaoRelacionadaId(cotacaoId || null);

      // Buscar o número do processo e contrato de gestão através da cotação
      let numeroProcesso = "";
      let contratoGestao = "";
      if (cotacaoId) {
        const { data: cotacaoData } = await supabase
          .from("cotacoes_precos")
          .select("processos_compras (numero_processo_interno, contratos_gestao (nome_contrato))")
          .eq("id", cotacaoId)
          .single();
        
        numeroProcesso = (cotacaoData as any)?.processos_compras?.numero_processo_interno || "";
        contratoGestao = (cotacaoData as any)?.processos_compras?.contratos_gestao?.nome_contrato || "";
      }

      // Salvar info da seleção para uso no PDF e auditoria
      setSelecaoInfo({
        titulo: selecaoData?.titulo_selecao || "",
        numero: selecaoData?.numero_selecao || "",
        numeroProcesso,
        contratoGestao
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

      console.log(`📊 [ANÁLISE DOC] Buscando vencedores DINAMICAMENTE (sem usar indicativo_lance_vencedor)...`);
      console.log(`🎯 [ANÁLISE DOC] Critério de julgamento:`, selecaoData?.criterios_julgamento);
      
      const isDesconto = selecaoData?.criterios_julgamento === 'desconto';
      const isPorLote = selecaoData?.criterios_julgamento === 'por_lote';
      
      // Buscar TODOS os lances com fornecedores
      const { data: todosLancesData, error: todosLancesError } = await supabase
        .from("lances_fornecedores")
        .select(`
          numero_item,
          valor_lance,
          fornecedor_id,
          tipo_lance,
          data_hora_lance,
          fornecedores (
            id,
            razao_social,
            cnpj,
            email
          )
        `)
        .eq("selecao_id", selecaoId);
      
      if (todosLancesError) {
        console.error("❌ [ANÁLISE DOC] Erro ao buscar lances:", todosLancesError);
        throw todosLancesError;
      }
      
      console.log(`🔍 [ANÁLISE DOC] Total de lances encontrados:`, todosLancesData?.length || 0);
      
      // Buscar propostas originais (para itens sem lances)
      const { data: propostasOriginais, error: propostasOriginaisError } = await supabase
        .from("selecao_respostas_itens_fornecedor")
        .select(`
          numero_item,
          quantidade,
          valor_unitario_ofertado,
          valor_total_item,
          desclassificado,
          lote_id,
          selecao_propostas_fornecedor!inner (
            fornecedor_id,
            fornecedores!inner (
              id,
              razao_social,
              cnpj,
              email
            )
          )
        `)
        .eq("selecao_propostas_fornecedor.selecao_id", selecaoId);

      if (propostasOriginaisError) {
        console.error("❌ [ANÁLISE DOC] Erro ao buscar propostas originais:", propostasOriginaisError);
      }
      
      console.log(`🔍 [ANÁLISE DOC] Total de propostas originais encontradas:`, propostasOriginais?.length || 0);
      
      // Buscar estimativas para validar classificação
      let estimativasPorItem = new Map<number | string, number>();
      const estimativaSubtotalPorLote = new Map<number, number>();
      let estimativaTotalGlobal = 0;

      if (cotacaoId) {
        const { data: planilhas } = await supabase
          .from("planilhas_consolidadas")
          .select("estimativas_itens")
          .eq("cotacao_id", cotacaoId)
          .order("data_geracao", { ascending: false })
          .limit(1);

        if (planilhas && planilhas.length > 0 && planilhas[0].estimativas_itens) {
          const estimativas = planilhas[0].estimativas_itens as Record<string, number>;

          // Mapa bruto (compatível com por_item)
          Object.entries(estimativas).forEach(([key, value]) => {
            estimativasPorItem.set(key.includes("_") ? key : parseInt(key, 10), value);
          });

          // Para por_lote e global precisamos de estimativa TOTAL (considerando quantidade)
          const [{ data: itensCotacaoEst }, { data: lotesCotacaoEst }] = await Promise.all([
            supabase
              .from("itens_cotacao")
              .select("numero_item, quantidade, lote_id")
              .eq("cotacao_id", cotacaoId),
            supabase
              .from("lotes_cotacao")
              .select("id, numero_lote")
              .eq("cotacao_id", cotacaoId),
          ]);

          const loteIdToNumero = new Map<string, number>();
          (lotesCotacaoEst || []).forEach((l: any) => loteIdToNumero.set(l.id, l.numero_lote));

          (itensCotacaoEst || []).forEach((item: any) => {
            const quantidade = Number(item.quantidade || 1);
            const numeroItem = Number(item.numero_item);
            const numeroLote = item.lote_id ? loteIdToNumero.get(item.lote_id) : undefined;

            // Planilha pode vir com chave composta "{numero_lote}_{numero_item}" para por_lote
            const chaveComposta = numeroLote ? `${numeroLote}_${numeroItem}` : null;
            const estimativaUnit =
              (chaveComposta ? Number(estimativas[chaveComposta] || 0) : 0) ||
              Number(estimativas[String(numeroItem)] || 0);

            const subtotal = estimativaUnit * quantidade;

            // Global (somatório total)
            estimativaTotalGlobal += subtotal;

            // Por lote (subtotal por lote)
            if (numeroLote !== undefined) {
              estimativaSubtotalPorLote.set(
                numeroLote,
                (estimativaSubtotalPorLote.get(numeroLote) || 0) + subtotal
              );
            }
          });
        }
      }
      
      // Agrupar lances por item/lote
      const lancePorItem = new Map<number, any[]>();
      (todosLancesData || []).forEach((lance: any) => {
        const item = lance.numero_item;
        if (!lancePorItem.has(item)) {
          lancePorItem.set(item, []);
        }
        lancePorItem.get(item)!.push(lance);
      });
      
      // Para critério por_lote: agrupar propostas por lote (somando valor_total_item de todos os itens do lote)
      // Para critério global: agrupar propostas por fornecedor (Item 0 = soma total)
      // Para outros critérios: agrupar por numero_item
      const propostaPorChave = new Map<number, any[]>();
      let loteIdToNumeroGlobal = new Map<string, number>();
      
      if (isPorLote) {
        // Agrupar propostas por numero do lote, somando valor total do lote por fornecedor
        const propostaPorLoteFornecedor = new Map<string, { lote: number; fornecedor: any; fornecedorId: string; valorTotal: number; itensCotados: number }>();
        
        (propostasOriginais || []).forEach((proposta: any) => {
          if (proposta?.desclassificado) return;

          const loteId = proposta.lote_id;
          if (!loteId) return;
          
          const fornecedorId = (proposta.selecao_propostas_fornecedor as any)?.fornecedor_id;
          if (!fornecedorId) return;

          const fornecedor = (proposta.selecao_propostas_fornecedor as any)?.fornecedores;

          // Verificar se tem valor válido (item com valor 0 ou null = não cotado)
          const valorUnitario = Number(proposta.valor_unitario_ofertado) || 0;
          const totalItem =
            Number(proposta.valor_total_item) > 0
              ? Number(proposta.valor_total_item)
              : valorUnitario * Number(proposta.quantidade || 0);

          // Só considerar itens com valores > 0 (efetivamente cotados)
          if (totalItem <= 0 || valorUnitario <= 0) {
            console.log(`⚠️ [ANÁLISE DOC] Lote ${loteId}, item ${proposta.numero_item} ignorado - valor zerado/não cotado`);
            return;
          }
          
          const key = `${loteId}_${fornecedorId}`;
          
          if (!propostaPorLoteFornecedor.has(key)) {
            propostaPorLoteFornecedor.set(key, {
              lote: 0, // Será preenchido depois
              fornecedor,
              fornecedorId,
              valorTotal: 0,
              itensCotados: 0
            });
          }
          propostaPorLoteFornecedor.get(key)!.valorTotal += totalItem;
          propostaPorLoteFornecedor.get(key)!.itensCotados += 1;
        });
        
        // Buscar lotes para mapear lote_id -> numero_lote
        if (cotacaoId) {
          const { data: lotesData } = await supabase
            .from("lotes_cotacao")
            .select("id, numero_lote")
            .eq("cotacao_id", cotacaoId);
          
          loteIdToNumeroGlobal = new Map<string, number>();
          (lotesData || []).forEach((l: any) => loteIdToNumeroGlobal.set(l.id, l.numero_lote));
          
          // Reagrupar por numero_lote
          propostaPorLoteFornecedor.forEach((dados, key) => {
            const [loteId] = key.split('_');
            const numeroLote = loteIdToNumeroGlobal.get(loteId);
            if (numeroLote !== undefined) {
              dados.lote = numeroLote;
              
              // Só adicionar se não houver lances para este lote
              if (!lancePorItem.has(numeroLote)) {
                if (!propostaPorChave.has(numeroLote)) {
                  propostaPorChave.set(numeroLote, []);
                }
                propostaPorChave.get(numeroLote)!.push({
                  numero_item: numeroLote,
                  // No critério por_lote, usamos o total do lote como base de comparação
                  valor_unitario_ofertado: dados.valorTotal,
                  selecao_propostas_fornecedor: {
                    fornecedor_id: dados.fornecedorId,
                    fornecedores: dados.fornecedor
                  }
                });
              }
            }
          });
        }
      } else if (selecaoData?.criterios_julgamento === 'global') {
        // Para global: agrupar por fornecedor, somar todos os itens, usar como Item 0
        const propostaPorFornecedor = new Map<string, { fornecedor: any; fornecedorId: string; valorTotal: number; itensCotados: number }>();
        
        (propostasOriginais || []).forEach((proposta: any) => {
          if (proposta?.desclassificado) return;

          const fornecedorId = (proposta.selecao_propostas_fornecedor as any)?.fornecedor_id;
          if (!fornecedorId) return;

          const fornecedor = (proposta.selecao_propostas_fornecedor as any)?.fornecedores;

          // Verificar se tem valor válido (item com valor 0 ou null = não cotado)
          const valorUnitario = Number(proposta.valor_unitario_ofertado) || 0;
          const totalItem =
            Number(proposta.valor_total_item) > 0
              ? Number(proposta.valor_total_item)
              : valorUnitario * Number(proposta.quantidade || 0);

          // Só considerar itens com valores > 0 (efetivamente cotados)
          if (totalItem <= 0 || valorUnitario <= 0) {
            console.log(`⚠️ [ANÁLISE DOC] Global, item ${proposta.numero_item} ignorado para fornecedor ${fornecedorId} - valor zerado/não cotado`);
            return;
          }
          
          if (!propostaPorFornecedor.has(fornecedorId)) {
            propostaPorFornecedor.set(fornecedorId, {
              fornecedor,
              fornecedorId,
              valorTotal: 0,
              itensCotados: 0
            });
          }
          propostaPorFornecedor.get(fornecedorId)!.valorTotal += totalItem;
          propostaPorFornecedor.get(fornecedorId)!.itensCotados += 1;
        });
        
        // Se não houver lances para Item 0, adicionar propostas
        if (!lancePorItem.has(0)) {
          propostaPorFornecedor.forEach((dados) => {
            if (!propostaPorChave.has(0)) {
              propostaPorChave.set(0, []);
            }
            propostaPorChave.get(0)!.push({
              numero_item: 0,
              // No critério global, usamos o total global como base de comparação
              valor_unitario_ofertado: dados.valorTotal,
              selecao_propostas_fornecedor: {
                fornecedor_id: dados.fornecedorId,
                fornecedores: dados.fornecedor
              }
            });
          });
        }
      } else {
        // Critério por_item: agrupar por numero_item normalmente
        (propostasOriginais || []).forEach((proposta: any) => {
          if (proposta?.desclassificado) return;
          
          // Verificar se tem valor válido (item com valor 0 ou null = não cotado)
          const valorUnitario = Number(proposta.valor_unitario_ofertado) || 0;
          if (valorUnitario <= 0) {
            console.log(`⚠️ [ANÁLISE DOC] Item ${proposta.numero_item} ignorado - valor zerado/não cotado`);
            return;
          }

          const item = proposta.numero_item;
          // Só adicionar se não houver lances para este item
          if (!lancePorItem.has(item)) {
            if (!propostaPorChave.has(item)) {
              propostaPorChave.set(item, []);
            }
            propostaPorChave.get(item)!.push(proposta);
          }
        });
      }
      
      // ====== CARREGAR INABILITAÇÕES ANTES de determinar vencedores (igual ao Controle de Lances) ======
      const { data: inabilitacoesPreLoad } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      const inabilitacoesPreMap = new Map<string, number[]>();
      (inabilitacoesPreLoad || []).forEach((inab: any) => {
        const existing = inabilitacoesPreMap.get(inab.fornecedor_id);
        if (existing) {
          const todosItens = [...new Set([...existing, ...(inab.itens_afetados || [])])];
          inabilitacoesPreMap.set(inab.fornecedor_id, todosItens);
        } else {
          inabilitacoesPreMap.set(inab.fornecedor_id, inab.itens_afetados || []);
        }
      });

      console.log(`🚫 [ANÁLISE DOC] Inabilitações pré-carregadas:`, Array.from(inabilitacoesPreMap.entries()));

      // Helper: verificar se fornecedor está inabilitado para um item/lote (igual ao Controle de Lances)
      const isInabilitadoNoItem = (fornecedorId: string, numeroItem: number): boolean => {
        const itensAfetados = inabilitacoesPreMap.get(fornecedorId);
        if (!itensAfetados) return false; // Não está inabilitado
        if (itensAfetados.length === 0) return true; // Inabilitação geral (sem itens específicos)
        return itensAfetados.includes(numeroItem);
      };

      // Para cada item, ordenar e pegar o vencedor
      const vencedoresData: any[] = [];
      
      console.log(`🎯 [ANÁLISE DOC] Critério é desconto?`, isDesconto, `| isPorLote?`, isPorLote, `| isGlobal?`, selecaoData?.criterios_julgamento === 'global');
      
      // Helper para verificar desclassificação por preço (acima do estimado)
      const isDesclassificadoPorPreco = (num: number, valor: number): boolean => {
        let est = 0;
        if (isPorLote) {
          est = estimativaSubtotalPorLote.get(num) || 0;
        } else if (selecaoData?.criterios_julgamento === 'global' && num === 0) {
          est = estimativaTotalGlobal || 0;
        } else {
          est = (estimativasPorItem.get(num) as number) || 0;
        }
        if (est === 0) return false;
        if (isDesconto) return valor < est;
        const toCents = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100);
        return toCents(valor) > toCents(est);
      };

      // Processar itens com lances
      lancePorItem.forEach((lances, numeroItem) => {
        console.log(`📊 [ANÁLISE DOC] Processando ${isPorLote ? 'lote' : 'item'} ${numeroItem} com ${lances.length} lances`);
        
        // CRÍTICO: Filtrar inabilitados PRIMEIRO (igual ao Controle de Lances)
        const lancesNaoInabilitados = lances.filter(l => !isInabilitadoNoItem(l.fornecedor_id, numeroItem));
        
        // Ordenar: DESCRESCENTE para desconto (maior primeiro), ASCENDENTE para preço (menor primeiro)
        const lancesOrdenados = [...lancesNaoInabilitados].sort((a, b) => {
          if (isDesconto) {
            return b.valor_lance - a.valor_lance;
          } else {
            return a.valor_lance - b.valor_lance;
          }
        });
        
        // Filtrar lances classificados (valor dentro do estimado)
        const lancesClassificados = lancesOrdenados.filter(l => !isDesclassificadoPorPreco(numeroItem, l.valor_lance));
        
        if (lancesClassificados.length > 0) {
          const vencedor = lancesClassificados[0];
          const tipoVencedor = vencedor.tipo_lance === 'negociacao' ? 'NEGOCIAÇÃO' : 'LANCE';
          console.log(`🏆 [ANÁLISE DOC] ${isPorLote ? 'Lote' : 'Item'} ${numeroItem}: Vencedor por ${tipoVencedor} -`, vencedor.fornecedores?.razao_social, `- valor:`, vencedor.valor_lance);
          vencedoresData.push(vencedor);
        } else {
          // FALLBACK: Todos os lances filtrados (inabilitados ou acima do estimado)
          // Buscar vencedor nas propostas originais (igual ao Controle de Lances)
          console.log(`🔍 [ANÁLISE DOC] ${isPorLote ? 'Lote' : 'Item'} ${numeroItem}: Sem lances válidos - buscando FALLBACK em propostas originais...`);
          
          let encontrouFallback = false;
          
          if (isPorLote && propostasOriginais && propostasOriginais.length > 0) {
            // Para por_lote: agrupar propostas do lote por fornecedor, somar totais
            const totalPorFornecedor = new Map<string, { fornecedorId: string; fornecedor: any; valorTotal: number }>();
            
            (propostasOriginais || []).forEach((proposta: any) => {
              if (proposta?.desclassificado) return;
              const loteId = proposta.lote_id;
              if (!loteId) return;
              const numeroLote = loteIdToNumeroGlobal.get(loteId);
              if (numeroLote !== numeroItem) return;
              
              const fornecedorId = (proposta.selecao_propostas_fornecedor as any)?.fornecedor_id;
              if (!fornecedorId) return;
              
              // Filtrar inabilitados
              if (isInabilitadoNoItem(fornecedorId, numeroItem)) return;
              
              const valorUnit = Number(proposta.valor_unitario_ofertado) || 0;
              const totalItem = Number(proposta.valor_total_item) > 0 
                ? Number(proposta.valor_total_item) 
                : valorUnit * Number(proposta.quantidade || 0);
              if (totalItem <= 0 || valorUnit <= 0) return;
              
              const fornecedor = (proposta.selecao_propostas_fornecedor as any)?.fornecedores;
              if (!totalPorFornecedor.has(fornecedorId)) {
                totalPorFornecedor.set(fornecedorId, { fornecedorId, fornecedor, valorTotal: 0 });
              }
              totalPorFornecedor.get(fornecedorId)!.valorTotal += totalItem;
            });
            
            // Filtrar desclassificados por preço e ordenar
            const fornecedoresOrdenados = Array.from(totalPorFornecedor.values())
              .filter(f => !isDesclassificadoPorPreco(numeroItem, f.valorTotal))
              .sort((a, b) => isDesconto ? b.valorTotal - a.valorTotal : a.valorTotal - b.valorTotal);
            
            if (fornecedoresOrdenados.length > 0) {
              const melhor = fornecedoresOrdenados[0];
              console.log(`🏆 [ANÁLISE DOC] Lote ${numeroItem}: Vencedor por PROPOSTA ORIGINAL (fallback) -`, melhor.fornecedor?.razao_social, `- valor:`, melhor.valorTotal);
              vencedoresData.push({
                numero_item: numeroItem,
                valor_lance: melhor.valorTotal,
                fornecedor_id: melhor.fornecedorId,
                tipo_lance: 'proposta_original',
                fornecedores: melhor.fornecedor
              });
              encontrouFallback = true;
            }
          } else if (!isPorLote && propostasOriginais && propostasOriginais.length > 0) {
            // Para por_item/global: buscar propostas do item
            const propostasDoItem = (propostasOriginais || [])
              .filter((p: any) => {
                if (p?.desclassificado) return false;
                if (p.numero_item !== numeroItem) return false;
                const fornecedorId = (p.selecao_propostas_fornecedor as any)?.fornecedor_id;
                if (!fornecedorId) return false;
                if (isInabilitadoNoItem(fornecedorId, numeroItem)) return false;
                const valorUnit = Number(p.valor_unitario_ofertado) || 0;
                if (valorUnit <= 0) return false;
                if (isDesclassificadoPorPreco(numeroItem, valorUnit)) return false;
                return true;
              })
              .sort((a: any, b: any) => {
                const valA = Number(a.valor_unitario_ofertado) || 0;
                const valB = Number(b.valor_unitario_ofertado) || 0;
                return isDesconto ? valB - valA : valA - valB;
              });
            
            if (propostasDoItem.length > 0) {
              const melhor = propostasDoItem[0];
              const fornecedor = (melhor.selecao_propostas_fornecedor as any)?.fornecedores;
              const fornecedorId = (melhor.selecao_propostas_fornecedor as any)?.fornecedor_id;
              console.log(`🏆 [ANÁLISE DOC] Item ${numeroItem}: Vencedor por PROPOSTA ORIGINAL (fallback) -`, fornecedor?.razao_social, `- valor:`, melhor.valor_unitario_ofertado);
              vencedoresData.push({
                numero_item: numeroItem,
                valor_lance: Number(melhor.valor_unitario_ofertado) || 0,
                fornecedor_id: fornecedorId,
                tipo_lance: 'proposta_original',
                fornecedores: fornecedor
              });
              encontrouFallback = true;
            }
          }
          
          if (!encontrouFallback) {
            console.log(`⚠️ [ANÁLISE DOC] ${isPorLote ? 'Lote' : 'Item'} ${numeroItem}: Nenhum lance válido nem proposta classificada - FRACASSADO`);
          }
        }
      });
      
      // Processar itens/lotes SEM lances (mas com propostas classificadas)
      propostaPorChave.forEach((propostas, numeroItem) => {
        console.log(`📊 [ANÁLISE DOC] Processando ${isPorLote ? 'lote' : 'item'} ${numeroItem} SEM LANCES - verificando propostas originais (${propostas.length})`);
        
         // Buscar estimativa
         let estimativa = 0;
         if (isPorLote) {
           // Para por_lote, comparar com o subtotal estimado do lote (considerando quantidade)
           estimativa = estimativaSubtotalPorLote.get(numeroItem) || 0;
         } else if (selecaoData?.criterios_julgamento === 'global' && numeroItem === 0) {
           // Para global, comparar com o total estimado global (considerando quantidade)
           estimativa = estimativaTotalGlobal || 0;
         } else {
           // Para por_item, a estimativa é unitária
           estimativa = (estimativasPorItem.get(numeroItem) as number) || 0;
         }
        
        // Filtrar propostas classificadas (valor <= estimativa ou desconto >= estimativa) E não inabilitadas
        const propostasClassificadas = propostas.filter((p: any) => {
          const valor = Number(p.valor_unitario_ofertado) || 0;
          // Filtrar inabilitados (igual ao Controle de Lances)
          const fornecedorId = (p.selecao_propostas_fornecedor as any)?.fornecedor_id;
          if (fornecedorId && isInabilitadoNoItem(fornecedorId, numeroItem)) return false;
          if (estimativa === 0) return valor > 0; // Se não há estimativa, qualquer valor válido é aceito
          return isDesconto ? valor >= estimativa : valor <= estimativa;
        });
        
        if (propostasClassificadas.length > 0) {
          // Ordenar conforme critério
          const propostasOrdenadas = [...propostasClassificadas].sort((a, b) => {
            const valorA = Number(a.valor_unitario_ofertado) || 0;
            const valorB = Number(b.valor_unitario_ofertado) || 0;
            return isDesconto ? valorB - valorA : valorA - valorB;
          });
          
          const melhorProposta = propostasOrdenadas[0];
          const fornecedor = (melhorProposta.selecao_propostas_fornecedor as any)?.fornecedores;
          const fornecedorId = (melhorProposta.selecao_propostas_fornecedor as any)?.fornecedor_id;
          
          console.log(`🏆 [ANÁLISE DOC] ${isPorLote ? 'Lote' : 'Item'} ${numeroItem}: Vencedor por PROPOSTA ORIGINAL -`, fornecedor?.razao_social, `- valor:`, melhorProposta.valor_unitario_ofertado);
          
          vencedoresData.push({
            numero_item: numeroItem,
            valor_lance: Number(melhorProposta.valor_unitario_ofertado) || 0,
            fornecedor_id: fornecedorId,
            tipo_lance: 'proposta_original',
            fornecedores: fornecedor
          });
        } else {
          console.log(`⚠️ [ANÁLISE DOC] ${isPorLote ? 'Lote' : 'Item'} ${numeroItem}: Nenhuma proposta classificada encontrada`);
        }
      });
      
      console.log(`✅ [ANÁLISE DOC] Vencedores dinâmicos identificados:`, vencedoresData.length);

      // Reutilizar inabilitações já carregadas acima (inabilitacoesPreLoad)
      const inabilitacoesMap = new Map<string, FornecedorInabilitado>();
      (inabilitacoesPreLoad || []).forEach((inab: any) => {
        const existing = inabilitacoesMap.get(inab.fornecedor_id);
        if (existing) {
          const todosItens = [...new Set([...existing.itens_afetados, ...(inab.itens_afetados || [])])];
          const motivos = existing.motivo_inabilitacao !== inab.motivo_inabilitacao 
            ? `${existing.motivo_inabilitacao}; ${inab.motivo_inabilitacao}`
            : existing.motivo_inabilitacao;
          inabilitacoesMap.set(inab.fornecedor_id, {
            ...existing,
            itens_afetados: todosItens,
            motivo_inabilitacao: motivos,
          });
        } else {
          inabilitacoesMap.set(inab.fornecedor_id, {
            id: inab.id,
            fornecedor_id: inab.fornecedor_id,
            itens_afetados: inab.itens_afetados || [],
            motivo_inabilitacao: inab.motivo_inabilitacao,
            data_inabilitacao: inab.data_inabilitacao,
            revertido: inab.revertido,
          });
        }
      });

      console.log("📋 [ANÁLISE DOC] InabilitacoesMap final:", 
        Array.from(inabilitacoesMap.entries()).map(([id, inab]) => ({
          fornecedor_id: id,
          itens_afetados: inab.itens_afetados,
          motivo: inab.motivo_inabilitacao
        })));

      // Como já filtramos inabilitados nos vencedoresData, verificar se ainda há itens residuais
      const itensInabilitadosParaSegundo: number[] = [];
      (vencedoresData || []).forEach((lance: any) => {
        const inab = inabilitacoesMap.get(lance.fornecedor_id);
        if (inab && inab.itens_afetados.includes(lance.numero_item)) {
          itensInabilitadosParaSegundo.push(lance.numero_item);
        }
      });

      // Buscar segundos colocados para itens inabilitados
      const segundosColocadosMap = new Map<number, { fornecedor_id: string; valor_lance: number; fornecedor: any }>();
      
      if (itensInabilitadosParaSegundo.length > 0) {
        // Buscar todos os lances desses itens para encontrar o segundo colocado
        // CRÍTICO: Para desconto, ordenar DESCENDENTE (maior primeiro); para preço, ASCENDENTE (menor primeiro)
        const { data: todosLances } = await supabase
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
          .in("numero_item", itensInabilitadosParaSegundo)
          .order("valor_lance", { ascending: !isDesconto });

        // Para cada item inabilitado, encontrar o segundo colocado (primeiro válido)
        for (const itemNum of itensInabilitadosParaSegundo) {
          // Ordenar lances do item conforme critério: desconto = descendente, preço = ascendente
          const lancesDoItem = (todosLances || [])
            .filter((l: any) => l.numero_item === itemNum)
            .sort((a: any, b: any) => isDesconto ? b.valor_lance - a.valor_lance : a.valor_lance - b.valor_lance);
          
          console.log(`🔍 [ANÁLISE DOC] Item ${itemNum}: ${lancesDoItem.length} lances para segundo colocado (critério: ${isDesconto ? 'desconto' : 'preço'})`);
          
          // Reutilizar isDesclassificadoPorPreco definido acima

          // Encontrar primeiro fornecedor que não está inabilitado E não desclassificado por preço
          let encontrou = false;
          for (const lance of lancesDoItem) {
            const inabFornecedor = inabilitacoesMap.get(lance.fornecedor_id);
            const estaInabilitadoNoItem = inabFornecedor && inabFornecedor.itens_afetados.includes(itemNum);
            
            if (!estaInabilitadoNoItem) {
              // Verificar se o valor está acima do estimado (desclassificado por preço)
              if (isDesclassificadoPorPreco(itemNum, lance.valor_lance)) {
                console.log(`🚫 [ANÁLISE DOC] Segundo colocado ${lance.fornecedores?.razao_social} desclassificado por preço no item ${itemNum} (valor: ${lance.valor_lance})`);
                continue;
              }
              console.log(`✅ [ANÁLISE DOC] Segundo colocado encontrado para item ${itemNum}: ${lance.fornecedores?.razao_social} (valor: ${lance.valor_lance})`);
              segundosColocadosMap.set(itemNum, {
                fornecedor_id: lance.fornecedor_id,
                valor_lance: lance.valor_lance,
                fornecedor: lance.fornecedores
              });
              encontrou = true;
              break;
            }
          }
          
          // FALLBACK: Se não encontrou segundo colocado nos lances, buscar nas propostas originais
          if (!encontrou && propostasOriginais && propostasOriginais.length > 0) {
            console.log(`🔍 [ANÁLISE DOC] Item ${itemNum}: Buscando segundo colocado nas PROPOSTAS ORIGINAIS (fallback)`);
            
            if (isPorLote) {
              // Para por_lote: agrupar propostas por lote+fornecedor, somar totais, encontrar menor
              const totalPorFornecedor = new Map<string, { fornecedorId: string; fornecedor: any; valorTotal: number }>();
              
              (propostasOriginais || []).forEach((proposta: any) => {
                if (proposta?.desclassificado) return;
                const loteId = proposta.lote_id;
                if (!loteId) return;
                const numeroLote = loteIdToNumeroGlobal.get(loteId);
                if (numeroLote !== itemNum) return;
                
                const fornecedorId = (proposta.selecao_propostas_fornecedor as any)?.fornecedor_id;
                if (!fornecedorId) return;
                
                // Verificar se está inabilitado
                const inabFornecedor = inabilitacoesMap.get(fornecedorId);
                if (inabFornecedor && inabFornecedor.itens_afetados.includes(itemNum)) return;
                
                const valorUnit = Number(proposta.valor_unitario_ofertado) || 0;
                const totalItem = Number(proposta.valor_total_item) > 0 
                  ? Number(proposta.valor_total_item) 
                  : valorUnit * Number(proposta.quantidade || 0);
                if (totalItem <= 0 || valorUnit <= 0) return;
                
                // Verificar desclassificação por preço (acima do estimado)
                if (isDesclassificadoPorPreco(itemNum, totalItem)) {
                  console.log(`🚫 [ANÁLISE DOC] Fornecedor ${fornecedorId} desclassificado por preço (proposta) no lote ${itemNum} (valor: ${totalItem})`);
                  return;
                }
                
                const fornecedor = (proposta.selecao_propostas_fornecedor as any)?.fornecedores;
                if (!totalPorFornecedor.has(fornecedorId)) {
                  totalPorFornecedor.set(fornecedorId, { fornecedorId, fornecedor, valorTotal: 0 });
                }
                totalPorFornecedor.get(fornecedorId)!.valorTotal += totalItem;
              });
              
              // Ordenar e pegar o melhor
              const fornecedoresOrdenados = Array.from(totalPorFornecedor.values())
                .sort((a, b) => isDesconto ? b.valorTotal - a.valorTotal : a.valorTotal - b.valorTotal);
              
              if (fornecedoresOrdenados.length > 0) {
                const melhor = fornecedoresOrdenados[0];
                console.log(`✅ [ANÁLISE DOC] Segundo colocado encontrado (via proposta) para lote ${itemNum}: ${melhor.fornecedor?.razao_social} (valor: ${melhor.valorTotal})`);
                segundosColocadosMap.set(itemNum, {
                  fornecedor_id: melhor.fornecedorId,
                  valor_lance: melhor.valorTotal,
                  fornecedor: melhor.fornecedor
                });
              }
            } else {
              // Para por_item ou global: buscar propostas do item específico
              const propostasDoItem = (propostasOriginais || [])
                .filter((p: any) => {
                  if (p?.desclassificado) return false;
                  const pNumero = isPorLote ? 0 : p.numero_item;
                  if (pNumero !== itemNum) return false;
                  const fornecedorId = (p.selecao_propostas_fornecedor as any)?.fornecedor_id;
                  if (!fornecedorId) return false;
                  const inabFornecedor = inabilitacoesMap.get(fornecedorId);
                  if (inabFornecedor && inabFornecedor.itens_afetados.includes(itemNum)) return false;
                  const valorUnit = Number(p.valor_unitario_ofertado) || 0;
                  if (valorUnit <= 0) return false;
                  // Verificar desclassificação por preço
                  if (isDesclassificadoPorPreco(itemNum, valorUnit)) return false;
                  return true;
                })
                .sort((a: any, b: any) => {
                  const valA = Number(a.valor_unitario_ofertado) || 0;
                  const valB = Number(b.valor_unitario_ofertado) || 0;
                  return isDesconto ? valB - valA : valA - valB;
                });
              
              if (propostasDoItem.length > 0) {
                const melhor = propostasDoItem[0];
                const fornecedor = (melhor.selecao_propostas_fornecedor as any)?.fornecedores;
                const fornecedorId = (melhor.selecao_propostas_fornecedor as any)?.fornecedor_id;
                console.log(`✅ [ANÁLISE DOC] Segundo colocado encontrado (via proposta) para item ${itemNum}: ${fornecedor?.razao_social} (valor: ${melhor.valor_unitario_ofertado})`);
                segundosColocadosMap.set(itemNum, {
                  fornecedor_id: fornecedorId,
                  valor_lance: Number(melhor.valor_unitario_ofertado) || 0,
                  fornecedor: fornecedor
                });
              }
            }
          }
        }
      }

      // Criar mapa de itens licitados por fornecedor (TODOS os itens onde deu lance ou proposta)
      const itensLicitadosPorFornecedor = new Map<string, Set<number>>();
      (todosLancesData || []).forEach((lance: any) => {
        const fornId = lance.fornecedor_id;
        if (!itensLicitadosPorFornecedor.has(fornId)) {
          itensLicitadosPorFornecedor.set(fornId, new Set());
        }
        itensLicitadosPorFornecedor.get(fornId)!.add(lance.numero_item);
      });
      
      // Adicionar também itens das propostas originais (apenas se efetivamente cotados com valor > 0)
      (propostasOriginais || []).forEach((proposta: any) => {
        const fornId = (proposta.selecao_propostas_fornecedor as any)?.fornecedor_id;
        if (!fornId) return;
        
        // Verificar se tem valor válido (item com valor 0 ou null = não cotado, não deve entrar em licitados)
        const valorUnitario = Number(proposta.valor_unitario_ofertado) || 0;
        if (valorUnitario <= 0) return;

        if (!itensLicitadosPorFornecedor.has(fornId)) {
          itensLicitadosPorFornecedor.set(fornId, new Set());
        }

        if (isPorLote) {
          const numeroLote = loteIdToNumeroGlobal.get(proposta.lote_id);
          if (numeroLote !== undefined) {
            itensLicitadosPorFornecedor.get(fornId)!.add(numeroLote);
          }
        } else if (selecaoData?.criterios_julgamento === 'global') {
          itensLicitadosPorFornecedor.get(fornId)!.add(0);
        } else {
          itensLicitadosPorFornecedor.get(fornId)!.add(proposta.numero_item);
        }
      });

      // Agrupar por fornecedor
      const fornecedoresMap = new Map<string, FornecedorVencedor>();
      
      // Primeiro, adicionar vencedores originais (excluindo itens inabilitados)
      (vencedoresData || []).forEach((lance: any) => {
        const fornId = lance.fornecedor_id;
        const inab = inabilitacoesMap.get(fornId);
        const itemInabilitado = inab && inab.itens_afetados.includes(lance.numero_item);
        
        // Se item está inabilitado para este fornecedor, não adicionar aqui
        if (itemInabilitado) return;
        
        if (!fornecedoresMap.has(fornId)) {
          fornecedoresMap.set(fornId, {
            id: fornId,
            razao_social: lance.fornecedores?.razao_social || "N/A",
            cnpj: lance.fornecedores?.cnpj || "N/A",
            email: lance.fornecedores?.email || "N/A",
            itensVencedores: [],
            itensLicitados: Array.from(itensLicitadosPorFornecedor.get(fornId) || []).sort((a, b) => a - b),
            valorTotal: 0,
          });
        }
        const forn = fornecedoresMap.get(fornId)!;
        forn.itensVencedores.push(lance.numero_item);
        const quantidade = itensQuantidades[lance.numero_item] || 1;
        // Para desconto, somar os descontos. Para preço, somar os valores monetários
        if (isDesconto) {
          forn.valorTotal += lance.valor_lance; // Somar desconto percentual
        } else if (isPorLote) {
          // Em por_lote, valor_lance já é o subtotal do lote
          forn.valorTotal += lance.valor_lance;
        } else {
          forn.valorTotal += lance.valor_lance * quantidade; // Somar valor monetário total
        }
      });

      // Depois, adicionar itens dos segundos colocados
      segundosColocadosMap.forEach((segundo, itemNum) => {
        const fornId = segundo.fornecedor_id;
        if (!fornecedoresMap.has(fornId)) {
          fornecedoresMap.set(fornId, {
            id: fornId,
            razao_social: segundo.fornecedor?.razao_social || "N/A",
            cnpj: segundo.fornecedor?.cnpj || "N/A",
            email: segundo.fornecedor?.email || "N/A",
            itensVencedores: [],
            itensLicitados: Array.from(itensLicitadosPorFornecedor.get(fornId) || []).sort((a, b) => a - b),
            valorTotal: 0,
          });
        }
        const forn = fornecedoresMap.get(fornId)!;
        if (!forn.itensVencedores.includes(itemNum)) {
          forn.itensVencedores.push(itemNum);
          const quantidade = itensQuantidades[itemNum] || 1;
          // Para desconto, somar os descontos. Para preço, somar os valores monetários
          if (isDesconto) {
            forn.valorTotal += segundo.valor_lance; // Somar desconto percentual
          } else if (isPorLote) {
            // Em por_lote, valor_lance já é o subtotal do lote
            forn.valorTotal += segundo.valor_lance;
          } else {
            forn.valorTotal += segundo.valor_lance * quantidade; // Somar valor monetário total
          }
        }
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

          const inabilitacaoFornecedor = inabilitacoesMap.get(forn.id);
          

          return {
            fornecedor: forn,
            documentosExistentes: docs,
            campos: campos,
            todosDocumentosAprovados: todosAprovados,
            inabilitado: inabilitacaoFornecedor,
          };
        })
      );

      // Separar habilitados e inabilitados
      // Fornecedores que não têm mais itens vencedores vão para inabilitados
      // Fornecedores com inabilitação parcial mas que ainda têm itens vão para habilitados
      const habilitados = fornecedoresComDados.filter(f => {
        // Se não tem itens vencedores, está totalmente inabilitado
        if (f.fornecedor.itensVencedores.length === 0) return false;
        return true; // Tem itens, então está habilitado
      });
      
      // Fornecedores totalmente inabilitados (sem itens restantes)
      // Precisamos buscar fornecedores que tinham itens mas agora estão todos inabilitados
      const inabilitadosFornecedores: FornecedorData[] = [];
      for (const [fornecedorId, inab] of inabilitacoesMap.entries()) {
        // Verificar se este fornecedor não está nos habilitados
        const estaHabilitado = habilitados.some(h => h.fornecedor.id === fornecedorId);
        if (!estaHabilitado) {
          // Buscar dados do fornecedor
          const { data: fornData } = await supabase
            .from("fornecedores")
            .select("id, razao_social, cnpj, email")
            .eq("id", fornecedorId)
            .single();
          
          if (fornData) {
            const [docs, campos] = await Promise.all([
              loadDocumentosFornecedor(fornecedorId),
              loadCamposFornecedor(fornecedorId),
            ]);
            
            inabilitadosFornecedores.push({
              fornecedor: {
                id: fornecedorId,
                razao_social: fornData.razao_social || "N/A",
                cnpj: fornData.cnpj || "N/A",
                email: fornData.email || "N/A",
                itensVencedores: inab.itens_afetados, // Mostrar os itens que foram inabilitados
                itensLicitados: Array.from(itensLicitadosPorFornecedor.get(fornecedorId) || inab.itens_afetados).sort((a, b) => (a as number) - (b as number)),
                valorTotal: 0,
              },
              documentosExistentes: docs,
              campos: campos,
              todosDocumentosAprovados: false,
              inabilitado: inab,
            });
          }
        }
      }

      // Ordenar por menor item vencedor
      habilitados.sort((a, b) => {
        const menorA = Math.min(...(a.fornecedor.itensVencedores.length > 0 ? a.fornecedor.itensVencedores : [0]));
        const menorB = Math.min(...(b.fornecedor.itensVencedores.length > 0 ? b.fornecedor.itensVencedores : [0]));
        return menorA - menorB;
      });

      console.log("🏆 [ANÁLISE DOC] VENCEDORES FINAIS HABILITADOS:", habilitados.map(h => ({
        nome: h.fornecedor.razao_social,
        itens: h.fornecedor.itensVencedores,
        valorTotal: h.fornecedor.valorTotal,
        temInabilitacao: !!h.inabilitado,
        itensInabilitados: h.inabilitado?.itens_afetados || []
      })));
      
      console.log("🚫 [ANÁLISE DOC] FORNECEDORES INABILITADOS:", inabilitadosFornecedores.map(i => ({
        nome: i.fornecedor.razao_social,
        itensAfetados: i.inabilitado?.itens_afetados
      })));

      setFornecedoresData(habilitados);
      setFornecedoresInabilitados(inabilitadosFornecedores);
      
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
      // Carregar recursos
      const { data: recursos, error } = await supabase
        .from("recursos_inabilitacao_selecao")
        .select(`
          *,
          fornecedores:fornecedor_id (razao_social, cnpj),
          fornecedores_inabilitados_selecao:inabilitacao_id (motivo_inabilitacao, itens_afetados)
        `)
        .eq("selecao_id", selecaoId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Criar mapa de recursos por inabilitacao_id
      const recursosMap: Record<string, any> = {};
      (recursos || []).forEach((recurso: any) => {
        recursosMap[recurso.inabilitacao_id] = recurso;
      });
      setRecursosInabilitacao(recursosMap);
      setTodosRecursos(recursos || []);
      
      // Carregar intenções de recurso
      const { data: intencoes, error: intError } = await supabase
        .from("intencoes_recurso_selecao")
        .select(`
          *,
          fornecedores:fornecedor_id (razao_social, cnpj)
        `)
        .eq("selecao_id", selecaoId)
        .order("created_at", { ascending: false });
        
      if (!intError) {
        setIntencoesRecurso(intencoes || []);
      }
    } catch (error) {
      console.error("Erro ao carregar recursos:", error);
    }
  };

  const handleResponderRecurso = async (decisao: 'deferido' | 'indeferido' | 'parcial') => {
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
      const statusRecurso = decisao === 'parcial' ? 'deferido_parcial' : decisao;
      
      const { error } = await supabase
        .from("recursos_inabilitacao_selecao")
        .update({
          status_recurso: statusRecurso,
          resposta_gestor: respostaRecurso,
          data_resposta_gestor: dataRespostaGestor,
          usuario_gestor_id: userData?.user?.id,
          tipo_provimento: decisao === 'parcial' ? 'parcial' : 'total',
          itens_reabilitados: decisao === 'parcial' ? itensReabilitar : []
        })
        .eq("id", recursoParaResponder.id);

      if (error) throw error;

      // Se deferido totalmente, reverter a inabilitação completamente
      if (decisao === 'deferido') {
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
        
        const fecharLoteAoReabilitar = criterioJulgamento === "por_lote";

        // Limpar negociações abertas com segundo colocado para os itens/lotes reabilitados
        // pois o vencedor original foi reabilitado
        if (inabilitacao?.itens_afetados) {
          for (const item of inabilitacao.itens_afetados) {
            await supabase
              .from("itens_abertos_lances")
              .update({
                em_negociacao: false,
                fornecedor_negociacao_id: null,
                negociacao_concluida: true,
                ...(fecharLoteAoReabilitar
                  ? {
                      aberto: false,
                      nao_negociar: true,
                      iniciando_fechamento: false,
                      data_inicio_fechamento: null,
                      segundos_para_fechar: null,
                      data_fechamento: new Date().toISOString(),
                    }
                  : {}),
              })
              .eq("selecao_id", selecaoId)
              .eq("numero_item", item);
          }
        }
      }
      
      // Se deferido parcialmente, atualizar os itens afetados removendo os reabilitados
      if (decisao === 'parcial' && itensReabilitar.length > 0 && inabilitacao) {
        const itensRestantes = (inabilitacao.itens_afetados || []).filter(
          (item: number) => !itensReabilitar.includes(item)
        );
        
        if (itensRestantes.length === 0) {
          // Se não sobrou nenhum item, reverter completamente
          await supabase
            .from("fornecedores_inabilitados_selecao")
            .update({
              revertido: true,
              motivo_reversao: `Recurso deferido parcialmente (todos os itens reabilitados): ${respostaRecurso}`,
              data_reversao: new Date().toISOString(),
              usuario_reverteu_id: userData?.user?.id
            })
            .eq("id", recursoParaResponder.inabilitacao_id);
        } else {
          // Atualizar itens afetados com os que restaram
          await supabase
            .from("fornecedores_inabilitados_selecao")
            .update({
              itens_afetados: itensRestantes,
              motivo_inabilitacao: `${inabilitacao.motivo_inabilitacao} | Parcialmente reabilitado: itens ${itensReabilitar.join(", ")}`
            })
            .eq("id", recursoParaResponder.inabilitacao_id);
        }
        
        // Reabilitar o fornecedor como vencedor nos itens reabilitados
        for (const item of itensReabilitar) {
          await supabase
            .from("lances_fornecedores")
            .update({ indicativo_lance_vencedor: true })
            .eq("selecao_id", selecaoId)
            .eq("fornecedor_id", inabilitacao.fornecedor_id)
            .eq("numero_item", item);
        }
        
        // Limpar negociações abertas com segundo colocado para os itens reabilitados
        for (const item of itensReabilitar) {
          await supabase
            .from("itens_abertos_lances")
            .update({
              em_negociacao: false,
              fornecedor_negociacao_id: null,
              negociacao_concluida: true
            })
            .eq("selecao_id", selecaoId)
            .eq("numero_item", item);
        }
      }

      // Gerar PDF da resposta ao recurso
      let protocoloResposta: string | null = null;
      try {
        const tipoDecisao = decisao === 'deferido' ? 'provimento' : 
                            decisao === 'parcial' ? 'provimento_parcial' : 'negado';
        const pdfResult = await gerarRespostaRecursoPDF(
          tipoDecisao,
          respostaRecurso,
          profileData?.nome_completo || "Gestor",
          profileData?.cpf || "",
          inabilitacao?.fornecedores?.razao_social || "Fornecedor",
          selecaoInfo?.numeroProcesso || ""
        );

        if (pdfResult?.url) {
          protocoloResposta = pdfResult.protocolo || null;
          
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

      // Registrar auditoria - Resposta de Recurso
      const decisaoLabel = decisao === 'deferido' ? 'Provimento Total' : 
                           decisao === 'parcial' ? 'Provimento Parcial' : 'Negado';
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Recurso Seleção',
        entidade_id: recursoParaResponder.id,
        detalhes: {
          tipo: 'Resposta de Recurso',
          fornecedor: inabilitacao?.fornecedores?.razao_social || '',
          cnpj: inabilitacao?.fornecedores?.cnpj || '',
          decisao: decisaoLabel,
          protocolo_resposta: protocoloResposta,
          resposta: respostaRecurso,
          itens_reabilitados: decisao === 'parcial' ? itensReabilitar.join(', ') : '',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
        },
      });

      const mensagem = decisao === 'deferido' ? "deferido" : 
                       decisao === 'parcial' ? "deferido parcialmente" : "indeferido";
      toast.success(`Recurso ${mensagem} com sucesso!`);
      setDialogResponderRecurso(false);
      setRecursoParaResponder(null);
      setRespostaRecurso("");
      setTipoProvimento('total');
      setItensReabilitar([]);
      loadFornecedoresVencedores();
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao responder recurso:", error);
      toast.error("Erro ao responder recurso");
    } finally {
      setGerandoPdfRecurso(false);
    }
  };

  // Handlers para encerrar/reverter habilitação
  const handleEncerrarHabilitacao = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { error } = await supabase
        .from("selecoes_fornecedores")
        .update({
          habilitacao_encerrada: true,
          data_encerramento_habilitacao: new Date().toISOString(),
          usuario_encerrou_habilitacao_id: user.id
        })
        .eq("id", selecaoId);

      if (error) throw error;

      // Registrar auditoria - Encerramento de Habilitação
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Habilitação Seleção',
        entidade_id: selecaoId,
        detalhes: {
          tipo: 'Encerramento de Habilitação',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          numero_selecao: selecaoInfo?.numero || '',
          titulo_selecao: selecaoInfo?.titulo || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
        },
      });

      toast.success("Habilitação encerrada! Fornecedores têm 5 minutos para declarar intenção de recurso.");
      setDialogEncerrarHabilitacao(false);
      setHabilitacaoEncerrada(true);
      setDataEncerramentoHabilitacao(new Date().toISOString());
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao encerrar habilitação:", error);
      toast.error("Erro ao encerrar habilitação");
    }
  };

  const handleReverterEncerramento = async () => {
    try {
      const { error } = await supabase
        .from("selecoes_fornecedores")
        .update({
          habilitacao_encerrada: false,
          data_encerramento_habilitacao: null,
          usuario_encerrou_habilitacao_id: null
        })
        .eq("id", selecaoId);

      if (error) throw error;

      // Registrar auditoria - Reversão de Encerramento de Habilitação
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Habilitação Seleção',
        entidade_id: selecaoId,
        detalhes: {
          tipo: 'Reversão de Encerramento de Habilitação',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          numero_selecao: selecaoInfo?.numero || '',
          titulo_selecao: selecaoInfo?.titulo || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
        },
      });

      toast.success("Encerramento revertido!");
      setDialogReverterEncerramento(false);
      setHabilitacaoEncerrada(false);
      setDataEncerramentoHabilitacao(null);
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao reverter encerramento:", error);
      toast.error("Erro ao reverter encerramento");
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
        selecaoInfo?.numero || "",
        undefined,
        undefined,
        undefined,
        "recurso_v2_"
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
      // Ordem específica dos documentos
      const ordemDocumentos: Record<string, number> = {
        'contrato_social': 1,
        'cartao_cnpj': 2,
        'doc_identificacao_responsavel': 3,
        'inscricao_estadual_municipal': 4,
        'cnd_federal': 5,
        'cnd_tributos_estaduais': 6,
        'cnd_divida_ativa_estadual': 7,
        'cnd_tributos_municipais': 8,
        'cnd_divida_ativa_municipal': 9,
        'crf_fgts': 10,
        'cndt': 11,
        'certificado_gestor': 12,
      };

      // BUSCAR DATA DE ENCERRAMENTO DA HABILITAÇÃO DA SELEÇÃO
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("data_encerramento_habilitacao, cotacao_relacionada_id")
        .eq("id", selecaoId)
        .single();
      
      const dataEncerramento = selecaoData?.data_encerramento_habilitacao 
        ? new Date(selecaoData.data_encerramento_habilitacao) 
        : null;
      
      const cotacaoRelacionada = selecaoData?.cotacao_relacionada_id;
      
      console.log(`📅 Data encerramento habilitação: ${dataEncerramento?.toISOString() || 'não encerrada'}`);

      // BUSCAR DOCUMENTOS ANTIGOS DO FORNECEDOR VINCULADOS A ESTA SELEÇÃO/COTAÇÃO
      let docsAntigosParaUsar: Map<string, any> = new Map();
      
      if (dataEncerramento) {
        const { data: docsAntigos } = await supabase
          .from("documentos_antigos")
          .select("*")
          .eq("fornecedor_id", fornecedorId);
        
        if (docsAntigos && docsAntigos.length > 0) {
          console.log(`📦 Documentos antigos encontrados: ${docsAntigos.length}`);
          
          for (const docAntigo of docsAntigos) {
            // Verificar se está vinculado a esta seleção ou cotação relacionada
            // CRÍTICO: Se está vinculado, usar documento antigo INDEPENDENTE de datas
            // O vínculo indica que aquele documento era o ativo quando o processo foi finalizado
            const vinculados = docAntigo.processos_vinculados || [];
            const vinculadoAoProcesso = vinculados.includes(selecaoId) || 
              (cotacaoRelacionada && vinculados.includes(cotacaoRelacionada));
            
            if (vinculadoAoProcesso) {
              console.log(`  ✅ Usando doc antigo: ${docAntigo.tipo_documento} (vinculado ao processo)`);
              docsAntigosParaUsar.set(docAntigo.tipo_documento, docAntigo);
            }
          }
        }
      }

      // Buscar documentos atuais
      const { data, error } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .order("data_upload", { ascending: false });

      if (error) throw error;
      
      console.log(`✅ Documentos atuais carregados: ${data?.length || 0}`);
      console.log(`📦 Documentos antigos a usar: ${docsAntigosParaUsar.size}`);
      
      // Filtrar apenas o documento mais recente de cada tipo e excluir Relatorio KPMG
      // MAS PRIORIZAR documentos antigos quando aplicável
      const documentosPorTipo = new Map<string, DocumentoExistente>();
      
      // Primeiro, adicionar todos os documentos antigos que devem ser usados
      docsAntigosParaUsar.forEach((docAntigo, tipo) => {
        documentosPorTipo.set(tipo, {
          id: docAntigo.id,
          tipo_documento: tipo,
          nome_arquivo: docAntigo.nome_arquivo,
          url_arquivo: docAntigo.url_arquivo,
          data_emissao: docAntigo.data_emissao,
          data_validade: docAntigo.data_validade,
          em_vigor: true
        } as DocumentoExistente);
      });
      
      // Depois, adicionar documentos atuais apenas para tipos que não têm antigo
      (data || []).forEach((doc: DocumentoExistente) => {
        // Excluir Relatorio KPMG
        if (doc.tipo_documento === 'relatorio_kpmg') {
          return;
        }
        // Só adicionar se não tiver documento antigo para este tipo
        if (!documentosPorTipo.has(doc.tipo_documento)) {
          documentosPorTipo.set(doc.tipo_documento, doc);
        }
      });
      
      // Nomes para exibição
      const nomesMapeados: Record<string, string> = {
        'contrato_social': 'Contrato Social',
        'cartao_cnpj': 'CNPJ',
        'doc_identificacao_responsavel': 'Doc. Identificação Responsável Legal',
        'inscricao_estadual_municipal': 'Inscrição Municipal ou Estadual',
        'cnd_federal': 'CND Federal',
        'cnd_tributos_estaduais': 'CND Tributos Estaduais',
        'cnd_divida_ativa_estadual': 'CND Dívida Ativa Estadual',
        'cnd_tributos_municipais': 'CND Tributos Municipais',
        'cnd_divida_ativa_municipal': 'CND Dívida Ativa Municipal',
        'crf_fgts': 'CRF FGTS',
        'cndt': 'CNDT',
        'certificado_gestor': 'Certificado de Fornecedor',
      };

      // Garantir que todos os tipos obrigatórios apareçam, mesmo ausentes
      const todosOsTipos = Object.keys(ordemDocumentos);
      for (const tipo of todosOsTipos) {
        if (!documentosPorTipo.has(tipo)) {
          // Verificar se existe placeholder com solicitação pendente nos dados carregados
          const docSolicitado = (data || []).find(
            (d: any) => d.tipo_documento === tipo && !d.url_arquivo && d.atualizacao_solicitada
          );
          if (docSolicitado) {
            documentosPorTipo.set(tipo, {
              ...docSolicitado,
              _ausente: true,
              _solicitacaoEnviada: true,
              _tipoOriginal: tipo,
            } as any);
          } else {
            documentosPorTipo.set(tipo, {
              id: `missing_${tipo}`,
              tipo_documento: tipo,
              nome_arquivo: '',
              url_arquivo: '',
              data_emissao: null,
              data_validade: null,
              em_vigor: false,
              _ausente: true,
              _tipoOriginal: tipo,
            } as any);
          }
        }
      }

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
      const isAusente = (documentoParaAtualizar.doc as any)._ausente === true;
      const isFromArchive = (documentoParaAtualizar.doc as any)._fromArchive === true;
      const tipoOriginal = (documentoParaAtualizar.doc as any)._tipoOriginal || documentoParaAtualizar.doc.tipo_documento;

      if (isAusente) {
        // Documento não existe ainda - criar registro placeholder com solicitação
        const { error } = await supabase
          .from("documentos_fornecedor")
          .insert({
            fornecedor_id: documentoParaAtualizar.fornecedorId,
            tipo_documento: tipoOriginal,
            nome_arquivo: "",
            url_arquivo: "",
            em_vigor: false,
            atualizacao_solicitada: true,
            motivo_solicitacao_atualizacao: motivoAtualizacao,
            data_solicitacao_atualizacao: new Date().toISOString(),
          });

        if (error) throw error;
      } else if (isFromArchive) {
        // Documento é arquivado - o ID pertence a documentos_antigos, não documentos_fornecedor
        const { data: docAtual } = await supabase
          .from("documentos_fornecedor")
          .select("id")
          .eq("fornecedor_id", documentoParaAtualizar.fornecedorId)
          .eq("tipo_documento", tipoOriginal)
          .maybeSingle();

        if (docAtual) {
          const { error } = await supabase
            .from("documentos_fornecedor")
            .update({
              atualizacao_solicitada: true,
              motivo_solicitacao_atualizacao: motivoAtualizacao,
              data_solicitacao_atualizacao: new Date().toISOString(),
            })
            .eq("id", docAtual.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("documentos_fornecedor")
            .insert({
              fornecedor_id: documentoParaAtualizar.fornecedorId,
              tipo_documento: tipoOriginal,
              nome_arquivo: "",
              url_arquivo: "",
              em_vigor: false,
              atualizacao_solicitada: true,
              motivo_solicitacao_atualizacao: motivoAtualizacao,
              data_solicitacao_atualizacao: new Date().toISOString(),
            });
          if (error) throw error;
        }
      } else {
        // Documento existe normalmente - fazer update pelo ID
        const { error } = await supabase
          .from("documentos_fornecedor")
          .update({
            atualizacao_solicitada: true,
            motivo_solicitacao_atualizacao: motivoAtualizacao,
            data_solicitacao_atualizacao: new Date().toISOString(),
          })
          .eq("id", documentoParaAtualizar.doc.id);

        if (error) throw error;
      }

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
      // Buscar dados do fornecedor para auditoria
      const { data: fornecedorData } = await supabase
        .from("fornecedores")
        .select("razao_social")
        .eq("id", fornecedorId)
        .single();

      // Buscar maior ordem existente para esta seleção
      const { data: maxOrdemData } = await supabase
        .from("campos_documentos_finalizacao")
        .select("ordem")
        .eq("selecao_id", selecaoId)
        .order("ordem", { ascending: false })
        .limit(1);
      
      const proximaOrdem = (maxOrdemData?.[0]?.ordem ?? 0) + 1;
      
      const dataLimite = datasLimiteDocumentos[fornecedorId];
      
      const { data: campoInserido, error } = await supabase
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
        })
        .select("id")
        .single();

      if (error) throw error;

      // Registrar auditoria - Solicitação de Documento Adicional
      await registrarAuditoria({
        acao: 'criação',
        entidade: 'Documento Adicional Seleção',
        entidade_id: campoInserido?.id,
        detalhes: {
          tipo: 'Solicitação de Documento Adicional',
          nome_documento: novoCampo.nome,
          descricao: novoCampo.descricao || '',
          fornecedor: fornecedorData?.razao_social || '',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
          data_limite: dataLimite || null,
        },
      });

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
      // Buscar dados do campo e fornecedor para auditoria
      const { data: campoData } = await supabase
        .from("campos_documentos_finalizacao")
        .select("nome_campo, fornecedor_id, fornecedores (razao_social)")
        .eq("id", campoId)
        .single();

      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "aprovado",
          data_aprovacao: new Date().toISOString(),
        })
        .eq("id", campoId);

      if (error) throw error;

      // Registrar auditoria - Aprovação de Documento Adicional
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Documento Adicional Seleção',
        entidade_id: campoId,
        detalhes: {
          tipo: 'Aprovação de Documento Adicional',
          nome_documento: campoData?.nome_campo || '',
          fornecedor: (campoData?.fornecedores as any)?.razao_social || '',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
          status: 'aprovado',
        },
      });

      toast.success("Documento aprovado");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao aprovar documento:", error);
      toast.error("Erro ao aprovar documento");
    }
  };

  // Helper para decodificar path completamente (como na edge function)
  const decodePathFully = (path: string): string => {
    let decoded = path;
    try {
      let prev = "";
      while (decoded !== prev) {
        prev = decoded;
        decoded = decodeURIComponent(decoded);
      }
    } catch {
      // Já decodificado ou inválido
    }
    return decoded;
  };

  // Helper para extrair path do storage a partir de URL completa
  const extractStoragePath = (url: string): string => {
    if (!url) return url;
    
    // Remover query strings primeiro (como ?token=...)
    let cleanUrl = url.split('?')[0];
    
    // Decodificar URL completamente
    cleanUrl = decodePathFully(cleanUrl);
    
    // Se for URL completa do Supabase, extrair apenas o path relativo
    if (cleanUrl.includes('processo-anexos/')) {
      const parts = cleanUrl.split('processo-anexos/');
      return parts[parts.length - 1];
    }
    return cleanUrl;
  };

  // Handler para excluir PDF de recurso/resposta
  const handleExcluirPdfRecurso = async () => {
    if (!confirmDeletePdf.recursoId || !confirmDeletePdf.tipo) return;
    
    try {
      // 1. Buscar dados do recurso e fornecedor para auditoria
      const { data: recursoData } = await supabase
        .from("recursos_inabilitacao_selecao")
        .select("url_pdf_recurso, url_pdf_resposta, protocolo_recurso, protocolo_resposta, fornecedores (razao_social)")
        .eq("id", confirmDeletePdf.recursoId)
        .single();
      
      const urlArquivo = confirmDeletePdf.tipo === 'recurso' 
        ? recursoData?.url_pdf_recurso 
        : recursoData?.url_pdf_resposta;
      
      const protocolo = confirmDeletePdf.tipo === 'recurso'
        ? recursoData?.protocolo_recurso
        : recursoData?.protocolo_resposta;
      
      // 2. Deletar arquivo do storage PRIMEIRO
      if (urlArquivo) {
        const storagePath = extractStoragePath(urlArquivo);
        await supabase.storage.from("processo-anexos").remove([storagePath]);
      }
      
      // 3. DEPOIS atualizar o registro no banco
      if (confirmDeletePdf.tipo === 'recurso') {
        await supabase.from("recursos_inabilitacao_selecao").update({ url_pdf_recurso: null, nome_arquivo_recurso: null, protocolo_recurso: null }).eq("id", confirmDeletePdf.recursoId);
      } else {
        await supabase.from("recursos_inabilitacao_selecao").update({ url_pdf_resposta: null, nome_arquivo_resposta: null, protocolo_resposta: null }).eq("id", confirmDeletePdf.recursoId);
      }

      // 4. Registrar auditoria - Exclusão de PDF de Recurso/Resposta
      const tipoDocumento = confirmDeletePdf.tipo === 'recurso' ? 'PDF do Recurso' : 'PDF da Resposta de Recurso';
      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'Recurso Seleção',
        entidade_id: confirmDeletePdf.recursoId,
        detalhes: {
          tipo: `Exclusão de ${tipoDocumento}`,
          fornecedor: (recursoData?.fornecedores as any)?.razao_social || '',
          protocolo: protocolo || '',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
        },
      });

      toast.success("PDF excluído com sucesso");
      loadRecursosInabilitacao();
    } catch (error) {
      console.error("Erro ao excluir PDF:", error);
      toast.error("Erro ao excluir PDF");
    } finally {
      setConfirmDeletePdf({ open: false, recursoId: null, tipo: null });
    }
  };

  // Handler para excluir recurso completamente
  const handleExcluirRecursoCompleto = async () => {
    if (!confirmDeleteRecurso.recursoId) return;
    
    try {
      // 1. Buscar dados do recurso antes de deletar
      const { data: recursoData } = await supabase
        .from("recursos_inabilitacao_selecao")
        .select("url_pdf_recurso, url_pdf_resposta, data_limite_fornecedor, protocolo_recurso, protocolo_resposta, fornecedores (razao_social, cnpj)")
        .eq("id", confirmDeleteRecurso.recursoId)
        .single();
      
      // 2. Deletar arquivos do storage PRIMEIRO
      const filesToDelete: string[] = [];
      if (recursoData?.url_pdf_recurso) {
        const path = extractStoragePath(recursoData.url_pdf_recurso);
        if (path) filesToDelete.push(path);
      }
      if (recursoData?.url_pdf_resposta) {
        const path = extractStoragePath(recursoData.url_pdf_resposta);
        if (path) filesToDelete.push(path);
      }
      
      if (filesToDelete.length > 0) {
        console.log("Deletando arquivos do storage:", filesToDelete);
        const { error: storageError } = await supabase.storage.from("processo-anexos").remove(filesToDelete);
        if (storageError) {
          console.error("Erro ao deletar arquivos do storage:", storageError);
        }
      }
      
      // 3. Resetar o recurso para aguardando_envio, mantendo o prazo original
      // NÃO deletamos o registro nem a intenção - assim o prazo original continua valendo
      const { error } = await supabase
        .from("recursos_inabilitacao_selecao")
        .update({
          url_pdf_recurso: null,
          nome_arquivo_recurso: null,
          protocolo_recurso: null,
          url_pdf_resposta: null,
          nome_arquivo_resposta: null,
          protocolo_resposta: null,
          status_recurso: "aguardando_envio",
          data_envio_recurso: null,
          data_resposta_gestor: null,
          motivo_recurso: "",
          resposta_gestor: null,
          usuario_gestor_id: null,
          tipo_provimento: null,
          itens_reabilitados: null
        })
        .eq("id", confirmDeleteRecurso.recursoId);
      
      if (error) throw error;

      // 4. Registrar auditoria - Exclusão de Recurso Completo
      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'Recurso Seleção',
        entidade_id: confirmDeleteRecurso.recursoId,
        detalhes: {
          tipo: 'Exclusão de Recurso Completo',
          fornecedor: (recursoData?.fornecedores as any)?.razao_social || '',
          cnpj: (recursoData?.fornecedores as any)?.cnpj || '',
          protocolo_recurso: recursoData?.protocolo_recurso || 'Não havia recurso enviado',
          protocolo_resposta: recursoData?.protocolo_resposta || 'Não havia resposta registrada',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
        },
      });
      
      toast.success("Recurso excluído com sucesso. Prazo original mantido.");
      loadRecursosInabilitacao();
    } catch (error) {
      console.error("Erro ao excluir recurso:", error);
      toast.error("Erro ao excluir recurso");
    } finally {
      setConfirmDeleteRecurso({ open: false, recursoId: null });
    }
  };

  const handleRejeitarDocumento = async () => {
    if (!campoParaRejeitar || !motivoRejeicaoDocumento.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }

    try {
      // Buscar dados do campo e fornecedor para auditoria
      const { data: campoData } = await supabase
        .from("campos_documentos_finalizacao")
        .select("nome_campo, fornecedor_id, fornecedores (razao_social)")
        .eq("id", campoParaRejeitar)
        .single();

      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "rejeitado",
          data_aprovacao: null,
          descricao: motivoRejeicaoDocumento,
        })
        .eq("id", campoParaRejeitar);

      if (error) throw error;

      // Registrar auditoria - Rejeição de Documento Adicional
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Documento Adicional Seleção',
        entidade_id: campoParaRejeitar,
        detalhes: {
          tipo: 'Rejeição de Documento Adicional',
          nome_documento: campoData?.nome_campo || '',
          fornecedor: (campoData?.fornecedores as any)?.razao_social || '',
          motivo_rejeicao: motivoRejeicaoDocumento,
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
          status: 'rejeitado',
        },
      });

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
      // Buscar dados do campo antes de atualizar para log
      const { data: campoData } = await supabase
        .from("campos_documentos_finalizacao")
        .select(`
          nome_campo,
          status_solicitacao,
          fornecedor_id,
          fornecedores (razao_social, cnpj)
        `)
        .eq("id", campoId)
        .maybeSingle();
      
      const statusAnterior = campoData?.status_solicitacao;
      
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "em_analise",
          data_aprovacao: null,
          descricao: null,
        })
        .eq("id", campoId);

      if (error) throw error;

      // Registrar auditoria da reversão
      const tipoReversao = statusAnterior === 'aprovado' 
        ? 'Reversão de Aprovação de Documento' 
        : 'Reversão de Rejeição de Documento';
      
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Documento Adicional Seleção',
        entidade_id: selecaoId,
        detalhes: {
          tipo: tipoReversao,
          nome_documento: campoData?.nome_campo || '',
          status_anterior: statusAnterior || '',
          fornecedor: (campoData?.fornecedores as any)?.razao_social || '',
          cnpj: (campoData?.fornecedores as any)?.cnpj || '',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
        },
      });

      toast.success("Decisão revertida");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao reverter decisão:", error);
      toast.error("Erro ao reverter decisão");
    }
  };

  const handleExcluirDocumentoAdicional = async (campoId: string, fornecedorId: string) => {
    try {
      // Buscar dados do campo e documento para log e limpeza
      const { data: campoData } = await supabase
        .from("campos_documentos_finalizacao")
        .select(`
          nome_campo,
          fornecedores (razao_social, cnpj),
          documentos_finalizacao_fornecedor (id, url_arquivo, nome_arquivo)
        `)
        .eq("id", campoId)
        .maybeSingle();

      const documentos = (campoData as any)?.documentos_finalizacao_fornecedor || [];

      // Deletar arquivos do storage primeiro
      for (const doc of documentos) {
        if (doc.url_arquivo) {
          // Extrair path do arquivo
          let storagePath = doc.url_arquivo;
          storagePath = storagePath.split('?')[0];
          storagePath = storagePath.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\//, '');
          
          // Detectar bucket
          let bucket = 'processo-anexos';
          if (storagePath.startsWith('processo-anexos/')) {
            bucket = 'processo-anexos';
            storagePath = storagePath.replace('processo-anexos/', '');
          } else if (storagePath.startsWith('documents/')) {
            bucket = 'documents';
            storagePath = storagePath.replace('documents/', '');
          }
          
          // Decodificar path
          try {
            while (storagePath.includes('%')) {
              const decoded = decodeURIComponent(storagePath);
              if (decoded === storagePath) break;
              storagePath = decoded;
            }
          } catch {}
          
          console.log(`🗑️ Deletando arquivo do storage: ${bucket}/${storagePath}`);
          const { error: storageError } = await supabase.storage
            .from(bucket)
            .remove([storagePath]);
          
          if (storageError) {
            console.error("Erro ao deletar arquivo do storage:", storageError);
          }
        }
        
        // Deletar registro do documento
        await supabase
          .from("documentos_finalizacao_fornecedor")
          .delete()
          .eq("id", doc.id);
      }

      // Deletar o campo de documento adicional
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .delete()
        .eq("id", campoId);

      if (error) throw error;

      // Registrar auditoria
      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'Documento Adicional Seleção',
        entidade_id: selecaoId,
        detalhes: {
          tipo: 'Exclusão de Documento Adicional',
          nome_documento: campoData?.nome_campo || '',
          fornecedor: (campoData?.fornecedores as any)?.razao_social || '',
          cnpj: (campoData?.fornecedores as any)?.cnpj || '',
          arquivo_deletado: documentos[0]?.nome_arquivo || 'Sem arquivo',
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
        },
      });

      toast.success("Documento adicional excluído");
      loadFornecedoresVencedores();
    } catch (error) {
      console.error("Erro ao excluir documento adicional:", error);
      toast.error("Erro ao excluir documento adicional");
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
    
    // Se critério for global, vai direto para inabilitação completa
    // Caso contrário, SEMPRE mostra opções (mesmo com 1 item vencido, pode ter outros licitados)
    if (criterioJulgamento === 'global') {
      // CORREÇÃO: Buscar segundos apenas para itens que o fornecedor GANHOU, não todos que licitou
      const segundos = await buscarSegundosColocados(data.fornecedor.itensVencedores, data.fornecedor.id);
      console.log("Segundos colocados encontrados (apenas itens vencidos):", segundos);
      setDialogInabilitar(true);
    } else {
      // Mostra diálogo de escolha primeiro - fornecedor pode ser segundo colocado em outros itens
      setDialogEscolhaTipoInabilitacao(true);
    }
  };

  const handleConfirmarTipoInabilitacao = async () => {
    if (!fornecedorParaInabilitar) return;
    
    setDialogEscolhaTipoInabilitacao(false);
    
    if (tipoInabilitacao === 'completa') {
      // CORREÇÃO: Buscar segundos colocados apenas para itens que o fornecedor GANHOU
      const segundos = await buscarSegundosColocados(fornecedorParaInabilitar.fornecedor.itensVencedores, fornecedorParaInabilitar.fornecedor.id);
      console.log("Segundos colocados encontrados (apenas itens vencidos):", segundos);
      setDialogInabilitar(true);
    } else {
      // Mostra diálogo de inabilitação com seleção de itens
      // Pré-selecionar todos os itens/lotes que o fornecedor licitou
      setItensSelecionadosInabilitacao([...fornecedorParaInabilitar.fornecedor.itensLicitados]);
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
    setItensSelecionadosInabilitacao([...fornecedorParaInabilitar.fornecedor.itensLicitados]);
  };
  
  const handleDeselecionarTodosItens = () => {
    setItensSelecionadosInabilitacao([]);
  };

  const handleInabilitarFornecedor = async () => {
    const unidadeSingular = criterioJulgamento === 'por_lote' ? 'lote' : 'item';
    const unidadePlural = criterioJulgamento === 'por_lote' ? 'lotes' : 'itens';
    const UnidadePlural = unidadePlural.charAt(0).toUpperCase() + unidadePlural.slice(1);

    if (!fornecedorParaInabilitar || !motivoInabilitacao.trim()) {
      toast.error("Informe o motivo da inabilitação");
      return;
    }
    
    // Se for inabilitação parcial, verificar se há unidades selecionadas
    if (tipoInabilitacao === 'parcial' && itensSelecionadosInabilitacao.length === 0) {
      toast.error(`Selecione pelo menos um ${unidadeSingular} para inabilitar`);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Usar itens selecionados na inabilitação parcial, ou todos os licitados na completa
      const itensAfetados = tipoInabilitacao === 'parcial' 
        ? itensSelecionadosInabilitacao 
        : fornecedorParaInabilitar.fornecedor.itensLicitados;
      const fornecedorInabId = fornecedorParaInabilitar.fornecedor.id;

      // CRÍTICO: Identificar quais itens o fornecedor ERA VENCEDOR (não apenas licitou)
      // Só devemos reabrir negociação para itens onde ele era o vencedor atual
      const itensVencedorAfetados = fornecedorParaInabilitar.fornecedor.itensVencedores.filter(
        i => itensAfetados.includes(i)
      );
      console.log("[INAB] itensAfetados (todos licitados):", itensAfetados);
      console.log("[INAB] itensVencedorAfetados (só onde era vencedor):", itensVencedorAfetados);

      // RECALCULAR segundos colocados APENAS para itens onde era vencedor
      const segundosAtualizados = await buscarSegundosColocados(itensVencedorAfetados, fornecedorInabId);
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

      // CRÍTICO: Definir tempo de negociação e timestamp para iniciar cronômetro
      const TEMPO_NEGOCIACAO = 120;
      const agora = new Date().toISOString();

      if (reabrirParaNegociacao && onReabrirNegociacao) {
        // Reabrir itens APENAS para negociação com o segundo colocado (NÃO reabrir lances)
        // APENAS para itens onde o fornecedor era vencedor E há segundo colocado
        for (const item of itensVencedorAfetados) {
          const segundoColocado = segundosAtualizados.find(s => s.numero_item === item);
          console.log(`[INAB+REABRIR] Item ${item}: segundo colocado = `, segundoColocado);
          
          if (segundoColocado) {
            // Só abre negociação se tem segundo colocado
            await supabase
              .from("itens_abertos_lances")
              .update({
                // CRÍTICO: NÃO reabrir para lances (aberto: false), apenas para negociação
                aberto: false,
                em_negociacao: true,
                nao_negociar: false,
                data_fechamento: null,
                negociacao_concluida: false,
                fornecedor_negociacao_id: segundoColocado.fornecedor_id,
                // CRÍTICO: Iniciar timer de 120s para o cronômetro aparecer
                iniciando_fechamento: true,
                data_inicio_fechamento: agora,
                segundos_para_fechar: TEMPO_NEGOCIACAO,
              })
              .eq("selecao_id", selecaoId)
              .eq("numero_item", item);
          } else {
            // Sem segundo colocado - fechar o item
            await supabase
              .from("itens_abertos_lances")
              .update({
                aberto: false,
                em_negociacao: false,
                nao_negociar: true,
                data_fechamento: agora,
                negociacao_concluida: true,
                fornecedor_negociacao_id: null,
              })
              .eq("selecao_id", selecaoId)
              .eq("numero_item", item);
          }
        }
        
        const itensReabertos = segundosAtualizados.length;
        toast.success(itensReabertos > 0
          ? `Fornecedor inabilitado. ${itensReabertos} ${itensReabertos === 1 ? unidadeSingular + ' reaberto' : unidadePlural + ' reabertos'} para negociação.`
          : `Fornecedor inabilitado. Nenhum ${unidadeSingular} teve segundo colocado para negociar.`);
        // NÃO chamar onReabrirNegociacao aqui pois já fizemos o update com o segundo colocado correto
        // A callback em DetalheSelecao.tsx sobrescreveria com o fornecedor errado
      } else {
        // Processar cada item onde o fornecedor era vencedor
        for (const item of itensVencedorAfetados) {
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
              // CRÍTICO: NÃO reabrir para lances (aberto: false), apenas para negociação
              console.log(`Atualizando item ${item} para fornecedor_negociacao_id = ${segundoColocado.fornecedor_id}`);
              const { error: updateItemError } = await supabase
                .from("itens_abertos_lances")
                .update({
                  fornecedor_negociacao_id: segundoColocado.fornecedor_id,
                  em_negociacao: true,
                  negociacao_concluida: false,
                  aberto: false, // Mantém fechado para lances, apenas negociação
                  data_fechamento: null,
                  // CRÍTICO: Iniciar timer de 120s para o cronômetro aparecer
                  iniciando_fechamento: true,
                  data_inicio_fechamento: agora,
                  segundos_para_fechar: TEMPO_NEGOCIACAO,
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
                  data_fechamento: agora,
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
                data_fechamento: agora,
              })
              .eq("selecao_id", selecaoId)
              .eq("numero_item", item);
          }
        }
        
        const temSegundos = segundosAtualizados.length > 0;
        toast.success(temSegundos 
          ? `Fornecedor inabilitado. Segundos colocados assumem os ${unidadePlural}.`
          : `Fornecedor inabilitado. ${UnidadePlural} sem segundo colocado foram fechados.`);
      }

      // Registrar auditoria - Inabilitação de Fornecedor
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Fornecedor Seleção',
        entidade_id: selecaoId,
        detalhes: {
          tipo: 'Inabilitação de Fornecedor',
          fornecedor: fornecedorParaInabilitar.fornecedor.razao_social,
          cnpj: fornecedorParaInabilitar.fornecedor.cnpj,
          motivo_inabilitacao: motivoInabilitacao,
          tipo_inabilitacao: tipoInabilitacao === 'parcial' ? 'Parcial' : 'Completa',
          itens_afetados: itensAfetados.join(', '),
          numero_processo: selecaoInfo?.numeroProcesso || '',
          contrato_gestao: selecaoInfo?.contratoGestao || '',
          titulo_selecao: selecaoInfo?.titulo || '',
          status: 'inabilitado',
        },
      });

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

      // Reverter TODAS as inabilitações do fornecedor (pode haver múltiplos registros)
      const { error: revertError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .update({
          revertido: true,
          data_reversao: new Date().toISOString(),
          motivo_reversao: motivoReversao || "Reversão solicitada pelo gestor",
          usuario_reverteu_id: user.id,
        })
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", inabilitacaoParaReverter.fornecedor.id)
        .eq("revertido", false);

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

      // Registrar auditoria da reversão de inabilitação
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Fornecedor Seleção',
        entidade_id: selecaoId,
        detalhes: {
          tipo: 'Reversão de Inabilitação',
          fornecedor: inabilitacaoParaReverter.fornecedor.razao_social,
          cnpj: inabilitacaoParaReverter.fornecedor.cnpj,
          motivo_reversao: motivoReversao || "Reversão solicitada pelo gestor",
          itens_reabilitados: inabilitacaoParaReverter.inabilitado.itens_afetados.join(', '),
          numero_processo: selecaoInfo?.numeroProcesso,
          contrato_gestao: selecaoInfo?.contratoGestao,
          titulo_selecao: selecaoInfo?.titulo,
        },
      });

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

  const renderFornecedorCard = (data: FornecedorData, isInabilitado: boolean = false) => {
    // Calcular itens habilitados (excluindo os inabilitados parcialmente)
    const itensInabilitados = data.inabilitado?.itens_afetados || [];
    const itensHabilitados = data.fornecedor.itensVencedores.filter(
      item => !itensInabilitados.includes(item)
    );
    const temInabilitacaoParcial = !isInabilitado && itensInabilitados.length > 0;
    
    console.log(`🎴 [RENDER CARD ${data.fornecedor.razao_social}] isInabilitado=${isInabilitado}, itensInabilitados=${JSON.stringify(itensInabilitados)}, temInabilitacaoParcial=${temInabilitacaoParcial}`);
    
    return (
    <Card key={data.fornecedor.id} className={`border-2 ${isInabilitado ? 'border-destructive/50 bg-destructive/5' : temInabilitacaoParcial ? 'border-orange-300 bg-orange-50' : ''}`}>
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
              {temInabilitacaoParcial && (
                <Badge className="bg-orange-500 hover:bg-orange-600">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  INABILITADO PARCIAL
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              CNPJ: {formatCNPJ(data.fornecedor.cnpj)} | Email: {data.fornecedor.email}
            </p>
            {/* Mostrar itens afetados para inabilitação parcial */}
            {temInabilitacaoParcial && data.inabilitado && (
              <div className="mt-1">
                <p className="text-sm text-orange-700">
                  <span className="font-medium">
                    {criterioJulgamento === 'por_lote' ? 'Lotes inabilitados:' : 'Itens inabilitados:'}
                  </span>{" "}
                  {itensInabilitados.sort((a, b) => a - b).join(", ")}
                </p>
                <p className="text-sm text-orange-700">
                  <span className="font-medium">Motivo:</span> {data.inabilitado.motivo_inabilitacao}
                </p>
              </div>
            )}
            {/* Só mostrar vencedores se não for totalmente inabilitado */}
            {!isInabilitado && (
              <p className="text-sm mt-1">
                <span className="font-medium">
                  {criterioJulgamento === 'por_lote' ? 'Lotes vencedores:' : 'Itens vencedores:'}
                </span>{" "}
                {temInabilitacaoParcial 
                  ? itensHabilitados.sort((a, b) => a - b).join(", ")
                  : data.fornecedor.itensVencedores.sort((a, b) => a - b).join(", ")
                }
              </p>
            )}
            {/* Só mostrar valor total se não for totalmente inabilitado */}
            {!isInabilitado && (
              <p className="text-sm">
                <span className="font-medium">
                  {criterioJulgamento === 'desconto' ? 'Desconto médio:' : 'Valor total:'}
                </span>{" "}
                {criterioJulgamento === 'desconto' 
                  ? `${(data.fornecedor.valorTotal / data.fornecedor.itensVencedores.length).toFixed(2)}%`
                  : formatCurrency(data.fornecedor.valorTotal)
                }
              </p>
            )}
            {/* Mostrar motivo para fornecedores totalmente inabilitados */}
            {isInabilitado && data.inabilitado && (
              <div className="mt-2">
                <p className="text-sm text-destructive">
                  <span className="font-medium">
                    {criterioJulgamento === 'por_lote' ? 'Lotes afetados:' : 'Itens afetados:'}
                  </span>{" "}
                  {data.inabilitado.itens_afetados.sort((a, b) => a - b).join(", ")}
                </p>
                <p className="text-sm text-destructive">
                  <span className="font-medium">Motivo:</span> {data.inabilitado.motivo_inabilitacao}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 items-end">
            {/* Botão de Reverter Inabilitação para parcialmente inabilitados */}
            {temInabilitacaoParcial && (
              <Button
                size="sm"
                variant="outline"
                className="border-orange-500 text-orange-700 hover:bg-orange-100"
                onClick={() => {
                  setInabilitacaoParaReverter(data);
                  setMotivoReversao("");
                  setDialogReverterInabilitacao(true);
                }}
              >
                <Undo2 className="h-4 w-4 mr-1" />
                Reverter Inabilitação
              </Button>
            )}
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

                          // Registrar auditoria da reversão de aprovação
                          await registrarAuditoria({
                            acao: 'atualização',
                            entidade: 'Fornecedor Seleção',
                            entidade_id: selecaoId,
                            detalhes: {
                              tipo: 'Reversão de Aprovação de Fornecedor',
                              fornecedor: data.fornecedor.razao_social,
                              cnpj: data.fornecedor.cnpj,
                              numero_processo: selecaoInfo?.numeroProcesso,
                              contrato_gestao: selecaoInfo?.contratoGestao,
                              titulo_selecao: selecaoInfo?.titulo,
                            },
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

                            // Registrar auditoria - Aprovação de Fornecedor (Habilitação)
                            await registrarAuditoria({
                              acao: 'atualização',
                              entidade: 'Fornecedor Seleção',
                              entidade_id: selecaoId,
                              detalhes: {
                                tipo: 'Aprovação de Fornecedor (Habilitação)',
                                fornecedor: data.fornecedor.razao_social,
                                cnpj: data.fornecedor.cnpj,
                                numero_processo: selecaoInfo?.numeroProcesso || '',
                                contrato_gestao: selecaoInfo?.contratoGestao || '',
                                titulo_selecao: selecaoInfo?.titulo || '',
                                status: 'habilitado',
                              },
                            });
                            
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
      
      {/* Seção de Recurso (visível mesmo após provimento/reversão) */}
      {(() => {
        const recurso =
          (data.inabilitado && recursosInabilitacao[data.inabilitado.id]) ||
          todosRecursos.find((r) => r.fornecedor_id === data.fornecedor.id);

        if (!recurso) return null;

        const inabilitacaoRef = data.inabilitado ?? recurso.fornecedores_inabilitados_selecao;

        return (
          <CardContent className="pt-0 border-t mt-3">
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Gavel className="h-4 w-4" />
                Recurso de Inabilitação
              </h4>

              {!data.inabilitado && (
                <Badge variant="outline">Histórico (inabilitação revertida)</Badge>
              )}

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
                      <span className="text-sm flex-1">
                        {getNomeBonitRecurso(recurso, data.fornecedor)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          recurso.nome_arquivo_recurso?.startsWith("recurso_v2_")
                            ? window.open(recurso.url_pdf_recurso, "_blank")
                            : handleGerarPdfRecurso(recurso, inabilitacaoRef, data.fornecedor)
                        }
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Ver
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={recurso.url_pdf_recurso}
                          download={getNomeBonitRecurso(recurso, data.fornecedor) + ".pdf"}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Baixar
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => {
                          setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: "recurso" });
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Excluir
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
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

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDeleteRecurso({ open: true, recursoId: recurso.id })}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir Tudo
                    </Button>
                  </div>
                </div>
              )}

              {(recurso.status_recurso === "deferido" || recurso.status_recurso === "deferido_parcial") && (
                <div className="bg-green-50 p-3 rounded-lg border border-green-200 space-y-3">
                  <Badge className="bg-green-500">
                    {recurso.status_recurso === "deferido_parcial"
                      ? "Recurso Deferido Parcialmente"
                      : "Recurso Deferido"}
                  </Badge>

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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1"
                          onClick={() =>
                            recurso.nome_arquivo_recurso?.startsWith("recurso_v2_")
                              ? window.open(recurso.url_pdf_recurso, "_blank")
                              : handleGerarPdfRecurso(recurso, inabilitacaoRef, data.fornecedor)
                          }
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1" asChild>
                          <a
                            href={recurso.url_pdf_recurso}
                            download={getNomeBonitRecurso(recurso, data.fornecedor) + ".pdf"}
                          >
                            <Download className="h-3 w-3" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1 text-destructive"
                          onClick={() => {
                            setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: "recurso" });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGerarPdfRecurso(recurso, inabilitacaoRef, data.fornecedor)}
                      >
                        <FileDown className="h-3 w-3 mr-1" />
                        Gerar PDF Recurso
                      </Button>
                    )}
                    {recurso.url_pdf_resposta ? (
                      <div className="flex items-center gap-1 bg-white p-2 rounded border text-xs">
                        <FileText className="h-3 w-3 text-green-600" />
                        <span>Resposta</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1"
                          onClick={() => window.open(recurso.url_pdf_resposta, "_blank")}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1" asChild>
                          <a
                            href={recurso.url_pdf_resposta}
                            download={getNomeBonitRecurso(recurso, data.fornecedor, "resposta") + ".pdf"}
                          >
                            <Download className="h-3 w-3" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1 text-destructive"
                          onClick={() => {
                            setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: "resposta" });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGerarPdfResposta(recurso, data.fornecedor)}
                      >
                        <FileDown className="h-3 w-3 mr-1" />
                        Gerar PDF Resposta
                      </Button>
                    )}
                  </div>

                  {/* Botão para excluir recurso completo */}
                  <div className="flex justify-end mt-2 pt-2 border-t border-green-200">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDeleteRecurso({ open: true, recursoId: recurso.id })}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir Recurso Completo
                    </Button>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1"
                          onClick={() =>
                            recurso.nome_arquivo_recurso?.startsWith("recurso_v2_")
                              ? window.open(recurso.url_pdf_recurso, "_blank")
                              : handleGerarPdfRecurso(recurso, inabilitacaoRef, data.fornecedor)
                          }
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1" asChild>
                          <a
                            href={recurso.url_pdf_recurso}
                            download={getNomeBonitRecurso(recurso, data.fornecedor) + ".pdf"}
                          >
                            <Download className="h-3 w-3" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1 text-destructive"
                          onClick={() => {
                            setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: "recurso" });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGerarPdfRecurso(recurso, inabilitacaoRef, data.fornecedor)}
                      >
                        <FileDown className="h-3 w-3 mr-1" />
                        Gerar PDF Recurso
                      </Button>
                    )}
                    {recurso.url_pdf_resposta ? (
                      <div className="flex items-center gap-1 bg-white p-2 rounded border text-xs">
                        <FileText className="h-3 w-3 text-red-600" />
                        <span>Resposta</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1"
                          onClick={() => window.open(recurso.url_pdf_resposta, "_blank")}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1" asChild>
                          <a
                            href={recurso.url_pdf_resposta}
                            download={getNomeBonitRecurso(recurso, data.fornecedor, "resposta") + ".pdf"}
                          >
                            <Download className="h-3 w-3" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1 text-destructive"
                          onClick={() => {
                            setConfirmDeletePdf({ open: true, recursoId: recurso.id, tipo: "resposta" });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGerarPdfResposta(recurso, data.fornecedor)}
                      >
                        <FileDown className="h-3 w-3 mr-1" />
                        Gerar PDF Resposta
                      </Button>
                    )}
                  </div>

                  {/* Botão para excluir recurso completo */}
                  <div className="flex justify-end mt-2 pt-2 border-t border-red-200">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDeleteRecurso({ open: true, recursoId: recurso.id })}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir Recurso Completo
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        );
      })()}
      {!isInabilitado && (
        <CardContent className="space-y-4">
          {/* Documentos do Cadastro */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documentos do Cadastro
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadFornecedoresVencedores()}
                title="Atualizar documentos do cadastro"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Atualizar
              </Button>
            </div>
            {data.documentosExistentes.every((doc: any) => doc._ausente === true) ? (
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
                    const isAusente = (doc as any)._ausente === true;
                    
                    // Nomes para exibição
                    const nomesMapeados: Record<string, string> = {
                      'contrato_social': 'Contrato Social',
                      'cartao_cnpj': 'CNPJ',
                      'doc_identificacao_responsavel': 'Doc. Identificação Responsável Legal',
                      'inscricao_estadual_municipal': 'Inscrição Municipal ou Estadual',
                      'cnd_federal': 'CND Federal',
                      'cnd_tributos_estaduais': 'CND Tributos Estaduais',
                      'cnd_divida_ativa_estadual': 'CND Dívida Ativa Estadual',
                      'cnd_tributos_municipais': 'CND Tributos Municipais',
                      'cnd_divida_ativa_municipal': 'CND Dívida Ativa Municipal',
                      'crf_fgts': 'CRF FGTS',
                      'cndt': 'CNDT',
                      'certificado_gestor': 'Certificado de Fornecedor',
                    };
                    const nomeExibicao = nomesMapeados[doc.tipo_documento] || doc.tipo_documento;

                    if (isAusente) {
                      return (
                        <TableRow key={doc.id} className="bg-yellow-50/50">
                          <TableCell>{nomeExibicao}</TableCell>
                          <TableCell>N/A</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                              ⚠ Ausente
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDocumentoParaAtualizar({ doc, fornecedorId: data.fornecedor.id });
                                setDialogSolicitarAtualizacao(true);
                              }}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Solicitar Envio
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const statusDoc = getStatusDocumento(doc);
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>{nomeExibicao}</TableCell>
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
                            {!doc.atualizacao_solicitada && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setDocumentoParaAtualizar({ doc, fornecedorId: data.fornecedor.id });
                                  setMotivoAtualizacao("");
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
                        <div className="flex gap-2 items-center flex-wrap">
                          {campo.documentos_finalizacao_fornecedor && campo.documentos_finalizacao_fornecedor.length > 0 ? (
                            <>
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
                            </>
                          ) : null}
                          {/* Botão de excluir documento adicional - sempre disponível */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setConfirmDeleteDocumentoAdicional({
                                open: true,
                                campoId: campo.id!,
                                fornecedorId: data.fornecedor.id,
                                nomeCampo: campo.nome_campo
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Análise Documental - Seleção de Fornecedores
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log("🔄 BOTÃO MANUAL: Recarregando vencedores...");
                loadFornecedoresVencedores();
                loadRecursosInabilitacao();
              }}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
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
                {/* Status de Habilitação Encerrada */}
                {habilitacaoEncerrada && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-semibold">Habilitação Encerrada</span>
                    </div>
                    {dataEncerramentoHabilitacao && (
                      <p className="text-sm text-green-600 mt-1">
                        Encerrada em {format(new Date(dataEncerramentoHabilitacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                    <p className="text-sm text-green-600 mt-1">
                      Fornecedores têm 5 minutos para declarar intenção de recurso.
                    </p>
                  </div>
                )}

                {/* Fornecedores Habilitados */}
                {fornecedoresData.length > 0 && (
                  <div className="space-y-4" key={`habilitados-${forceReload}`}>
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                      <UserCheck className="h-5 w-5" />
                      Fornecedores Habilitados ({fornecedoresData.length})
                    </h3>
                    {fornecedoresData.map((data, index) => (
                      <div key={`${data.fornecedor.id}-${forceReload}-${index}`}>
                        {renderFornecedorCard(data, false)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Fornecedores Inabilitados */}
                {fornecedoresInabilitados.length > 0 && (
                  <div className="space-y-4 mt-8" key={`inabilitados-${forceReload}`}>
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-destructive">
                      <UserX className="h-5 w-5" />
                      Fornecedores Inabilitados ({fornecedoresInabilitados.length})
                    </h3>
                    {fornecedoresInabilitados.map((data, index) => (
                      <div key={`${data.fornecedor.id}-inab-${forceReload}-${index}`}>
                        {renderFornecedorCard(data, true)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Botão Encerrar Habilitação / Reverter */}
                <div className="border-t pt-6 mt-8">
                  {!habilitacaoEncerrada ? (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => setDialogEncerrarHabilitacao(true)}
                    >
                      <CheckCircle className="h-5 w-5 mr-2" />
                      Encerrar Habilitação
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      size="lg"
                      onClick={() => setDialogReverterEncerramento(true)}
                    >
                      <Undo2 className="h-5 w-5 mr-2" />
                      Reverter Encerramento
                    </Button>
                  )}
                </div>

                {/* Seção de Intenções de Recurso */}
                {habilitacaoEncerrada && intencoesRecurso.length > 0 && (
                  <div className="border-t pt-6 mt-6 space-y-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-700">
                      <Handshake className="h-5 w-5" />
                      Intenções de Recurso ({intencoesRecurso.length})
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {intencoesRecurso.map((intencao: any) => (
                        <Card 
                          key={intencao.id} 
                          className={intencao.deseja_recorrer 
                            ? "border-amber-200 bg-amber-50/50" 
                            : "border-green-200 bg-green-50/50"
                          }
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-medium text-sm">{intencao.fornecedores?.razao_social || "Fornecedor"}</p>
                                <p className="text-xs text-muted-foreground">{intencao.fornecedores?.cnpj || ""}</p>
                              </div>
                              <Badge 
                                variant={intencao.deseja_recorrer ? "default" : "outline"}
                                className={intencao.deseja_recorrer 
                                  ? "bg-amber-100 text-amber-700 border-amber-300" 
                                  : "bg-green-100 text-green-700 border-green-300"
                                }
                              >
                                {intencao.deseja_recorrer ? "Deseja Recorrer" : "Não Recorrerá"}
                              </Badge>
                            </div>
                            {intencao.motivo_intencao && (
                              <div className="mt-2 bg-white/50 p-2 rounded text-xs">
                                <span className="font-medium">Motivo:</span>
                                <p className="text-muted-foreground mt-1">{intencao.motivo_intencao}</p>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              Registrado em: {format(new Date(intencao.data_intencao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
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
              <p className="text-sm text-muted-foreground mb-2">
                {criterioJulgamento === 'por_lote' ? 'Lotes vencidos:' : 'Itens vencidos:'}{" "}
                {fornecedorParaInabilitar?.fornecedor.itensVencedores.sort((a, b) => a - b).join(", ") || "Nenhum"}
              </p>
              <p className="text-sm text-muted-foreground">
                {criterioJulgamento === 'por_lote' ? 'Total de lotes licitados:' : 'Total de itens licitados:'}{" "}
                {fornecedorParaInabilitar?.fornecedor.itensLicitados.sort((a, b) => a - b).join(", ")}
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
                  <p className="font-medium">
                    {criterioJulgamento === 'por_lote' ? 'Inabilitar apenas lotes específicos' : 'Inabilitar apenas itens específicos'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {criterioJulgamento === 'por_lote'
                      ? 'Selecione quais lotes o fornecedor será inabilitado'
                      : 'Selecione quais itens o fornecedor será inabilitado'}
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
                    {criterioJulgamento === 'por_lote'
                      ? 'Inabilitar todos os lotes que o fornecedor licitou'
                      : 'Inabilitar todos os itens que o fornecedor licitou'}
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
        <AlertDialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />
              {tipoInabilitacao === 'parcial'
                ? (criterioJulgamento === 'por_lote' ? 'Inabilitar Lotes Específicos' : 'Inabilitar Itens Específicos')
                : 'Inabilitar Fornecedor'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ScrollArea className="max-h-[40vh] pr-4">
              <div className="space-y-4">
                <p>
                  Você está prestes a inabilitar o fornecedor{" "}
                  <strong>{fornecedorParaInabilitar?.fornecedor.razao_social}</strong>
                  {tipoInabilitacao === 'parcial'
                    ? (criterioJulgamento === 'por_lote' ? ' nos lotes selecionados' : ' nos itens selecionados')
                    : ' na análise documental'}.
                </p>
                
                {tipoInabilitacao === 'parcial' ? (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">
                        {criterioJulgamento === 'por_lote' ? 'Selecione os lotes para inabilitar:' : 'Selecione os itens para inabilitar:'}
                      </p>
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
                      {fornecedorParaInabilitar?.fornecedor.itensLicitados.sort((a, b) => a - b).map((item) => {
                        const ehVencedor = fornecedorParaInabilitar?.fornecedor.itensVencedores.includes(item);
                        return (
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
                            <span className="text-sm">
                              {criterioJulgamento === 'por_lote' ? `Lote ${item}` : `Item ${item}`}
                              {ehVencedor && <span className="text-xs text-primary ml-1">(1º)</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {itensSelecionadosInabilitacao.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {criterioJulgamento === 'por_lote'
                          ? `${itensSelecionadosInabilitacao.length} lote(s) selecionado(s)`
                          : `${itensSelecionadosInabilitacao.length} item(ns) selecionado(s)`}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium">
                      {criterioJulgamento === 'por_lote' ? 'Lotes afetados (todos os licitados):' : 'Itens afetados (todos os licitados):'}
                    </p>
                    <p className="text-sm">{fornecedorParaInabilitar?.fornecedor.itensLicitados.sort((a, b) => a - b).join(", ")}</p>
                  </div>
                )}

                {segundosColocados.length > 0 && (
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-2">
                      {criterioJulgamento === 'por_lote'
                        ? 'Segundos colocados que assumirão os lotes:'
                        : 'Segundos colocados que assumirão os itens:'}
                    </p>
                    {segundosColocados.map((seg) => (
                      <p key={seg.numero_item} className="text-sm">
                        {criterioJulgamento === 'por_lote' ? 'Lote' : 'Item'} {seg.numero_item}: <strong>{seg.fornecedor_nome}</strong> - {formatCurrency(seg.valor_lance)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              </ScrollArea>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4 flex-shrink-0">
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
                  {criterioJulgamento === 'por_lote'
                    ? 'Reabrir lotes para negociação após inabilitação'
                    : 'Reabrir itens para negociação após inabilitação'}
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
        <AlertDialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
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
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <ScrollArea className="flex-1 max-h-[50vh] pr-4">
            <div className="space-y-4">
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
          </ScrollArea>
          
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
        <AlertDialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
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
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decisao"
                    checked={tipoProvimento === 'total' && deferirRecurso}
                    onChange={() => { setDeferirRecurso(true); setTipoProvimento('total'); }}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium text-green-700">Deferir (Total)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decisao"
                    checked={tipoProvimento === 'parcial'}
                    onChange={() => { setDeferirRecurso(true); setTipoProvimento('parcial'); }}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium text-yellow-700">Deferir Parcialmente</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decisao"
                    checked={!deferirRecurso && tipoProvimento === 'total'}
                    onChange={() => { setDeferirRecurso(false); setTipoProvimento('total'); }}
                    className="w-4 h-4 text-destructive"
                  />
                  <span className="text-sm font-medium text-red-700">Indeferir (Rejeitar)</span>
                </label>
              </div>
            </div>
            
            {/* Seleção de itens/lotes para provimento parcial */}
            {tipoProvimento === 'parcial' && recursoParaResponder && (
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                <p className="text-sm font-medium text-yellow-800 mb-2">
                  {criterioJulgamento === 'por_lote' 
                    ? 'Selecione os lotes a serem reabilitados:' 
                    : 'Selecione os itens a serem reabilitados:'}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {(recursoParaResponder.fornecedores_inabilitados_selecao?.itens_afetados || []).map((item: number) => (
                    <div 
                      key={item}
                      className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${
                        itensReabilitar.includes(item) 
                          ? 'border-green-500 bg-green-50' 
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => {
                        setItensReabilitar(prev => 
                          prev.includes(item) 
                            ? prev.filter(i => i !== item)
                            : [...prev, item]
                        );
                      }}
                    >
                      <Checkbox
                        checked={itensReabilitar.includes(item)}
                        onCheckedChange={() => {
                          setItensReabilitar(prev => 
                            prev.includes(item) 
                              ? prev.filter(i => i !== item)
                              : [...prev, item]
                          );
                        }}
                      />
                      <span className="text-sm">
                        {criterioJulgamento === 'por_lote' ? `Lote ${item}` : `Item ${item}`}
                      </span>
                    </div>
                  ))}
                </div>
                {itensReabilitar.length > 0 && (
                  <p className="text-xs text-yellow-700 mt-2">
                    {itensReabilitar.length} {criterioJulgamento === 'por_lote' ? 'lote(s) será(ão) reabilitado(s)' : 'item(ns) será(ão) reabilitado(s)'}
                  </p>
                )}
              </div>
            )}
            
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
            
            {deferirRecurso && tipoProvimento === 'total' && (
              <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                <p className="text-sm text-green-700">
                  <strong>Atenção:</strong> Ao deferir o recurso totalmente, a inabilitação será automaticamente revertida e o fornecedor voltará a participar da seleção em {criterioJulgamento === 'por_lote' ? 'todos os lotes' : 'todos os itens'}.
                </p>
              </div>
            )}
            
            {tipoProvimento === 'parcial' && (
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                <p className="text-sm text-yellow-700">
                  <strong>Atenção:</strong> Ao deferir parcialmente, apenas {criterioJulgamento === 'por_lote' ? 'os lotes selecionados serão reabilitados. O fornecedor permanecerá inabilitado nos demais lotes' : 'os itens selecionados serão reabilitados. O fornecedor permanecerá inabilitado nos demais itens'}.
                </p>
              </div>
            )}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gerandoPdfRecurso}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                const decisao = tipoProvimento === 'parcial' ? 'parcial' : 
                               deferirRecurso ? 'deferido' : 'indeferido';
                handleResponderRecurso(decisao);
              }}
              disabled={!respostaRecurso.trim() || gerandoPdfRecurso || (tipoProvimento === 'parcial' && itensReabilitar.length === 0)}
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
                  {tipoProvimento === 'parcial' ? "Deferir Parcialmente" :
                   deferirRecurso ? "Deferir Recurso" : "Indeferir Recurso"}
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

      {/* Dialog de confirmação para excluir recurso completo */}
      <AlertDialog open={confirmDeleteRecurso.open} onOpenChange={(open) => !open && setConfirmDeleteRecurso({ open: false, recursoId: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir Recurso Completo
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este recurso completamente? Isso irá remover o recurso, a resposta e todos os PDFs associados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirRecursoCompleto} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Recurso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para encerrar habilitação */}
      <AlertDialog open={dialogEncerrarHabilitacao} onOpenChange={setDialogEncerrarHabilitacao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-primary">
              <CheckCircle className="h-5 w-5" />
              Encerrar Habilitação
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ao encerrar a habilitação, todos os fornecedores (habilitados e inabilitados) terão 5 minutos para declarar intenção de recurso.
              Após esse período, fornecedores que declararem intenção terão 1 dia útil para enviar o recurso formal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEncerrarHabilitacao}>
              Confirmar Encerramento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para reverter encerramento */}
      <AlertDialog open={dialogReverterEncerramento} onOpenChange={setDialogReverterEncerramento}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5" />
              Reverter Encerramento
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja reverter o encerramento da habilitação? Isso permitirá continuar a análise documental.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReverterEncerramento}>
              Reverter Encerramento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para confirmar exclusão de documento adicional */}
      <AlertDialog 
        open={confirmDeleteDocumentoAdicional.open} 
        onOpenChange={(open) => setConfirmDeleteDocumentoAdicional(prev => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir Documento Adicional
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir o documento adicional "{confirmDeleteDocumentoAdicional.nomeCampo}"? 
              Esta ação também removerá o arquivo enviado e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteDocumentoAdicional.campoId && confirmDeleteDocumentoAdicional.fornecedorId) {
                  handleExcluirDocumentoAdicional(confirmDeleteDocumentoAdicional.campoId, confirmDeleteDocumentoAdicional.fornecedorId);
                }
                setConfirmDeleteDocumentoAdicional({ open: false, campoId: null, fornecedorId: null, nomeCampo: "" });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
