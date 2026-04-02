import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Download, ChevronRight, ArrowLeft, FileCheck, Edit, Trash2, Users, FolderOpen, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { stripHtml } from "@/lib/htmlUtils";
import { DialogAnaliseCompliance } from "@/components/compliance/DialogAnaliseCompliance";
import { DialogAvaliacaoCadastro } from "@/components/compliance/DialogAvaliacaoCadastro";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AnoReferenciaFilter, extrairAnos, filtrarPorAno } from "@/components/AnoReferenciaFilter";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  cor_fundo?: string | null;
}

interface ProcessoCompliance {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  cotacao_id: string;
  titulo_cotacao: string;
  criterio_julgamento: string;
  data_envio_compliance: string;
  respondido_compliance: boolean;
  ano_referencia: number;
  tem_analise: boolean;
}

interface AvaliacaoCadastro {
  id: string;
  fornecedor_id: string;
  status_avaliacao: string;
  score_risco_total: number | null;
  classificacao_risco: string | null;
  observacoes_compliance: string | null;
  data_envio: string;
  data_resposta: string | null;
  fornecedor?: {
    razao_social: string;
    cnpj: string;
    email: string;
  };
}

export default function Compliance() {
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGestao | null>(null);
  const [processos, setProcessos] = useState<Record<string, ProcessoCompliance[]>>({});
  const [avaliacoesCadastro, setAvaliacoesCadastro] = useState<AvaliacaoCadastro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [anoSelecionado, setAnoSelecionado] = useState("todos");
  const [filtroAvaliacoes, setFiltroAvaliacoes] = useState("");
  const [analiseDialogOpen, setAnaliseDialogOpen] = useState(false);
  const [avaliacaoDialogOpen, setAvaliacaoDialogOpen] = useState(false);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoCompliance | null>(null);
  const [avaliacaoSelecionada, setAvaliacaoSelecionada] = useState<AvaliacaoCadastro | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [analiseParaDeletar, setAnaliseParaDeletar] = useState<string | null>(null);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [activeTab, setActiveTab] = useState("processos");

  useEffect(() => {
    loadData();
    loadAvaliacoesCadastro();
    
    const handleFocus = () => {
      loadData();
      loadAvaliacoesCadastro();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const loadAvaliacoesCadastro = async () => {
    try {
      const { data, error } = await supabase
        .from("avaliacoes_cadastro_fornecedor")
        .select(`
          *,
          fornecedor:fornecedores (razao_social, cnpj, email)
        `)
        .order("data_envio", { ascending: false });

      if (error) throw error;
      setAvaliacoesCadastro(data || []);
    } catch (error) {
      console.error("Erro ao carregar avaliações de cadastro:", error);
    }
  };

  const handleAbrirAvaliacaoCadastro = (avaliacao: AvaliacaoCadastro) => {
    setAvaliacaoSelecionada(avaliacao);
    setAvaliacaoDialogOpen(true);
  };

  const avaliacoesFiltradas = avaliacoesCadastro.filter((av) =>
    av.fornecedor?.razao_social?.toLowerCase().includes(filtroAvaliacoes.toLowerCase()) ||
    av.fornecedor?.cnpj?.includes(filtroAvaliacoes)
  );

  const loadData = async () => {
    try {
      console.log("📊 [Compliance] Iniciando carregamento de dados...");
      
      // Buscar todos os contratos
      const { data: contratosData, error: contratosError } = await supabase
        .from("contratos_gestao")
        .select("*")
        .order("nome_contrato");

      if (contratosError) throw contratosError;

      // Buscar processos enviados ao compliance
      const { data: processosData, error: processosError } = await supabase
        .from("processos_compras")
        .select(`
          id,
          numero_processo_interno,
          objeto_resumido,
          contrato_gestao_id,
          ano_referencia,
          cotacoes_precos!inner (
            id,
            titulo_cotacao,
            criterio_julgamento,
            data_envio_compliance,
            respondido_compliance
          )
        `)
        .eq("cotacoes_precos.enviado_compliance", true);

      if (processosError) throw processosError;

      console.log("📋 [Compliance] Processos carregados:", processosData?.length || 0);

      // Buscar IDs de cotações que têm análise
      // Como a tabela pode não existir no schema, vamos tentar e capturar erro
      let cotacoesComAnalise = new Set<string>();
      
      try {
        const { data: analisesData, error: analisesError } = await supabase
          .from("analises_compliance" as any)
          .select("cotacao_id");
        
        if (!analisesError && analisesData) {
          analisesData.forEach((analise: any) => {
            cotacoesComAnalise.add(analise.cotacao_id);
          });
          console.log("✅ [Compliance] Análises encontradas:", cotacoesComAnalise.size);
        }
      } catch (e) {
        console.log("⚠️ [Compliance] Tabela analises_compliance não disponível ou erro ao buscar");
      }

      // Agrupar processos por contrato
      const processosAgrupados: Record<string, ProcessoCompliance[]> = {};
      
      processosData?.forEach((processo: any) => {
        const contratoId = processo.contrato_gestao_id;
        
        processo.cotacoes_precos?.forEach((cotacao: any) => {
          if (!processosAgrupados[contratoId]) {
            processosAgrupados[contratoId] = [];
          }
          
          const processoCompliance = {
            id: processo.id,
            numero_processo_interno: processo.numero_processo_interno,
            objeto_resumido: processo.objeto_resumido,
            cotacao_id: cotacao.id,
            titulo_cotacao: cotacao.titulo_cotacao,
            criterio_julgamento: cotacao.criterio_julgamento,
            data_envio_compliance: cotacao.data_envio_compliance,
            respondido_compliance: cotacao.respondido_compliance,
            ano_referencia: processo.ano_referencia,
            tem_analise: cotacoesComAnalise.has(cotacao.id),
          };
          
          console.log(`  📄 Processo ${processo.numero_processo_interno}:`, {
            cotacao_id: cotacao.id,
            respondido: cotacao.respondido_compliance,
            tem_analise: processoCompliance.tem_analise
          });
          
          processosAgrupados[contratoId].push(processoCompliance);
        });
      });

      setContratos(contratosData || []);
      setProcessos(processosAgrupados);
      
      console.log("✅ [Compliance] Carregamento concluído");
    } catch (error: any) {
      console.error("❌ [Compliance] Erro ao carregar processos:", error);
      toast.error("Erro ao carregar processos de compliance");
    } finally {
      setLoading(false);
    }
  };


  const visualizarProcesso = async (processo: ProcessoCompliance) => {
    const loadingToast = toast.loading("Gerando visualização do processo...");
    
    try {
      console.log(`📊 [Compliance] Iniciando visualização do processo ${processo.numero_processo_interno}`);
      console.log(`📊 [Compliance] Cotação ID: ${processo.cotacao_id}`);
      
      // Usar função específica para compliance que NÃO inclui documentos de habilitação
      const { gerarProcessoCompliancePDF } = await import("@/lib/gerarProcessoCompliancePDF");
      const resultado = await gerarProcessoCompliancePDF(
        processo.cotacao_id,
        processo.numero_processo_interno,
        true // temporário = true para não salvar no storage
      );
      
      if (!resultado.blob) {
        console.error("❌ Blob não encontrado no resultado:", resultado);
        throw new Error("PDF não foi gerado corretamente");
      }
      
      console.log(`✅ [Compliance] Blob recebido, tamanho: ${resultado.blob.size} bytes`);
      
      // Criar URL temporária do blob
      const blobUrl = window.URL.createObjectURL(resultado.blob);
      console.log(`✅ [Compliance] Blob URL criado: ${blobUrl}`);
      
      toast.dismiss(loadingToast);
      toast.success("Abrindo processo...");
      
      // Tentar abrir em nova aba
      console.log(`🔗 [Compliance] Tentando abrir window.open...`);
      const newWindow = window.open(blobUrl, '_blank');
      
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        // Pop-up foi bloqueado, usar fallback com link
        console.warn("⚠️ [Compliance] Pop-up bloqueado, usando fallback com link...");
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.target = '_blank';
        link.download = resultado.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`✅ [Compliance] Link clicado com sucesso`);
        
        // Liberar após delay
        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
          console.log(`🗑️ [Compliance] Blob URL liberado`);
        }, 60000);
      } else {
        console.log(`✅ [Compliance] Janela aberta com sucesso`);
        
        // Liberar o blob URL quando a aba for fechada
        newWindow.addEventListener('beforeunload', () => {
          window.URL.revokeObjectURL(blobUrl);
          console.log(`🗑️ [Compliance] Blob URL liberado (aba fechada)`);
        });
        
        // Fallback: liberar após 1 minuto
        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
          console.log(`🗑️ [Compliance] Blob URL liberado (timeout)`);
        }, 60000);
      }
      
    } catch (error: any) {
      console.error("❌ [Compliance] Erro ao visualizar processo:", error);
      console.error("Stack:", error?.stack);
      toast.dismiss(loadingToast);
      toast.error(`Erro ao gerar visualização: ${error?.message || 'Erro desconhecido'}`);
    }
  };


  const editarAnalise = async (processo: ProcessoCompliance, isEditMode: boolean = false) => {
    setProcessoSelecionado(processo);
    setModoEdicao(isEditMode);
    setAnaliseDialogOpen(true);
  };

  const confirmarExclusaoAnalise = async (cotacaoId: string) => {
    setAnaliseParaDeletar(cotacaoId);
    setDeleteDialogOpen(true);
  };

  const excluirAnalise = async () => {
    if (!analiseParaDeletar) return;

    try {
      console.log("🗑️ [Compliance] Excluindo análise para cotação:", analiseParaDeletar);
      
      // Buscar a análise mais recente para essa cotação
      const { data: analise, error: fetchError } = await supabase
        .from("analises_compliance")
        .select("id, url_documento")
        .eq("cotacao_id", analiseParaDeletar)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      if (!analise) {
        toast.error("Análise não encontrada");
        return;
      }

      // Deletar arquivo do storage primeiro
      if (analise.url_documento) {
        try {
          const path = analise.url_documento.replace('documents/', '');
          const { error: storageError } = await supabase.storage
            .from("documents")
            .remove([path]);
          
          if (storageError) {
            console.error("❌ [Compliance] Erro ao deletar arquivo do storage:", storageError);
          } else {
            console.log("✅ [Compliance] Arquivo deletado do storage");
          }
        } catch (err) {
          console.log("⚠️ [Compliance] Erro ao deletar arquivo:", err);
        }
      }

      // Deletar registro do banco APENAS da análise específica
      const { error } = await supabase
        .from("analises_compliance")
        .delete()
        .eq("id", analise.id);

      if (error) {
        console.error("❌ [Compliance] Erro ao deletar:", error);
        toast.error(`Erro ao excluir: ${error.message}`);
        return;
      }

      console.log("✅ [Compliance] Análise deletada do banco");

      // Verificar se ainda existem outras análises para essa cotação
      const { data: analisesRestantes, error: checkError } = await supabase
        .from("analises_compliance")
        .select("id")
        .eq("cotacao_id", analiseParaDeletar)
        .limit(1);

      if (checkError) {
        console.error("❌ [Compliance] Erro ao verificar análises restantes:", checkError);
      }

      // Apenas resetar status se não houver mais nenhuma análise
      if (!analisesRestantes || analisesRestantes.length === 0) {
        console.log("📝 [Compliance] Nenhuma análise restante, resetando status...");
        
        const { error: updateError } = await supabase
          .from("cotacoes_precos")
          .update({
            respondido_compliance: false,
            enviado_compliance: false,
            data_resposta_compliance: null
          })
          .eq("id", analiseParaDeletar);

        if (updateError) {
          console.error("❌ [Compliance] Erro ao resetar status:", updateError);
          throw updateError;
        }

        console.log("✅ [Compliance] Status resetado");
      } else {
        console.log("📝 [Compliance] Ainda existem análises, mantendo status");
      }

      toast.success("Análise excluída com sucesso");
      setDeleteDialogOpen(false);
      setAnaliseParaDeletar(null);
      
      // Recarregar dados com delay para garantir propagação no banco
      setTimeout(() => {
        console.log("🔄 [Compliance] Recarregando dados após exclusão...");
        loadData();
      }, 300);
    } catch (error: any) {
      console.error("❌ [Compliance] Erro ao excluir análise:", error);
      toast.error(`Erro ao excluir: ${error.message || 'Erro desconhecido'}`);
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const contratosFiltrados = contratos.filter((contrato) =>
    contrato.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    contrato.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : !contratoSelecionado ? (
          <Card>
            <CardHeader>
              <CardTitle>Compliance</CardTitle>
              <CardDescription>
                Gerencie análises de processos e cadastros de fornecedores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="processos" className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Análises de Processos
                    {Object.values(processos).flat().filter(p => !p.respondido_compliance).length > 0 && (
                      <Badge variant="destructive" className="ml-1">
                        {Object.values(processos).flat().filter(p => !p.respondido_compliance).length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="cadastros" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Avaliação de Cadastros
                    {avaliacoesCadastro.filter(a => a.status_avaliacao === "pendente").length > 0 && (
                      <Badge variant="destructive" className="ml-1">
                        {avaliacoesCadastro.filter(a => a.status_avaliacao === "pendente").length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="processos">
                  <Input
                    placeholder="Buscar por nome ou ente federativo..."
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    className="mb-4"
                  />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Contrato</TableHead>
                    <TableHead>Ente Federativo</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        Processos Pendentes
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[220px] text-xs"><p>Processos enviados ao Compliance que ainda aguardam análise e resposta.</p></TooltipContent></Tooltip></TooltipProvider>
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        Processos Respondidos
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[220px] text-xs"><p>Processos que já foram analisados e respondidos pelo Compliance.</p></TooltipContent></Tooltip></TooltipProvider>
                      </div>
                    </TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.map((contrato, index) => {
                    const processosContrato = processos[contrato.id] || [];
                    const pendentes = processosContrato.filter(p => !p.respondido_compliance).length;
                    const respondidos = processosContrato.filter(p => p.respondido_compliance).length;
                    
                    return (
                      <TableRow key={contrato.id} className={index % 2 === 0 ? "bg-green-100 dark:bg-green-900/40" : "bg-blue-100 dark:bg-blue-900/40"}>
                        <TableCell className="font-medium">{contrato.nome_contrato}</TableCell>
                        <TableCell>{contrato.ente_federativo}</TableCell>
                        <TableCell>
                          {pendentes > 0 ? (
                            <Badge variant="destructive">{pendentes}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {respondidos > 0 ? (
                            <Badge variant="default">{respondidos}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setContratoSelecionado(contrato)}
                          >
                            Ver Processos
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {contratosFiltrados.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum contrato encontrado
                </p>
              )}
                </TabsContent>

                <TabsContent value="cadastros">
                  <Input
                    placeholder="Buscar por razão social ou CNPJ..."
                    value={filtroAvaliacoes}
                    onChange={(e) => setFiltroAvaliacoes(e.target.value)}
                    className="mb-4"
                  />
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>CNPJ</TableHead>
                        <TableHead>Data Envio</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Classificação</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {avaliacoesFiltradas.map((avaliacao) => (
                        <TableRow key={avaliacao.id}>
                          <TableCell className="font-medium">{avaliacao.fornecedor?.razao_social}</TableCell>
                          <TableCell>{avaliacao.fornecedor?.cnpj}</TableCell>
                          <TableCell>{formatarData(avaliacao.data_envio)}</TableCell>
                          <TableCell>
                            {avaliacao.status_avaliacao === "pendente" ? (
                              <Badge variant="destructive">Pendente</Badge>
                            ) : (
                              <Badge variant="default">Respondido</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {avaliacao.classificacao_risco ? (
                              <Badge 
                                variant="outline"
                                className={
                                  avaliacao.classificacao_risco === "satisfatorio" 
                                    ? "bg-green-500/10 text-green-600 border-green-500/30" 
                                    : avaliacao.classificacao_risco === "medio"
                                    ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                                    : "bg-red-500/10 text-red-600 border-red-500/30"
                                }
                              >
                                {avaliacao.classificacao_risco === "satisfatorio" 
                                  ? "Baixo" 
                                  : avaliacao.classificacao_risco === "medio"
                                  ? "Médio"
                                  : "Alto"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAbrirAvaliacaoCadastro(avaliacao)}
                            >
                              {avaliacao.status_avaliacao === "pendente" ? "Analisar" : "Ver Análise"}
                              <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {avaliacoesFiltradas.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma avaliação de cadastro encontrada
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setContratoSelecionado(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <CardTitle>{contratoSelecionado.nome_contrato}</CardTitle>
                  <CardDescription>{contratoSelecionado.ente_federativo}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const allProcessos = processos[contratoSelecionado.id] || [];
                const anos = extrairAnos(allProcessos, p => p.ano_referencia);
                const filtrados = filtrarPorAno(allProcessos, anoSelecionado, p => p.ano_referencia);
                return (
                  <>
                    <AnoReferenciaFilter anos={anos} anoSelecionado={anoSelecionado} onAnoChange={setAnoSelecionado} />
              {filtrados.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Processo</TableHead>
                      <TableHead>Objeto</TableHead>
                      <TableHead>Cotação</TableHead>
                      <TableHead>Data Envio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...filtrados]
                      .sort((a, b) => a.numero_processo_interno.localeCompare(b.numero_processo_interno, undefined, { numeric: true }))
                      .map((processo) => (
                      <TableRow key={`${processo.id}-${processo.cotacao_id}`}>
                        <TableCell className="font-medium">
                          {processo.numero_processo_interno}
                        </TableCell>
                        <TableCell className="max-w-md">
                          {stripHtml(processo.objeto_resumido)}
                        </TableCell>
                        <TableCell>{processo.titulo_cotacao}</TableCell>
                        <TableCell>
                          {formatarData(processo.data_envio_compliance)}
                        </TableCell>
                        <TableCell>
                          {processo.respondido_compliance ? (
                            <Badge variant="default">Respondido</Badge>
                          ) : (
                            <Badge variant="destructive">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 justify-center flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => visualizarProcesso(processo)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Visualizar Processo
                            </Button>
                            {processo.tem_analise ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => editarAnalise(processo, true)}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar Análise
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => editarAnalise(processo, false)}
                                >
                                  <FileCheck className="h-4 w-4 mr-2" />
                                  Nova Análise (Novas Empresas)
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => confirmarExclusaoAnalise(processo.cotacao_id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => editarAnalise(processo, false)}
                              >
                                <FileCheck className="h-4 w-4 mr-2" />
                                Fazer Análise
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum processo enviado ao compliance neste contrato
                </p>
              )}
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {processoSelecionado && (
          <DialogAnaliseCompliance
            open={analiseDialogOpen}
            onOpenChange={setAnaliseDialogOpen}
            processoId={processoSelecionado.id}
            cotacaoId={processoSelecionado.cotacao_id}
            numeroProcesso={processoSelecionado.numero_processo_interno}
            objetoDescricao={stripHtml(processoSelecionado.objeto_resumido)}
            criterioJulgamento={processoSelecionado.criterio_julgamento}
            isEditMode={modoEdicao}
          />
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta análise de compliance? Esta ação não pode ser desfeita.
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

        <DialogAvaliacaoCadastro
          open={avaliacaoDialogOpen}
          onOpenChange={setAvaliacaoDialogOpen}
          avaliacao={avaliacaoSelecionada}
          onSuccess={() => loadAvaliacoesCadastro()}
        />
      </div>
    </div>
  );
}
