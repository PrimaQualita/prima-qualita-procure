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
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";

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
  const [anexoParaExcluir, setAnexoParaExcluir] = useState<any>(null);
  const [confirmDeleteAnexoOpen, setConfirmDeleteAnexoOpen] = useState(false);
  const [planilhaParaExcluir, setPlanilhaParaExcluir] = useState<any>(null);
  const [confirmDeletePlanilhaOpen, setConfirmDeletePlanilhaOpen] = useState(false);
  const [encaminhamentoParaExcluir, setEncaminhamentoParaExcluir] = useState<any>(null);
  const [confirmDeleteEncaminhamentoOpen, setConfirmDeleteEncaminhamentoOpen] = useState(false);
  const [analiseParaExcluir, setAnaliseParaExcluir] = useState<any>(null);
  const [confirmDeleteAnaliseOpen, setConfirmDeleteAnaliseOpen] = useState(false);
  const [respostaParaExcluir, setRespostaParaExcluir] = useState<string | null>(null);
  const [confirmDeleteRespostaOpen, setConfirmDeleteRespostaOpen] = useState(false);

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

  const gerarEncaminhamento = async () => {
    try {
      setGerandoEncaminhamento(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: perfil } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", user.id)
        .single();

      if (!perfil) throw new Error("Perfil não encontrado");

      const resultado = await gerarEncaminhamentoPDF(
        processoNumero,
        processoObjeto,
        perfil.nome_completo,
        perfil.cpf
      );

      const { error: dbError } = await supabase
        .from('encaminhamentos_processo')
        .insert({
          cotacao_id: cotacaoId,
          processo_numero: processoNumero,
          protocolo: resultado.protocolo,
          storage_path: resultado.storagePath,
          url: resultado.url,
          gerado_por: user.id
        });

      if (dbError) throw dbError;

      toast.success("Encaminhamento gerado com sucesso!");
      loadEncaminhamento();
    } catch (error) {
      console.error('Erro ao gerar encaminhamento:', error);
      toast.error("Erro ao gerar encaminhamento");
    } finally {
      setGerandoEncaminhamento(false);
    }
  };

  const excluirEncaminhamento = async () => {
    if (!encaminhamentoParaExcluir) return;
    
    try {
      const { error: storageError } = await supabase.storage
        .from("processo-anexos")
        .remove([encaminhamentoParaExcluir.storage_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("encaminhamentos_processo")
        .delete()
        .eq("id", encaminhamentoParaExcluir.id);

      if (dbError) throw dbError;

      setEncaminhamentoParaExcluir(null);
      setConfirmDeleteEncaminhamentoOpen(false);
      loadEncaminhamento();
      toast.success("Encaminhamento excluído com sucesso");
    } catch (error: any) {
      console.error("Erro ao excluir encaminhamento:", error);
      toast.error("Erro ao excluir encaminhamento");
    }
  };

  const excluirAnexo = async () => {
    if (!anexoParaExcluir) return;
    
    try {
      await supabase.storage
        .from('processo-anexos')
        .remove([anexoParaExcluir.url_arquivo]);
      
      const { error } = await supabase
        .from('anexos_cotacao_fornecedor')
        .delete()
        .eq('id', anexoParaExcluir.id);
      
      if (error) throw error;
      
      setConfirmDeleteAnexoOpen(false);
      setAnexoParaExcluir(null);
      toast.success('Anexo excluído com sucesso');
      loadRespostas();
    } catch (error) {
      console.error('Erro ao excluir anexo:', error);
      toast.error('Erro ao excluir anexo');
    }
  };
  
  const excluirPlanilha = async () => {
    if (!planilhaParaExcluir) return;
    
    try {
      const filePath = planilhaParaExcluir.url_arquivo;

      const { error: storageError } = await supabase.storage
        .from("processo-anexos")
        .remove([filePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("planilhas_consolidadas")
        .delete()
        .eq("id", planilhaParaExcluir.id);

      if (dbError) throw dbError;

      const { error: clearDocsError } = await supabase
        .from("campos_documentos_finalizacao")
        .update({ 
          status_solicitacao: "pendente",
          data_aprovacao: null 
        })
        .eq("cotacao_id", cotacaoId)
        .in("status_solicitacao", ["aprovado", "em_analise"]);

      if (clearDocsError) {
        console.error("Erro ao limpar aprovações:", clearDocsError);
      }

      setPlanilhaParaExcluir(null);
      setConfirmDeletePlanilhaOpen(false);
      loadPlanilhaGerada();
      toast.success("Planilha excluída com sucesso");
    } catch (error) {
      console.error("Erro ao excluir planilha:", error);
      toast.error("Erro ao excluir planilha");
    }
  };

  const excluirAnalise = async () => {
    if (!analiseParaExcluir) return;
    
    try {
      console.log("🗑️ [RespostasCotacao] Excluindo análise para cotação:", cotacaoId);
      
      const { error: dbError } = await supabase
        .from("analises_compliance")
        .delete()
        .eq("id", analiseParaExcluir.id);

      if (dbError) throw dbError;

      console.log("✅ [RespostasCotacao] Análise deletada, resetando status...");

      // Resetar status de compliance quando análise é deletada
      const { error: updateError } = await supabase
        .from("cotacoes_precos")
        .update({
          respondido_compliance: false,
          enviado_compliance: false,
          data_resposta_compliance: null
        })
        .eq("id", cotacaoId);

      if (updateError) {
        console.error("❌ [RespostasCotacao] Erro ao resetar status:", updateError);
        throw updateError;
      }

      console.log("✅ [RespostasCotacao] Status resetado com sucesso, cotacao_id:", cotacaoId);

      setAnaliseParaExcluir(null);
      setConfirmDeleteAnaliseOpen(false);
      toast.success("Análise excluída com sucesso");
      loadAnaliseCompliance();
    } catch (error: any) {
      console.error("❌ [RespostasCotacao] Erro ao excluir análise:", error);
      toast.error("Erro ao excluir análise");
    }
  };

  const enviarAoCompliance = async () => {
    try {
      setEnviandoCompliance(true);
      
      if (planilhasAnteriores.length === 0) {
        toast.error("É necessário gerar a planilha consolidada antes de enviar ao compliance");
        return;
      }

      console.log("📤 [RespostasCotacao] Enviando ao compliance, cotacao_id:", cotacaoId);

      const { error } = await supabase
        .from("cotacoes_precos")
        .update({ 
          enviado_compliance: true,
          respondido_compliance: false, // Resetar para permitir novo parecer
          data_envio_compliance: new Date().toISOString()
        })
        .eq("id", cotacaoId);

      if (error) {
        console.error("❌ [RespostasCotacao] Erro ao enviar:", error);
        throw error;
      }

      console.log("✅ [RespostasCotacao] Enviado com sucesso, status resetado para pendente");

      toast.success("Processo enviado ao Compliance com sucesso!");
    } catch (error) {
      console.error("❌ [RespostasCotacao] Erro ao enviar ao compliance:", error);
      toast.error("Erro ao enviar ao Compliance");
    } finally {
      setEnviandoCompliance(false);
    }
  };

  const handleVisualizarProposta = async (respostaId: string) => {
    try {
      setGerandoPDF(respostaId);
      
      // Buscar dados da resposta
      const resposta = respostas.find(r => r.id === respostaId);
      if (!resposta) {
        toast.error("Resposta não encontrada");
        return;
      }

      // Verificar se já existe PDF gerado
      if (resposta.anexos && resposta.anexos.length > 0) {
        const propostaPDF = resposta.anexos.find(a => a.tipo_anexo === 'PROPOSTA');
        
        if (propostaPDF) {
          // Abrir PDF existente
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('processo-anexos')
            .download(propostaPDF.url_arquivo);

          if (downloadError) throw downloadError;

          const pdfUrl = URL.createObjectURL(fileData);
          window.open(pdfUrl, '_blank');
          setGerandoPDF(null);
          return;
        }
      }

      // Se não existe, gerar novo PDF
      const resultado = await gerarPropostaFornecedorPDF(
        respostaId,
        resposta.fornecedor,
        resposta.valor_total_anual_ofertado,
        resposta.observacoes_fornecedor,
        cotacao.titulo_cotacao
      );

      // Criar registro do anexo em anexos_cotacao_fornecedor
      const { error: anexoError } = await supabase
        .from('anexos_cotacao_fornecedor')
        .insert({
          cotacao_resposta_fornecedor_id: respostaId,
          nome_arquivo: resultado.nome,
          url_arquivo: resultado.url,
          tipo_anexo: 'PROPOSTA'
        });

      if (anexoError) {
        console.error("Erro ao criar registro de anexo:", anexoError);
        throw anexoError;
      }

      // Recarregar dados para atualizar interface ANTES de abrir
      await loadRespostas();
      
      // Buscar o arquivo do storage e abrir em nova guia
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('processo-anexos')
        .download(resultado.url);

      if (downloadError) throw downloadError;

      const pdfUrl = URL.createObjectURL(fileData);
      window.open(pdfUrl, '_blank');
      
      toast.success("Proposta gerada com sucesso!");
    } catch (error) {
      console.error("Erro ao visualizar proposta:", error);
      toast.error("Erro ao visualizar proposta");
    } finally {
      setGerandoPDF(null);
    }
  };

  const handleBaixarProposta = async (respostaId: string) => {
    try {
      setGerandoPDF(respostaId);
      
      // Buscar dados da resposta
      const resposta = respostas.find(r => r.id === respostaId);
      if (!resposta) {
        toast.error("Resposta não encontrada");
        return;
      }

      const resultado = await gerarPropostaFornecedorPDF(
        respostaId,
        resposta.fornecedor,
        resposta.valor_total_anual_ofertado,
        resposta.observacoes_fornecedor,
        cotacao.titulo_cotacao
      );

      // Buscar o arquivo do storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('processo-anexos')
        .download(resultado.url);

      if (downloadError) throw downloadError;

      const pdfUrl = URL.createObjectURL(fileData);
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = resultado.nome;
      link.click();
      toast.success("Proposta baixada com sucesso!");
    } catch (error) {
      console.error("Erro ao baixar proposta:", error);
      toast.error("Erro ao baixar proposta");
    } finally {
      setGerandoPDF(null);
    }
  };

  const handleDeletarResposta = async () => {
    if (!respostaParaExcluir) return;
    
    try {
      const { error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .delete()
        .eq("id", respostaParaExcluir);

      if (error) throw error;

      toast.success("Resposta excluída com sucesso!");
      setConfirmDeleteRespostaOpen(false);
      setRespostaParaExcluir(null);
      loadRespostas();
    } catch (error) {
      console.error("Erro ao excluir resposta:", error);
      toast.error("Erro ao excluir resposta");
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
      <div className="flex flex-col items-center mb-6">
        <img 
          src={logoHorizontal} 
          alt="Prima Qualitá Saúde" 
          className="h-16 object-contain mb-4"
        />
      </div>
      
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const contratoId = searchParams.get('contrato');
            const processoId = searchParams.get('processo');
            navigate(`/cotacoes?contrato=${contratoId}&processo=${processoId}&cotacao=${cotacaoId}`);
          }}
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
        <div className="py-8 text-center text-muted-foreground">
          Carregando respostas...
        </div>
      ) : respostas.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          Nenhuma resposta recebida ainda
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Total de respostas: <strong>{respostas.length}</strong>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-right">Valor Total Ofertado</TableHead>
                <TableHead>Data Envio</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead>Proposta PDF</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respostas.map((resposta) => {
                const isMenorValor = resposta.valor_total_anual_ofertado === menorValor;
                
                return (
                  <TableRow key={resposta.id} className={isMenorValor ? "bg-green-50 dark:bg-green-950" : ""}>
                    <TableCell className="font-medium">
                      {resposta.fornecedor.razao_social}
                      {isMenorValor && (
                        <Badge className="ml-2 bg-green-600">Menor Preço</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatarCNPJ(resposta.fornecedor.cnpj)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      R$ {resposta.valor_total_anual_ofertado.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatarData(resposta.data_envio_resposta)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {resposta.observacoes_fornecedor || "-"}
                    </TableCell>
                    <TableCell>
                      {resposta.anexos && resposta.anexos.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {resposta.anexos.map((anexo) => (
                            <div key={anexo.id} className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[150px]" title={anexo.nome_arquivo}>
                                {anexo.nome_arquivo}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  const { data } = await supabase.storage
                                    .from('processo-anexos')
                                    .createSignedUrl(anexo.url_arquivo, 3600);
                                  if (data?.signedUrl) {
                                    window.open(data.signedUrl, '_blank');
                                  }
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setAnexoParaExcluir(anexo);
                                  setConfirmDeleteAnexoOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 justify-center">
                        {resposta.anexos && resposta.anexos.length > 0 ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVisualizarProposta(resposta.id)}
                              disabled={gerandoPDF === resposta.id}
                            >
                              {gerandoPDF === resposta.id ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  Gerando...
                                </span>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4 mr-1" />
                                  Ver
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleBaixarProposta(resposta.id)}
                              disabled={gerandoPDF === resposta.id}
                            >
                              {gerandoPDF === resposta.id ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                </span>
                              ) : (
                                <>
                                  <Download className="h-4 w-4 mr-1" />
                                  Baixar
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRespostaSelecionada(resposta);
                                setEmailCorrecaoOpen(true);
                              }}
                            >
                              <Mail className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRespostaParaExcluir(resposta.id);
                                setConfirmDeleteRespostaOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVisualizarProposta(resposta.id)}
                              disabled={gerandoPDF === resposta.id}
                            >
                              {gerandoPDF === resposta.id ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  Gerando...
                                </span>
                              ) : (
                                <>
                                  <FileText className="h-4 w-4 mr-1" />
                                  Gerar Proposta
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRespostaParaExcluir(resposta.id);
                                setConfirmDeleteRespostaOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* ========== 2. PLANILHA CONSOLIDADA (só aparece se tiver respostas) ========== */}
          <div className="mt-6 pt-6 border-t space-y-4">
            <h3 className="text-lg font-semibold">Planilha Consolidada</h3>
            
            {/* Planilhas Anteriores */}
            {planilhasAnteriores.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Planilhas Geradas:</p>
                {planilhasAnteriores.map((planilha) => (
                  <div key={planilha.id} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">Protocolo: {planilha.protocolo}</span>
                        <div className="text-xs text-muted-foreground">
                          Planilha Gerada em {new Date(planilha.data_geracao).toLocaleString('pt-BR')}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const { data } = await supabase.storage
                            .from('processo-anexos')
                            .createSignedUrl(planilha.url_arquivo, 3600);
                          if (data?.signedUrl) {
                            window.open(data.signedUrl, '_blank');
                          }
                        }}
                        className="flex-1"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Visualizar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from('processo-anexos')
                            .download(planilha.url_arquivo);
                          if (error) throw error;
                          const blob = new Blob([data], { type: 'application/pdf' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = planilha.nome_arquivo;
                          a.click();
                        }}
                        className="flex-1"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Baixar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setPlanilhaParaExcluir(planilha);
                          setConfirmDeletePlanilhaOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Botão para gerar nova planilha */}
            <Button 
              onClick={() => setPlanilhaConsolidadaOpen(true)}
              disabled={gerandoPlanilha}
              className="w-full"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {gerandoPlanilha ? "Gerando..." : "Gerar Planilha Consolidada"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Você poderá escolher o método de cálculo (menor preço, média, mediana)
            </p>
          </div>

          {/* ========== 3. ENCAMINHAMENTOS (só aparece se tiver planilha ou encaminhamentos) ========== */}
          {(planilhasAnteriores.length > 0 || encaminhamentos.length > 0) && (
            <div className="mt-6 pt-6 border-t space-y-4">
              <h3 className="text-lg font-semibold">Encaminhamentos</h3>
              
              {/* Encaminhamentos Anteriores */}
              {encaminhamentos.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Encaminhamentos Gerados:</p>
                  {encaminhamentos.map((enc) => (
                    <div key={enc.id} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">Protocolo: {enc.protocolo}</span>
                          <div className="text-xs text-muted-foreground">
                            Gerado em {new Date(enc.created_at).toLocaleString('pt-BR')}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(enc.url, '_blank')}
                          className="flex-1"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Visualizar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = enc.url;
                            link.download = `encaminhamento_${enc.protocolo}.pdf`;
                            link.click();
                          }}
                          className="flex-1"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Baixar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setEncaminhamentoParaExcluir(enc);
                            setConfirmDeleteEncaminhamentoOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Botão Gerar Encaminhamento */}
              {planilhasAnteriores.length > 0 && (
                <Button
                  onClick={gerarEncaminhamento}
                  disabled={gerandoEncaminhamento}
                  variant="outline"
                  className="w-full"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {gerandoEncaminhamento ? "Gerando..." : "Gerar Encaminhamento"}
                </Button>
              )}

              {/* Botão Enviar ao Compliance */}
              {planilhasAnteriores.length > 0 && (
                <Button
                  onClick={enviarAoCompliance}
                  disabled={enviandoCompliance}
                  className="w-full"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {enviandoCompliance ? "Enviando..." : "Enviar ao Compliance"}
                </Button>
              )}
            </div>
          )}

          {/* ========== 4. ANÁLISES DE COMPLIANCE (só aparece se foi enviado ao compliance) ========== */}
          {analisesAnteriores.length > 0 && (
            <div className="mt-6 pt-6 border-t space-y-4">
              <h3 className="text-lg font-semibold">Análises de Compliance</h3>
              {analisesAnteriores.map((analise) => {
                const empresas = analise.empresas as any[];
                const aprovadas = empresas
                  .filter((emp: any) => emp.aprovado === true)
                  .map((emp: any) => emp.razao_social);
                const reprovadas = empresas
                  .filter((emp: any) => emp.aprovado === false)
                  .map((emp: any) => emp.razao_social);

                return (
                  <div key={analise.id} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Protocolo: {analise.protocolo}</span>
                          <Badge variant={analise.status_aprovacao === 'aprovado' ? 'default' : 'destructive'}>
                            {analise.status_aprovacao === 'aprovado' ? 'Aprovado' : 'Reprovado'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Análise realizada em {new Date(analise.data_analise || analise.created_at).toLocaleString('pt-BR')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          <strong>Conclusão:</strong> {stripHtml(analise.conclusao || '')}
                        </p>
                      </div>
                    </div>
                    
                    {/* Lista de Empresas Aprovadas e Reprovadas */}
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      {aprovadas.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-green-700">✓ Empresas Aprovadas:</p>
                          <ul className="text-xs space-y-1">
                            {aprovadas.map((empresa, idx) => (
                              <li key={idx} className="text-green-600">• {empresa}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {reprovadas.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-red-700">✗ Empresas Reprovadas:</p>
                          <ul className="text-xs space-y-1">
                            {reprovadas.map((empresa, idx) => (
                              <li key={idx} className="text-red-600">• {empresa}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    
                    {analise.url_documento && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(analise.url_documento, '_blank')}
                          className="flex-1"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Visualizar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = analise.url_documento;
                            link.download = analise.nome_arquivo || 'analise_compliance.pdf';
                            link.click();
                          }}
                          className="flex-1"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Baixar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setAnaliseParaExcluir(analise);
                            setConfirmDeleteAnaliseOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Alert Dialogs */}
      <AlertDialog open={emailCorrecaoOpen} onOpenChange={setEmailCorrecaoOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar Correção de Proposta</AlertDialogTitle>
            <AlertDialogDescription>
              Fornecedor: {respostaSelecionada?.fornecedor.razao_social}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Texto do E-mail</Label>
              <Textarea
                value={emailTexto}
                onChange={(e) => setEmailTexto(e.target.value)}
                placeholder="Digite o texto do e-mail solicitando correções..."
                rows={6}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              toast.success("E-mail de correção enviado!");
              setEmailCorrecaoOpen(false);
              setEmailTexto("");
            }}>
              Enviar E-mail
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteAnexoOpen} onOpenChange={setConfirmDeleteAnexoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este anexo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirAnexo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeletePlanilhaOpen} onOpenChange={setConfirmDeletePlanilhaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Planilha Consolidada</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta planilha? Esta ação não pode ser desfeita e todas as aprovações de documentos serão resetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirPlanilha} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteEncaminhamentoOpen} onOpenChange={setConfirmDeleteEncaminhamentoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Encaminhamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este encaminhamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirEncaminhamento} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteAnaliseOpen} onOpenChange={setConfirmDeleteAnaliseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Análise de Compliance</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta análise? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirAnalise} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteRespostaOpen} onOpenChange={setConfirmDeleteRespostaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Resposta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir definitivamente esta resposta? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletarResposta} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
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
