import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Eye, Download, ChevronRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
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
  data_envio_compliance: string;
  respondido_compliance: boolean;
  planilha_id: string;
  planilha_nome: string;
  planilha_url: string;
}

export default function Compliance() {
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGestao | null>(null);
  const [processos, setProcessos] = useState<Record<string, ProcessoCompliance[]>>({});
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

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
          cotacoes_precos!inner (
            id,
            titulo_cotacao,
            data_envio_compliance,
            respondido_compliance,
            planilhas_consolidadas (
              id,
              nome_arquivo,
              url_arquivo
            )
          )
        `)
        .eq("cotacoes_precos.enviado_compliance", true);

      if (processosError) throw processosError;

      // Agrupar processos por contrato
      const processosAgrupados: Record<string, ProcessoCompliance[]> = {};
      
      processosData?.forEach((processo: any) => {
        const contratoId = processo.contrato_gestao_id;
        
        processo.cotacoes_precos?.forEach((cotacao: any) => {
          cotacao.planilhas_consolidadas?.forEach((planilha: any) => {
            if (!processosAgrupados[contratoId]) {
              processosAgrupados[contratoId] = [];
            }
            
            processosAgrupados[contratoId].push({
              id: processo.id,
              numero_processo_interno: processo.numero_processo_interno,
              objeto_resumido: processo.objeto_resumido,
              cotacao_id: cotacao.id,
              titulo_cotacao: cotacao.titulo_cotacao,
              data_envio_compliance: cotacao.data_envio_compliance,
              respondido_compliance: cotacao.respondido_compliance,
              planilha_id: planilha.id,
              planilha_nome: planilha.nome_arquivo,
              planilha_url: planilha.url_arquivo,
            });
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

  const handleVisualizarPlanilha = async (processo: ProcessoCompliance) => {
    try {
      let filePath = processo.planilha_url;
      if (filePath.includes('/storage/v1/object/public/processo-anexos/')) {
        filePath = filePath.split('/storage/v1/object/public/processo-anexos/')[1];
      }

      const { data, error } = await supabase.storage
        .from("processo-anexos")
        .createSignedUrl(filePath, 3600);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Erro ao gerar URL de visualização");

      window.open(data.signedUrl, "_blank");
    } catch (error: any) {
      console.error("Erro ao visualizar planilha:", error);
      toast.error("Erro ao visualizar planilha: " + error.message);
    }
  };

  const handleBaixarPlanilha = async (processo: ProcessoCompliance) => {
    try {
      let filePath = processo.planilha_url;
      if (filePath.includes('/storage/v1/object/public/processo-anexos/')) {
        filePath = filePath.split('/storage/v1/object/public/processo-anexos/')[1];
      }

      const { data, error } = await supabase.storage
        .from("processo-anexos")
        .createSignedUrl(filePath, 3600);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Erro ao gerar URL de download");

      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = processo.planilha_nome;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Download iniciado!");
    } catch (error: any) {
      console.error("Erro ao baixar planilha:", error);
      toast.error("Erro ao baixar planilha: " + error.message);
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
                      <TableHead>Planilha</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processos[contratoSelecionado.id].map((processo) => (
                      <TableRow key={`${processo.id}-${processo.planilha_id}`}>
                        <TableCell className="font-medium">
                          {processo.numero_processo_interno}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {processo.objeto_resumido}
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
                        <TableCell className="max-w-xs truncate">
                          {processo.planilha_nome}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 justify-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVisualizarPlanilha(processo)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Visualizar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleBaixarPlanilha(processo)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Baixar
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
      </div>
    </div>
  );
}
