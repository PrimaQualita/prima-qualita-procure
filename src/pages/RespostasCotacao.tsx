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

      // ... resto da lógica de loadRespostas do DialogRespostasCotacao
      // (copiar toda a implementação)

    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
      toast.error("Erro ao carregar respostas");
    } finally {
      setLoading(false);
    }
  };

  // ... copiar todas as outras funções do DialogRespostasCotacao
  // (gerarESalvarPDFProposta, loadPlanilhaGerada, etc.)

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
