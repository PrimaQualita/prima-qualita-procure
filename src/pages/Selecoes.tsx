import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, ChevronRight, Trash2, Pencil, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { DialogEditarSelecao } from "@/components/selecoes/DialogEditarSelecao";
import { useCanEdit } from "@/hooks/useUserContext";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import { AnoReferenciaFilter, extrairAnos, filtrarPorAno } from "@/components/AnoReferenciaFilter";

interface Contrato {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  status: string;
  cor_fundo?: string | null;
}

interface Processo {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  valor_estimado_anual: number;
  valor_planilha?: number;
  requer_selecao: boolean;
  criterio_julgamento?: string;
  ano_referencia?: number;
}

interface Selecao {
  id: string;
  processo_compra_id: string;
  titulo_selecao: string;
  status_selecao: string;
  data_sessao_disputa: string;
  hora_sessao_disputa: string;
  valor_estimado_anual: number;
  criterios_julgamento?: string;
  numero_selecao?: string;
}

const Selecoes = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const processoIdParam = searchParams.get("processo");
  const canEdit = useCanEdit();
  
  const [loading, setLoading] = useState(true);
  const [loadingProcessos, setLoadingProcessos] = useState(false);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState<Processo | null>(null);
  const [selecoes, setSelecoes] = useState<Selecao[]>([]);
  const [selecoesFechadasSet, setSelecoesFechadasSet] = useState<Set<string>>(new Set());
  const [confirmDeleteSelecao, setConfirmDeleteSelecao] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [anoSelecionado, setAnoSelecionado] = useState("todos");
  const [selecaoParaEditar, setSelecaoParaEditar] = useState<Selecao | null>(null);
  const [selecoesCountPorContrato, setSelecoesCountPorContrato] = useState<Record<string, { abertas: number; fechadas: number }>>({});

  useEffect(() => {
    checkAuth();
    loadContratos();
  }, []);

  useEffect(() => {
    if (contratos.length > 0) {
      loadSelecoesCountPorContrato();
    }
  }, [contratos]);

  const loadSelecoesCountPorContrato = async () => {
    try {
      const contratosIds = contratos.map(c => c.id);

      // Buscar processos que requerem seleção
      const { data: processos } = await supabase
        .from("processos_compras")
        .select("id, contrato_gestao_id")
        .eq("requer_selecao", true)
        .in("contrato_gestao_id", contratosIds);

      if (!processos || processos.length === 0) {
        setSelecoesCountPorContrato({});
        return;
      }

      const processosIds = processos.map(p => p.id);
      const processoToContrato: Record<string, string> = {};
      processos.forEach(p => { processoToContrato[p.id] = p.contrato_gestao_id; });

      // Buscar seleções, homologações e atas em PARALELO
      const [selecoesRes, homologacoesRes, atasRes] = await Promise.all([
        supabase
          .from("selecoes_fornecedores")
          .select("id, processo_compra_id")
          .in("processo_compra_id", processosIds),
        supabase
          .from("homologacoes_selecao")
          .select("selecao_id"),
        supabase
          .from("atas_selecao")
          .select("selecao_id"),
      ]);

      const selecoes = selecoesRes.data;
      if (!selecoes || selecoes.length === 0) {
        setSelecoesCountPorContrato({});
        return;
      }

      const selecoesIdsSet = new Set(selecoes.map(s => s.id));
      const selecoesHomologadas = new Set((homologacoesRes.data || []).filter(h => selecoesIdsSet.has(h.selecao_id)).map(h => h.selecao_id));
      const selecoesComAta = new Set((atasRes.data || []).filter(a => selecoesIdsSet.has(a.selecao_id)).map(a => a.selecao_id));

      const counts: Record<string, { abertas: number; fechadas: number }> = {};
      contratosIds.forEach(id => { counts[id] = { abertas: 0, fechadas: 0 }; });

      selecoes.forEach(sel => {
        const contratoId = processoToContrato[sel.processo_compra_id];
        if (!contratoId || !counts[contratoId]) return;

        if (selecoesHomologadas.has(sel.id) || selecoesComAta.has(sel.id)) {
          counts[contratoId].fechadas++;
        } else {
          counts[contratoId].abertas++;
        }
      });

      setSelecoesCountPorContrato(counts);
    } catch (error) {
      console.error("Erro ao carregar contagem de seleções:", error);
    }
  };

  // Expandir automaticamente até o processo quando vindo da URL
  useEffect(() => {
    if (processoIdParam && contratos.length > 0 && !processoSelecionado) {
      expandirAteProcesso(processoIdParam);
    }
  }, [processoIdParam, contratos]);

  const expandirAteProcesso = async (processoId: string) => {
    // Buscar o processo
    const { data: processo, error } = await supabase
      .from("processos_compras")
      .select("*, contratos_gestao(*)")
      .eq("id", processoId)
      .single();

    if (error || !processo) {
      console.error("Erro ao buscar processo:", error);
      return;
    }

    // Selecionar o contrato
    const contrato = contratos.find(c => c.id === processo.contrato_gestao_id);
    if (contrato) {
      setContratoSelecionado(contrato);
      
      // Aguardar processos carregarem
      await loadProcessos(contrato.id);
      
      // Selecionar o processo
      setProcessoSelecionado(processo);
    }
  };

  useEffect(() => {
    if (contratoSelecionado) {
      loadProcessos(contratoSelecionado.id);
    }
  }, [contratoSelecionado]);

  useEffect(() => {
    if (processoSelecionado) {
      loadSelecoes(processoSelecionado.id);
    }
  }, [processoSelecionado]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
    setLoading(false);
  };

  const loadContratos = async () => {
    const { data, error } = await supabase
      .from("contratos_gestao")
      .select("*")
      .order("nome_contrato", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar contratos");
      console.error(error);
    } else {
      setContratos(data || []);
    }
  };

  const loadProcessos = async (contratoId: string) => {
    setLoadingProcessos(true);
    setProcessos([]);
    
    const { data, error } = await supabase
      .from("processos_compras")
      .select("*")
      .eq("contrato_gestao_id", contratoId)
      .eq("requer_selecao", true)
      .order("numero_processo_interno", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar processos");
      console.error(error);
      setLoadingProcessos(false);
      return;
    }

    // Primeiro mostrar os processos sem o valor da planilha para carregar rápido
    setProcessos((data || []).map(p => ({ ...p, valor_planilha: 0 })));
    setLoadingProcessos(false);

    // Depois carregar os valores das planilhas em segundo plano (lazy loading)
    if (data && data.length > 0) {
      const processosIds = data.map(p => p.id);
      
      // Buscar todas as cotações de uma vez
      const { data: cotacoes } = await supabase
        .from("cotacoes_precos")
        .select("id, processo_compra_id")
        .in("processo_compra_id", processosIds);

      if (cotacoes && cotacoes.length > 0) {
        const cotacoesIds = cotacoes.map(c => c.id);
        
        // Buscar todas as planilhas consolidadas de uma vez
        const { data: planilhas } = await supabase
          .from("planilhas_consolidadas")
          .select("cotacao_id, fornecedores_incluidos, data_geracao")
          .in("cotacao_id", cotacoesIds)
          .order("data_geracao", { ascending: false });

        if (planilhas) {
          // Agrupar planilhas por cotação e pegar a mais recente de cada
          const planilhasPorCotacao = new Map<string, any>();
          planilhas.forEach(p => {
            if (!planilhasPorCotacao.has(p.cotacao_id)) {
              planilhasPorCotacao.set(p.cotacao_id, p);
            }
          });

          // Calcular valores e atualizar processos
          const processosAtualizados = data.map(processo => {
            const cotacao = cotacoes.find(c => c.processo_compra_id === processo.id);
            if (!cotacao) return { ...processo, valor_planilha: 0 };

            const planilha = planilhasPorCotacao.get(cotacao.id);
            if (!planilha?.fornecedores_incluidos) return { ...processo, valor_planilha: 0 };

            let valorTotal = 0;
            if (Array.isArray(planilha.fornecedores_incluidos)) {
              planilha.fornecedores_incluidos.forEach((fornecedor: any) => {
                if (fornecedor.itens && Array.isArray(fornecedor.itens)) {
                  fornecedor.itens.forEach((item: any) => {
                    const valorItem = parseFloat(item.valor_total || 0);
                    if (!isNaN(valorItem)) {
                      valorTotal += valorItem;
                    }
                  });
                }
              });
            }

            return { ...processo, valor_planilha: valorTotal };
          });

          setProcessos(processosAtualizados);
        }
      }
    }
  };

  const loadSelecoes = async (processoId: string) => {
    const { data, error } = await supabase
      .from("selecoes_fornecedores")
      .select("*")
      .eq("processo_compra_id", processoId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar seleções");
      console.error(error);
    } else {
      setSelecoes(data || []);
      
      // Carregar status aberta/fechada para cada seleção
      if (data && data.length > 0) {
        const selIds = data.map(s => s.id);
        const [homRes, ataRes] = await Promise.all([
          supabase.from("homologacoes_selecao").select("selecao_id").in("selecao_id", selIds),
          supabase.from("atas_selecao").select("selecao_id").in("selecao_id", selIds),
        ]);
        const fechadas = new Set<string>();
        (homRes.data || []).forEach(h => fechadas.add(h.selecao_id));
        (ataRes.data || []).forEach(a => fechadas.add(a.selecao_id));
        setSelecoesFechadasSet(fechadas);
      } else {
        setSelecoesFechadasSet(new Set());
      }
    }
  };

  const handleExcluirSelecao = async (selecaoId: string) => {
    try {
      // Buscar dados da seleção ANTES de deletar para o log de auditoria
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, titulo_selecao")
        .eq("id", selecaoId)
        .single();

      const { data, error } = await supabase.functions.invoke("deletar-selecao", {
        body: { selecaoId },
      });

      if (error) throw error;

      // Registrar auditoria da exclusão
      try {
        await registrarAuditoria({
          acao: 'exclusão',
          entidade: 'Seleção de Fornecedores',
          entidade_id: selecaoId,
          detalhes: {
            numero_selecao: selecaoData?.numero_selecao || 'N/A',
            titulo_selecao: selecaoData?.titulo_selecao || 'N/A',
            numero_processo: processoSelecionado?.numero_processo_interno || '',
            contrato_gestao: contratoSelecionado?.nome_contrato || '',
            arquivos_deletados: data?.arquivosDeletados || 0,
          },
        });
      } catch (auditError) {
        console.warn('Erro ao registrar auditoria da exclusão de seleção:', auditError);
      }

      toast.success("Seleção excluída com sucesso", {
        description:
          data?.arquivosEncontrados != null
            ? `Arquivos removidos do storage: ${data.arquivosDeletados || 0}/${data.arquivosEncontrados}`
            : undefined,
      });

      if (processoSelecionado) {
        loadSelecoes(processoSelecionado.id);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao excluir seleção");
    } finally {
      setConfirmDeleteSelecao(null);
    }
  };

  const contratosFiltrados = contratos.filter(c =>
    c.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    c.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Lista de Contratos */}
        {!contratoSelecionado && (
          <Card>
            <CardHeader>
              <CardTitle>Contratos de Gestão</CardTitle>
              <CardDescription>
                Selecione um contrato para visualizar os processos que requerem seleção de fornecedores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar contrato..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Contrato</TableHead>
                    <TableHead>Ente Federativo</TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        Abertas
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[250px] text-xs"><p>Seleções que ainda não possuem Homologação emitida, ou que não possuem Ata emitida quando todos os itens são desertos/fracassados.</p></TooltipContent></Tooltip></TooltipProvider>
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        Fechadas
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-[250px] text-xs"><p>Seleções com Homologação emitida pelo Responsável Legal, ou com Ata emitida quando não houve vencedor em nenhum item.</p></TooltipContent></Tooltip></TooltipProvider>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhum contrato encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    contratosFiltrados.map((contrato, index) => (
                      <TableRow key={contrato.id} className={index % 2 === 0 ? "bg-green-100 dark:bg-green-900/40" : "bg-blue-100 dark:bg-blue-900/40"}>
                        <TableCell className="font-medium">{contrato.nome_contrato}</TableCell>
                        <TableCell>{contrato.ente_federativo}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300">
                            {selecoesCountPorContrato[contrato.id]?.abertas || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {selecoesCountPorContrato[contrato.id]?.fechadas || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setContratoSelecionado(contrato)}
                          >
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Ver Processos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Lista de Processos */}
        {contratoSelecionado && !processoSelecionado && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processos que Requerem Seleção de Fornecedores</CardTitle>
                  <CardDescription>
                    Contrato: {contratoSelecionado.nome_contrato}
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => setContratoSelecionado(null)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <AnoReferenciaFilter
                anos={extrairAnos(processos, p => p.ano_referencia)}
                anoSelecionado={anoSelecionado}
                onAnoChange={setAnoSelecionado}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Processo</TableHead>
                    <TableHead>Objeto</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingProcessos ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <span className="text-muted-foreground">Carregando processos...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtrarPorAno(processos, anoSelecionado, p => p.ano_referencia).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhum processo que requer seleção de fornecedores encontrado neste contrato
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtrarPorAno(processos, anoSelecionado, p => p.ano_referencia).map((processo) => (
                      <TableRow key={processo.id}>
                        <TableCell className="font-medium">{processo.numero_processo_interno}</TableCell>
                        <TableCell dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processo.objeto_resumido) }} />
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setProcessoSelecionado(processo)}
                          >
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Ver Seleções
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Lista de Seleções */}
        {processoSelecionado && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Seleções de Fornecedores</CardTitle>
                  <CardDescription>
                    Processo: {processoSelecionado.numero_processo_interno}
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => setProcessoSelecionado(null)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                    <TableRow>
                      <TableHead>Nº Seleção</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Data/Hora Disputa</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                  {selecoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhuma seleção criada para este processo
                      </TableCell>
                    </TableRow>
                  ) : (
                    selecoes.map((selecao) => (
                      <TableRow key={selecao.id}>
                        <TableCell className="font-medium">{selecao.numero_selecao || '-'}</TableCell>
                        <TableCell>{selecao.titulo_selecao}</TableCell>
                        <TableCell>
                          <Badge variant={selecao.status_selecao === "planejada" ? "default" : "secondary"}>
                            {selecao.status_selecao}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {selecao.data_sessao_disputa.split('T')[0].split('-').reverse().join('/')} às {selecao.hora_sessao_disputa}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            {canEdit && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelecaoParaEditar(selecao)}
                                title="Editar Seleção"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => navigate(`/detalhe-selecao?id=${selecao.id}`)}
                            >
                              <ChevronRight className="h-4 w-4 mr-2" />
                              Ver Seleção
                            </Button>
                            {canEdit && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setConfirmDeleteSelecao(selecao.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirmação de exclusão de Seleção */}
      <AlertDialog open={!!confirmDeleteSelecao} onOpenChange={() => setConfirmDeleteSelecao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta seleção? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteSelecao) {
                  handleExcluirSelecao(confirmDeleteSelecao);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Edição de Seleção */}
      <DialogEditarSelecao
        open={!!selecaoParaEditar}
        onOpenChange={(open) => !open && setSelecaoParaEditar(null)}
        selecao={selecaoParaEditar}
        onSuccess={() => {
          if (processoSelecionado) {
            loadSelecoes(processoSelecionado.id);
          }
        }}
      />
    </div>
  );
};

export default Selecoes;
