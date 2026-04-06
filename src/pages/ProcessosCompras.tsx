import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Plus, Edit, Trash2, FileText, Paperclip, ChevronRight, AlertTriangle, Download, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { DialogContrato } from "@/components/contratos/DialogContrato";
import { DialogProcesso } from "@/components/processos/DialogProcesso";
import { DialogAnexosProcesso } from "@/components/processos/DialogAnexosProcesso";
import { stripHtml, truncateText } from "@/lib/htmlUtils";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import { AnoReferenciaFilter, extrairAnos, filtrarPorAno } from "@/components/AnoReferenciaFilter";
import { DialogRelatorioCompras } from "@/components/processos/DialogRelatorioCompras";

interface Contrato {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  data_inicio: string;
  data_fim: string;
  status: "ativo" | "encerrado" | "suspenso";
  observacoes?: string;
  cor_fundo?: string;
}

interface Processo {
  id: string;
  contrato_gestao_id: string;
  ano_referencia: number;
  numero_processo_interno: string;
  objeto_resumido: string;
  tipo: "material" | "servico" | "mao_obra_exclusiva" | "outros";
  centro_custo?: string;
  valor_estimado_anual: number;
  valor_total_cotacao?: number;
  status_processo: "planejado" | "em_cotacao" | "cotacao_concluida" | "em_selecao" | "contratado" | "concluido" | "cancelado" | "contratacao";
  data_abertura?: string;
  data_encerramento_prevista?: string;
  observacoes?: string;
  requer_cotacao?: boolean;
  requer_selecao?: boolean;
  criterio_julgamento?: string;
  credenciamento?: boolean;
  contratacao_especifica?: boolean;
}

