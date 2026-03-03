// @ts-nocheck
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, BarChart3, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface Props {
  contratos: any[];
  anosDisponiveis: number[];
  contratoSelecionado: string;
  setContratoSelecionado: (v: string) => void;
  anoSelecionado: string;
  setAnoSelecionado: (v: string) => void;
  mesSelecionado: string;
  setMesSelecionado: (v: string) => void;
  modoVisualizacao: "individual" | "comparativo";
  setModoVisualizacao: (v: "individual" | "comparativo") => void;
}

export function DashboardBIFilters({
  contratos, anosDisponiveis, contratoSelecionado, setContratoSelecionado,
  anoSelecionado, setAnoSelecionado, mesSelecionado, setMesSelecionado,
  modoVisualizacao, setModoVisualizacao,
}: Props) {
  return (
    <div className="bg-card border rounded-2xl shadow-sm p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Filter className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-bold text-foreground tracking-wide">Filtros Globais</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={contratoSelecionado} onValueChange={setContratoSelecionado}>
          <SelectTrigger className="w-[200px] text-xs h-10 rounded-lg border-2 border-muted hover:border-primary/40 transition-colors">
            <SelectValue placeholder="Contrato de Gestão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Contratos</SelectItem>
            {contratos.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.nome_contrato}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
          <SelectTrigger className="w-[100px] text-xs h-10 rounded-lg border-2 border-muted hover:border-primary/40 transition-colors">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(ano => (
              <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-[160px] text-xs h-10 rounded-lg border-2 border-muted hover:border-primary/40 transition-colors">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Meses</SelectItem>
            {meses.map(mes => (
              <SelectItem key={mes} value={mes}>{mes}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-lg border-2 border-muted overflow-hidden ml-auto">
          <Button
            size="sm"
            variant="ghost"
            className={`text-xs h-10 rounded-none px-4 gap-1.5 ${modoVisualizacao === "individual" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setModoVisualizacao("individual")}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Individual
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={`text-xs h-10 rounded-none px-4 gap-1.5 ${modoVisualizacao === "comparativo" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setModoVisualizacao("comparativo")}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Comparativo
          </Button>
        </div>
      </div>
    </div>
  );
}
