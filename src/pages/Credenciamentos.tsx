import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, FileText, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  status: string;
}

interface ProcessoCompra {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  status_processo: string;
  ano_referencia: number;
  contrato_gestao_id: string;
}

export default function Credenciamentos() {
  const navigate = useNavigate();
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGestao | null>(null);
  const [processos, setProcessos] = useState<Record<string, ProcessoCompra[]>>({});
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    loadContratos();
  }, []);

  const loadContratos = async () => {
    const { data, error } = await supabase
      .from("contratos_gestao")
      .select("*")
      .order("nome_contrato");

    if (error) {
      toast.error("Erro ao carregar contratos");
      console.error(error);
    } else {
      setContratos(data || []);
    }
    setLoading(false);
  };

  const loadProcessos = async (contratoId: string) => {
    try {
      const { data, error } = await supabase
        .from("processos_compras")
        .select("*")
        .eq("contrato_gestao_id", contratoId)
        .eq("credenciamento", true)
        .order("numero_processo_interno");

      if (error) throw error;

      const processosAgrupados: Record<string, ProcessoCompra[]> = {};
      data?.forEach((processo) => {
        if (!processosAgrupados[processo.contrato_gestao_id]) {
          processosAgrupados[processo.contrato_gestao_id] = [];
        }
        processosAgrupados[processo.contrato_gestao_id].push(processo);
      });

      setProcessos(processosAgrupados);
    } catch (error: any) {
      console.error("Erro ao carregar processos:", error);
      toast.error("Erro ao carregar processos");
    }
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
              <h1 className="text-3xl font-bold text-foreground">Credenciamento</h1>
              <p className="text-muted-foreground">
                Gerenciamento de processos de credenciamento (PJs médicas)
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
                Selecione um contrato para visualizar os processos que requerem credenciamento
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
                          <Badge variant={contrato.status === "ativo" ? "default" : "secondary"}>
                            {contrato.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setContratoSelecionado(contrato);
                              loadProcessos(contrato.id);
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
                  Nenhum processo de credenciamento neste contrato
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
