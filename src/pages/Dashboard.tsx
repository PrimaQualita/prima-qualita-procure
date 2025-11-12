import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import primaLogo from "@/assets/prima-qualita-logo.png";

const Dashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<any[]>([]);
  const [processos, setProcessos] = useState<any[]>([]);
  
  // Filtros Gráfico 1
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear().toString());
  const [contratoGrafico1, setContratoGrafico1] = useState<string>("todos");
  
  // Filtros Gráfico 2
  const [tipoProcessoSelecionado, setTipoProcessoSelecionado] = useState<string>("todos");
  const [origemContratoSelecionada, setOrigemContratoSelecionada] = useState<string>("todos");

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--destructive))', 'hsl(var(--muted))', 'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: contratosData, error: contratosError } = await supabase
        .from("contratos_gestao")
        .select("*")
        .order("nome_contrato");

      if (contratosError) throw contratosError;

      const { data: processosData, error: processosError } = await supabase
        .from("processos_compras")
        .select("*, contratos_gestao(nome_contrato), cotacoes_precos(enviado_para_selecao)");

      if (processosError) throw processosError;

      setContratos(contratosData || []);
      setProcessos(processosData || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Dados Gráfico 1
  const dadosGrafico1 = () => {
    const processosFiltrados = processos.filter(p => p.ano_referencia.toString() === anoSelecionado);

    if (contratoGrafico1 === "todos") {
      // Agrupar por contrato
      const porContrato: Record<string, number> = {};
      processosFiltrados.forEach(p => {
        const nomeContrato = p.contratos_gestao?.nome_contrato || "Sem Contrato";
        porContrato[nomeContrato] = (porContrato[nomeContrato] || 0) + 1;
      });
      return Object.entries(porContrato).map(([name, value]) => ({ name, value }));
    } else {
      // Agrupar por mês
      const porMes: Record<string, number> = {};
      const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      
      processosFiltrados
        .filter(p => p.contrato_gestao_id === contratoGrafico1)
        .forEach(p => {
          if (p.data_abertura) {
            const mes = new Date(p.data_abertura).getMonth();
            const nomeMes = meses[mes];
            porMes[nomeMes] = (porMes[nomeMes] || 0) + 1;
          }
        });
      
      return meses.map(mes => ({ name: mes, value: porMes[mes] || 0 })).filter(d => d.value > 0);
    }
  };

  // Dados Gráfico 2
  const dadosGrafico2 = () => {
    let processosFiltrados = [...processos];

    if (tipoProcessoSelecionado === "compras_diretas") {
      processosFiltrados = processosFiltrados.filter(p => !p.requer_selecao && !p.credenciamento && !p.contratacao_especifica);
    } else if (tipoProcessoSelecionado === "selecao") {
      processosFiltrados = processosFiltrados.filter(p => p.requer_selecao);
    } else if (tipoProcessoSelecionado === "credenciamentos") {
      processosFiltrados = processosFiltrados.filter(p => p.credenciamento);
    } else if (tipoProcessoSelecionado === "contratacoes_especificas") {
      processosFiltrados = processosFiltrados.filter(p => p.contratacao_especifica);
    } else if (tipoProcessoSelecionado === "contratos") {
      // Filtrar processos que foram enviados para contratação
      processosFiltrados = processosFiltrados.filter(p => {
        const temCotacao = p.cotacoes_precos && p.cotacoes_precos.length > 0;
        const enviadoContratacao = temCotacao && p.cotacoes_precos.some((c: any) => c.enviado_para_selecao !== null);
        return enviadoContratacao;
      });

      if (origemContratoSelecionada !== "todos") {
        if (origemContratoSelecionada === "cotacoes") {
          processosFiltrados = processosFiltrados.filter(p => p.requer_cotacao && !p.requer_selecao);
        } else if (origemContratoSelecionada === "selecao") {
          processosFiltrados = processosFiltrados.filter(p => p.requer_selecao);
        } else if (origemContratoSelecionada === "credenciamentos") {
          processosFiltrados = processosFiltrados.filter(p => p.credenciamento);
        } else if (origemContratoSelecionada === "contratacoes_especificas") {
          processosFiltrados = processosFiltrados.filter(p => p.contratacao_especifica);
        }
      }
    }

    // Agrupar por tipo
    const tipos: Record<string, number> = {
      "Compras Diretas": 0,
      "Seleção de Fornecedores": 0,
      "Credenciamentos": 0,
      "Contratações Específicas": 0,
      "Contratos": 0
    };

    processosFiltrados.forEach(p => {
      const temCotacao = p.cotacoes_precos && p.cotacoes_precos.length > 0;
      const enviadoContratacao = temCotacao && p.cotacoes_precos.some((c: any) => c.enviado_para_selecao !== null);
      
      if (enviadoContratacao) {
        tipos["Contratos"]++;
      } else if (p.credenciamento) {
        tipos["Credenciamentos"]++;
      } else if (p.contratacao_especifica) {
        tipos["Contratações Específicas"]++;
      } else if (p.requer_selecao) {
        tipos["Seleção de Fornecedores"]++;
      } else {
        tipos["Compras Diretas"]++;
      }
    });

    return Object.entries(tipos).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  };

  const anosDisponiveis = Array.from(new Set(processos.map(p => p.ano_referencia))).sort((a, b) => b - a);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico 1 */}
          <Card>
            <CardHeader>
              <CardTitle>Processos por Contrato / Mês</CardTitle>
              <CardDescription>Visualize a distribuição de processos</CardDescription>
              <div className="flex flex-col sm:flex-row gap-4 mt-4">
                <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Selecione o ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map(ano => (
                      <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={contratoGrafico1} onValueChange={setContratoGrafico1}>
                  <SelectTrigger className="w-full sm:w-[250px]">
                    <SelectValue placeholder="Todos os contratos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Contratos</SelectItem>
                    {contratos.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome_contrato}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dadosGrafico1()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="hsl(var(--primary))"
                    dataKey="value"
                  >
                    {dadosGrafico1().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico 2 */}
          <Card>
            <CardHeader>
              <CardTitle>Processos por Tipo</CardTitle>
              <CardDescription>Distribua por modalidade de contratação</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <Select value={tipoProcessoSelecionado} onValueChange={setTipoProcessoSelecionado}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos os tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Tipos</SelectItem>
                    <SelectItem value="compras_diretas">Compras Diretas</SelectItem>
                    <SelectItem value="selecao">Seleção de Fornecedores</SelectItem>
                    <SelectItem value="credenciamentos">Credenciamentos</SelectItem>
                    <SelectItem value="contratacoes_especificas">Contratações Específicas</SelectItem>
                    <SelectItem value="contratos">Contratos</SelectItem>
                  </SelectContent>
                </Select>

                {tipoProcessoSelecionado === "contratos" && (
                  <Select value={origemContratoSelecionada} onValueChange={setOrigemContratoSelecionada}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Todas as origens" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas as Origens</SelectItem>
                      <SelectItem value="cotacoes">Cotações de Preços</SelectItem>
                      <SelectItem value="selecao">Seleção de Fornecedores</SelectItem>
                      <SelectItem value="credenciamentos">Credenciamentos</SelectItem>
                      <SelectItem value="contratacoes_especificas">Contratações Específicas</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dadosGrafico2()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="hsl(var(--secondary))"
                    dataKey="value"
                  >
                    {dadosGrafico2().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
