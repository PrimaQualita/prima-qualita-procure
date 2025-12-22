import { useState, useEffect } from "react";
import { format, differenceInDays, startOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ExternalLink, FileText, CheckCircle, AlertCircle, Download, Eye, Send, Mail, Clock, XCircle, RefreshCw, Undo2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { gerarAutorizacaoCompraDireta, gerarAutorizacaoSelecao } from "@/lib/gerarAutorizacaoPDF";
import { gerarRelatorioFinal } from "@/lib/gerarRelatorioFinalPDF";
import { gerarRespostaRecursoPDF } from "@/lib/gerarRespostaRecursoPDF";
import { gerarPlanilhaHabilitacaoPDF } from "@/lib/gerarPlanilhaHabilitacaoPDF";
import { gerarProcessoCompletoPDF } from "@/lib/gerarProcessoCompletoPDF";
import { gerarEncaminhamentoContabilidadePDF, gerarProtocoloContabilidade } from "@/lib/gerarEncaminhamentoContabilidadePDF";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { stripHtml } from "@/lib/htmlUtils";
import { identificarVencedoresPorCriterio, carregarItensVencedoresPorFornecedor } from "@/lib/identificadorVencedores";
import { copiarDocumentosFornecedorParaProcesso } from "@/lib/copiarArquivoStorage";

interface FornecedorVencedor {
  razaoSocial: string;
  cnpj: string;
  itensVencedores: Array<{ numero: number; valor: number; marca?: string; valorUnitario?: number }>;
  valorTotal: number;
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

interface Fornecedor {
  id: string;
  razao_social: string;
  email: string;
}

interface DocumentoExistente {
  id: string;
  tipo_documento: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_emissao: string | null;
  data_validade: string | null;
  em_vigor: boolean;
}

interface FornecedorData {
  fornecedor: Fornecedor;
  documentosExistentes: DocumentoExistente[];
  itensVencedores: any[];
  itensParticipados?: any[]; // Itens que o fornecedor participou (para inabilitados)
  campos: CampoDocumento[];
  todosDocumentosAprovados: boolean;
  rejeitado: boolean;
  motivoRejeicao: string | null;
  respostaId: string;
  itensRejeitados: number[]; // Itens específicos rejeitados (provimento parcial)
}

interface DialogFinalizarProcessoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  onSuccess: () => void;
  canEdit?: boolean;
}

export function DialogFinalizarProcesso({
  open,
  onOpenChange,
  cotacaoId,
  onSuccess,
  canEdit = true,
}: DialogFinalizarProcessoProps) {
  const [loading, setLoading] = useState(false);
  const [fornecedoresData, setFornecedoresData] = useState<FornecedorData[]>([]);
  const [fornecedorExpandido, setFornecedorExpandido] = useState<string | null>(null);
  const [novosCampos, setNovosCampos] = useState<Record<string, {nome: string; descricao: string; obrigatorio: boolean}>>({});
  const [datasLimiteDocumentos, setDatasLimiteDocumentos] = useState<Record<string, string>>({});
  const [documentosAprovados, setDocumentosAprovados] = useState<Record<string, boolean>>({});
  const [autorizacaoDiretaUrl, setAutorizacaoDiretaUrl] = useState<string>("");
  const [autorizacaoDiretaId, setAutorizacaoDiretaId] = useState<string>("");
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);
  const [relatoriosFinais, setRelatoriosFinais] = useState<any[]>([]);
  const [motivoRejeicaoFornecedor, setMotivoRejeicaoFornecedor] = useState<Record<string, string>>({});
  const [dialogRejeicaoOpen, setDialogRejeicaoOpen] = useState(false);
  const [fornecedorParaRejeitar, setFornecedorParaRejeitar] = useState<string | null>(null);
  const [fornecedoresRejeitadosDB, setFornecedoresRejeitadosDB] = useState<any[]>([]);
  const [recursosRecebidos, setRecursosRecebidos] = useState<any[]>([]);
  const [recursoSelecionado, setRecursoSelecionado] = useState<string | null>(null);
  const [dialogRespostaRecursoOpen, setDialogRespostaRecursoOpen] = useState(false);
  const [decisaoRecurso, setDecisaoRecurso] = useState<'provimento' | 'negado' | null>(null);
  const [textoRespostaRecurso, setTextoRespostaRecurso] = useState("");
  const [dialogReversaoOpen, setDialogReversaoOpen] = useState(false);
  const [rejeicaoParaReverter, setRejeicaoParaReverter] = useState<string | null>(null);
  const [motivoReversao, setMotivoReversao] = useState("");
  const [confirmFinalizarOpen, setConfirmFinalizarOpen] = useState(false);
  const [dialogSolicitarAtualizacao, setDialogSolicitarAtualizacao] = useState(false);
  const [documentoParaAtualizar, setDocumentoParaAtualizar] = useState<DocumentoExistente | null>(null);
  const [motivoAtualizacao, setMotivoAtualizacao] = useState("");
  const [confirmDeleteEncaminhamentoOpen, setConfirmDeleteEncaminhamentoOpen] = useState(false);
  const [encaminhamentoParaExcluir, setEncaminhamentoParaExcluir] = useState<any>(null);
  const [confirmDeleteEncContabOpen, setConfirmDeleteEncContabOpen] = useState(false);
  const [encContabParaExcluir, setEncContabParaExcluir] = useState<any>(null);
  const [confirmDeleteAutorizacaoOpen, setConfirmDeleteAutorizacaoOpen] = useState(false);
  const [autorizacaoParaExcluir, setAutorizacaoParaExcluir] = useState<any>(null);
  const [confirmDeleteRelatorioOpen, setConfirmDeleteRelatorioOpen] = useState(false);
  const [relatorioParaExcluir, setRelatorioParaExcluir] = useState<any>(null);
  const [encaminhamentos, setEncaminhamentos] = useState<any[]>([]);
  const [autorizacoes, setAutorizacoes] = useState<any[]>([]);
  const [planilhasHabilitacao, setPlanilhasHabilitacao] = useState<any[]>([]);
  const [confirmDeletePlanilhaHabOpen, setConfirmDeletePlanilhaHabOpen] = useState(false);
  const [planilhaHabParaExcluir, setPlanilhaHabParaExcluir] = useState<any>(null);
  const [foiEnviadoParaSelecao, setFoiEnviadoParaSelecao] = useState(false);
  const [encaminhamentosContabilidade, setEncaminhamentosContabilidade] = useState<any[]>([]);
  
  // Estados para rejeição por item/lote
  const [criterioJulgamento, setCriterioJulgamento] = useState<string>("global");
  const [itensCotacao, setItensCotacao] = useState<any[]>([]);
  const [lotesCotacao, setLotesCotacao] = useState<any[]>([]);
  const [itensParaRejeitar, setItensParaRejeitar] = useState<number[]>([]);
  const [lotesParaRejeitar, setLotesParaRejeitar] = useState<string[]>([]);
  
  // Estados para provimento parcial
  const [tipoProvimento, setTipoProvimento] = useState<'total' | 'parcial'>('total');
  const [itensParaReabilitar, setItensParaReabilitar] = useState<number[]>([]);
  const [rejeicaoDoRecurso, setRejeicaoDoRecurso] = useState<any>(null);
  
  // Estados para confirmação de exclusão de recurso/resposta
  const [confirmDeleteRecursoOpen, setConfirmDeleteRecursoOpen] = useState(false);
  const [recursoParaExcluir, setRecursoParaExcluir] = useState<any>(null);
  const [confirmDeleteRespostaRecursoOpen, setConfirmDeleteRespostaRecursoOpen] = useState(false);
  const [respostaRecursoParaExcluir, setRespostaRecursoParaExcluir] = useState<any>(null);

  useEffect(() => {
    if (open) {
      console.log("📂 Dialog aberto, carregando todos os fornecedores vencedores");
      loadAllFornecedores();
      loadDocumentosAprovados();
      loadEncaminhamentos();
      loadAutorizacoes();
      loadRelatorioFinal();
      loadPlanilhasHabilitacao();
      checkResponsavelLegal();
      loadFornecedoresRejeitados();
      loadRecursos();
      loadItensCotacao();
      loadLotesCotacao();
      loadEncaminhamentosContabilidade();
    }
  }, [open, cotacaoId]);

  const loadEncaminhamentosContabilidade = async () => {
    if (!cotacaoId) return;
    const { data } = await supabase
      .from("encaminhamentos_contabilidade")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: false });
    setEncaminhamentosContabilidade(data || []);
  };

  const gerarEncaminhamentoContabilidade = async () => {
    try {
      setLoading(true);
      const { data: cotacao } = await supabase
        .from("cotacoes_precos")
        .select("processos_compras!inner(numero_processo_interno, objeto_resumido)")
        .eq("id", cotacaoId)
        .single();
      if (!cotacao) throw new Error("Cotação não encontrada");
      
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("nome_completo").eq("id", user?.id).single();
      
      const fornecedoresVencedores = fornecedoresData
        .filter(f => !f.rejeitado && f.itensVencedores.length > 0)
        .map(f => ({ razaoSocial: f.fornecedor.razao_social, cnpj: (f.fornecedor as any).cnpj || "" }));
      
      const protocolo = gerarProtocoloContabilidade();
      const resultado = await gerarEncaminhamentoContabilidadePDF({
        numeroProcesso: cotacao.processos_compras.numero_processo_interno,
        objetoProcesso: cotacao.processos_compras.objeto_resumido,
        fornecedoresVencedores,
        usuarioNome: profile?.nome_completo || "Usuário",
        protocolo
      });
      
      await supabase.from("encaminhamentos_contabilidade").insert({
        cotacao_id: cotacaoId,
        processo_numero: cotacao.processos_compras.numero_processo_interno,
        objeto_processo: cotacao.processos_compras.objeto_resumido,
        fornecedores_vencedores: fornecedoresVencedores,
        protocolo,
        url_arquivo: resultado.url,
        nome_arquivo: resultado.fileName,
        storage_path: resultado.storagePath,
        usuario_gerador_id: user?.id,
        usuario_gerador_nome: profile?.nome_completo || "Usuário"
      });
      
      toast.success("Encaminhamento para Contabilidade gerado!");
      await loadEncaminhamentosContabilidade();
    } catch (error: any) {
      console.error("Erro:", error);
      toast.error("Erro ao gerar encaminhamento");
    } finally {
      setLoading(false);
    }
  };

  const enviarParaContabilidade = async (encaminhamentoId: string) => {
    try {
      await supabase.from("encaminhamentos_contabilidade").update({
        enviado_contabilidade: true,
        data_envio_contabilidade: new Date().toISOString()
      }).eq("id", encaminhamentoId);
      toast.success("Enviado à Contabilidade!");
      await loadEncaminhamentosContabilidade();
    } catch (error) {
      toast.error("Erro ao enviar");
    }
  };

  const deletarEncaminhamentoContabilidade = async () => {
    if (!encContabParaExcluir) return;
    try {
      // 1. Deletar o arquivo do encaminhamento
      let filePath = encContabParaExcluir.storage_path || encContabParaExcluir.url_arquivo;
      if (filePath.includes('https://')) {
        const urlParts = filePath.split('/processo-anexos/');
        filePath = urlParts[1] || filePath;
      }
      await supabase.storage.from('processo-anexos').remove([filePath]);
      
      // 2. Deletar também a resposta da contabilidade se existir
      if (encContabParaExcluir.url_resposta_pdf || encContabParaExcluir.storage_path_resposta) {
        let respostaPath = encContabParaExcluir.storage_path_resposta || encContabParaExcluir.url_resposta_pdf;
        if (respostaPath.includes('https://')) {
          const urlParts = respostaPath.split('/processo-anexos/');
          respostaPath = urlParts[1] || respostaPath;
        }
        await supabase.storage.from('processo-anexos').remove([respostaPath]);
      }
      
      // 3. Deletar o registro do banco
      await supabase.from('encaminhamentos_contabilidade').delete().eq('id', encContabParaExcluir.id);
      toast.success('Encaminhamento excluído');
      setConfirmDeleteEncContabOpen(false);
      setEncContabParaExcluir(null);
      await loadEncaminhamentosContabilidade();
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao excluir');
    }
  };

  const loadItensCotacao = async () => {
    if (!cotacaoId) return;
    const { data } = await supabase
      .from('itens_cotacao')
      .select('numero_item, descricao, lote_id')
      .eq('cotacao_id', cotacaoId)
      .order('numero_item');
    setItensCotacao(data || []);
  };

  const loadLotesCotacao = async () => {
    if (!cotacaoId) return;
    const { data } = await supabase
      .from('lotes_cotacao')
      .select('id, numero_lote, descricao_lote')
      .eq('cotacao_id', cotacaoId)
      .order('numero_lote');
    setLotesCotacao(data || []);
  };

  // Realtime: Atualizar automaticamente quando fornecedores ou documentos mudarem
  useEffect(() => {
    if (!open || !cotacaoId) return;

    console.log('🔴 REALTIME: Configurando listeners para atualização automática');

    const fornecedoresChannel = supabase
      .channel('fornecedores-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fornecedores'
        },
        (payload) => {
          console.log('🔴 REALTIME: Fornecedor alterado:', payload);
          // Recarregar dados quando fornecedor for atualizado (ex: cadastro completo)
          loadAllFornecedores();
        }
      )
      .subscribe();

    const documentosChannel = supabase
      .channel('documentos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos_fornecedor'
        },
        (payload) => {
          console.log('🔴 REALTIME: Documento alterado:', payload);
          // Recarregar dados quando documentos forem adicionados/atualizados
          loadAllFornecedores();
        }
      )
      .subscribe();

    return () => {
      console.log('🔴 REALTIME: Removendo listeners');
      supabase.removeChannel(fornecedoresChannel);
      supabase.removeChannel(documentosChannel);
    };
  }, [open, cotacaoId]);

  const loadFornecedoresRejeitados = async () => {
    if (!cotacaoId) return;

    try {
      const { data, error } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .select(`
          *,
          fornecedores (
            id,
            razao_social,
            cnpj
          )
        `)
        .eq('cotacao_id', cotacaoId)
        .eq('revertido', false);

      if (error) throw error;
      setFornecedoresRejeitadosDB(data || []);
    } catch (error) {
      console.error('Erro ao carregar fornecedores rejeitados:', error);
    }
  };

  const loadRecursos = async () => {
    if (!cotacaoId) return;

    try {
      console.log('🔍 Carregando recursos para cotação:', cotacaoId);
      
      const { data: rejeitados, error: errorRejeitados } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .select('id')
        .eq('cotacao_id', cotacaoId);

      console.log('📋 Rejeições encontradas:', rejeitados);

      if (errorRejeitados) {
        console.error('Erro ao buscar rejeições:', errorRejeitados);
        throw errorRejeitados;
      }

      if (rejeitados && rejeitados.length > 0) {
        const { data, error } = await supabase
          .from('recursos_fornecedor')
          .select(`
            *,
            fornecedores (
              razao_social,
              cnpj
            ),
            respostas_recursos (
              id,
              decisao,
              texto_resposta,
              url_documento,
              nome_arquivo,
              data_resposta,
              tipo_provimento,
              itens_reabilitados,
              protocolo
            )
          `)
          .in('rejeicao_id', rejeitados.map(r => r.id));

        console.log('📄 Recursos encontrados:', data);
        
        if (error) {
          console.error('Erro ao buscar recursos:', error);
          throw error;
        }
        
        setRecursosRecebidos(data || []);
      } else {
        console.log('ℹ️ Nenhuma rejeição encontrada');
        setRecursosRecebidos([]);
      }
    } catch (error) {
      console.error('Erro ao carregar recursos:', error);
    }
  };

  const loadAllFornecedores = async () => {
    setLoading(true);
    try {
      console.log("🔄 [VERSION 2.0] Iniciando carregamento DIRETO de fornecedores (SEM FILTRO) para cotação:", cotacaoId);
      console.log("🔄 Timestamp:", new Date().toISOString());
      
      // CRÍTICO: Buscar cotação com critério de julgamento E documentos_aprovados atualizados E enviado_para_selecao
      const { data: cotacao, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("criterio_julgamento, documentos_aprovados, enviado_para_selecao")
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;

      console.log("📊 Critério de julgamento:", cotacao?.criterio_julgamento);
      console.log("📋 Documentos aprovados RAW do banco:", JSON.stringify(cotacao?.documentos_aprovados));
      console.log("🔄 Foi enviado para seleção:", cotacao?.enviado_para_selecao);
      
      // Atualizar estado do critério de julgamento
      setCriterioJulgamento(cotacao?.criterio_julgamento || "global");
      
      // Atualizar estado
      setFoiEnviadoParaSelecao(cotacao?.enviado_para_selecao || false);
      
      // CRÍTICO: Atualizar o estado com dados frescos do banco - tratar null explicitamente
      const docsAprovadosRaw = cotacao?.documentos_aprovados;
      const documentosAprovadosAtualizados: Record<string, boolean> = 
        docsAprovadosRaw && typeof docsAprovadosRaw === 'object' 
          ? (docsAprovadosRaw as Record<string, boolean>)
          : {};
      
      console.log("📋 Documentos aprovados PROCESSADOS:", JSON.stringify(documentosAprovadosAtualizados));
      setDocumentosAprovados(documentosAprovadosAtualizados);

      // Buscar TODAS as respostas dos fornecedores (SEM FILTRO)
      // CRÍTICO: Não usar filtro da planilha consolidada - ela não determina vencedores
      console.log("🔍 Buscando TODAS as respostas da cotação (sem filtro por planilha)");
      const { data: respostas, error: respostasError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          fornecedor_id,
          valor_total_anual_ofertado,
          rejeitado,
          motivo_rejeicao,
          fornecedores!inner(id, razao_social, cnpj, email)
        `)
        .eq("cotacao_id", cotacaoId);

      if (respostasError) throw respostasError;

      console.log(`📝 Total de respostas no DB: ${respostas?.length || 0}`);
      console.log(`📝 Fornecedores encontrados:`, respostas?.map(r => r.fornecedores.razao_social));

      if (!respostas || respostas.length === 0) {
        console.log("❌ NENHUMA RESPOSTA encontrada!");
        setFornecedoresData([]);
        setLoading(false);
        return;
      }

      // CRÍTICO: Buscar itens de TODAS as respostas em chunks para evitar limite de 1000
      console.log(`📤 Buscando itens para ${respostas.length} respostas`);
      
      // Buscar itens em lotes por fornecedor para garantir que pega todos
      const todosItensArray = [];
      for (const resposta of respostas) {
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
          const { data: itensFornecedor, error: itensError } = await supabase
            .from("respostas_itens_fornecedor")
            .select(`
              id,
              cotacao_resposta_fornecedor_id,
              item_cotacao_id,
              valor_unitario_ofertado,
              percentual_desconto,
              itens_cotacao!inner(numero_item, descricao, lote_id, quantidade, unidade, lotes_cotacao(numero_lote))
            `)
            .eq("cotacao_resposta_fornecedor_id", resposta.id)
            .range(offset, offset + 999);

          if (itensError) {
            console.error(`❌ Erro ao buscar itens do fornecedor ${resposta.fornecedores.razao_social}:`, itensError);
            throw itensError;
          }

          if (itensFornecedor && itensFornecedor.length > 0) {
            todosItensArray.push(...itensFornecedor);
            console.log(`  ✅ ${resposta.fornecedores.razao_social}: ${itensFornecedor.length} itens (offset ${offset})`);
          }

          // Se retornou menos que 1000, não tem mais
          hasMore = itensFornecedor && itensFornecedor.length === 1000;
          offset += 1000;
        }
      }

      const itens = todosItensArray;
      console.log(`📦 TOTAL de itens carregados: ${itens.length}`);
      
      // DIAGNÓSTICO CRÍTICO: Verificar se itens foram carregados
      if (itens.length === 0) {
        console.error(`⚠️ PROBLEMA CRÍTICO: Nenhum item foi carregado!`);
        console.log(`  → respostas.length: ${respostas?.length}`);
        if (respostas && respostas.length > 0) {
          console.log(`  → IDs das respostas:`);
          respostas.forEach(r => console.log(`    - ${r.fornecedores.razao_social}: ${r.id}`));
        }
      } else {
        console.log(`  → Exemplos de itens carregados:`);
        itens.slice(0, 3).forEach(i => {
          console.log(`    - Item ${i.itens_cotacao?.numero_item}: resposta_id=${i.cotacao_resposta_fornecedor_id}`);
        });
      }

      const criterio = cotacao?.criterio_julgamento || "global";
      
      // CRÍTICO: Identificar vencedores baseado em TODAS as respostas
      const fornecedoresVencedores = await identificarVencedoresPorCriterio(criterio, cotacaoId, respostas, itens || []);

      console.log(`🏆 Fornecedores vencedores identificados: ${fornecedoresVencedores.length}`);
      fornecedoresVencedores.forEach(f => {
        console.log(`  - ${f.razao_social}`);
      });

      // Buscar rejeições revertidas
      const { data: rejeicoesRevertidas } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .select('fornecedor_id')
        .eq('cotacao_id', cotacaoId)
        .eq('revertido', true);

      // Buscar rejeições ativas com itens afetados E dados do fornecedor
      const { data: rejeicoesAtivas } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .select(`
          fornecedor_id, 
          itens_afetados,
          fornecedores!inner(id, razao_social, email, cnpj)
        `)
        .eq('cotacao_id', cotacaoId)
        .eq('revertido', false);

      const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);
      
      // Mapear itens rejeitados por fornecedor
      const itensRejeitadosPorFornecedor = new Map<string, number[]>();
      rejeicoesAtivas?.forEach(r => {
        const itensAfetados = (r.itens_afetados as number[] | null) || [];
        itensRejeitadosPorFornecedor.set(r.fornecedor_id, itensAfetados);
      });

      // Função para identificar preço público
      const ehPrecoPublicoLocal = (cnpj: string, email?: string) => {
        if (email && email.includes('precos.publicos')) return true;
        if (!cnpj) return false;
        const primeiroDigito = cnpj.charAt(0);
        return cnpj.split('').every(d => d === primeiroDigito);
      };

      // CRÍTICO: Para habilitação, incluir TAMBÉM fornecedores inabilitados (para mostrar docs e recursos)
      // Mas apenas se não já estiverem na lista de vencedores E não forem preços públicos
      const fornecedoresInabilitados: Fornecedor[] = [];
      rejeicoesAtivas?.forEach(r => {
        const fornecedor = r.fornecedores as any;
        // Verificar se não já é vencedor E não é preço público
        if (fornecedor && 
            !fornecedoresVencedores.some(v => v.id === fornecedor.id) &&
            !ehPrecoPublicoLocal(fornecedor.cnpj, fornecedor.email)) {
          fornecedoresInabilitados.push({
            id: fornecedor.id,
            razao_social: fornecedor.razao_social,
            email: fornecedor.email
          });
        }
      });

      console.log(`🚫 Fornecedores inabilitados identificados: ${fornecedoresInabilitados.length}`);
      fornecedoresInabilitados.forEach(f => {
        console.log(`  - ${f.razao_social}`);
      });

      // Combinar vencedores + inabilitados para exibição na habilitação
      const todosFornecedoresHabilitacao = [...fornecedoresVencedores, ...fornecedoresInabilitados];

      // Carregar dados de cada fornecedor (vencedores + inabilitados)
      const fornecedoresComDados = await Promise.all(
        todosFornecedoresHabilitacao.map(async (forn) => {
          const resposta = respostas.find(r => r.fornecedor_id === forn.id);
          const [docs, itensVenc, campos] = await Promise.all([
            loadDocumentosFornecedor(forn.id),
            carregarItensVencedoresPorFornecedor(forn.id, criterio, cotacaoId, respostas, itens || []),
            loadCamposFornecedor(forn.id)
          ]);

          // Se foi revertido, NÃO está mais rejeitado
          const foiRevertido = fornecedoresRevertidos.has(forn.id);
          // Verificar se está na tabela de rejeições ativas
          const temRejeicaoAtiva = itensRejeitadosPorFornecedor.has(forn.id) || 
            rejeicoesAtivas?.some(r => r.fornecedor_id === forn.id);
          
          // Obter itens rejeitados (para provimento parcial)
          const itensRejeitados = itensRejeitadosPorFornecedor.get(forn.id) || [];
          
          // CRÍTICO: Para critério por_lote, itensRejeitados são NÚMEROS DE LOTES
          // Fornecedor só está TOTALMENTE rejeitado se:
          // 1. Tem rejeição ativa E não foi revertido E
          // 2. A rejeição é TOTAL (itensRejeitados vazio) OU todos os itens/lotes que ganhou estão rejeitados
          let estaRejeitado = false;
          if (temRejeicaoAtiva && !foiRevertido) {
            if (itensRejeitados.length === 0) {
              // Rejeição total - sem itens específicos
              estaRejeitado = true;
            } else if (criterio === 'por_lote') {
              // Para critério por_lote: verificar se TODOS os lotes vencidos estão rejeitados
              // Os itensRejeitados contêm números de LOTES, não de itens
              const lotesVencidos = new Set(itensVenc.map(item => {
                const ic = item.itens_cotacao as any;
                return ic?.lotes_cotacao?.numero_lote || 0;
              }));
              const lotesRejeitados = new Set(itensRejeitados);
              // Só está totalmente rejeitado se todos os lotes vencidos foram rejeitados
              estaRejeitado = Array.from(lotesVencidos).every(lote => lotesRejeitados.has(lote));
            } else {
              // Para outros critérios: verificar se todos os itens vencidos estão rejeitados
              const itensVencidos = new Set(itensVenc.map(item => item.itens_cotacao?.numero_item || 0));
              const itensRejeitadosSet = new Set(itensRejeitados);
              estaRejeitado = Array.from(itensVencidos).every(item => itensRejeitadosSet.has(item));
            }
          }

          // Para fornecedores inabilitados, buscar os itens que eles participaram (não venceram)
          // para saber em qual lote foram inabilitados
          let itensParticipados: any[] = [];
          if (itensVenc.length === 0 && (temRejeicaoAtiva && !foiRevertido)) {
            // Buscar itens que este fornecedor cotou
            itensParticipados = itens.filter(i => {
              const respostaItem = respostas.find(r => r.id === i.cotacao_resposta_fornecedor_id);
              return respostaItem?.fornecedor_id === forn.id;
            });
          }

          console.log(`📋 Fornecedor ${forn.razao_social}:`, {
            rejeitadoDB: resposta?.rejeitado || false,
            temRejeicaoAtiva,
            foiRevertido,
            estaRejeitado,
            itensVencedores: itensVenc.length,
            itensParticipados: itensParticipados.length,
            numeros: itensVenc.map(i => i.itens_cotacao?.numero_item),
            primeiroItemCompleto: itensVenc[0] || null,
            itensRejeitados
          });

          // CRÍTICO: Usar dados FRESCOS do banco, não do estado React
          const todosAprovados = verificarTodosDocumentosAprovadosComDados(forn.id, docs, campos, documentosAprovadosAtualizados);

          return {
            fornecedor: forn,
            documentosExistentes: docs,
            itensVencedores: itensVenc,
            itensParticipados, // Itens que o fornecedor participou (para inabilitados)
            campos: campos,
            todosDocumentosAprovados: todosAprovados,
            rejeitado: estaRejeitado,
            motivoRejeicao: estaRejeitado ? (resposta?.motivo_rejeicao || null) : null,
            respostaId: resposta?.id || "",
            itensRejeitados
          };
        })
      );

      // Ordenar fornecedores conforme critério de julgamento
      const fornecedoresOrdenados = fornecedoresComDados.sort((a, b) => {
        if (criterioJulgamento === 'por_lote') {
          // Para critério por_lote: ordenar por número do lote, e dentro do lote: por classificação (menor valor primeiro)
          const getLotesNumeros = (fornecedorData: any) => {
            const lotesIds = new Set<string>();
            
            // Lotes dos itens vencedores
            fornecedorData.itensVencedores?.forEach((item: any) => {
              const loteId = item.itens_cotacao?.lote_id;
              if (loteId) lotesIds.add(loteId);
            });
            
            // Também considerar lotes dos itens participados (para inabilitados)
            fornecedorData.itensParticipados?.forEach((item: any) => {
              const loteId = item.itens_cotacao?.lote_id;
              if (loteId) lotesIds.add(loteId);
            });
            
            // Também considerar lotes dos itens rejeitados
            fornecedorData.itensRejeitados?.forEach((numItem: number) => {
              const itemCotacao = itensCotacao.find(ic => ic.numero_item === numItem);
              if (itemCotacao?.lote_id) lotesIds.add(itemCotacao.lote_id);
            });
            
            return Array.from(lotesIds)
              .map(loteId => {
                const lote = lotesCotacao.find(l => l.id === loteId);
                return lote?.numero_lote || 999;
              })
              .filter(n => n > 0);
          };
          
          // Calcular valor total da proposta do fornecedor para ordenação por classificação
          const calcularValorTotalProposta = (fornecedorData: any) => {
            const itensParaCalculo = fornecedorData.itensVencedores?.length > 0 
              ? fornecedorData.itensVencedores 
              : fornecedorData.itensParticipados || [];
            
            return itensParaCalculo.reduce((total: number, item: any) => {
              const valorUnitario = Number(item.valor_unitario_ofertado || 0);
              const quantidade = Number(item.itens_cotacao?.quantidade || 0);
              return total + (valorUnitario * quantidade);
            }, 0);
          };
          
          const lotesA = getLotesNumeros(a);
          const lotesB = getLotesNumeros(b);
          const menorLoteA = lotesA.length > 0 ? Math.min(...lotesA) : 999;
          const menorLoteB = lotesB.length > 0 ? Math.min(...lotesB) : 999;
          
          // Primeiro critério: número do lote
          if (menorLoteA !== menorLoteB) {
            return menorLoteA - menorLoteB;
          }
          
          // Segundo critério dentro do mesmo lote: por classificação (menor valor = primeiro colocado)
          // O primeiro colocado vem primeiro, mesmo que inabilitado
          const valorA = calcularValorTotalProposta(a);
          const valorB = calcularValorTotalProposta(b);
          return valorA - valorB;
        } else if (criterioJulgamento === 'global') {
          // Ordenar pelo menor valor total (global) - fornecedor com menor valor primeiro
          const calcularValorTotal = (itensVenc: any[]) => {
            return itensVenc.reduce((total, item) => {
              const valorUnitario = Number(item.valor_unitario_ofertado || 0);
              const quantidade = Number(item.itens_cotacao?.quantidade || 0);
              return total + (valorUnitario * quantidade);
            }, 0);
          };
          const valorTotalA = calcularValorTotal(a.itensVencedores);
          const valorTotalB = calcularValorTotal(b.itensVencedores);
          return valorTotalA - valorTotalB;
        } else {
          // Para critérios por_item, desconto, etc: ordenar pelo menor número de ITEM
          const menorItemA = Math.min(...a.itensVencedores.map(item => item.itens_cotacao.numero_item));
          const menorItemB = Math.min(...b.itensVencedores.map(item => item.itens_cotacao.numero_item));
          return menorItemA - menorItemB;
        }
      });

      console.log("✅ Carregamento de fornecedores concluído");
      console.log('📊 Ordem final dos fornecedores:', fornecedoresOrdenados.map(f => ({
        nome: f.fornecedor.razao_social,
        menorItem: Math.min(...f.itensVencedores.map(item => item.itens_cotacao.numero_item)),
        itens: f.itensVencedores.map(item => item.itens_cotacao.numero_item)
      })));
      
      console.log(`🔵 SETANDO fornecedoresData com ${fornecedoresOrdenados.length} fornecedores`);
      setFornecedoresData(fornecedoresOrdenados);
      
      // Aguardar um momento para garantir que o estado foi atualizado
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error("❌ Erro ao carregar fornecedores:", error);
      toast.error("Erro ao carregar fornecedores vencedores");
      setFornecedoresData([]);
    } finally {
      setLoading(false);
      console.log(`🔵 Loading finalizado. FornecedoresData.length: ${fornecedoresData.length}`);
    }
  };

  const identificarVencedores = async (criterio: string, respostas: any[], itens: any[]): Promise<Fornecedor[]> => {
    console.log(`🏆 [identificarVencedores] Iniciando identificação com critério: ${criterio}`);
    console.log(`  → Total de respostas: ${respostas.length}`);
    console.log(`  → Total de itens: ${itens.length}`);
    
    const fornecedoresVencedores = new Set<string>();
    const fornecedoresRejeitados = new Set<string>();

    // CRÍTICO: Buscar rejeições ativas da tabela fornecedores_rejeitados_cotacao
    const { data: rejeicoesAtivas } = await supabase
      .from('fornecedores_rejeitados_cotacao')
      .select('fornecedor_id, itens_afetados')
      .eq('cotacao_id', cotacaoId)
      .eq('revertido', false);
    
    // Buscar rejeições revertidas
    const { data: rejeicoesRevertidas } = await supabase
      .from('fornecedores_rejeitados_cotacao')
      .select('fornecedor_id')
      .eq('cotacao_id', cotacaoId)
      .eq('revertido', true);

    const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);

    // Mapear fornecedores rejeitados globalmente (sem itens específicos ou da tabela de rejeições)
    const fornecedoresRejeitadosGlobal = new Set<string>();
    rejeicoesAtivas?.forEach(r => {
      const itensAfetados = r.itens_afetados as number[] | null;
      if (!itensAfetados || itensAfetados.length === 0) {
        // Rejeição global (todos os itens)
        fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
      }
    });
    
    console.log(`  → Fornecedores rejeitados globalmente (tabela): ${fornecedoresRejeitadosGlobal.size}`);

    // Identificar fornecedores rejeitados da flag + tabela (excluindo os que foram revertidos)
    respostas.forEach(r => {
      if (r.rejeitado && !fornecedoresRevertidos.has(r.fornecedor_id)) {
        fornecedoresRejeitados.add(r.fornecedor_id);
      }
    });
    
    // Combinar rejeições: da flag da resposta E da tabela de rejeições
    fornecedoresRejeitadosGlobal.forEach(id => fornecedoresRejeitados.add(id));

    // Filtrar respostas não rejeitadas (NÃO está na flag rejeitado E NÃO está na tabela de rejeições globais)
    const respostasValidas = respostas.filter(r => {
      // Se foi revertido, é válido
      if (fornecedoresRevertidos.has(r.fornecedor_id)) return true;
      // Se está rejeitado pela flag ou pela tabela, não é válido
      if (r.rejeitado || fornecedoresRejeitadosGlobal.has(r.fornecedor_id)) return false;
      return true;
    });
    console.log(`  → Respostas válidas (não rejeitadas): ${respostasValidas.length}`);

    if (criterio === "global") {
      // MENOR VALOR GLOBAL: Vencedor único com menor valor total geral
      console.log(`  📊 Aplicando critério GLOBAL`);
      if (respostasValidas.length > 0) {
        const menorValor = Math.min(...respostasValidas.map(r => Number(r.valor_total_anual_ofertado)));
        const vencedor = respostasValidas.find(r => Math.abs(Number(r.valor_total_anual_ofertado) - menorValor) < 0.01);
        if (vencedor) {
          console.log(`  ✅ Vencedor global: ${vencedor.fornecedores?.razao_social} com R$ ${menorValor.toFixed(2)}`);
          fornecedoresVencedores.add(vencedor.fornecedor_id);
        }
      }
    } else if (criterio === "item" || criterio === "por_item") {
      // MENOR VALOR POR ITEM: Vencedor por item, podendo ter vários vencedores
      console.log(`  📊 Aplicando critério POR ITEM`);
      if (itens.length > 0) {
        const itensPorNumero: Record<number, any[]> = {};
        
        // Agrupar itens por número
        itens.forEach(item => {
          const resposta = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
          // Incluir se não foi rejeitado OU se foi rejeitado mas revertido
          if (!resposta?.rejeitado || fornecedoresRevertidos.has(resposta.fornecedor_id)) {
            const numItem = item.itens_cotacao.numero_item;
            if (!itensPorNumero[numItem]) itensPorNumero[numItem] = [];
            itensPorNumero[numItem].push(item);
          }
        });

        // Para cada item, encontrar o menor valor
        Object.entries(itensPorNumero).forEach(([numItem, itensDoNumero]) => {
          if (itensDoNumero.length > 0) {
            const menorValor = Math.min(...itensDoNumero.map(i => Number(i.valor_unitario_ofertado)));
            const vencedores = itensDoNumero.filter(i => Math.abs(Number(i.valor_unitario_ofertado) - menorValor) < 0.01);
            
            console.log(`    Item ${numItem}: Menor valor R$ ${menorValor.toFixed(2)}`);
            
            vencedores.forEach(vencedor => {
              const resposta = respostas.find(r => r.id === vencedor.cotacao_resposta_fornecedor_id);
              if (resposta && (!resposta.rejeitado || fornecedoresRevertidos.has(resposta.fornecedor_id))) {
                console.log(`      ✅ Vencedor: ${resposta.fornecedores?.razao_social}`);
                fornecedoresVencedores.add(resposta.fornecedor_id);
              }
            });
          }
        });
      }
    } else if (criterio === "lote" || criterio === "por_lote") {
      // MENOR VALOR POR LOTE: Vencedor por lote, podendo ter vários vencedores
      console.log(`  📊 Aplicando critério POR LOTE`);
      if (itens.length > 0) {
        const itensPorLote: Record<string, Record<string, any[]>> = {};
        
        itens.forEach(item => {
          const resposta = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
          // Incluir se não foi rejeitado OU se foi rejeitado mas revertido
          // CRÍTICO: Verificar tanto a flag rejeitado quanto a tabela de rejeições
          const estaRejeitado = resposta?.rejeitado || fornecedoresRejeitadosGlobal.has(resposta?.fornecedor_id);
          const foiRevertido = fornecedoresRevertidos.has(resposta?.fornecedor_id);
          
          if (!estaRejeitado || foiRevertido) {
            const loteId = item.itens_cotacao.lote_id;
            if (!loteId) return;
            if (!itensPorLote[loteId]) itensPorLote[loteId] = {};
            const respostaId = item.cotacao_resposta_fornecedor_id;
            if (!itensPorLote[loteId][respostaId]) itensPorLote[loteId][respostaId] = [];
            itensPorLote[loteId][respostaId].push(item);
          }
        });

        Object.entries(itensPorLote).forEach(([loteId, respostasPorLote]) => {
          const totaisPorResposta = Object.entries(respostasPorLote).map(([respostaId, itensLote]) => {
            const total = itensLote.reduce((sum, item) => {
              return sum + (Number(item.valor_unitario_ofertado) * Number(item.itens_cotacao.quantidade));
            }, 0);
            return { respostaId, total };
          });

          if (totaisPorResposta.length > 0) {
            const menorTotal = Math.min(...totaisPorResposta.map(r => r.total));
            const vencedor = totaisPorResposta.find(r => Math.abs(r.total - menorTotal) < 0.01);
            
            console.log(`    Lote ${loteId}: Menor total R$ ${menorTotal.toFixed(2)}`);
            
            if (vencedor) {
              const resposta = respostas.find(r => r.id === vencedor.respostaId);
              const estaRejeitado = resposta?.rejeitado || fornecedoresRejeitadosGlobal.has(resposta?.fornecedor_id);
              const foiRevertido = fornecedoresRevertidos.has(resposta?.fornecedor_id);
              
              if (resposta && (!estaRejeitado || foiRevertido)) {
                console.log(`      ✅ Vencedor: ${resposta.fornecedores?.razao_social}`);
                fornecedoresVencedores.add(resposta.fornecedor_id);
              }
            }
          }
        });
      }
    } else if (criterio === "desconto") {
      // MAIOR PERCENTUAL DE DESCONTO: Vencedor por item com maior desconto
      console.log(`  📊 Aplicando critério MAIOR PERCENTUAL DE DESCONTO`);
      if (itens.length > 0) {
        const itensPorNumero: Record<number, any[]> = {};
        
        // Agrupar itens por número
        itens.forEach(item => {
          const resposta = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
          // Incluir se não foi rejeitado OU se foi rejeitado mas revertido
          if (!resposta?.rejeitado || fornecedoresRevertidos.has(resposta.fornecedor_id)) {
            const numItem = item.itens_cotacao.numero_item;
            if (!itensPorNumero[numItem]) itensPorNumero[numItem] = [];
            itensPorNumero[numItem].push(item);
          }
        });

        // Para cada item, encontrar o maior percentual de desconto
        Object.entries(itensPorNumero).forEach(([numItem, itensDoNumero]) => {
          if (itensDoNumero.length > 0) {
            const maiorDesconto = Math.max(...itensDoNumero.map(i => Number(i.percentual_desconto || 0)));
            const vencedores = itensDoNumero.filter(i => Math.abs(Number(i.percentual_desconto || 0) - maiorDesconto) < 0.01);
            
            console.log(`    Item ${numItem}: Maior desconto ${maiorDesconto.toFixed(2)}%`);
            
            vencedores.forEach(vencedor => {
              const resposta = respostas.find(r => r.id === vencedor.cotacao_resposta_fornecedor_id);
              if (resposta && (!resposta.rejeitado || fornecedoresRevertidos.has(resposta.fornecedor_id))) {
                console.log(`      ✅ Vencedor: ${resposta.fornecedores?.razao_social}`);
                fornecedoresVencedores.add(resposta.fornecedor_id);
              }
            });
          }
        });
      }
    }

    console.log(`  🏆 Total de fornecedores vencedores identificados: ${fornecedoresVencedores.size}`);


    return Array.from(fornecedoresVencedores)
      .map(fornecedorId => {
        const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
        return resposta ? {
          id: fornecedorId,
          razao_social: resposta.fornecedores.razao_social
        } : null;
      })
      .filter((f): f is Fornecedor => f !== null)
      .sort((a, b) => a.razao_social.localeCompare(b.razao_social));
  };

  const loadDocumentosFornecedor = async (fornecedorId: string): Promise<DocumentoExistente[]> => {
    try {
      console.log(`📄 Carregando documentos para fornecedor: ${fornecedorId}`);
      
      // CRÍTICO: Buscar fornecedor cadastrado completo com mesmo CNPJ
      // para pegar documentos atualizados do cadastro
      const { data: fornecedorResposta } = await supabase
        .from("fornecedores")
        .select("cnpj")
        .eq("id", fornecedorId)
        .single();

      let fornecedorIdParaDocumentos = fornecedorId;

      if (fornecedorResposta?.cnpj) {
        console.log(`🔍 Buscando fornecedor cadastrado com CNPJ: ${fornecedorResposta.cnpj}`);
        
        // Buscar fornecedor com cadastro completo (user_id não nulo)
        const { data: fornecedorCadastrado } = await supabase
          .from("fornecedores")
          .select("id")
          .eq("cnpj", fornecedorResposta.cnpj)
          .not("user_id", "is", null)
          .maybeSingle();

        if (fornecedorCadastrado) {
          console.log(`✅ Encontrado fornecedor cadastrado! Usando ID: ${fornecedorCadastrado.id}`);
          fornecedorIdParaDocumentos = fornecedorCadastrado.id;
        } else {
          console.log(`ℹ️ Fornecedor não tem cadastro completo, usando ID da resposta`);
        }
      }
      
      // Tipos de documentos conforme cadastrados no banco (em snake_case)
      const tiposDocumentos = [
        "contrato_social",
        "cartao_cnpj",
        "inscricao_estadual_municipal",
        "cnd_federal",
        "cnd_tributos_estaduais",
        "cnd_divida_ativa_estadual",
        "cnd_tributos_municipais",
        "cnd_divida_ativa_municipal",
        "crf_fgts",
        "cndt",
        "certificado_gestor"
      ];

      // BUSCAR DATA DE FINALIZAÇÃO DO PROCESSO
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select("data_finalizacao")
        .eq("id", cotacaoId)
        .single();
      
      const dataFinalizacao = cotacaoData?.data_finalizacao 
        ? new Date(cotacaoData.data_finalizacao) 
        : null;
      
      console.log(`📅 Data de finalização do processo: ${dataFinalizacao?.toISOString() || 'não finalizado'}`);

      // BUSCAR DOCUMENTOS ANTIGOS DO FORNECEDOR VINCULADOS A ESTA COTAÇÃO
      let docsAntigosParaUsar: Map<string, any> = new Map();
      
      if (dataFinalizacao) {
        const { data: docsAntigos } = await supabase
          .from("documentos_antigos")
          .select("*")
          .eq("fornecedor_id", fornecedorIdParaDocumentos);
        
        if (docsAntigos && docsAntigos.length > 0) {
          console.log(`📦 Documentos antigos encontrados: ${docsAntigos.length}`);
          
          for (const docAntigo of docsAntigos) {
            // Verificar se está vinculado a esta cotação
            // CRÍTICO: Se está vinculado, usar documento antigo INDEPENDENTE de datas
            // O vínculo indica que aquele documento era o ativo quando o processo foi finalizado
            const vinculados = docAntigo.processos_vinculados || [];
            if (vinculados.includes(cotacaoId)) {
              console.log(`  ✅ Usando doc antigo: ${docAntigo.tipo_documento} (vinculado ao processo)`);
              docsAntigosParaUsar.set(docAntigo.tipo_documento, docAntigo);
            }
          }
        }
      }

      // CRÍTICO: Buscar APENAS documentos válidos/mais recentes
      const { data, error } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorIdParaDocumentos)
        .in("tipo_documento", tiposDocumentos)
        .eq("em_vigor", true)  // Buscar apenas documentos em vigor
        .order("tipo_documento")
        .order("data_upload", { ascending: false });

      if (error) {
        console.error("❌ Erro ao carregar documentos:", error);
        throw error;
      }

      console.log(`✅ Documentos atuais carregados: ${data?.length || 0}`);
      console.log(`📦 Documentos antigos a usar: ${docsAntigosParaUsar.size}`);

      // Mapeamento de nomes para exibição
      const nomesMapeados: Record<string, string> = {
        "contrato_social": "Contrato Social",
        "cartao_cnpj": "CNPJ",
        "inscricao_estadual_municipal": "Inscrição Municipal ou Estadual",
        "cnd_federal": "CND Federal",
        "cnd_tributos_estaduais": "CND Tributos Estaduais",
        "cnd_divida_ativa_estadual": "CND Dívida Ativa Estadual",
        "cnd_tributos_municipais": "CND Tributos Municipais",
        "cnd_divida_ativa_municipal": "CND Dívida Ativa Municipal",
        "crf_fgts": "CRF FGTS",
        "cndt": "CNDT",
        "certificado_gestor": "Certificado de Fornecedor"
      };

      const documentosOrdenados = tiposDocumentos
        .map(tipo => {
          // PRIORIZAR documento antigo se existir para este tipo
          const docAntigo = docsAntigosParaUsar.get(tipo);
          if (docAntigo) {
            console.log(`  📜 Usando documento ANTIGO para ${tipo}`);
            return {
              id: docAntigo.id,
              tipo_documento: nomesMapeados[tipo] || tipo,
              nome_arquivo: docAntigo.nome_arquivo,
              url_arquivo: docAntigo.url_arquivo,
              data_emissao: docAntigo.data_emissao,
              data_validade: docAntigo.data_validade,
              em_vigor: true
            };
          }
          
          // Senão, usar documento atual
          const doc = data?.find(d => d.tipo_documento === tipo);
          if (doc) {
            return {
              ...doc,
              tipo_documento: nomesMapeados[tipo] || doc.tipo_documento
            };
          }
          return undefined;
        })
        .filter((doc): doc is any => doc !== undefined);

      console.log(`📋 Documentos ordenados: ${documentosOrdenados.length}`);

      return documentosOrdenados as DocumentoExistente[];
    } catch (error) {
      console.error("❌ Erro crítico ao carregar documentos:", error);
      return [];
    }
  };

  const loadItensVencedores = async (fornecedorId: string, criterio: string, respostas: any[], todosItens: any[]): Promise<any[]> => {
    const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
    if (!resposta) {
      console.log(`❌ [loadItensVencedores] Resposta não encontrada para fornecedor ${fornecedorId}`);
      return [];
    }

    const itensDoFornecedor = todosItens.filter(i => i.cotacao_resposta_fornecedor_id === resposta.id);
    const itensVencidos: any[] = [];

    console.log(`🔍 [loadItensVencedores] Fornecedor ID: ${fornecedorId}`);
    console.log(`  → Resposta ID: ${resposta.id}`);
    console.log(`  → Total de itens recebidos (todosItens): ${todosItens.length}`);
    console.log(`  → Itens deste fornecedor: ${itensDoFornecedor.length}`);

    // Buscar fornecedores com rejeição revertida
    const { data: rejeicoesRevertidas } = await supabase
      .from('fornecedores_rejeitados_cotacao')
      .select('fornecedor_id')
      .eq('cotacao_id', cotacaoId)
      .eq('revertido', true);

    const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);

    // Filtrar respostas não rejeitadas OU rejeitadas mas revertidas
    const respostasNaoRejeitadas = respostas.filter(r => !r.rejeitado || fornecedoresRevertidos.has(r.fornecedor_id));
    console.log(`  → Total de respostas não rejeitadas: ${respostasNaoRejeitadas.length}`);
    
    const itensNaoRejeitados = todosItens.filter(item => {
      const resp = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
      return resp && (!resp.rejeitado || fornecedoresRevertidos.has(resp.fornecedor_id));
    });

    console.log(`  → Itens não rejeitados (TODOS os fornecedores válidos): ${itensNaoRejeitados.length}`);
    console.log(`  → Critério: ${criterio}`);

    if (criterio === "global") {
      // No global, se este fornecedor tem menor valor total, todos os itens são vencedores
      const menorValor = Math.min(...respostasNaoRejeitadas.map(r => Number(r.valor_total_anual_ofertado)));
      if (Number(resposta.valor_total_anual_ofertado) === menorValor) {
        itensVencidos.push(...itensDoFornecedor);
      }
    } else if (criterio === "item" || criterio === "por_item") {
      // Por item, verificar item a item quem tem menor valor
      console.log(`  ⚡ Analisando critério POR ITEM`);
      
      itensDoFornecedor.forEach(itemFornecedor => {
        const numeroItem = itemFornecedor.itens_cotacao.numero_item;
        const valorFornecedor = Number(itemFornecedor.valor_unitario_ofertado);
        
        // Pegar TODOS os itens com mesmo número (de TODOS os fornecedores não rejeitados)
        const itensComMesmoNumero = itensNaoRejeitados.filter(i => i.itens_cotacao.numero_item === numeroItem);
        
        console.log(`    📌 Item ${numeroItem}:`);
        console.log(`      → Valor deste fornecedor: R$ ${valorFornecedor.toFixed(2)}`);
        console.log(`      → Total de propostas para este item: ${itensComMesmoNumero.length}`);
        
        if (itensComMesmoNumero.length > 0) {
          // Calcular menor valor entre TODAS as propostas deste item
          const valoresDoItem = itensComMesmoNumero.map(i => Number(i.valor_unitario_ofertado));
          const menorValor = Math.min(...valoresDoItem);
          
          console.log(`      → Valores de todos os fornecedores:`, valoresDoItem.map(v => `R$ ${v.toFixed(2)}`));
          console.log(`      → Menor valor identificado: R$ ${menorValor.toFixed(2)}`);
          
          // Verificar se ESTE fornecedor tem o menor valor
          const ehVencedor = Math.abs(valorFornecedor - menorValor) < 0.001; // Tolerância para erro de ponto flutuante
          console.log(`      → Este fornecedor é vencedor? ${ehVencedor ? '✅ SIM' : '❌ NÃO'}`);
          
          if (ehVencedor) {
            itensVencidos.push(itemFornecedor);
          }
        }
      });
      
      console.log(`  ✅ Total de itens vencidos por este fornecedor: ${itensVencidos.length}`);
    } else if (criterio === "lote" || criterio === "por_lote") {
      // Por lote, verificar lote a lote quem tem menor valor total do lote
      console.log(`  ⚡ Analisando critério POR LOTE`);
      
      const loteIds = [...new Set(itensDoFornecedor.map(i => i.itens_cotacao.lote_id).filter(Boolean))];
      
      loteIds.forEach(loteId => {
        const itensDoLote = itensNaoRejeitados.filter(i => i.itens_cotacao.lote_id === loteId);
        const respostasPorLote: Record<string, any[]> = {};
        
        console.log(`    📌 Lote ${loteId}:`);
        
        itensDoLote.forEach(item => {
          const respostaId = item.cotacao_resposta_fornecedor_id;
          if (!respostasPorLote[respostaId]) respostasPorLote[respostaId] = [];
          respostasPorLote[respostaId].push(item);
        });

        const totaisPorResposta = Object.entries(respostasPorLote).map(([respostaId, itens]) => {
          const total = itens.reduce((sum, item) => sum + (Number(item.valor_unitario_ofertado) * Number(item.itens_cotacao.quantidade)), 0);
          return { respostaId, total };
        });

        console.log(`      → Total de propostas para este lote: ${totaisPorResposta.length}`);

        const menorTotal = Math.min(...totaisPorResposta.map(r => r.total));
        const vencedor = totaisPorResposta.find(r => Math.abs(r.total - menorTotal) < 0.01);
        
        console.log(`      → Menor total: R$ ${menorTotal.toFixed(2)}`);
        console.log(`      → Este fornecedor é vencedor? ${vencedor?.respostaId === resposta.id ? '✅ SIM' : '❌ NÃO'}`);
        
        if (vencedor?.respostaId === resposta.id) {
          itensVencidos.push(...itensDoFornecedor.filter(i => i.itens_cotacao.lote_id === loteId));
        }
      });
      
      console.log(`  ✅ Total de itens vencidos por este fornecedor: ${itensVencidos.length}`);
    } else if (criterio === "desconto") {
      // Por desconto, verificar item a item quem tem maior percentual
      console.log(`  ⚡ Analisando critério MAIOR PERCENTUAL DE DESCONTO`);
      
      itensDoFornecedor.forEach(itemFornecedor => {
        const numeroItem = itemFornecedor.itens_cotacao.numero_item;
        const descontoFornecedor = Number(itemFornecedor.percentual_desconto || 0);
        
        // Pegar TODOS os itens com mesmo número (de TODOS os fornecedores não rejeitados)
        const itensComMesmoNumero = itensNaoRejeitados.filter(i => i.itens_cotacao.numero_item === numeroItem);
        
        console.log(`    📌 Item ${numeroItem}:`);
        console.log(`      → Desconto deste fornecedor: ${descontoFornecedor.toFixed(2)}%`);
        console.log(`      → Total de propostas para este item: ${itensComMesmoNumero.length}`);
        
        if (itensComMesmoNumero.length > 0) {
          // Calcular maior desconto entre TODAS as propostas deste item
          const descontosDoItem = itensComMesmoNumero.map(i => Number(i.percentual_desconto || 0));
          const maiorDesconto = Math.max(...descontosDoItem);
          
          console.log(`      → Descontos de todos os fornecedores:`, descontosDoItem.map(v => `${v.toFixed(2)}%`));
          console.log(`      → Maior desconto identificado: ${maiorDesconto.toFixed(2)}%`);
          
          // Verificar se ESTE fornecedor tem o maior desconto
          const ehVencedor = Math.abs(descontoFornecedor - maiorDesconto) < 0.01;
          console.log(`      → Este fornecedor é vencedor? ${ehVencedor ? '✅ SIM' : '❌ NÃO'}`);
          
          if (ehVencedor) {
            itensVencidos.push(itemFornecedor);
          }
        }
      });
      
      console.log(`  ✅ Total de itens vencidos por este fornecedor: ${itensVencidos.length}`);
    }

    return itensVencidos.sort((a, b) => a.itens_cotacao.numero_item - b.itens_cotacao.numero_item);
  };

  const loadCamposFornecedor = async (fornecedorId: string): Promise<CampoDocumento[]> => {
    const { data, error } = await supabase
      .from("campos_documentos_finalizacao")
      .select(`
        *,
        documentos_finalizacao_fornecedor (
          id,
          nome_arquivo,
          url_arquivo,
          data_upload
        )
      `)
      .eq("cotacao_id", cotacaoId)
      .eq("fornecedor_id", fornecedorId)
      .order("ordem");

    if (error) {
      console.error("Erro ao carregar campos:", error);
      return [];
    }

    return data || [];
  };

  // Função auxiliar que usa dados do banco (sempre atualizados)
  const verificarTodosDocumentosAprovadosComDados = (
    fornecedorId: string, 
    docs: DocumentoExistente[], 
    campos: CampoDocumento[],
    documentosAprovadosAtualizados: Record<string, boolean>
  ): boolean => {
    console.log(`🔍 Verificando aprovação para fornecedor ${fornecedorId}:`, {
      totalDocs: docs.length,
      totalCampos: campos.length,
      camposStatus: campos.map(c => ({ nome: c.nome_campo, status: c.status_solicitacao })),
      aprovacaoManual: documentosAprovadosAtualizados[fornecedorId]
    });

    // Se não tem documentos em cadastro, não pode estar aprovado
    if (docs.length === 0) {
      console.log(`❌ Fornecedor sem documentos em cadastro`);
      return false;
    }

    // Verificar documentos em cadastro - apenas documentos com validade devem ser verificados
    // Documentos sem validade (Contrato Social, CNPJ, Inscrição) sempre são considerados válidos
    const documentosComValidade = docs.filter(doc => doc.data_validade !== null);
    const temDocumentoVencido = documentosComValidade.some(doc => !doc.em_vigor);
    
    if (temDocumentoVencido) {
      console.log(`❌ Fornecedor tem documento(s) vencido(s)`);
      return false;
    }

    // Se não há campos solicitados, verificar aprovação no JSON documentos_aprovados
    if (campos.length === 0) {
      const aprovado = documentosAprovadosAtualizados[fornecedorId] === true;
      console.log(`${aprovado ? '✅' : '❌'} Fornecedor sem campos solicitados - aprovação manual: ${aprovado}`);
      return aprovado;
    }

    // Verificar campos solicitados - devem estar todos aprovados
    const temCamposPendentes = campos.some(campo => 
      campo.status_solicitacao !== "aprovado"
    );

    if (temCamposPendentes) {
      console.log(`❌ Fornecedor tem campo(s) pendente(s)`);
      return false;
    }

    console.log(`✅ Todos documentos aprovados`);
    return true;
  };

  // Função legada que usa o estado React (mantida para compatibilidade)
  const verificarTodosDocumentosAprovados = (fornecedorId: string, docs: DocumentoExistente[], campos: CampoDocumento[]): boolean => {
    return verificarTodosDocumentosAprovadosComDados(fornecedorId, docs, campos, documentosAprovados);
  };

  const loadDocumentosAprovados = async () => {
    const { data, error } = await supabase
      .from("cotacoes_precos")
      .select("documentos_aprovados")
      .eq("id", cotacaoId)
      .single();

    if (error) {
      console.error("Erro ao carregar aprovações:", error);
    } else {
      setDocumentosAprovados((data?.documentos_aprovados as Record<string, boolean>) || {});
    }
  };

  const loadEncaminhamentos = async () => {
    if (!cotacaoId) return;

    try {
      const { data, error } = await supabase
        .from("encaminhamentos_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEncaminhamentos(data || []);
    } catch (error) {
      console.error("Erro ao carregar encaminhamentos:", error);
    }
  };

  const loadAutorizacoes = async () => {
    if (!cotacaoId) return;

    try {
      // Determinar o tipo de autorização esperado baseado no status atual
      const tipoEsperado = foiEnviadoParaSelecao ? 'selecao_fornecedores' : 'compra_direta';
      
      const { data, error } = await supabase
        .from("autorizacoes_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .eq("tipo_autorizacao", tipoEsperado) // FILTRAR APENAS PELO TIPO CORRETO
        .order("data_geracao", { ascending: false });

      if (error) throw error;
      setAutorizacoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar autorizações:", error);
    }
  };

  const loadRelatorioFinal = async () => {
    const { data, error } = await supabase
      .from("relatorios_finais")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: false });

    if (error) {
      console.error("Erro ao carregar relatórios finais:", error);
    } else {
      setRelatoriosFinais(data || []);
    }
  };

  const loadPlanilhasHabilitacao = async () => {
    const { data, error } = await supabase
      .from("planilhas_habilitacao")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: false });

    if (error) {
      console.error("Erro ao carregar planilhas de habilitação:", error);
    } else {
      setPlanilhasHabilitacao(data || []);
    }
  };

  const checkResponsavelLegal = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user.id) return;

    const { data } = await supabase
      .from("profiles")
      .select("responsavel_legal")
      .eq("id", session.user.id)
      .single();

    setIsResponsavelLegal(data?.responsavel_legal || false);
  };

  const adicionarCampoDocumento = async (fornecedorId: string) => {
    const campoFornecedor = novosCampos[fornecedorId] || { nome: "", descricao: "", obrigatorio: true };
    const dataLimite = datasLimiteDocumentos[fornecedorId] || "";

    if (!campoFornecedor.nome || !campoFornecedor.descricao) {
      toast.error("Preencha nome e descrição do documento");
      return;
    }

    if (!dataLimite) {
      toast.error("Defina a data limite para envio");
      return;
    }

    try {
      // Verificar se já existe documento com mesmo nome para este fornecedor nesta cotação
      const { data: existente } = await supabase
        .from("campos_documentos_finalizacao")
        .select("id")
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorId)
        .eq("nome_campo", campoFornecedor.nome.trim())
        .maybeSingle();

      if (existente) {
        toast.error("Este documento já foi solicitado para este fornecedor");
        return;
      }

      // Buscar a maior ordem existente para esta cotação para garantir unicidade
      const { data: maxOrdemData } = await supabase
        .from("campos_documentos_finalizacao")
        .select("ordem")
        .eq("cotacao_id", cotacaoId)
        .order("ordem", { ascending: false })
        .limit(1)
        .maybeSingle();

      const proximaOrdem = maxOrdemData ? maxOrdemData.ordem + 1 : 0;

      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .insert({
          cotacao_id: cotacaoId,
          fornecedor_id: fornecedorId,
          nome_campo: campoFornecedor.nome.trim(),
          descricao: campoFornecedor.descricao?.trim(),
          obrigatorio: true,
          ordem: proximaOrdem,
          status_solicitacao: "pendente",
          data_solicitacao: new Date().toISOString()
        });

      if (error) {
        console.error("Erro detalhado ao adicionar documento:", error);
        toast.error(`Erro ao adicionar documento: ${error.message || 'Erro desconhecido'}`);
        return;
      }

      toast.success("Documento adicionado à lista");
      
      // Limpar apenas os campos deste fornecedor
      setNovosCampos(prev => ({
        ...prev,
        [fornecedorId]: { nome: "", descricao: "", obrigatorio: true }
      }));
      setDatasLimiteDocumentos(prev => ({
        ...prev,
        [fornecedorId]: ""
      }));
      
      await loadAllFornecedores();
    } catch (error: any) {
      console.error("Erro ao adicionar documento:", error);
      toast.error(`Erro ao adicionar documento: ${error.message || 'Erro desconhecido'}`);
    }
  };

  const enviarSolicitacaoDocumentos = async (fornecedorId: string) => {
    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      if (!fornecedorData) return;

      const camposPendentes = fornecedorData.campos.filter(c => c.status_solicitacao === "pendente");

      if (camposPendentes.length === 0) {
        toast.error("Nenhum documento pendente para notificar");
        return;
      }

      // NÃO muda o status - apenas atualiza a data de solicitação/notificação
      // O status permanece "pendente" até o fornecedor fazer upload do documento
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({ data_solicitacao: new Date().toISOString() })
        .in("id", camposPendentes.map(c => c.id!));

      if (error) throw error;

      toast.success("Fornecedor notificado sobre documentos pendentes");
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao notificar fornecedor:", error);
      toast.error("Erro ao notificar fornecedor");
    }
  };

  const aprovarDocumento = async (campoId: string) => {
    try {
      console.log("📋 Aprovando documento:", campoId);
      const { data, error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "aprovado",
          data_aprovacao: new Date().toISOString()
        })
        .eq("id", campoId)
        .select();

      console.log("📋 Resultado da aprovação:", { data, error });

      if (error) throw error;

      toast.success("Documento aprovado");
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao aprovar documento:", error);
      toast.error("Erro ao aprovar documento");
    }
  };

  const rejeitarDocumento = async (campoId: string) => {
    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "rejeitado",
          data_aprovacao: null
        })
        .eq("id", campoId);

      if (error) throw error;

      toast.success("Documento rejeitado");
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao rejeitar documento:", error);
      toast.error("Erro ao rejeitar documento");
    }
  };

  const aprovarTodosDocumentosFornecedor = async (fornecedorId: string) => {
    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      if (!fornecedorData) return;

      const camposEmAnalise = fornecedorData.campos.filter(c => c.status_solicitacao === "em_analise");

      if (camposEmAnalise.length === 0) {
        toast.error("Nenhum documento em análise para aprovar");
        return;
      }

      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "aprovado",
          data_aprovacao: new Date().toISOString()
        })
        .in("id", camposEmAnalise.map(c => c.id!));

      if (error) throw error;

      toast.success(`Todos os documentos de ${fornecedorData.fornecedor.razao_social} foram aprovados`);
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao aprovar documentos:", error);
      toast.error("Erro ao aprovar documentos");
    }
  };

  const reverterAprovacaoDocumento = async (campoId: string) => {
    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "rejeitado",
          data_aprovacao: null
        })
        .eq("id", campoId);

      if (error) throw error;

      toast.success("Aprovação revertida");
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao reverter aprovação:", error);
      toast.error("Erro ao reverter aprovação");
    }
  };

  const handleAprovarDocumentosFornecedor = async (fornecedorId: string) => {
    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      if (!fornecedorData) return;

      // Verificar se tem documentos vencidos
      const documentosVencidos = fornecedorData.documentosExistentes.filter(doc => !doc.em_vigor);
      if (documentosVencidos.length > 0) {
        toast.error("Não é possível aprovar fornecedor com documentos vencidos");
        return;
      }

      // Aprovar todos os campos solicitados que não estão aprovados
      const camposParaAprovar = fornecedorData.campos.filter(c => 
        c.status_solicitacao !== "aprovado"
      );

      if (camposParaAprovar.length > 0) {
        const { error } = await supabase
          .from("campos_documentos_finalizacao")
          .update({
            status_solicitacao: "aprovado",
            data_aprovacao: new Date().toISOString()
          })
          .in("id", camposParaAprovar.map(c => c.id!));

        if (error) throw error;
      } else {
        // Se não há campos para aprovar, salvar aprovação no JSON documentos_aprovados
        const novosDocumentosAprovados = { ...documentosAprovados, [fornecedorId]: true };
        
        console.log("💾 Salvando aprovação no banco:", JSON.stringify(novosDocumentosAprovados));
        
        const { error } = await supabase
          .from("cotacoes_precos")
          .update({ documentos_aprovados: novosDocumentosAprovados })
          .eq("id", cotacaoId);

        if (error) {
          console.error("❌ Erro ao salvar aprovação:", error);
          throw error;
        }
        
        console.log("✅ Aprovação salva com sucesso no banco");
        setDocumentosAprovados(novosDocumentosAprovados);
      }

      toast.success(`Documentos de ${fornecedorData.fornecedor.razao_social} aprovados com sucesso`);
      
      // CRÍTICO: Aguardar um momento e recarregar dados frescos do banco
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Recarregar dados para refletir mudança na UI
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao aprovar documentos do fornecedor:", error);
      toast.error("Erro ao aprovar documentos");
    }
  };

  const handleReverterAprovacaoFornecedor = async (fornecedorId: string) => {
    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      if (!fornecedorData) return;

      // Reverter todos os campos aprovados para rejeitado
      const camposAprovados = fornecedorData.campos.filter(c => c.status_solicitacao === "aprovado");

      if (camposAprovados.length > 0) {
        const { error } = await supabase
          .from("campos_documentos_finalizacao")
          .update({
            status_solicitacao: "rejeitado",
            data_aprovacao: null
          })
          .in("id", camposAprovados.map(c => c.id!));

        if (error) throw error;
      } else {
        // Se não há campos, remover aprovação do JSON documentos_aprovados
        const novosDocumentosAprovados = { ...documentosAprovados };
        delete novosDocumentosAprovados[fornecedorId];
        
        const { error } = await supabase
          .from("cotacoes_precos")
          .update({ documentos_aprovados: novosDocumentosAprovados })
          .eq("id", cotacaoId);

        if (error) throw error;
        setDocumentosAprovados(novosDocumentosAprovados);
      }

      toast.success(`Aprovação de ${fornecedorData.fornecedor.razao_social} revertida com sucesso`);
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao reverter aprovação do fornecedor:", error);
      toast.error("Erro ao reverter aprovação");
    }
  };

  const enviarDocumentosParaFornecedor = async (fornecedorId: string) => {
    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      if (!fornecedorData || fornecedorData.campos.length === 0) {
        toast.error("Nenhum documento foi adicionado para enviar");
        return;
      }

      // Verificar se há documentos pendentes para notificar
      const documentosPendentes = fornecedorData.campos.filter(c => c.status_solicitacao === "pendente");
      
      if (documentosPendentes.length === 0) {
        toast.info("Nenhum documento pendente para notificar");
        return;
      }

      // NÃO muda o status - apenas registra a data de solicitação/notificação
      // O status permanece "pendente" até o fornecedor fazer upload do documento
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({ data_solicitacao: new Date().toISOString() })
        .in("id", documentosPendentes.map(d => d.id!));

      if (error) throw error;

      toast.success(`Fornecedor ${fornecedorData.fornecedor.razao_social} notificado sobre os documentos pendentes`);
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao notificar fornecedor:", error);
      toast.error("Erro ao notificar fornecedor sobre documentos");
    }
  };

  const deletarEncaminhamento = async () => {
    if (!encaminhamentoParaExcluir) return;

    try {
      const storageUrl = encaminhamentoParaExcluir.url;
      const filePath = storageUrl.split("/processo-anexos/")[1];

      const { error: storageError } = await supabase.storage
        .from("processo-anexos")
        .remove([filePath]);

      if (storageError) {
        console.error("Erro ao remover do storage:", storageError);
      }

      const { error: dbError } = await supabase
        .from("encaminhamentos_processo")
        .delete()
        .eq("id", encaminhamentoParaExcluir.id);

      if (dbError) throw dbError;

      setEncaminhamentoParaExcluir(null);
      setConfirmDeleteEncaminhamentoOpen(false);
      await loadEncaminhamentos();
      toast.success("Encaminhamento excluído com sucesso");
    } catch (error: any) {
      console.error("Erro ao excluir encaminhamento:", error);
      toast.error("Erro ao excluir encaminhamento");
    }
  };

  const deletarAutorizacao = async () => {
    if (!autorizacaoParaExcluir) return;

    try {
      const arquivoUrl = autorizacaoParaExcluir.url_arquivo;
      let filePath = arquivoUrl.split("/processo-anexos/")[1];
      
      // Remover query params se houver (URLs assinadas)
      if (filePath) {
        filePath = filePath.split("?")[0];

        const { error: storageError } = await supabase.storage
          .from("processo-anexos")
          .remove([filePath]);

        if (storageError) {
          console.error("Erro ao remover do storage:", storageError);
        }
      }

      const { error: dbError } = await supabase
        .from("autorizacoes_processo")
        .delete()
        .eq("id", autorizacaoParaExcluir.id);

      if (dbError) throw dbError;

      setAutorizacaoParaExcluir(null);
      setConfirmDeleteAutorizacaoOpen(false);
      await loadAutorizacoes();
      toast.success("Autorização excluída com sucesso");
    } catch (error: any) {
      console.error("Erro ao excluir autorização:", error);
      toast.error("Erro ao excluir autorização");
    }
  };

  const deletarRecurso = async () => {
    if (!recursoParaExcluir) return;

    try {
      // Deletar resposta se existir
      const respostaExistente = (recursoParaExcluir as any).respostas_recursos?.[0];
      if (respostaExistente) {
        // Deletar arquivo da resposta
        if (respostaExistente.url_documento) {
          let filePath = respostaExistente.url_documento;
          if (filePath.includes('https://')) {
            const urlParts = filePath.split('/processo-anexos/');
            filePath = urlParts[1] || filePath;
          }
          await supabase.storage.from('processo-anexos').remove([filePath]);
        }
        
        // Deletar resposta do banco
        await supabase
          .from('respostas_recursos')
          .delete()
          .eq('recurso_id', recursoParaExcluir.id);
        
        // Reverter status da rejeição se foi dado provimento
        if (respostaExistente.decisao === 'provimento') {
          await supabase
            .from('fornecedores_rejeitados_cotacao')
            .update({ 
              revertido: false,
              itens_afetados: [],
              motivo_reversao: null,
              data_reversao: null,
              usuario_reverteu_id: null
            })
            .eq('id', recursoParaExcluir.rejeicao_id);
        }
      }
      
      // Deletar arquivo do recurso
      if (recursoParaExcluir.url_arquivo) {
        let filePath = recursoParaExcluir.url_arquivo;
        if (filePath.includes('https://')) {
          const urlParts = filePath.split('/processo-anexos/');
          filePath = urlParts[1] || filePath;
        }
        await supabase.storage.from('processo-anexos').remove([filePath]);
      }
      
      // Deletar recurso do banco
      const { error: deleteError } = await supabase
        .from('recursos_fornecedor')
        .delete()
        .eq('id', recursoParaExcluir.id);
      
      if (deleteError) {
        console.error('Erro ao deletar recurso:', deleteError);
        throw deleteError;
      }
      
      // Atualizar status da rejeição para sem_recurso
      await supabase
        .from('fornecedores_rejeitados_cotacao')
        .update({ status_recurso: 'sem_recurso' })
        .eq('id', recursoParaExcluir.rejeicao_id);
      
      setRecursoParaExcluir(null);
      setConfirmDeleteRecursoOpen(false);
      toast.success('Recurso apagado com sucesso!');
      await loadRecursos();
      await loadFornecedoresRejeitados();
    } catch (error) {
      console.error('Erro ao apagar recurso:', error);
      toast.error('Erro ao apagar recurso');
    }
  };

  const deletarRespostaRecurso = async () => {
    if (!respostaRecursoParaExcluir) return;

    try {
      const respostaAtual = (respostaRecursoParaExcluir as any).respostas_recursos[0];
      
      // Deletar arquivo do storage
      if (respostaAtual.url_documento) {
        let filePath = respostaAtual.url_documento;
        if (filePath.includes('https://')) {
          const urlParts = filePath.split('/processo-anexos/');
          filePath = urlParts[1] || filePath;
        }
        await supabase.storage.from('processo-anexos').remove([filePath]);
      }
      
      // Deletar resposta do banco
      await supabase
        .from('respostas_recursos')
        .delete()
        .eq('recurso_id', respostaRecursoParaExcluir.id);
      
      // Reverter status da rejeição se foi dado provimento
      if (respostaAtual.decisao === 'provimento') {
        await supabase
          .from('fornecedores_rejeitados_cotacao')
          .update({ 
            revertido: false,
            itens_afetados: [],
            motivo_reversao: null,
            data_reversao: null,
            usuario_reverteu_id: null
          })
          .eq('id', respostaRecursoParaExcluir.rejeicao_id);
      }
      
      setRespostaRecursoParaExcluir(null);
      setConfirmDeleteRespostaRecursoOpen(false);
      toast.success('Resposta apagada com sucesso!');
      await loadRecursos();
      await loadFornecedoresRejeitados();
    } catch (error) {
      console.error('Erro ao apagar resposta:', error);
      toast.error('Erro ao apagar resposta');
    }
  };

  const handleSolicitarAtualizacaoDocumento = async () => {
    if (!documentoParaAtualizar) return;
    
    if (!motivoAtualizacao || motivoAtualizacao.trim() === "") {
      toast.error("É necessário informar o motivo da solicitação");
      return;
    }

    try {
      const { error } = await supabase
        .from("documentos_fornecedor")
        .update({
          atualizacao_solicitada: true,
          data_solicitacao_atualizacao: new Date().toISOString(),
          motivo_solicitacao_atualizacao: motivoAtualizacao.trim()
        })
        .eq("id", documentoParaAtualizar.id);

      if (error) throw error;

      toast.success("Solicitação de atualização enviada para o fornecedor");
      setDialogSolicitarAtualizacao(false);
      setDocumentoParaAtualizar(null);
      setMotivoAtualizacao("");
      await loadAllFornecedores();
    } catch (error: any) {
      console.error("Erro ao solicitar atualização:", error);
      toast.error("Erro ao enviar solicitação de atualização");
    }
  };

  const deletarRelatorioFinal = async () => {
    if (!relatorioParaExcluir) return;

    try {
      // Extrair path corretamente - remover query params e pegar apenas o path dentro do bucket
      let urlSemParams = relatorioParaExcluir.url_arquivo.split("?")[0];
      let filePath = "";
      
      // Tentar extrair o path de diferentes formatos de URL
      if (urlSemParams.includes("/processo-anexos/")) {
        filePath = urlSemParams.split("/processo-anexos/")[1];
      } else if (urlSemParams.includes("relatorios-finais/")) {
        // Se o path já começa com relatorios-finais
        const match = urlSemParams.match(/relatorios-finais\/.+/);
        if (match) filePath = match[0];
      }

      console.log("[Relatório Final] Deletando arquivo:", filePath);

      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from("processo-anexos")
          .remove([filePath]);

        if (storageError) {
          console.error("Erro ao remover do storage:", storageError);
          // Continuar mesmo com erro para deletar do banco
        } else {
          console.log("[Relatório Final] Arquivo removido do storage com sucesso");
        }
      }

      // Deletar do banco de dados
      const { error: dbError } = await supabase
        .from("relatorios_finais")
        .delete()
        .eq("id", relatorioParaExcluir.id);

      if (dbError) throw dbError;

      setRelatorioParaExcluir(null);
      setConfirmDeleteRelatorioOpen(false);
      await loadRelatorioFinal();
      toast.success("Relatório final excluído com sucesso");
    } catch (error: any) {
      console.error("Erro ao excluir relatório final:", error);
      toast.error("Erro ao excluir relatório final");
    }
  };

  const gerarPlanilhaHabilitacao = async () => {
    try {
      setLoading(true);
      
      // Buscar dados do processo
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select("processo_compra_id, criterio_julgamento")
        .eq("id", cotacaoId)
        .single();
      
      if (!cotacaoData) throw new Error("Cotação não encontrada");

      const { data: processo } = await supabase
        .from("processos_compras")
        .select("numero_processo_interno, objeto_resumido")
        .eq("id", cotacaoData.processo_compra_id)
        .single();

      if (!processo) throw new Error("Processo não encontrado");

      const { data: cotacao } = await supabase
        .from("cotacoes_precos")
        .select("titulo_cotacao")
        .eq("id", cotacaoId)
        .single();

      // Buscar itens da cotação
      const { data: itensData } = await supabase
        .from("itens_cotacao")
        .select(`
          numero_item,
          descricao,
          quantidade,
          unidade,
          lotes_cotacao(numero_lote, descricao_lote)
        `)
        .eq("cotacao_id", cotacaoId)
        .order("numero_item");

      // Buscar respostas dos fornecedores
      const { data: respostasData } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          fornecedor_id,
          rejeitado,
          motivo_rejeicao,
          fornecedores!inner(id, razao_social, cnpj, email)
        `)
        .eq("cotacao_id", cotacaoId);

      // Buscar fornecedores rejeitados
      const { data: rejeitadosData } = await supabase
        .from("fornecedores_rejeitados_cotacao")
        .select("fornecedor_id, itens_afetados, motivo_rejeicao, revertido")
        .eq("cotacao_id", cotacaoId)
        .eq("revertido", false);

      // Buscar empresas reprovadas pelo compliance - TODAS as análises (não apenas a última)
      const { data: analisesCompliance } = await supabase
        .from("analises_compliance")
        .select("empresas_reprovadas")
        .eq("cotacao_id", cotacaoId);
      
      // Agregar CNPJs reprovados de TODAS as análises
      const cnpjsReprovadosCompliance = new Set<string>();
      for (const analise of analisesCompliance || []) {
        const reprovadas = analise.empresas_reprovadas as string[] || [];
        for (const cnpj of reprovadas) {
          if (cnpj) cnpjsReprovadosCompliance.add(cnpj);
        }
      }
      console.log('📋 CNPJs reprovados pelo compliance:', Array.from(cnpjsReprovadosCompliance));

      // Função para identificar preço público - pelo email (novo) ou CNPJ sequencial (antigo)
      const ehPrecoPublico = (cnpj: string, email?: string) => {
        // Novo método: verificar pelo email (timestamp-based)
        if (email && email.includes('precos.publicos')) return true;
        
        // Método antigo: CNPJ sequencial (para compatibilidade)
        if (!cnpj) return false;
        const primeiroDigito = cnpj.charAt(0);
        return cnpj.split('').every(d => d === primeiroDigito);
      };

      // Montar estrutura de respostas com itens - EXCLUINDO preços públicos e reprovados compliance
      const respostasFormatadas: any[] = [];
      
      for (const resposta of respostasData || []) {
        // NOTA: Preços públicos (Banco de Preços) devem aparecer na planilha como referência,
        // mas são excluídos da lógica de vencedor em gerarPlanilhaHabilitacaoPDF.ts

        // CRÍTICO: Excluir fornecedores reprovados pelo compliance (comparar por CNPJ, não ID!)
        if (cnpjsReprovadosCompliance.has(resposta.fornecedores.cnpj)) {
          console.log(`🚫 Excluindo fornecedor reprovado compliance: ${resposta.fornecedores.razao_social} (CNPJ: ${resposta.fornecedores.cnpj})`);
          continue;
        }

        const { data: itensResposta } = await supabase
          .from("respostas_itens_fornecedor")
          .select(`
            valor_unitario_ofertado,
            percentual_desconto,
            marca,
            itens_cotacao!inner(numero_item, lote_id, lotes_cotacao(numero_lote))
          `)
          .eq("cotacao_resposta_fornecedor_id", resposta.id);

        const rejeicao = rejeitadosData?.find(r => r.fornecedor_id === resposta.fornecedor_id);
        
        // Log para debug de inabilitação
        console.log(`📋 Planilha Habilitação - ${resposta.fornecedores.razao_social}:`, {
          fornecedor_id: resposta.fornecedor_id,
          temRejeicao: !!rejeicao,
          itens_afetados: rejeicao?.itens_afetados || [],
          motivo: rejeicao?.motivo_rejeicao
        });
        
        respostasFormatadas.push({
          fornecedor: {
            id: resposta.fornecedores.id,
            razao_social: resposta.fornecedores.razao_social,
            cnpj: resposta.fornecedores.cnpj,
            email: resposta.fornecedores.email
          },
          itens: (itensResposta || []).map(ir => ({
            numero_item: ir.itens_cotacao.numero_item,
            valor_unitario_ofertado: ir.valor_unitario_ofertado,
            percentual_desconto: ir.percentual_desconto,
            marca: ir.marca,
            lote_numero: ir.itens_cotacao.lotes_cotacao?.numero_lote
          })),
          valor_total: (itensResposta || []).reduce((sum, ir) => sum + (ir.valor_unitario_ofertado || 0), 0),
          rejeitado: !!rejeicao && (!rejeicao.itens_afetados || rejeicao.itens_afetados.length === 0),
          itens_rejeitados: rejeicao?.itens_afetados || [],
          motivo_rejeicao: rejeicao?.motivo_rejeicao || resposta.motivo_rejeicao
        });
      }

      // Gerar protocolo
      const protocolo = `${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Buscar dados do usuário
      const { data: { user } } = await supabase.auth.getUser();
      const { data: usuario } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", user!.id)
        .single();

      const itensFormatados = (itensData || []).map(item => ({
        numero_item: item.numero_item,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        lote_numero: item.lotes_cotacao?.numero_lote,
        lote_descricao: item.lotes_cotacao?.descricao_lote
      }));

      // Gerar PDF
      const { blob, storagePath } = await gerarPlanilhaHabilitacaoPDF(
        { numero: processo.numero_processo_interno, objeto: processo.objeto_resumido },
        { titulo_cotacao: cotacao?.titulo_cotacao || "" },
        itensFormatados,
        respostasFormatadas,
        { protocolo, usuario: { nome_completo: usuario?.nome_completo || "", cpf: usuario?.cpf || "" } },
        criterioJulgamento
      );

      // Upload para storage
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(storagePath, blob, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from("processo-anexos")
        .getPublicUrl(storagePath);

      // Salvar no banco
      const { error: insertError } = await supabase
        .from("planilhas_habilitacao")
        .insert({
          cotacao_id: cotacaoId,
          protocolo,
          nome_arquivo: `Planilha_Habilitacao_${processo.numero_processo_interno.replace(/\//g, '-')}.pdf`,
          url_arquivo: urlData.publicUrl,
          storage_path: storagePath,
          usuario_gerador_id: user!.id,
          data_geracao: new Date().toISOString()
        });

      if (insertError) throw insertError;

      await loadPlanilhasHabilitacao();
      toast.success("Planilha Final gerada com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar planilha final:", error);
      toast.error("Erro ao gerar planilha final");
    } finally {
      setLoading(false);
    }
  };

  const deletarPlanilhaHabilitacao = async () => {
    if (!planilhaHabParaExcluir) return;

    try {
      // Extrair path do storage
      let filePath = planilhaHabParaExcluir.storage_path;
      
      if (!filePath) {
        const urlSemParams = planilhaHabParaExcluir.url_arquivo.split("?")[0];
        if (urlSemParams.includes("/processo-anexos/")) {
          filePath = urlSemParams.split("/processo-anexos/")[1];
        } else if (urlSemParams.includes("planilhas-habilitacao/")) {
          const match = urlSemParams.match(/planilhas-habilitacao\/.+/);
          if (match) filePath = match[0];
        }
      }

      console.log("[Planilha Final] Deletando arquivo:", filePath);

      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from("processo-anexos")
          .remove([filePath]);

        if (storageError) {
          console.error("Erro ao remover do storage:", storageError);
        } else {
          console.log("[Planilha Final] Arquivo removido do storage com sucesso");
        }
      }

      // Deletar do banco de dados
      const { error: dbError } = await supabase
        .from("planilhas_habilitacao")
        .delete()
        .eq("id", planilhaHabParaExcluir.id);

      if (dbError) throw dbError;

      setPlanilhaHabParaExcluir(null);
      setConfirmDeletePlanilhaHabOpen(false);
      await loadPlanilhasHabilitacao();
      toast.success("Planilha final excluída com sucesso");
    } catch (error: any) {
      console.error("Erro ao excluir planilha final:", error);
      toast.error("Erro ao excluir planilha final");
    }
  };

  const gerarRelatorio = async () => {
    try {
      setLoading(true);
      
      // Buscar processo_compra_id da cotação
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select("processo_compra_id")
        .eq("id", cotacaoId)
        .single();
      
      if (!cotacaoData) throw new Error("Cotação não encontrada");
      const processoId = cotacaoData.processo_compra_id;
      
      const { data: { user } } = await supabase.auth.getUser();
      const { data: usuario } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", user!.id)
        .single();

      const { data: processo } = await supabase
        .from("processos_compras")
        .select(`
          numero_processo_interno,
          objeto_resumido,
          valor_estimado_anual,
          data_abertura,
          criterio_julgamento
        `)
        .eq("id", processoId)
        .single();

      if (!processo) throw new Error("Processo não encontrado");

      // Buscar TODAS respostas (incluindo rejeitadas) para as observações
      const { data: todasRespostas } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          fornecedor_id,
          rejeitado,
          motivo_rejeicao,
          fornecedores!inner(razao_social, cnpj)
        `)
        .eq("cotacao_id", cotacaoId);

      // Buscar inabilitações da tabela fornecedores_rejeitados_cotacao (inclui parciais)
      const { data: inabilitacoes } = await supabase
        .from("fornecedores_rejeitados_cotacao")
        .select(`
          fornecedor_id,
          motivo_rejeicao,
          itens_afetados,
          revertido,
          fornecedores!inner(razao_social, cnpj)
        `)
        .eq("cotacao_id", cotacaoId)
        .eq("revertido", false);

      // Filtrar fornecedores rejeitados (da proposta)
      const fornecedoresRejeitadosProposta = (todasRespostas || [])
        .filter(r => r.rejeitado)
        .map(r => ({
          razaoSocial: r.fornecedores.razao_social,
          motivoRejeicao: r.motivo_rejeicao || "Não especificado"
        }));

      // Adicionar inabilitações (parciais ou globais)
      // CRÍTICO: Para critério por_lote, itens_afetados são números de LOTES, não de itens
      const fornecedoresInabilitados = (inabilitacoes || []).map(inab => {
        const itensAfetados = inab.itens_afetados || [];
        const ehParcial = itensAfetados.length > 0;
        
        // CRÍTICO: Usar "Lote(s)" para critério por_lote, "Item(ns)" para outros critérios
        let textoItens: string;
        if (ehParcial) {
          if (criterioJulgamento === 'por_lote') {
            textoItens = `Inabilitada no(s) Lote(s): ${itensAfetados.join(", ")}. Motivo: ${inab.motivo_rejeicao}`;
          } else {
            textoItens = `Inabilitada no(s) Item(ns): ${itensAfetados.join(", ")}. Motivo: ${inab.motivo_rejeicao}`;
          }
        } else {
          textoItens = inab.motivo_rejeicao;
        }
        
        return {
          razaoSocial: inab.fornecedores.razao_social,
          motivoRejeicao: textoItens
        };
      });

      // Combinar, removendo duplicatas por razão social
      const razoesSociaisInabilitados = new Set(fornecedoresInabilitados.map(f => f.razaoSocial));
      const fornecedoresRejeitados = [
        ...fornecedoresInabilitados,
        ...fornecedoresRejeitadosProposta.filter(f => !razoesSociaisInabilitados.has(f.razaoSocial))
      ];

      // CRÍTICO: Buscar TODOS os itens em chunks para evitar limite de 1000
      console.log(`📤 [Relatório Final] Buscando itens para ${todasRespostas?.length || 0} respostas`);
      
      const isDesconto = criterioJulgamento === 'desconto' || criterioJulgamento === 'maior_percentual_desconto';
      
      const todosItensRespostas = [];
      for (const resposta of todasRespostas || []) {
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
          const { data: itensFornecedor, error: itensError } = await supabase
            .from("respostas_itens_fornecedor")
            .select(`
              id,
              cotacao_resposta_fornecedor_id,
              valor_unitario_ofertado,
              percentual_desconto,
              marca,
              itens_cotacao!inner(numero_item, quantidade, descricao)
            `)
            .eq("cotacao_resposta_fornecedor_id", resposta.id)
            .range(offset, offset + 999);

          if (itensError) {
            console.error(`❌ Erro ao buscar itens:`, itensError);
            throw itensError;
          }

          if (itensFornecedor && itensFornecedor.length > 0) {
            todosItensRespostas.push(...itensFornecedor);
          }

          hasMore = itensFornecedor && itensFornecedor.length === 1000;
          offset += 1000;
        }
      }
      
      const itensRespostas = todosItensRespostas;
      console.log(`📊 [Relatório Final] TOTAL de itens respostas carregados: ${itensRespostas.length}`);
      console.log(`📊 [Relatório Final] Processando ${fornecedoresData.length} fornecedores`);

      // CRÍTICO: Usar fornecedoresData que já vem com itens vencedores identificados corretamente
      const fornecedoresVencedores = fornecedoresData
        .filter(f => !f.rejeitado)
        .map(fData => {
          const resposta = todasRespostas?.find(r => r.fornecedor_id === fData.fornecedor.id);
          const itensVencedores = fData.itensVencedores;
          
          let valorTotal = 0;
          const itensVencedoresDetalhados: Array<{ numero: number; descricao: string; valor: number; marca?: string; valorUnitario?: number }> = [];
          
          itensVencedores.forEach((item) => {
            // Para critério por_lote: buscar pelo ID único (diferentes lotes podem ter mesmo numero_item)
            // Para outros critérios: buscar pelo numero_item (lógica original)
            const itemResposta = itensRespostas?.find(
              ir => ir.cotacao_resposta_fornecedor_id === fData.respostaId && 
                    (criterioJulgamento === 'por_lote' 
                      ? ir.id === item.id 
                      : ir.itens_cotacao.numero_item === item.itens_cotacao.numero_item)
            );
            
            if (itemResposta) {
              // Para critério de desconto, usar o percentual_desconto
              // Para outros critérios, usar valor monetário
              if (isDesconto) {
                const desconto = Number(itemResposta.percentual_desconto || 0);
                valorTotal += desconto;
                itensVencedoresDetalhados.push({
                  numero: item.itens_cotacao.numero_item,
                  descricao: itemResposta.itens_cotacao.descricao,
                  valor: desconto,
                  marca: itemResposta.marca || '',
                  valorUnitario: desconto
                });
              } else {
                const valorUnitario = Number(itemResposta.valor_unitario_ofertado);
                const quantidade = Number(itemResposta.itens_cotacao.quantidade);
                const valorItem = valorUnitario * quantidade;
                
                valorTotal += valorItem;
                itensVencedoresDetalhados.push({
                  numero: item.itens_cotacao.numero_item,
                  descricao: itemResposta.itens_cotacao.descricao,
                  valor: valorItem,
                  marca: itemResposta.marca || '',
                  valorUnitario: valorUnitario
                });
              }
            }
          });

          return {
            razaoSocial: fData.fornecedor.razao_social,
            cnpj: resposta?.fornecedores.cnpj || "",
            valorTotal: valorTotal,
            itensVencedores: itensVencedoresDetalhados
          };
        });

      console.log(`✅ [Relatório Final] ${fornecedoresVencedores.length} fornecedores processados com valores calculados`);

      const resultado = await gerarRelatorioFinal({
        numeroProcesso: processo.numero_processo_interno,
        objetoProcesso: processo.objeto_resumido,
        usuarioNome: usuario?.nome_completo || "",
        usuarioCpf: usuario?.cpf || "",
        fornecedoresVencedores,
        fornecedoresRejeitados,
        criterioJulgamento
      });

      // Salvar referência no banco
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      const { data: insertData, error: insertError } = await supabase
        .from("relatorios_finais")
        .insert({
          cotacao_id: cotacaoId,
          protocolo: resultado.protocolo,
          nome_arquivo: resultado.fileName,
          url_arquivo: resultado.url,
          usuario_gerador_id: currentSession!.user.id,
          data_geracao: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) throw insertError;


      // Recarregar a lista de relatórios
      await loadRelatorioFinal();
      toast.success("Relatório Final gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      toast.error("Erro ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  const gerarAutorizacao = async () => {
    if (relatoriosFinais.length === 0) {
      toast.error("É necessário gerar o Relatório Final antes da autorização");
      return;
    }

    try {
      setLoading(true);
      
      // Buscar processo_compra_id da cotação e status de seleção
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select("processo_compra_id, enviado_para_selecao")
        .eq("id", cotacaoId)
        .single();
      
      if (!cotacaoData) throw new Error("Cotação não encontrada");
      const processoId = cotacaoData.processo_compra_id;
      const foiParaSelecao = cotacaoData.enviado_para_selecao || false;
      
      const { data: { user } } = await supabase.auth.getUser();
      const { data: usuario } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", user!.id)
        .single();

      const { data: processo } = await supabase
        .from("processos_compras")
        .select("numero_processo_interno, objeto_resumido")
        .eq("id", processoId)
        .single();

      if (!processo) throw new Error("Processo não encontrado");

      const { data: respostas } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          fornecedor_id,
          fornecedores!inner(razao_social, cnpj)
        `)
        .eq("cotacao_id", cotacaoId);

      console.log(`🔍 [Autorização] Buscando itens de ${respostas?.length || 0} fornecedores...`);

      // Buscar TODOS os itens POR FORNECEDOR em lotes de 1000 (escala automaticamente)
      const itensRespostas: any[] = [];
      const BATCH_SIZE = 1000;
      
      for (let i = 0; i < (respostas?.length || 0); i++) {
        const resposta = respostas![i];
        const fornecedorNome = resposta.fornecedores?.razao_social || `Fornecedor ${i + 1}`;
        
        console.log(`📦 [Autorização] Fornecedor ${i + 1}/${respostas!.length}: ${fornecedorNome}`);
        
        let offset = 0;
        let hasMore = true;
        let fornecedorItens = 0;
        
        while (hasMore) {
          const { data: batch, error: batchError } = await supabase
            .from("respostas_itens_fornecedor")
            .select(`
              id,
              cotacao_resposta_fornecedor_id,
              valor_unitario_ofertado,
              percentual_desconto,
              marca,
              itens_cotacao!inner(numero_item, quantidade)
            `)
            .eq("cotacao_resposta_fornecedor_id", resposta.id)
            .range(offset, offset + BATCH_SIZE - 1);
          
          if (batchError) {
            console.error(`❌ [Autorização] Erro ao buscar itens do fornecedor ${fornecedorNome}:`, batchError);
            throw batchError;
          }
          
          if (batch && batch.length > 0) {
            itensRespostas.push(...batch);
            fornecedorItens += batch.length;
          }
          
          hasMore = batch && batch.length === BATCH_SIZE;
          offset += BATCH_SIZE;
        }
        
        console.log(`✅ [Autorização] ${fornecedorNome}: ${fornecedorItens} itens carregados`);
      }
      
      console.log(`✅ [Autorização] TOTAL GERAL: ${itensRespostas.length} itens de ${respostas?.length || 0} fornecedores`);

      const isDesconto = criterioJulgamento === 'desconto' || criterioJulgamento === 'maior_percentual_desconto';

      // Filtrar apenas fornecedores não rejeitados
      const fornecedoresNaoRejeitados = fornecedoresData.filter(f => !f.rejeitado);
      
      const fornecedoresVencedores = fornecedoresNaoRejeitados.map(fData => {
        const resposta = respostas?.find(r => r.fornecedor_id === fData.fornecedor.id);
        const itensVencedores = fData.itensVencedores;
        const itensNumeros = itensVencedores.map(i => i.itens_cotacao.numero_item).sort((a, b) => a - b);
        
        let valorTotal = 0;
        const itensVencedoresComValor: Array<{ numero: number; valor: number; marca?: string; valorUnitario?: number }> = [];
        
      itensVencedores.forEach(item => {
        // Para critério por_lote: buscar pelo ID único (diferentes lotes podem ter mesmo numero_item)
        // Para outros critérios: buscar pelo numero_item (lógica original)
        const itemResposta = itensRespostas?.find(
          ir => ir.cotacao_resposta_fornecedor_id === resposta?.id && 
                (criterioJulgamento === 'por_lote' 
                  ? ir.id === item.id 
                  : ir.itens_cotacao.numero_item === item.itens_cotacao.numero_item)
        );
        
        if (itemResposta) {
          // Para critério de desconto, usar o percentual_desconto
          // Para outros critérios, usar valor monetário
          if (isDesconto) {
            // CRÍTICO: percentual_desconto pode estar no item original ou no itemResposta
            // Primeiro verificar no itemResposta, depois no item original
            let desconto = Number(itemResposta.percentual_desconto || 0);
            
            // Se não encontrou no itemResposta, tentar no item original (que vem de carregarItensVencedoresPorFornecedor)
            if (desconto === 0 && (item as any).percentual_desconto) {
              desconto = Number((item as any).percentual_desconto || 0);
            }
            
            valorTotal += desconto;
            itensVencedoresComValor.push({
              numero: item.itens_cotacao.numero_item,
              valor: desconto,
              marca: itemResposta.marca || '',
              valorUnitario: desconto
            });
          } else {
            const valorUnitario = Number(itemResposta.valor_unitario_ofertado);
            const quantidade = Number(itemResposta.itens_cotacao.quantidade);
            const valorItem = valorUnitario * quantidade;
            valorTotal += valorItem;
            itensVencedoresComValor.push({
              numero: item.itens_cotacao.numero_item,
              valor: valorItem,
              marca: itemResposta.marca || '',
              valorUnitario: valorUnitario
            });
          }
        }
      });

        return {
          razaoSocial: fData.fornecedor.razao_social,
          cnpj: resposta?.fornecedores.cnpj || "",
          itensVencedores: itensVencedoresComValor,
          valorTotal: valorTotal
        };
      });

      // Determinar qual tipo de autorização gerar
      const tipoAutorizacao = foiParaSelecao ? 'selecao_fornecedores' : 'compra_direta';
      
      let resultadoAutorizacao;
      if (foiParaSelecao) {
        // Gerar autorização para seleção de fornecedores
        resultadoAutorizacao = await gerarAutorizacaoSelecao(
          processo.numero_processo_interno,
          processo.objeto_resumido,
          usuario?.nome_completo || "",
          usuario?.cpf || ""
        );
      } else {
        // Gerar autorização para compra direta
        resultadoAutorizacao = await gerarAutorizacaoCompraDireta(
          processo.numero_processo_interno,
          processo.objeto_resumido,
          usuario?.nome_completo || "",
          usuario?.cpf || "",
          fornecedoresVencedores,
          criterioJulgamento
        );
      }

      // Salvar no banco
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      const { error: insertError } = await supabase
        .from("autorizacoes_processo")
        .insert({
          cotacao_id: cotacaoId,
          protocolo: resultadoAutorizacao.protocolo,
          tipo_autorizacao: tipoAutorizacao,
          nome_arquivo: resultadoAutorizacao.fileName,
          url_arquivo: resultadoAutorizacao.url,
          usuario_gerador_id: currentSession!.user.id,
          data_geracao: new Date().toISOString()
        });

      if (insertError) throw insertError;

      // Atualizar status da solicitação de autorização se houver
      const { error: updateSolicitacaoError } = await supabase
        .from("solicitacoes_autorizacao")
        .update({
          status: "autorizada",
          data_resposta: new Date().toISOString()
        })
        .eq("cotacao_id", cotacaoId)
        .eq("status", "pendente");

      if (updateSolicitacaoError) {
        console.error("Erro ao atualizar solicitação:", updateSolicitacaoError);
        // Não lançar erro aqui, pois a autorização foi gerada com sucesso
      }

      toast.success("Autorização gerada com sucesso!");
      await loadAutorizacoes();
    } catch (error) {
      console.error("Erro ao gerar autorização:", error);
      toast.error("Erro ao gerar autorização");
    } finally {
      setLoading(false);
    }
  };

  const enviarSolicitacaoAutorizacao = async () => {
    try {
      setLoading(true);

      // Buscar dados do processo
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select("processo_compra_id")
        .eq("id", cotacaoId)
        .single();

      if (!cotacaoData) throw new Error("Cotação não encontrada");

      const { data: processo } = await supabase
        .from("processos_compras")
        .select("numero_processo_interno")
        .eq("id", cotacaoData.processo_compra_id)
        .single();

      if (!processo) throw new Error("Processo não encontrado");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Criar solicitação
      const { error } = await supabase
        .from("solicitacoes_autorizacao")
        .insert({
          cotacao_id: cotacaoId,
          processo_numero: processo.numero_processo_interno,
          solicitante_id: user.id
        });

      if (error) throw error;

      toast.success("Solicitação enviada ao Responsável Legal com sucesso!");
    } catch (error) {
      console.error("Erro ao enviar solicitação:", error);
      toast.error("Erro ao enviar solicitação");
    } finally {
      setLoading(false);
    }
  };

  const rejeitarFornecedor = async () => {
    if (!fornecedorParaRejeitar) return;
    
    const fornData = fornecedoresData.find(f => f.fornecedor.id === fornecedorParaRejeitar);
    if (!fornData) return;

    const motivo = motivoRejeicaoFornecedor[fornecedorParaRejeitar];
    if (!motivo || motivo.trim() === "") {
      toast.error("Informe o motivo da rejeição");
      return;
    }

    // Validar itens selecionados para critérios granulares
    const permiteParcial = criterioJulgamento !== 'global';
    // CRÍTICO: Para critério por_lote, itens_afetados deve conter NÚMEROS DE LOTES, não números de itens
    const itensAfetados = permiteParcial 
      ? (criterioJulgamento === 'por_lote' || criterioJulgamento === 'lote'
          ? lotesCotacao.filter(l => lotesParaRejeitar.includes(l.id)).map(l => l.numero_lote)
          : itensParaRejeitar)
      : [];

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Salvar registro de rejeição com itens afetados
      const { error: rejeicaoError } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .insert({
          cotacao_id: cotacaoId,
          fornecedor_id: fornecedorParaRejeitar,
          motivo_rejeicao: motivo.trim(),
          usuario_rejeitou_id: user.id,
          itens_afetados: itensAfetados
        });

      if (rejeicaoError) throw rejeicaoError;

      // Marcar fornecedor como rejeitado (apenas se rejeição for total)
      // CRÍTICO: Para por_lote, verificar se todos os LOTES foram rejeitados, não todos os itens
      const ehRejeicaoTotal = criterioJulgamento === 'por_lote' || criterioJulgamento === 'lote'
        ? !permiteParcial || itensAfetados.length === 0 || itensAfetados.length === lotesCotacao.length
        : !permiteParcial || itensAfetados.length === 0 || itensAfetados.length === itensCotacao.length;
      
      if (ehRejeicaoTotal) {
        const { error } = await supabase
          .from("cotacao_respostas_fornecedor")
          .update({
            rejeitado: true,
            motivo_rejeicao: motivo.trim(),
            data_rejeicao: new Date().toISOString()
          })
          .eq("id", fornData.respostaId);

        if (error) throw error;
      }

      // CRÍTICO: Mensagem diferenciada para lotes vs itens
      const mensagemSucesso = (criterioJulgamento === 'por_lote' || criterioJulgamento === 'lote')
        ? (itensAfetados.length > 0 && itensAfetados.length < lotesCotacao.length
            ? `Fornecedor ${fornData.fornecedor.razao_social} rejeitado nos lotes: ${itensAfetados.join(', ')}`
            : `Fornecedor ${fornData.fornecedor.razao_social} rejeitado`)
        : (itensAfetados.length > 0 && itensAfetados.length < itensCotacao.length
            ? `Fornecedor ${fornData.fornecedor.razao_social} rejeitado nos itens: ${itensAfetados.join(', ')}`
            : `Fornecedor ${fornData.fornecedor.razao_social} rejeitado`);
      
      toast.success(mensagemSucesso);
      setDialogRejeicaoOpen(false);
      setFornecedorParaRejeitar(null);
      setMotivoRejeicaoFornecedor(prev => ({ ...prev, [fornecedorParaRejeitar]: "" }));
      setItensParaRejeitar([]);
      setLotesParaRejeitar([]);
      
      // Recarregar fornecedores para atualizar a lista com próximo colocado
      await loadAllFornecedores();
      await loadFornecedoresRejeitados();
    } catch (error) {
      console.error("Erro ao rejeitar fornecedor:", error);
      toast.error("Erro ao rejeitar fornecedor");
    } finally {
      setLoading(false);
    }
  };

  const finalizarProcesso = async () => {
    // Buscar se o processo foi enviado para seleção
    const { data: cotacaoCheck } = await supabase
      .from("cotacoes_precos")
      .select("enviado_para_selecao")
      .eq("id", cotacaoId)
      .single();

    const foiParaSelecao = cotacaoCheck?.enviado_para_selecao || false;
    const tipoAutorizacaoEsperado = foiParaSelecao ? 'selecao_fornecedores' : 'compra_direta';
    const nomeAutorizacao = foiParaSelecao ? 'Seleção de Fornecedores' : 'Compra Direta';

    // Verificar se existe autorização do tipo correto
    const autorizacao = autorizacoes.find(a => a.tipo_autorizacao === tipoAutorizacaoEsperado);
    if (!autorizacao) {
      toast.error(`É necessário gerar a Autorização de ${nomeAutorizacao} antes de enviar para contratação`);
      return;
    }

    // Prevenir múltiplas execuções simultâneas
    if (loading) {
      console.log("⚠️ Processo já está sendo finalizado, ignorando chamada duplicada");
      return;
    }

    try {
      setLoading(true);

      // Buscar o número do processo
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select(`
          processo_compra_id,
          processos_compras!inner(numero_processo_interno)
        `)
        .eq("id", cotacaoId)
        .single();

      if (!cotacaoData) {
        throw new Error("Cotação não encontrada");
      }

      const numeroProcesso = cotacaoData.processos_compras.numero_processo_interno;
      const processoId = cotacaoData.processo_compra_id;

      // NOTA: Snapshots de documentos NÃO são criados na finalização.
      // Snapshots só são criados quando fornecedor ATUALIZA documento que já está vinculado a processo.
      // Isso preserva a versão vigente no momento da habilitação quando o fornecedor atualiza posteriormente.
      console.log("📋 Processo finalizado - documentos dos fornecedores vencedores serão referenciados diretamente");

      // DEPOIS: Gerar PDF consolidado mesclando todos os documentos do processo
      console.log("📄 Gerando processo completo mesclado...");
      const processoCompleto = await gerarProcessoCompletoPDF(cotacaoId, numeroProcesso);
      console.log("✅ Processo completo gerado:", processoCompleto.filename);

      // Salvar o processo completo como anexo do processo
      const { data: { session } } = await supabase.auth.getSession();
      const { error: anexoError } = await supabase
        .from("anexos_processo_compra")
        .insert({
          processo_compra_id: processoId,
          tipo_anexo: "PROCESSO_COMPLETO",
          nome_arquivo: processoCompleto.filename,
          url_arquivo: processoCompleto.url,
          usuario_upload_id: session?.user.id,
          data_upload: new Date().toISOString()
        });

      if (anexoError) {
        console.error("Erro ao salvar processo completo:", anexoError);
        throw anexoError;
      }

      // Calcular valor total dos fornecedores vencedores
      let valorTotalFechamento = 0;
      
      // Para critério de desconto, não calcular valor total em reais
      if (criterioJulgamento !== "desconto") {
        fornecedoresData.forEach(fornData => {
          if (!fornData.rejeitado && fornData.itensVencedores) {
            fornData.itensVencedores.forEach(item => {
              const quantidade = item.itens_cotacao?.quantidade || 1;
              const valorUnitario = item.valor_unitario_ofertado || 0;
              valorTotalFechamento += valorUnitario * quantidade;
            });
          }
        });
      }
      
      console.log(`💰 Valor total de fechamento calculado: R$ ${valorTotalFechamento.toFixed(2)}`);

      // Atualizar status do processo para concluído e salvar valor total de fechamento
      const { error: statusError } = await supabase
        .from("processos_compras")
        .update({ 
          status_processo: "concluido",
          valor_total_cotacao: valorTotalFechamento
        })
        .eq("id", processoId);

      if (statusError) {
        console.error("Erro ao atualizar status do processo:", statusError);
      }

      const { error } = await supabase
        .from("cotacoes_precos")
        .update({
          processo_finalizado: true,
          data_finalizacao: new Date().toISOString()
        })
        .eq("id", cotacaoId);

      if (error) throw error;

      toast.success("Processo completo gerado e salvo! O PDF consolidado está disponível no menu Processos de Compras.");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao finalizar processo:", error);
      toast.error(error.message || "Erro ao finalizar processo");
    } finally {
      setLoading(false);
    }
  };

  // CRÍTICO: Ignorar fornecedores rejeitados na verificação - eles não precisam ter documentos aprovados
  const todosDocumentosAprovados = fornecedoresData
    .filter(f => !f.rejeitado && f.itensVencedores.length > 0) // Apenas fornecedores ativos com itens vencedores
    .every(f => f.todosDocumentosAprovados);

  console.log(`🖥️ RENDERIZANDO Dialog - fornecedoresData.length: ${fornecedoresData.length}, loading: ${loading}`);
  console.log(`🖥️ VERSION 2.0 - SEM FILTRO POR PLANILHA`);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                Verificar Documentação - {foiEnviadoParaSelecao ? 'Seleção de Fornecedores' : 'Compra Direta'}
              </DialogTitle>
              <DialogDescription>
                Revise os documentos de cada fornecedor vencedor e solicite documentos adicionais se necessário
              </DialogDescription>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">v2.0</Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-4">
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Carregando fornecedores...</p>
              </div>
            ) : fornecedoresData.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhum fornecedor vencedor encontrado</p>
              </div>
            ) : (
              fornecedoresData.map((fornData, index) => (
                <div key={fornData.fornecedor.id}>
                  <Card className="border-2" style={{ opacity: fornData.rejeitado ? 0.6 : 1 }}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-xl">{fornData.fornecedor.razao_social}</CardTitle>
                          {fornData.rejeitado && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Rejeitado
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {fornData.itensVencedores && fornData.itensVencedores.length > 0 && (
                            <span className="text-sm font-medium">
                              {criterioJulgamento === 'global' ? (
                                <>Vencedor</>
                              ) : criterioJulgamento === 'por_lote' ? (
                                <>
                                  Lotes vencedores: {(() => {
                                    // Agrupar itens por lote e identificar quais lotes foram ganhos
                                    const lotesVencedoresIds = new Set<string>();
                                    fornData.itensVencedores.forEach(item => {
                                      const loteId = item.itens_cotacao?.lote_id;
                                      if (loteId) lotesVencedoresIds.add(loteId);
                                    });
                                    
                                    // Mapear lote_id para número do lote
                                    const numerosLotes = Array.from(lotesVencedoresIds)
                                      .map(loteId => {
                                        const lote = lotesCotacao.find(l => l.id === loteId);
                                        return lote?.numero_lote || 0;
                                      })
                                      .filter(n => n > 0)
                                      .sort((a, b) => a - b);
                                    
                                    // Converter para romanos
                                    const toRoman = (num: number) => {
                                      const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
                                      return num <= 10 ? romanNumerals[num] : num.toString();
                                    };
                                    
                                    return numerosLotes.map(n => toRoman(n)).join(", ");
                                  })()}
                                </>
                              ) : (
                                <>
                                  Itens vencedores: {fornData.itensVencedores
                                    .map(i => i.itens_cotacao?.numero_item || i.numero_item || 'N/A')
                                    .filter(Boolean)
                                    .sort((a, b) => Number(a) - Number(b))
                                    .join(", ")}
                                </>
                              )}
                            </span>
                          )}
                          {fornData.itensRejeitados && fornData.itensRejeitados.length > 0 && (() => {
                            // Para por_lote, converter itens para lotes e EXCLUIR lotes vencedores
                            if (criterioJulgamento === 'por_lote') {
                              // Lotes vencedores do fornecedor
                              const lotesVencedores = new Set(fornData.itensVencedores.map(iv => {
                                const item = itensCotacao.find(i => i.numero_item === (iv.itens_cotacao?.numero_item || iv.numero_item));
                                const lote = lotesCotacao.find(l => l.id === item?.lote_id);
                                return lote?.numero_lote;
                              }).filter(Boolean));
                              
                              // Converter itens rejeitados para lotes
                              const lotesRejeitados = [...new Set(fornData.itensRejeitados.map(itemNum => {
                                const item = itensCotacao.find(i => i.numero_item === itemNum);
                                const lote = lotesCotacao.find(l => l.id === item?.lote_id);
                                return lote?.numero_lote;
                              }).filter(Boolean))];
                              
                              // Excluir lotes vencedores - só mostrar lotes onde REALMENTE está desabilitado
                              const lotesEfetivamenteRejeitados = lotesRejeitados
                                .filter(l => !lotesVencedores.has(l))
                                .sort((a, b) => Number(a) - Number(b));
                              
                              if (lotesEfetivamenteRejeitados.length === 0) return null;
                              
                              return (
                                <div className="mt-1">
                                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
                                    ⚠️ Lotes desabilitados (provimento parcial): {lotesEfetivamenteRejeitados.join(", ")}
                                  </Badge>
                                </div>
                              );
                            } else {
                              // Para outros critérios, excluir itens vencedores
                              const itensVencedores = new Set(fornData.itensVencedores.map(iv => 
                                iv.itens_cotacao?.numero_item || iv.numero_item
                              ).filter(Boolean));
                              
                              const itensEfetivamenteRejeitados = fornData.itensRejeitados
                                .filter(i => !itensVencedores.has(i))
                                .sort((a, b) => Number(a) - Number(b));
                              
                              if (itensEfetivamenteRejeitados.length === 0) return null;
                              
                              return (
                                <div className="mt-1">
                                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
                                    ⚠️ Itens desabilitados (provimento parcial): {itensEfetivamenteRejeitados.join(", ")}
                                  </Badge>
                                </div>
                              );
                            }
                          })()}
                          {fornData.rejeitado && fornData.motivoRejeicao && (
                            <div className="mt-2 p-2 bg-destructive/10 rounded text-sm">
                              <strong>Motivo da rejeição:</strong> {fornData.motivoRejeicao}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canEdit && !fornData.rejeitado && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setFornecedorParaRejeitar(fornData.fornecedor.id);
                              setDialogRejeicaoOpen(true);
                            }}
                          >
                            <AlertCircle className="h-4 w-4 mr-1" />
                            Rejeitar Fornecedor
                          </Button>
                        )}
                        {fornData.todosDocumentosAprovados && !fornData.rejeitado && (
                          <Badge className="bg-green-600">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Documentos Aprovados
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-6">
                    {/* Documentos Válidos em Cadastro ou Aviso de Cadastro Pendente */}
                    {fornData.documentosExistentes.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                        <h3 className="font-semibold text-yellow-900 mb-3">⚠️ Fornecedor sem Cadastro Completo</h3>
                        <p className="text-sm text-yellow-800 mb-4">
                          Este fornecedor ainda não possui cadastro completo no sistema. 
                          Envie um e-mail solicitando o cadastro com prazo para conclusão.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border-yellow-300"
                          onClick={() => {
                            const linkCadastro = `${window.location.origin}/cadastro-fornecedor`;
                            const prazo = new Date();
                            prazo.setDate(prazo.getDate() + 7); // 7 dias de prazo
                            const prazoFormatado = prazo.toLocaleDateString('pt-BR');
                            
                            const assunto = encodeURIComponent('Solicitação de Cadastro - Prima Qualitá');
                            const corpo = encodeURIComponent(
                              `Prezado(a) Fornecedor(a),\n\n` +
                              `Solicitamos que complete seu cadastro em nosso sistema até ${prazoFormatado}.\n\n` +
                              `Acesse o link abaixo para preencher o formulário de cadastro:\n` +
                              `${linkCadastro}\n\n` +
                              `O cadastro é necessário para prosseguimento do processo de contratação.\n\n` +
                              `Atenciosamente,\n` +
                              `Departamento de Compras\n` +
                              `Prima Qualitá Saúde`
                            );
                            
                            const mailtoLink = `mailto:${fornData.fornecedor.email}?subject=${assunto}&body=${corpo}`;
                            window.location.href = mailtoLink;
                            
                            toast.success(`E-mail de solicitação de cadastro preparado para ${fornData.fornecedor.razao_social}`);
                          }}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Enviar Solicitação de Cadastro por E-mail
                        </Button>
                        <div className="mt-3 p-3 bg-white rounded border border-yellow-200">
                          <p className="text-xs text-gray-600 mb-1">Link de cadastro:</p>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {window.location.origin}/cadastro-fornecedor
                          </code>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h4 className="font-semibold text-lg mb-3">📄 Documentos Válidos em Cadastro</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tipo de Documento</TableHead>
                              <TableHead>Arquivo</TableHead>
                              <TableHead>Validade</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fornData.documentosExistentes.map((doc) => {
                              const hoje = startOfDay(new Date());
                              const validade = doc.data_validade ? startOfDay(parseISO(doc.data_validade)) : null;
                              const diasRestantes = validade ? differenceInDays(validade, hoje) : null;
                              const isValido = diasRestantes !== null && diasRestantes >= 0;

                              return (
                                <TableRow key={doc.id}>
                                  <TableCell className="font-medium">{doc.tipo_documento}</TableCell>
                                  <TableCell>
                                    <a 
                                      href={doc.url_arquivo} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                    >
                                      <FileText className="h-3 w-3" />
                                      {doc.nome_arquivo}
                                    </a>
                                  </TableCell>
                                  <TableCell>
                                    {doc.data_validade ? format(parseISO(doc.data_validade), 'dd/MM/yyyy') : 'N/A'}
                                  </TableCell>
                                  <TableCell>
                                    {doc.data_validade === null ? (
                                      <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">
                                        N/A
                                      </Badge>
                                    ) : diasRestantes === null || diasRestantes < 0 ? (
                                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                                        ✗ Vencido
                                      </Badge>
                                    ) : diasRestantes <= 30 ? (
                                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                                        Vence em {diasRestantes} dias
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                        ✓ Válido
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => window.open(doc.url_arquivo, '_blank')}
                                      >
                                        <ExternalLink className="h-4 w-4 mr-1" />
                                        Visualizar
                                      </Button>
                                      {doc.data_validade !== null && !isValido && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-300"
                                          onClick={() => {
                                            setDocumentoParaAtualizar(doc);
                                            setMotivoAtualizacao("");
                                            setDialogSolicitarAtualizacao(true);
                                          }}
                                        >
                                          <Clock className="h-4 w-4 mr-1" />
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
                      </div>
                    )}

                    {/* Documentos Solicitados */}
                    {fornData.campos.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-lg mb-3">📋 Documentos Solicitados</h4>
                        <div className="space-y-3">
                          {fornData.campos.map((campo) => (
                            <Card key={campo.id} className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h5 className="font-semibold">{campo.nome_campo}</h5>
                                    {campo.obrigatorio && (
                                      <Badge variant="outline" className="text-xs">Obrigatório</Badge>
                                    )}
                                    <Badge variant={
                                      campo.status_solicitacao === "aprovado" ? "default" :
                                      campo.status_solicitacao === "em_analise" ? "secondary" :
                                      campo.status_solicitacao === "enviado" ? "secondary" :
                                      campo.status_solicitacao === "rejeitado" ? "destructive" :
                                      "outline"
                                    }>
                                      {campo.status_solicitacao === "aprovado" ? "✓ Aprovado" :
                                       campo.status_solicitacao === "em_analise" ? "⏳ Em análise" :
                                       campo.status_solicitacao === "enviado" ? "📤 Enviado (aguardando análise)" :
                                       campo.status_solicitacao === "rejeitado" ? "✗ Rejeitado" :
                                       "⚠️ Pendente (aguardando envio)"}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-2">{campo.descricao}</p>
                                  
                                  {campo.documentos_finalizacao_fornecedor && campo.documentos_finalizacao_fornecedor.length > 0 && (
                                    <div className="mt-2">
                                      {campo.documentos_finalizacao_fornecedor.map((doc) => (
                                        <div key={doc.id} className="flex items-center gap-2 text-sm">
                                          <FileText className="h-4 w-4" />
                                          <a href={doc.url_arquivo} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                            {doc.nome_arquivo}
                                          </a>
                                          <span className="text-muted-foreground text-xs">
                                            ({new Date(doc.data_upload).toLocaleDateString('pt-BR')})
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                
                                {campo.status_solicitacao === "em_analise" && (
                                  <div className="flex gap-2">
                                  {canEdit && (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => aprovarDocumento(campo.id!)}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Aprovar
                                    </Button>
                                  )}
                                  {canEdit && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => rejeitarDocumento(campo.id!)}
                                    >
                                      <AlertCircle className="h-4 w-4 mr-1" />
                                      Rejeitar
                                    </Button>
                                  )}
                                  </div>
                                )}
                                
                                <div className="flex gap-2">
                                  {campo.status_solicitacao === "aprovado" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => reverterAprovacaoDocumento(campo.id!)}
                                    >
                                      Reverter Aprovação
                                    </Button>
                                  )}
                                  {campo.status_solicitacao === "rejeitado" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={async () => {
                                        try {
                                          const { error } = await supabase
                                            .from("campos_documentos_finalizacao")
                                            .update({
                                              status_solicitacao: "em_analise",
                                              data_aprovacao: null
                                            })
                                            .eq("id", campo.id!);

                                          if (error) throw error;

                                          toast.success("Rejeição revertida");
                                          await loadAllFornecedores();
                                        } catch (error) {
                                          console.error("Erro ao reverter rejeição:", error);
                                          toast.error("Erro ao reverter rejeição");
                                        }
                                      }}
                                    >
                                      Reverter Rejeição
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={async () => {
                                      try {
                                        // PRIMEIRO: Buscar documentos associados ao campo
                                        const { data: docsAssociados } = await supabase
                                          .from("documentos_finalizacao_fornecedor")
                                          .select("url_arquivo")
                                          .eq("campo_documento_id", campo.id!);
                                        
                                        // Deletar arquivos do storage se existirem
                                        if (docsAssociados && docsAssociados.length > 0) {
                                          const pathsParaDeletar = docsAssociados
                                            .filter(d => d.url_arquivo)
                                            .map(d => {
                                              let path = d.url_arquivo;
                                              if (path.includes('/processo-anexos/')) {
                                                path = path.split('/processo-anexos/')[1];
                                              }
                                              if (path.includes('?')) {
                                                path = path.split('?')[0];
                                              }
                                              return path;
                                            })
                                            .filter(Boolean);
                                          
                                          if (pathsParaDeletar.length > 0) {
                                            await supabase.storage
                                              .from("processo-anexos")
                                              .remove(pathsParaDeletar);
                                          }
                                          
                                          // Deletar registros dos documentos
                                          await supabase
                                            .from("documentos_finalizacao_fornecedor")
                                            .delete()
                                            .eq("campo_documento_id", campo.id!);
                                        }
                                        
                                        // POR ÚLTIMO: Deletar o campo
                                        const { error } = await supabase
                                          .from("campos_documentos_finalizacao")
                                          .delete()
                                          .eq("id", campo.id!);

                                        if (error) throw error;

                                        toast.success("Solicitação excluída com sucesso");
                                        await loadAllFornecedores();
                                      } catch (error) {
                                        console.error("Erro ao excluir solicitação:", error);
                                        toast.error("Erro ao excluir solicitação");
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                        
                      </div>
                    )}

                    {/* Botões de Aprovação Geral do Fornecedor */}
                    <div className="mt-6 p-4 bg-muted/10 rounded-lg border-2 border-muted">
                      <div className="flex items-center justify-center gap-4">
                        {fornData.todosDocumentosAprovados ? (
                          <div className="flex flex-col items-center gap-3">
                            <Badge variant="default" className="text-base px-4 py-2 bg-green-600">
                              <CheckCircle className="h-5 w-5 mr-2" />
                              Documentos Aprovados
                            </Badge>
                            <Button
                              onClick={() => handleReverterAprovacaoFornecedor(fornData.fornecedor.id)}
                              variant="outline"
                              className="gap-2"
                            >
                              <AlertCircle className="h-4 w-4" />
                              Reverter Aprovação
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-2">
                            {fornData.itensRejeitados && fornData.itensRejeitados.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Aprovação válida apenas para itens: {fornData.itensVencedores
                                  .map(i => i.itens_cotacao?.numero_item || i.numero_item)
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            )}
                            <Button
                              onClick={() => handleAprovarDocumentosFornecedor(fornData.fornecedor.id)}
                              variant="default"
                              size="lg"
                              className="gap-2"
                              disabled={fornData.documentosExistentes.some(doc => !doc.em_vigor)}
                            >
                              <CheckCircle className="h-5 w-5" />
                              Aprovar Documentos do Fornecedor
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Solicitar Documentos Adicionais/Faltantes */}
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-lg mb-3">➕ Solicitar Documentos Adicionais/Faltantes</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Nome do Documento</Label>
                          <Input
                            value={novosCampos[fornData.fornecedor.id]?.nome || ""}
                            onChange={(e) => setNovosCampos(prev => ({
                              ...prev,
                              [fornData.fornecedor.id]: {
                                ...(prev[fornData.fornecedor.id] || { nome: "", descricao: "", obrigatorio: true }),
                                nome: e.target.value
                              }
                            }))}
                            placeholder="Ex: Certidão de Regularidade"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Descrição</Label>
                          <Textarea
                            value={novosCampos[fornData.fornecedor.id]?.descricao || ""}
                            onChange={(e) => setNovosCampos(prev => ({
                              ...prev,
                              [fornData.fornecedor.id]: {
                                ...(prev[fornData.fornecedor.id] || { nome: "", descricao: "", obrigatorio: true }),
                                descricao: e.target.value
                              }
                            }))}
                            placeholder="Descrição do documento solicitado"
                            rows={1}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Data Limite para Envio</Label>
                          <Input
                            type="date"
                            value={datasLimiteDocumentos[fornData.fornecedor.id] || ""}
                            onChange={(e) => setDatasLimiteDocumentos(prev => ({
                              ...prev,
                              [fornData.fornecedor.id]: e.target.value
                            }))}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <Button
                          onClick={() => adicionarCampoDocumento(fornData.fornecedor.id)}
                          disabled={
                            !novosCampos[fornData.fornecedor.id]?.nome?.trim() || 
                            !novosCampos[fornData.fornecedor.id]?.descricao?.trim() ||
                            !datasLimiteDocumentos[fornData.fornecedor.id]
                          }
                          size="sm"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar Documento
                        </Button>
                        
                        {fornData.campos.length > 0 && (
                          <Button
                            onClick={() => enviarDocumentosParaFornecedor(fornData.fornecedor.id)}
                            variant="default"
                            size="sm"
                          >
                            Enviar para Fornecedor
                          </Button>
                        )}
                      </div>
                    </div>
                    </CardContent>
                  </Card>
                </div>
              ))
            )}

            {/* Fornecedores Rejeitados */}
            {fornecedoresRejeitadosDB.length > 0 && (
              <div className="mt-6 px-6 space-y-4">
                <h3 className="text-lg font-semibold text-destructive">🚫 Fornecedores Rejeitados</h3>
                {fornecedoresRejeitadosDB.map((rejeicao) => (
                  <Card key={rejeicao.id} className="border-destructive">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{rejeicao.fornecedores.razao_social}</h4>
                        <Badge variant="destructive">Rejeitado</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <strong>CNPJ:</strong> {rejeicao.fornecedores.cnpj}
                      </p>
                      <p className="text-sm">
                        <strong>Motivo da Rejeição:</strong> {rejeicao.motivo_rejeicao}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Rejeitado em: {new Date(rejeicao.data_rejeicao).toLocaleString('pt-BR')}
                      </p>
                      {rejeicao.status_recurso !== 'sem_recurso' && (
                        <Badge variant="outline" className="mt-2">
                          Status Recurso: {rejeicao.status_recurso.replace('_', ' ').toUpperCase()}
                        </Badge>
                      )}
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRejeicaoParaReverter(rejeicao.id);
                            setDialogReversaoOpen(true);
                          }}
                          className="mt-2"
                        >
                          Reverter Rejeição
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Recursos Recebidos */}
            {recursosRecebidos.length > 0 && (
              <div className="mt-6 px-6 space-y-4">
                <h3 className="text-lg font-semibold">📄 Recursos Recebidos</h3>
                {recursosRecebidos.map((recurso) => {
                  // Buscar resposta deste recurso
                  const respostaRecurso = recursosRecebidos.find(r => r.id === recurso.id);
                  
                  return (
                    <Card key={recurso.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{recurso.fornecedores.razao_social}</h4>
                          <Badge>Recurso Enviado</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          <strong>CNPJ:</strong> {recurso.fornecedores.cnpj}
                        </p>
                        {recurso.mensagem_fornecedor && (
                          <p className="text-sm">
                            <strong>Mensagem:</strong> {recurso.mensagem_fornecedor}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Enviado em: {new Date(recurso.data_envio).toLocaleString('pt-BR')}
                        </p>
                        
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                let filePath = recurso.url_arquivo;
                                if (filePath.includes('https://')) {
                                  const urlParts = filePath.split('/processo-anexos/');
                                  filePath = urlParts[1] || filePath;
                                }
                                
                                const { data, error } = await supabase.storage
                                  .from('processo-anexos')
                                  .createSignedUrl(filePath, 3600);
                                
                                if (error) throw error;
                                if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                              } catch (error) {
                                console.error('Erro ao gerar URL:', error);
                                toast.error('Erro ao visualizar recurso');
                              }
                            }}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Visualizar Recurso
                          </Button>
                          
                          {canEdit && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setRecursoParaExcluir(recurso);
                                setConfirmDeleteRecursoOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Apagar Recurso
                            </Button>
                          )}
                          
                          {/* Verificar se já existe resposta */}
                          {canEdit && !(recurso as any).respostas_recursos?.length ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="default"
                                size="sm"
                                onClick={async () => {
                                  // Buscar rejeição associada ao recurso
                                  const { data: rej } = await supabase
                                    .from('fornecedores_rejeitados_cotacao')
                                    .select('id, itens_afetados')
                                    .eq('id', recurso.rejeicao_id)
                                    .single();
                                  setRejeicaoDoRecurso(rej);
                                  setRecursoSelecionado(recurso.id);
                                  setDecisaoRecurso('provimento');
                                  setTipoProvimento('total');
                                  setItensParaReabilitar([]);
                                  setDialogRespostaRecursoOpen(true);
                                }}
                              >
                                Dar Provimento Total
                              </Button>
                              {criterioJulgamento !== 'global' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    const { data: rej } = await supabase
                                      .from('fornecedores_rejeitados_cotacao')
                                      .select('id, itens_afetados')
                                      .eq('id', recurso.rejeicao_id)
                                      .single();
                                    setRejeicaoDoRecurso(rej);
                                    setRecursoSelecionado(recurso.id);
                                    setDecisaoRecurso('provimento');
                                    setTipoProvimento('parcial');
                                    setItensParaReabilitar([]);
                                    setDialogRespostaRecursoOpen(true);
                                  }}
                                >
                                  Dar Provimento Parcial
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setRecursoSelecionado(recurso.id);
                                  setDecisaoRecurso('negado');
                                  setTipoProvimento('total');
                                  setDialogRespostaRecursoOpen(true);
                                }}
                              >
                                Negar Provimento
                              </Button>
                            </div>
                          ) : (recurso as any).respostas_recursos?.length > 0 && (
                            <div className="w-full space-y-2 border-t pt-3 mt-2">
                              <div className="flex items-center justify-between">
                                <Badge variant={
                                  (recurso as any).respostas_recursos[0].decisao === 'provimento' || 
                                  (recurso as any).respostas_recursos[0].tipo_provimento === 'parcial' 
                                    ? 'default' 
                                    : 'destructive'
                                }>
                                  {(recurso as any).respostas_recursos[0].decisao === 'provimento' 
                                    ? ((recurso as any).respostas_recursos[0].tipo_provimento === 'parcial' 
                                        ? '⚠️ Provimento Parcial' 
                                        : '✅ Provimento Concedido')
                                    : '❌ Provimento Negado'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date((recurso as any).respostas_recursos[0].data_resposta).toLocaleString('pt-BR')}
                                </span>
                              </div>
                              {(recurso as any).respostas_recursos[0].itens_reabilitados?.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Itens reabilitados: {(recurso as any).respostas_recursos[0].itens_reabilitados.join(', ')}
                                </p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      let filePath = (recurso as any).respostas_recursos[0].url_documento;
                                      if (filePath.includes('https://')) {
                                        const urlParts = filePath.split('/processo-anexos/');
                                        filePath = urlParts[1] || filePath;
                                      }
                                      
                                      const { data, error } = await supabase.storage
                                        .from('processo-anexos')
                                        .createSignedUrl(filePath, 3600);
                                      
                                      if (error) throw error;
                                      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                                    } catch (error) {
                                      console.error('Erro ao visualizar:', error);
                                      toast.error('Erro ao visualizar resposta');
                                    }
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Visualizar
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      let filePath = (recurso as any).respostas_recursos[0].url_documento;
                                      if (filePath.includes('https://')) {
                                        const urlParts = filePath.split('/processo-anexos/');
                                        filePath = urlParts[1] || filePath;
                                      }
                                      
                                      const { data, error } = await supabase.storage
                                        .from('processo-anexos')
                                        .download(filePath);
                                      
                                      if (error) throw error;
                                      
                                      if (data) {
                                        const url = URL.createObjectURL(data);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = (recurso as any).respostas_recursos[0].nome_arquivo;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                      }
                                    } catch (error) {
                                      console.error('Erro ao baixar:', error);
                                      toast.error('Erro ao baixar resposta');
                                    }
                                  }}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Baixar
                                </Button>
                                {canEdit && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      // Buscar rejeição associada ao recurso
                                      const { data: rej } = await supabase
                                        .from('fornecedores_rejeitados_cotacao')
                                        .select('id, itens_afetados')
                                        .eq('id', recurso.rejeicao_id)
                                        .single();
                                      setRejeicaoDoRecurso(rej);
                                      setRecursoSelecionado(recurso.id);
                                      // Setar com valores da resposta existente para edição
                                      const respostaAtual = (recurso as any).respostas_recursos[0];
                                      setDecisaoRecurso(respostaAtual.decisao);
                                      setTipoProvimento(respostaAtual.tipo_provimento || 'total');
                                      setTextoRespostaRecurso(respostaAtual.texto_resposta || '');
                                      setItensParaReabilitar(respostaAtual.itens_reabilitados || []);
                                      setDialogRespostaRecursoOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar
                                  </Button>
                                )}
                                {canEdit && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      setRespostaRecursoParaExcluir(recurso);
                                      setConfirmDeleteRespostaRecursoOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Apagar Resposta
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 pb-6 pt-4 border-t shrink-0 max-h-[50vh] overflow-y-auto">
          <div className="flex flex-col w-full gap-3">
            {/* Planilha de Habilitação - Acima do Relatório Final */}
            <div className="flex flex-col gap-2">
              {canEdit && (
                <Button
                  onClick={gerarPlanilhaHabilitacao}
                  disabled={loading}
                  className="w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Gerar Planilha Final
                </Button>
              )}
              
              {planilhasHabilitacao.length > 0 && (
                <div className="flex flex-col gap-2 mt-2 max-h-32 overflow-y-auto">
                  <Label className="text-sm font-semibold">Planilhas Finais Geradas:</Label>
                  {planilhasHabilitacao.map((planilha) => (
                    <div key={planilha.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <div className="flex-1 text-sm">
                        <div className="font-medium">Protocolo: {planilha.protocolo}</div>
                        <div className="text-muted-foreground">
                          {new Date(planilha.data_geracao).toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <Button
                        onClick={() => window.open(planilha.url_arquivo, '_blank')}
                        variant="outline"
                        size="icon"
                        title="Ver Planilha"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = planilha.url_arquivo;
                          link.download = planilha.nome_arquivo;
                          link.click();
                        }}
                        variant="outline"
                        size="icon"
                        title="Baixar"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <Button
                          onClick={() => {
                            setPlanilhaHabParaExcluir(planilha);
                            setConfirmDeletePlanilhaHabOpen(true);
                          }}
                          variant="destructive"
                          size="icon"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Relatórios Finais - Qualquer gestor/colaborador pode gerar e deletar */}
            <div className="flex flex-col gap-2">
              {canEdit && (
                <Button
                  onClick={gerarRelatorio}
                  disabled={loading || !todosDocumentosAprovados}
                  className="w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Gerar Relatório Final
                </Button>
              )}
              
              {relatoriosFinais.length > 0 && (
                <div className="flex flex-col gap-2 mt-2 max-h-32 overflow-y-auto">
                  <Label className="text-sm font-semibold">Relatórios Finais Gerados:</Label>
                  {relatoriosFinais.map((relatorio) => (
                    <div key={relatorio.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <div className="flex-1 text-sm">
                        <div className="font-medium">Protocolo: {relatorio.protocolo}</div>
                        <div className="text-muted-foreground">
                          {new Date(relatorio.data_geracao).toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <Button
                        onClick={() => window.open(relatorio.url_arquivo, '_blank')}
                        variant="outline"
                        size="icon"
                        title="Ver Relatório"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = relatorio.url_arquivo;
                          link.download = relatorio.nome_arquivo;
                          link.click();
                        }}
                        variant="outline"
                        size="icon"
                        title="Baixar"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <Button
                          onClick={() => {
                            setRelatorioParaExcluir(relatorio);
                            setConfirmDeleteRelatorioOpen(true);
                          }}
                          variant="destructive"
                          size="icon"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Encaminhamento para Contabilidade - Após Relatório Final */}
            {relatoriosFinais.length > 0 && (
              <div className="flex flex-col gap-2">
                {canEdit && (
                  <Button
                    onClick={gerarEncaminhamentoContabilidade}
                    disabled={loading}
                    className="w-full"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Gerar Encaminhamento para Contabilidade
                  </Button>
                )}
                
                {encaminhamentosContabilidade.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2 max-h-32 overflow-y-auto">
                    <Label className="text-sm font-semibold">Encaminhamentos para Contabilidade:</Label>
                    {encaminhamentosContabilidade.map((enc) => (
                      <div key={enc.id} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                        <div className="flex-1 text-sm">
                          <div className="font-medium">Protocolo: {enc.protocolo}</div>
                          <div className="text-muted-foreground">
                            {new Date(enc.data_geracao).toLocaleString('pt-BR')}
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {enc.enviado_contabilidade && (
                              <Badge variant="default">Enviado à Contabilidade</Badge>
                            )}
                            {enc.respondido_contabilidade && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Respondido</Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={async () => {
                            try {
                              let filePath = enc.storage_path || enc.url_arquivo;
                              if (filePath.includes('https://')) {
                                const urlParts = filePath.split('/processo-anexos/');
                                filePath = urlParts[1] || filePath;
                              }
                              const { data, error } = await supabase.storage
                                .from('processo-anexos')
                                .createSignedUrl(filePath, 3600);
                              if (error) throw error;
                              if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                            } catch (error) {
                              console.error('Erro:', error);
                              toast.error('Erro ao visualizar');
                            }
                          }}
                          variant="outline"
                          size="icon"
                          title="Ver Encaminhamento"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={async () => {
                            try {
                              let filePath = enc.storage_path || enc.url_arquivo;
                              if (filePath.includes('https://')) {
                                const urlParts = filePath.split('/processo-anexos/');
                                filePath = urlParts[1] || filePath;
                              }
                              const { data, error } = await supabase.storage
                                .from('processo-anexos')
                                .download(filePath);
                              if (error) throw error;
                              if (data) {
                                const url = URL.createObjectURL(data);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = enc.nome_arquivo;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }
                            } catch (error) {
                              console.error('Erro:', error);
                              toast.error('Erro ao baixar');
                            }
                          }}
                          variant="outline"
                          size="icon"
                          title="Baixar"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {canEdit && !enc.enviado_contabilidade && (
                          <Button
                            onClick={() => enviarParaContabilidade(enc.id)}
                            variant="default"
                            size="sm"
                            title="Enviar à Contabilidade"
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Enviar
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            onClick={() => {
                              setEncContabParaExcluir(enc);
                              setConfirmDeleteEncContabOpen(true);
                            }}
                            variant="destructive"
                            size="icon"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      
                      {/* PDF de Resposta da Contabilidade */}
                      {enc.respondido_contabilidade && enc.url_resposta_pdf && (
                        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md ml-4">
                          <div className="flex-1 text-sm">
                            <div className="font-medium text-green-700">📄 Resposta da Contabilidade</div>
                            <div className="text-green-600 text-xs">
                              Protocolo: {enc.protocolo_resposta}
                            </div>
                            {enc.data_resposta_contabilidade && (
                              <div className="text-green-600 text-xs">
                                {new Date(enc.data_resposta_contabilidade).toLocaleString('pt-BR')}
                              </div>
                            )}
                          </div>
                          <Button
                            onClick={async () => {
                              try {
                                let filePath = enc.storage_path_resposta || enc.url_resposta_pdf;
                                if (filePath.includes('https://')) {
                                  const urlParts = filePath.split('/processo-anexos/');
                                  filePath = urlParts[1] || filePath;
                                }
                                const { data, error } = await supabase.storage
                                  .from('processo-anexos')
                                  .createSignedUrl(filePath, 3600);
                                if (error) throw error;
                                if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                              } catch (error) {
                                console.error('Erro:', error);
                                toast.error('Erro ao visualizar resposta');
                              }
                            }}
                            variant="outline"
                            size="icon"
                            title="Ver Resposta"
                            className="border-green-300 hover:bg-green-100"
                          >
                            <Eye className="h-4 w-4 text-green-700" />
                          </Button>
                          <Button
                            onClick={async () => {
                              try {
                                let filePath = enc.storage_path_resposta || enc.url_resposta_pdf;
                                if (filePath.includes('https://')) {
                                  const urlParts = filePath.split('/processo-anexos/');
                                  filePath = urlParts[1] || filePath;
                                }
                                const { data, error } = await supabase.storage
                                  .from('processo-anexos')
                                  .download(filePath);
                                if (error) throw error;
                                if (data) {
                                  const url = URL.createObjectURL(data);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `resposta_contabilidade_${enc.protocolo_resposta}.pdf`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                }
                              } catch (error) {
                                console.error('Erro:', error);
                                toast.error('Erro ao baixar resposta');
                              }
                            }}
                            variant="outline"
                            size="icon"
                            title="Baixar Resposta"
                            className="border-green-300 hover:bg-green-100"
                          >
                            <Download className="h-4 w-4 text-green-700" />
                          </Button>
                        </div>
                      )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Solicitação de Autorização - Qualquer usuário interno pode solicitar */}
            {relatoriosFinais.length > 0 && (
              <Button
                onClick={enviarSolicitacaoAutorizacao}
                disabled={loading}
                className="w-full"
                variant="outline"
              >
                <Send className="h-4 w-4 mr-2" />
                Enviar ao Responsável Legal
              </Button>
            )}
            
            {/* Autorizações - APENAS Responsável Legal pode gerar */}
            {relatoriosFinais.length > 0 && (
              <div className="flex flex-col gap-2">
                {isResponsavelLegal ? (
                  <>
                    <div className="mb-2 p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                      ✓ Você tem permissão para gerar Autorização
                    </div>
                    <Button
                      onClick={gerarAutorizacao}
                      disabled={loading}
                      className="w-full"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Gerar Autorização de {foiEnviadoParaSelecao ? 'Seleção de Fornecedores' : 'Compra Direta'}
                    </Button>
                  </>
                ) : (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                      Apenas Responsáveis Legais podem gerar Autorização de Compra Direta
                    </p>
                  </div>
                )}

                {/* Autorizações - VISÍVEL para QUALQUER usuário interno, excluir apenas Responsável Legal */}
                {autorizacoes.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2 max-h-32 overflow-y-auto">
                    <Label className="text-sm font-semibold">Autorizações Geradas:</Label>
                    {autorizacoes.map((aut) => (
                      <div key={aut.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                        <div className="flex-1 text-sm">
                          <div className="font-medium">Protocolo: {aut.protocolo}</div>
                          <div className="text-muted-foreground">
                            {new Date(aut.data_geracao).toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <Button
                          onClick={() => window.open(aut.url_arquivo, '_blank')}
                          variant="outline"
                          size="icon"
                          title="Ver Autorização"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = aut.url_arquivo;
                            link.download = aut.nome_arquivo;
                            link.click();
                          }}
                          variant="outline"
                          size="icon"
                          title="Baixar"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {isResponsavelLegal && (
                          <Button
                            onClick={() => {
                              setAutorizacaoParaExcluir(aut);
                              setConfirmDeleteAutorizacaoOpen(true);
                            }}
                            variant="destructive"
                            size="icon"
                            title="Excluir Autorização"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Botões de Ação */}
            <div className="flex gap-3 px-4 pb-4">
              <Button onClick={() => onOpenChange(false)} variant="outline" className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={() => setConfirmFinalizarOpen(true)}
                disabled={loading || relatoriosFinais.length === 0 || autorizacoes.length === 0}
                className="flex-1"
              >
                Finalizar Processo
              </Button>
            </div>
          </div>
        </DialogFooter>

        {/* Dialog de Rejeição de Fornecedor */}
        <Dialog open={dialogRejeicaoOpen} onOpenChange={setDialogRejeicaoOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Rejeitar Fornecedor</DialogTitle>
              <DialogDescription>
                Informe o motivo da rejeição do fornecedor. Os itens serão redistribuídos automaticamente para o próximo colocado.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="motivo-rejeicao">Motivo da Rejeição *</Label>
                <Textarea
                  id="motivo-rejeicao"
                  placeholder="Ex: Documentação incompleta, fornecedor desistiu da proposta, etc."
                  value={fornecedorParaRejeitar ? (motivoRejeicaoFornecedor[fornecedorParaRejeitar] || "") : ""}
                  onChange={(e) => {
                    if (fornecedorParaRejeitar) {
                      setMotivoRejeicaoFornecedor(prev => ({
                        ...prev,
                        [fornecedorParaRejeitar]: e.target.value
                      }));
                    }
                  }}
                  rows={4}
                />
              </div>
              
              {/* Seleção de itens para rejeição parcial */}
              {criterioJulgamento !== 'global' && (
                <div className="space-y-2 border-t pt-4">
                  <Label className="font-medium">
                    {criterioJulgamento === 'por_lote' || criterioJulgamento === 'lote' 
                      ? 'Selecione os Lotes a rejeitar (deixe vazio para rejeição total)'
                      : 'Selecione os Itens a rejeitar (deixe vazio para rejeição total)'}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se nenhum item/lote for selecionado, o fornecedor será rejeitado em todos os itens.
                  </p>
                  
                  {criterioJulgamento === 'por_lote' || criterioJulgamento === 'lote' ? (
                    <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                      {lotesCotacao.map((lote) => (
                        <div key={lote.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`lote-${lote.id}`}
                            checked={lotesParaRejeitar.includes(lote.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setLotesParaRejeitar(prev => [...prev, lote.id]);
                              } else {
                                setLotesParaRejeitar(prev => prev.filter(l => l !== lote.id));
                              }
                            }}
                            className="rounded"
                          />
                          <label htmlFor={`lote-${lote.id}`} className="text-sm">
                            Lote {lote.numero_lote}: {lote.descricao_lote}
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                      {itensCotacao.map((item) => (
                        <div key={item.numero_item} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`item-${item.numero_item}`}
                            checked={itensParaRejeitar.includes(item.numero_item)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setItensParaRejeitar(prev => [...prev, item.numero_item]);
                              } else {
                                setItensParaRejeitar(prev => prev.filter(i => i !== item.numero_item));
                              }
                            }}
                            className="rounded"
                          />
                          <label htmlFor={`item-${item.numero_item}`} className="text-sm">
                            Item {item.numero_item}: {item.descricao.substring(0, 50)}...
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setDialogRejeicaoOpen(false);
                setFornecedorParaRejeitar(null);
                setItensParaRejeitar([]);
                setLotesParaRejeitar([]);
              }}>
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={rejeitarFornecedor}
                disabled={!fornecedorParaRejeitar || !motivoRejeicaoFornecedor[fornecedorParaRejeitar]?.trim()}
              >
                Confirmar Rejeição
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Resposta de Recurso */}
        <Dialog open={dialogRespostaRecursoOpen} onOpenChange={(open) => {
          setDialogRespostaRecursoOpen(open);
          if (!open) {
            setRecursoSelecionado(null);
            setDecisaoRecurso(null);
            setTextoRespostaRecurso("");
            setTipoProvimento('total');
            setItensParaReabilitar([]);
            setRejeicaoDoRecurso(null);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {decisaoRecurso === 'negado' 
                  ? '❌ Negar Provimento ao Recurso' 
                  : tipoProvimento === 'parcial'
                    ? '⚠️ Dar Provimento Parcial ao Recurso'
                    : '✅ Dar Provimento Total ao Recurso'}
              </DialogTitle>
              <DialogDescription>
                Escreva a fundamentação da decisão. Será gerado um documento oficial com certificação digital.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Seleção do tipo de decisão */}
              <div className="space-y-2">
                <Label className="font-medium">Tipo de Decisão</Label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="tipo-decisao"
                      checked={decisaoRecurso === 'provimento' && tipoProvimento === 'total'}
                      onChange={() => {
                        setDecisaoRecurso('provimento');
                        setTipoProvimento('total');
                        setItensParaReabilitar([]);
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">✅ Dar Provimento Total</span>
                  </label>
                  {criterioJulgamento !== 'global' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="tipo-decisao"
                        checked={decisaoRecurso === 'provimento' && tipoProvimento === 'parcial'}
                        onChange={() => {
                          setDecisaoRecurso('provimento');
                          setTipoProvimento('parcial');
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">⚠️ Dar Provimento Parcial</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="tipo-decisao"
                      checked={decisaoRecurso === 'negado'}
                      onChange={() => {
                        setDecisaoRecurso('negado');
                        setTipoProvimento('total');
                        setItensParaReabilitar([]);
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">❌ Negar Provimento</span>
                  </label>
                </div>
              </div>

              {/* Seleção de itens/lotes para provimento parcial */}
              {tipoProvimento === 'parcial' && decisaoRecurso === 'provimento' && (
                <div className="space-y-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200">
                  <Label className="font-medium text-yellow-800 dark:text-yellow-200">
                    {criterioJulgamento === 'por_lote' 
                      ? 'Selecione os lotes a serem reabilitados:'
                      : 'Selecione os itens a serem reabilitados:'}
                  </Label>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    {criterioJulgamento === 'por_lote'
                      ? 'Lotes marcados serão reabilitados. Lotes não marcados permanecerão inabilitados.'
                      : 'Itens marcados serão reabilitados. Itens não marcados permanecerão inabilitados.'}
                  </p>
                  {(() => {
                    // Para por_lote, mostrar lotes; caso contrário, mostrar apenas os itens que foram inabilitados
                    if (criterioJulgamento === 'por_lote') {
                      // Mostrar lotes que foram inabilitados (baseado nos itens_afetados da rejeição)
                      const itensInabilitados = rejeicaoDoRecurso?.itens_afetados || [];
                      // Encontrar lotes que contêm itens inabilitados
                      const lotesInabilitados = lotesCotacao.filter(lote => {
                        const itensDesseLote = itensCotacao.filter(i => i.lote_id === lote.id);
                        return itensDesseLote.some(item => itensInabilitados.includes(item.numero_item));
                      });
                      
                      // Se não há lotes específicos inabilitados, mostrar todos os lotes
                      const lotesParaExibir = lotesInabilitados.length > 0 ? lotesInabilitados : lotesCotacao;
                      const todosLotesIds = lotesParaExibir.map(l => l.id);
                      const todosSelecionados = todosLotesIds.length > 0 && todosLotesIds.every(id => lotesParaRejeitar.includes(id));
                      
                      return (
                        <div className="border rounded-md bg-white dark:bg-gray-900">
                          {/* Marcar todos */}
                          <div className="flex items-center gap-2 p-2 border-b bg-muted/50">
                            <input
                              type="checkbox"
                              id="marcar-todos-lotes-reabilitar"
                              checked={todosSelecionados}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setLotesParaRejeitar(todosLotesIds);
                                  // Também atualizar itens para reabilitar com todos os itens dos lotes selecionados
                                  const todosItens = lotesParaExibir.flatMap(lote => 
                                    itensCotacao.filter(i => i.lote_id === lote.id).map(i => i.numero_item)
                                  );
                                  setItensParaReabilitar(todosItens);
                                } else {
                                  setLotesParaRejeitar([]);
                                  setItensParaReabilitar([]);
                                }
                              }}
                              className="rounded"
                            />
                            <label htmlFor="marcar-todos-lotes-reabilitar" className="text-sm font-medium cursor-pointer">
                              Marcar todos ({lotesParaExibir.length} lotes)
                            </label>
                          </div>
                          
                          {/* Lista de lotes */}
                          <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                            {lotesParaExibir.map((lote) => (
                              <div key={lote.id} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`reabilitar-lote-${lote.id}`}
                                  checked={lotesParaRejeitar.includes(lote.id)}
                                  onChange={(e) => {
                                    const itensDoLote = itensCotacao.filter(i => i.lote_id === lote.id).map(i => i.numero_item);
                                    if (e.target.checked) {
                                      setLotesParaRejeitar(prev => [...prev, lote.id]);
                                      setItensParaReabilitar(prev => [...new Set([...prev, ...itensDoLote])]);
                                    } else {
                                      setLotesParaRejeitar(prev => prev.filter(id => id !== lote.id));
                                      setItensParaReabilitar(prev => prev.filter(i => !itensDoLote.includes(i)));
                                    }
                                  }}
                                  className="rounded"
                                />
                                <label htmlFor={`reabilitar-lote-${lote.id}`} className="text-sm">
                                  Lote {lote.numero_lote}: {lote.descricao_lote.substring(0, 50)}...
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    } else {
                      // Para outros critérios, mostrar apenas itens que foram inabilitados
                      const itensInabilitados = rejeicaoDoRecurso?.itens_afetados || [];
                      // Se a rejeição tem itens específicos, mostrar apenas esses; senão mostrar todos
                      const itensParaExibir = itensInabilitados.length > 0 
                        ? itensCotacao.filter(i => itensInabilitados.includes(i.numero_item))
                        : itensCotacao;
                      const todosNumeros = itensParaExibir.map(i => i.numero_item);
                      const todosSelecionados = todosNumeros.length > 0 && todosNumeros.every(n => itensParaReabilitar.includes(n));
                      
                      return (
                        <div className="border rounded-md bg-white dark:bg-gray-900">
                          {/* Marcar todos */}
                          <div className="flex items-center gap-2 p-2 border-b bg-muted/50">
                            <input
                              type="checkbox"
                              id="marcar-todos-reabilitar"
                              checked={todosSelecionados}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setItensParaReabilitar(todosNumeros);
                                } else {
                                  setItensParaReabilitar([]);
                                }
                              }}
                              className="rounded"
                            />
                            <label htmlFor="marcar-todos-reabilitar" className="text-sm font-medium cursor-pointer">
                              Marcar todos ({todosNumeros.length} itens)
                            </label>
                          </div>
                          
                          {/* Lista de itens */}
                          <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                            {itensParaExibir.map((item) => (
                              <div key={item.numero_item} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`reabilitar-${item.numero_item}`}
                                  checked={itensParaReabilitar.includes(item.numero_item)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setItensParaReabilitar(prev => [...prev, item.numero_item]);
                                    } else {
                                      setItensParaReabilitar(prev => prev.filter(i => i !== item.numero_item));
                                    }
                                  }}
                                  className="rounded"
                                />
                                <label htmlFor={`reabilitar-${item.numero_item}`} className="text-sm">
                                  Item {item.numero_item}: {item.descricao.substring(0, 50)}...
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  })()}
                  {itensParaReabilitar.length === 0 && (
                    <p className="text-xs text-red-500">
                      {criterioJulgamento === 'por_lote' 
                        ? 'Selecione ao menos um lote para reabilitar'
                        : 'Selecione ao menos um item para reabilitar'}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="texto-resposta">Fundamentação *</Label>
                <Textarea
                  id="texto-resposta"
                  placeholder="Descreva a fundamentação da decisão..."
                  value={textoRespostaRecurso}
                  onChange={(e) => setTextoRespostaRecurso(e.target.value)}
                  rows={10}
                  className="min-h-[200px]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogRespostaRecursoOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={async () => {
                  if (!recursoSelecionado || !decisaoRecurso || !textoRespostaRecurso.trim()) {
                    toast.error("Preencha a fundamentação da decisão");
                    return;
                  }
                  
                  if (tipoProvimento === 'parcial' && itensParaReabilitar.length === 0) {
                    toast.error("Selecione ao menos um item para reabilitar");
                    return;
                  }

                  setLoading(true);
                  
                  // Variáveis para controle de limpeza em caso de erro
                  let pdfResultForCleanup: { url: string; fileName: string; protocolo: string; storagePath: string } | null = null;
                  let dbUpdateSuccess = false;
                  
                  // Função auxiliar para extrair path limpo do storage
                  const extractStoragePath = (url: string): string | null => {
                    if (!url) return null;
                    let path = url;
                    path = path.split('?')[0];
                    if (path.includes('/processo-anexos/')) {
                      path = path.split('/processo-anexos/')[1];
                    } else if (path.includes('processo-anexos/')) {
                      path = path.split('processo-anexos/')[1];
                    }
                    return path || null;
                  };
                  
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error("Usuário não autenticado");

                    const { data: perfil, error: perfilError } = await supabase
                      .from('profiles')
                      .select('nome_completo, cpf')
                      .eq('id', user.id)
                      .single();

                    if (perfilError || !perfil) throw new Error("Perfil não encontrado");

                    const { data: cotacao, error: cotacaoError } = await supabase
                      .from('cotacoes_precos')
                      .select(`
                        id,
                        processos_compras!inner(numero_processo_interno)
                      `)
                      .eq('id', cotacaoId)
                      .single();

                    if (cotacaoError) throw cotacaoError;

                    const numeroProcesso = (cotacao as any)?.processos_compras?.numero_processo_interno || '';

                    const recurso = recursosRecebidos.find(r => r.id === recursoSelecionado);
                    const fornecedorNome = recurso?.fornecedores?.razao_social || '';

                    // BUSCAR DIRETAMENTE DO BANCO SE JÁ EXISTE RESPOSTA (evita problema de estado desatualizado)
                    const { data: respostaExistenteDB } = await supabase
                      .from('respostas_recursos')
                      .select('id, url_documento')
                      .eq('recurso_id', recursoSelecionado)
                      .maybeSingle();
                    
                    console.log('[Recurso] Busca direta no banco - resposta existente:', respostaExistenteDB);

                    // Determinar decisão final para o PDF
                    const decisaoFinal = tipoProvimento === 'parcial' ? 'provimento_parcial' : decisaoRecurso;

                    const pdfResult = await gerarRespostaRecursoPDF(
                      decisaoFinal as any,
                      textoRespostaRecurso,
                      perfil.nome_completo,
                      perfil.cpf,
                      fornecedorNome,
                      numeroProcesso
                    );
                    
                    // Guardar para limpeza em caso de erro
                    pdfResultForCleanup = pdfResult;

                    // Guardar URL antiga para deletar DEPOIS do UPDATE bem sucedido
                    let oldFilePathToDelete: string | null = null;
                    
                    // USAR DADOS DO BANCO (respostaExistenteDB) ao invés do estado
                    if (respostaExistenteDB && respostaExistenteDB.id) {
                      // É EDIÇÃO - extrair path antigo ANTES de qualquer operação
                      oldFilePathToDelete = extractStoragePath(respostaExistenteDB.url_documento);
                      console.log('[Recurso] Path antigo extraído:', oldFilePathToDelete);
                      console.log('[Recurso] URL antiga completa:', respostaExistenteDB.url_documento);
                      
                      console.log('[Recurso] Atualizando resposta existente ID:', respostaExistenteDB.id);
                      const { error: updateError, data: updateData } = await supabase
                        .from('respostas_recursos')
                        .update({
                          decisao: decisaoRecurso,
                          texto_resposta: textoRespostaRecurso,
                          url_documento: pdfResult.url,
                          nome_arquivo: pdfResult.fileName,
                          protocolo: pdfResult.protocolo,
                          usuario_respondeu_id: user.id,
                          tipo_provimento: tipoProvimento,
                          itens_reabilitados: tipoProvimento === 'parcial' ? itensParaReabilitar : [],
                          data_resposta: new Date().toISOString()
                        })
                        .eq('id', respostaExistenteDB.id)
                        .select();

                      if (updateError) {
                        console.error('[Recurso] Erro no UPDATE:', updateError);
                        throw updateError;
                      }
                      
                      // UPDATE bem sucedido - marcar flag
                      dbUpdateSuccess = true;
                      console.log('[Recurso] UPDATE bem sucedido:', updateData);
                      
                      // Extrair path do novo arquivo
                      const newFilePath = extractStoragePath(pdfResult.url);
                      console.log('[Recurso] Path novo:', newFilePath);
                      
                      // Deletar arquivo antigo APÓS UPDATE bem sucedido (se for diferente do novo)
                      if (oldFilePathToDelete && newFilePath && oldFilePathToDelete !== newFilePath) {
                        console.log('[Recurso] Deletando arquivo antigo:', oldFilePathToDelete);
                        const { error: deleteError } = await supabase.storage.from('processo-anexos').remove([oldFilePathToDelete]);
                        if (deleteError) {
                          console.warn('[Recurso] Aviso: Não foi possível deletar arquivo antigo:', deleteError);
                        } else {
                          console.log('[Recurso] Arquivo antigo deletado com sucesso');
                        }
                      } else {
                        console.log('[Recurso] Paths iguais ou inválidos, nenhum arquivo deletado');
                      }
                    } else {
                      // É NOVA RESPOSTA - fazer INSERT
                      console.log('[Recurso] Criando nova resposta para recurso:', recursoSelecionado);
                      const { error: insertError } = await supabase
                        .from('respostas_recursos')
                        .insert({
                          recurso_id: recursoSelecionado,
                          decisao: decisaoRecurso,
                          texto_resposta: textoRespostaRecurso,
                          url_documento: pdfResult.url,
                          nome_arquivo: pdfResult.fileName,
                          protocolo: pdfResult.protocolo,
                          usuario_respondeu_id: user.id,
                          tipo_provimento: tipoProvimento,
                          itens_reabilitados: tipoProvimento === 'parcial' ? itensParaReabilitar : []
                        });

                      if (insertError) {
                        console.error('[Recurso] Erro no INSERT:', insertError);
                        throw insertError;
                      }
                      
                      // INSERT bem sucedido - marcar flag
                      dbUpdateSuccess = true;
                    }

                    // Atualizar itens_afetados na rejeição de acordo com a nova decisão
                    const fornecedorId = recurso.fornecedor_id;
                    
                    // Se provimento (total ou parcial), atualizar rejeição
                    if (decisaoRecurso === 'provimento') {
                      if (tipoProvimento === 'total') {
                        // Provimento total: reverter rejeição completamente
                        await supabase
                          .from('fornecedores_rejeitados_cotacao')
                          .update({ 
                            revertido: true, 
                            itens_afetados: [],
                            motivo_reversao: `Provimento total concedido: ${textoRespostaRecurso.substring(0, 100)}...`,
                            data_reversao: new Date().toISOString(),
                            usuario_reverteu_id: user.id
                          })
                          .eq('id', recurso.rejeicao_id);
                        
                        // Atualizar resposta do fornecedor
                        await supabase
                          .from('cotacao_respostas_fornecedor')
                          .update({ rejeitado: false, motivo_rejeicao: null, data_rejeicao: null })
                          .eq('fornecedor_id', fornecedorId)
                          .eq('cotacao_id', cotacaoId);
                      } else {
                        // Provimento parcial: atualizar itens_afetados
                        // Buscar resposta do fornecedor
                        const { data: respostaFornecedor } = await supabase
                          .from('cotacao_respostas_fornecedor')
                          .select('id')
                          .eq('fornecedor_id', fornecedorId)
                          .eq('cotacao_id', cotacaoId)
                          .single();
                        
                        // Buscar itens da proposta do fornecedor com join para pegar numero_item
                        const { data: itensFornecedor } = await supabase
                          .from('respostas_itens_fornecedor')
                          .select('item_cotacao_id, itens_cotacao!inner(numero_item)')
                          .eq('cotacao_resposta_fornecedor_id', respostaFornecedor?.id || '');
                        
                        // Itens da proposta do fornecedor
                        const itensDoFornecedor = itensFornecedor?.map(i => (i.itens_cotacao as any)?.numero_item).filter(Boolean) || [];
                        
                        // Itens rejeitados = itens da proposta que NÃO estão marcados para reabilitar
                        const itensAindaRejeitados = itensDoFornecedor.filter((item: number) => !itensParaReabilitar.includes(item));
                        
                        console.log('Provimento parcial - itens do fornecedor:', itensDoFornecedor);
                        console.log('Provimento parcial - itens para reabilitar:', itensParaReabilitar);
                        console.log('Provimento parcial - itens ainda rejeitados:', itensAindaRejeitados);
                        
                        if (itensAindaRejeitados.length === 0) {
                          // Todos os itens foram reabilitados, reverter completamente
                          await supabase
                            .from('fornecedores_rejeitados_cotacao')
                            .update({ 
                              revertido: true,
                              itens_afetados: [],
                              motivo_reversao: `Provimento parcial concedeu todos os itens`,
                              data_reversao: new Date().toISOString(),
                              usuario_reverteu_id: user.id
                            })
                            .eq('id', recurso.rejeicao_id);
                          
                          await supabase
                            .from('cotacao_respostas_fornecedor')
                            .update({ rejeitado: false, motivo_rejeicao: null, data_rejeicao: null })
                            .eq('fornecedor_id', fornecedorId)
                            .eq('cotacao_id', cotacaoId);
                        } else {
                          // Atualizar itens afetados com os que permanecem rejeitados
                          await supabase
                            .from('fornecedores_rejeitados_cotacao')
                            .update({ 
                              itens_afetados: itensAindaRejeitados,
                              motivo_reversao: `Provimento parcial: reabilitados itens ${itensParaReabilitar.join(', ')}`,
                              data_reversao: new Date().toISOString(),
                              usuario_reverteu_id: user.id
                            })
                            .eq('id', recurso.rejeicao_id);
                        }
                      }
                    }

                    toast.success('Resposta de recurso registrada com sucesso!');
                    setDialogRespostaRecursoOpen(false);
                    setRecursoSelecionado(null);
                    setDecisaoRecurso(null);
                    setTextoRespostaRecurso('');
                    setTipoProvimento('total');
                    setItensParaReabilitar([]);
                    await loadRecursos();
                    await loadAllFornecedores();
                    await loadFornecedoresRejeitados();
                  } catch (error) {
                    console.error('Erro ao gerar resposta:', error);
                    
                    // Se o arquivo foi criado mas o banco NÃO foi atualizado, deletar arquivo órfão
                    if (pdfResultForCleanup && !dbUpdateSuccess) {
                      const orphanPath = extractStoragePath(pdfResultForCleanup.url);
                      if (orphanPath) {
                        console.log('[Recurso] Deletando arquivo órfão após erro:', orphanPath);
                        await supabase.storage.from('processo-anexos').remove([orphanPath]);
                      }
                    }
                    
                    toast.error('Erro ao gerar resposta de recurso');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={!textoRespostaRecurso.trim() || loading || (tipoProvimento === 'parcial' && itensParaReabilitar.length === 0)}
              >
                {decisaoRecurso === 'negado' 
                  ? 'Negar Provimento' 
                  : tipoProvimento === 'parcial' 
                    ? 'Dar Provimento Parcial'
                    : 'Dar Provimento Total'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog para Reverter Rejeição */}
        <Dialog open={dialogReversaoOpen} onOpenChange={setDialogReversaoOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Reverter Rejeição de Fornecedor</DialogTitle>
              <DialogDescription>
                Informe o motivo da reversão da rejeição. Esta ação reabilitará o fornecedor como vencedor.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="motivo-reversao">Motivo da Reversão *</Label>
                <Textarea
                  id="motivo-reversao"
                  placeholder="Descreva o motivo pelo qual está revertendo a rejeição..."
                  value={motivoReversao}
                  onChange={(e) => setMotivoReversao(e.target.value)}
                  rows={6}
                  className="min-h-[120px]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setDialogReversaoOpen(false);
                setMotivoReversao("");
                setRejeicaoParaReverter(null);
              }}>
                Cancelar
              </Button>
              <Button 
                onClick={async () => {
                  if (!motivoReversao.trim()) {
                    toast.error("Informe o motivo da reversão");
                    return;
                  }

                  if (!rejeicaoParaReverter) {
                    toast.error("Rejeição não identificada");
                    return;
                  }

                  try {
                    console.log('🔄 INICIANDO REVERSÃO:', rejeicaoParaReverter);
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error("Usuário não autenticado");

                    // Buscar o fornecedor_id da rejeição
                    const { data: rejeicaoData, error: fetchError } = await supabase
                      .from('fornecedores_rejeitados_cotacao')
                      .select('fornecedor_id, cotacao_id')
                      .eq('id', rejeicaoParaReverter)
                      .single();

                    if (fetchError) {
                      console.error('❌ ERRO ao buscar rejeição:', fetchError);
                      throw fetchError;
                    }
                    console.log('📋 Dados da rejeição:', rejeicaoData);

                    // PASSO 1: Atualizar resposta do fornecedor para NÃO rejeitado (SEM .single() pois pode não existir)
                    console.log('🔄 ATUALIZANDO cotacao_respostas_fornecedor...');
                    const { data: respostasAtualizadas, error: respostaError } = await supabase
                      .from('cotacao_respostas_fornecedor')
                      .update({
                        rejeitado: false,
                        motivo_rejeicao: null,
                        data_rejeicao: null
                      })
                      .eq('fornecedor_id', rejeicaoData.fornecedor_id)
                      .eq('cotacao_id', rejeicaoData.cotacao_id)
                      .select('id, fornecedor_id, rejeitado');

                    if (respostaError) {
                      console.error('❌ ERRO CRÍTICO ao atualizar resposta:', respostaError);
                      throw respostaError;
                    }
                    
                    if (respostasAtualizadas && respostasAtualizadas.length > 0) {
                      console.log('✅ RESPOSTA ATUALIZADA:', respostasAtualizadas[0]);
                      console.log('✅ Campo rejeitado agora é:', respostasAtualizadas[0]?.rejeitado);
                    } else {
                      console.log('⚠️ Nenhuma resposta de cotação encontrada para atualizar (pode ser rejeição apenas por documentação)');
                    }

                    // PASSO 2: Marcar rejeição como revertida
                    console.log('🔄 Marcando rejeição como revertida...');
                    const { error: rejeicaoError } = await supabase
                      .from('fornecedores_rejeitados_cotacao')
                      .update({
                        revertido: true,
                        usuario_reverteu_id: user.id,
                        data_reversao: new Date().toISOString(),
                        motivo_reversao: motivoReversao.trim()
                      })
                      .eq('id', rejeicaoParaReverter);

                    if (rejeicaoError) {
                      console.error('❌ Erro ao marcar rejeição:', rejeicaoError);
                      throw rejeicaoError;
                    }
                    console.log('✅ Rejeição marcada como revertida');

                    // Fechar dialog
                    setDialogReversaoOpen(false);
                    setMotivoReversao("");
                    setRejeicaoParaReverter(null);
                    
                    toast.success("Aguarde, recarregando dados...");
                    
                    // Aguardar propagação no banco
                    console.log('⏳ Aguardando 1 segundo para propagação no DB...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Recarregar dados
                    console.log('🔄 RECARREGANDO fornecedores rejeitados...');
                    await loadFornecedoresRejeitados();
                    
                    console.log('🔄 RECARREGANDO todos os fornecedores...');
                    await loadAllFornecedores();
                    
                    console.log('✅ RELOAD COMPLETO!');
                    toast.success("Fornecedor reabilitado com sucesso!");
                  } catch (error) {
                    console.error('❌❌❌ ERRO CRÍTICO:', error);
                    toast.error('Erro ao reverter rejeição - veja o console');
                  }
                }}
                disabled={!motivoReversao.trim()}
              >
                Confirmar Reversão
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={confirmDeleteEncaminhamentoOpen}
          onOpenChange={setConfirmDeleteEncaminhamentoOpen}
          onConfirm={deletarEncaminhamento}
          title="Confirmar Exclusão de Encaminhamento"
          description={
            encaminhamentoParaExcluir 
              ? `Tem certeza que deseja excluir este encaminhamento?\n\nProtocolo: ${encaminhamentoParaExcluir.protocolo}\n\nEsta ação não pode ser desfeita. Você poderá gerar um novo encaminhamento a qualquer momento.`
              : ""
          }
          confirmText="Excluir Encaminhamento"
          cancelText="Cancelar"
          variant="destructive"
        />

        <ConfirmDialog
          open={confirmDeleteAutorizacaoOpen}
          onOpenChange={setConfirmDeleteAutorizacaoOpen}
          onConfirm={deletarAutorizacao}
          title="Confirmar Exclusão de Autorização"
          description={
            autorizacaoParaExcluir 
              ? `Tem certeza que deseja excluir esta autorização?\n\nProtocolo: ${autorizacaoParaExcluir.protocolo}\nTipo: ${
                  autorizacaoParaExcluir.tipo_autorizacao === 'selecao_fornecedores' 
                    ? 'Seleção de Fornecedores' 
                    : 'Compra Direta'
                }\n\nEsta ação não pode ser desfeita. Você poderá gerar uma nova autorização a qualquer momento.`
              : ""
          }
          confirmText="Excluir Autorização"
          cancelText="Cancelar"
          variant="destructive"
        />

        <ConfirmDialog
          open={confirmDeleteRelatorioOpen}
          onOpenChange={setConfirmDeleteRelatorioOpen}
          onConfirm={deletarRelatorioFinal}
          title="Confirmar Exclusão de Relatório Final"
          description={
            relatorioParaExcluir 
              ? `Tem certeza que deseja excluir este relatório final?\n\nProtocolo: ${relatorioParaExcluir.protocolo}\n\nEsta ação não pode ser desfeita. Você poderá gerar um novo relatório final a qualquer momento.`
              : ""
          }
          confirmText="Excluir Relatório"
          cancelText="Cancelar"
          variant="destructive"
        />

        <ConfirmDialog
          open={confirmDeletePlanilhaHabOpen}
          onOpenChange={setConfirmDeletePlanilhaHabOpen}
          onConfirm={deletarPlanilhaHabilitacao}
          title="Confirmar Exclusão de Planilha de Habilitação"
          description={
            planilhaHabParaExcluir 
              ? `Tem certeza que deseja excluir esta planilha de habilitação?\n\nProtocolo: ${planilhaHabParaExcluir.protocolo}\n\nEsta ação não pode ser desfeita. Você poderá gerar uma nova planilha de habilitação a qualquer momento.`
              : ""
          }
          confirmText="Excluir Planilha"
          cancelText="Cancelar"
          variant="destructive"
        />

        <ConfirmDialog
          open={confirmFinalizarOpen}
          onOpenChange={setConfirmFinalizarOpen}
          onConfirm={finalizarProcesso}
          title="Finalizar Processo de Compra Direta"
          description="Esta ação irá mesclar todos os documentos do processo (anexos, e-mails, propostas de fornecedores, planilha consolidada, relatório final e autorização) em um único PDF consolidado na ordem cronológica de criação. O processo será enviado para contratação. Deseja continuar?"
          confirmText="Sim, Finalizar Processo"
          cancelText="Cancelar"
        />

        <ConfirmDialog
          open={confirmDeleteRecursoOpen}
          onOpenChange={setConfirmDeleteRecursoOpen}
          onConfirm={deletarRecurso}
          title="Confirmar Exclusão de Recurso"
          description="Tem certeza que deseja apagar este recurso? Esta ação não pode ser desfeita."
          confirmText="Excluir Recurso"
          cancelText="Cancelar"
          variant="destructive"
        />

        <ConfirmDialog
          open={confirmDeleteEncContabOpen}
          onOpenChange={setConfirmDeleteEncContabOpen}
          onConfirm={deletarEncaminhamentoContabilidade}
          title="Confirmar Exclusão de Encaminhamento"
          description={
            encContabParaExcluir 
              ? `Tem certeza que deseja excluir este encaminhamento para contabilidade?\n\nProtocolo: ${encContabParaExcluir.protocolo}${encContabParaExcluir.respondido_contabilidade ? '\n\n⚠️ A resposta da contabilidade também será excluída.' : ''}\n\nEsta ação não pode ser desfeita.`
              : ""
          }
          confirmText="Excluir Encaminhamento"
          cancelText="Cancelar"
          variant="destructive"
        />

        <ConfirmDialog
          open={confirmDeleteRespostaRecursoOpen}
          onOpenChange={setConfirmDeleteRespostaRecursoOpen}
          onConfirm={deletarRespostaRecurso}
          title="Confirmar Exclusão de Resposta"
          description="Tem certeza que deseja apagar esta resposta? O recurso voltará a aguardar resposta."
          confirmText="Excluir Resposta"
          cancelText="Cancelar"
          variant="destructive"
        />
      </DialogContent>

      {/* Dialog Solicitar Atualização de Documento */}
      <Dialog open={dialogSolicitarAtualizacao} onOpenChange={setDialogSolicitarAtualizacao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Atualização de Documento</DialogTitle>
            <DialogDescription>
              {documentoParaAtualizar && `Informe o motivo da solicitação de atualização do documento "${documentoParaAtualizar.tipo_documento}"`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="motivo_atualizacao">Motivo da Solicitação *</Label>
              <Textarea
                id="motivo_atualizacao"
                placeholder="Ex: Documento vencido, necessário atualização..."
                value={motivoAtualizacao}
                onChange={(e) => setMotivoAtualizacao(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogSolicitarAtualizacao(false);
                setDocumentoParaAtualizar(null);
                setMotivoAtualizacao("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSolicitarAtualizacaoDocumento}>
              Enviar Solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
