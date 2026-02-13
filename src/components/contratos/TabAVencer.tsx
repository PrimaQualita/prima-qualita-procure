import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  contratoGestaoId: string;
  processoCompraId?: string;
}

export function TabAVencer({ contratoGestaoId, processoCompraId }: Props) {
  const [contratos, setContratos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContratos();
  }, [contratoGestaoId]);

  const loadContratos = async () => {
    try {
      let query = supabase
        .from("contratos_terceiros")
        .select("*, fornecedores(razao_social)")
        .eq("contrato_gestao_id", contratoGestaoId)
        .eq("status", "vigente")
        .not("fim_vigencia_atual", "is", null);

      if (processoCompraId) {
        const { data: pcData } = await supabase
          .from("processos_para_contratar")
          .select("id")
          .eq("processo_compra_id", processoCompraId);
        const pcIds = pcData?.map(p => p.id) || [];
        if (pcIds.length > 0) {
          query = query.in("processo_para_contratar_id", pcIds);
        } else {
          setContratos([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await query.order("fim_vigencia_atual", { ascending: true });

      if (error) throw error;
      setContratos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar contratos a vencer");
    } finally {
      setLoading(false);
    }
  };

  const getDiasRestantes = (fim: string) => {
    return differenceInDays(new Date(fim + "T23:59:59"), new Date());
  };

  const getAlertColor = (dias: number) => {
    if (dias < 0) return "bg-red-100 text-red-800";
    if (dias <= 30) return "bg-red-100 text-red-800";
    if (dias <= 60) return "bg-yellow-100 text-yellow-800";
    if (dias <= 90) return "bg-blue-100 text-blue-800";
    return "bg-green-100 text-green-800";
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;

  if (contratos.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Nenhum contrato vigente com data de vencimento definida</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Objeto</TableHead>
            <TableHead>Fim Vigência</TableHead>
            <TableHead>Dias Restantes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contratos.map((c) => {
            const dias = getDiasRestantes(c.fim_vigencia_atual);
            return (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-xs sm:text-sm">{c.codigo_interno}</TableCell>
                <TableCell className="text-xs sm:text-sm">{c.fornecedores?.razao_social || "—"}</TableCell>
                <TableCell className="text-xs sm:text-sm max-w-[200px] truncate">{c.objeto}</TableCell>
                <TableCell className="text-xs sm:text-sm">
                  {format(new Date(c.fim_vigencia_atual + "T12:00:00"), "dd/MM/yyyy")}
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs ${getAlertColor(dias)}`}>
                    {dias < 0 ? (
                      <><AlertCircle className="h-3 w-3 mr-1" /> Vencido ({Math.abs(dias)} dias)</>
                    ) : (
                      <><Clock className="h-3 w-3 mr-1" /> {dias} dias</>
                    )}
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
