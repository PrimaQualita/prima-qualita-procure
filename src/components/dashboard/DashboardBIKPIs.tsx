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
      color: "text-green-900 dark:text-green-100",
      bgColor: "bg-green-200 border-green-400 dark:bg-green-900/60 dark:border-green-600",
      tooltip: "Quantidade total de registros no período filtrado (ano e mês selecionados).",
    },
    {
      title: "Crescimento",
      value: `${kpiData.crescimento > 0 ? "+" : ""}${kpiData.crescimento.toFixed(1)}%`,
      icon: kpiData.crescimento > 0 ? ArrowUpRight : kpiData.crescimento < 0 ? ArrowDownRight : Minus,
      color: "text-blue-900 dark:text-blue-100",
      bgColor: "bg-blue-200 border-blue-400 dark:bg-blue-900/60 dark:border-blue-600",
      tooltip: "Variação percentual em relação ao mesmo período do ano anterior.",
    },
    {
      title: "Tendência",
      value: kpiData.tendencia === "up" ? "↑ Alta" : kpiData.tendencia === "down" ? "↓ Baixa" : "→ Estável",
      icon: kpiData.tendencia === "up" ? TrendingUp : kpiData.tendencia === "down" ? TrendingDown : Minus,
      color: "text-green-900 dark:text-green-100",
      bgColor: "bg-green-200 border-green-400 dark:bg-green-900/60 dark:border-green-600",
      isText: true,
      tooltip: "Direção da tendência com base no crescimento: Alta (>5%), Baixa (<-5%) ou Estável.",
    },
    {
      title: "Contrato Mais Ativo",
      value: kpiData.contratoMaisAtivo || "—",
      icon: Building2,
      color: "text-blue-900 dark:text-blue-100",
      bgColor: "bg-blue-200 border-blue-400 dark:bg-blue-900/60 dark:border-blue-600",
      isText: true,
      tooltip: "Contrato de gestão com maior quantidade de registros no período.",
    },
    {
      title: "Média Mensal",
      value: kpiData.mediaMenusal.toFixed(1),
      icon: Calendar,
      color: "text-green-900 dark:text-green-100",
      bgColor: "bg-green-200 border-green-400 dark:bg-green-900/60 dark:border-green-600",
      tooltip: "Média de registros por mês considerando apenas meses com dados.",
    },
    {
      title: "Maior Volume",
      value: kpiData.maiorVolume,
      icon: TrendingUp,
      color: "text-blue-900 dark:text-blue-100",
      bgColor: "bg-blue-200 border-blue-400 dark:bg-blue-900/60 dark:border-blue-600",
      tooltip: "Maior quantidade de registros em um único mês no período.",
    },
    {
      title: "Menor Volume",
      value: kpiData.menorVolume,
      icon: TrendingDown,
      color: "text-green-900 dark:text-green-100",
      bgColor: "bg-green-200 border-green-400 dark:bg-green-900/60 dark:border-green-600",
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
                  <p className={`font-bold ${card.color} ${card.isText ? "text-[10px] leading-tight break-words whitespace-normal" : "text-lg"}`} title={String(card.value)}>
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
