// @ts-nocheck
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

// Color scale: green strong → green light → blue → blue light → yellow → red
const BI_COLORS = [
  "#16a34a", // green strong
  "#4ade80", // green light
  "#2563eb", // blue
  "#60a5fa", // blue light
  "#eab308", // yellow
  "#dc2626", // red
  "#8b5cf6", // purple extra
  "#f97316", // orange extra
  "#06b6d4", // cyan extra
  "#ec4899", // pink extra
  "#14b8a6", // teal extra
  "#a855f7", // violet extra
];

export type ChartType = "barras" | "vela" | "pareto" | "pizza" | "ranking";

interface Props {
  data: { name: string; value: number }[];
  chartType: ChartType;
  title: string;
  height?: number;
  hideLegend?: boolean;
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

export function DashboardBIChart({ data, chartType, title, height = 280, hideLegend = false }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        Sem dados para exibir
      </div>
    );
  }

  // Sort for pareto (descending)
  const paretoData = chartType === "pareto"
    ? [...data].sort((a, b) => b.value - a.value).map((d, i, arr) => {
        const acumulado = arr.slice(0, i + 1).reduce((s, x) => s + x.value, 0);
        const total = arr.reduce((s, x) => s + x.value, 0);
        return { ...d, acumulado: total > 0 ? (acumulado / total) * 100 : 0 };
      })
    : data;

  const getColorByValueRank = (value: number, values: number[]) => {
    const uniqueSortedValues = [...new Set(values)].sort((a, b) => b - a);
    const rank = uniqueSortedValues.findIndex(v => v === value);
    return BI_COLORS[(rank >= 0 ? rank : 0) % BI_COLORS.length];
  };

  if (chartType === "pizza") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            label={false}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={BI_COLORS[i % BI_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          {!hideLegend && <Legend wrapperStyle={{ fontSize: "11px" }} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "barras" || chartType === "vela") {
    const isHorizontal = chartType === "vela";
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={isHorizontal ? [...data].sort((a, b) => a.value - b.value) : data} layout={isHorizontal ? "vertical" : "horizontal"}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          {isHorizontal ? (
            <>
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          </>
          )}
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" name="Quantidade" radius={[4, 4, 0, 0]}>
            {(isHorizontal ? [...data].sort((a, b) => a.value - b.value) : data).map((entry, i, arr) => {
              // Same quantity must use the same color
              return <Cell key={i} fill={getColorByValueRank(entry.value, arr.map(item => item.value))} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "pareto") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={paretoData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" unit="%" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar yAxisId="left" dataKey="value" name="Quantidade" radius={[4, 4, 0, 0]}>
            {paretoData.map((entry, i, arr) => (
              <Cell key={i} fill={getColorByValueRank(entry.value, arr.map(item => item.value))} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} name="% Acumulado" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ranking = line chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={{ fill: "#2563eb", r: 4 }} name="Quantidade" />
      </LineChart>
    </ResponsiveContainer>
  );
}
