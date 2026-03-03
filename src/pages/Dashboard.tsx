// @ts-nocheck - Propriedades podem não existir no schema atual
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle, BarChart3 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { SolicitacoesAutorizacao } from "@/components/dashboard/SolicitacoesAutorizacao";
import { SolicitacoesHomologacao } from "@/components/dashboard/SolicitacoesHomologacao";
import { SolicitacoesAutorizacaoSelecao } from "@/components/dashboard/SolicitacoesAutorizacaoSelecao";
import { atualizarAtaComAssinaturas } from "@/lib/gerarAtaSelecaoPDF";
import { DashboardBIFilters } from "@/components/dashboard/DashboardBIFilters";
import { DashboardBIKPIs } from "@/components/dashboard/DashboardBIKPIs";
import { DashboardBIChart, type ChartType } from "@/components/dashboard/DashboardBIChart";
import { DashboardBIRanking } from "@/components/dashboard/DashboardBIRanking";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type TipoProcesso = "processos" | "selecao" | "compras_diretas" | "credenciamentos" | "contratacoes_especificas" | "compliance" | "fornecedores" | "contratos";

const TIPO_LABELS: Record<TipoProcesso, string> = {
  processos: "Processos",
  selecao: "Seleção de Fornecedores",
  compras_diretas: "Compras Diretas",
  credenciamentos: "Credenciamentos",
  contratacoes_especificas: "Contratações Específicas",
  compliance: "Análises do Compliance",
  fornecedores: "Cadastro de Fornecedores",
  contratos: "Contratos",
};

const Dashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<any[]>([]);
  const [processos, setProcessos] = useState<any[]>([]);
  const [selecoes, setSelecoes] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [analisesCompliance, setAnalisesCompliance] = useState<any[]>([]);
  const [contratosTerceiros, setContratosTerceiros] = useState<any[]>([]);

  // Existing state
  const [isCompliance, setIsCompliance] = useState(false);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);
  const [isSuperintendenteExecutivo, setIsSuperintendenteExecutivo] = useState(false);
  const [processosPendentesCompliance, setProcessosPendentesCompliance] = useState(0);
  const [avaliacoesCadastroPendentes, setAvaliacoesCadastroPendentes] = useState(0);
  const [atasPendentesAssinatura, setAtasPendentesAssinatura] = useState<any[]>([]);
  const [assinandoAta, setAssinandoAta] = useState<string | null>(null);

  // BI Filters
  const [contratoSelecionado, setContratoSelecionado] = useState("todos");
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear().toString());
  const [mesSelecionado, setMesSelecionado] = useState<string>("todos");
  const [modoVisualizacao, setModoVisualizacao] = useState<"individual" | "comparativo">("individual");
  const [tipoGraficoGlobal, setTipoGraficoGlobal] = useState<ChartType>("barras");

  // Individual
  const [tipoProcessoIndividual, setTipoProcessoIndividual] = useState<TipoProcesso>("processos");

  // Comparativo
  const [processosComparativos, setProcessosComparativos] = useState<TipoProcesso[]>(["processos", "selecao"]);

  useEffect(() => {
    loadData();
    checkComplianceRole();
    loadAtasPendentesAssinatura();
  }, []);

  const checkComplianceRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileData } = await supabase.from("profiles").select("compliance, responsavel_legal, superintendente_executivo").eq("id", user.id).single();
      if (profileData) {
        setIsCompliance(profileData.compliance || false);
        setIsResponsavelLegal(profileData.responsavel_legal || false);
        setIsSuperintendenteExecutivo(profileData.superintendente_executivo || false);
        if (profileData.compliance || profileData.responsavel_legal || profileData.superintendente_executivo) {
          loadProcessosPendentesCompliance();
          loadAvaliacoesCadastroPendentes();
        }
      }
    } catch (error) { console.error("Erro ao verificar perfil:", error); }
  };

  const loadProcessosPendentesCompliance = async () => {
    try {
      const { count, error } = await supabase.from("cotacoes_precos").select("*", { count: "exact", head: true }).eq("enviado_compliance", true).eq("respondido_compliance", false);
      if (error) throw error;
      setProcessosPendentesCompliance(count || 0);
    } catch (error) { console.error("Erro ao carregar processos pendentes:", error); }
  };

  const loadAvaliacoesCadastroPendentes = async () => {
    try {
      const { count, error } = await supabase.from("avaliacoes_cadastro_fornecedor").select("*", { count: "exact", head: true }).eq("status_avaliacao", "pendente");
      if (error) throw error;
      setAvaliacoesCadastroPendentes(count || 0);
    } catch (error) { console.error("Erro ao carregar avaliações pendentes:", error); }
  };

  const loadAtasPendentesAssinatura = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from("atas_assinaturas_usuario").select(`id, ata_id, data_notificacao, atas_selecao (nome_arquivo, url_arquivo, protocolo, selecoes_fornecedores (numero_selecao, titulo_selecao))`).eq("usuario_id", user.id).eq("status_assinatura", "pendente").order("data_notificacao", { ascending: false });
      if (error) throw error;
      setAtasPendentesAssinatura(data || []);
    } catch (error) { console.error("Erro ao carregar atas pendentes:", error); }
  };

  const handleAssinarAtaUsuario = async (assinaturaId: string, ataId: string) => {
    setAssinandoAta(assinaturaId);
    try {
      const { error } = await supabase.from("atas_assinaturas_usuario").update({ status_assinatura: "aceito", data_assinatura: new Date().toISOString(), ip_assinatura: "browser" }).eq("id", assinaturaId);
      if (error) throw error;
      await atualizarAtaComAssinaturas(ataId);
      toast({ title: "Sucesso", description: "Ata assinada digitalmente com sucesso!" });
      await loadAtasPendentesAssinatura();
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao assinar ata: " + (error as Error).message, variant: "destructive" });
    } finally { setAssinandoAta(null); }
  };

  const loadData = async () => {
    try {
      const [contratosRes, processosRes, selecoesRes, fornecedoresRes, complianceRes, contratosTerc] = await Promise.all([
        supabase.from("contratos_gestao").select("*").order("nome_contrato"),
        supabase.from("processos_compras").select("*, contratos_gestao(nome_contrato), cotacoes_precos(enviado_para_selecao)"),
        supabase.from("selecoes_fornecedores").select("*, processos_compras(ano_referencia, contrato_gestao_id, contratos_gestao(nome_contrato), data_abertura)"),
        supabase.from("fornecedores").select("id, created_at, data_cadastro, data_validade_certificado, status_aprovacao"),
        supabase.from("analises_compliance").select("id, created_at, cotacao_id, cotacoes_precos(processo_compra_id, processos_compras(ano_referencia, contrato_gestao_id, contratos_gestao(nome_contrato), data_abertura))"),
        supabase.from("contratos_terceiros").select("id, created_at, contrato_gestao_id, contratos_gestao(nome_contrato), inicio_vigencia"),
      ]);

      setContratos(contratosRes.data || []);
      setProcessos(processosRes.data || []);
      setSelecoes(selecoesRes.data || []);
      setFornecedores(fornecedoresRes.data || []);
      setAnalisesCompliance(complianceRes.data || []);
      setContratosTerceiros(contratosTerc.data || []);
    } catch (error: any) {
      toast({ title: "Erro ao carregar dados", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const anosDisponiveis = useMemo(() => Array.from(new Set(processos.map(p => p.ano_referencia))).sort((a, b) => b - a), [processos]);

  const filtrarProcessosPorTipo = (tipo: TipoProcesso) => {
    const ano = parseInt(anoSelecionado);

    if (tipo === "fornecedores") {
      // Cadastro de fornecedores NÃO está vinculado a contrato de gestão
      // Filtro de contrato NÃO se aplica aqui — mostra todos independentemente
      // Apenas fornecedores aprovados contam como cadastro efetivo
      return fornecedores.filter(f => {
        if (f.status_aprovacao !== "aprovado") return false;
        const dataCad = f.data_cadastro || f.created_at;
        if (!dataCad) return false;
        const d = new Date(dataCad);
        if (d.getFullYear() !== ano) return false;
        if (mesSelecionado !== "todos") {
          const mesIdx = meses.indexOf(mesSelecionado);
          if (d.getMonth() !== mesIdx) return false;
        }
        return true;
      });
    }

    if (tipo === "compliance") {
      return analisesCompliance.filter(a => {
        const proc = a.cotacoes_precos?.processos_compras;
        if (!proc) return false;
        if (proc.ano_referencia !== ano) return false;
        if (contratoSelecionado !== "todos" && proc.contrato_gestao_id !== contratoSelecionado) return false;
        if (mesSelecionado !== "todos" && proc.data_abertura) {
          const mesIdx = meses.indexOf(mesSelecionado);
          if (new Date(proc.data_abertura).getMonth() !== mesIdx) return false;
        }
        return true;
      });
    }

    if (tipo === "contratos") {
      return contratosTerceiros.filter(ct => {
        if (contratoSelecionado !== "todos" && ct.contrato_gestao_id !== contratoSelecionado) return false;
        const d = ct.inicio_vigencia ? new Date(ct.inicio_vigencia) : ct.created_at ? new Date(ct.created_at) : null;
        if (!d) return false;
        if (d.getFullYear() !== ano) return false;
        if (mesSelecionado !== "todos") {
          const mesIdx = meses.indexOf(mesSelecionado);
          if (d.getMonth() !== mesIdx) return false;
        }
        return true;
      });
    }

    if (tipo === "selecao") {
      return selecoes.filter(s => {
        const proc = s.processos_compras;
        if (!proc) return false;
        if (proc.ano_referencia !== ano) return false;
        if (contratoSelecionado !== "todos" && proc.contrato_gestao_id !== contratoSelecionado) return false;
        if (mesSelecionado !== "todos" && proc.data_abertura) {
          const mesIdx = meses.indexOf(mesSelecionado);
          if (new Date(proc.data_abertura).getMonth() !== mesIdx) return false;
        }
        return true;
      });
    }

    // processos, compras_diretas, credenciamentos, contratacoes_especificas
    let filtered = processos.filter(p => p.ano_referencia === ano);
    if (contratoSelecionado !== "todos") filtered = filtered.filter(p => p.contrato_gestao_id === contratoSelecionado);
    if (mesSelecionado !== "todos") {
      const mesIdx = meses.indexOf(mesSelecionado);
      filtered = filtered.filter(p => p.data_abertura && new Date(p.data_abertura).getMonth() === mesIdx);
    }
    if (tipo === "compras_diretas") filtered = filtered.filter(p => !p.requer_selecao && !p.credenciamento && !p.contratacao_especifica);
    if (tipo === "credenciamentos") filtered = filtered.filter(p => p.credenciamento);
    if (tipo === "contratacoes_especificas") filtered = filtered.filter(p => p.contratacao_especifica);

    return filtered;
  };

  const gerarDadosPorContrato = (tipo: TipoProcesso): { name: string; value: number }[] => {
    const items = filtrarProcessosPorTipo(tipo);
    const porContrato: Record<string, number> = {};

    items.forEach(item => {
      let nomeContrato = "Sem Contrato";
      if (tipo === "selecao") nomeContrato = item.processos_compras?.contratos_gestao?.nome_contrato || "Sem Contrato";
      else if (tipo === "compliance") nomeContrato = item.cotacoes_precos?.processos_compras?.contratos_gestao?.nome_contrato || "Sem Contrato";
      else if (tipo === "contratos") nomeContrato = item.contratos_gestao?.nome_contrato || "Sem Contrato";
      else if (tipo === "fornecedores") nomeContrato = "Cadastros";
      else nomeContrato = item.contratos_gestao?.nome_contrato || "Sem Contrato";

      porContrato[nomeContrato] = (porContrato[nomeContrato] || 0) + 1;
    });

    return Object.entries(porContrato).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const gerarDadosPorMes = (tipo: TipoProcesso): { name: string; value: number }[] => {
    const items = filtrarProcessosPorTipo(tipo);
    const porMes: Record<string, number> = {};

    items.forEach(item => {
      let dataRef: string | null = null;
      if (tipo === "selecao") dataRef = item.processos_compras?.data_abertura;
      else if (tipo === "compliance") dataRef = item.cotacoes_precos?.processos_compras?.data_abertura || item.created_at;
      else if (tipo === "contratos") dataRef = item.inicio_vigencia || item.created_at;
      else if (tipo === "fornecedores") dataRef = item.data_cadastro || item.created_at;
      else dataRef = item.data_abertura;

      if (dataRef) {
        const mes = meses[new Date(dataRef).getMonth()];
        porMes[mes] = (porMes[mes] || 0) + 1;
      }
    });

    // When a specific month is selected, show only that month
    if (mesSelecionado !== "todos") {
      return [{ name: mesSelecionado, value: porMes[mesSelecionado] || 0 }];
    }

    // Annual view: show all 12 months
    return meses.map(m => ({ name: m, value: porMes[m] || 0 }));
  };

  const calcularKPIs = (tipo: TipoProcesso) => {
    const items = filtrarProcessosPorTipo(tipo);
    const total = items.length;

    // Previous period comparison
    const anoAnterior = (parseInt(anoSelecionado) - 1).toString();
    const savedAno = anoSelecionado;
    // Simple estimate: check previous year items length
    const prevItems = (() => {
      const ano = parseInt(anoSelecionado) - 1;
      if (tipo === "processos" || tipo === "compras_diretas" || tipo === "credenciamentos" || tipo === "contratacoes_especificas") {
        let f = processos.filter(p => p.ano_referencia === ano);
        if (contratoSelecionado !== "todos") f = f.filter(p => p.contrato_gestao_id === contratoSelecionado);
        if (tipo === "compras_diretas") f = f.filter(p => !p.requer_selecao && !p.credenciamento && !p.contratacao_especifica);
        if (tipo === "credenciamentos") f = f.filter(p => p.credenciamento);
        if (tipo === "contratacoes_especificas") f = f.filter(p => p.contratacao_especifica);
        return f;
      }
      return [];
    })();

    const prevTotal = prevItems.length;
    const crescimento = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
    const tendencia = crescimento > 5 ? "up" as const : crescimento < -5 ? "down" as const : "stable" as const;

    const dadosContrato = gerarDadosPorContrato(tipo);
    const contratoMaisAtivo = dadosContrato.length > 0 ? dadosContrato[0].name : "—";

    const dadosMes = gerarDadosPorMes(tipo);
    const mesesComDados = dadosMes.filter(d => d.value > 0);
    const mediaMenusal = mesesComDados.length > 0 ? total / mesesComDados.length : 0;
    const maiorVolume = mesesComDados.length > 0 ? Math.max(...mesesComDados.map(d => d.value)) : 0;
    const menorVolume = mesesComDados.length > 0 ? Math.min(...mesesComDados.map(d => d.value)) : 0;

    return { total, crescimento, tendencia, contratoMaisAtivo, mediaMenusal, maiorVolume, menorVolume };
  };

  const toggleComparativo = (tipo: TipoProcesso) => {
    setProcessosComparativos(prev => {
      if (prev.includes(tipo)) {
        if (prev.length <= 2) return prev; // min 2
        return prev.filter(t => t !== tipo);
      }
      if (prev.length >= 4) return prev; // max 4
      return [...prev, tipo];
    });
  };

  const gerarRanking = () => {
    const tiposAtivos = modoVisualizacao === "comparativo" ? processosComparativos : [tipoProcessoIndividual];
    const contratosMap: Record<string, Record<string, number>> = {};

    tiposAtivos.forEach(tipo => {
      const dados = gerarDadosPorContrato(tipo);
      dados.forEach(d => {
        if (!contratosMap[d.name]) contratosMap[d.name] = {};
        contratosMap[d.name][TIPO_LABELS[tipo]] = d.value;
      });
    });

    return {
      rows: Object.entries(contratosMap).map(([contrato, valores]) => ({ contrato, valores })),
      labels: tiposAtivos.map(t => TIPO_LABELS[t]),
    };
  };

  const gridClass = (count: number) => {
    if (count <= 2) return "grid-cols-1 lg:grid-cols-2";
    if (count === 3) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    return "grid-cols-1 md:grid-cols-2";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando painel...</p>
        </div>
      </div>
    );
  }

  const ranking = gerarRanking();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {(isCompliance || isSuperintendenteExecutivo) && processosPendentesCompliance > 0 && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Processos Pendentes de Compliance</AlertTitle>
            <AlertDescription>
              Você tem {processosPendentesCompliance} processo(s) aguardando análise no menu Compliance.
            </AlertDescription>
          </Alert>
        )}

        {(isCompliance || isSuperintendenteExecutivo) && avaliacoesCadastroPendentes > 0 && (
          <Alert className="mb-4 border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100 dark:border-orange-700">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <AlertTitle className="text-orange-900 dark:text-orange-100">Cadastros de Fornecedores Pendentes</AlertTitle>
            <AlertDescription className="text-orange-800 dark:text-orange-200">
              Você tem {avaliacoesCadastroPendentes} cadastro(s) de fornecedor aguardando análise de Due Diligence no menu Compliance.
            </AlertDescription>
          </Alert>
        )}

        {atasPendentesAssinatura.length > 0 && (
          <Alert className="mb-4 border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100 dark:border-amber-700">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-900 dark:text-amber-100">Atas Pendentes de Assinatura</AlertTitle>
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              Você tem {atasPendentesAssinatura.length} ata(s) aguardando sua assinatura:
              <div className="mt-3 space-y-3">
                {atasPendentesAssinatura.map((ata: any) => (
                  <div key={ata.id} className="flex items-center justify-between p-3 bg-card/70 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        Seleção: {ata.atas_selecao?.selecoes_fornecedores?.numero_selecao || 'N/A'} - {ata.atas_selecao?.selecoes_fornecedores?.titulo_selecao || ata.atas_selecao?.nome_arquivo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Protocolo: {ata.atas_selecao?.protocolo?.substring(0, 16).toUpperCase().replace(/(.{4})/g, '$1-').slice(0, -1)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <Button size="sm" variant="outline" onClick={() => window.open(ata.atas_selecao?.url_arquivo, "_blank")}>
                        <FileText className="h-4 w-4 mr-1" /> Ver Ata
                      </Button>
                      <Button size="sm" onClick={() => handleAssinarAtaUsuario(ata.id, ata.ata_id)} disabled={assinandoAta === ata.id} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {assinandoAta === ata.id ? "Assinando..." : "Aceitar/Assinar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {isResponsavelLegal && (
          <div className="mb-4 space-y-4">
            <SolicitacoesAutorizacao />
            <SolicitacoesAutorizacaoSelecao />
            <SolicitacoesHomologacao />
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Painel BI — Compras</h1>
            <p className="text-xs text-muted-foreground">Análise inteligente de processos e contratações</p>
          </div>
        </div>

        <DashboardBIFilters
          contratos={contratos}
          anosDisponiveis={anosDisponiveis}
          contratoSelecionado={contratoSelecionado}
          setContratoSelecionado={setContratoSelecionado}
          anoSelecionado={anoSelecionado}
          setAnoSelecionado={setAnoSelecionado}
          mesSelecionado={mesSelecionado}
          setMesSelecionado={setMesSelecionado}
          modoVisualizacao={modoVisualizacao}
          setModoVisualizacao={setModoVisualizacao}
        />

        <div className="bg-card border rounded-xl shadow-sm p-4 mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {modoVisualizacao === "individual" ? "Tipo de Processo" : "Comparar Processos (2 a 4)"}
          </h3>
          {modoVisualizacao === "individual" ? (
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TIPO_LABELS) as TipoProcesso[]).map(tipo => (
                <Button
                  key={tipo}
                  size="sm"
                  variant={tipoProcessoIndividual === tipo ? "default" : "outline"}
                  className="text-xs h-8"
                  onClick={() => setTipoProcessoIndividual(tipo)}
                >
                  {TIPO_LABELS[tipo]}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {(Object.keys(TIPO_LABELS) as TipoProcesso[]).map(tipo => (
                <label key={tipo} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={processosComparativos.includes(tipo)}
                    onCheckedChange={() => toggleComparativo(tipo)}
                    disabled={!processosComparativos.includes(tipo) && processosComparativos.length >= 4}
                  />
                  {TIPO_LABELS[tipo]}
                  {processosComparativos.includes(tipo) && <Badge variant="secondary" className="text-[9px] px-1 h-4">{processosComparativos.indexOf(tipo) + 1}</Badge>}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6">
          <Tabs value={tipoGraficoGlobal} onValueChange={(v) => setTipoGraficoGlobal(v as ChartType)}>
            <TabsList className="w-full sm:w-auto h-9">
              <TabsTrigger value="barras" className="text-xs">Barras</TabsTrigger>
              <TabsTrigger value="vela" className="text-xs">Horizontal</TabsTrigger>
              <TabsTrigger value="pareto" className="text-xs">Pareto</TabsTrigger>
              <TabsTrigger value="pizza" className="text-xs">Pizza</TabsTrigger>
              <TabsTrigger value="ranking" className="text-xs">Tendência</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {modoVisualizacao === "individual" ? (
          <DashboardBIKPIs kpiData={calcularKPIs(tipoProcessoIndividual)} label={TIPO_LABELS[tipoProcessoIndividual]} />
        ) : (
          processosComparativos.map(tipo => (
            <DashboardBIKPIs key={tipo} kpiData={calcularKPIs(tipo)} label={TIPO_LABELS[tipo]} />
          ))
        )}

        {modoVisualizacao === "individual" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{TIPO_LABELS[tipoProcessoIndividual]} — Por Contrato</CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardBIChart data={gerarDadosPorContrato(tipoProcessoIndividual)} chartType={tipoGraficoGlobal} title="Por Contrato" />
              </CardContent>
            </Card>
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{TIPO_LABELS[tipoProcessoIndividual]} — Evolução Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardBIChart data={gerarDadosPorMes(tipoProcessoIndividual)} chartType={tipoGraficoGlobal} title="Mensal" />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex flex-col gap-4 mb-6">
            {processosComparativos.map(tipo => (
              <Card key={tipo} className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{TIPO_LABELS[tipo]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DashboardBIChart data={gerarDadosPorMes(tipo)} chartType={tipoGraficoGlobal} title={TIPO_LABELS[tipo]} height={300} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <DashboardBIRanking rows={ranking.rows} processoLabels={ranking.labels} />
      </div>
    </div>
  );
};

export default Dashboard;
