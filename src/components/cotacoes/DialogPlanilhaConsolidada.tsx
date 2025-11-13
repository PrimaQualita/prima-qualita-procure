import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from 'uuid';
import html2pdf from "html2pdf.js";
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
  onPlanilhaGerada?: () => void;
}

interface RespostaConsolidada {
  fornecedor: {
    razao_social: string;
    cnpj: string;
    email: string;
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
    marca?: string;
  }[];
  valor_total: number;
  rejeitado?: boolean;
  motivo_rejeicao?: string;
}

export function DialogPlanilhaConsolidada({
  open,
  onOpenChange,
  cotacaoId,
  criterioJulgamento,
  onPlanilhaGerada,
}: DialogPlanilhaConsolidadaProps) {
  const [respostas, setRespostas] = useState<RespostaConsolidada[]>([]);
  const [loading, setLoading] = useState(true);
  // Usa automaticamente o critério de julgamento da cotação
  const tipoVisualizacao = criterioJulgamento === "por_lote" ? "lote" : criterioJulgamento === "global" ? "global" : "item";
  const [calculosPorItem, setCalculosPorItem] = useState<Record<string, "media" | "mediana" | "menor">>({});
  const [calculosPorLote, setCalculosPorLote] = useState<Record<string, "media" | "mediana" | "menor">>({});
  const [calculoGlobal, setCalculoGlobal] = useState<"media" | "mediana" | "menor">("menor");
  const [todosItens, setTodosItens] = useState<any[]>([]);
  const [tipoProcesso, setTipoProcesso] = useState<string>("");

  useEffect(() => {
    if (open && cotacaoId) {
      loadRespostas();
    }
  }, [open, cotacaoId]);

  const loadRespostas = async () => {
    setLoading(true);
    try {
      // Buscar informações da cotação e do processo
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select(`
          processo_compra_id,
          processos_compras!inner (
            tipo
          )
        `)
        .eq("id", cotacaoId)
        .single();

      if (cotacaoData?.processos_compras) {
        setTipoProcesso(cotacaoData.processos_compras.tipo);
      }

      const { data: respostasData, error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          valor_total_anual_ofertado,
          rejeitado,
          motivo_rejeicao,
          fornecedor:fornecedor_id (
            razao_social,
            cnpj,
            email
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: true });

      if (error) throw error;

      // Buscar TODOS os itens da cotação (não das respostas)
      const { data: todosItensData } = await supabase
        .from("itens_cotacao")
        .select(`
          id,
          numero_item,
          descricao,
          quantidade,
          unidade,
          marca,
          lote_id,
          lotes_cotacao (
            numero_lote,
            descricao_lote
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .order("numero_item");
      
      // Formatar os dados dos itens com informações do lote
      const itensFormatados = (todosItensData || []).map((item: any) => ({
        ...item,
        numero_lote: item.lotes_cotacao?.numero_lote,
        descricao_lote: item.lotes_cotacao?.descricao_lote
      }));

      const respostasCompletas: RespostaConsolidada[] = [];

      for (const resposta of respostasData || []) {
        const { data: itensData } = await supabase
          .from("respostas_itens_fornecedor")
          .select(`
            valor_unitario_ofertado,
            marca,
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

        console.log(`📦 Itens do fornecedor ${resposta.fornecedor.razao_social}:`, itensData);
        console.log(`🏷️ Marcas encontradas:`, itensData?.map((i: any) => ({ item: i.item_cotacao.numero_item, marca: i.marca })));

        const itensFormatados = (itensData || []).map((item: any) => ({
          numero_item: item.item_cotacao.numero_item,
          descricao: item.item_cotacao.descricao,
          quantidade: item.item_cotacao.quantidade,
          unidade: item.item_cotacao.unidade,
          marca: item.marca,
          valor_unitario_ofertado: item.valor_unitario_ofertado,
          lote_id: item.item_cotacao.lote_id,
          lote_numero: item.item_cotacao.lote?.numero_lote,
          lote_descricao: item.item_cotacao.lote?.descricao_lote,
        })).sort((a, b) => a.numero_item - b.numero_item);

        console.log(`✅ Itens formatados para ${resposta.fornecedor.razao_social}:`, itensFormatados);

        respostasCompletas.push({
          fornecedor: resposta.fornecedor as any,
          itens: itensFormatados,
          valor_total: resposta.valor_total_anual_ofertado,
          rejeitado: resposta.rejeitado || false,
          motivo_rejeicao: resposta.motivo_rejeicao || undefined,
        });
      }

      setRespostas(respostasCompletas);
      
      // Armazenar TODOS os itens da cotação para usar na configuração
      setTodosItens(itensFormatados || []);
      
      // Inicializar cálculos com "menor" para TODOS os itens da cotação
      // Usar chave composta "loteId_itemId" para diferenciar itens de lotes diferentes
      if (itensFormatados && itensFormatados.length > 0) {
        const novosCalculos: Record<string, "media" | "mediana" | "menor"> = {};
        itensFormatados.forEach((item: any) => {
          const chave = `${item.lote_id || 'sem-lote'}_${item.id}`;
          novosCalculos[chave] = "menor";
        });
        setCalculosPorItem(novosCalculos as any);

        // Inicializar cálculos por lote se aplicável
        if (criterioJulgamento === "por_lote") {
          const lotes = new Set<string>();
          itensFormatados.forEach((item: any) => {
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
    const soma = valores.reduce((a, b) => a + b, 0);
    const media = Math.round((soma / valores.length) * 100) / 100; // Arredondar para 2 casas
    
    const valoresOrdenados = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(valoresOrdenados.length / 2);
    const medianaCalc = valoresOrdenados.length % 2 === 0
      ? (valoresOrdenados[meio - 1] + valoresOrdenados[meio]) / 2
      : valoresOrdenados[meio];
    const mediana = Math.round(medianaCalc * 100) / 100; // Arredondar para 2 casas

    return { media, mediana, menor };
  };

  const gerarPlanilha = async () => {
    try {
      // Gerar identificadores únicos para certificação
      const protocoloDocumento = uuidv4();
      const dataHoraGeracao = new Date();
      const hashVerificacao = protocoloDocumento.replace(/-/g, '').substring(0, 32).toUpperCase();
      
      // Buscar informações do usuário que está gerando
      const { data: userData } = await supabase.auth.getUser();
      const { data: profileData } = await supabase
        .from('profiles')
        .select('nome_completo, email')
        .eq('id', userData?.user?.id || '')
        .single();
      
      const usuarioNome = profileData?.nome_completo || 'Sistema';
      const usuarioEmail = profileData?.email || '';
      // Converter logo para base64
      const logoPath = '/src/assets/prima-qualita-logo-horizontal.png';
      let logoBase64 = '';
      try {
        const response = await fetch(logoPath);
        const blob = await response.blob();
        logoBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error("Erro ao carregar logo:", error);
      }

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Planilha Consolidada</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 15px; }
            .logo-container { text-align: center; margin-bottom: 15px; }
            .logo-container img { max-width: 180px; height: auto; }
            h1 { 
              color: #0ea5e9; 
              font-size: 20px; 
              margin-bottom: 15px; 
              text-align: center;
              font-weight: bold;
            }
            .criterio-badge { 
              display: inline-block;
              padding: 6px 16px; 
              background-color: #0ea5e9; 
              color: white; 
              border-radius: 4px; 
              font-size: 13px; 
              margin-bottom: 15px;
            }
            h2 { color: #0284c7; font-size: 16px; margin-top: 20px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: middle; }
            th { background-color: #0ea5e9; color: white; font-weight: bold; text-align: center; font-size: 10px; }
            .text-right { text-align: right; }
            .total { background-color: #f0f9ff; font-weight: bold; }
            .estimativa { background-color: #fef3c7; font-weight: bold; }
            .lote-header { background-color: #0284c7; color: white; font-size: 14px; padding: 8px; margin-top: 15px; }
            .col-item { width: 35px; text-align: center; }
            .col-qtd { width: 45px; text-align: center; }
            .col-unid { width: 60px; text-align: center; }
            .col-descricao { width: 250px; word-wrap: break-word; }
            .empresa { 
              width: 130px;
              word-wrap: break-word; 
              word-break: break-word;
              font-size: 9px;
              line-height: 1.2;
            }
            .col-estimativa { width: 90px; }
            th.empresa { white-space: normal; line-height: 1.1; }
            .certificacao-digital {
              margin-top: 25px;
              padding: 12px;
              border: 1px solid #0ea5e9;
              border-radius: 4px;
              background-color: #f0f9ff;
              font-size: 8px;
              page-break-inside: avoid;
            }
            .certificacao-digital h3 {
              color: #0284c7;
              font-size: 10px;
              margin-bottom: 8px;
              font-weight: bold;
            }
            .certificacao-digital .info-item {
              margin: 4px 0;
              font-size: 8px;
            }
            .certificacao-digital .info-label {
              font-weight: bold;
              color: #0369a1;
            }
            .certificacao-digital .hash {
              font-family: 'Courier New', monospace;
              background-color: #e0f2fe;
              padding: 2px 3px;
              border-radius: 2px;
              word-break: break-all;
              font-size: 7px;
            }
            .certificacao-digital .link-verificacao {
              color: #0284c7;
              text-decoration: underline;
              font-size: 8px;
            }
          </style>
        </head>
        <body>
          ${logoBase64 ? `<div class="logo-container"><img src="${logoBase64}" alt="Prima Qualitá Saúde" /></div>` : ''}
          <h1>PLANILHA CONSOLIDADA - ESTIMATIVA DE PREÇOS PARA SELEÇÃO</h1>
          <div class="criterio-badge">
            Critério de Julgamento: ${tipoVisualizacao === "item" ? "Menor Valor por Item" : tipoVisualizacao === "lote" ? "Menor Valor por Lote" : "Menor Valor Global"}
          </div>
      `;

      if (tipoVisualizacao === "global") {
        // Visualização global - exibir todos os itens com marca por fornecedor (se Material)
        html += `
          <table>
            <thead>`;
        
        if (tipoProcesso === "material") {
          // Cabeçalho de duas linhas para Material
          html += `
              <tr>
                <th class="col-item" rowspan="2">Item</th>
                <th class="col-descricao" rowspan="2">Descrição</th>
                <th class="col-qtd" rowspan="2">Qtd</th>
                <th class="col-unid" rowspan="2">Unid</th>
                ${respostas.map(r => `
                  <th class="text-right empresa" colspan="2" style="font-size: 10px; padding: 4px;">
                    <div>${r.fornecedor.razao_social}</div>
                    <div style="font-weight: normal; margin-top: 2px;">CNPJ: ${r.fornecedor.cnpj}</div>
                    <div style="font-weight: normal; margin-top: 2px;">${r.fornecedor.email}</div>
                  </th>
                `).join("")}
                <th class="text-right col-estimativa" rowspan="2">Estimativa</th>
              </tr>
              <tr>
                ${respostas.map(() => `<th class="col-unid">Marca</th><th class="text-right empresa">Valor Unitário</th>`).join("")}
              </tr>`;
        } else {
          // Cabeçalho de uma linha para outros tipos
          html += `
              <tr>
                <th class="col-item">Item</th>
                <th class="col-descricao">Descrição</th>
                <th class="col-qtd">Qtd</th>
                <th class="col-unid">Unid</th>
                ${respostas.map(r => `
                  <th class="text-right empresa" style="font-size: 10px; padding: 4px;">
                    <div>${r.fornecedor.razao_social}</div>
                    <div style="font-weight: normal; margin-top: 2px;">CNPJ: ${r.fornecedor.cnpj}</div>
                    <div style="font-weight: normal; margin-top: 2px;">${r.fornecedor.email}</div>
                  </th>
                `).join("")}
                <th class="text-right col-estimativa">Estimativa</th>
              </tr>`;
        }
        
        html += `
            </thead>
            <tbody>
        `;

        let totalGeralEstimativa = 0;

        todosItens.forEach((item: any) => {
          const chaveItem = `${item.lote_id || 'sem-lote'}_${item.id}`;
          const tipoCalculoItem = calculosPorItem[chaveItem] || calculoGlobal;
          
          const valores: number[] = [];
          respostas.forEach(resposta => {
            const itemResposta = resposta.itens.find((i: any) => 
              i.numero_item === item.numero_item
            );
            if (itemResposta) {
              valores.push(Number(itemResposta.valor_unitario_ofertado));
            }
          });

          const stats = calcularEstatisticas(valores);
          const valorEstimativa = stats[tipoCalculoItem];
          const totalItemEstimativa = Math.round(valorEstimativa * Number(item.quantidade) * 100) / 100;
          totalGeralEstimativa += totalItemEstimativa;

          html += `
            <tr>
              <td class="col-item">${item.numero_item}</td>
              <td class="col-descricao">${stripHtml(item.descricao)}</td>
              <td class="col-qtd">${Number(item.quantidade).toLocaleString("pt-BR")}</td>
              <td class="col-unid">${item.unidade}</td>
          `;

          respostas.forEach(resposta => {
            const itemResposta = resposta.itens.find((i: any) => i.numero_item === item.numero_item);
            const valorTotal = itemResposta 
              ? Math.round(Number(itemResposta.valor_unitario_ofertado) * Number(item.quantidade) * 100) / 100
              : 0;
            
            if (tipoProcesso === "material") {
              // Marca + Valor para tipo Material
              html += `
                <td class="col-unid">${itemResposta?.marca || "-"}</td>
                <td class="text-right">
                  ${itemResposta 
                    ? `${Number(itemResposta.valor_unitario_ofertado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small>` 
                    : "-"}
                </td>
              `;
            } else {
              // Apenas Valor para outros tipos
              html += `
                <td class="text-right">
                  ${itemResposta 
                    ? `${Number(itemResposta.valor_unitario_ofertado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small>` 
                    : "-"}
                </td>
              `;
            }
          });

          html += `
              <td class="text-right estimativa">${valorEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${totalItemEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small></td>
            </tr>
          `;
        });

        const colspanTotal = tipoProcesso === "material" ? (4 + (respostas.length * 2)) : (4 + respostas.length);
        html += `
              <tr class="total">
                <td colspan="${colspanTotal}"><strong>VALOR TOTAL ESTIMADO</strong></td>
                <td class="text-right"><strong>${totalGeralEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
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
              <thead>`;
            
            if (tipoProcesso === "material") {
              // Cabeçalho de duas linhas para Material
              html += `
                <tr>
                  <th class="col-item" rowspan="2">Item</th>
                  <th class="col-descricao" rowspan="2">Descrição</th>
                  <th class="col-qtd" rowspan="2">Qtd</th>
                  <th class="col-unid" rowspan="2">Unid</th>
                  ${respostas.map(r => `
                    <th class="text-right empresa" colspan="2" style="font-size: 10px; padding: 4px;">
                      <div>${r.fornecedor.razao_social}</div>
                      <div style="font-weight: normal; margin-top: 2px;">CNPJ: ${r.fornecedor.cnpj}</div>
                      <div style="font-weight: normal; margin-top: 2px;">${r.fornecedor.email}</div>
                    </th>
                  `).join("")}
                  <th class="text-right col-estimativa" rowspan="2">Estimativa</th>
                </tr>
                <tr>
                  ${respostas.map(() => `<th class="col-unid">Marca</th><th class="text-right empresa">Valor Unitário</th>`).join("")}
                </tr>`;
            } else {
              // Cabeçalho de uma linha para outros tipos
              html += `
                <tr>
                  <th class="col-item">Item</th>
                  <th class="col-descricao">Descrição</th>
                  <th class="col-qtd">Qtd</th>
                  <th class="col-unid">Unid</th>
                  ${respostas.map(r => `
                    <th class="text-right empresa" style="font-size: 10px; padding: 4px;">
                      <div>${r.fornecedor.razao_social}</div>
                      <div style="font-weight: normal; margin-top: 2px;">CNPJ: ${r.fornecedor.cnpj}</div>
                      <div style="font-weight: normal; margin-top: 2px;">${r.fornecedor.email}</div>
                    </th>
                  `).join("")}
                  <th class="text-right col-estimativa">Estimativa</th>
                </tr>`;
            }
            
            html += `
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
              const totalItemEstimativa = Math.round(valorEstimativa * item.quantidade * 100) / 100;
              totalLoteEstimativa += totalItemEstimativa;

              html += `
                <tr>
                  <td class="col-item">${numeroItem}</td>
                  <td class="col-descricao">${stripHtml(item.descricao)}</td>
                  <td class="col-qtd">${item.quantidade.toLocaleString("pt-BR")}</td>
                  <td class="col-unid">${item.unidade}</td>
              `;

              respostas.forEach(resposta => {
                const itemResposta = resposta.itens.find(
                  i => i.numero_item === numeroItem && i.lote_id === loteId
                );
                const valorTotal = itemResposta 
                  ? Math.round(itemResposta.valor_unitario_ofertado * item.quantidade * 100) / 100
                  : 0;
                
                if (tipoProcesso === "material") {
                  // Marca + Valor para tipo Material
                  html += `
                    <td class="col-unid">${itemResposta?.marca || "-"}</td>
                    <td class="text-right">
                      ${itemResposta 
                        ? `${itemResposta.valor_unitario_ofertado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small>` 
                        : "-"}
                    </td>
                  `;
                } else {
                  // Apenas Valor para outros tipos
                  html += `
                    <td class="text-right">
                      ${itemResposta 
                        ? `${itemResposta.valor_unitario_ofertado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small>` 
                        : "-"}
                    </td>
                  `;
                }
              });

              html += `
                  <td class="text-right estimativa">${valorEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${totalItemEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small></td>
                </tr>
              `;
            });

          html += `
                <tr class="total">
                  <td colspan="${4 + (tipoProcesso === "material" ? respostas.length * 2 : respostas.length)}"><strong>TOTAL DO LOTE ${primeiroItem.lote_numero}</strong></td>
                  <td class="text-right"><strong>${totalLoteEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
                </tr>
              </tbody>
            </table>
          `;
        });

      } else {
        // Visualização por item - verificar se deve agrupar por lote
        if (criterioJulgamento === "por_lote") {
          // Agrupar itens por lote
          const itensPorLote: Record<string, any[]> = {};
          const lotesInfo: Record<string, { numero: number; descricao: string }> = {};
          
          todosItens.forEach((item: any) => {
            const loteKey = item.lote_id || 'sem-lote';
            if (!itensPorLote[loteKey]) {
              itensPorLote[loteKey] = [];
            }
            itensPorLote[loteKey].push(item);
            
            if (item.lote_id) {
              lotesInfo[loteKey] = {
                numero: item.numero_lote || 0,
                descricao: item.descricao_lote || ''
              };
            }
          });

          let totalGeralEstimativa = 0;

          // Processar cada lote
          Object.keys(itensPorLote)
            .sort((a, b) => {
              const numA = lotesInfo[a]?.numero || 0;
              const numB = lotesInfo[b]?.numero || 0;
              return numA - numB;
            })
            .forEach((loteKey) => {
              const itensDoLote = itensPorLote[loteKey];
              const loteInfo = lotesInfo[loteKey];

              if (loteInfo) {
                html += `
                  <div class="lote-header">
                    LOTE ${loteInfo.numero} - ${loteInfo.descricao}
                  </div>`;
              }

              html += `
                <table>
                  <thead>`;
              
              if (tipoProcesso === "material") {
                // Cabeçalho de duas linhas para Material
                html += `
                  <tr>
                    <th class="col-item" rowspan="2">Item</th>
                    <th class="col-descricao" rowspan="2">Descrição</th>
                    <th class="col-qtd" rowspan="2">Qtd</th>
                    <th class="col-unid" rowspan="2">Unid</th>
                    ${respostas.map(r => `<th class="text-right empresa" colspan="2">${r.fornecedor.razao_social}</th>`).join("")}
                    <th class="text-right col-estimativa" rowspan="2">Estimativa</th>
                  </tr>
                  <tr>
                    ${respostas.map(() => `<th class="col-unid">Marca</th><th class="text-right empresa">Valor Unitário</th>`).join("")}
                  </tr>`;
              } else {
                // Cabeçalho de uma linha para outros tipos
                html += `
                  <tr>
                    <th class="col-item">Item</th>
                    <th class="col-descricao">Descrição</th>
                    <th class="col-qtd">Qtd</th>
                    <th class="col-unid">Unid</th>
                    ${respostas.map(r => `<th class="text-right empresa">${r.fornecedor.razao_social}</th>`).join("")}
                    <th class="text-right col-estimativa">Estimativa</th>
                  </tr>`;
              }
              
              html += `
                  </thead>
                  <tbody>
              `;

              let totalLoteEstimativa = 0;

              itensDoLote.forEach((item: any) => {
                const chaveItem = `${item.lote_id || 'sem-lote'}_${item.id}`;
                const tipoCalculoItem = calculosPorItem[chaveItem] || "menor";
                
                const valores: number[] = [];
                respostas.forEach(resposta => {
                  // Buscar item pela combinação de lote_id E numero_item para evitar duplicação
                  const itemResposta = resposta.itens.find((i: any) => 
                    i.numero_item === item.numero_item && 
                    (i.lote_id === item.lote_id || (!i.lote_id && !item.lote_id))
                  );
                  if (itemResposta) {
                    valores.push(Number(itemResposta.valor_unitario_ofertado));
                  }
                });

                const stats = calcularEstatisticas(valores);
                const valorEstimativa = stats[tipoCalculoItem];
                const totalItemEstimativa = Math.round(valorEstimativa * Number(item.quantidade) * 100) / 100;
                totalLoteEstimativa += totalItemEstimativa;

                html += `
                  <tr>
                    <td class="col-item">${item.numero_item}</td>
                    <td class="col-descricao">${stripHtml(item.descricao)}</td>
                    <td class="col-qtd">${Number(item.quantidade).toLocaleString("pt-BR")}</td>
                    <td class="col-unid">${item.unidade}</td>
                `;

                respostas.forEach(resposta => {
                  const itemResposta = resposta.itens.find((i: any) => 
                    i.numero_item === item.numero_item && 
                    (i.lote_id === item.lote_id || (!i.lote_id && !item.lote_id))
                  );
                  const valorTotal = itemResposta
                    ? Math.round(Number(itemResposta.valor_unitario_ofertado) * Number(item.quantidade) * 100) / 100
                    : 0;
                  
                  if (tipoProcesso === "material") {
                    // Marca + Valor para tipo Material
                    html += `
                      <td class="col-unid">${itemResposta?.marca || "-"}</td>
                      <td class="text-right">
                        ${itemResposta 
                          ? `${Number(itemResposta.valor_unitario_ofertado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small>` 
                          : "-"}
                      </td>
                    `;
                  } else {
                    // Apenas Valor para outros tipos
                    html += `
                      <td class="text-right">
                        ${itemResposta 
                          ? `${Number(itemResposta.valor_unitario_ofertado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small>` 
                          : "-"}
                      </td>
                    `;
                  }
                });

                html += `
                    <td class="text-right estimativa">${valorEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${totalItemEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small></td>
                  </tr>
                `;
              });

              totalGeralEstimativa += totalLoteEstimativa;

              if (loteInfo) {
                html += `
                  <tr class="total">
                    <td colspan="${4 + (tipoProcesso === "material" ? respostas.length * 2 : respostas.length)}"><strong>TOTAL DO LOTE ${loteInfo.numero}</strong></td>
                    <td class="text-right"><strong>${totalLoteEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
                  </tr>
                `;
              }

              html += `
                  </tbody>
                </table>
              `;
            });

          html += `
            <table>
              <tbody>
                <tr class="total">
                  <td colspan="${4 + (tipoProcesso === "material" ? respostas.length * 2 : respostas.length)}"><strong>VALOR TOTAL ESTIMADO</strong></td>
                  <td class="text-right"><strong>${totalGeralEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
                </tr>
              </tbody>
            </table>
          `;

        } else {
          // Visualização por item sem agrupamento por lote
          html += `
            <table>
              <thead>`;
          
          if (tipoProcesso === "material") {
            // Cabeçalho de duas linhas para Material
            html += `
              <tr>
                <th class="col-item" rowspan="2">Item</th>
                <th class="col-descricao" rowspan="2">Descrição</th>
                <th class="col-qtd" rowspan="2">Qtd</th>
                <th class="col-unid" rowspan="2">Unid</th>
                ${respostas.map(r => `<th class="text-right empresa" colspan="2">${r.fornecedor.razao_social}</th>`).join("")}
                <th class="text-right col-estimativa" rowspan="2">Estimativa</th>
              </tr>
              <tr>
                ${respostas.map(() => `<th class="col-unid">Marca</th><th class="text-right empresa">Valor Unitário</th>`).join("")}
              </tr>`;
          } else {
            // Cabeçalho de uma linha para outros tipos
            html += `
              <tr>
                <th class="col-item">Item</th>
                <th class="col-descricao">Descrição</th>
                <th class="col-qtd">Qtd</th>
                <th class="col-unid">Unid</th>
                ${respostas.map(r => `<th class="text-right empresa">${r.fornecedor.razao_social}</th>`).join("")}
                <th class="text-right col-estimativa">Estimativa</th>
              </tr>`;
          }
          
          html += `
              </thead>
              <tbody>
          `;

          let totalGeralEstimativa = 0;

          todosItens.forEach((item: any) => {
            const chaveItem = `${item.lote_id || 'sem-lote'}_${item.id}`;
            const tipoCalculoItem = calculosPorItem[chaveItem] || "menor";
            
            const valores: number[] = [];
            respostas.forEach(resposta => {
              const itemResposta = resposta.itens.find((i: any) => 
                i.numero_item === item.numero_item && 
                (i.lote_id === item.lote_id || (!i.lote_id && !item.lote_id))
              );
              if (itemResposta) {
                valores.push(Number(itemResposta.valor_unitario_ofertado));
              }
            });

            const stats = calcularEstatisticas(valores);
            const valorEstimativa = stats[tipoCalculoItem];
            const totalItemEstimativa = Math.round(valorEstimativa * Number(item.quantidade) * 100) / 100;
            totalGeralEstimativa += totalItemEstimativa;

            html += `
              <tr>
                <td class="col-item">${item.numero_item}</td>
                <td class="col-descricao">${stripHtml(item.descricao)}</td>
                <td class="col-qtd">${Number(item.quantidade).toLocaleString("pt-BR")}</td>
                <td class="col-unid">${item.unidade}</td>
            `;

            respostas.forEach(resposta => {
              const itemResposta = resposta.itens.find((i: any) => 
                i.numero_item === item.numero_item && 
                (i.lote_id === item.lote_id || (!i.lote_id && !item.lote_id))
              );
              const valorTotal = itemResposta 
                ? Math.round(Number(itemResposta.valor_unitario_ofertado) * Number(item.quantidade) * 100) / 100
                : 0;
              
              if (tipoProcesso === "material") {
                // Marca + Valor para tipo Material
                html += `
                  <td class="col-unid">${itemResposta?.marca || "-"}</td>
                  <td class="text-right">
                    ${itemResposta 
                      ? `${Number(itemResposta.valor_unitario_ofertado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small>` 
                      : "-"}
                  </td>
                `;
              } else {
                // Apenas Valor para outros tipos
                html += `
                  <td class="text-right">
                    ${itemResposta 
                      ? `${Number(itemResposta.valor_unitario_ofertado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small>` 
                      : "-"}
                  </td>
                `;
              }
            });

            html += `
                <td class="text-right estimativa">${valorEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br/><small>(Total: ${totalItemEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</small></td>
              </tr>
            `;
          });

          html += `
            <tr class="total">
              <td colspan="${4 + (tipoProcesso === "material" ? respostas.length * 2 : respostas.length)}"><strong>VALOR TOTAL ESTIMADO</strong></td>
              <td class="text-right"><strong>${totalGeralEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
            </tr>
          </tbody>
        </table>
      `;
        }
      }

      // Adicionar certificação digital no final do documento
      const linkVerificacao = `${window.location.origin}/verificar-planilha?protocolo=${protocoloDocumento}`;
      
      html += `
          <div class="certificacao-digital">
            <h3>🔒 CERTIFICAÇÃO DIGITAL DO DOCUMENTO</h3>
            <div class="info-item">
              <span class="info-label">Protocolo:</span> ${protocoloDocumento}
            </div>
            <div class="info-item">
              <span class="info-label">Data/Hora:</span> ${dataHoraGeracao.toLocaleString('pt-BR', { 
                timeZone: 'America/Sao_Paulo',
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
            <div class="info-item">
              <span class="info-label">Gerado por:</span> ${usuarioNome}
            </div>
            <div class="info-item">
              <span class="info-label">Hash:</span> <span class="hash">${hashVerificacao.substring(0, 32)}...</span>
            </div>
            <div class="info-item">
              <span class="info-label">Verificar autenticidade em:</span> <a href="${linkVerificacao}" class="link-verificacao">${linkVerificacao}</a>
            </div>
          </div>
        </body>
        </html>
      `;

      // Gerar PDF usando html2pdf.js
      const element = document.createElement('div');
      element.innerHTML = html;

      const opt = {
        margin: [5, 5, 5, 5],
        filename: `planilha_consolidada_${cotacaoId}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false,
          scrollY: 0,
          scrollX: 0
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'landscape',
          compress: true
        },
        pagebreak: { 
          mode: ['avoid-all', 'css', 'legacy']
        }
      };

      // @ts-ignore
      const pdfBlob = await html2pdf().from(element).set(opt).outputPdf('blob');

      // Salvar no storage
      const nomeArquivo = `planilha_consolidada_${cotacaoId}_${Date.now()}.pdf`;
      const filePath = `${cotacaoId}/${nomeArquivo}`;

      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(filePath, pdfBlob, {
          contentType: "application/pdf",
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Registrar no banco de dados
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: dbError } = await supabase
        .from("planilhas_consolidadas")
        .insert({
          cotacao_id: cotacaoId,
          nome_arquivo: nomeArquivo,
          url_arquivo: filePath,
          usuario_gerador_id: user?.id,
          data_geracao: new Date().toISOString(),
          protocolo: protocoloDocumento
        });

      if (dbError) throw dbError;

      toast.success("Planilha consolidada gerada com sucesso!");
      
      // Chamar callback se fornecido
      if (onPlanilhaGerada) {
        onPlanilhaGerada();
      }
      
      // Fechar diálogo
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao gerar planilha:", error);
      toast.error("Erro ao gerar planilha consolidada");
    }
  };

  // Obter lista de TODOS os itens da cotação do state
  const itensUnicos = todosItens.sort((a, b) => a.numero_item - b.numero_item);

  // Obter lotes únicos de TODOS os itens
  const lotesUnicos = todosItens.length > 0 && criterioJulgamento === "por_lote"
    ? (() => {
        const lotesMap = new Map<string, any>();
        todosItens
          .filter((i: any) => i.lote_id)
          .forEach((i: any) => {
            if (!lotesMap.has(i.lote_id!)) {
              lotesMap.set(i.lote_id!, { 
                id: i.lote_id!, 
                numero: i.numero_lote || 0, 
                descricao: i.descricao_lote || ""
              });
            }
          });
        return Array.from(lotesMap.values()).sort((a, b) => a.numero - b.numero);
      })()
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
            {/* Campo "Tipo de Visualização" removido - usa automaticamente o critério de julgamento */}

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
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-semibold">Configurar Cálculo por Lote</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Aplicar para todos:</Label>
                    <Select 
                      value="" 
                      onValueChange={(v: "media" | "mediana" | "menor") => {
                        const novosCalculos: Record<string, "media" | "mediana" | "menor"> = {};
                        lotesUnicos.forEach(lote => {
                          novosCalculos[lote.id] = v;
                        });
                        setCalculosPorLote(novosCalculos);
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="menor">Menor Preço</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="mediana">Mediana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-semibold">Configurar Cálculo por Item</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Aplicar para todos:</Label>
                    <Select 
                      value="" 
                      onValueChange={(v: "media" | "mediana" | "menor") => {
                        const novosCalculos: Record<string, "media" | "mediana" | "menor"> = {};
                        todosItens.forEach((item: any) => {
                          const chave = `${item.lote_id || 'sem-lote'}_${item.id}`;
                          novosCalculos[chave] = v;
                        });
                        setCalculosPorItem(novosCalculos as any);
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="menor">Menor Preço</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="mediana">Mediana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {itensUnicos.map((item) => {
                  const chaveItem = `${item.lote_id || 'sem-lote'}_${item.id}`;
                  return (
                    <div key={chaveItem} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-sm">Item {item.numero_item}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{stripHtml(item.descricao)}</p>
                        {item.lote_id && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Lote {item.numero_lote}: {item.descricao_lote}
                          </p>
                        )}
                      </div>
                      <Select 
                        value={calculosPorItem[chaveItem] || "menor"} 
                        onValueChange={(v: "media" | "mediana" | "menor") => {
                          setCalculosPorItem(prev => ({ ...prev, [chaveItem]: v }));
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
                  );
                })}
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