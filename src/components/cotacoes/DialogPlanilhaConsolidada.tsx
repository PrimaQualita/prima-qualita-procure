// @ts-nocheck - Tabelas de planilhas podem não existir no schema atual
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from 'uuid';
import { gerarPlanilhaConsolidadaPDF } from "@/lib/gerarPlanilhaConsolidadaPDF";
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
    percentual_desconto?: number;
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

        // Buscar TODOS os itens em lotes de 1000 (escala automaticamente)
        console.log(`🔍 [Planilha] Buscando itens do fornecedor ${resposta.fornecedor.razao_social}...`);
        
        const itensData: any[] = [];
        let offset = 0;
        let hasMore = true;
        const BATCH_SIZE = 1000;
        
        while (hasMore) {
        const { data: batch, error: batchError } = await supabase
          .from("respostas_itens_fornecedor")
          .select(`
            valor_unitario_ofertado,
            percentual_desconto,
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
          .eq("cotacao_resposta_fornecedor_id", resposta.id)
          .range(offset, offset + BATCH_SIZE - 1);
          
          if (batchError) {
            console.error(`❌ [Planilha] Erro ao buscar lote:`, batchError);
            throw batchError;
          }
          
          if (batch && batch.length > 0) {
            itensData.push(...batch);
            console.log(`✅ [Planilha] Lote ${Math.floor(offset / BATCH_SIZE) + 1}: ${batch.length} itens carregados`);
          }
          
          hasMore = batch && batch.length === BATCH_SIZE;
          offset += BATCH_SIZE;
        }
        
        console.log(`✅ [Planilha] ${resposta.fornecedor.razao_social}: TOTAL ${itensData.length} itens`);
        console.log(`🏷️ Marcas encontradas:`, itensData?.map((i: any) => ({ item: i.item_cotacao.numero_item, marca: i.marca })));

        const itensFormatadosFornecedor = (itensData || []).map((item: any) => ({
          numero_item: item.item_cotacao.numero_item,
          descricao: item.item_cotacao.descricao,
          quantidade: item.item_cotacao.quantidade,
          unidade: item.item_cotacao.unidade,
          marca: item.marca,
          valor_unitario_ofertado: item.valor_unitario_ofertado,
          percentual_desconto: item.percentual_desconto,
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
    // Filtrar apenas valores verdadeiramente cotados (> 0)
    const valoresCotados = valores.filter(v => v > 0);
    
    if (valoresCotados.length === 0) return { media: 0, mediana: 0, menor: 0 };

    const menor = Math.min(...valoresCotados);
    const soma = valoresCotados.reduce((a, b) => a + b, 0);
    const media = Math.round((soma / valoresCotados.length) * 100) / 100; // Arredondar para 2 casas
    
    const valoresOrdenados = [...valoresCotados].sort((a, b) => a - b);
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
      
      toast.info("📄 Preparando planilha", {
        description: "Coletando dados da cotação...",
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Buscar usuário autenticado para certificação
      const { data: userData } = await supabase.auth.getUser();
      let usuarioNome = 'Sistema';
      let usuarioCpf = '';
      
      if (userData?.user?.id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('nome_completo, cpf')
          .eq('id', userData.user.id)
          .single();
        
        if (profileData) {
          usuarioNome = profileData.nome_completo || 'Sistema';
          usuarioCpf = profileData.cpf || '';
        }
      }
      
      // Buscar dados do processo e cotação
      const { data: cotacaoData } = await supabase
        .from('cotacoes_precos')
        .select(`
          titulo_cotacao,
          criterio_julgamento,
          processo_compra_id,
          processos_compras!inner (
            numero_processo_interno,
            objeto_resumido,
            tipo,
            criterio_julgamento
          )
        `)
        .eq('id', cotacaoId)
        .single();
      
      if (!cotacaoData) {
        throw new Error('Cotação não encontrada');
      }
      
      const processo = {
        numero: (cotacaoData as any).processos_compras.numero_processo_interno,
        objeto: (cotacaoData as any).processos_compras.objeto_resumido
      };
      
      const cotacao = {
        titulo_cotacao: cotacaoData.titulo_cotacao
      };
      
      // Pegar o critério de julgamento do processo ou cotação
      const criterioJulgamento = cotacaoData.criterio_julgamento || 
                                 (cotacaoData as any).processos_compras.criterio_julgamento;
      
      // Preparar dados das respostas filtradas
      const respostasFiltradas = respostas.filter(r => 
        empresasSelecionadas.has(r.fornecedor.razao_social)
      );
      
      const respostasFormatadas = respostasFiltradas.map(resposta => ({
        fornecedor: {
          razao_social: resposta.fornecedor.razao_social,
          cnpj: resposta.fornecedor.cnpj,
          email: resposta.fornecedor.email || ''
        },
        itens: resposta.itens.map(item => ({
          numero_item: item.numero_item,
          valor_unitario_ofertado: item.valor_unitario_ofertado,
          percentual_desconto: item.percentual_desconto,
          marca: item.marca || undefined,
          lote_numero: item.lote_numero
        })),
        valor_total: resposta.valor_total
      }));
      
      console.log('📦 Respostas formatadas para PDF:', JSON.stringify(respostasFormatadas, null, 2));
      
      // Preparar dados dos itens (campos de lote são numero_lote e descricao_lote em todosItens)
      const itensFormatados = todosItens.map(item => ({
        numero_item: item.numero_item,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        lote_numero: item.numero_lote,
        lote_descricao: item.descricao_lote
      }));
      
      // Gerar protocolo
      const timestamp = new Date().getTime();
      const protocoloNumerico = timestamp.toString().padStart(16, '0');
      const protocolo = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;
      
      const dadosProtocolo = {
        protocolo,
        usuario: {
          nome_completo: usuarioNome,
          cpf: usuarioCpf
        }
      };
      
      toast.info("📑 Gerando PDF de alta resolução", {
        description: "Usando jsPDF + autoTable...",
      });
      
      // Gerar PDF usando jsPDF + autoTable (alta resolução)
      // Montar mapeamento de critérios por item
      console.log('📋 calculosPorItem ORIGINAL:', calculosPorItem);
      console.log('📋 calculosPorLote ORIGINAL:', calculosPorLote);
      console.log('📋 Todas as chaves calculosPorItem:', Object.keys(calculosPorItem));
      console.log('📋 Todas as chaves calculosPorLote:', Object.keys(calculosPorLote));
      console.log('📋 todosItens:', todosItens.map(i => ({ id: i.id, numero_item: i.numero_item, lote_id: i.lote_id })));
      
      const criteriosPorItemNumero: Record<number, 'menor' | 'media' | 'mediana'> = {};
      
      // Se critério é por_lote, usar calculosPorLote; senão usar calculosPorItem
      todosItens.forEach((item: any) => {
        let criterio: 'menor' | 'media' | 'mediana' | undefined;
        
        if (criterioJulgamento === 'por_lote' && item.lote_id) {
          // Para critério por_lote, buscar pelo lote_id em calculosPorLote
          criterio = calculosPorLote[item.lote_id];
          console.log(`   Item ${item.numero_item} (Lote ${item.numero_lote}): lote_id="${item.lote_id}", critério do lote="${criterio}"`);
        } else {
          // Para outros critérios, buscar pela chave composta em calculosPorItem
          const chave = `${item.lote_id || 'sem-lote'}_${item.id}`;
          criterio = calculosPorItem[chave];
          console.log(`   Item ${item.numero_item}: chave="${chave}", critério encontrado="${criterio}"`);
        }
        
        if (criterio) {
          criteriosPorItemNumero[item.numero_item] = criterio;
          console.log(`   ✅ Mapeado: Item ${item.numero_item} = ${criterio}`);
        } else {
          console.log(`   ⚠️ Nenhum critério encontrado, usando 'menor' como padrão`);
          criteriosPorItemNumero[item.numero_item] = 'menor';
        }
      });
      
      console.log('📊 Critérios finais por item (número):', criteriosPorItemNumero);
      
      const resultado = await gerarPlanilhaConsolidadaPDF(
        processo,
        cotacao,
        itensFormatados,
        respostasFormatadas,
        dadosProtocolo,
        criteriosPorItemNumero,
        criterioJulgamento
      );
      
      const pdfBlob = resultado.blob;
      const estimativasCalculadas = resultado.estimativas;
      
      console.log('📊 Estimativas recebidas da geração do PDF:', estimativasCalculadas);
      console.log('📊 Tipo de estimativasCalculadas:', typeof estimativasCalculadas);
      console.log('📊 Chaves de estimativasCalculadas:', Object.keys(estimativasCalculadas));
      console.log('📊 Valores de estimativasCalculadas:', Object.values(estimativasCalculadas));
      
      toast.info("💾 Salvando planilha", {
        description: "Armazenando arquivo...",
      });
      
      // Função para converter número em romano
      const toRoman = (num: number): string => {
        const romanNumerals: [number, string][] = [
          [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
          [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
          [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
        ];
        let result = '';
        for (const [value, numeral] of romanNumerals) {
          while (num >= value) {
            result += numeral;
            num -= value;
          }
        }
        return result;
      };
      
      // Verificar quantas planilhas já existem para essa cotação
      const { data: planilhasExistentes } = await supabase
        .from("planilhas_consolidadas")
        .select("id")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: true });
      
      const numeroPlanilha = (planilhasExistentes?.length || 0) + 1;
      
      // Definir nome baseado na sequência
      let nomeArquivoBase: string;
      if (numeroPlanilha === 1) {
        nomeArquivoBase = "Planilha Consolidada";
      } else {
        nomeArquivoBase = `Planilha Consolidada ${toRoman(numeroPlanilha - 1)}`;
      }
      
      const nomeArquivo = `${nomeArquivoBase.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
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
      
      // Definir nome limpo para exibição (usado na gestão de storage)
      let nomeArquivoLimpo: string;
      if (numeroPlanilha === 1) {
        nomeArquivoLimpo = "Planilha Consolidada.pdf";
      } else {
        nomeArquivoLimpo = `Planilha Consolidada ${toRoman(numeroPlanilha - 1)}.pdf`;
      }
      
      // Buscar IDs dos fornecedores das respostas
      const { data: respostasCompletas } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id, fornecedor_id, fornecedores!inner(id, razao_social, cnpj, email)")
        .eq("cotacao_id", cotacaoId);
      
      // CRÍTICO: Buscar fornecedores inabilitados para excluí-los da identificação de vencedores
      const { data: fornecedoresInabilitados } = await supabase
        .from("fornecedores_rejeitados_cotacao")
        .select("fornecedor_id, itens_afetados")
        .eq("cotacao_id", cotacaoId)
        .eq("revertido", false);
      
      // Mapear fornecedores inabilitados globalmente (sem itens específicos)
      const fornecedoresInabilitadosGlobal = new Set<string>();
      fornecedoresInabilitados?.forEach(f => {
        const itensAfetados = f.itens_afetados as number[] | null;
        if (!itensAfetados || itensAfetados.length === 0) {
          fornecedoresInabilitadosGlobal.add(f.fornecedor_id);
        }
      });
      
      console.log(`📊 Fornecedores inabilitados globalmente: ${fornecedoresInabilitadosGlobal.size}`);
      
      // Criar estrutura completa de fornecedores com seus itens e vencedores
      // IMPORTANTE: Identificação de vencedores deve respeitar o critério de julgamento
      // PREÇOS PÚBLICOS DEVEM SER CONSIDERADOS na cotação
      
      const fornecedoresIncluidos = respostas
        .filter(r => empresasSelecionadas.has(r.fornecedor.razao_social))
        .map(resposta => {
          // Buscar o fornecedor_id da resposta completa
          const respostaCompleta = respostasCompletas?.find(rc => 
            (rc.fornecedores as any).cnpj === resposta.fornecedor.cnpj
          );
          
          let itensComVencedor;
          
          // TODOS os fornecedores selecionados participam da identificação de vencedores
          // EXCETO os que foram inabilitados globalmente
          const respostasFiltradas = respostas
            .filter(r => {
              if (!empresasSelecionadas.has(r.fornecedor.razao_social)) return false;
              
              // Verificar se o fornecedor está inabilitado globalmente
              const respostaFornecedor = respostasCompletas?.find(rc => 
                (rc.fornecedores as any).cnpj === r.fornecedor.cnpj
              );
              if (respostaFornecedor && fornecedoresInabilitadosGlobal.has(respostaFornecedor.fornecedor_id)) {
                return false;
              }
              
              return true;
            });
          
          console.log(`📊 Calculando vencedores com fornecedores válidos: ${respostasFiltradas.length}`);
          
          // Identificar vencedores baseado no critério de julgamento
          if (criterioJulgamento === "global") {
            // Critério GLOBAL: apenas um vencedor (menor valor total)
            const valoresTotal = respostasFiltradas.map(r => r.valor_total);
            const menorTotal = Math.min(...valoresTotal);
            const ehVencedorGlobal = Math.abs(resposta.valor_total - menorTotal) < 0.01;
            
            itensComVencedor = resposta.itens.map(item => ({
              numero_item: item.numero_item,
              valor_unitario: Number(item.valor_unitario_ofertado),
              lote_id: item.lote_id, // CRÍTICO: incluir lote_id para identificação por lote
              eh_vencedor: ehVencedorGlobal // Todos os itens herdam o status global
            }));
            
          } else if (criterioJulgamento === "por_lote") {
            // Critério POR LOTE: vencedor por lote (menor valor total do lote)
            const lotes = new Map<string, number>();
            
            // Calcular total por lote para cada fornecedor (apenas válidos)
            respostasFiltradas.forEach(r => {
              r.itens.forEach(item => {
                const loteId = item.lote_id || 'sem_lote';
                const valorAtual = lotes.get(`${r.fornecedor.cnpj}_${loteId}`) || 0;
                lotes.set(`${r.fornecedor.cnpj}_${loteId}`, valorAtual + (item.quantidade * Number(item.valor_unitario_ofertado)));
              });
            });
            
            // Para cada lote, identificar o menor valor
            const lotesVencedores = new Map<string, string>();
            respostasFiltradas.forEach(r => {
              const lotesDoFornecedor = new Set(r.itens.map(i => i.lote_id || 'sem_lote'));
              lotesDoFornecedor.forEach(loteId => {
                const valoresPorFornecedor: { cnpj: string; valor: number }[] = [];
                respostasFiltradas.forEach(rf => {
                  const valorLote = lotes.get(`${rf.fornecedor.cnpj}_${loteId}`) || 0;
                  if (valorLote > 0) {
                    valoresPorFornecedor.push({ cnpj: rf.fornecedor.cnpj, valor: valorLote });
                  }
                });
                
                if (valoresPorFornecedor.length > 0) {
                  const menorValor = Math.min(...valoresPorFornecedor.map(v => v.valor));
                  const vencedor = valoresPorFornecedor.find(v => Math.abs(v.valor - menorValor) < 0.01);
                  if (vencedor) {
                    lotesVencedores.set(loteId, vencedor.cnpj);
                  }
                }
              });
            });
            
            itensComVencedor = resposta.itens.map(item => {
              const loteId = item.lote_id || 'sem_lote';
              const cnpjVencedor = lotesVencedores.get(loteId);
              const ehVencedor = cnpjVencedor === resposta.fornecedor.cnpj;
              
              return {
                numero_item: item.numero_item,
                valor_unitario: Number(item.valor_unitario_ofertado),
                lote_id: item.lote_id, // CRÍTICO: incluir lote_id para identificação por lote
                eh_vencedor: ehVencedor
              };
            });
            
          } else if (criterioJulgamento === "desconto" || criterioJulgamento === "maior_percentual_desconto") {
            // Critério DESCONTO: vencedor por item (MAIOR percentual de desconto)
            itensComVencedor = resposta.itens.map(item => {
              const descontoAtual = Number(item.percentual_desconto || 0);
              
              // Buscar apenas descontos VERDADEIROS (> 0) deste item entre os fornecedores selecionados
              const descontosDoItem: number[] = [];
              respostasFiltradas.forEach(r => {
                const itemEncontrado = r.itens.find(i => i.numero_item === item.numero_item);
                if (itemEncontrado && itemEncontrado.percentual_desconto != null && Number(itemEncontrado.percentual_desconto) > 0) {
                  descontosDoItem.push(Number(itemEncontrado.percentual_desconto));
                }
              });
              
              // Se não há descontos cotados ou o desconto atual é zero, não é vencedor
              if (descontosDoItem.length === 0 || descontoAtual === 0) {
                console.log(`📊 Item ${item.numero_item} - Fornecedor ${resposta.fornecedor.cnpj}: desconto=${descontoAtual}%, vencedor=false (sem cotação válida)`);
                return {
                  numero_item: item.numero_item,
                  valor_unitario: Number(item.valor_unitario_ofertado),
                  percentual_desconto: descontoAtual,
                  lote_id: item.lote_id, // CRÍTICO: incluir lote_id
                  eh_vencedor: false
                };
              }
              
              // Identificar o MAIOR desconto (quanto maior, melhor)
              const maiorDesconto = Math.max(...descontosDoItem);
              const ehVencedor = Math.abs(descontoAtual - maiorDesconto) < 0.001;
              
              console.log(`📊 Item ${item.numero_item} - Fornecedor ${resposta.fornecedor.cnpj}: desconto=${descontoAtual}%, maior=${maiorDesconto}%, vencedor=${ehVencedor}`);
              
              return {
                numero_item: item.numero_item,
                valor_unitario: Number(item.valor_unitario_ofertado),
                percentual_desconto: descontoAtual,
                lote_id: item.lote_id, // CRÍTICO: incluir lote_id
                eh_vencedor: ehVencedor
              };
            });
            
          } else {
            // Critério POR ITEM (padrão): vencedor por item (menor valor unitário)
            itensComVencedor = resposta.itens.map(item => {
              const valorAtual = Number(item.valor_unitario_ofertado);
              
              // Buscar apenas valores VERDADEIROS (> 0) deste item entre os fornecedores selecionados
              const valoresDoItem: number[] = [];
              respostasFiltradas.forEach(r => {
                const itemEncontrado = r.itens.find(i => i.numero_item === item.numero_item);
                if (itemEncontrado && Number(itemEncontrado.valor_unitario_ofertado) > 0) {
                  valoresDoItem.push(Number(itemEncontrado.valor_unitario_ofertado));
                }
              });
              
              // Se não há valores cotados ou o valor atual é zero, não é vencedor
              if (valoresDoItem.length === 0 || valorAtual === 0) {
                return {
                  numero_item: item.numero_item,
                  valor_unitario: valorAtual,
                  lote_id: item.lote_id, // CRÍTICO: incluir lote_id
                  eh_vencedor: false
                };
              }
              
              // Identificar o menor valor
              const menorValor = Math.min(...valoresDoItem);
              const ehVencedor = Math.abs(valorAtual - menorValor) < 0.001;
              
              return {
                numero_item: item.numero_item,
                valor_unitario: valorAtual,
                lote_id: item.lote_id, // CRÍTICO: incluir lote_id para identificação por lote
                eh_vencedor: ehVencedor
              };
            });
          }
          
          return {
            fornecedor_id: respostaCompleta?.fornecedor_id || '',
            razao_social: resposta.fornecedor.razao_social,
            cnpj: resposta.fornecedor.cnpj,
            email: resposta.fornecedor.email,
            itens: itensComVencedor
          };
        });
      
      console.log("💾 Salvando planilha com estrutura completa:", fornecedoresIncluidos.length, "fornecedores");
      console.log("   Exemplo do primeiro fornecedor:", fornecedoresIncluidos[0]);
      console.log("💾 Estimativas que serão salvas no banco:", estimativasCalculadas);
      console.log("💾 JSON das estimativas:", JSON.stringify(estimativasCalculadas));
      
      console.log('💾 Tentando salvar no banco com dados:', {
        cotacao_id: cotacaoId,
        nome_arquivo: nomeArquivo,
        estimativas_itens: estimativasCalculadas
      });

      const { data: insertData, error: dbError } = await supabase
        .from("planilhas_consolidadas")
        .insert({
          cotacao_id: cotacaoId,
          nome_arquivo: nomeArquivoLimpo,
          url_arquivo: filePath,
          usuario_gerador_id: user?.id,
          data_geracao: new Date().toISOString(),
          protocolo: dadosProtocolo.protocolo,
          fornecedores_incluidos: fornecedoresIncluidos,
          estimativas_itens: estimativasCalculadas
        })
        .select();

      if (dbError) {
        console.error('❌ ERRO AO SALVAR PLANILHA NO BANCO:', dbError);
        console.error('❌ Detalhes do erro:', JSON.stringify(dbError));
        throw dbError;
      }
      
      console.log('✅ PLANILHA SALVA COM SUCESSO!');
      console.log('✅ Dados retornados do insert:', insertData);
      console.log('✅ Estimativas salvas:', insertData?.[0]?.estimativas_itens);

      // CRÍTICO: Invalidar todas as aprovações de documentos ao gerar nova planilha
      console.log("🔄 Invalidando aprovações anteriores de documentos...");
      
      // PRIMEIRO: Resetar campo documentos_aprovados da cotação
      const { error: resetApprovedError } = await supabase
        .from("cotacoes_precos")
        .update({ documentos_aprovados: {} })
        .eq("id", cotacaoId);
      
      if (resetApprovedError) {
        console.error("Erro ao resetar documentos aprovados:", resetApprovedError);
        toast.error("Atenção: Não foi possível limpar aprovações anteriores");
      } else {
        console.log("✅ Campo documentos_aprovados resetado");
      }
      
      // SEGUNDO: Buscar IDs dos campos antes de deletar
      const { data: campos } = await supabase
        .from("campos_documentos_finalizacao")
        .select("id")
        .eq("cotacao_id", cotacaoId);
      
      // TERCEIRO: Deletar documentos enviados pelos fornecedores
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

      // QUARTO: Deletar solicitações de documentos de finalizacao
      const { error: deleteError } = await supabase
        .from("campos_documentos_finalizacao")
        .delete()
        .eq("cotacao_id", cotacaoId);
      
      if (deleteError) {
        console.error("Erro ao limpar solicitações:", deleteError);
      } else {
        console.log("✅ Solicitações de documentos invalidadas");
      }

      console.log("✅ Todas as aprovações anteriores invalidadas com sucesso");

      toast.success("✅ Planilha gerada com sucesso!", {
        description: `${todosItens.length} itens processados. Protocolo: ${dadosProtocolo.protocolo.substring(0, 19)}...`,
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