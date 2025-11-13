// @ts-nocheck - Propriedades podem não existir no schema atual
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import html2pdf from "html2pdf.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const Dashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<any[]>([]);
  const [processos, setProcessos] = useState<any[]>([]);
  const [isCompliance, setIsCompliance] = useState(false);
  const [processosPendentesCompliance, setProcessosPendentesCompliance] = useState(0);
  
  // Filtros Gráfico 1 - Pizza
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear().toString());
  const [mesSelecionado, setMesSelecionado] = useState<string>("todos");
  const [contratoGrafico1, setContratoGrafico1] = useState<string>("todos");
  
  // Filtros Gráfico 2 - Pizza
  const [anoGrafico2, setAnoGrafico2] = useState(new Date().getFullYear().toString());
  const [mesGrafico2, setMesGrafico2] = useState<string>("todos");
  const [tipoProcessoSelecionado, setTipoProcessoSelecionado] = useState<string>("todos");
  const [origemContratoSelecionada, setOrigemContratoSelecionada] = useState<string>("todos");

  // Tipo de gráfico para cada seção
  const [tipoGrafico1, setTipoGrafico1] = useState<'pie' | 'bar' | 'line'>('bar');
  const [tipoGrafico2, setTipoGrafico2] = useState<'pie' | 'bar' | 'line'>('line');

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--destructive))', 'hsl(var(--muted))', 'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  useEffect(() => {
    loadData();
    checkComplianceRole();
  }, []);

  const checkComplianceRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("compliance, responsavel_legal")
        .eq("id", user.id)
        .single();

      if (profileData && (profileData.compliance || profileData.responsavel_legal)) {
        setIsCompliance(true);
        loadProcessosPendentesCompliance();
      }
    } catch (error) {
      console.error("Erro ao verificar perfil:", error);
    }
  };

  const loadProcessosPendentesCompliance = async () => {
    try {
      const { count, error } = await supabase
        .from("cotacoes_precos")
        .select("*", { count: "exact", head: true })
        .eq("enviado_compliance", true)
        .eq("respondido_compliance", false);

      if (error) throw error;
      setProcessosPendentesCompliance(count || 0);
    } catch (error) {
      console.error("Erro ao carregar processos pendentes:", error);
    }
  };

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
      const porContrato: Record<string, number> = {};
      processosFiltrados.forEach(p => {
        const nomeContrato = p.contratos_gestao?.nome_contrato || "Sem Contrato";
        porContrato[nomeContrato] = (porContrato[nomeContrato] || 0) + 1;
      });
      return Object.entries(porContrato).map(([name, value]) => ({ name, value }));
    } else {
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

  // Dados complementares mesma lógica Pizza 1
  const dadosComplementar1 = () => {
    let processosFiltrados = processos.filter(p => p.ano_referencia.toString() === anoSelecionado);

    if (mesSelecionado !== "todos") {
      const mesIndex = meses.indexOf(mesSelecionado);
      processosFiltrados = processosFiltrados.filter(p => {
        if (p.data_abertura) {
          return new Date(p.data_abertura).getMonth() === mesIndex;
        }
        return false;
      });
    }

    if (contratoGrafico1 !== "todos") {
      processosFiltrados = processosFiltrados.filter(p => p.contrato_gestao_id === contratoGrafico1);
    }

    const dadosPorMes: Record<string, number> = {};
    processosFiltrados.forEach(p => {
      if (p.data_abertura) {
        const mes = new Date(p.data_abertura).getMonth();
        const nomeMes = meses[mes];
        dadosPorMes[nomeMes] = (dadosPorMes[nomeMes] || 0) + 1;
      }
    });

    return meses.map(mes => ({ name: mes, value: dadosPorMes[mes] || 0, mes, processos: dadosPorMes[mes] || 0 }));
  };

  // Dados complementares mesma lógica Pizza 2
  const dadosComplementar2 = () => {
    let processosFiltrados = processos.filter(p => p.ano_referencia.toString() === anoGrafico2);

    if (mesGrafico2 !== "todos") {
      const mesIndex = meses.indexOf(mesGrafico2);
      processosFiltrados = processosFiltrados.filter(p => {
        if (p.data_abertura) {
          return new Date(p.data_abertura).getMonth() === mesIndex;
        }
        return false;
      });
    }

    if (tipoProcessoSelecionado !== "todos") {
      if (tipoProcessoSelecionado === "compras_diretas") {
        processosFiltrados = processosFiltrados.filter(p => !p.requer_selecao && !p.credenciamento && !p.contratacao_especifica);
      } else if (tipoProcessoSelecionado === "selecao") {
        processosFiltrados = processosFiltrados.filter(p => p.requer_selecao);
      } else if (tipoProcessoSelecionado === "credenciamentos") {
        processosFiltrados = processosFiltrados.filter(p => p.credenciamento);
      } else if (tipoProcessoSelecionado === "contratacoes_especificas") {
        processosFiltrados = processosFiltrados.filter(p => p.contratacao_especifica);
      } else if (tipoProcessoSelecionado === "contratos") {
        processosFiltrados = processosFiltrados.filter(p => {
          const temCotacao = p.cotacoes_precos && p.cotacoes_precos.length > 0;
          const enviadoContratacao = temCotacao && p.cotacoes_precos.some((c: any) => c.enviado_para_selecao !== null);
          return enviadoContratacao;
        });
      }
    }

    const dadosPorMes: Record<string, number> = {};
    processosFiltrados.forEach(p => {
      if (p.data_abertura) {
        const mes = new Date(p.data_abertura).getMonth();
        const nomeMes = meses[mes];
        dadosPorMes[nomeMes] = (dadosPorMes[nomeMes] || 0) + 1;
      }
    });

    return meses.map(mes => ({ name: mes, value: dadosPorMes[mes] || 0, mes, processos: dadosPorMes[mes] || 0 }));
  };

  const exportarPDF = async (
    graficoId: string, 
    titulo: string, 
    dados: any[], 
    tipoGrafico: 'pie' | 'bar' | 'line',
    incluirRelacionados: boolean = false,
    graficosRelacionados?: { id: string; titulo: string; dados: any[]; tipo: 'pie' | 'bar' | 'line' }[]
  ) => {
    const graficoElement = document.getElementById(graficoId);
    if (!graficoElement) return;

    const element = document.createElement('div');
    let conteudoCompleto = '';

    // Função para gerar canvas de um gráfico
    const gerarCanvasGrafico = async (id: string) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const canvas = await html2pdf().set({
        margin: 0,
        filename: 'temp.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(el).outputImg();
      return canvas;
    };

    // Função para gerar tabela
    const gerarTabela = (dadosTabela: any[]) => {
      if (dadosTabela[0]?.name !== undefined && dadosTabela[0]?.value !== undefined) {
        return `
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="border: 1px solid #d1d5db; padding: 12px; text-align: left;">Item</th>
                <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              ${dadosTabela.filter(d => d.value > 0).map(d => `
                <tr>
                  <td style="border: 1px solid #d1d5db; padding: 8px;">${d.name || d.mes}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${d.value || d.processos || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else {
        return `
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="border: 1px solid #d1d5db; padding: 12px; text-align: left;">Mês</th>
                <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">Processos</th>
              </tr>
            </thead>
            <tbody>
              ${dadosTabela.filter(d => d.processos > 0).map(d => `
                <tr>
                  <td style="border: 1px solid #d1d5db; padding: 8px;">${d.mes}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${d.processos}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    };

    // Gerar canvas do gráfico principal
    const canvasPrincipal = await gerarCanvasGrafico(graficoId);
    if (!canvasPrincipal) return;

    // Cabeçalho do relatório
    conteudoCompleto = `
      <div style="padding: 40px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="${primaLogo}" style="width: 200px; margin-bottom: 20px;" />
          <h1 style="color: #333; margin: 0;">Relatório Dashboard</h1>
          <h2 style="color: #666; margin: 10px 0;">${titulo}</h2>
          <p style="color: #666;">Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <img src="${canvasPrincipal.src}" style="max-width: 100%; height: auto;" />
        </div>
        ${gerarTabela(dados)}
    `;

    // Se incluir gráficos relacionados
    if (incluirRelacionados && graficosRelacionados) {
      for (const grafico of graficosRelacionados) {
        const canvas = await gerarCanvasGrafico(grafico.id);
        if (canvas) {
          conteudoCompleto += `
            <div style="page-break-before: always; padding-top: 40px;">
              <h2 style="color: #666; margin: 20px 0; text-align: center;">${grafico.titulo}</h2>
              <div style="text-align: center; margin: 30px 0;">
                <img src="${canvas.src}" style="max-width: 100%; height: auto;" />
              </div>
              ${gerarTabela(grafico.dados)}
            </div>
          `;
        }
      }
    }

    conteudoCompleto += '</div>';
    element.innerHTML = conteudoCompleto;

    html2pdf().set({
      margin: 10,
      filename: `relatorio-${titulo.toLowerCase().replace(/\s+/g, '-')}-${new Date().getTime()}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
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
        {isCompliance && processosPendentesCompliance > 0 && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Processos Pendentes de Compliance</AlertTitle>
            <AlertDescription>
              Você tem {processosPendentesCompliance} processo(s) aguardando análise no menu Compliance.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico 1 - Pizza */}
          <Card>
            <CardHeader>
              <CardTitle>Processos por Contratos de Gestão / Mês</CardTitle>
              <CardDescription>Visualize a distribuição de processos</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
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

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="w-full sm:w-auto">
                        <Download className="w-4 h-4 mr-2" /> PDF
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => exportarPDF('grafico-pizza-1', 'Processos por Contratos de Gestão / Mês', dadosGrafico1(), 'pie', false)}>
                        Apenas este gráfico
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportarPDF('grafico-pizza-1', 'Processos por Contratos de Gestão / Mês', dadosGrafico1(), 'pie', true, [
                        { id: 'grafico-velas-1', titulo: 'Gráfico de Barras', dados: dadosComplementar1(), tipo: 'bar' },
                        { id: 'grafico-ecg-1', titulo: 'Tendência Mensal (ECG)', dados: dadosComplementar1(), tipo: 'line' }
                      ])}>
                        Incluir gráficos relacionados
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
            <CardContent id="grafico-pizza-1">
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
              <CardTitle>Modalidades de Contratações Mensais/Anuais</CardTitle>
              <CardDescription>Distribua por modalidade de contratação</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
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

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="w-full sm:w-auto">
                        <Download className="w-4 h-4 mr-2" /> PDF
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => exportarPDF('grafico-pizza-2', 'Modalidades de Contratações Mensais/Anuais', dadosGrafico2(), 'pie', false)}>
                        Apenas este gráfico
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportarPDF('grafico-pizza-2', 'Modalidades de Contratações Mensais/Anuais', dadosGrafico2(), 'pie', true, [
                        { id: 'grafico-velas-2', titulo: 'Gráfico de Barras', dados: dadosComplementar2(), tipo: 'bar' },
                        { id: 'grafico-ecg-2', titulo: 'Tendência Mensal (ECG)', dados: dadosComplementar2(), tipo: 'line' }
                      ])}>
                        Incluir gráficos relacionados
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
            <CardContent id="grafico-pizza-2">
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


        {/* Gráficos de Velas - Mesma lógica dos Pizzas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Processos por Contratos de Gestão / Mês</CardTitle>
              <CardDescription>Gráfico de barras</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
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

                  <Button onClick={() => exportarPDF('grafico-velas-1', 'Processos por Contratos de Gestão / Mês', dadosComplementar1(), 'bar')} size="sm" variant="outline" className="w-full sm:w-auto">
                    <Download className="w-4 h-4 mr-2" /> PDF
                  </Button>
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
            <CardContent id="grafico-velas-1">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosComplementar1()}>
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
              <CardTitle>Modalidades de Contratações Mensais/Anuais</CardTitle>
              <CardDescription>Gráfico de barras</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
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

                  <Button onClick={() => exportarPDF('grafico-velas-2', 'Modalidades de Contratações Mensais/Anuais', dadosComplementar2(), 'bar')} size="sm" variant="outline" className="w-full sm:w-auto">
                    <Download className="w-4 h-4 mr-2" /> PDF
                  </Button>
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
            <CardContent id="grafico-velas-2">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosComplementar2()}>
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
                  <Bar dataKey="processos" fill="hsl(var(--secondary))" name="Processos" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos ECG (Linha) - Mesma lógica dos Pizzas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Processos por Contratos de Gestão / Mês</CardTitle>
              <CardDescription>Tendência mensal</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
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

                  <Button onClick={() => exportarPDF('grafico-ecg-1', 'Processos por Contratos de Gestão / Mês', dadosComplementar1(), 'line')} size="sm" variant="outline" className="w-full sm:w-auto">
                    <Download className="w-4 h-4 mr-2" /> PDF
                  </Button>
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
            <CardContent id="grafico-ecg-1">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dadosComplementar1()}>
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
              <CardTitle>Modalidades de Contratações Mensais/Anuais</CardTitle>
              <CardDescription>Tendência mensal</CardDescription>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
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

                  <Button onClick={() => exportarPDF('grafico-ecg-2', 'Modalidades de Contratações Mensais/Anuais', dadosComplementar2(), 'line')} size="sm" variant="outline" className="w-full sm:w-auto">
                    <Download className="w-4 h-4 mr-2" /> PDF
                  </Button>
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
            <CardContent id="grafico-ecg-2">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dadosComplementar2()}>
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
                    stroke="hsl(var(--secondary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--secondary))', r: 4 }}
                    name="Processos"
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
