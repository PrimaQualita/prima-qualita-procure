import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  anos: number[];
  anoSelecionado: string;
  onAnoChange: (ano: string) => void;
}

/**
 * Componente de filtro por ano de referência.
 * Exibe abas com os anos disponíveis e um "Todos" para não filtrar.
 * Aparece apenas quando há mais de 1 ano disponível.
 */
export function AnoReferenciaFilter({ anos, anoSelecionado, onAnoChange }: Props) {
  if (anos.length === 0) return null;

  return (
    <Tabs value={anoSelecionado} onValueChange={onAnoChange} className="mb-4">
      <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
        {anos.length > 1 && (
          <TabsTrigger value="todos" className="text-xs sm:text-sm">Todos</TabsTrigger>
        )}
        {anos.map(ano => (
          <TabsTrigger key={ano} value={ano.toString()} className="text-xs sm:text-sm">
            {ano}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/**
 * Extrai anos únicos de uma lista de itens e retorna ordenados.
 */
export function extrairAnos<T>(items: T[], getAno: (item: T) => number | undefined): number[] {
  const anosSet = new Set<number>();
  items.forEach(item => {
    const ano = getAno(item);
    if (ano) anosSet.add(ano);
  });
  return Array.from(anosSet).sort((a, b) => a - b);
}

/**
 * Filtra itens pelo ano selecionado.
 */
export function filtrarPorAno<T>(
  items: T[], 
  anoSelecionado: string, 
  getAno: (item: T) => number | undefined
): T[] {
  if (anoSelecionado === "todos") return items;
  const anoNum = parseInt(anoSelecionado);
  return items.filter(item => getAno(item) === anoNum);
}
