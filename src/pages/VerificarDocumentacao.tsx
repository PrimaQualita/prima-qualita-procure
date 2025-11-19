import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, differenceInDays, startOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ExternalLink, FileText, CheckCircle, AlertCircle, Download, Eye, Send, Mail, Clock, XCircle, RefreshCw, Undo2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { gerarAutorizacaoCompraDireta } from "@/lib/gerarAutorizacaoPDF";
import { gerarRelatorioFinal } from "@/lib/gerarRelatorioFinalPDF";
import { gerarRespostaRecursoPDF } from "@/lib/gerarRespostaRecursoPDF";
import { gerarProcessoCompletoPDF } from "@/lib/gerarProcessoCompletoPDF";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { stripHtml } from "@/lib/htmlUtils";

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
  campos: CampoDocumento[];
  todosDocumentosAprovados: boolean;
  rejeitado: boolean;
  motivoRejeicao: string | null;
  respostaId: string;
}

const VerificarDocumentacao = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cotacaoId = searchParams.get("cotacao") || "";
  const contratoId = searchParams.get("contrato") || "";
  const processoId = searchParams.get("processo") || "";

  const [loading, setLoading] = useState(false);
  const [fornecedoresData, setFornecedoresData] = useState<FornecedorData[]>([]);
  const [fornecedorExpandido, setFornecedorExpandido] = useState<string | null>(null);
  const [novosCampos, setNovosCampos] = useState<Record<string, {nome: string; descricao: string; obrigatorio: boolean}>({});
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
  const [confirmDeleteEncaminhamentoOpen, setConfirmDeleteEncaminhamentoOpen] = useState(false);
  const [encaminhamentoParaExcluir, setEncaminhamentoParaExcluir] = useState<any>(null);
  const [confirmDeleteAutorizacaoOpen, setConfirmDeleteAutorizacaoOpen] = useState(false);
  const [autorizacaoParaExcluir, setAutorizacaoParaExcluir] = useState<any>(null);
  const [confirmDeleteRelatorioOpen, setConfirmDeleteRelatorioOpen] = useState(false);
  const [relatorioParaExcluir, setRelatorioParaExcluir] = useState<any>(null);
  const [encaminhamentos, setEncaminhamentos] = useState<any[]>([]);
  const [autorizacoes, setAutorizacoes] = useState<any[]>([]);

  useEffect(() => {
    if (cotacaoId) {
      console.log("📂 Página aberta, carregando todos os fornecedores vencedores");
      loadAllFornecedores();
      loadDocumentosAprovados();
      loadEncaminhamentos();
      loadAutorizacoes();
      loadRelatorioFinal();
      checkResponsavelLegal();
      loadFornecedoresRejeitados();
      loadRecursos();
    }
  }, [cotacaoId]);

  const loadAllFornecedores = async () => {
    setLoading(true);
    try {
      console.log("🔄 Iniciando carregamento de fornecedores para cotação:", cotacaoId);
      const { data: ultimaPlanilha } = await supabase
        .from("planilhas_consolidadas")
        .select("fornecedores_incluidos, data_geracao")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ultimaPlanilha || !ultimaPlanilha.fornecedores_incluidos || !Array.isArray(ultimaPlanilha.fornecedores_incluidos) || ultimaPlanilha.fornecedores_incluidos.length === 0) {
        console.log("❌ SEM PLANILHA CONSOLIDADA VÁLIDA - Nenhum fornecedor será exibido");
        setFornecedoresData([]);
        setLoading(false);
        return;
      }

      const cnpjsPermitidos = ultimaPlanilha.fornecedores_incluidos as string[];
      const { data: cotacao, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("criterio_julgamento")
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;

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

      const respostasFiltradas = cnpjsPermitidos.length > 0
        ? respostas?.filter(r => cnpjsPermitidos.includes(r.fornecedores.cnpj)) || []
        : respostas || [];

      if (respostasFiltradas.length === 0) {
        console.log("❌ NENHUM FORNECEDOR após filtro!");
        setFornecedoresData([]);
        setLoading(false);
        return;
      }

      const { data: itens, error: itensError } = await supabase
        .from("respostas_itens_fornecedor")
        .select(`
          id,
          cotacao_resposta_fornecedor_id,
          item_cotacao_id,
          valor_unitario_ofertado,
          itens_cotacao!inner(numero_item, descricao, lote_id, quantidade, unidade)
        `)
        .in("cotacao_resposta_fornecedor_id", respostasFiltradas.map(r => r.id));

      if (itensError) throw itensError;

      const criterio = cotacao?.criterio_julgamento || "global";
      const fornecedoresVencedores = await identificarVencedores(criterio, respostasFiltradas, itens || []);

      const fornecedoresComDados = await Promise.all(
        fornecedoresVencedores.map(async (forn) => {
          const resposta = respostasFiltradas.find(r => r.fornecedor_id === forn.id);
          const [docs, itensVenc, campos] = await Promise.all([
            loadDocumentosFornecedor(forn.id),
            loadItensVencedores(forn.id, criterio, respostasFiltradas, itens || []),
            loadCamposFornecedor(forn.id)
          ]);

          const todosAprovados = verificarTodosDocumentosAprovados(forn.id, docs, campos);

          return {
            fornecedor: forn,
            documentosExistentes: docs,
            itensVencedores: itensVenc,
            campos: campos,
            todosDocumentosAprovados: todosAprovados,
            rejeitado: resposta?.rejeitado || false,
            motivoRejeicao: resposta?.rejeitado ? (resposta?.motivo_rejeicao || null) : null,
            respostaId: resposta?.id || ""
          };
        })
      );

      const fornecedoresOrdenados = fornecedoresComDados.sort((a, b) => {
        const menorItemA = Math.min(...a.itensVencedores.map(item => item.itens_cotacao.numero_item));
        const menorItemB = Math.min(...b.itensVencedores.map(item => item.itens_cotacao.numero_item));
        return menorItemA - menorItemB;
      });

      setFornecedoresData(fornecedoresOrdenados);
    } catch (error) {
      console.error("❌ Erro ao carregar fornecedores:", error);
      toast.error("Erro ao carregar fornecedores vencedores");
    } finally {
      setLoading(false);
    }
  };

  const handleVoltar = () => {
    navigate(`/cotacoes?contrato=${contratoId}&processo=${processoId}&cotacao=${cotacaoId}`);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Verificar Documentação</CardTitle>
              <CardDescription>
                Verifique e aprove os documentos dos fornecedores vencedores
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleVoltar}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <div>
              {/* Todo o conteúdo do DialogFinalizarProcesso vai aqui */}
              <p className="text-muted-foreground">Conteúdo será migrado do Dialog</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VerificarDocumentacao;
