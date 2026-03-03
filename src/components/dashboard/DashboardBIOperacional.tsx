// @ts-nocheck
import { useMemo } from "react";
import { differenceInDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  FileText, ShieldCheck, Users, Building2, Handshake, ClipboardList,
  AlertTriangle, CheckCircle2, Clock, XCircle, Ban, CalendarClock, BarChart3, GitCompare
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardBIChart, type ChartType } from "./DashboardBIChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  contratosTerceiros: any[];
  processosParaContratar: any[];
  cotacoesPrecos: any[];
  processos: any[];
  selecoes: any[];
  fornecedores: any[];
  contratoSelecionado: string;
  chartType: ChartType;
  moduloSelecionado: string;
  setModuloSelecionado: (v: string) => void;
  modoVisualizacao: "individual" | "comparativo";
  setModoVisualizacao: (v: "individual" | "comparativo") => void;
}

const COLORS: Record<string, string> = {
  danger: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700",
  warning: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700",
  info: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700",
  success: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700",
  muted: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-600",
};

type ModuloKey = "contratos" | "compliance" | "selecoes" | "credenciamentos" | "contratacoes" | "fornecedores";

const MODULO_CONFIG: Record<ModuloKey, { label: string; icon: any }> = {
  contratos: { label: "Contratos", icon: FileText },
  compliance: { label: "Análise de Compliance", icon: ShieldCheck },
  selecoes: { label: "Seleções de Fornecedores", icon: Users },
  credenciamentos: { label: "Credenciamentos", icon: Handshake },
  contratacoes: { label: "Contratações Específicas", icon: ClipboardList },
  fornecedores: { label: "Cadastro de Fornecedores", icon: Building2 },
};

const MODULO_KEYS = Object.keys(MODULO_CONFIG) as ModuloKey[];