const ProcessosCompras = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isGestor, setIsGestor] = useState(false);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);
  const [isGerenteContratos, setIsGerenteContratos] = useState(false);
  const [isCompliance, setIsCompliance] = useState(false);
  const [isSuperintendenteExecutivo, setIsSuperintendenteExecutivo] = useState(false);
  const [contratosVinculados, setContratosVinculados] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const abrirAnexosProcessado = useRef(false);
  
  // Estados para contratos
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [filtroContrato, setFiltroContrato] = useState("");
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [dialogContratoOpen, setDialogContratoOpen] = useState(false);
  const [contratoParaEditar, setContratoParaEditar] = useState<Contrato | null>(null);
  const [contratoParaExcluir, setContratoParaExcluir] = useState<string | null>(null);
  const [etapaConfirmacaoContrato, setEtapaConfirmacaoContrato] = useState<1 | 2>(1);
  
  // Estados para processos
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [filtroProcesso, setFiltroProcesso] = useState("");
  const [anoSelecionado, setAnoSelecionado] = useState("todos");
  const [dialogProcessoOpen, setDialogProcessoOpen] = useState(false);
  const [processoParaEditar, setProcessoParaEditar] = useState<Processo | null>(null);
  const [processoParaExcluir, setProcessoParaExcluir] = useState<string | null>(null);
  const [dialogAnexosOpen, setDialogAnexosOpen] = useState(false);
  const [dialogRelatorioOpen, setDialogRelatorioOpen] = useState(false);
  const [processoParaAnexos, setProcessoParaAnexos] = useState<Processo | null>(null);
  const [processosCountPorContrato, setProcessosCountPorContrato] = useState<Record<string, { abertos: number; fechados: number }>>({});

  // Verifica se é usuário interno com permissões completas
  // Se tem perfis como compliance, superintendente, gestor ou colaborador, tem acesso total
  const temPerfilAcessoTotal = isGestor || isCompliance || isSuperintendenteExecutivo;
  const isUsuarioInterno = temPerfilAcessoTotal || (!isGerenteContratos && !isResponsavelLegal);

  // Permissão para editar/excluir Contrato de Gestão: apenas Compliance ou Superintendente Executivo
  // Gestor NÃO pode editar/excluir contrato de gestão, a menos que tenha cumulativamente um desses perfis
  const podeEditarContratoGestao = isCompliance || isSuperintendenteExecutivo;

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (userId && !loading) {
      loadContratos();
    }
  }, [userId, loading, contratosVinculados]);

  useEffect(() => {
    if (contratos.length > 0) {
      loadProcessosCountPorContrato();
    }
  }, [contratos]);

  const loadProcessosCountPorContrato = async () => {
    try {
      const contratosIds = contratos.map(c => c.id);
      const { data: processos } = await supabase
        .from("processos_compras")
        .select("id, contrato_gestao_id, status_processo")
        .in("contrato_gestao_id", contratosIds);

      if (!processos || processos.length === 0) {
        setProcessosCountPorContrato({});
        return;
      }

      const counts: Record<string, { abertos: number; fechados: number }> = {};
      contratosIds.forEach(id => { counts[id] = { abertos: 0, fechados: 0 }; });

      processos.forEach(p => {
        if (!counts[p.contrato_gestao_id]) return;
        if (p.status_processo === 'concluido') {
          counts[p.contrato_gestao_id].fechados++;
        } else {
          counts[p.contrato_gestao_id].abertos++;
        }
      });

      setProcessosCountPorContrato(counts);
    } catch (error) {
      console.error("Erro ao carregar contagem de processos:", error);
    }
  };

  useEffect(() => {
    if (contratoSelecionado) {
      loadProcessos(contratoSelecionado.id);
    }
  }, [contratoSelecionado]);

  // Auto-abrir anexos de um processo quando vindo de notificação
  useEffect(() => {
    const abrirAnexosId = searchParams.get("abrirAnexos");
    if (!abrirAnexosId || abrirAnexosProcessado.current || loading) return;
    if (contratos.length === 0) return;

    const abrirAnexosAutomaticamente = async () => {
      abrirAnexosProcessado.current = true;
      // Limpar o param da URL
      searchParams.delete("abrirAnexos");
      setSearchParams(searchParams, { replace: true });

      try {
        // Buscar o processo pelo ID
        const { data: processo, error } = await supabase
          .from("processos_compras")
          .select("*")
          .eq("id", abrirAnexosId)
          .single();

        if (error || !processo) {
          toast({ title: "Processo não encontrado", variant: "destructive" });
          return;
        }

        // Selecionar o contrato correspondente
        const contrato = contratos.find(c => c.id === processo.contrato_gestao_id);
        if (contrato) {
          setContratoSelecionado(contrato);
        }

        // Aguardar um tick para o estado atualizar, então abrir o dialog
        setTimeout(() => {
          setProcessoParaAnexos(processo as Processo);
          setDialogAnexosOpen(true);
        }, 300);
      } catch (err) {
        console.error("Erro ao abrir anexos automaticamente:", err);
      }
    };

    abrirAnexosAutomaticamente();
  }, [searchParams, contratos, loading]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    setUserId(session.user.id);

    // Verificar se é gestor
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "gestor")
      .maybeSingle();

    setIsGestor(!!roleData);

    // Verificar se é gestor ou colaborador (usuário interno)
    const { data: colaboradorData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .in("role", ["gestor", "colaborador"])
      .maybeSingle();

    const isUsuarioInternoCheck = !!colaboradorData;

    // Verificar se é responsável legal, compliance ou superintendente executivo
    const { data: profileData } = await supabase
      .from("profiles")
      .select("responsavel_legal, gerente_contratos, compliance, superintendente_executivo, controle_compras")
      .eq("id", session.user.id)
      .maybeSingle();

    // RL só é restrito se for APENAS RL (sem outros perfis com permissão de edição)
    const isRL = !!profileData?.responsavel_legal;
    const hasOtherEditRoles = isUsuarioInternoCheck || !!profileData?.compliance || !!profileData?.superintendente_executivo;
    setIsResponsavelLegal(isRL && !hasOtherEditRoles);
    setIsCompliance(!!profileData?.compliance);
    setIsSuperintendenteExecutivo(!!profileData?.superintendente_executivo);

    // Se é gerente de contratos e NÃO tem outros perfis com acesso total
    // (gestor/colaborador/compliance/superintendente), restringe aos contratos vinculados
    const temAcessoTotal = isUsuarioInternoCheck || !!profileData?.compliance || !!profileData?.superintendente_executivo || !!profileData?.controle_compras;
    if (profileData?.gerente_contratos && !temAcessoTotal) {
      const { data: vinculos } = await supabase
        .from("gerentes_contratos_gestao")
        .select("contrato_gestao_id")
        .eq("usuario_id", session.user.id);

      if (vinculos && vinculos.length > 0) {
        setIsGerenteContratos(true);
        setContratosVinculados(vinculos.map(v => v.contrato_gestao_id));
      } else {
        setIsGerenteContratos(false);
        setContratosVinculados([]);
      }
    } else {
      setIsGerenteContratos(false);
      setContratosVinculados([]);
    }

    setLoading(false);
  };

  const loadContratos = async () => {
    try {
      let query = supabase
        .from("contratos_gestao")
        .select("*")
        .order("nome_contrato");

      // Gerente de Contratos só vê seus contratos vinculados quando for APENAS gerente
      const restringirPorGerente = isGerenteContratos && !isGestor && !isCompliance && !isSuperintendenteExecutivo;
      if (restringirPorGerente && contratosVinculados.length > 0) {
        query = query.in("id", contratosVinculados);
      }

      const { data, error } = await query;

      if (error) throw error;
      setContratos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar contratos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadProcessos = async (contratoId: string) => {
    try {
      const { data, error } = await supabase
        .from("processos_compras")
        .select("*")
        .eq("contrato_gestao_id", contratoId)
        .order("numero_processo_interno", { ascending: true });

      if (error) throw error;
      setProcessos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar processos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSaveContrato = async (contrato: Omit<Contrato, "id">) => {
    try {
      if (contratoParaEditar) {
        const { error } = await supabase
          .from("contratos_gestao")
          .update(contrato)
          .eq("id", contratoParaEditar.id);

        if (error) throw error;
        
        // Auditoria de edição
        await registrarAuditoria({
          acao: "edição",
          entidade: "Contrato de Gestão",
          entidade_id: contratoParaEditar.id,
          detalhes: {
            tipo: "Contrato de Gestão",
            nome_arquivo: contrato.nome_contrato,
            contrato_gestao: contrato.nome_contrato,
            ente_federativo: contrato.ente_federativo,
          },
        });
        
        toast({ title: "Contrato atualizado com sucesso!" });
      } else {
        const { data, error } = await supabase.from("contratos_gestao").insert([contrato]).select().single();
        if (error) throw error;
        
        // Auditoria de criação
        await registrarAuditoria({
          acao: "criação",
          entidade: "Contrato de Gestão",
          entidade_id: data.id,
          detalhes: {
            tipo: "Contrato de Gestão",
            nome_arquivo: contrato.nome_contrato,
            contrato_gestao: contrato.nome_contrato,
            ente_federativo: contrato.ente_federativo,
          },
        });
        
        toast({ title: "Contrato criado com sucesso!" });
      }
      loadContratos();
      setContratoParaEditar(null);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar contrato",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteContrato = async () => {
    if (!contratoParaExcluir) return;

    try {
      // Buscar dados do contrato antes de deletar para auditoria
      const contratoParaLog = contratos.find(c => c.id === contratoParaExcluir);
      
      const { error } = await supabase
        .from("contratos_gestao")
        .delete()
        .eq("id", contratoParaExcluir);

      if (error) throw error;
      
      // Auditoria de exclusão
      if (contratoParaLog) {
        await registrarAuditoria({
          acao: "exclusão",
          entidade: "Contrato de Gestão",
          entidade_id: contratoParaExcluir,
          detalhes: {
            tipo: "Contrato de Gestão",
            nome_arquivo: contratoParaLog.nome_contrato,
            contrato_gestao: contratoParaLog.nome_contrato,
            ente_federativo: contratoParaLog.ente_federativo,
          },
        });
      }
      
      toast({ title: "Contrato excluído com sucesso!" });
      loadContratos();
      if (contratoSelecionado?.id === contratoParaExcluir) {
        setContratoSelecionado(null);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao excluir contrato",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setContratoParaExcluir(null);
    }
  };

  const handleSaveProcesso = async (processo: Omit<Processo, "id">) => {
    try {
      if (processoParaEditar) {
        const { error } = await supabase
          .from("processos_compras")
          .update(processo)
          .eq("id", processoParaEditar.id);

        if (error) throw error;

        // Sincronizar descricao_cotacao das cotações vinculadas ao processo
        try {
          const objetoTexto = stripHtml(processo.objeto_resumido);
          await supabase
            .from("cotacoes_precos")
            .update({ descricao_cotacao: objetoTexto })
            .eq("processo_compra_id", processoParaEditar.id);
        } catch (syncError) {
          console.error("Erro ao sincronizar descrição das cotações:", syncError);
        }
        
        // Auditoria de edição
        await registrarAuditoria({
          acao: "edição",
          entidade: "processos_compras",
          entidade_id: processoParaEditar.id,
          detalhes: {
            tipo: "Processo de Compra",
            numero_processo: processo.numero_processo_interno,
            objeto: stripHtml(processo.objeto_resumido).substring(0, 100),
            contrato_gestao: contratoSelecionado?.nome_contrato || "N/A",
          },
        });
        
        toast({ title: "Processo atualizado com sucesso!" });
      } else {
        const { data, error } = await supabase.from("processos_compras").insert([processo]).select().single();
        if (error) throw error;
        
        // Auditoria de criação
        await registrarAuditoria({
          acao: "criação",
          entidade: "processos_compras",
          entidade_id: data.id,
          detalhes: {
            tipo: "Processo de Compra",
            numero_processo: processo.numero_processo_interno,
            objeto: stripHtml(processo.objeto_resumido).substring(0, 100),
            contrato_gestao: contratoSelecionado?.nome_contrato || "N/A",
          },
        });
        
        toast({ title: "Processo criado com sucesso!" });
      }
      if (contratoSelecionado) {
        loadProcessos(contratoSelecionado.id);
      }
      setProcessoParaEditar(null);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar processo",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteProcesso = async () => {
    if (!processoParaExcluir) return;

    try {
      // Buscar dados do processo antes de deletar para auditoria
      const processoParaLog = processos.find(p => p.id === processoParaExcluir);
      
      // 1. Deletar todos os arquivos relacionados ao processo
      const { data: resultDeletar, error: errorDeletar } = await supabase.functions.invoke(
        'deletar-processo',
        {
          body: { processoId: processoParaExcluir }
        }
      );

      if (errorDeletar) {
        console.error('Erro ao deletar arquivos:', errorDeletar);
        toast({
          title: "Erro ao deletar arquivos do processo",
          description: errorDeletar.message,
          variant: "destructive",
        });
        return;
      }

      console.log('Arquivos deletados:', resultDeletar);

      // 2. Deletar o processo do banco
      const { error } = await supabase
        .from("processos_compras")
        .delete()
        .eq("id", processoParaExcluir);

      if (error) throw error;
      
      // Auditoria de exclusão
      if (processoParaLog) {
        await registrarAuditoria({
          acao: "exclusão",
          entidade: "processos_compras",
          entidade_id: processoParaExcluir,
          detalhes: {
            tipo: "Processo de Compra",
            numero_processo: processoParaLog.numero_processo_interno,
            objeto: stripHtml(processoParaLog.objeto_resumido).substring(0, 100),
            contrato_gestao: contratoSelecionado?.nome_contrato || "N/A",
          },
        });
      }
      
      toast({ 
        title: "Processo excluído com sucesso!",
        description: `${resultDeletar?.arquivosDeletados || 0} arquivos removidos`
      });
      
      if (contratoSelecionado) {
        loadProcessos(contratoSelecionado.id);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao excluir processo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessoParaExcluir(null);
    }
  };

  const contratosFiltrados = contratos.filter(
    (c) =>
      c.nome_contrato.toLowerCase().includes(filtroContrato.toLowerCase()) ||
      c.ente_federativo.toLowerCase().includes(filtroContrato.toLowerCase())
  );

  const anosDisponiveis = extrairAnos(processos, p => p.ano_referencia);
  const processosFiltradosPorAno = filtrarPorAno(processos, anoSelecionado, p => p.ano_referencia);

  const processosFiltrados = processosFiltradosPorAno.filter(
    (p) =>
      p.numero_processo_interno.toLowerCase().includes(filtroProcesso.toLowerCase()) ||
      p.objeto_resumido.toLowerCase().includes(filtroProcesso.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      ativo: "default",
      encerrado: "secondary",
      suspenso: "destructive",
      planejado: "default",
      em_cotacao: "default",
      cotacao_concluida: "default",
      em_selecao: "default",
      contratado: "default",
      concluido: "secondary",
      cancelado: "destructive",
    };
    
    const labels: Record<string, string> = {
      planejado: "ABERTO",
      concluido: "CONCLUÍDO",
      ativo: "ATIVO",
      encerrado: "ENCERRADO",
      suspenso: "SUSPENSO",
      em_cotacao: "EM COTAÇÃO",
      cotacao_concluida: "COTAÇÃO CONCLUÍDA",
      em_selecao: "EM SELEÇÃO",
      contratado: "CONTRATADO",
      cancelado: "CANCELADO",
    };
    
    return <Badge variant={variants[status] || "default"}>{labels[status] || status.replace(/_/g, " ").toUpperCase()}</Badge>;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {!contratoSelecionado ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contratos de Gestão</CardTitle>
                  <CardDescription>
                    {isGerenteContratos && !isGestor && !isCompliance && !isSuperintendenteExecutivo ? "Contratos vinculados à sua gestão" : "Gerencie todos os contratos de gestão"}
                  </CardDescription>
                </div>
                {isUsuarioInterno && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setDialogRelatorioOpen(true)}>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar Relatório
                    </Button>
                    {podeEditarContratoGestao && (
                      <Button onClick={() => {
                        setContratoParaEditar(null);
                        setDialogContratoOpen(true);
                      }}>
                        <Plus className="mr-2 h-4 w-4" />
                        Novo Contrato
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar por nome ou ente federativo..."
                  value={filtroContrato}
                  onChange={(e) => setFiltroContrato(e.target.value)}
                />
              </div>

              {contratosFiltrados.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {contratos.length === 0 
                    ? "Nenhum contrato de gestão cadastrado. Clique em 'Novo Contrato' para começar."
                    : "Nenhum contrato encontrado com os filtros aplicados."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome do Contrato</TableHead>
                      <TableHead>Ente Federativo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          Abertos
                          <TooltipProvider><Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[220px] text-xs"><p>Processos que ainda não foram concluídos (status diferente de "Finalizado").</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          Fechados
                          <TooltipProvider><Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[220px] text-xs"><p>Processos com status "Finalizado".</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contratosFiltrados.map((contrato, index) => (
                      <TableRow 
                        key={contrato.id}
                        className={index % 2 === 0 ? "bg-green-100 dark:bg-green-900/40" : "bg-blue-100 dark:bg-blue-900/40"}
                      >
                        <TableCell className="font-medium">{contrato.nome_contrato}</TableCell>
                        <TableCell>{contrato.ente_federativo}</TableCell>
                        <TableCell>
                          {contrato.data_inicio.split('-').reverse().join('/')} até{" "}
                          {contrato.data_fim.split('-').reverse().join('/')}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300">
                            {processosCountPorContrato[contrato.id]?.abertos || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {processosCountPorContrato[contrato.id]?.fechados || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs px-2 py-1 h-7"
                              onClick={() => setContratoSelecionado(contrato)}
                            >
                              <ChevronRight className="h-3 w-3 mr-1" />
                              Processos
                            </Button>
                            {podeEditarContratoGestao && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setContratoParaEditar(contrato);
                                  setDialogContratoOpen(true);
                                }}
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {isUsuarioInterno && (isCompliance || isSuperintendenteExecutivo) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setContratoParaExcluir(contrato.id)}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processos de Compras</CardTitle>
                  <CardDescription>
                    Contrato: {contratoSelecionado.nome_contrato}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {isUsuarioInterno && (
                    <Button onClick={() => {
                      setProcessoParaEditar(null);
                      setDialogProcessoOpen(true);
                    }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Processo
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setContratoSelecionado(null)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar por número ou objeto..."
                  value={filtroProcesso}
                  onChange={(e) => setFiltroProcesso(e.target.value)}
                />
              </div>

              <AnoReferenciaFilter
                anos={anosDisponiveis}
                anoSelecionado={anoSelecionado}
                onAnoChange={setAnoSelecionado}
              />

              {processosFiltrados.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {processos.length === 0
                    ? "Nenhum processo cadastrado para este contrato. Clique em 'Novo Processo' para começar."
                    : "Nenhum processo encontrado com os filtros aplicados."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Processo</TableHead>
                      <TableHead>Objeto</TableHead>
                      <TableHead>Ano</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Anexos</TableHead>
                      {isUsuarioInterno && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processosFiltrados.map((processo) => {
                      const isFechado = processo.status_processo === 'concluido';
                      return (
                      <TableRow key={processo.id}>
                        <TableCell className="font-medium">{processo.numero_processo_interno}</TableCell>
                        <TableCell className="max-w-[400px] whitespace-normal">
                          {stripHtml(processo.objeto_resumido)}
                        </TableCell>
                        <TableCell>{processo.ano_referencia}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{processo.tipo.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(processo.valor_total_cotacao || 0)}
                        </TableCell>
                        <TableCell>{getStatusBadge(processo.status_processo)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setProcessoParaAnexos(processo);
                              setDialogAnexosOpen(true);
                            }}
                            title="Gerenciar Anexos"
                          >
                            <Paperclip className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        {isUsuarioInterno && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setProcessoParaEditar(processo);
                                  setDialogProcessoOpen(true);
                                }}
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {(isGestor || isCompliance || isSuperintendenteExecutivo) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setProcessoParaExcluir(processo.id)}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <DialogContrato
        open={dialogContratoOpen}
        onOpenChange={setDialogContratoOpen}
        contrato={contratoParaEditar}
        onSave={handleSaveContrato}
      />

      <DialogProcesso
        open={dialogProcessoOpen}
        onOpenChange={setDialogProcessoOpen}
        processo={processoParaEditar}
        contratoId={contratoSelecionado?.id || ""}
        onSave={handleSaveProcesso}
      />

      {/* Primeira janela de confirmação - Aviso inicial */}
      <AlertDialog 
        open={!!contratoParaExcluir && etapaConfirmacaoContrato === 1} 
        onOpenChange={(open) => {
          if (!open) {
            setContratoParaExcluir(null);
            setEtapaConfirmacaoContrato(1);
          }
        }}
      >
        <AlertDialogContent className="border-destructive/50 border-2">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl text-destructive">
                ⚠️ ATENÇÃO: Ação de Alto Risco!
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base space-y-3">
              <p className="font-semibold text-foreground">
                Você está prestes a excluir um <span className="text-destructive">Contrato de Gestão</span>.
              </p>
              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30">
                <p className="font-bold text-destructive mb-2">
                  Esta ação irá DELETAR PERMANENTEMENTE:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-foreground">
                  <li>O contrato de gestão selecionado</li>
                  <li><strong>TODOS os processos de compra</strong> vinculados a este contrato</li>
                  <li><strong>TODAS as cotações</strong> e respostas de fornecedores</li>
                  <li><strong>TODOS os documentos</strong> anexados aos processos</li>
                  <li><strong>TODAS as seleções de fornecedores</strong> relacionadas</li>
                </ul>
              </div>
              <p className="text-destructive font-semibold text-center">
                Esta ação NÃO pode ser desfeita!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setContratoParaExcluir(null);
              setEtapaConfirmacaoContrato(1);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                setEtapaConfirmacaoContrato(2);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Entendo os riscos, continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Segunda janela de confirmação - Confirmação final */}
      <AlertDialog 
        open={!!contratoParaExcluir && etapaConfirmacaoContrato === 2} 
        onOpenChange={(open) => {
          if (!open) {
            setContratoParaExcluir(null);
            setEtapaConfirmacaoContrato(1);
          }
        }}
      >
        <AlertDialogContent className="border-destructive border-4 max-w-md px-6">
          <AlertDialogHeader>
            <div className="flex flex-col items-center gap-2 mb-2">
              <div className="p-3 rounded-full bg-destructive animate-pulse">
                <AlertTriangle className="h-10 w-10 text-destructive-foreground" />
              </div>
              <AlertDialogTitle className="text-xl text-destructive text-center">
                🚨 CONFIRMAÇÃO FINAL 🚨
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="text-base space-y-3 mx-4">
                <div className="p-3 bg-destructive/20 rounded-lg border-2 border-destructive">
                  <p className="text-center font-bold text-destructive mb-2">
                    ÚLTIMA CHANCE DE CANCELAR!
                  </p>
                  <p className="text-center text-foreground text-sm">
                    Ao clicar em <strong>"EXCLUIR"</strong>, você confirma que:
                  </p>
                  <ul className="list-disc list-inside space-y-1 mt-2 text-sm text-foreground">
                    <li>Entende que <strong>TODOS os dados serão perdidos</strong></li>
                    <li>Não há backup disponível para recuperação</li>
                    <li>Assume total responsabilidade por esta ação</li>
                  </ul>
                </div>
                <p className="text-center text-muted-foreground text-xs px-2">
                  Recomendação: Antes de excluir, certifique-se de ter exportado 
                  todos os documentos importantes.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-2 mx-4">
            <AlertDialogCancel 
              onClick={() => {
                setContratoParaExcluir(null);
                setEtapaConfirmacaoContrato(1);
              }}
              className="w-full sm:w-auto text-sm"
            >
              Cancelar e manter
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                handleDeleteContrato();
                setEtapaConfirmacaoContrato(1);
              }}
              className="bg-destructive hover:bg-destructive/90 w-full sm:w-auto font-bold text-sm"
            >
              🗑️ EXCLUIR
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!processoParaExcluir} onOpenChange={() => setProcessoParaExcluir(null)}>
        <AlertDialogContent className="border-destructive/50 border-2">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl text-destructive">
                ⚠️ ATENÇÃO: Excluir Processo
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base space-y-3">
              <p className="font-semibold text-foreground">
                Você está prestes a excluir um <span className="text-destructive">Processo de Compras</span>.
              </p>
              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30">
                <p className="font-bold text-destructive mb-2">
                  Esta ação irá DELETAR PERMANENTEMENTE:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-foreground">
                  <li>O processo de compras selecionado</li>
                  <li><strong>TODAS as cotações</strong> e respostas de fornecedores</li>
                  <li><strong>TODOS os documentos</strong> anexados ao processo</li>
                  <li><strong>TODAS as seleções de fornecedores</strong> relacionadas</li>
                </ul>
              </div>
              <p className="text-destructive font-semibold text-center">
                Esta ação NÃO pode ser desfeita!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProcessoParaExcluir(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteProcesso}
              className="bg-destructive hover:bg-destructive/90"
            >
              🗑️ Excluir Processo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {processoParaAnexos && (
        <DialogAnexosProcesso
          key={processoParaAnexos.id}
          open={dialogAnexosOpen}
          onOpenChange={setDialogAnexosOpen}
          processoId={processoParaAnexos.id}
          processoNumero={processoParaAnexos.numero_processo_interno}
        />
      )}

      <DialogRelatorioCompras
        open={dialogRelatorioOpen}
        onOpenChange={setDialogRelatorioOpen}
        contratos={contratos}
      />
    </div>
  );
};

export default ProcessosCompras;
