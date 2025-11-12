import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, FileText, ChevronRight } from "lucide-react";
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
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-10 sm:h-12" />
            <div>
              <h1 className="text-lg sm:text-xl font-bold">Gestão de Contratos e Processos</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Credenciamento</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : !contratoSelecionado ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Contratos de Gestão</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Selecione um contrato para visualizar os processos que requerem credenciamento
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="px-4 sm:px-0 mb-4">
                <Input
                  placeholder="Buscar contrato..."
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
                      <TableHead className="min-w-[80px]">Status</TableHead>
                      <TableHead className="text-right min-w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contratosFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-xs sm:text-sm">
                          Nenhum contrato encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      contratosFiltrados.map((contrato) => (
                        <TableRow key={contrato.id}>
                          <TableCell className="font-medium text-xs sm:text-sm">{contrato.nome_contrato}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{contrato.ente_federativo}</TableCell>
                          <TableCell>
                            <Badge variant={contrato.status === "ativo" ? "default" : "secondary"} className="text-xs">
                              {contrato.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setContratoSelecionado(contrato);
                                loadProcessos(contrato.id);
                              }}
                              className="text-xs"
                            >
                              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                              <span className="hidden sm:inline">Ver Processos</span>
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg">{contratoSelecionado.nome_contrato}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{contratoSelecionado.ente_federativo}</CardDescription>
                </div>
                <Button variant="outline" onClick={() => setContratoSelecionado(null)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
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
                            <p className="font-medium text-xs sm:text-sm">
                              Processo {processo.numero_processo_interno}/{processo.ano_referencia}
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              {processo.objeto_resumido}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
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
                <p className="text-center text-muted-foreground py-8 text-xs sm:text-sm">
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
