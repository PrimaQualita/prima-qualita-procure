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
      color: "text-primary",
      bgColor: "bg-primary/10 border-primary/20",
      tooltip: "Quantidade total de registros no período filtrado (ano e mês selecionados).",
    },
    {
      title: "Crescimento",
      value: `${kpiData.crescimento > 0 ? "+" : ""}${kpiData.crescimento.toFixed(1)}%`,
      icon: kpiData.crescimento > 0 ? ArrowUpRight : kpiData.crescimento < 0 ? ArrowDownRight : Minus,
      color: kpiData.crescimento > 0 ? "text-emerald-600" : kpiData.crescimento < 0 ? "text-red-500" : "text-muted-foreground",
      bgColor: kpiData.crescimento > 0 ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800" : kpiData.crescimento < 0 ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" : "bg-muted/50 border-border",
      tooltip: "Variação percentual em relação ao mesmo período do ano anterior.",
    },
    {
      title: "Tendência",
      value: kpiData.tendencia === "up" ? "↑ Alta" : kpiData.tendencia === "down" ? "↓ Baixa" : "→ Estável",
      icon: kpiData.tendencia === "up" ? TrendingUp : kpiData.tendencia === "down" ? TrendingDown : Minus,
      color: kpiData.tendencia === "up" ? "text-emerald-600" : kpiData.tendencia === "down" ? "text-red-500" : "text-muted-foreground",
      bgColor: kpiData.tendencia === "up" ? "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800" : kpiData.tendencia === "down" ? "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800" : "bg-muted/50 border-border",
      tooltip: "Direção da tendência com base no crescimento: Alta (>5%), Baixa (<-5%) ou Estável.",
    },
    {
      title: "Contrato Mais Ativo",
      value: kpiData.contratoMaisAtivo || "—",
      icon: Building2,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800",
      isText: true,
      tooltip: "Contrato de gestão com maior quantidade de registros no período.",
    },
    {
      title: "Média Mensal",
      value: kpiData.mediaMenusal.toFixed(1),
      icon: Calendar,
      color: "text-sky-600 dark:text-sky-400",
      bgColor: "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800",
      tooltip: "Média de registros por mês considerando apenas meses com dados.",
    },
    {
      title: "Maior Volume",
      value: kpiData.maiorVolume,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
      tooltip: "Maior quantidade de registros em um único mês no período.",
    },
    {
      title: "Menor Volume",
      value: kpiData.menorVolume,
      icon: TrendingDown,
      color: "text-amber-600",
      bgColor: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
      tooltip: "Menor quantidade de registros em um único mês no período.",
    },
  ];

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        KPIs — {label}
      </h3>
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {cards.map((card, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div className={`${card.bgColor} rounded-xl p-3 border transition-all hover:shadow-md cursor-help`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                    <span className="text-[10px] font-medium text-muted-foreground truncate">{card.title}</span>
                  </div>
                  <p className={`text-lg font-bold ${card.color} ${card.isText ? "text-xs leading-tight" : ""} truncate`}>
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
