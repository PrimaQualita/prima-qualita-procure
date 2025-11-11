import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface DialogRespostasCotacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  tituloCotacao: string;
}

interface RespostaFornecedor {
  id: string;
  valor_total_anual_ofertado: number;
  observacoes_fornecedor: string | null;
  data_envio_resposta: string;
  fornecedor: {
    razao_social: string;
    cnpj: string;
  };
}

export function DialogRespostasCotacao({
  open,
  onOpenChange,
  cotacaoId,
  tituloCotacao,
}: DialogRespostasCotacaoProps) {
  const [respostas, setRespostas] = useState<RespostaFornecedor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && cotacaoId) {
      loadRespostas();
    }
  }, [open, cotacaoId]);

  const loadRespostas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          valor_total_anual_ofertado,
          observacoes_fornecedor,
          data_envio_resposta,
          fornecedores:fornecedor_id (
            razao_social,
            cnpj
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: false });

      if (error) throw error;

      // Transformar dados
      const respostasFormatadas = (data || []).map((r: any) => ({
        id: r.id,
        valor_total_anual_ofertado: r.valor_total_anual_ofertado,
        observacoes_fornecedor: r.observacoes_fornecedor,
        data_envio_resposta: r.data_envio_resposta,
        fornecedor: {
          razao_social: r.fornecedores?.razao_social || "N/A",
          cnpj: r.fornecedores?.cnpj || "N/A",
        },
      }));

      setRespostas(respostasFormatadas);
    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
      toast.error("Erro ao carregar respostas");
    } finally {
      setLoading(false);
    }
  };

  const formatarCNPJ = (cnpj: string) => {
    if (cnpj.length !== 14) return cnpj;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString("pt-BR");
  };

  const menorValor = respostas.length > 0 
    ? Math.min(...respostas.map(r => r.valor_total_anual_ofertado))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Respostas Recebidas</DialogTitle>
          <DialogDescription>
            Cotação: {tituloCotacao}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Carregando respostas...
          </div>
        ) : respostas.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Nenhuma resposta recebida ainda
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Total de respostas: <strong>{respostas.length}</strong>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-right">Valor Total Ofertado</TableHead>
                  <TableHead>Data Envio</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {respostas.map((resposta) => {
                  const isMenorValor = resposta.valor_total_anual_ofertado === menorValor;
                  
                  return (
                    <TableRow key={resposta.id} className={isMenorValor ? "bg-green-50 dark:bg-green-950" : ""}>
                      <TableCell className="font-medium">
                        {resposta.fornecedor.razao_social}
                        {isMenorValor && (
                          <Badge className="ml-2 bg-green-600">Menor Preço</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatarCNPJ(resposta.fornecedor.cnpj)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        R$ {resposta.valor_total_anual_ofertado.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatarData(resposta.data_envio_resposta)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {resposta.observacoes_fornecedor || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
