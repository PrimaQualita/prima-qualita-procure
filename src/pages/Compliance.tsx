import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Download, ChevronRight, ArrowLeft, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { stripHtml } from "@/lib/htmlUtils";
import { DialogAnaliseCompliance } from "@/components/compliance/DialogAnaliseCompliance";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
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
}

export default function Compliance() {
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGestao | null>(null);
  const [processos, setProcessos] = useState<Record<string, ProcessoCompliance[]>>({});
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [analiseDialogOpen, setAnaliseDialogOpen] = useState(false);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoCompliance | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
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

      // Agrupar processos por contrato
      const processosAgrupados: Record<string, ProcessoCompliance[]> = {};
      
      processosData?.forEach((processo: any) => {
        const contratoId = processo.contrato_gestao_id;
        
        processo.cotacoes_precos?.forEach((cotacao: any) => {
          if (!processosAgrupados[contratoId]) {
            processosAgrupados[contratoId] = [];
          }
          
          processosAgrupados[contratoId].push({
            id: processo.id,
            numero_processo_interno: processo.numero_processo_interno,
            objeto_resumido: processo.objeto_resumido,
            cotacao_id: cotacao.id,
            titulo_cotacao: cotacao.titulo_cotacao,
            criterio_julgamento: cotacao.criterio_julgamento,
            data_envio_compliance: cotacao.data_envio_compliance,
            respondido_compliance: cotacao.respondido_compliance,
            ano_referencia: processo.ano_referencia,
          });
        });
      });

      setContratos(contratosData || []);
      setProcessos(processosAgrupados);
    } catch (error: any) {
      console.error("Erro ao carregar processos:", error);
      toast.error("Erro ao carregar processos de compliance");
    } finally {
      setLoading(false);
    }
  };

  const abrirAnaliseCompliance = (processo: ProcessoCompliance) => {
    setProcessoSelecionado(processo);
    setAnaliseDialogOpen(true);
  };

  const visualizarProcesso = async (processo: ProcessoCompliance) => {
    try {
      toast.loading("Gerando visualização do processo...");
      
      const { gerarProcessoCompletoPDF } = await import("@/lib/gerarProcessoCompletoPDF");
      const resultado = await gerarProcessoCompletoPDF(
        processo.cotacao_id,
        `${processo.numero_processo_interno}/${processo.ano_referencia}`
      );
      
      toast.dismiss();
      window.open(resultado.url, '_blank');
    } catch (error: any) {
      toast.dismiss();
      console.error("Erro ao visualizar processo:", error);
      toast.error("Erro ao gerar visualização do processo");
    }
  };

  const baixarProcesso = async (processo: ProcessoCompliance) => {
    try {
      toast.loading("Gerando arquivo do processo...");
      
      const { gerarProcessoCompletoPDF } = await import("@/lib/gerarProcessoCompletoPDF");
      const resultado = await gerarProcessoCompletoPDF(
        processo.cotacao_id,
        `${processo.numero_processo_interno}/${processo.ano_referencia}`
      );
      
      toast.dismiss();
      
      const link = document.createElement('a');
      link.href = resultado.url;
      link.download = resultado.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Processo baixado com sucesso");
    } catch (error: any) {
      toast.dismiss();
      console.error("Erro ao baixar processo:", error);
      toast.error("Erro ao gerar arquivo do processo");
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
                Gerencie processos enviados ao compliance
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                    <TableHead>Processos Pendentes</TableHead>
                    <TableHead>Processos Respondidos</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.map((contrato) => {
                    const processosContrato = processos[contrato.id] || [];
                    const pendentes = processosContrato.filter(p => !p.respondido_compliance).length;
                    const respondidos = processosContrato.filter(p => p.respondido_compliance).length;
                    
                    return (
                      <TableRow key={contrato.id}>
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
              {processos[contratoSelecionado.id]?.length > 0 ? (
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
                    {processos[contratoSelecionado.id].map((processo) => (
                      <TableRow key={`${processo.id}-${processo.cotacao_id}`}>
                        <TableCell className="font-medium">
                          {processo.numero_processo_interno}/{processo.ano_referencia}
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => baixarProcesso(processo)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Baixar Processo
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => abrirAnaliseCompliance(processo)}
                            >
                              <FileCheck className="h-4 w-4 mr-2" />
                              Gerar Análise
                            </Button>
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
            </CardContent>
          </Card>
        )}

        {processoSelecionado && (
          <DialogAnaliseCompliance
            open={analiseDialogOpen}
            onOpenChange={setAnaliseDialogOpen}
            processoId={processoSelecionado.id}
            cotacaoId={processoSelecionado.cotacao_id}
            numeroProcesso={`${processoSelecionado.numero_processo_interno}/${processoSelecionado.ano_referencia}`}
            objetoDescricao={stripHtml(processoSelecionado.objeto_resumido)}
            criterioJulgamento={processoSelecionado.criterio_julgamento}
          />
        )}
      </div>
    </div>
  );
}
