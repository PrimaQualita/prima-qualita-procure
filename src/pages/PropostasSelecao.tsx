import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Download, Trash2, RefreshCw, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";
import { gerarPropostaSelecaoPDF } from "@/lib/gerarPropostaSelecaoPDF";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PropostaFornecedor {
  id: string;
  valor_total_proposta: number;
  observacoes_fornecedor: string | null;
  data_envio_proposta: string;
  desclassificado: boolean | null;
  motivo_desclassificacao: string | null;
  email: string | null;
  url_pdf_proposta: string | null;
  fornecedor: {
    razao_social: string;
    cnpj: string;
    email: string;
    endereco_comercial: string | null;
  };
}

export default function PropostasSelecao() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selecaoId = searchParams.get("selecao");
  const tipoPropostas = searchParams.get("tipo"); // "realinhadas" ou null para propostas normais
  
  const [propostas, setPropostas] = useState<PropostaFornecedor[]>([]);
  const [propostasRealinhadas, setPropostasRealinhadas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);
  const [gerandoPDF, setGerandoPDF] = useState<string | null>(null);
  const [propostaParaExcluir, setPropostaParaExcluir] = useState<PropostaFornecedor | null>(null);
  const [propostaParaExcluirCompleta, setPropostaParaExcluirCompleta] = useState<PropostaFornecedor | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteCompletaOpen, setConfirmDeleteCompletaOpen] = useState(false);
  
  // Estados para propostas realinhadas
  const [propostaRealinhadaParaExcluir, setPropostaRealinhadaParaExcluir] = useState<any>(null);
  const [confirmDeleteRealinhadaOpen, setConfirmDeleteRealinhadaOpen] = useState(false);
  const [propostaParaCorrecao, setPropostaParaCorrecao] = useState<any>(null);
  const [motivoCorrecao, setMotivoCorrecao] = useState("");
  const [dialogCorrecaoOpen, setDialogCorrecaoOpen] = useState(false);

  const isRealinhadas = tipoPropostas === "realinhadas";

  useEffect(() => {
    if (selecaoId) {
      if (isRealinhadas) {
        loadPropostasRealinhadas();
      } else {
        loadPropostas();
      }
    }
  }, [selecaoId, tipoPropostas]);

  const loadPropostasRealinhadas = async () => {
    try {
      setLoading(true);
      console.log("📋 Carregando propostas realinhadas para seleção:", selecaoId);

      // Carregar seleção e processo
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*)")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);

      // Carregar propostas realinhadas dos fornecedores vencedores
      const { data: propostasData, error: propostasError } = await supabase
        .from("propostas_realinhadas")
        .select(`
          *,
          fornecedor:fornecedores(razao_social, cnpj, email, endereco_comercial),
          propostas_realinhadas_itens(*)
        `)
        .eq("selecao_id", selecaoId)
        .order("data_envio", { ascending: false });

      if (propostasError) throw propostasError;

      console.log("✅ Propostas realinhadas carregadas:", propostasData?.length || 0);
      setPropostasRealinhadas(propostasData || []);
    } catch (error) {
      console.error("Erro ao carregar propostas realinhadas:", error);
      toast.error("Erro ao carregar propostas realinhadas");
    } finally {
      setLoading(false);
    }
  };

  const loadPropostas = async () => {
    try {
      setLoading(true);
      console.log("📋 Carregando propostas para seleção:", selecaoId);

      // Carregar seleção e processo
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*)")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);

      // Carregar propostas dos fornecedores
      const { data: propostasData, error: propostasError } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          *,
          fornecedor:fornecedores(razao_social, cnpj, email, endereco_comercial)
        `)
        .eq("selecao_id", selecaoId)
        .order("data_envio_proposta", { ascending: false });

      if (propostasError) throw propostasError;

      console.log("✅ Propostas carregadas:", propostasData?.length || 0);
      setPropostas(propostasData || []);
    } catch (error) {
      console.error("Erro ao carregar propostas:", error);
      toast.error("Erro ao carregar propostas da seleção");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatCNPJ = (cnpj: string) => {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const handleVisualizarProposta = async (propostaId: string) => {
    try {
      setGerandoPDF(propostaId);
      
      const proposta = propostas.find(p => p.id === propostaId);
      if (!proposta) {
        toast.error("Proposta não encontrada");
        return;
      }

      // Buscar URL mais recente do banco de dados (caso fornecedor tenha atualizado)
      const { data: propostaAtualizada, error: fetchError } = await supabase
        .from('selecao_propostas_fornecedor')
        .select('url_pdf_proposta')
        .eq('id', propostaId)
        .single();

      if (fetchError) throw fetchError;

      // Se já existe PDF salvo, usar ele diretamente
      if (propostaAtualizada?.url_pdf_proposta) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('processo-anexos')
          .download(propostaAtualizada.url_pdf_proposta);

        if (downloadError) throw downloadError;

        const pdfUrl = URL.createObjectURL(fileData);
        window.open(pdfUrl, '_blank');
        
        toast.success("Proposta carregada com sucesso!");
        
        // Atualizar lista local se URL mudou
        if (propostaAtualizada.url_pdf_proposta !== proposta.url_pdf_proposta) {
          await loadPropostas();
        }
      } else {
        // Gerar PDF e salvar URL
        const resultado = await gerarPropostaSelecaoPDF(
          propostaId,
          {
            razao_social: proposta.fornecedor.razao_social,
            cnpj: proposta.fornecedor.cnpj,
            email: proposta.email || '',
            logradouro: proposta.fornecedor.endereco_comercial?.split(',')[0]?.trim() || '',
            numero: proposta.fornecedor.endereco_comercial?.split('Nº ')[1]?.split(',')[0]?.trim() || '',
            bairro: proposta.fornecedor.endereco_comercial?.split(',')[2]?.trim() || '',
            municipio: proposta.fornecedor.endereco_comercial?.split(',')[3]?.split('/')[0]?.trim() || '',
            uf: proposta.fornecedor.endereco_comercial?.split('/')[1]?.split(',')[0]?.trim() || '',
            cep: proposta.fornecedor.endereco_comercial?.split('CEP: ')[1]?.trim() || ''
          },
          proposta.valor_total_proposta,
          proposta.observacoes_fornecedor,
          selecao?.titulo_selecao || '',
          proposta.data_envio_proposta,
          undefined,
          processo?.criterio_julgamento
        );

        // Salvar URL no banco de dados
        const { error: updateError } = await supabase
          .from('selecao_propostas_fornecedor')
          .update({ url_pdf_proposta: resultado.url })
          .eq('id', propostaId);

        if (updateError) {
          console.error('Erro ao salvar URL do PDF:', updateError);
        }

        const { data: fileData, error: downloadError } = await supabase.storage
          .from('processo-anexos')
          .download(resultado.url);

        if (downloadError) throw downloadError;

        const pdfUrl = URL.createObjectURL(fileData);
        window.open(pdfUrl, '_blank');
        
        toast.success("Proposta gerada com sucesso!");
        
        // Recarregar propostas para atualizar a URL
        await loadPropostas();
      }
    } catch (error) {
      console.error("Erro ao visualizar proposta:", error);
      toast.error("Erro ao visualizar proposta");
    } finally {
      setGerandoPDF(null);
    }
  };

  const handleBaixarProposta = async (propostaId: string) => {
    try {
      setGerandoPDF(propostaId);
      
      const proposta = propostas.find(p => p.id === propostaId);
      if (!proposta) {
        toast.error("Proposta não encontrada");
        return;
      }

      // Buscar URL mais recente do banco de dados (caso fornecedor tenha atualizado)
      const { data: propostaAtualizada, error: fetchError } = await supabase
        .from('selecao_propostas_fornecedor')
        .select('url_pdf_proposta')
        .eq('id', propostaId)
        .single();

      if (fetchError) throw fetchError;

      // Se já existe PDF salvo, usar ele diretamente
      if (propostaAtualizada?.url_pdf_proposta) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('processo-anexos')
          .download(propostaAtualizada.url_pdf_proposta);

        if (downloadError) throw downloadError;

        const pdfUrl = URL.createObjectURL(fileData);
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `proposta-${proposta.fornecedor.cnpj}.pdf`;
        link.click();
        
        toast.success("Proposta baixada com sucesso!");
        
        // Atualizar lista local se URL mudou
        if (propostaAtualizada.url_pdf_proposta !== proposta.url_pdf_proposta) {
          await loadPropostas();
        }
      } else {
        // Gerar PDF e salvar URL
        const resultado = await gerarPropostaSelecaoPDF(
          propostaId,
          {
            razao_social: proposta.fornecedor.razao_social,
            cnpj: proposta.fornecedor.cnpj,
            email: proposta.email || '',
            logradouro: proposta.fornecedor.endereco_comercial?.split(',')[0]?.trim() || '',
            numero: proposta.fornecedor.endereco_comercial?.split('Nº ')[1]?.split(',')[0]?.trim() || '',
            bairro: proposta.fornecedor.endereco_comercial?.split(',')[2]?.trim() || '',
            municipio: proposta.fornecedor.endereco_comercial?.split(',')[3]?.split('/')[0]?.trim() || '',
            uf: proposta.fornecedor.endereco_comercial?.split('/')[1]?.split(',')[0]?.trim() || '',
            cep: proposta.fornecedor.endereco_comercial?.split('CEP: ')[1]?.trim() || ''
          },
          proposta.valor_total_proposta,
          proposta.observacoes_fornecedor,
          selecao?.titulo_selecao || '',
          proposta.data_envio_proposta,
          undefined,
          processo?.criterio_julgamento
        );

        // Salvar URL no banco de dados
        const { error: updateError } = await supabase
          .from('selecao_propostas_fornecedor')
          .update({ url_pdf_proposta: resultado.url })
          .eq('id', propostaId);

        if (updateError) {
          console.error('Erro ao salvar URL do PDF:', updateError);
        }

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
        
        // Recarregar propostas para atualizar a URL
        await loadPropostas();
      }
    } catch (error) {
      console.error("Erro ao baixar proposta:", error);
      toast.error("Erro ao baixar proposta");
    } finally {
      setGerandoPDF(null);
    }
  };

  const handleExcluirProposta = (proposta: PropostaFornecedor) => {
    setPropostaParaExcluir(proposta);
    setConfirmDeleteOpen(true);
  };

  const handleExcluirPropostaCompleta = (proposta: PropostaFornecedor) => {
    setPropostaParaExcluirCompleta(proposta);
    setConfirmDeleteCompletaOpen(true);
  };

  const excluirProposta = async () => {
    if (!propostaParaExcluir) return;
    
    try {
      console.log("🗑️ Iniciando exclusão do PDF da proposta:", propostaParaExcluir.id);
      
      // Deletar PDF do storage se existir
      if (propostaParaExcluir.url_pdf_proposta) {
        // CRÍTICO: Limpar path antes de deletar - remover query params e prefixo do bucket
        const cleanPath = propostaParaExcluir.url_pdf_proposta
          .split('?')[0]
          .replace(/^processo-anexos\//, '')
          .replace(/^.*\/processo-anexos\//, ''); // Remover URL completa se houver
        
        console.log("🗑️ Deletando PDF do storage, path limpo:", cleanPath);
        const { error: storageError } = await supabase.storage
          .from('processo-anexos')
          .remove([cleanPath]);

        if (storageError) {
          console.error('⚠️ Erro ao deletar PDF do storage:', storageError);
          // Continua mesmo com erro para não deixar registro órfão no banco
        } else {
          console.log("✅ PDF deletado do storage");
        }
      }

      // Atualizar proposta para remover URL do PDF
      console.log("🗑️ Removendo URL do PDF da proposta...");
      const { error: updateError } = await supabase
        .from('selecao_propostas_fornecedor')
        .update({ url_pdf_proposta: null })
        .eq('id', propostaParaExcluir.id);

      if (updateError) {
        console.error("❌ Erro ao atualizar proposta:", updateError);
        throw updateError;
      }
      console.log("✅ URL do PDF removida com sucesso");

      setPropostaParaExcluir(null);
      setConfirmDeleteOpen(false);
      
      toast.success("PDF excluído com sucesso");
      
      // Recarregar propostas
      console.log("🔄 Recarregando lista de propostas...");
      await loadPropostas();
      console.log("✅ Lista de propostas recarregada");
      
    } catch (error: any) {
      console.error("❌ Erro ao excluir PDF:", error);
      toast.error(error.message || "Erro ao excluir PDF");
    }
  };

  const excluirPropostaCompleta = async () => {
    if (!propostaParaExcluirCompleta) return;
    
    try {
      console.log("🗑️ Iniciando exclusão completa da proposta:", propostaParaExcluirCompleta.id);
      
      // Deletar PDF do storage se existir
      if (propostaParaExcluirCompleta.url_pdf_proposta) {
        // CRÍTICO: Limpar path antes de deletar - remover query params e prefixo do bucket
        const cleanPath = propostaParaExcluirCompleta.url_pdf_proposta
          .split('?')[0]
          .replace(/^processo-anexos\//, '')
          .replace(/^.*\/processo-anexos\//, ''); // Remover URL completa se houver
        
        console.log("🗑️ Deletando PDF do storage, path limpo:", cleanPath);
        const { error: storageError } = await supabase.storage
          .from('processo-anexos')
          .remove([cleanPath]);
        
        if (storageError) {
          console.error("⚠️ Erro ao deletar PDF do storage:", storageError);
          // Continua mesmo com erro para não deixar registro órfão no banco
        }
      }

      // Deletar itens da proposta primeiro
      console.log("🗑️ Deletando itens da proposta...");
      const { error: itensError } = await supabase
        .from('selecao_respostas_itens_fornecedor')
        .delete()
        .eq('proposta_id', propostaParaExcluirCompleta.id);

      if (itensError) {
        console.error("❌ Erro ao deletar itens:", itensError);
        throw itensError;
      }

      // Deletar a proposta
      console.log("🗑️ Deletando proposta...");
      const { error: propostaError } = await supabase
        .from('selecao_propostas_fornecedor')
        .delete()
        .eq('id', propostaParaExcluirCompleta.id);

      if (propostaError) {
        console.error("❌ Erro ao deletar proposta:", propostaError);
        throw propostaError;
      }
      
      console.log("✅ Proposta excluída com sucesso");

      setPropostaParaExcluirCompleta(null);
      setConfirmDeleteCompletaOpen(false);
      
      toast.success("Proposta excluída com sucesso. O fornecedor poderá enviar nova proposta.");
      
      // Recarregar propostas
      await loadPropostas();
      
    } catch (error: any) {
      console.error("❌ Erro ao excluir proposta:", error);
      toast.error(error.message || "Erro ao excluir proposta");
    }
  };

  // === FUNÇÕES PARA PROPOSTAS REALINHADAS ===
  
  const handleVisualizarPropostaRealinhada = async (proposta: any) => {
    try {
      if (proposta.url_pdf_proposta) {
        // Extrair path relativo
        let path = proposta.url_pdf_proposta;
        if (path.includes('processo-anexos/')) {
          path = path.split('processo-anexos/').pop() || path;
        }
        
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('processo-anexos')
          .download(path);

        if (downloadError) throw downloadError;

        const pdfUrl = URL.createObjectURL(fileData);
        window.open(pdfUrl, '_blank');
        toast.success("Proposta realinhada carregada!");
      } else {
        toast.error("PDF não disponível");
      }
    } catch (error: any) {
      console.error("Erro ao visualizar proposta realinhada:", error);
      toast.error("Erro ao carregar PDF");
    }
  };

  const excluirPropostaRealinhada = async () => {
    if (!propostaRealinhadaParaExcluir) return;
    
    try {
      console.log("🗑️ Excluindo proposta realinhada:", propostaRealinhadaParaExcluir.id);
      
      // Deletar PDF do storage se existir
      if (propostaRealinhadaParaExcluir.url_pdf_proposta) {
        let path = propostaRealinhadaParaExcluir.url_pdf_proposta;
        if (path.includes('processo-anexos/')) {
          path = path.split('processo-anexos/').pop() || path;
        }
        
        const { error: storageError } = await supabase.storage
          .from('processo-anexos')
          .remove([path]);
        
        if (storageError) {
          console.error("⚠️ Erro ao deletar PDF:", storageError);
        }
      }

      // Deletar itens da proposta primeiro
      const { error: itensError } = await (supabase as any)
        .from('propostas_realinhadas_itens')
        .delete()
        .eq('proposta_realinhada_id', propostaRealinhadaParaExcluir.id);

      if (itensError) throw itensError;

      // Deletar a proposta
      const { error: propostaError } = await supabase
        .from('propostas_realinhadas')
        .delete()
        .eq('id', propostaRealinhadaParaExcluir.id);

      if (propostaError) throw propostaError;
      
      console.log("✅ Proposta realinhada excluída");
      
      setPropostaRealinhadaParaExcluir(null);
      setConfirmDeleteRealinhadaOpen(false);
      
      toast.success("Proposta realinhada excluída. O fornecedor poderá enviar nova proposta.");
      
      await loadPropostasRealinhadas();
      
    } catch (error: any) {
      console.error("❌ Erro ao excluir proposta realinhada:", error);
      toast.error(error.message || "Erro ao excluir proposta realinhada");
    }
  };

  const solicitarCorrecao = async () => {
    if (!propostaParaCorrecao || !motivoCorrecao.trim()) {
      toast.error("Por favor, informe o motivo da solicitação de correção");
      return;
    }
    
    try {
      console.log("📝 Solicitando correção da proposta:", propostaParaCorrecao.id);
      
      const { error } = await supabase
        .from('propostas_realinhadas')
        .update({
          correcao_solicitada: true,
          motivo_correcao: motivoCorrecao.trim(),
          data_solicitacao_correcao: new Date().toISOString()
        })
        .eq('id', propostaParaCorrecao.id);

      if (error) throw error;
      
      console.log("✅ Correção solicitada com sucesso");
      
      setPropostaParaCorrecao(null);
      setMotivoCorrecao("");
      setDialogCorrecaoOpen(false);
      
      toast.success("Correção solicitada! O fornecedor poderá editar a proposta.");
      
      await loadPropostasRealinhadas();
      
    } catch (error: any) {
      console.error("❌ Erro ao solicitar correção:", error);
      toast.error(error.message || "Erro ao solicitar correção");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando propostas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <img 
          src={logoHorizontal} 
          alt="Prima Qualitá" 
          className="h-16 object-contain"
        />
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => navigate(`/detalhe-selecao?id=${selecaoId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div>
          <h1 className="text-3xl font-bold">
            {isRealinhadas ? "Propostas Realinhadas" : "Propostas Recebidas"}
          </h1>
          <p className="text-muted-foreground">
            {selecao?.titulo_selecao} - Processo {processo?.numero_processo_interno}
          </p>
        </div>
      </div>

      {/* Informações da Seleção */}
      <Card>
        <CardHeader>
          <CardTitle>Informações da Seleção</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Data da Sessão</p>
            <p className="font-medium">
              {(() => {
                if (!selecao?.data_sessao_disputa) return '';
                const [year, month, day] = selecao.data_sessao_disputa.split('-');
                return `${day}/${month}/${year}`;
              })()} às {selecao?.hora_sessao_disputa}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Critério de Julgamento</p>
            <p className="font-medium capitalize">
              {processo?.criterio_julgamento?.replace('_', ' ')}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant={selecao?.status_selecao === 'encerrada' ? 'default' : 'secondary'}>
              {selecao?.status_selecao}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Propostas Realinhadas */}
      {isRealinhadas ? (
        <Card>
          <CardHeader>
            <CardTitle>Propostas Realinhadas dos Vencedores ({propostasRealinhadas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {propostasRealinhadas.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Nenhuma proposta realinhada enviada ainda</p>
                <p className="text-sm text-muted-foreground mt-2">
                  As propostas realinhadas são enviadas pelos fornecedores vencedores após assinarem a ata.
                </p>
              </div>
            ) : (
              <div className="border border-border/50 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50">
                      <TableHead className="border-r border-border/50">Fornecedor</TableHead>
                      <TableHead className="border-r border-border/50">CNPJ</TableHead>
                      <TableHead className="text-right border-r border-border/50">Valor Total</TableHead>
                      <TableHead className="border-r border-border/50">Data de Envio</TableHead>
                      <TableHead className="border-r border-border/50">Protocolo</TableHead>
                      <TableHead className="border-r border-border/50">Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propostasRealinhadas.map((proposta) => (
                      <TableRow key={proposta.id} className="border-b border-border/50">
                        <TableCell className="font-medium border-r border-border/50">
                          {proposta.fornecedor?.razao_social}
                        </TableCell>
                        <TableCell className="border-r border-border/50">
                          {proposta.fornecedor?.cnpj ? formatCNPJ(proposta.fornecedor.cnpj) : "-"}
                        </TableCell>
                        <TableCell className="text-right border-r border-border/50 font-medium">
                          {formatCurrency(proposta.valor_total_proposta)}
                        </TableCell>
                        <TableCell className="border-r border-border/50">
                          {formatDateTime(proposta.data_envio)}
                        </TableCell>
                        <TableCell className="border-r border-border/50">
                          <span className="text-xs font-mono">{proposta.protocolo || "-"}</span>
                        </TableCell>
                        <TableCell className="border-r border-border/50">
                          {proposta.correcao_solicitada ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                              Correção Solicitada
                            </Badge>
                          ) : (
                            <Badge variant="default">Enviada</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {proposta.url_pdf_proposta && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleVisualizarPropostaRealinhada(proposta)}
                                title="Visualizar PDF"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPropostaParaCorrecao(proposta);
                                setMotivoCorrecao("");
                                setDialogCorrecaoOpen(true);
                              }}
                              title="Solicitar Correção"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setPropostaRealinhadaParaExcluir(proposta);
                                setConfirmDeleteRealinhadaOpen(true);
                              }}
                              title="Excluir Proposta"
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
          </CardContent>
        </Card>
      ) : (
        /* Tabela de Propostas Normais */
        <Card>
          <CardHeader>
            <CardTitle>Propostas dos Fornecedores ({propostas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {propostas.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Nenhuma proposta recebida ainda</p>
              </div>
            ) : (
              <div className="border border-border/50 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50">
                      <TableHead className="border-r border-border/50">Fornecedor</TableHead>
                      <TableHead className="border-r border-border/50">CNPJ</TableHead>
                      {processo?.criterio_julgamento !== "desconto" && (
                        <TableHead className="text-right border-r border-border/50">Valor Total</TableHead>
                      )}
                      <TableHead className="border-r border-border/50">Data de Envio</TableHead>
                      <TableHead className="border-r border-border/50">Status</TableHead>
                      <TableHead className="border-r border-border/50">Proposta PDF</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propostas.map((proposta) => (
                      <TableRow key={proposta.id} className="border-b border-border/50">
                        <TableCell className="font-medium border-r border-border/50">
                          {proposta.fornecedor.razao_social}
                        </TableCell>
                        <TableCell className="border-r border-border/50">{formatCNPJ(proposta.fornecedor.cnpj)}</TableCell>
                        {processo?.criterio_julgamento !== "desconto" && (
                          <TableCell className="border-r border-border/50">
                            <div className="text-right font-medium">
                              {formatCurrency(proposta.valor_total_proposta)}
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="border-r border-border/50">
                          {formatDateTime(proposta.data_envio_proposta)}
                        </TableCell>
                        <TableCell className="border-r border-border/50">
                          {proposta.desclassificado ? (
                            <Badge variant="destructive">Desclassificado</Badge>
                          ) : (
                            <Badge variant="default">Classificado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="border-r border-border/50">
                          {proposta.url_pdf_proposta ? (
                            <div className="flex items-center gap-2 text-sm">
                              <svg 
                                className="h-4 w-4 text-muted-foreground" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round" 
                                  strokeWidth={2} 
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" 
                                />
                              </svg>
                              <span className="truncate max-w-[150px]">
                                proposta_{proposta.fornecedor.cnpj.replace(/[^\d]/g, '').slice(0, 10)}...
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">PDF não gerado</span>
                          )}
                        </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {proposta.url_pdf_proposta ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleVisualizarProposta(proposta.id)}
                                disabled={gerandoPDF === proposta.id}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                {gerandoPDF === proposta.id ? "..." : "Ver"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleBaixarProposta(proposta.id)}
                                disabled={gerandoPDF === proposta.id}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                {gerandoPDF === proposta.id ? "..." : "Baixar"}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleExcluirProposta(proposta)}
                                title="Excluir PDF"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleVisualizarProposta(proposta.id)}
                                disabled={gerandoPDF === proposta.id}
                              >
                                {gerandoPDF === proposta.id ? "Gerando..." : "Gerar PDF"}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleExcluirPropostaCompleta(proposta)}
                                title="Excluir proposta completa"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {propostas.some(p => p.motivo_desclassificacao) && (
            <div className="mt-6">
              <h3 className="font-semibold mb-3">Motivos de Desclassificação</h3>
              <div className="space-y-2">
                {propostas
                  .filter(p => p.desclassificado && p.motivo_desclassificacao)
                  .map(p => (
                    <div key={p.id} className="p-3 bg-muted rounded-md">
                      <p className="font-medium">{p.fornecedor.razao_social}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {p.motivo_desclassificacao}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}
      
      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o PDF da proposta de <strong>{propostaParaExcluir?.fornecedor.razao_social}</strong>?
              <br />
              O PDF poderá ser gerado novamente posteriormente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirProposta} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de Confirmação de Exclusão Completa */}
      <AlertDialog open={confirmDeleteCompletaOpen} onOpenChange={setConfirmDeleteCompletaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Proposta Completa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a proposta completa de <strong>{propostaParaExcluirCompleta?.fornecedor.razao_social}</strong>?
              <br /><br />
              <strong className="text-destructive">Atenção:</strong> Esta ação removerá todos os dados da proposta. O fornecedor poderá enviar uma nova proposta, mas só terá acesso à sessão de lances após o reenvio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirPropostaCompleta} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Proposta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de Confirmação de Exclusão de Proposta Realinhada */}
      <AlertDialog open={confirmDeleteRealinhadaOpen} onOpenChange={setConfirmDeleteRealinhadaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Proposta Realinhada</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a proposta realinhada de <strong>{propostaRealinhadaParaExcluir?.fornecedor?.razao_social}</strong>?
              <br /><br />
              <strong className="text-destructive">Atenção:</strong> Esta ação removerá todos os dados da proposta realinhada. O fornecedor poderá enviar uma nova proposta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirPropostaRealinhada} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Proposta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de Solicitação de Correção */}
      <Dialog open={dialogCorrecaoOpen} onOpenChange={setDialogCorrecaoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Correção da Proposta</DialogTitle>
            <DialogDescription>
              Informe o motivo da solicitação de correção para a proposta de <strong>{propostaParaCorrecao?.fornecedor?.razao_social}</strong>.
              O fornecedor poderá editar e reenviar a proposta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="motivo-correcao">Motivo da Correção</Label>
              <Textarea
                id="motivo-correcao"
                placeholder="Descreva o que precisa ser corrigido na proposta..."
                value={motivoCorrecao}
                onChange={(e) => setMotivoCorrecao(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCorrecaoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={solicitarCorrecao} disabled={!motivoCorrecao.trim()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Solicitar Correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
