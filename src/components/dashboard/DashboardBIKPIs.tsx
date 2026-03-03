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
      color: "text-green-800 dark:text-green-200",
      bgColor: "bg-green-100 border-green-300 dark:bg-green-950/50 dark:border-green-700",
      tooltip: "Quantidade total de registros no período filtrado (ano e mês selecionados).",
    },
    {
      title: "Crescimento",
      value: `${kpiData.crescimento > 0 ? "+" : ""}${kpiData.crescimento.toFixed(1)}%`,
      icon: kpiData.crescimento > 0 ? ArrowUpRight : kpiData.crescimento < 0 ? ArrowDownRight : Minus,
      color: "text-emerald-800 dark:text-emerald-200",
      bgColor: "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-700",
      tooltip: "Variação percentual em relação ao mesmo período do ano anterior.",
    },
    {
      title: "Tendência",
      value: kpiData.tendencia === "up" ? "↑ Alta" : kpiData.tendencia === "down" ? "↓ Baixa" : "→ Estável",
      icon: kpiData.tendencia === "up" ? TrendingUp : kpiData.tendencia === "down" ? TrendingDown : Minus,
      color: "text-blue-800 dark:text-blue-200",
      bgColor: "bg-blue-100 border-blue-300 dark:bg-blue-950/50 dark:border-blue-700",
      tooltip: "Direção da tendência com base no crescimento: Alta (>5%), Baixa (<-5%) ou Estável.",
    },
    {
      title: "Contrato Mais Ativo",
      value: kpiData.contratoMaisAtivo || "—",
      icon: Building2,
      color: "text-sky-800 dark:text-sky-200",
      bgColor: "bg-sky-50 border-sky-300 dark:bg-sky-950/50 dark:border-sky-700",
      isText: true,
      tooltip: "Contrato de gestão com maior quantidade de registros no período.",
    },
    {
      title: "Média Mensal",
      value: kpiData.mediaMenusal.toFixed(1),
      icon: Calendar,
      color: "text-yellow-800 dark:text-yellow-200",
      bgColor: "bg-yellow-50 border-yellow-300 dark:bg-yellow-950/50 dark:border-yellow-700",
      tooltip: "Média de registros por mês considerando apenas meses com dados.",
    },
    {
      title: "Maior Volume",
      value: kpiData.maiorVolume,
      icon: TrendingUp,
      color: "text-amber-800 dark:text-amber-200",
      bgColor: "bg-amber-50 border-amber-300 dark:bg-amber-950/50 dark:border-amber-700",
      tooltip: "Maior quantidade de registros em um único mês no período.",
    },
    {
      title: "Menor Volume",
      value: kpiData.menorVolume,
      icon: TrendingDown,
      color: "text-orange-800 dark:text-orange-200",
      bgColor: "bg-orange-50 border-orange-300 dark:bg-orange-950/50 dark:border-orange-700",
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
