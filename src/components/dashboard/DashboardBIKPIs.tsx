// @ts-nocheck
import { TrendingUp, TrendingDown, Minus, Activity, Building2, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";

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
      bgColor: "bg-primary/10",
    },
    {
      title: "Crescimento",
      value: `${kpiData.crescimento > 0 ? "+" : ""}${kpiData.crescimento.toFixed(1)}%`,
      icon: kpiData.crescimento > 0 ? ArrowUpRight : kpiData.crescimento < 0 ? ArrowDownRight : Minus,
      color: kpiData.crescimento > 0 ? "text-emerald-600" : kpiData.crescimento < 0 ? "text-red-500" : "text-muted-foreground",
      bgColor: kpiData.crescimento > 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : kpiData.crescimento < 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-muted/50",
    },
    {
      title: "Tendência",
      value: kpiData.tendencia === "up" ? "↑ Alta" : kpiData.tendencia === "down" ? "↓ Baixa" : "→ Estável",
      icon: kpiData.tendencia === "up" ? TrendingUp : kpiData.tendencia === "down" ? TrendingDown : Minus,
      color: kpiData.tendencia === "up" ? "text-emerald-600" : kpiData.tendencia === "down" ? "text-red-500" : "text-muted-foreground",
      bgColor: kpiData.tendencia === "up" ? "bg-emerald-50 dark:bg-emerald-950/30" : kpiData.tendencia === "down" ? "bg-red-50 dark:bg-red-950/30" : "bg-muted/50",
    },
    {
      title: "Contrato Mais Ativo",
      value: kpiData.contratoMaisAtivo || "—",
      icon: Building2,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
      isText: true,
    },
    {
      title: "Média Mensal",
      value: kpiData.mediaMenusal.toFixed(1),
      icon: Calendar,
      color: "text-accent-foreground",
      bgColor: "bg-accent/20",
    },
    {
      title: "Maior Volume",
      value: kpiData.maiorVolume,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      title: "Menor Volume",
      value: kpiData.menorVolume,
      icon: TrendingDown,
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-950/30",
    },
  ];

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        KPIs — {label}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {cards.map((card, i) => (
          <div key={i} className={`${card.bgColor} rounded-xl p-3 border border-border/50 transition-all hover:shadow-md`}>
            <div className="flex items-center gap-1.5 mb-1">
              <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
              <span className="text-[10px] font-medium text-muted-foreground truncate">{card.title}</span>
            </div>
            <p className={`text-lg font-bold ${card.color} ${card.isText ? "text-xs leading-tight" : ""} truncate`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
