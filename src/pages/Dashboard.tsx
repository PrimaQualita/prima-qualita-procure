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
  
  // Filtros Gráfico 1 - Pizza
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear().toString());
  const [mesSelecionado, setMesSelecionado] = useState<string>("todos");
  const [contratoGrafico1, setContratoGrafico1] = useState<string>("todos");
  
  // Filtros Gráfico 2 - Pizza
  const [anoGrafico2, setAnoGrafico2] = useState(new Date().getFullYear().toString());
  const [mesGrafico2, setMesGrafico2] = useState<string>("todos");
  const [tipoProcessoSelecionado, setTipoProcessoSelecionado] = useState<string>("todos");
  const [origemContratoSelecionada, setOrigemContratoSelecionada] = useState<string>("todos");

  // Filtros Gráfico 3 - Velas (Processos)
  const [anoVelas1, setAnoVelas1] = useState(new Date().getFullYear().toString());
  const [mesVelas1, setMesVelas1] = useState<string>("todos");
  const [contratoVelas1, setContratoVelas1] = useState<string>("todos");

  // Filtros Gráfico 4 - Velas (Contratos)
  const [anoVelas2, setAnoVelas2] = useState(new Date().getFullYear().toString());
  const [mesVelas2, setMesVelas2] = useState<string>("todos");
  const [contratoVelas2, setContratoVelas2] = useState<string>("todos");

  // Filtros Gráfico 5 - Linha (Processos)
  const [anoLinha1, setAnoLinha1] = useState(new Date().getFullYear().toString());
  const [mesLinha1, setMesLinha1] = useState<string>("todos");
  const [contratoLinha1, setContratoLinha1] = useState<string>("todos");

  // Filtros Gráfico 6 - Linha (Contratos)
  const [anoLinha2, setAnoLinha2] = useState(new Date().getFullYear().toString());
  const [mesLinha2, setMesLinha2] = useState<string>("todos");
  const [contratoLinha2, setContratoLinha2] = useState<string>("todos");

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

  // Dados para gráficos de velas (Processos por mês)
  const dadosVelas1 = () => {
    let processosFiltrados = processos.filter(p => p.ano_referencia.toString() === anoVelas1);

    if (mesVelas1 !== "todos") {
      const mesIndex = meses.indexOf(mesVelas1);
      processosFiltrados = processosFiltrados.filter(p => {
        if (p.data_abertura) {
          return new Date(p.data_abertura).getMonth() === mesIndex;
        }
        return false;
      });
    }

    if (contratoVelas1 !== "todos") {
      processosFiltrados = processosFiltrados.filter(p => p.contrato_gestao_id === contratoVelas1);
    }

    const dadosPorMes: Record<string, number> = {};
    processosFiltrados.forEach(p => {
      if (p.data_abertura) {
        const mes = new Date(p.data_abertura).getMonth();
        const nomeMes = meses[mes];
        dadosPorMes[nomeMes] = (dadosPorMes[nomeMes] || 0) + 1;
      }
    });

    return meses.map(mes => ({ mes, processos: dadosPorMes[mes] || 0 }));
  };

  // Dados para gráficos de velas (Contratos finalizados por mês)
  const dadosVelas2 = () => {
    let processosFiltrados = processos.filter(p => 
      p.ano_referencia.toString() === anoVelas2 && 
      p.status_processo === 'contratado'
    );

    if (mesVelas2 !== "todos") {
      const mesIndex = meses.indexOf(mesVelas2);
      processosFiltrados = processosFiltrados.filter(p => {
        if (p.data_abertura) {
          return new Date(p.data_abertura).getMonth() === mesIndex;
        }
        return false;
      });
    }

    if (contratoVelas2 !== "todos") {
      processosFiltrados = processosFiltrados.filter(p => p.contrato_gestao_id === contratoVelas2);
    }

    const dadosPorMes: Record<string, number> = {};
    processosFiltrados.forEach(p => {
      if (p.data_abertura) {
        const mes = new Date(p.data_abertura).getMonth();
        const nomeMes = meses[mes];
        dadosPorMes[nomeMes] = (dadosPorMes[nomeMes] || 0) + 1;
      }
    });

    return meses.map(mes => ({ mes, contratos: dadosPorMes[mes] || 0 }));
  };

  // Dados para gráficos de linha (Processos)
  const dadosLinha1 = () => {
    let processosFiltrados = processos.filter(p => p.ano_referencia.toString() === anoLinha1);

    if (mesLinha1 !== "todos") {
      const mesIndex = meses.indexOf(mesLinha1);
      processosFiltrados = processosFiltrados.filter(p => {
        if (p.data_abertura) {
          return new Date(p.data_abertura).getMonth() === mesIndex;
        }
        return false;
      });
    }

    if (contratoLinha1 !== "todos") {
      processosFiltrados = processosFiltrados.filter(p => p.contrato_gestao_id === contratoLinha1);
    }

    const dadosPorMes: Record<string, number> = {};
    processosFiltrados.forEach(p => {
      if (p.data_abertura) {
        const mes = new Date(p.data_abertura).getMonth();
        const nomeMes = meses[mes];
        dadosPorMes[nomeMes] = (dadosPorMes[nomeMes] || 0) + 1;
      }
    });

    return meses.map(mes => ({ mes, processos: dadosPorMes[mes] || 0 }));
  };

  // Dados para gráficos de linha (Contratos)
  const dadosLinha2 = () => {
    let processosFiltrados = processos.filter(p => 
      p.ano_referencia.toString() === anoLinha2 && 
      p.status_processo === 'contratado'
    );

    if (mesLinha2 !== "todos") {
      const mesIndex = meses.indexOf(mesLinha2);
      processosFiltrados = processosFiltrados.filter(p => {
        if (p.data_abertura) {
          return new Date(p.data_abertura).getMonth() === mesIndex;
        }
        return false;
      });
    }

    if (contratoLinha2 !== "todos") {
      processosFiltrados = processosFiltrados.filter(p => p.contrato_gestao_id === contratoLinha2);
    }

    const dadosPorMes: Record<string, number> = {};
    processosFiltrados.forEach(p => {
      if (p.data_abertura) {
        const mes = new Date(p.data_abertura).getMonth();
        const nomeMes = meses[mes];
        dadosPorMes[nomeMes] = (dadosPorMes[nomeMes] || 0) + 1;
      }
    });

    return meses.map(mes => ({ mes, contratos: dadosPorMes[mes] || 0 }));
  };

  const exportarPDF = (tipo: string, dados: any[]) => {
    const element = document.createElement('div');
    let conteudoTabela = '';
    
    if (tipo.includes('pizza')) {
      conteudoTabela = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: left;">Item</th>
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">Quantidade</th>
            </tr>
          </thead>
          <tbody>
            ${dados.map(d => `
              <tr>
                <td style="border: 1px solid #d1d5db; padding: 8px;">${d.name}</td>
                <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${d.value}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      const chave = tipo.includes('processos') ? 'processos' : 'contratos';
      conteudoTabela = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: left;">Mês</th>
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">${chave === 'processos' ? 'Processos' : 'Contratos'}</th>
            </tr>
          </thead>
          <tbody>
            ${dados.map(d => `
              <tr>
                <td style="border: 1px solid #d1d5db; padding: 8px;">${d.mes}</td>
                <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${d[chave]}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    element.innerHTML = `
      <div style="padding: 40px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="${primaLogo}" style="width: 200px; margin-bottom: 20px;" />
          <h1 style="color: #333; margin: 0;">Relatório Dashboard - ${tipo}</h1>
          <p style="color: #666;">Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        ${conteudoTabela}
      </div>
    `;

    html2pdf().set({
      margin: 10,
      filename: `relatorio-dashboard-${tipo}-${new Date().getTime()}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
  };

  const exportarXLS = (tipo: string, dados: any[]) => {
    let dadosFormatados;
    
    if (tipo.includes('pizza')) {
      dadosFormatados = dados.map(d => ({
        'Item': d.name,
        'Quantidade': d.value
      }));
    } else {
      const chave = tipo.includes('processos') ? 'processos' : 'contratos';
      dadosFormatados = dados.map(d => ({
        'Mês': d.mes,
        [chave === 'processos' ? 'Processos' : 'Contratos']: d[chave]
      }));
    }
    
    const ws = XLSX.utils.json_to_sheet(dadosFormatados);
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
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('pizza-1', dadosGrafico1())} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('pizza-1', dadosGrafico1())} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
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
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('pizza-2', dadosGrafico2())} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('pizza-2', dadosGrafico2())} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
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
              <CardTitle>Procedimentos de Contratação Mensal</CardTitle>
              <CardDescription>Número de processos abertos por mês</CardDescription>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('velas-processos', dadosVelas1())} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('velas-processos', dadosVelas1())} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Select value={anoVelas1} onValueChange={setAnoVelas1}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {anosDisponiveis.map(ano => (
                        <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={mesVelas1} onValueChange={setMesVelas1}>
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

                <Select value={contratoVelas1} onValueChange={setContratoVelas1}>
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
                <BarChart data={dadosVelas1()}>
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
              <CardTitle>Contratos Finalizados Mensais</CardTitle>
              <CardDescription>Número de contratos fechados por mês</CardDescription>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('velas-contratos', dadosVelas2())} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('velas-contratos', dadosVelas2())} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Select value={anoVelas2} onValueChange={setAnoVelas2}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {anosDisponiveis.map(ano => (
                        <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={mesVelas2} onValueChange={setMesVelas2}>
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

                <Select value={contratoVelas2} onValueChange={setContratoVelas2}>
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
                <BarChart data={dadosVelas2()}>
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
                  <Bar dataKey="contratos" fill="hsl(var(--secondary))" name="Contratos" />
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
                <Button onClick={() => exportarPDF('linha-processos', dadosLinha1())} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('linha-processos', dadosLinha1())} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Select value={anoLinha1} onValueChange={setAnoLinha1}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {anosDisponiveis.map(ano => (
                        <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={mesLinha1} onValueChange={setMesLinha1}>
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

                <Select value={contratoLinha1} onValueChange={setContratoLinha1}>
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
                <LineChart data={dadosLinha1()}>
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
              <CardTitle>Evolução de Contratos</CardTitle>
              <CardDescription>Tendência de contratos finalizados mensais</CardDescription>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => exportarPDF('linha-contratos', dadosLinha2())} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button onClick={() => exportarXLS('linha-contratos', dadosLinha2())} size="sm" variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> XLS
                </Button>
              </div>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Select value={anoLinha2} onValueChange={setAnoLinha2}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {anosDisponiveis.map(ano => (
                        <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={mesLinha2} onValueChange={setMesLinha2}>
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

                <Select value={contratoLinha2} onValueChange={setContratoLinha2}>
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
                <LineChart data={dadosLinha2()}>
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
                    dataKey="contratos" 
                    stroke="hsl(var(--secondary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--secondary))', r: 4 }}
                    name="Contratos"
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
