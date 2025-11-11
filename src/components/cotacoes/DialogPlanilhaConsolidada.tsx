import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { stripHtml } from "@/lib/htmlUtils";

interface DialogPlanilhaConsolidadaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  criterioJulgamento: string;
}

interface RespostaConsolidada {
  fornecedor: {
    razao_social: string;
    cnpj: string;
  };
  itens: {
    numero_item: number;
    descricao: string;
    quantidade: number;
    unidade: string;
    valor_unitario_ofertado: number;
    lote_id: string | null;
    lote_numero?: number;
    lote_descricao?: string;
  }[];
  valor_total: number;
}

export function DialogPlanilhaConsolidada({
  open,
  onOpenChange,
  cotacaoId,
  criterioJulgamento,
}: DialogPlanilhaConsolidadaProps) {
  const [respostas, setRespostas] = useState<RespostaConsolidada[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoVisualizacao, setTipoVisualizacao] = useState<"item" | "lote">(
    criterioJulgamento === "por_lote" ? "lote" : "item"
  );
  const [tipoCalculo, setTipoCalculo] = useState<"media" | "mediana" | "menor">("menor");

  useEffect(() => {
    if (open && cotacaoId) {
      loadRespostas();
    }
  }, [open, cotacaoId]);

  const loadRespostas = async () => {
    setLoading(true);
    try {
      const { data: respostasData, error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          valor_total_anual_ofertado,
          fornecedor:fornecedor_id (
            razao_social,
            cnpj
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: true });

      if (error) throw error;

      const respostasCompletas: RespostaConsolidada[] = [];

      for (const resposta of respostasData || []) {
        const { data: itensData } = await supabase
          .from("respostas_itens_fornecedor")
          .select(`
            valor_unitario_ofertado,
            item_cotacao:item_cotacao_id (
              id,
              numero_item,
              descricao,
              quantidade,
              unidade,
              lote_id,
              lote:lote_id (
                numero_lote,
                descricao_lote
              )
            )
          `)
          .eq("cotacao_resposta_fornecedor_id", resposta.id);

        const itensFormatados = (itensData || []).map((item: any) => ({
          numero_item: item.item_cotacao.numero_item,
          descricao: item.item_cotacao.descricao,
          quantidade: item.item_cotacao.quantidade,
          unidade: item.item_cotacao.unidade,
          valor_unitario_ofertado: item.valor_unitario_ofertado,
          lote_id: item.item_cotacao.lote_id,
          lote_numero: item.item_cotacao.lote?.numero_lote,
          lote_descricao: item.item_cotacao.lote?.descricao_lote,
        })).sort((a, b) => a.numero_item - b.numero_item);

        respostasCompletas.push({
          fornecedor: resposta.fornecedor as any,
          itens: itensFormatados,
          valor_total: resposta.valor_total_anual_ofertado,
        });
      }

      setRespostas(respostasCompletas);
    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
      toast.error("Erro ao carregar respostas");
    } finally {
      setLoading(false);
    }
  };

  const calcularEstatisticas = (valores: number[]) => {
    if (valores.length === 0) return { media: 0, mediana: 0, menor: 0 };

    const menor = Math.min(...valores);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    
    const valoresOrdenados = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(valoresOrdenados.length / 2);
    const mediana = valoresOrdenados.length % 2 === 0
      ? (valoresOrdenados[meio - 1] + valoresOrdenados[meio]) / 2
      : valoresOrdenados[meio];

    return { media, mediana, menor };
  };

  const gerarPlanilha = () => {
    try {
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Planilha Consolidada - Estimativa de Preços</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #0ea5e9; font-size: 24px; margin-bottom: 30px; }
            h2 { color: #0284c7; font-size: 18px; margin-top: 30px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
            th { background-color: #0ea5e9; color: white; font-weight: bold; }
            .text-right { text-align: right; }
            .total { background-color: #f0f9ff; font-weight: bold; }
            .estimativa { background-color: #fef3c7; font-weight: bold; }
            .lote-header { background-color: #0284c7; color: white; font-size: 16px; padding: 10px; margin-top: 20px; }
            .criterio-badge { display: inline-block; padding: 5px 15px; background-color: #0ea5e9; color: white; border-radius: 5px; font-size: 14px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>PLANILHA CONSOLIDADA - ESTIMATIVA DE PREÇOS PARA SELEÇÃO</h1>
          <div class="criterio-badge">
            Visualização: ${tipoVisualizacao === "item" ? "Por Item" : "Por Lote"} | 
            Cálculo: ${tipoCalculo === "media" ? "Média" : tipoCalculo === "mediana" ? "Mediana" : "Menor Preço"}
          </div>
      `;

      if (tipoVisualizacao === "lote" && criterioJulgamento === "por_lote") {
        // Agrupar itens por lote
        const lotes = new Map<string, any[]>();
        respostas.forEach(resposta => {
          resposta.itens.forEach(item => {
            if (item.lote_id) {
              if (!lotes.has(item.lote_id)) {
                lotes.set(item.lote_id, []);
              }
              lotes.get(item.lote_id)!.push({
                ...item,
                fornecedor: resposta.fornecedor.razao_social,
              });
            }
          });
        });

        // Gerar tabela para cada lote
        lotes.forEach((itensDoLote, loteId) => {
          const primeiroItem = itensDoLote[0];
          html += `
            <div class="lote-header">
              LOTE ${primeiroItem.lote_numero} - ${primeiroItem.lote_descricao}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th class="text-right">Qtd</th>
                  <th>Unid</th>
                  ${respostas.map(r => `<th class="text-right">${r.fornecedor.razao_social}</th>`).join("")}
                  <th class="text-right">Estimativa</th>
                </tr>
              </thead>
              <tbody>
          `;

          // Agrupar por item
          const itensPorNumero = new Map<number, any[]>();
          itensDoLote.forEach(item => {
            if (!itensPorNumero.has(item.numero_item)) {
              itensPorNumero.set(item.numero_item, []);
            }
            itensPorNumero.get(item.numero_item)!.push(item);
          });

          let totalLoteEstimativa = 0;

          Array.from(itensPorNumero.entries())
            .sort(([a], [b]) => a - b)
            .forEach(([numeroItem, itens]) => {
              const item = itens[0];
              const valores = itens.map(i => i.valor_unitario_ofertado);
              const stats = calcularEstatisticas(valores);
              const valorEstimativa = stats[tipoCalculo];
              const totalItemEstimativa = valorEstimativa * item.quantidade;
              totalLoteEstimativa += totalItemEstimativa;

              html += `
                <tr>
                  <td>${numeroItem}</td>
                  <td>${stripHtml(item.descricao)}</td>
                  <td class="text-right">${item.quantidade.toLocaleString("pt-BR")}</td>
                  <td>${item.unidade}</td>
              `;

              respostas.forEach(resposta => {
                const itemResposta = resposta.itens.find(
                  i => i.numero_item === numeroItem && i.lote_id === loteId
                );
                html += `
                  <td class="text-right">
                    ${itemResposta ? `R$ ${itemResposta.valor_unitario_ofertado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-"}
                  </td>
                `;
              });

              html += `
                  <td class="text-right estimativa">R$ ${valorEstimativa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                </tr>
              `;
            });

          html += `
                <tr class="total">
                  <td colspan="${4 + respostas.length}"><strong>TOTAL DO LOTE ${primeiroItem.lote_numero}</strong></td>
                  <td class="text-right"><strong>R$ ${totalLoteEstimativa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              </tbody>
            </table>
          `;
        });

      } else {
        // Visualização por item (todos os itens juntos)
        const todosItens = new Map<number, any[]>();
        respostas.forEach(resposta => {
          resposta.itens.forEach(item => {
            if (!todosItens.has(item.numero_item)) {
              todosItens.set(item.numero_item, []);
            }
            todosItens.get(item.numero_item)!.push({
              ...item,
              fornecedor: resposta.fornecedor.razao_social,
            });
          });
        });

        html += `
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Descrição</th>
                <th class="text-right">Qtd</th>
                <th>Unid</th>
                ${respostas.map(r => `<th class="text-right">${r.fornecedor.razao_social}</th>`).join("")}
                <th class="text-right">Estimativa</th>
              </tr>
            </thead>
            <tbody>
        `;

        let totalGeralEstimativa = 0;

        Array.from(todosItens.entries())
          .sort(([a], [b]) => a - b)
          .forEach(([numeroItem, itens]) => {
            const item = itens[0];
            const valores = itens.map(i => i.valor_unitario_ofertado);
            const stats = calcularEstatisticas(valores);
            const valorEstimativa = stats[tipoCalculo];
            const totalItemEstimativa = valorEstimativa * item.quantidade;
            totalGeralEstimativa += totalItemEstimativa;

            html += `
              <tr>
                <td>${numeroItem}</td>
                <td>${stripHtml(item.descricao)}</td>
                <td class="text-right">${item.quantidade.toLocaleString("pt-BR")}</td>
                <td>${item.unidade}</td>
            `;

            respostas.forEach(resposta => {
              const itemResposta = resposta.itens.find(i => i.numero_item === numeroItem);
              html += `
                <td class="text-right">
                  ${itemResposta ? `R$ ${itemResposta.valor_unitario_ofertado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-"}
                </td>
              `;
            });

            html += `
                <td class="text-right estimativa">R$ ${valorEstimativa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
              </tr>
            `;
          });

        html += `
              <tr class="total">
                <td colspan="${4 + respostas.length}"><strong>VALOR TOTAL ESTIMADO</strong></td>
                <td class="text-right"><strong>R$ ${totalGeralEstimativa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tbody>
          </table>
        `;
      }

      html += `
        </body>
        </html>
      `;

      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Planilha_Consolidada_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Planilha consolidada gerada com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar planilha:", error);
      toast.error("Erro ao gerar planilha consolidada");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar Planilha Consolidada para Seleção</DialogTitle>
          <DialogDescription>
            Configure os parâmetros para gerar a planilha comparativa de estimativas de preços
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {criterioJulgamento === "por_lote" && (
            <div className="space-y-2">
              <Label>Tipo de Visualização</Label>
              <Select value={tipoVisualizacao} onValueChange={(v: "item" | "lote") => setTipoVisualizacao(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="item">Por Item</SelectItem>
                  <SelectItem value="lote">Por Lote</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tipo de Cálculo para Estimativa</Label>
            <Select value={tipoCalculo} onValueChange={(v: "media" | "mediana" | "menor") => setTipoCalculo(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="menor">Menor Preço</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="mediana">Mediana</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Respostas encontradas:</strong> {respostas.length} fornecedor(es)
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              A planilha irá comparar todos os valores recebidos e calcular a estimativa baseada no critério selecionado.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={gerarPlanilha} disabled={loading || respostas.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Gerar Planilha
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
