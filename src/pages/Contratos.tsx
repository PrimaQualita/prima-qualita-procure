import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useUserContext } from "@/hooks/useUserContext";
import { TabProcessosParaContratar } from "@/components/contratos/TabProcessosParaContratar";
import { TabContratosTerceiros } from "@/components/contratos/TabContratosTerceiros";
import { TabAVencer } from "@/components/contratos/TabAVencer";
import { TabVencidos } from "@/components/contratos/TabVencidos";
import { stripHtml } from "@/lib/htmlUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  cor_fundo: string | null;
}

interface ProcessoFinalizado {
  id: string;
  numero_processo_interno: string;
  tipo: string;
  objeto_resumido: string;
  valor_estimado_anual: number;
  data_encerramento_real: string | null;
  centro_custo: string | null;
}

export default function Contratos() {
  const context = useUserContext();
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGestao | null>(null);
  const [processos, setProcessos] = useState<ProcessoFinalizado[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoFinalizado | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProcessos, setLoadingProcessos] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroProcesso, setFiltroProcesso] = useState("");
  const [activeTab, setActiveTab] = useState("processos");
  
  const [processoParaContrato, setProcessoParaContrato] = useState<any>(null);

  const canEdit = context?.isContrato === true;

  useEffect(() => {
    loadContratos();
  }, []);

  useEffect(() => {
    if (contratoSelecionado) {
      loadProcessosFinalizados(contratoSelecionado.id);
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

  const loadProcessosFinalizados = async (contratoGestaoId: string) => {
    setLoadingProcessos(true);
    try {
      const { data, error } = await supabase
        .from("processos_compras")
        .select("id, numero_processo_interno, tipo, objeto_resumido, valor_estimado_anual, data_encerramento_real, centro_custo")
        .eq("contrato_gestao_id", contratoGestaoId)
        .eq("status_processo", "concluido")
        .order("data_encerramento_real", { ascending: false });

      if (error) throw error;
      setProcessos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar processos finalizados");
    } finally {
      setLoadingProcessos(false);
    }
  };

  const contratosFiltrados = contratos.filter((c) =>
    c.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    c.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
  );

  const processosFiltrados = processos.filter((p) =>
    p.numero_processo_interno.toLowerCase().includes(filtroProcesso.toLowerCase()) ||
    stripHtml(p.objeto_resumido).toLowerCase().includes(filtroProcesso.toLowerCase())
  );

  const handleCriarContratoFromProcesso = (processo: any) => {
    setProcessoParaContrato(processo);
    setActiveTab("contratos");
  };

  const handleVoltarParaProcessos = () => {
    setProcessoSelecionado(null);
    setProcessoParaContrato(null);
    setActiveTab("processos");
  };

  const handleVoltarParaContratos = () => {
    setContratoSelecionado(null);
    setProcessos([]);
    setFiltroProcesso("");
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
                          <TableCell className="font-medium text-xs sm:text-sm">{contrato.nome_contrato}</TableCell>
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
        ) : !processoSelecionado ? (
          /* NÍVEL 2: Processos Finalizados do Contrato de Gestão */
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{contratoSelecionado.nome_contrato}</CardTitle>
                  <CardDescription>{contratoSelecionado.ente_federativo} — Processos Finalizados</CardDescription>
                </div>
                <Button variant="outline" onClick={handleVoltarParaContratos}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              {loadingProcessos ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Carregando processos...</div>
              ) : (
                <>
                  <div className="px-4 sm:px-0 mb-4">
                    <Input
                      placeholder="Buscar processo..."
                      value={filtroProcesso}
                      onChange={(e) => setFiltroProcesso(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[120px]">Nº Processo</TableHead>
                          <TableHead className="min-w-[100px]">Tipo</TableHead>
                          <TableHead className="min-w-[200px]">Objeto</TableHead>
                          <TableHead className="min-w-[120px]">Valor Estimado</TableHead>
                          <TableHead className="min-w-[120px]">Data Finalização</TableHead>
                          <TableHead className="text-right min-w-[100px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processosFiltrados.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground text-xs sm:text-sm">
                              Nenhum processo finalizado encontrado
                            </TableCell>
                          </TableRow>
                        ) : (
                          processosFiltrados.map((processo) => (
                            <TableRow key={processo.id}>
                              <TableCell className="font-medium text-xs sm:text-sm">{processo.numero_processo_interno}</TableCell>
                              <TableCell className="text-xs sm:text-sm">
                                <Badge variant="outline" className="text-xs">{processo.tipo === "compra_direta" ? "Compra Direta" : processo.tipo === "selecao" ? "Seleção" : processo.tipo}</Badge>
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm max-w-[200px] truncate" title={stripHtml(processo.objeto_resumido)}>
                                {stripHtml(processo.objeto_resumido)}
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm">
                                {processo.valor_estimado_anual > 0
                                  ? `R$ ${processo.valor_estimado_anual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm">
                                {processo.data_encerramento_real
                                  ? format(new Date(processo.data_encerramento_real + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setProcessoSelecionado(processo);
                                    setActiveTab("processos");
                                  }}
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
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          /* NÍVEL 3: Tabs dentro do Processo selecionado */
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processo {processoSelecionado.numero_processo_interno}</CardTitle>
                  <CardDescription>
                    {contratoSelecionado.nome_contrato} — {stripHtml(processoSelecionado.objeto_resumido)}
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={handleVoltarParaProcessos}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
                  <TabsTrigger value="processos" className="text-xs sm:text-sm">Processos para Contratar</TabsTrigger>
                  <TabsTrigger value="contratos" className="text-xs sm:text-sm">Contratos com Terceiros</TabsTrigger>
                  <TabsTrigger value="vencer" className="text-xs sm:text-sm">A Vencer</TabsTrigger>
                  <TabsTrigger value="vencidos" className="text-xs sm:text-sm">Vencidos</TabsTrigger>
                </TabsList>

                <TabsContent value="processos">
                  <TabProcessosParaContratar
                    contratoGestaoId={contratoSelecionado.id}
                    contratoGestaoNome={contratoSelecionado.nome_contrato}
                    processoCompraId={processoSelecionado.id}
                    canEdit={canEdit}
                    onCriarContrato={handleCriarContratoFromProcesso}
                  />
                </TabsContent>

                <TabsContent value="contratos">
                  <TabContratosTerceiros
                    contratoGestaoId={contratoSelecionado.id}
                    contratoGestaoNome={contratoSelecionado.nome_contrato}
                    processoCompraId={processoSelecionado.id}
                    canEdit={canEdit}
                    processoParaContrato={processoParaContrato}
                    onProcessoContratoUsado={() => setProcessoParaContrato(null)}
                  />
                </TabsContent>

                <TabsContent value="vencer">
                  <TabAVencer 
                    contratoGestaoId={contratoSelecionado.id}
                    processoCompraId={processoSelecionado.id}
                  />
                </TabsContent>

                <TabsContent value="vencidos">
                  <TabVencidos
                    contratoGestaoId={contratoSelecionado.id}
                    processoCompraId={processoSelecionado.id}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
