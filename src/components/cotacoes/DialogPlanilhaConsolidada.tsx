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
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [tipoVisualizacao, setTipoVisualizacao] = useState<"item" | "lote" | "global">(
    criterioJulgamento === "por_lote" ? "lote" : criterioJulgamento === "global" ? "global" : "item"
  );
  const [calculosPorItem, setCalculosPorItem] = useState<Record<number, "media" | "mediana" | "menor">>({});
  const [calculosPorLote, setCalculosPorLote] = useState<Record<string, "media" | "mediana" | "menor">>({});
  const [calculoGlobal, setCalculoGlobal] = useState<"media" | "mediana" | "menor">("menor");

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
      
      // Inicializar cálculos com "menor" para todos os itens
      if (respostasCompletas.length > 0) {
        const novosCalculos: Record<number, "media" | "mediana" | "menor"> = {};
        respostasCompletas[0].itens.forEach(item => {
          novosCalculos[item.numero_item] = "menor";
        });
        setCalculosPorItem(novosCalculos);

        // Inicializar cálculos por lote se aplicável
        if (criterioJulgamento === "por_lote") {
          const lotes = new Set<string>();
          respostasCompletas[0].itens.forEach(item => {
            if (item.lote_id) lotes.add(item.lote_id);
          });
          const novosCalculosLote: Record<string, "media" | "mediana" | "menor"> = {};
          lotes.forEach(loteId => {
            novosCalculosLote[loteId] = "menor";
          });
          setCalculosPorLote(novosCalculosLote);
        }
      }
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
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #0ea5e9; color: white; font-weight: bold; }
            .text-right { text-align: right; }
            .total { background-color: #f0f9ff; font-weight: bold; }
            .estimativa { background-color: #fef3c7; font-weight: bold; }
            .lote-header { background-color: #0284c7; color: white; font-size: 16px; padding: 10px; margin-top: 20px; }
            .criterio-badge { display: inline-block; padding: 5px 15px; background-color: #0ea5e9; color: white; border-radius: 5px; font-size: 14px; margin-bottom: 20px; }
            .empresa { max-width: 150px; word-wrap: break-word; font-size: 11px; }
            .descricao { max-width: 200px; word-wrap: break-word; }
          </style>
        </head>
        <body>
          <h1>PLANILHA CONSOLIDADA - ESTIMATIVA DE PREÇOS PARA SELEÇÃO</h1>
          <div class="criterio-badge">
            Visualização: ${tipoVisualizacao === "item" ? "Por Item" : tipoVisualizacao === "lote" ? "Por Lote" : "Global"}
          </div>
      `;

      if (tipoVisualizacao === "global") {
        // Visualização global - apenas valores totais
        const valoresGlobais = respostas.map(r => r.valor_total);
        const stats = calcularEstatisticas(valoresGlobais);
        const valorEstimativa = stats[calculoGlobal];

        html += `
          <table>
            <thead>
              <tr>
                ${respostas.map(r => `<th class="text-right empresa">${r.fornecedor.razao_social}</th>`).join("")}
                <th class="text-right">Estimativa (${calculoGlobal === "menor" ? "Menor Preço" : calculoGlobal === "media" ? "Média" : "Mediana"})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                ${respostas.map(r => `
                  <td class="text-right">R$ ${r.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                `).join("")}
                <td class="text-right estimativa">R$ ${valorEstimativa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        `;

      } else if (tipoVisualizacao === "lote" && criterioJulgamento === "por_lote") {
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
          const tipoCalculoLote = calculosPorLote[loteId] || "menor";
          
          html += `
            <div class="lote-header">
              LOTE ${primeiroItem.lote_numero} - ${primeiroItem.lote_descricao} (Cálculo: ${tipoCalculoLote === "menor" ? "Menor Preço" : tipoCalculoLote === "media" ? "Média" : "Mediana"})
            </div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th class="text-right">Qtd</th>
                  <th>Unid</th>
                  ${respostas.map(r => `<th class="text-right empresa">${r.fornecedor.razao_social}</th>`).join("")}
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
              const valorEstimativa = stats[tipoCalculoLote];
              const totalItemEstimativa = valorEstimativa * item.quantidade;
              totalLoteEstimativa += totalItemEstimativa;

              html += `
                <tr>
                  <td>${numeroItem}</td>
                  <td class="descricao">${stripHtml(item.descricao)}</td>
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
                ${respostas.map(r => `<th class="text-right empresa">${r.fornecedor.razao_social}</th>`).join("")}
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
            const tipoCalculoItem = calculosPorItem[numeroItem] || "menor";
            const valores = itens.map(i => i.valor_unitario_ofertado);
            const stats = calcularEstatisticas(valores);
            const valorEstimativa = stats[tipoCalculoItem];
            const totalItemEstimativa = valorEstimativa * item.quantidade;
            totalGeralEstimativa += totalItemEstimativa;

            html += `
              <tr>
                <td>${numeroItem}</td>
                <td class="descricao">${stripHtml(item.descricao)}</td>
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
      link.style.display = "none";
      document.body.appendChild(link);
      
      setTimeout(() => {
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
      }, 100);

      toast.success("Planilha consolidada gerada com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar planilha:", error);
      toast.error("Erro ao gerar planilha consolidada");
    }
  };

  // Obter lista de itens únicos para configuração
  const itensUnicos = respostas.length > 0 
    ? Array.from(new Set(respostas[0].itens.map(i => i.numero_item)))
        .sort((a, b) => a - b)
        .map(num => respostas[0].itens.find(i => i.numero_item === num)!)
    : [];

  // Obter lotes únicos
  const lotesUnicos = respostas.length > 0 && criterioJulgamento === "por_lote"
    ? Array.from(new Map(
        respostas[0].itens
          .filter(i => i.lote_id)
          .map(i => [i.lote_id!, { id: i.lote_id!, numero: i.lote_numero!, descricao: i.lote_descricao! }])
      ).values()).sort((a, b) => a.numero - b.numero)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Gerar Planilha Consolidada para Seleção</DialogTitle>
          <DialogDescription>
            Configure os parâmetros de cálculo para cada item ou lote
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de Visualização</Label>
              <Select value={tipoVisualizacao} onValueChange={(v: "item" | "lote" | "global") => setTipoVisualizacao(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (Valor Total)</SelectItem>
                  <SelectItem value="item">Por Item</SelectItem>
                  {criterioJulgamento === "por_lote" && (
                    <SelectItem value="lote">Por Lote</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {tipoVisualizacao === "global" && (
              <div className="space-y-2">
                <Label>Tipo de Cálculo Global</Label>
                <Select value={calculoGlobal} onValueChange={(v: "media" | "mediana" | "menor") => setCalculoGlobal(v)}>
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
            )}

            {tipoVisualizacao === "lote" && criterioJulgamento === "por_lote" && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Configurar Cálculo por Lote</Label>
                {lotesUnicos.map((lote) => (
                  <div key={lote.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">Lote {lote.numero}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{lote.descricao}</p>
                    </div>
                    <Select 
                      value={calculosPorLote[lote.id] || "menor"} 
                      onValueChange={(v: "media" | "mediana" | "menor") => {
                        setCalculosPorLote(prev => ({ ...prev, [lote.id]: v }));
                      }}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="menor">Menor Preço</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="mediana">Mediana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {tipoVisualizacao === "item" && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Configurar Cálculo por Item</Label>
                {itensUnicos.map((item) => (
                  <div key={item.numero_item} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">Item {item.numero_item}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{stripHtml(item.descricao)}</p>
                    </div>
                    <Select 
                      value={calculosPorItem[item.numero_item] || "menor"} 
                      onValueChange={(v: "media" | "mediana" | "menor") => {
                        setCalculosPorItem(prev => ({ ...prev, [item.numero_item]: v }));
                      }}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="menor">Menor Preço</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="mediana">Mediana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg bg-muted p-4 mt-4">
              <p className="text-sm text-muted-foreground">
                <strong>Respostas encontradas:</strong> {respostas.length} fornecedor(es)
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Configure o tipo de cálculo individualmente e gere a planilha consolidada.
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
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