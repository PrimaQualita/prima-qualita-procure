// @ts-nocheck
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Trophy } from "lucide-react";

interface RankingRow {
  contrato: string;
  valores: Record<string, number>;
}

interface Props {
  rows: RankingRow[];
  processoLabels: string[];
}

export function DashboardBIRanking({ rows, processoLabels }: Props) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const totalA = Object.values(a.valores).reduce((s, v) => s + v, 0);
    const totalB = Object.values(b.valores).reduce((s, v) => s + v, 0);
    return totalB - totalA;
  });

  return (
    <div className="bg-card border rounded-xl shadow-sm p-4 mt-6">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">Ranking Comparativo por Contrato de Gestão</h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold">#</TableHead>
              <TableHead className="text-xs font-semibold">Contrato de Gestão</TableHead>
              {processoLabels.map(label => (
                <TableHead key={label} className="text-xs font-semibold text-center">{label}</TableHead>
              ))}
              <TableHead className="text-xs font-semibold text-center">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row, i) => {
              const total = Object.values(row.valores).reduce((s, v) => s + v, 0);
              return (
                <TableRow key={row.contrato} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-xs font-bold text-muted-foreground">{i + 1}º</TableCell>
                  <TableCell className="text-xs font-medium">{row.contrato}</TableCell>
                  {processoLabels.map(label => (
                    <TableCell key={label} className="text-xs text-center font-mono">
                      {row.valores[label] || 0}
                    </TableCell>
                  ))}
                  <TableCell className="text-xs text-center font-bold text-primary">{total}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
