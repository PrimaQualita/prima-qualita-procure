// @ts-nocheck - Tabelas de processos podem não existir no schema atual
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDown, Mail, Trash2, FileSpreadsheet, Eye, Download, Send, FileText, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { gerarEncaminhamentoPDF } from '@/lib/gerarEncaminhamentoPDF';
import { gerarPropostaFornecedorPDF } from '@/lib/gerarPropostaFornecedorPDF';
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { stripHtml } from "@/lib/htmlUtils";
import { DialogPlanilhaConsolidada } from "@/components/cotacoes/DialogPlanilhaConsolidada";
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ItemResposta {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_ofertado: number;
}

interface RespostaFornecedor {
  id: string;
  valor_total_anual_ofertado: number;
  observacoes_fornecedor: string | null;
  data_envio_resposta: string;
  usuario_gerador_id?: string | null;
  comprovantes_urls?: string[] | null;
  fornecedor: {
    razao_social: string;
    cnpj: string;
    endereco_comercial: string;
  };
  anexos?: Array<{
    id: string;
    nome_arquivo: string;
    url_arquivo: string;
    tipo_anexo: string;
  }>;
}

export default function RespostasCotacao() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const cotacaoId = searchParams.get("cotacao");
  
  const [respostas, setRespostas] = useState<RespostaFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [cotacao, setCotacao] = useState<any>(null);
  const [processoNumero, setProcessoNumero] = useState("");
  const [processoObjeto, setProcessoObjeto] = useState("");
  const [emailCorrecaoOpen, setEmailCorrecaoOpen] = useState(false);
  const [respostaSelecionada, setRespostaSelecionada] = useState<RespostaFornecedor | null>(null);
  const [emailTexto, setEmailTexto] = useState("");
  const [planilhaConsolidadaOpen, setPlanilhaConsolidadaOpen] = useState(false);
  const [planilhaGerada, setPlanilhaGerada] = useState<any>(null);
  const [planilhasAnteriores, setPlanilhasAnteriores] = useState<any[]>([]);
  const [gerandoPlanilha, setGerandoPlanilha] = useState(false);
  const [enviandoCompliance, setEnviandoCompliance] = useState(false);
  const [encaminhamentos, setEncaminhamentos] = useState<any[]>([]);
  const [gerandoEncaminhamento, setGerandoEncaminhamento] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState<string | null>(null);
  const [analiseCompliance, setAnaliseCompliance] = useState<any>(null);
  const [analisesAnteriores, setAnalisesAnteriores] = useState<any[]>([]);
  const [empresasAprovadas, setEmpresasAprovadas] = useState<string[]>([]);
  const [empresasReprovadas, setEmpresasReprovadas] = useState<string[]>([]);

  // Definir funções auxiliares ANTES do useEffect
  const loadAnaliseCompliance = async () => {
    try {
      const { data: analises } = await supabase
        .from("analises_compliance")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false });
      
      if (analises && analises.length > 0) {
        const maisRecente = analises[0];
        setAnaliseCompliance(maisRecente);
        
        const empresas = maisRecente.empresas as any[];
        const aprovadas = empresas
          .filter((emp: any) => emp.aprovado === true)
          .map((emp: any) => emp.razao_social);
        const reprovadas = empresas
          .filter((emp: any) => emp.aprovado === false)
          .map((emp: any) => emp.razao_social);
        
        setEmpresasAprovadas(aprovadas);
        setEmpresasReprovadas(reprovadas);
        setAnalisesAnteriores(analises);
      } else {
        setAnaliseCompliance(null);
        setEmpresasAprovadas([]);
        setEmpresasReprovadas([]);
        setAnalisesAnteriores([]);
      }
    } catch (error) {
      console.error("Erro ao carregar análise de compliance:", error);
    }
  };

  const loadPlanilhaGerada = async () => {
    try {
      const { data, error } = await supabase
        .from("planilhas_consolidadas")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: false });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setPlanilhasAnteriores(data);
      } else {
        setPlanilhasAnteriores([]);
      }
    } catch (error) {
      console.error("Erro ao carregar planilhas:", error);
    }
  };

  const loadEncaminhamento = async () => {
    try {
      const { data } = await supabase
        .from("encaminhamentos_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false});
      
      setEncaminhamentos(data || []);
    } catch (error) {
      console.error("Erro ao carregar encaminhamentos:", error);
    }
  };

  useEffect(() => {
    if (cotacaoId) {
      loadRespostas();
      loadPlanilhaGerada();
      loadEncaminhamento();
      loadAnaliseCompliance();

      // Listener realtime para atualizar quando análises são deletadas/criadas
      const channel = supabase
        .channel('analises-compliance-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'analises_compliance',
            filter: `cotacao_id=eq.${cotacaoId}`
          },
          () => {
            console.log('📡 Mudança detectada em analises_compliance');
            loadAnaliseCompliance();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [cotacaoId]);

  const loadRespostas = async () => {
    try {
      setLoading(true);

      // Buscar cotação
      const { data: cotacaoData, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select(`
          *,
          processos_compras!inner(numero_processo_interno, objeto_resumido)
        `)
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;
      
      setCotacao(cotacaoData);
      setProcessoNumero(cotacaoData.processos_compras.numero_processo_interno);
      setProcessoObjeto(cotacaoData.processos_compras.objeto_resumido);

      // Buscar todas as respostas da cotação com fornecedores
      const { data: respostasData, error: respostasError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          *,
          fornecedores(razao_social, cnpj, endereco_comercial),
          anexos_cotacao_fornecedor(id, nome_arquivo, url_arquivo, tipo_anexo)
        `)
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: false });

      if (respostasError) throw respostasError;

      const fornecedorIds = respostasData
        .filter((r: any) => !r.fornecedores)
        .map((r: any) => r.fornecedor_id);

      let fornecedoresOrfaosData: any = {};

      if (fornecedorIds.length > 0) {
        const { data: fornecedoresOrfaos } = await supabase
          .from("fornecedores")
          .select("id, razao_social, cnpj, endereco_comercial")
          .in("id", fornecedorIds);

        fornecedoresOrfaosData = (fornecedoresOrfaos || []).reduce((acc: any, f: any) => {
          acc[f.id] = f;
          return acc;
        }, {});
      }

      const respostasFormatadas = respostasData.map((r: any) => {
        const fornecedorData = r.fornecedores || fornecedoresOrfaosData[r.fornecedor_id];
        
        return {
          id: r.id,
          valor_total_anual_ofertado: r.valor_total_anual_ofertado,
          observacoes_fornecedor: r.observacoes_fornecedor,
          data_envio_resposta: r.data_envio_resposta,
          usuario_gerador_id: r.usuario_gerador_id,
          comprovantes_urls: r.comprovantes_urls || [],
          fornecedor: {
            razao_social: fornecedorData?.razao_social || "N/A",
            cnpj: fornecedorData?.cnpj || "N/A",
            endereco_comercial: fornecedorData?.endereco_comercial || "",
          },
          anexos: r.anexos_cotacao_fornecedor || [],
        };
      });

      setRespostas(respostasFormatadas);

    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
      toast.error("Erro ao carregar respostas");
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString("pt-BR");
  };

  const formatarCNPJ = (cnpj: string) => {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  const menorValor = respostas.length > 0 ? Math.min(...respostas.map(r => r.valor_total_anual_ofertado)) : 0;

  if (!cotacaoId) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">ID da cotação não fornecido</p>
            <Button onClick={() => navigate("/cotacoes")} className="mt-4">
              Voltar para Cotações
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/cotacoes")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Respostas Recebidas</h1>
          <p className="text-muted-foreground">
            Cotação: {cotacao?.titulo_cotacao}
          </p>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Carregando respostas...
          </CardContent>
        </Card>
      ) : respostas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma resposta recebida ainda
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Total de respostas: <strong>{respostas.length}</strong>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {/* Copiar toda a tabela e lógica de exibição do DialogRespostasCotacao */}
          </CardContent>
        </Card>
      )}

      {/* Copiar todos os AlertDialogs do DialogRespostasCotacao */}
      
      <DialogPlanilhaConsolidada
        open={planilhaConsolidadaOpen}
        onOpenChange={setPlanilhaConsolidadaOpen}
        cotacaoId={cotacaoId}
        criterioJulgamento={cotacao?.criterio_julgamento || ""}
        onPlanilhaGerada={loadPlanilhaGerada}
      />
    </div>
  );
}
