import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import html2pdf from "html2pdf.js";
import * as XLSX from "xlsx";

const Dashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<any[]>([]);
  const [processos, setProcessos] = useState<any[]>([]);
  
  // Filtros Gráfico 1
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear().toString());
  const [mesSelecionado, setMesSelecionado] = useState<string>("todos");
  const [contratoGrafico1, setContratoGrafico1] = useState<string>("todos");
  
  // Filtros Gráfico 2
  const [anoGrafico2, setAnoGrafico2] = useState(new Date().getFullYear().toString());
  const [mesGrafico2, setMesGrafico2] = useState<string>("todos");
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

  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // Dados Gráfico 1
  const dadosGrafico1 = () => {
    let processosFiltrados = processos.filter(p => p.ano_referencia.toString() === anoSelecionado);

    // Filtrar por mês se selecionado
    if (mesSelecionado !== "todos") {
      const mesIndex = meses.indexOf(mesSelecionado);
      processosFiltrados = processosFiltrados.filter(p => {
        if (p.data_abertura) {
          return new Date(p.data_abertura).getMonth() === mesIndex;
        }
        return false;
      });
    }

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
    let processosFiltrados = processos.filter(p => p.ano_referencia.toString() === anoGrafico2);

    // Filtrar por mês se selecionado
    if (mesGrafico2 !== "todos") {
      const mesIndex = meses.indexOf(mesGrafico2);
      processosFiltrados = processosFiltrados.filter(p => {
        if (p.data_abertura) {
          return new Date(p.data_abertura).getMonth() === mesIndex;
        }
        return false;
      });
    }

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

  // Dados para gráficos de linha e velas
  const dadosTemporais = () => {
    const dadosPorMes: Record<string, { mes: string, processos: number, valor: number }> = {};
    
    processos
      .filter(p => p.ano_referencia.toString() === anoSelecionado)
      .forEach(p => {
        if (p.data_abertura) {
          const mes = new Date(p.data_abertura).getMonth();
          const nomeMes = meses[mes];
          if (!dadosPorMes[nomeMes]) {
            dadosPorMes[nomeMes] = { mes: nomeMes, processos: 0, valor: 0 };
          }
          dadosPorMes[nomeMes].processos++;
          dadosPorMes[nomeMes].valor += Number(p.valor_estimado_anual || 0);
        }
      });

    return meses.map(mes => dadosPorMes[mes] || { mes, processos: 0, valor: 0 });
  };

  const exportarPDF = (tipo: string) => {
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="padding: 40px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="${primaLogo}" style="width: 200px; margin-bottom: 20px;" />
          <h1 style="color: #333; margin: 0;">Relatório Dashboard - ${tipo}</h1>
          <p style="color: #666;">Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        <div style="margin-top: 30px;">
          <h2>Dados do Período</h2>
          <p><strong>Ano:</strong> ${anoSelecionado}</p>
          <p><strong>Total de Processos:</strong> ${processos.filter(p => p.ano_referencia.toString() === anoSelecionado).length}</p>
        </div>
      </div>
    `;

    html2pdf().set({
      margin: 10,
      filename: `relatorio-dashboard-${tipo}-${new Date().getTime()}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
  };

  const exportarXLS = (tipo: string) => {
    const dados = dadosTemporais();
    const ws = XLSX.utils.json_to_sheet(dados.map(d => ({
      'Mês': d.mes,
      'Processos': d.processos,
      'Valor Total': d.valor.toFixed(2)
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
    XLSX.writeFile(wb, `relatorio-dashboard-${tipo}-${new Date().getTime()}.xlsx`);
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
          {/* Gráfico 1 - Pizza */}
          <Card>
            <CardHeader>
              <CardTitle>Processos por Contratos de Gestão / Mês</CardTitle>
              <CardDescription>Visualize a distribuição de processos</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {anosDisponiveis.map(ano => (
                        <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Mês" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os Meses</SelectItem>
                      {meses.map(mes => (
                        <SelectItem key={mes} value={mes}>{mes}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Select value={contratoGrafico1} onValueChange={setContratoGrafico1}>
                  <SelectTrigger className="w-full">
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

          {/* Gráfico 2 - Pizza */}
          <Card>
            <CardHeader>
              <CardTitle>Processos por Tipo</CardTitle>
              <CardDescription>Distribua por modalidade de contratação</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Select value={anoGrafico2} onValueChange={setAnoGrafico2}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {anosDisponiveis.map(ano => (
                        <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={mesGrafico2} onValueChange={setMesGrafico2}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Mês" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os Meses</SelectItem>
                      {meses.map(mes => (
                        <SelectItem key={mes} value={mes}>{mes}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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

        {/* Gráficos de Velas (Candlestick) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Evolução Mensal de Processos</CardTitle>
              <CardDescription>Análise temporal de abertura de processos</CardDescription>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('velas-1')} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('velas-1')} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosTemporais()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="processos" fill="hsl(var(--primary))" name="Processos" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Valores Estimados Mensais</CardTitle>
              <CardDescription>Distribuição de valores ao longo do ano</CardDescription>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('velas-2')} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('velas-2')} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosTemporais()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value: any) => `R$ ${Number(value).toFixed(2)}`}
                  />
                  <Legend />
                  <Bar dataKey="valor" fill="hsl(var(--secondary))" name="Valor Total (R$)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos de Linha (ECG Style) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Tendência de Processos</CardTitle>
              <CardDescription>Curva de abertura mensal de processos</CardDescription>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('linha-1')} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('linha-1')} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dadosTemporais()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }} 
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="processos" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                    name="Processos"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evolução de Valores</CardTitle>
              <CardDescription>Tendência de valores estimados mensais</CardDescription>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('linha-2')} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('linha-2')} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dadosTemporais()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value: any) => `R$ ${Number(value).toFixed(2)}`}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="valor" 
                    stroke="hsl(var(--secondary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--secondary))', r: 4 }}
                    name="Valor Total (R$)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
