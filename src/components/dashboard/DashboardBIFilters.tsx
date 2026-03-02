// @ts-nocheck
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, LayoutGrid, BarChart3 } from "lucide-react";

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
    <div className="bg-card border rounded-xl shadow-sm p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Filtros Globais</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select value={contratoSelecionado} onValueChange={setContratoSelecionado}>
          <SelectTrigger className="w-full text-xs">
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
          <SelectTrigger className="w-full text-xs">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(ano => (
              <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Meses</SelectItem>
            {meses.map(mes => (
              <SelectItem key={mes} value={mes}>{mes}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={modoVisualizacao} onValueChange={(v) => setModoVisualizacao(v as any)}>
          <TabsList className="w-full h-9">
            <TabsTrigger value="individual" className="flex-1 text-xs gap-1">
              <BarChart3 className="h-3 w-3" /> Individual
            </TabsTrigger>
            <TabsTrigger value="comparativo" className="flex-1 text-xs gap-1">
              <LayoutGrid className="h-3 w-3" /> Comparativo
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
