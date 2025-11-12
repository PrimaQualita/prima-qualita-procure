import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";
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
}

export default function ContratacoesEspecificas() {
  const navigate = useNavigate();
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [processos, setProcessos] = useState<Record<string, ProcessoCompra[]>>({});
  const [loading, setLoading] = useState(true);

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

      // Buscar processos marcados com contratacao_especifica = true
      const { data: processosData, error: processosError } = await supabase
        .from("processos_compras")
        .select("*")
        .eq("contratacao_especifica", true)
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
      toast.error("Erro ao carregar dados de contratações específicas");
    } finally {
      setLoading(false);
    }
  };

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
              <h1 className="text-3xl font-bold text-foreground">Contratações Específicas</h1>
              <p className="text-muted-foreground">
                Gerenciamento de processos de contratação específica
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {contratos.map((contrato) => (
              <Card key={contrato.id}>
                <CardHeader>
                  <CardTitle className="text-xl">{contrato.nome_contrato}</CardTitle>
                  <CardDescription>{contrato.ente_federativo}</CardDescription>
                </CardHeader>
                <CardContent>
                  {processos[contrato.id]?.length > 0 ? (
                    <div className="space-y-3">
                      {processos[contrato.id].map((processo) => (
                        <div
                          key={processo.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-primary" />
                              <div>
                                <p className="font-medium">
                                  Processo {processo.numero_processo_interno}/{processo.ano_referencia}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {processo.objeto_resumido}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              // TODO: Navegar para página de gerenciamento da contratação específica
                              toast.info("Funcionalidade em desenvolvimento");
                            }}
                          >
                            Gerenciar
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum processo de contratação específica neste contrato
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}

            {contratos.length === 0 && (
              <Card>
                <CardContent className="py-12">
                  <p className="text-center text-muted-foreground">
                    Nenhum contrato de gestão cadastrado
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
