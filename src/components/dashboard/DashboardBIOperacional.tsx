// @ts-nocheck
import { useMemo, useState } from "react";
import { differenceInDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  FileText, ShieldCheck, Users, Building2, Handshake, ClipboardList,
  AlertTriangle, CheckCircle2, Clock, XCircle, Ban, CalendarClock
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardBIChart, type ChartType } from "./DashboardBIChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ModuloStatus {
  label: string;
  icon: any;
  items: { name: string; value: number; color: string; icon: any }[];
}

interface Props {
  contratosTerceiros: any[];
  processosParaContratar: any[];
  cotacoesPrecos: any[];
  processos: any[];
  selecoes: any[];
  fornecedores: any[];
  contratoSelecionado: string;
  chartType: ChartType;
}

const COLORS = {
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

export function DashboardBIOperacional({
  contratosTerceiros, processosParaContratar, cotacoesPrecos,
  processos, selecoes, fornecedores, contratoSelecionado, chartType,
}: Props) {
  const [moduloSelecionado, setModuloSelecionado] = useState<ModuloKey | null>(null);

  const hoje = useMemo(() => toZonedTime(new Date(), "America/Sao_Paulo"), []);

  // Filter by contrato de gestão
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

    // Em Aberto = processos para contratar sem contrato vinculado
    const pcFiltrados = filterCG(processosParaContratar);
    const pcComContrato = new Set(
      ctFiltrados
        .filter(c => c.processo_para_contratar_id)
        .map(c => c.processo_para_contratar_id)
    );
    const ctEmAberto = pcFiltrados.filter(pc => !pcComContrato.has(pc.id) && pc.status !== "cancelado");

    const ctRescindidos = ctFiltrados.filter(c => c.status === "rescindido");
    const ctEncerrados = ctFiltrados.filter(c => c.status === "encerrado");

    // === COMPLIANCE ===
    const cotFiltradas = contratoSelecionado === "todos"
      ? cotacoesPrecos
      : cotacoesPrecos.filter(c => {
          const proc = c.processos_compras;
          return proc && proc.contrato_gestao_id === contratoSelecionado;
        });
    const compliancePendentes = cotFiltradas.filter(c => c.enviado_compliance === true && c.respondido_compliance !== true);

    // === SELEÇÕES (requer_selecao) ===
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

    // === FORNECEDORES (sem filtro de CG) ===
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
      if (!f.data_validade_certificado) return true; // sem data = em dia
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

  const chartData = useMemo(() => {
    if (!moduloSelecionado) return null;
    return metrics[moduloSelecionado].map(item => ({
      name: item.name,
      value: item.value,
    }));
  }, [moduloSelecionado, metrics]);

  return (
    <div className="bg-card border rounded-2xl shadow-sm p-5 mb-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <ClipboardList className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground tracking-wide">Painel Operacional</h3>
          <p className="text-[11px] text-muted-foreground">Situação atual por módulo — clique em um módulo para expandir o gráfico</p>
        </div>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(MODULO_CONFIG) as ModuloKey[]).map(key => {
            const config = MODULO_CONFIG[key];
            const items = metrics[key];
            const isSelected = moduloSelecionado === key;
            const Icon = config.icon;
            const total = items.reduce((s, i) => s + i.value, 0);

            return (
              <div
                key={key}
                onClick={() => setModuloSelecionado(isSelected ? null : key)}
                className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-muted hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isSelected ? "bg-primary/20" : "bg-muted"}`}>
                    <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-foreground leading-tight">{config.label}</h4>
                    <span className="text-[10px] text-muted-foreground">Total: {total}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((item, i) => {
                    const ItemIcon = item.icon;
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <div className={`${COLORS[item.color]} rounded-lg px-2.5 py-1.5 border flex items-center gap-1.5 cursor-help`}>
                            <ItemIcon className="h-3 w-3" />
                            <span className="text-[11px] font-medium">{item.name}</span>
                            <span className="text-sm font-bold ml-0.5">{item.value}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                          {item.value} {item.name.toLowerCase()} em {config.label.toLowerCase()}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Chart for selected module */}
      {moduloSelecionado && chartData && (
        <div className="mt-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {MODULO_CONFIG[moduloSelecionado].label} — Situação Atual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DashboardBIChart
                data={chartData}
                chartType={chartType}
                title={MODULO_CONFIG[moduloSelecionado].label}
                height={300}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
