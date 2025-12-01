import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DialogConsultarPropostaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  fornecedorId: string;
}

interface ItemResposta {
  id: string;
  valor_unitario_ofertado: number;
  observacao: string | null;
  percentual_desconto?: number | null;
  marca?: string | null;
  itens_cotacao: {
    numero_item: number;
    descricao: string;
    quantidade: number;
    unidade: string;
    lotes_cotacao: {
      numero_lote: number;
      descricao_lote: string;
    } | null;
  };
}

export function DialogConsultarProposta({
  open,
  onOpenChange,
  cotacaoId,
  fornecedorId,
}: DialogConsultarPropostaProps) {
  const [loading, setLoading] = useState(true);
  const [cotacao, setCotacao] = useState<any>(null);
  const [resposta, setResposta] = useState<any>(null);
  const [itensResposta, setItensResposta] = useState<ItemResposta[]>([]);

  useEffect(() => {
    if (open && cotacaoId && fornecedorId) {
      loadDados();
    }
  }, [open, cotacaoId, fornecedorId]);

  const loadDados = async () => {
    setLoading(true);
    try {
      // Buscar dados da cotação
      const { data: cotacaoData, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("titulo_cotacao, descricao_cotacao, criterio_julgamento, data_limite_resposta")
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;
      setCotacao(cotacaoData);

      // Buscar resposta do fornecedor
      const { data: respostaData, error: respostaError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorId)
        .single();

      if (respostaError) throw respostaError;
      setResposta(respostaData);

      // Buscar itens da resposta
      const { data: itensData, error: itensError } = await supabase
        .from("respostas_itens_fornecedor")
        .select(`
          id,
          valor_unitario_ofertado,
          percentual_desconto,
          observacao,
          marca,
          item_cotacao_id,
          itens_cotacao (
            numero_item,
            descricao,
            quantidade,
            unidade,
            lotes_cotacao (
              numero_lote,
              descricao_lote
            )
          )
        `)
        .eq("cotacao_resposta_fornecedor_id", respostaData.id);

      if (itensError) throw itensError;
      
      // Filtrar itens que têm itens_cotacao válido e ordenar
      const itensValidos = (itensData || []).filter((item: any) => item.itens_cotacao !== null);
      const itensSorted = itensValidos.sort((a: any, b: any) => 
        (a.itens_cotacao?.numero_item || 0) - (b.itens_cotacao?.numero_item || 0)
      );
      
      setItensResposta(itensSorted);
    } catch (error: any) {
      console.error("Erro ao carregar proposta:", error);
      toast.error("Erro ao carregar proposta");
    } finally {
      setLoading(false);
    }
  };

  const calcularValorTotal = (valorUnitario: number, quantidade: number) => {
    return valorUnitario * quantidade;
  };

  const calcularValorTotalGeral = () => {
    return itensResposta.reduce((total, item) => {
      return total + calcularValorTotal(item.valor_unitario_ofertado, item.itens_cotacao.quantidade);
    }, 0);
  };

  // Agrupar itens por lote se o critério for "por lote"
  const itensAgrupadosPorLote = () => {
    if (cotacao?.criterio_julgamento !== "por_lote") {
      return { semLote: itensResposta };
    }

    const grupos: Record<string, ItemResposta[]> = {};
    itensResposta.forEach(item => {
      const loteId = item.itens_cotacao.lotes_cotacao?.numero_lote?.toString() || "sem_lote";
      if (!grupos[loteId]) {
        grupos[loteId] = [];
      }
      grupos[loteId].push(item);
    });

    return grupos;
  };

  const calcularTotalLote = (itens: ItemResposta[]) => {
    return itens.reduce((total, item) => {
      return total + calcularValorTotal(item.valor_unitario_ofertado, item.itens_cotacao.quantidade);
    }, 0);
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="text-center py-8">Carregando proposta...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const grupos = itensAgrupadosPorLote();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Minha Proposta Enviada</DialogTitle>
          <DialogDescription>
            Detalhes da proposta que você enviou para esta cotação
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Informações da Cotação */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{cotacao?.titulo_cotacao}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {cotacao?.descricao_cotacao && (
                <p className="text-muted-foreground">{cotacao.descricao_cotacao}</p>
              )}
              <div className="flex gap-4">
                <div>
                  <span className="font-medium">Critério de Julgamento:</span>{" "}
                  <Badge variant="outline">
                    {cotacao?.criterio_julgamento === "global" && "Menor Preço Global"}
                    {cotacao?.criterio_julgamento === "item" && "Menor Preço por Item"}
                    {cotacao?.criterio_julgamento === "por_lote" && "Menor Preço por Lote"}
                    {cotacao?.criterio_julgamento === "desconto" && "Maior Percentual de Desconto"}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Data de Envio:</span>{" "}
                  {new Date(resposta?.data_envio_resposta).toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Itens da Proposta */}
          {cotacao?.criterio_julgamento === "por_lote" ? (
            // Exibir agrupado por lote
            Object.entries(grupos).map(([loteKey, itens]) => {
              const primeiroItem = itens[0];
              const lote = primeiroItem.itens_cotacao.lotes_cotacao;
              
              return (
                <Card key={loteKey} className="border-blue-200 dark:border-blue-800">
                  <CardHeader className="bg-blue-50 dark:bg-blue-950/30">
                    <CardTitle className="text-base">
                      {lote ? `LOTE ${lote.numero_lote} - ${lote.descricao_lote}` : "Sem Lote"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                   <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead className="w-20">Item</TableHead>
                           <TableHead>Descrição</TableHead>
                           <TableHead className="w-32">Marca</TableHead>
                           <TableHead className="w-28 text-right">Quantidade</TableHead>
                           {cotacao?.criterio_julgamento === "desconto" ? (
                             <TableHead className="w-32 text-right">Desconto (%)</TableHead>
                           ) : (
                             <>
                               <TableHead className="w-32 text-right">Valor Unitário</TableHead>
                               <TableHead className="w-32 text-right">Valor Total</TableHead>
                             </>
                           )}
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {itens.map((item) => (
                           <TableRow key={item.id}>
                             <TableCell className="font-medium">
                               {item.itens_cotacao.numero_item}
                             </TableCell>
                             <TableCell>
                               <div>
                                 {item.itens_cotacao.descricao}
                                 {item.observacao && (
                                   <p className="text-xs text-muted-foreground mt-1">
                                     Obs: {item.observacao}
                                   </p>
                                 )}
                             </div>
                             </TableCell>
                             <TableCell>{item.marca || "-"}</TableCell>
                             <TableCell className="text-right">
                               {item.itens_cotacao.quantidade} {item.itens_cotacao.unidade}
                             </TableCell>
                             {cotacao?.criterio_julgamento === "desconto" ? (
                               <TableCell className="text-right">
                                 {item.percentual_desconto && Number(item.percentual_desconto) > 0
                                   ? `${Number(item.percentual_desconto).toFixed(2).replace('.', ',')}%`
                                   : "-"}
                               </TableCell>
                             ) : (
                               <>
                                 <TableCell className="text-right">
                                   R$ {Number(item.valor_unitario_ofertado).toFixed(2)}
                                 </TableCell>
                                 <TableCell className="text-right font-medium">
                                   R$ {calcularValorTotal(item.valor_unitario_ofertado, item.itens_cotacao.quantidade).toFixed(2)}
                                 </TableCell>
                               </>
                             )}
                           </TableRow>
                         ))}
                         {cotacao?.criterio_julgamento !== "desconto" && (
                           <TableRow className="bg-blue-50 dark:bg-blue-950/20 font-semibold">
                             <TableCell colSpan={5} className="text-right">
                               Total do Lote:
                             </TableCell>
                             <TableCell className="text-right">
                               R$ {calcularTotalLote(itens).toFixed(2)}
                             </TableCell>
                           </TableRow>
                         )}
                       </TableBody>
                     </Table>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            // Exibir lista simples
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Itens Cotados</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead className="w-20">Item</TableHead>
                       <TableHead>Descrição</TableHead>
                       <TableHead className="w-32">Marca</TableHead>
                       <TableHead className="w-28 text-right">Quantidade</TableHead>
                       {cotacao?.criterio_julgamento === "desconto" ? (
                         <TableHead className="w-32 text-right">Desconto (%)</TableHead>
                       ) : (
                         <>
                           <TableHead className="w-32 text-right">Valor Unitário</TableHead>
                           <TableHead className="w-32 text-right">Valor Total</TableHead>
                         </>
                       )}
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {itensResposta.map((item) => (
                       <TableRow key={item.id}>
                         <TableCell className="font-medium">
                           {item.itens_cotacao.numero_item}
                         </TableCell>
                         <TableCell>
                           <div>
                             {item.itens_cotacao.descricao}
                             {item.observacao && (
                               <p className="text-xs text-muted-foreground mt-1">
                                 Obs: {item.observacao}
                               </p>
                             )}
                             </div>
                         </TableCell>
                         <TableCell>{item.marca || "-"}</TableCell>
                         <TableCell className="text-right">
                           {item.itens_cotacao.quantidade} {item.itens_cotacao.unidade}
                         </TableCell>
                         {cotacao?.criterio_julgamento === "desconto" ? (
                           <TableCell className="text-right">
                             {item.percentual_desconto && Number(item.percentual_desconto) > 0
                               ? `${Number(item.percentual_desconto).toFixed(2).replace('.', ',')}%`
                               : "-"}
                           </TableCell>
                         ) : (
                           <>
                             <TableCell className="text-right">
                               R$ {Number(item.valor_unitario_ofertado).toFixed(2)}
                             </TableCell>
                             <TableCell className="text-right font-medium">
                               R$ {calcularValorTotal(item.valor_unitario_ofertado, item.itens_cotacao.quantidade).toFixed(2)}
                             </TableCell>
                           </>
                         )}
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
              </CardContent>
            </Card>
          )}

          {/* Resumo Geral */}
          <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total Anual Ofertado</p>
                  {resposta?.observacoes_fornecedor && (
                    <p className="text-sm mt-2">
                      <span className="font-medium">Observações:</span> {resposta.observacoes_fornecedor}
                    </p>
                  )}
                </div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  R$ {Number(resposta?.valor_total_anual_ofertado || 0).toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
