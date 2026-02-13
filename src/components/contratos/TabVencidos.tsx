import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

interface Props {
  contratoGestaoId: string;
  processoCompraId: string;
}

export function TabVencidos({ contratoGestaoId, processoCompraId }: Props) {
  const [contratos, setContratos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContratos();
  }, [contratoGestaoId, processoCompraId]);

  const loadContratos = async () => {
    try {
      // First get processos_para_contratar IDs for this processo_compra
      const { data: processosPC } = await supabase
        .from("processos_para_contratar")
        .select("id")
        .eq("contrato_gestao_id", contratoGestaoId)
        .eq("processo_compra_id", processoCompraId);

      const pcIds = processosPC?.map(p => p.id) || [];
      if (pcIds.length === 0) {
        setContratos([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("contratos_terceiros")
        .select("*, fornecedores(razao_social)")
        .eq("contrato_gestao_id", contratoGestaoId)
        .in("processo_para_contratar_id", pcIds)
        .not("fim_vigencia_atual", "is", null)
        .order("fim_vigencia_atual", { ascending: true });

      if (error) throw error;

      // Filter only expired contracts
      const hoje = new Date();
      const vencidos = (data || []).filter(c => {
        const fimVigencia = new Date(c.fim_vigencia_atual + "T23:59:59");
        return fimVigencia < hoje;
      });

      setContratos(vencidos);
    } catch (error: any) {
      toast.error("Erro ao carregar contratos vencidos");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;

  if (contratos.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Nenhum contrato vencido</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº Contrato/Ano</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Objeto</TableHead>
            <TableHead>Fim Vigência</TableHead>
            <TableHead>Dias Vencido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contratos.map((c) => {
            const dias = Math.abs(differenceInDays(new Date(c.fim_vigencia_atual + "T23:59:59"), new Date()));
            return (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-xs sm:text-sm">{c.codigo_interno}</TableCell>
                <TableCell className="text-xs sm:text-sm">{c.fornecedores?.razao_social || "—"}</TableCell>
                <TableCell className="text-xs sm:text-sm max-w-[200px] truncate">{c.objeto}</TableCell>
                <TableCell className="text-xs sm:text-sm">
                  {format(new Date(c.fim_vigencia_atual + "T12:00:00"), "dd/MM/yyyy")}
                </TableCell>
                <TableCell>
                  <Badge className="text-xs bg-red-100 text-red-800">
                    <AlertCircle className="h-3 w-3 mr-1" /> {dias} dias
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
