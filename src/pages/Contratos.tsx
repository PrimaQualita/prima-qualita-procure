import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ChevronRight } from "lucide-react";
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

  const canEdit = context?.isContrato === true;

  useEffect(() => {
    loadContratos();
  }, []);

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
