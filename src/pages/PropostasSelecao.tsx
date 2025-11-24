import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Download, Trash2 } from "lucide-react";
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
  
  const [propostas, setPropostas] = useState<PropostaFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);
  const [gerandoPDF, setGerandoPDF] = useState<string | null>(null);
  const [propostaParaExcluir, setPropostaParaExcluir] = useState<PropostaFornecedor | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (selecaoId) {
      loadPropostas();
    }
  }, [selecaoId]);

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

      // Se já existe PDF salvo, usar ele diretamente
      if (proposta.url_pdf_proposta) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('processo-anexos')
          .download(proposta.url_pdf_proposta);

        if (downloadError) throw downloadError;

        const pdfUrl = URL.createObjectURL(fileData);
        window.open(pdfUrl, '_blank');
        
        toast.success("Proposta carregada com sucesso!");
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
          proposta.data_envio_proposta
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

      // Se já existe PDF salvo, usar ele diretamente
      if (proposta.url_pdf_proposta) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('processo-anexos')
          .download(proposta.url_pdf_proposta);

        if (downloadError) throw downloadError;

        const pdfUrl = URL.createObjectURL(fileData);
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `proposta-${proposta.fornecedor.cnpj}.pdf`;
        link.click();
        
        toast.success("Proposta baixada com sucesso!");
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
          proposta.data_envio_proposta
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

  const excluirProposta = async () => {
    if (!propostaParaExcluir) return;
    
    try {
      console.log("🗑️ Iniciando exclusão da proposta:", propostaParaExcluir.id);
      
      // Deletar itens da proposta primeiro
      console.log("🗑️ Deletando itens da proposta...");
      const { error: itensError } = await supabase
        .from('selecao_respostas_itens_fornecedor')
        .delete()
        .eq('proposta_id', propostaParaExcluir.id);

      if (itensError) {
        console.error("❌ Erro ao deletar itens:", itensError);
        throw itensError;
      }
      console.log("✅ Itens deletados com sucesso");

      // Deletar PDF do storage se existir
      if (propostaParaExcluir.url_pdf_proposta) {
        console.log("🗑️ Deletando PDF do storage...");
        const { error: storageError } = await supabase.storage
          .from('processo-anexos')
          .remove([propostaParaExcluir.url_pdf_proposta]);

        if (storageError) {
          console.error('⚠️ Erro ao deletar PDF do storage:', storageError);
          // Não bloqueia a exclusão se falhar
        } else {
          console.log("✅ PDF deletado do storage");
        }
      }

      // Deletar proposta
      console.log("🗑️ Deletando proposta...");
      const { error: propostaError } = await supabase
        .from('selecao_propostas_fornecedor')
        .delete()
        .eq('id', propostaParaExcluir.id);

      if (propostaError) {
        console.error("❌ Erro ao deletar proposta:", propostaError);
        throw propostaError;
      }
      console.log("✅ Proposta deletada com sucesso");

      setPropostaParaExcluir(null);
      setConfirmDeleteOpen(false);
      
      toast.success("Proposta excluída com sucesso");
      
      // Recarregar propostas
      console.log("🔄 Recarregando lista de propostas...");
      await loadPropostas();
      console.log("✅ Lista de propostas recarregada");
      
    } catch (error: any) {
      console.error("❌ Erro ao excluir proposta:", error);
      toast.error(error.message || "Erro ao excluir proposta");
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
          <h1 className="text-3xl font-bold">Propostas Recebidas</h1>
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

      {/* Tabela de Propostas */}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Data de Envio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Proposta PDF</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propostas.map((proposta) => (
                  <TableRow key={proposta.id}>
                    <TableCell className="font-medium">
                      {proposta.fornecedor.razao_social}
                    </TableCell>
                    <TableCell>{formatCNPJ(proposta.fornecedor.cnpj)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(proposta.valor_total_proposta)}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(proposta.data_envio_proposta)}
                    </TableCell>
                    <TableCell>
                      {proposta.desclassificado ? (
                        <Badge variant="destructive">Desclassificado</Badge>
                      ) : (
                        <Badge variant="default">Classificado</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {proposta.url_pdf_proposta && (
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
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVisualizarProposta(proposta.id)}
                          disabled={gerandoPDF === proposta.id}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          {gerandoPDF === proposta.id ? "Gerando..." : "Ver"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBaixarProposta(proposta.id)}
                          disabled={gerandoPDF === proposta.id}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {gerandoPDF === proposta.id ? "Gerando..." : "Baixar"}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleExcluirProposta(proposta)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      
      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a proposta de <strong>{propostaParaExcluir?.fornecedor.razao_social}</strong>?
              <br />
              Esta ação não pode ser desfeita e o fornecedor poderá enviar uma nova proposta.
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
    </div>
  );
}
