import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Trophy } from "lucide-react";

interface Lance {
  id: string;
  fornecedor_id: string;
  valor_lance: number;
  data_hora_lance: string;
  indicativo_lance_vencedor: boolean;
  tipo_lance?: string;
  numero_item?: number;
  fornecedores: {
    razao_social: string;
    cnpj: string;
  };
}

interface SistemaLancesProps {
  selecaoId: string;
  criterioJulgamento: string;
}

export function SistemaLances({ selecaoId, criterioJulgamento }: SistemaLancesProps) {
  const [lances, setLances] = useState<Lance[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadLances();

    // Auto-refresh a cada 5 segundos se ativado
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadLances();
      }, 5000);
    }

    // Subscrição em tempo real
    const channel = supabase
      .channel(`lances_${selecaoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lances_fornecedores",
          filter: `selecao_id=eq.${selecaoId}`,
        },
        () => {
          loadLances();
        }
      )
      .subscribe();

    return () => {
      if (interval) clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [selecaoId, autoRefresh]);

  const loadLances = async () => {
    try {
      const { data, error } = await supabase
        .from("lances_fornecedores")
        .select(`
          *,
          fornecedores (
            razao_social,
            cnpj
          )
        `)
        .eq("selecao_id", selecaoId)
        .order("valor_lance", { ascending: true })
        .order("data_hora_lance", { ascending: true });

      if (error) throw error;

      setLances(data || []);
      
      // Identificar vencedor atual (menor lance)
      if (data && data.length > 0) {
        await atualizarVencedor(data[0].id);
      }
    } catch (error) {
      console.error("Erro ao carregar lances:", error);
      toast.error("Erro ao carregar lances");
    } finally {
      setLoading(false);
    }
  };

  const atualizarVencedor = async (lanceVencedorId: string) => {
    try {
      // Remover indicativo de vencedor de todos os lances
      await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: false })
        .eq("selecao_id", selecaoId);

      // Marcar o novo vencedor
      await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: true })
        .eq("id", lanceVencedorId);
    } catch (error) {
      console.error("Erro ao atualizar vencedor:", error);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatDesconto = (value: number) => {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatCNPJ = (cnpj: string) => {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  const formatDateTime = (dateTime: string) => {
    return new Date(dateTime).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const lanceVencedor = lances.find(l => l.indicativo_lance_vencedor);
  const isDesconto = criterioJulgamento === "desconto";

  if (loading) {
    return <div className="text-center py-8">Carregando lances...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Vencedor Atual */}
      {lanceVencedor && (
        <Card className="border-yellow-500 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-600" />
              Fornecedor em Primeiro Lugar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Empresa</p>
                <p className="font-bold text-lg">{lanceVencedor.fornecedores.razao_social}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CNPJ</p>
                <p className="font-medium">{formatCNPJ(lanceVencedor.fornecedores.cnpj)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isDesconto ? "Maior Desconto" : "Melhor Lance"}</p>
                <p className="font-bold text-2xl text-green-600">
                  {isDesconto 
                    ? `${formatDesconto(lanceVencedor.valor_lance)}%`
                    : formatCurrency(lanceVencedor.valor_lance)
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controles */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lances em Tempo Real</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? "Pausar" : "Ativar"} Atualização Automática
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadLances}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Badge variant="outline">
              Critério: {criterioJulgamento}
            </Badge>
            <Badge variant="outline" className="ml-2">
              Total de Lances: {lances.length}
            </Badge>
            {autoRefresh && (
              <Badge variant="default" className="ml-2">
                ● Atualização Automática Ativa
              </Badge>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posição</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-right">{isDesconto ? "% Desconto" : "Valor do Lance"}</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum lance registrado ainda
                  </TableCell>
                </TableRow>
              ) : (
                lances.map((lance, index) => (
                  <TableRow 
                    key={lance.id}
                    className={lance.indicativo_lance_vencedor ? "bg-yellow-50" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {index === 0 && <Trophy className="h-4 w-4 text-yellow-600" />}
                        <span className="font-bold">{index + 1}º</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{lance.fornecedores.razao_social}</TableCell>
                    <TableCell>{formatCNPJ(lance.fornecedores.cnpj)}</TableCell>
                    <TableCell className="text-right font-bold text-lg">
                      {isDesconto 
                        ? `${formatDesconto(lance.valor_lance)}%`
                        : formatCurrency(lance.valor_lance)
                      }
                    </TableCell>
                    <TableCell>
                      {lance.tipo_lance === 'negociacao' ? (
                        <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                          Negociação
                        </Badge>
                      ) : (
                        <Badge variant="outline">Lance</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(lance.data_hora_lance)}</TableCell>
                    <TableCell className="text-center">
                      {lance.indicativo_lance_vencedor && (
                        <Badge variant="default">Vencedor</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
