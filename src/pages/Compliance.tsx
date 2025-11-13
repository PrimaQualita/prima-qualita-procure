import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ContratoCompliance {
  id: string;
  nome: string;
  processos: ProcessoCompliance[];
}

interface ProcessoCompliance {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  cotacoes: {
    id: string;
    titulo_cotacao: string;
    data_envio_compliance: string;
    respondido_compliance: boolean;
    planilhas_consolidadas: {
      id: string;
      nome_arquivo: string;
      url_arquivo: string;
      data_geracao: string;
    }[];
  }[];
}

export default function Compliance() {
  const [processos, setProcessos] = useState<ContratoCompliance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProcessos();
  }, []);

  const loadProcessos = async () => {
    try {
      // Primeiro, buscar TODOS os contratos de gestão
      const { data: contratosData, error: contratosError } = await supabase
        .from("contratos_gestao")
        .select("id, nome_contrato")
        .order("nome_contrato");

      if (contratosError) throw contratosError;

      // Depois, buscar processos que foram enviados ao compliance
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
            enviado_compliance,
            respondido_compliance,
            planilhas_consolidadas (
              id,
              nome_arquivo,
              url_arquivo,
              data_geracao
            )
          )
        `)
        .eq("cotacoes_precos.enviado_compliance", true);

      if (processosError) throw processosError;

      // Montar estrutura: todos os contratos com seus processos (se houver)
      const contratosList = contratosData.map(contrato => ({
        id: contrato.id,
        nome: contrato.nome_contrato,
        processos: processosData
          ?.filter((p: any) => p.contrato_gestao_id === contrato.id)
          .map((processo: any) => ({
            id: processo.id,
            numero_processo_interno: processo.numero_processo_interno,
            objeto_resumido: processo.objeto_resumido,
            cotacoes: processo.cotacoes_precos || [],
          })) || []
      }));

      setProcessos(contratosList);
    } catch (error: any) {
      console.error("Erro ao carregar processos:", error);
      toast.error("Erro ao carregar processos de compliance");
    } finally {
      setLoading(false);
    }
  };

  const handleVisualizarPlanilha = async (planilha: any) => {
    try {
      // Extrai o caminho relativo
      let filePath = planilha.url_arquivo;
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

  const handleBaixarPlanilha = async (planilha: any) => {
    try {
      let filePath = planilha.url_arquivo;
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
      link.download = planilha.nome_arquivo;
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

  return (
    <div className="p-6 space-y-6">
      {loading ? (
        <div className="py-8 text-center text-muted-foreground">
          Carregando processos...
        </div>
      ) : processos.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          Nenhum contrato de gestão cadastrado
        </div>
      ) : (
        processos.map((contrato: any) => (
          <Card key={contrato.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-6 w-6" />
                {contrato.nome}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contrato.processos.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  Nenhum processo enviado ao compliance neste contrato
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Processo</TableHead>
                      <TableHead>Objeto</TableHead>
                      <TableHead>Cotação</TableHead>
                      <TableHead>Data Envio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Planilha Consolidada</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contrato.processos.map((processo: any) =>
                      processo.cotacoes.map((cotacao: any) =>
                        cotacao.planilhas_consolidadas.map((planilha: any) => (
                          <TableRow key={planilha.id}>
                            <TableCell className="font-medium">
                              {processo.numero_processo_interno}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {processo.objeto_resumido}
                            </TableCell>
                            <TableCell>{cotacao.titulo_cotacao}</TableCell>
                            <TableCell>
                              {cotacao.data_envio_compliance
                                ? formatarData(cotacao.data_envio_compliance)
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {cotacao.respondido_compliance ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  Respondido
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                  Pendente
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{planilha.nome_arquivo}</TableCell>
                            <TableCell>
                              <div className="flex gap-2 justify-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleVisualizarPlanilha(planilha)}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Visualizar
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleBaixarPlanilha(planilha)}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Baixar
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
