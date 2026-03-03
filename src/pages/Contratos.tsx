import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { toZonedTime } from "date-fns-tz";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useUserContext } from "@/hooks/useUserContext";
import { TabProcessosParaContratar } from "@/components/contratos/TabProcessosParaContratar";
import { TabContratosTerceiros } from "@/components/contratos/TabContratosTerceiros";
import { TabAVencer } from "@/components/contratos/TabAVencer";
import { TabVencidos } from "@/components/contratos/TabVencidos";
import { AnoReferenciaFilter, extrairAnos } from "@/components/AnoReferenciaFilter";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  cor_fundo: string | null;
}

interface ProcessoAno {
  id: string;
  ano_referencia: number | null;
}

export default function Contratos() {
  const context = useUserContext();
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGestao | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

  // Ano de referência
  const [processosAnos, setProcessosAnos] = useState<ProcessoAno[]>([]);
  const [anoSelecionado, setAnoSelecionado] = useState("todos");
  const [loadingProcessos, setLoadingProcessos] = useState(false);

  // Sub-tabs
  const [activeTab, setActiveTab] = useState("processos");
  const [processoParaContrato, setProcessoParaContrato] = useState<any>(null);

  // Notification counts
  const [countAVencer, setCountAVencer] = useState(0);
  const [countVencidos, setCountVencidos] = useState(0);
  const [globalAlerts, setGlobalAlerts] = useState({ aVencer: 0, vencidos: 0, total: 0 });
  const [alertsPorCG, setAlertsPorCG] = useState<Record<string, number>>({});

  const canEdit = context?.isContrato === true;

  const loadNotificationCounts = useCallback(async (contratoGestaoId: string, pcIds: string[]) => {
    try {
      // Get processos_para_contratar IDs
      let filterPcIds: string[] = [];
      if (pcIds.length > 0) {
        const { data: pcData } = await supabase
          .from("processos_para_contratar")
          .select("id")
          .eq("contrato_gestao_id", contratoGestaoId)
          .in("processo_compra_id", pcIds);
        filterPcIds = pcData?.map(p => p.id) || [];
      }

      let query = supabase
        .from("contratos_terceiros")
        .select("id, fim_vigencia_atual, ciente_nao_renovar")
        .eq("contrato_gestao_id", contratoGestaoId)
        .eq("status", "vigente")
        .not("fim_vigencia_atual", "is", null);

      if (filterPcIds.length > 0) {
        query = query.in("processo_para_contratar_id", filterPcIds);
      }

      const { data } = await query;
      if (!data) return;

      const hoje = toZonedTime(new Date(), "America/Sao_Paulo");

      // A Vencer: vigentes com <= 45 dias restantes (query já filtra status=vigente)
      const aVencer = data.filter(c => {
        const fimDate = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
        const dias = differenceInDays(fimDate, hoje);
        return dias >= 0 && dias <= 45;
      });
      setCountAVencer(aVencer.length);

      // Vencidos: já expirados E não marcados como ciente (query já filtra status=vigente)
      const vencidos = data.filter(c => {
        if (c.ciente_nao_renovar) return false;
        const fimDate = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
        return fimDate < hoje;
      });
      setCountVencidos(vencidos.length);
    } catch {
      // silent
    }
  }, []);

  const loadGlobalNotificationCounts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("contratos_terceiros")
        .select("id, fim_vigencia_atual, ciente_nao_renovar, contrato_gestao_id")
        .eq("status", "vigente")
        .not("fim_vigencia_atual", "is", null);

      if (error) throw error;

      const hoje = toZonedTime(new Date(), "America/Sao_Paulo");
      const contratosValidos = (data || []).filter(c => !c.ciente_nao_renovar);

      let totalAVencer = 0;
      let totalVencidos = 0;
      const porCG: Record<string, number> = {};

      for (const c of contratosValidos) {
        const fimDate = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
        const dias = differenceInDays(fimDate, hoje);
        const isAVencer = dias >= 0 && dias <= 45;
        const isVencido = fimDate < hoje;

        if (isAVencer) {
          totalAVencer++;
          porCG[c.contrato_gestao_id] = (porCG[c.contrato_gestao_id] || 0) + 1;
        } else if (isVencido) {
          totalVencidos++;
          porCG[c.contrato_gestao_id] = (porCG[c.contrato_gestao_id] || 0) + 1;
        }
      }

      setGlobalAlerts({ aVencer: totalAVencer, vencidos: totalVencidos, total: totalAVencer + totalVencidos });
      setAlertsPorCG(porCG);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadContratos();
    loadGlobalNotificationCounts();

    const interval = setInterval(() => {
      loadGlobalNotificationCounts();
    }, 60000);

    return () => clearInterval(interval);
  }, [loadGlobalNotificationCounts]);

  useEffect(() => {
    if (contratoSelecionado) {
      loadProcessosAnos(contratoSelecionado.id);
    }
  }, [contratoSelecionado]);

  const loadContratos = async () => {
    try {
      const { data, error } = await supabase
        .from("contratos_gestao")
        .select("id, nome_contrato, ente_federativo, cor_fundo")
        .order("nome_contrato");

      if (error) throw error;
      setContratos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar contratos de gestão");
    } finally {
      setLoading(false);
    }
  };

  const loadProcessosAnos = async (contratoGestaoId: string) => {
    setLoadingProcessos(true);
    try {
      const { data, error } = await supabase
        .from("processos_compras")
        .select("id, ano_referencia")
        .eq("contrato_gestao_id", contratoGestaoId)
        .eq("status_processo", "concluido");

      if (error) throw error;
      setProcessosAnos(data || []);
      
      // Auto-selecionar o ano mais recente se houver dados
      const anos = extrairAnos(data || [], p => p.ano_referencia ?? undefined);
      if (anos.length === 1) {
        setAnoSelecionado(anos[0].toString());
      } else {
        setAnoSelecionado("todos");
      }
    } catch (error: any) {
      toast.error("Erro ao carregar processos");
    } finally {
      setLoadingProcessos(false);
    }
  };

  // IDs dos processos de compra filtrados pelo ano selecionado
  const processoCompraIdsFiltrados = anoSelecionado === "todos"
    ? processosAnos.map(p => p.id)
    : processosAnos.filter(p => p.ano_referencia === parseInt(anoSelecionado)).map(p => p.id);

  // Load notification counts when filter changes + polling every 15s
  useEffect(() => {
    if (contratoSelecionado && processoCompraIdsFiltrados.length > 0) {
      loadNotificationCounts(contratoSelecionado.id, processoCompraIdsFiltrados);
      const interval = setInterval(() => {
        loadNotificationCounts(contratoSelecionado.id, processoCompraIdsFiltrados);
      }, 15000);
      return () => clearInterval(interval);
    } else {
      setCountAVencer(0);
      setCountVencidos(0);
    }
  }, [contratoSelecionado, anoSelecionado, processosAnos, loadNotificationCounts]);

  const refreshCounts = () => {
    if (contratoSelecionado) {
      loadNotificationCounts(contratoSelecionado.id, processoCompraIdsFiltrados);
    }
    loadGlobalNotificationCounts();
  };

  const anosDisponiveis = extrairAnos(processosAnos, p => p.ano_referencia ?? undefined);

  const contratosFiltrados = contratos.filter((c) =>
    c.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    c.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
  );

  const handleCriarContratoFromProcesso = (processo: any) => {
    setProcessoParaContrato(processo);
    setActiveTab("contratos");
  };

  const handleVoltarParaContratos = () => {
    setContratoSelecionado(null);
    setProcessosAnos([]);
    setAnoSelecionado("todos");
    setActiveTab("processos");
    setProcessoParaContrato(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : !contratoSelecionado ? (
          /* NÍVEL 1: Lista de Contratos de Gestão */
          <Card>
            <CardHeader>
              <CardTitle>Contratos</CardTitle>
              <CardDescription>
                Selecione um Contrato de Gestão para gerenciar processos e contratos com terceiros
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              {globalAlerts.total > 0 && (
                <div className="mx-4 sm:mx-0 mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
                  <span className="font-medium">Pendências de contratos no sistema:</span>{" "}
                  <span className="font-semibold">{globalAlerts.total}</span>
                  {" "}(A vencer: <span className="font-semibold">{globalAlerts.aVencer}</span> · Vencidos: <span className="font-semibold">{globalAlerts.vencidos}</span>)
                </div>
              )}
              <div className="px-4 sm:px-0 mb-4">
                <Input
                  placeholder="Buscar contrato de gestão..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Nome do Contrato</TableHead>
                      <TableHead className="min-w-[120px]">Ente Federativo</TableHead>
                      <TableHead className="text-right min-w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contratosFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground text-xs sm:text-sm">
                          Nenhum contrato de gestão encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      contratosFiltrados.map((contrato) => (
                        <TableRow 
                          key={contrato.id}
                          style={contrato.cor_fundo ? { backgroundColor: contrato.cor_fundo } : undefined}
                        >
                          <TableCell className="font-medium text-xs sm:text-sm">
                            <span className="flex items-center gap-2">
                              {contrato.nome_contrato}
                              {(alertsPorCG[contrato.id] || 0) > 0 && (
                                <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                                  {alertsPorCG[contrato.id]}
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">{contrato.ente_federativo}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setContratoSelecionado(contrato)}
                              className="text-xs"
                            >
                              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                              <span className="hidden sm:inline">Abrir</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* NÍVEL 2: Ano de Referência + 4 Sub-Tabs */
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{contratoSelecionado.nome_contrato}</CardTitle>
                  <CardDescription>{contratoSelecionado.ente_federativo}</CardDescription>
                </div>
                <Button variant="outline" onClick={handleVoltarParaContratos}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {globalAlerts.total > 0 && (
                <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
                  <span className="font-medium">Pendências de contratos no sistema:</span>{" "}
                  <span className="font-semibold">{globalAlerts.total}</span>
                  {" "}(A vencer: <span className="font-semibold">{globalAlerts.aVencer}</span> · Vencidos: <span className="font-semibold">{globalAlerts.vencidos}</span>)
                </div>
              )}
              {loadingProcessos ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
              ) : processosAnos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhum processo finalizado neste contrato de gestão
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Filtro por Ano de Referência */}
                  <AnoReferenciaFilter
                    anos={anosDisponiveis}
                    anoSelecionado={anoSelecionado}
                    onAnoChange={setAnoSelecionado}
                  />

                  {/* 4 Sub-Tabs dentro do ano */}
                   <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="w-full h-auto gap-0 p-0">
                      <TabsTrigger value="processos" className="flex-1 text-xs sm:text-sm rounded-none first:rounded-l-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Processos para Contratar</TabsTrigger>
                      <TabsTrigger value="contratos" className="flex-1 text-xs sm:text-sm rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Contratos com Terceiros</TabsTrigger>
                      <TabsTrigger value="vencer" className="flex-1 text-xs sm:text-sm rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1">
                        A Vencer
                        {countAVencer > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] rounded-full">{countAVencer}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="vencidos" className="flex-1 text-xs sm:text-sm rounded-none last:rounded-r-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1">
                        Vencidos/Encerrados
                        {countVencidos > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] rounded-full">{countVencidos}</Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="processos">
                      <TabProcessosParaContratar
                        contratoGestaoId={contratoSelecionado.id}
                        contratoGestaoNome={contratoSelecionado.nome_contrato}
                        processoCompraIds={processoCompraIdsFiltrados}
                        canEdit={canEdit}
                        onCriarContrato={handleCriarContratoFromProcesso}
                      />
                    </TabsContent>

                    <TabsContent value="contratos">
                      <TabContratosTerceiros
                        contratoGestaoId={contratoSelecionado.id}
                        contratoGestaoNome={contratoSelecionado.nome_contrato}
                        processoCompraIds={processoCompraIdsFiltrados}
                        canEdit={canEdit}
                        processoParaContrato={processoParaContrato}
                        onProcessoContratoUsado={() => setProcessoParaContrato(null)}
                      />
                    </TabsContent>

                    <TabsContent value="vencer">
                      <TabAVencer
                        contratoGestaoId={contratoSelecionado.id}
                        processoCompraIds={processoCompraIdsFiltrados}
                        canEdit={canEdit}
                      />
                    </TabsContent>

                    <TabsContent value="vencidos">
                      <TabVencidos
                        contratoGestaoId={contratoSelecionado.id}
                        contratoGestaoNome={contratoSelecionado.nome_contrato}
                        processoCompraIds={processoCompraIdsFiltrados}
                        canEdit={canEdit}
                        onStatusChanged={refreshCounts}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
