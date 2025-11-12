import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, CheckCircle, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
}

interface ProcessoCompra {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  status_processo: string;
  ano_referencia: number;
  contrato_gestao_id: string;
  credenciamento: boolean;
  contratacao_especifica: boolean;
  requer_selecao: boolean;
}

export default function Contratos() {
  const navigate = useNavigate();
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGestao | null>(null);
  const [processos, setProcessos] = useState<Record<string, ProcessoCompra[]>>({});
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Buscar contratos de gestão
      const { data: contratosData, error: contratosError } = await supabase
        .from("contratos_gestao")
        .select("*")
        .order("nome_contrato");

      if (contratosError) throw contratosError;

      // Buscar processos que foram enviados para contratação
      // Assumindo que status_processo = 'contratacao' indica processos finalizados
      const { data: processosData, error: processosError } = await supabase
        .from("processos_compras")
        .select("*")
        .eq("status_processo", "contratado")
        .order("numero_processo_interno");

      if (processosError) throw processosError;

      // Agrupar processos por contrato
      const processosAgrupados: Record<string, ProcessoCompra[]> = {};
      processosData?.forEach((processo) => {
        if (!processosAgrupados[processo.contrato_gestao_id]) {
          processosAgrupados[processo.contrato_gestao_id] = [];
        }
        processosAgrupados[processo.contrato_gestao_id].push(processo);
      });

      setContratos(contratosData || []);
      setProcessos(processosAgrupados);
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados de contratos");
    } finally {
      setLoading(false);
    }
  };

  const getTipoProcesso = (processo: ProcessoCompra) => {
    if (processo.credenciamento) return "Credenciamento";
    if (processo.contratacao_especifica) return "Contratação Específica";
    if (processo.requer_selecao) return "Seleção de Fornecedores";
    return "Compra Direta";
  };

  const contratosFiltrados = contratos.filter((contrato) =>
    contrato.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    contrato.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Contratos</h1>
              <p className="text-muted-foreground">
                Processos finalizados e enviados para contratação
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Contratos de Gestão</CardTitle>
              <CardDescription>
                Selecione um contrato para visualizar os processos enviados para contratação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="text"
                placeholder="Buscar contrato..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-background text-foreground"
              />
              
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Nome do Contrato</th>
                      <th className="text-left px-4 py-3 font-medium">Ente Federativo</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contratosFiltrados.map((contrato) => (
                      <tr key={contrato.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3">{contrato.nome_contrato}</td>
                        <td className="px-4 py-3">{contrato.ente_federativo}</td>
                        <td className="px-4 py-3">
                          <Badge variant="default">ativo</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setContratoSelecionado(contrato);
                            }}
                          >
                            Ver Processos
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {contratosFiltrados.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum contrato encontrado
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {contratoSelecionado && (
          <Card>
            <CardHeader>
              <CardTitle>{contratoSelecionado.nome_contrato}</CardTitle>
              <CardDescription>{contratoSelecionado.ente_federativo}</CardDescription>
            </CardHeader>
            <CardContent>
              {processos[contratoSelecionado.id]?.length > 0 ? (
                <div className="space-y-3">
                  {processos[contratoSelecionado.id].map((processo) => (
                    <div
                      key={processo.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                Processo {processo.numero_processo_interno}/{processo.ano_referencia}
                              </p>
                              <Badge variant="outline">
                                {getTipoProcesso(processo)}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {processo.objeto_resumido}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          // TODO: Navegar para página de visualização do contrato
                          toast.info("Funcionalidade em desenvolvimento");
                        }}
                      >
                        Visualizar
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum processo enviado para contratação neste contrato
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