export function DashboardBIOperacional({
  contratosTerceiros, processosParaContratar, cotacoesPrecos,
  processos, selecoes, fornecedores, contratoSelecionado, chartType,
  moduloSelecionado, setModuloSelecionado,
  modoVisualizacao, setModoVisualizacao,
}: Props) {
  const hoje = useMemo(() => toZonedTime(new Date(), "America/Sao_Paulo"), []);

  const filterCG = (items: any[], field = "contrato_gestao_id") => {
    if (contratoSelecionado === "todos") return items;
    return items.filter(i => i[field] === contratoSelecionado);
  };

  const metrics = useMemo(() => {
    // === CONTRATOS ===
    const ctFiltrados = filterCG(contratosTerceiros);
    const ctVigentes = ctFiltrados.filter(c => c.status === "vigente" && c.processo_para_contratar_id);

    const ctAVencer = ctVigentes.filter(c => {
      if (!c.fim_vigencia_atual) return false;
      const fim = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
      const dias = differenceInDays(fim, hoje);
      return dias >= 0 && dias <= 45;
    });

    const ctVencidos = ctVigentes.filter(c => {
      if (!c.fim_vigencia_atual || c.ciente_nao_renovar) return false;
      const fim = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
      return fim < hoje;
    });

    const pcFiltrados = filterCG(processosParaContratar);
    const pcComContrato = new Set(
      ctFiltrados.filter(c => c.processo_para_contratar_id).map(c => c.processo_para_contratar_id)
    );
    const ctEmAberto = pcFiltrados.filter(pc => !pcComContrato.has(pc.id) && pc.status !== "cancelado");
    const ctRescindidos = ctFiltrados.filter(c => c.status === "rescindido");
    const ctEncerrados = ctFiltrados.filter(c => c.status === "encerrado");

    // === COMPLIANCE ===
    const cotFiltradas = contratoSelecionado === "todos"
      ? cotacoesPrecos
      : cotacoesPrecos.filter(c => c.processos_compras?.contrato_gestao_id === contratoSelecionado);
    const compliancePendentes = cotFiltradas.filter(c => c.enviado_compliance === true && c.respondido_compliance !== true);

    // === SELEÇÕES ===
    const procFiltrados = filterCG(processos);
    const procSelecao = procFiltrados.filter(p => p.requer_selecao && !p.credenciamento && !p.contratacao_especifica);
    const selAbertas = procSelecao.filter(p => p.status_processo !== "concluido" && p.status_processo !== "fracassado" && p.status_processo !== "cancelado");
    const selFinalizadas = procSelecao.filter(p => p.status_processo === "concluido");
    const selFracassadas = procSelecao.filter(p => p.status_processo === "fracassado");

    // === CREDENCIAMENTOS ===
    const procCred = procFiltrados.filter(p => p.credenciamento);
    const credAbertas = procCred.filter(p => p.status_processo !== "concluido" && p.status_processo !== "fracassado" && p.status_processo !== "cancelado");
    const credFinalizadas = procCred.filter(p => p.status_processo === "concluido");

    // === CONTRATAÇÕES ESPECÍFICAS ===
    const procCE = procFiltrados.filter(p => p.contratacao_especifica);
    const ceAbertas = procCE.filter(p => p.status_processo !== "concluido" && p.status_processo !== "fracassado" && p.status_processo !== "cancelado");
    const ceFinalizadas = procCE.filter(p => p.status_processo === "concluido");

    // === FORNECEDORES ===
    const fornAprovados = fornecedores.filter(f => f.status_aprovacao === "aprovado");
    const fornEmAberto = fornecedores.filter(f => f.status_aprovacao !== "aprovado" && f.status_aprovacao !== "rejeitado");

    const fornAVencer = fornAprovados.filter(f => {
      if (!f.data_validade_certificado) return false;
      const val = new Date(f.data_validade_certificado + "T23:59:59-03:00");
      const dias = differenceInDays(val, hoje);
      return dias >= 0 && dias <= 45;
    });

    const fornVencidos = fornAprovados.filter(f => {
      if (!f.data_validade_certificado) return false;
      const val = new Date(f.data_validade_certificado + "T23:59:59-03:00");
      return val < hoje;
    });

    const fornEmDia = fornAprovados.filter(f => {
      if (!f.data_validade_certificado) return true;
      const val = new Date(f.data_validade_certificado + "T23:59:59-03:00");
      return val >= hoje;
    });

    return {
      contratos: [
        { name: "A Vencer (45d)", value: ctAVencer.length, color: "warning", icon: CalendarClock },
        { name: "Vencidos", value: ctVencidos.length, color: "danger", icon: AlertTriangle },
        { name: "Em Aberto", value: ctEmAberto.length, color: "info", icon: Clock },
        { name: "Rescindidos", value: ctRescindidos.length, color: "muted", icon: Ban },
        { name: "Encerrados", value: ctEncerrados.length, color: "muted", icon: XCircle },
      ],
      compliance: [
        { name: "Pendentes", value: compliancePendentes.length, color: "warning", icon: Clock },
        { name: "Respondidas", value: cotFiltradas.filter(c => c.respondido_compliance === true).length, color: "success", icon: CheckCircle2 },
      ],
      selecoes: [
        { name: "Em Aberto", value: selAbertas.length, color: "info", icon: Clock },
        { name: "Finalizadas", value: selFinalizadas.length, color: "success", icon: CheckCircle2 },
        { name: "Fracassadas", value: selFracassadas.length, color: "danger", icon: XCircle },
      ],
      credenciamentos: [
        { name: "Em Aberto", value: credAbertas.length, color: "info", icon: Clock },
        { name: "Finalizadas", value: credFinalizadas.length, color: "success", icon: CheckCircle2 },
      ],
      contratacoes: [
        { name: "Em Aberto", value: ceAbertas.length, color: "info", icon: Clock },
        { name: "Finalizadas", value: ceFinalizadas.length, color: "success", icon: CheckCircle2 },
      ],
      fornecedores: [
        { name: "Em Dia", value: fornEmDia.length, color: "success", icon: CheckCircle2 },
        { name: "A Vencer (45d)", value: fornAVencer.length, color: "warning", icon: CalendarClock },
        { name: "Vencidos", value: fornVencidos.length, color: "danger", icon: AlertTriangle },
        { name: "Em Aberto", value: fornEmAberto.length, color: "info", icon: Clock },
      ],
    };
  }, [contratosTerceiros, processosParaContratar, cotacoesPrecos, processos, selecoes, fornecedores, contratoSelecionado, hoje]);

  const selectedKey = moduloSelecionado as ModuloKey;
  const selectedItems = metrics[selectedKey] || [];
  const selectedTotal = selectedItems.reduce((s, i) => s + i.value, 0);
  const chartData = selectedItems.map(item => ({ name: item.name, value: item.value }));

  // Comparativo: monta dados com todos os módulos lado a lado
  const comparativoData = useMemo(() => {
    // Cada módulo vira uma barra agrupada mostrando seus KPIs
    return MODULO_KEYS.map(key => {
      const items = metrics[key] || [];
      const total = items.reduce((s, i) => s + i.value, 0);
      const row: any = { name: MODULO_CONFIG[key].label };
      items.forEach(item => {
        row[item.name] = item.value;
      });
      row["Total"] = total;
      return row;
    });
  }, [metrics]);

  // Pegar todas as chaves únicas de KPIs para o comparativo
  const comparativoKeys = useMemo(() => {
    const keys = new Set<string>();
    MODULO_KEYS.forEach(key => {
      (metrics[key] || []).forEach(item => keys.add(item.name));
    });
    return Array.from(keys);
  }, [metrics]);

  // Dados para comparativo por módulo individual (cada KPI como item)
  const comparativoModuloData = useMemo(() => {
    return MODULO_KEYS.map(key => {
      const items = metrics[key] || [];
      const total = items.reduce((s, i) => s + i.value, 0);
      return {
        key,
        label: MODULO_CONFIG[key].label,
        icon: MODULO_CONFIG[key].icon,
        total,
        chartData: items.map(i => ({ name: i.name, value: i.value })),
      };
    });
  }, [metrics]);

  return (
    <>
      {/* Toggle Individual / Comparativo */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          size="sm"
          variant={modoVisualizacao === "individual" ? "default" : "outline"}
          className="text-xs h-9 rounded-lg px-4 gap-1.5"
          onClick={() => setModoVisualizacao("individual")}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Individual
        </Button>
        <Button
          size="sm"
          variant={modoVisualizacao === "comparativo" ? "default" : "outline"}
          className="text-xs h-9 rounded-lg px-4 gap-1.5"
          onClick={() => setModoVisualizacao("comparativo")}
        >
          <GitCompare className="h-3.5 w-3.5" />
          Comparativo
        </Button>
      </div>

      {modoVisualizacao === "individual" ? (
        <>
          {/* Seletor de tipo de processo */}
          <div className="bg-card border rounded-2xl shadow-sm p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-3.5 w-3.5 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground tracking-wide">Tipo de Processo</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {MODULO_KEYS.map(key => {
                const config = MODULO_CONFIG[key];
                const isActive = moduloSelecionado === key;
                const Icon = config.icon;
                return (
                  <Button
                    key={key}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    className={`text-xs h-9 rounded-lg px-4 gap-1.5 transition-all ${isActive ? "shadow-md" : "hover:border-primary/40"}`}
                    onClick={() => setModuloSelecionado(key)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {config.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* KPI Cards do módulo selecionado */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Indicadores — {MODULO_CONFIG[selectedKey]?.label} (Total: {selectedTotal})
            </h3>
            <TooltipProvider delayDuration={200}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {selectedItems.map((item, i) => {
                  const ItemIcon = item.icon;
                  const percentage = selectedTotal > 0 ? ((item.value / selectedTotal) * 100).toFixed(1) : "0";
                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <div className={`${COLORS[item.color]} rounded-xl p-4 border transition-all hover:shadow-md cursor-help`}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <ItemIcon className="h-4 w-4" />
                            <span className="text-[11px] font-medium leading-tight">{item.name}</span>
                          </div>
                          <p className="text-2xl font-bold">{item.value}</p>
                          <p className="text-[10px] mt-1 opacity-70">{percentage}% do total</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                        {item.value} {item.name.toLowerCase()} — {percentage}% do total de {MODULO_CONFIG[selectedKey]?.label.toLowerCase()}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>

          {/* Gráfico */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{MODULO_CONFIG[selectedKey]?.label} — Situação Atual</CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardBIChart
                  data={chartData}
                  chartType={chartType}
                  title={MODULO_CONFIG[selectedKey]?.label || ""}
                  height={300}
                />
              </CardContent>
            </Card>
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Distribuição Percentual</CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardBIChart
                  data={chartData}
                  chartType="pizza"
                  title="Distribuição"
                  height={300}
                />
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <>
          {/* MODO COMPARATIVO: Todos os módulos com seus KPIs em gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            {comparativoModuloData.map(mod => {
              const Icon = mod.icon;
              return (
                <Card key={mod.key} className="shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      {mod.label}
                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        Total: {mod.total}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DashboardBIChart
                      data={mod.chartData}
                      chartType={chartType}
                      title={mod.label}
                      height={220}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Resumo Geral Comparativo */}
          <Card className="shadow-sm hover:shadow-md transition-shadow mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resumo Geral — Todos os Módulos</CardTitle>
            </CardHeader>
            <CardContent>
              <DashboardBIChart
                data={comparativoModuloData.map(m => ({ name: m.label, value: m.total }))}
                chartType={chartType}
                title="Comparativo Geral"
                height={320}
              />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
