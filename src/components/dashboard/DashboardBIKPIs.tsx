// @ts-nocheck
import { TrendingUp, TrendingDown, Minus, Activity, Building2, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface KPIData {
  total: number;
  crescimento: number;
  tendencia: "up" | "down" | "stable";
  contratoMaisAtivo: string;
  mediaMenusal: number;
  maiorVolume: number;
  menorVolume: number;
}

interface Props {
  kpiData: KPIData;
  label: string;
}

export function DashboardBIKPIs({ kpiData, label }: Props) {
  const cards = [
    {
      title: "Total do Período",
      value: kpiData.total,
      icon: Activity,
      color: "text-blue-700 dark:text-blue-300",
      bgColor: "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800",
      tooltip: "Quantidade total de registros no período filtrado (ano e mês selecionados).",
    },
    {
      title: "Crescimento",
      value: `${kpiData.crescimento > 0 ? "+" : ""}${kpiData.crescimento.toFixed(1)}%`,
      icon: kpiData.crescimento > 0 ? ArrowUpRight : kpiData.crescimento < 0 ? ArrowDownRight : Minus,
      color: kpiData.crescimento > 0 ? "text-emerald-700 dark:text-emerald-300" : kpiData.crescimento < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      bgColor: kpiData.crescimento > 0 ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800" : kpiData.crescimento < 0 ? "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800" : "bg-muted/50 border-border",
      tooltip: "Variação percentual em relação ao mesmo período do ano anterior.",
    },
    {
      title: "Tendência",
      value: kpiData.tendencia === "up" ? "↑ Alta" : kpiData.tendencia === "down" ? "↓ Baixa" : "→ Estável",
      icon: kpiData.tendencia === "up" ? TrendingUp : kpiData.tendencia === "down" ? TrendingDown : Minus,
      color: kpiData.tendencia === "up" ? "text-teal-700 dark:text-teal-300" : kpiData.tendencia === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
      bgColor: kpiData.tendencia === "up" ? "bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:border-teal-800" : kpiData.tendencia === "down" ? "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800" : "bg-muted/50 border-border",
      tooltip: "Direção da tendência com base no crescimento: Alta (>5%), Baixa (<-5%) ou Estável.",
    },
    {
      title: "Contrato Mais Ativo",
      value: kpiData.contratoMaisAtivo || "—",
      icon: Building2,
      color: "text-indigo-700 dark:text-indigo-300",
      bgColor: "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800",
      isText: true,
      tooltip: "Contrato de gestão com maior quantidade de registros no período.",
    },
    {
      title: "Média Mensal",
      value: kpiData.mediaMenusal.toFixed(1),
      icon: Calendar,
      color: "text-cyan-700 dark:text-cyan-300",
      bgColor: "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/40 dark:border-cyan-800",
      tooltip: "Média de registros por mês considerando apenas meses com dados.",
    },
    {
      title: "Maior Volume",
      value: kpiData.maiorVolume,
      icon: TrendingUp,
      color: "text-green-700 dark:text-green-300",
      bgColor: "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800",
      tooltip: "Maior quantidade de registros em um único mês no período.",
    },
    {
      title: "Menor Volume",
      value: kpiData.menorVolume,
      icon: TrendingDown,
      color: "text-amber-700 dark:text-amber-300",
      bgColor: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800",
      tooltip: "Menor quantidade de registros em um único mês no período.",
    },
  ];

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        KPIs — {label}
      </h3>
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {cards.map((card, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div className={`${card.bgColor} rounded-xl p-4 border transition-all hover:shadow-md cursor-help`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                    <span className="text-[11px] font-medium text-muted-foreground truncate">{card.title}</span>
                  </div>
                  <p className={`text-xl font-bold ${card.color} ${card.isText ? "text-sm leading-tight" : ""} truncate`}>
                    {card.value}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                {card.tooltip}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
