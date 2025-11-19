// @ts-nocheck - Tabelas de planilhas podem não existir no schema atual
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from 'uuid';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { gerarHashDocumento } from './certificacaoDigital';
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
  const [loadingPlanilha, setLoadingPlanilha] = useState(false);
  // Usa automaticamente o critério de julgamento da cotação
  const tipoVisualizacao = criterioJulgamento === "por_lote" ? "lote" : criterioJulgamento === "global" ? "global" : "item";
  const [calculosPorItem, setCalculosPorItem] = useState<Record<string, "media" | "mediana" | "menor">>({});
  const [calculosPorLote, setCalculosPorLote] = useState<Record<string, "media" | "mediana" | "menor">>({});
  const [calculoGlobal, setCalculoGlobal] = useState<"media" | "mediana" | "menor">("menor");
  const [todosItens, setTodosItens] = useState<any[]>([]);
  const [tipoProcesso, setTipoProcesso] = useState<string>("");
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState<Set<string>>(new Set());

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

      // Buscar APENAS a análise de compliance mais recente
      const { data: analiseMaisRecente } = await supabase
        .from("analises_compliance" as any)
        .select("empresas_reprovadas")
        .eq("cotacao_id", cotacaoId)
        .order("data_analise", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cnpjsReprovados = new Set<string>();
      if (analiseMaisRecente?.empresas_reprovadas) {
        analiseMaisRecente.empresas_reprovadas.forEach((cnpj: string) => {
          cnpjsReprovados.add(cnpj);
        });
      }

      console.log("CNPJs reprovados na análise mais recente:", Array.from(cnpjsReprovados));

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
        const cnpjFornecedor = resposta.fornecedor?.cnpj || "";
        const foiReprovada = cnpjsReprovados.has(cnpjFornecedor);
        
        // FILTRAR empresas reprovadas na análise mais recente
        if (foiReprovada) {
          console.log(`Empresa ${resposta.fornecedor?.razao_social} (${cnpjFornecedor}) foi reprovada na análise mais recente - EXCLUÍDA da planilha`);
          continue; // Pula esta empresa
        }

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

        const itensFormatadosFornecedor = (itensData || []).map((item: any) => ({
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

        console.log(`✅ Itens formatados para ${resposta.fornecedor.razao_social}:`, itensFormatadosFornecedor);

        respostasCompletas.push({
          fornecedor: resposta.fornecedor as any,
          itens: itensFormatadosFornecedor,
          valor_total: resposta.valor_total_anual_ofertado,
          rejeitado: resposta.rejeitado || foiReprovada, // Marcar como rejeitada se foi reprovada antes
          motivo_rejeicao: resposta.motivo_rejeicao || (foiReprovada ? 'Reprovada em análise anterior' : undefined),
        });
      }

      setRespostas(respostasCompletas);
      
      // Inicializar apenas empresas NÃO reprovadas como selecionadas
      const empresasNaoRejeitadas = new Set(
        respostasCompletas
          .filter(r => !cnpjsReprovados.has(r.fornecedor.cnpj))
          .map(r => r.fornecedor.razao_social)
      );
      setEmpresasSelecionadas(empresasNaoRejeitadas);
      
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
      setLoadingPlanilha(true);
      
      // Feedback visual inicial
      toast.info("📄 Preparando planilha", {
        description: "Coletando dados da cotação...",
      });
      
      // Dar tempo para UI atualizar
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Gerar protocolo numérico no formato XXXX-XXXX-XXXX-XXXX
      const timestamp = new Date().getTime();
      const protocoloNumerico = timestamp.toString().padStart(16, '0');
      const protocoloDocumento = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;
      
      const dataHoraGeracao = new Date();
      const hashVerificacao = protocoloDocumento.replace(/-/g, '').substring(0, 32).toUpperCase();
      
      // Buscar informações do usuário que está gerando
      let usuarioNome = 'Sistema';
      let usuarioEmail = '';
      
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('Erro ao buscar usuário:', userError);
        } else if (userData?.user?.id) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('nome_completo, email')
            .eq('id', userData.user.id)
            .single();
          
          if (profileError) {
            console.error('Erro ao buscar perfil:', profileError);
          } else if (profileData) {
            usuarioNome = profileData.nome_completo || 'Sistema';
            usuarioEmail = profileData.email || '';
          }
        }
      } catch (error) {
        console.error('Erro na autenticação:', error);
      }
      
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

      // IMPORTANTE: Filtrar respostas pelas empresas selecionadas UMA VEZ, antes de qualquer uso
      const respostasFiltradas = respostas.filter(r => empresasSelecionadas.has(r.fornecedor.razao_social));

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
              ${respostasFiltradas.map(r => {
                  const isPrecosPublicos = r.fornecedor.cnpj === '00000000000000';
                  const cnpjFormatado = !isPrecosPublicos ? (r.fornecedor.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || '') : '';
                  return `
                  <th class="text-right empresa" colspan="2" style="font-size: 10px; padding: 8px; text-align: center; vertical-align: middle;">
                    <div style="margin-bottom: 4px;">${r.fornecedor.razao_social}</div>
                    ${!isPrecosPublicos ? `<div style="font-weight: normal; margin-bottom: 3px; font-size: 9px;">${cnpjFormatado}</div>` : ''}
                    ${!isPrecosPublicos ? `<div style="font-weight: normal; font-size: 9px;">${r.fornecedor.email || ''}</div>` : ''}
                  </th>
                `;
                }).join("")}
              <th class="text-right col-estimativa" rowspan="2">Estimativa</th>
            </tr>
            <tr>
              ${respostasFiltradas.map(() => `<th class="col-unid">Marca</th><th class="text-right empresa">Valor Unitário</th>`).join("")}
              </tr>`;
        } else {
          // Cabeçalho de uma linha para outros tipos
          html += `
              <tr>
                <th class="col-item">Item</th>
                <th class="col-descricao">Descrição</th>
                <th class="col-qtd">Qtd</th>
                <th class="col-unid">Unid</th>
                ${respostas.filter(r => empresasSelecionadas.has(r.fornecedor.razao_social)).map(r => {
                  const isPrecosPublicos = r.fornecedor.cnpj === '00000000000000';
                  return `
                  <th class="text-right empresa" style="font-size: 10px; padding: 4px;">
                    <div>${r.fornecedor.razao_social}</div>
                    ${!isPrecosPublicos ? `<div style="font-weight: normal; margin-top: 2px;">CNPJ: ${r.fornecedor.cnpj}</div>` : ''}
                    ${!isPrecosPublicos ? `<div style="font-weight: normal; margin-top: 2px;">${r.fornecedor.email}</div>` : ''}
                  </th>
                `}).join("")}
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
          
          respostasFiltradas.forEach(resposta => {
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

          
          respostasFiltradas.forEach(resposta => {
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

        const colspanTotal = tipoProcesso === "material" ? (4 + (respostasFiltradas.length * 2)) : (4 + respostasFiltradas.length);
        html += `
              <tr class="total">
                <td colspan="${colspanTotal}"><strong>VALOR TOTAL ESTIMADO</strong></td>
                <td class="text-right"><strong>${totalGeralEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
              </tr>
            </tbody>
          </table>
        `;

      } else if (tipoVisualizacao === "lote" && criterioJulgamento === "por_lote") {
        // Agrupar itens por lote APENAS das empresas selecionadas
        const lotes = new Map<string, any[]>();
        
        respostasFiltradas.forEach(resposta => {
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
              ${respostasFiltradas.map(r => {
                    const isPrecosPublicos = r.fornecedor.cnpj === '00000000000000';
                    const cnpjFormatado = !isPrecosPublicos ? (r.fornecedor.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || '') : '';
                    return `
                    <th class="text-right empresa" colspan="2" style="font-size: 10px; padding: 8px; text-align: center; vertical-align: middle;">
                      <div style="margin-bottom: 4px;">${r.fornecedor.razao_social}</div>
                      ${!isPrecosPublicos ? `<div style="font-weight: normal; margin-bottom: 3px; font-size: 9px;">${cnpjFormatado}</div>` : ''}
                      ${!isPrecosPublicos ? `<div style="font-weight: normal; font-size: 9px;">${r.fornecedor.email || ''}</div>` : ''}
                    </th>
                  `;
                  }).join("")}
              <th class="text-right col-estimativa" rowspan="2">Estimativa</th>
            </tr>
            <tr>
              ${respostasFiltradas.map(() => `<th class="col-unid">Marca</th><th class="text-right empresa">Valor Unitário</th>`).join("")}
                </tr>`;
            } else {
              // Cabeçalho de uma linha para outros tipos
              html += `
                <tr>
                  <th class="col-item">Item</th>
              <th class="col-descricao">Descrição</th>
              <th class="col-qtd">Qtd</th>
              <th class="col-unid">Unid</th>
              ${respostasFiltradas.map(r => {
                      const isPrecosPublicos = r.fornecedor.cnpj === '00000000000000';
                      const cnpjFormatado = !isPrecosPublicos ? (r.fornecedor.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || '') : '';
                      return `<th class="text-right empresa" style="font-size: 10px; padding: 8px; text-align: center; vertical-align: middle;"><div style="margin-bottom: 4px;">${r.fornecedor.razao_social}</div>${!isPrecosPublicos ? `<div style="font-weight: normal; margin-bottom: 3px; font-size: 9px;">${cnpjFormatado}</div>` : ''}${!isPrecosPublicos ? `<div style="font-weight: normal; font-size: 9px;">${r.fornecedor.email || ''}</div>` : ''}</th>`;
                    }).join("")}
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
                respostasFiltradas.forEach(resposta => {
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

                respostasFiltradas.forEach(resposta => {
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
                  <td colspan="${4 + (tipoProcesso === "material" ? respostasFiltradas.length * 2 : respostasFiltradas.length)}"><strong>TOTAL DO LOTE ${loteInfo.numero}</strong></td>
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
                  <td colspan="${4 + (tipoProcesso === "material" ? respostasFiltradas.length * 2 : respostasFiltradas.length)}"><strong>VALOR TOTAL ESTIMADO</strong></td>
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
              ${respostasFiltradas.map(r => {
                const isPrecosPublicos = r.fornecedor.cnpj === '00000000000000';
                const cnpjFormatado = !isPrecosPublicos ? (r.fornecedor.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || '') : '';
                return `<th class="text-right empresa" colspan="2" style="font-size: 10px; padding: 8px; text-align: center; vertical-align: middle;"><div style="margin-bottom: 4px;">${r.fornecedor.razao_social}</div>${!isPrecosPublicos ? `<div style="font-weight: normal; margin-bottom: 3px; font-size: 9px;">${cnpjFormatado}</div>` : ''}${!isPrecosPublicos ? `<div style="font-weight: normal; font-size: 9px;">${r.fornecedor.email || ''}</div>` : ''}</th>`;
              }).join("")}
              <th class="text-right col-estimativa" rowspan="2">Estimativa</th>
            </tr>
            <tr>
              ${respostasFiltradas.map(() => `<th class="col-unid">Marca</th><th class="text-right empresa">Valor Unitário</th>`).join("")}
            </tr>`;
          } else {
            // Cabeçalho de uma linha para outros tipos
            html += `
              <tr>
                <th class="col-item">Item</th>
                <th class="col-descricao">Descrição</th>
                <th class="col-qtd">Qtd</th>
              <th class="col-unid">Unid</th>
              ${respostasFiltradas.map(r => {
                const isPrecosPublicos = r.fornecedor.cnpj === '00000000000000';
                const cnpjFormatado = !isPrecosPublicos ? (r.fornecedor.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || '') : '';
                return `<th class="text-right empresa" style="font-size: 10px; padding: 4px;"><div>${r.fornecedor.razao_social}</div>${!isPrecosPublicos ? `<div style="font-weight: normal; margin-top: 2px; font-size: 9px;">${cnpjFormatado}</div>` : ''}${!isPrecosPublicos ? `<div style="font-weight: normal; margin-top: 2px; font-size: 9px;">${r.fornecedor.email || ''}</div>` : ''}</th>`;
              }).join("")}
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
            
            respostasFiltradas.forEach(resposta => {
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

            respostasFiltradas.forEach(resposta => {
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
              <td colspan="${4 + (tipoProcesso === "material" ? respostasFiltradas.length * 2 : respostasFiltradas.length)}"><strong>VALOR TOTAL ESTIMADO</strong></td>
              <td class="text-right"><strong>${totalGeralEstimativa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
            </tr>
          </tbody>
        </table>
      `;
      }

      // Adicionar certificação digital no final do documento
      const linkVerificacao = `${window.location.origin}/verificar-planilha?protocolo=${protocoloDocumento}`;
      
      html += `
          <div class="certificacao-digital" style="
            border: 2px solid #000;
            background-color: #f5f5f5;
            padding: 16px;
            margin: 20px 15px;
            page-break-inside: avoid;
          ">
            <h3 style="
              color: #00008B;
              font-size: 12px;
              font-weight: bold;
              text-align: center;
              margin: 0 0 10px 0;
              padding: 0;
            ">CERTIFICAÇÃO DIGITAL</h3>
            
            <div style="font-size: 10px; line-height: 1.6; color: #000;">
              <div style="margin-bottom: 5px;">
                <strong>Responsável:</strong> ${usuarioNome}
              </div>
              <div style="margin-bottom: 8px;">
                <strong>Protocolo:</strong> ${protocoloDocumento}
              </div>
              <div style="margin-bottom: 5px; font-weight: bold;">
                Verificar autenticidade em:
              </div>
              <div style="margin-bottom: 8px; word-break: break-all;">
                <a href="${linkVerificacao}" style="color: #0000FF; font-size: 9px;">${linkVerificacao}</a>
              </div>
              <div style="color: #505050; font-size: 8px; margin-top: 4px;">
                Este documento possui certificação digital conforme Lei 14.063/2020
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      // Feedback: Dados coletados
      toast.info("🎨 Preparando dados", {
        description: `Processando ${todosItens.length} itens...`,
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));

      // Usar jsPDF + autotable para geração robusta
      console.log(`📄 Gerando planilha com ${todosItens.length} itens usando jsPDF + autotable`);
      
      toast.info("📑 Gerando PDF", {
        description: "Gerando documento otimizado...",
      });

      const doc = new jsPDF({ 
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = 20;

      // Logo
      if (logoBase64) {
        try {
          doc.addImage(logoBase64, 'PNG', (pageWidth - 50) / 2, 10, 50, 12);
          y = 28;
        } catch (error) {
          console.error('Erro ao adicionar logo:', error);
        }
      }

      // Título
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(14, 165, 233);
      doc.text('PLANILHA CONSOLIDADA - ESTIMATIVA DE PREÇOS PARA SELEÇÃO', pageWidth / 2, y, { align: 'center' });
      y += 10;

      // Critério de julgamento
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(14, 165, 233);
      const criterioTexto = criterioJulgamento === "por_item" ? "Menor Valor por Item" :
                           criterioJulgamento === "global" ? "Menor Valor Global" : "Menor Valor por Lote";
      doc.rect(15, y - 5, 100, 8, 'F');
      doc.text(`Critério de Julgamento: ${criterioTexto}`, 17, y, { align: 'left' });
      y += 12;

      // Preparar colunas
      const colunas: any[] = [
        { header: 'Item', dataKey: 'item', width: 15 },
        { header: 'Descrição', dataKey: 'descricao', width: 60 },
        { header: 'Qtd', dataKey: 'quantidade', width: 15 },
        { header: 'Unid.', dataKey: 'unidade', width: 15 }
      ];

      // Adicionar colunas dos fornecedores
      respostasFiltradas.forEach((resposta, index) => {
        if (tipoProcesso === "material") {
          colunas.push({
            header: `${resposta.fornecedor.razao_social}\n${resposta.fornecedor.cnpj}\n${resposta.fornecedor.email || ''}`,
            dataKey: `marca_${index}`,
            width: 20
          });
          colunas.push({
            header: 'Valor',
            dataKey: `valor_${index}`,
            width: 25
          });
        } else {
          colunas.push({
            header: `${resposta.fornecedor.razao_social}\n${resposta.fornecedor.cnpj}\n${resposta.fornecedor.email || ''}`,
            dataKey: `valor_${index}`,
            width: 30
          });
        }
      });

      colunas.push({ header: 'Estimativa', dataKey: 'estimativa', width: 25 });

      // Preparar linhas
      const linhas: any[] = [];
      let totalGeralEstimativa = 0;

      todosItens.forEach(item => {
        const linha: any = {
          item: item.numero_item.toString(),
          descricao: stripHtml(item.descricao).substring(0, 100),
          quantidade: Number(item.quantidade).toLocaleString("pt-BR"),
          unidade: item.unidade
        };

        // Calcular valores dos fornecedores
        const valores: number[] = [];
        respostasFiltradas.forEach((resposta, index) => {
          const itemResposta = resposta.itens.find((i: any) => i.numero_item === item.numero_item);
          
          if (tipoProcesso === "material") {
            linha[`marca_${index}`] = itemResposta?.marca || "-";
          }
          
          if (itemResposta) {
            valores.push(Number(itemResposta.valor_unitario_ofertado));
            const valorTotal = Math.round(Number(itemResposta.valor_unitario_ofertado) * Number(item.quantidade) * 100) / 100;
            linha[`valor_${index}`] = `R$ ${Number(itemResposta.valor_unitario_ofertado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n(Total: R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
          } else {
            linha[`valor_${index}`] = "-";
          }
        });

        // Calcular estimativa
        if (valores.length > 0) {
          const stats = calcularEstatisticas(valores);
          const tipoCalculoItem = calculosPorItem[item.numero_item.toString()] || "menor";
          const valorEstimativa = stats[tipoCalculoItem];
          const totalItemEstimativa = Math.round(valorEstimativa * Number(item.quantidade) * 100) / 100;
          totalGeralEstimativa += totalItemEstimativa;
          linha.estimativa = `R$ ${valorEstimativa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n(Total: R$ ${totalItemEstimativa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
        } else {
          linha.estimativa = "-";
        }

        linhas.push(linha);
      });

      // Gerar tabela
      autoTable(doc, {
        columns: colunas,
        body: linhas,
        startY: y,
        theme: 'grid',
        styles: { 
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak',
          halign: 'center'
        },
        headStyles: { 
          fillColor: [14, 165, 233],
          textColor: 255,
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          item: { halign: 'center', cellWidth: 15 },
          descricao: { halign: 'left', cellWidth: 60 },
          quantidade: { halign: 'right', cellWidth: 15 },
          unidade: { halign: 'center', cellWidth: 15 }
        },
        didDrawPage: (data) => {
          // Rodapé em todas as páginas
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text('Prima Qualitá Saúde', pageWidth / 2, pageHeight - 10, { align: 'center' });
          doc.text('Travessa do Ouvidor, 21, Sala 503, Centro, Rio de Janeiro - RJ, CEP: 20.040-040', pageWidth / 2, pageHeight - 6, { align: 'center' });
        }
      });

      // Linha de total
      const finalY = (doc as any).lastAutoTable.finalY + 5;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`VALOR TOTAL ESTIMADO: R$ ${totalGeralEstimativa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 15, finalY, { align: 'right' });

      // Adicionar certificação digital
      const certY = finalY + 15;
      doc.setFillColor(240, 240, 240);
      doc.rect(15, certY, pageWidth - 30, 35, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(15, certY, pageWidth - 30, 35);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, certY + 7, { align: 'center' });
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Protocolo: ${protocoloDocumento}`, 20, certY + 14);
      doc.text(`Data/Hora: ${dataHoraGeracao.toLocaleString('pt-BR')}`, 20, certY + 19);
      doc.text(`Gerado por: ${usuarioNome}`, 20, certY + 24);
      doc.text(`Hash: ${hashVerificacao}`, 20, certY + 29);
      
      const linkVerificacao = `${window.location.origin}/verificar-planilha?protocolo=${protocoloDocumento}`;
      doc.setTextColor(14, 165, 233);
      doc.textWithLink('Verificar autenticidade', 20, certY + 34, { url: linkVerificacao });

      const pdfBlob = doc.output('blob');

      // Feedback: PDF gerado
      toast.info("💾 Salvando planilha", {
        description: "Armazenando arquivo...",
      });

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
      
      // Coletar CNPJs dos fornecedores incluídos na planilha (empresas selecionadas)
      const cnpjsIncluidos = respostas
        .filter(r => empresasSelecionadas.has(r.fornecedor.razao_social))
        .map(r => r.fornecedor.cnpj);
      
      console.log("💾 Salvando planilha com fornecedores incluídos:", cnpjsIncluidos);
      
      const { error: dbError } = await supabase
        .from("planilhas_consolidadas")
        .insert({
          cotacao_id: cotacaoId,
          nome_arquivo: nomeArquivo,
          url_arquivo: filePath,
          usuario_gerador_id: user?.id,
          data_geracao: new Date().toISOString(),
          protocolo: protocoloDocumento,
          fornecedores_incluidos: cnpjsIncluidos
        });

      if (dbError) throw dbError;

      // CRÍTICO: Invalidar todas as aprovações de documentos ao gerar nova planilha
      console.log("🔄 Invalidando aprovações anteriores de documentos...");
      
      // PRIMEIRO: Buscar IDs dos campos antes de deletar
      const { data: campos } = await supabase
        .from("campos_documentos_finalizacao")
        .select("id")
        .eq("cotacao_id", cotacaoId);
      
      // SEGUNDO: Deletar documentos enviados pelos fornecedores
      if (campos && campos.length > 0) {
        const campoIds = campos.map(c => c.id);
        const { error: deleteDocsError } = await supabase
          .from("documentos_finalizacao_fornecedor")
          .delete()
          .in("campo_documento_id", campoIds);
        
        if (deleteDocsError) {
          console.error("Erro ao limpar documentos enviados:", deleteDocsError);
        } else {
          console.log("✅ Documentos enviados por fornecedores invalidados");
        }
      }

      // TERCEIRO: Deletar solicitações de documentos de finalizacao
      const { error: deleteError } = await supabase
        .from("campos_documentos_finalizacao")
        .delete()
        .eq("cotacao_id", cotacaoId);
      
      if (deleteError) {
        console.error("Erro ao limpar aprovações:", deleteError);
        toast.error("Atenção: Não foi possível limpar aprovações anteriores");
      } else {
        console.log("✅ Solicitações de documentos invalidadas");
      }

      console.log("✅ Todas as aprovações anteriores invalidadas com sucesso");

      toast.success("✅ Planilha gerada com sucesso!", {
        description: `${todosItens.length} itens processados. Protocolo: ${protocoloDocumento.substring(0, 19)}...`,
      });
      
      // Chamar callback se fornecido
      if (onPlanilhaGerada) {
        onPlanilhaGerada();
      }
      
      // Fechar diálogo
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao gerar planilha:", error);
      toast.error("Erro ao gerar planilha", {
        description: "Por favor, tente novamente.",
      });
    } finally {
      setLoadingPlanilha(false);
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

            {/* Seleção de Empresas */}
            <div className="space-y-3 mt-6 p-4 border rounded-lg bg-muted/30">
              <Label className="text-base font-semibold">Selecionar Empresas para Planilha</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Marque as empresas que devem aparecer na planilha consolidada. Empresas reprovadas estão desmarcadas por padrão.
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {respostas.map((resposta, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 border rounded">
                    <input
                      type="checkbox"
                      id={`empresa-${idx}`}
                      checked={empresasSelecionadas.has(resposta.fornecedor.razao_social)}
                      onChange={(e) => {
                        const novaSelecao = new Set(empresasSelecionadas);
                        if (e.target.checked) {
                          novaSelecao.add(resposta.fornecedor.razao_social);
                        } else {
                          novaSelecao.delete(resposta.fornecedor.razao_social);
                        }
                        setEmpresasSelecionadas(novaSelecao);
                      }}
                      className="w-4 h-4"
                    />
                    <label htmlFor={`empresa-${idx}`} className="flex-1 cursor-pointer text-sm">
                      <span className="font-medium">{resposta.fornecedor.razao_social}</span>
                      {resposta.rejeitado && (
                        <span className="ml-2 text-xs text-red-600">(Reprovada)</span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        CNPJ: {resposta.fornecedor.cnpj}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 mt-4">
              <p className="text-sm text-muted-foreground">
                <strong>Empresas selecionadas:</strong> {empresasSelecionadas.size} de {respostas.length} fornecedor(es)
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Configure o tipo de cálculo e selecione as empresas antes de gerar a planilha.
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