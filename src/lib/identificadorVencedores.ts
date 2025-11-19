import { supabase } from "@/integrations/supabase/client";

interface Fornecedor {
  id: string;
  razao_social: string;
  email: string;
  cnpj?: string;
}

interface Resposta {
  id: string;
  fornecedor_id: string;
  valor_total_anual_ofertado: number;
  rejeitado: boolean;
  fornecedores: Fornecedor;
}

interface ItemResposta {
  id: string;
  cotacao_resposta_fornecedor_id: string;
  item_cotacao_id: string;
  valor_unitario_ofertado: number;
  percentual_desconto?: number;
  itens_cotacao: {
    numero_item: number;
    descricao: string;
    lote_id: string | null;
    quantidade: number;
    unidade: string;
  };
}

export async function identificarVencedoresPorCriterio(
  criterio: string,
  cotacaoId: string,
  respostas: Resposta[],
  itens: ItemResposta[]
): Promise<Fornecedor[]> {
  console.log(`🏆 [identificadorVencedores] Critério: ${criterio}`);
  console.log(`  → Total de respostas: ${respostas.length}`);
  console.log(`  → Total de itens: ${itens.length}`);

  // Buscar rejeições revertidas
  const { data: rejeicoesRevertidas } = await supabase
    .from('fornecedores_rejeitados_cotacao')
    .select('fornecedor_id')
    .eq('cotacao_id', cotacaoId)
    .eq('revertido', true);

  const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);

  // Filtrar respostas válidas (não rejeitadas OU revertidas)
  const respostasValidas = respostas.filter(r => !r.rejeitado || fornecedoresRevertidos.has(r.fornecedor_id));
  console.log(`  → Respostas válidas: ${respostasValidas.length}`);

  const fornecedoresVencedoresSet = new Set<string>();

  if (criterio === "global") {
    // MENOR VALOR GLOBAL: Um único vencedor com menor valor total
    if (respostasValidas.length > 0) {
      const menorValor = Math.min(...respostasValidas.map(r => Number(r.valor_total_anual_ofertado)));
      const vencedor = respostasValidas.find(r => Math.abs(Number(r.valor_total_anual_ofertado) - menorValor) < 0.01);
      if (vencedor) {
        console.log(`  ✅ Vencedor global: ${vencedor.fornecedores.razao_social}`);
        fornecedoresVencedoresSet.add(vencedor.fornecedor_id);
      }
    }
  } else if (criterio === "item" || criterio === "por_item") {
    // MENOR VALOR POR ITEM: Múltiplos vencedores possíveis (um por item)
    console.log(`  🔍 Analisando ${itens.length} itens para identificar vencedores por item`);
    
    // Agrupar itens por número
    const itensPorNumero: Record<number, ItemResposta[]> = {};
    
    itens.forEach(item => {
      const resposta = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
      // Incluir apenas respostas válidas
      if (resposta && (!resposta.rejeitado || fornecedoresRevertidos.has(resposta.fornecedor_id))) {
        const numItem = item.itens_cotacao.numero_item;
        if (!itensPorNumero[numItem]) {
          itensPorNumero[numItem] = [];
        }
        itensPorNumero[numItem].push(item);
      }
    });

    console.log(`  📊 Total de itens únicos: ${Object.keys(itensPorNumero).length}`);
    
    // Log dos primeiros 15 itens para debug
    const primeirosItens = Object.entries(itensPorNumero).slice(0, 15);
    console.log(`  📋 Detalhes dos primeiros 15 itens:`);
    primeirosItens.forEach(([num, itemsDoNum]) => {
      const valores = itemsDoNum.map(i => {
        const resp = respostas.find(r => r.id === i.cotacao_resposta_fornecedor_id);
        return {
          fornecedor: resp?.fornecedores.razao_social?.substring(0, 20),
          valor: Number(i.valor_unitario_ofertado).toFixed(3)
        };
      });
      console.log(`    Item ${num}: ${itemsDoNum.length} propostas →`, valores);
    });

    // Para cada item, encontrar o menor valor e identificar vencedor(es)
    Object.entries(itensPorNumero).forEach(([numItem, itensDoNumero]) => {
      if (itensDoNumero.length > 0) {
        const menorValor = Math.min(...itensDoNumero.map(i => Number(i.valor_unitario_ofertado)));
        
        // Encontrar todos os fornecedores com o menor valor (tolerância para empates)
        const vencedores = itensDoNumero.filter(i => 
          Math.abs(Number(i.valor_unitario_ofertado) - menorValor) < 0.001
        );
        
        vencedores.forEach(vencedor => {
          const resposta = respostas.find(r => r.id === vencedor.cotacao_resposta_fornecedor_id);
          if (resposta) {
            const jaAdicionado = fornecedoresVencedoresSet.has(resposta.fornecedor_id);
            fornecedoresVencedoresSet.add(resposta.fornecedor_id);
            
            if (!jaAdicionado && parseInt(numItem) <= 15) {
              console.log(`      ✅ Item ${numItem}: ${resposta.fornecedores.razao_social} com R$ ${menorValor.toFixed(3)}`);
            }
          }
        });
      }
    });

    console.log(`  ✅ Total de fornecedores vencedores: ${fornecedoresVencedoresSet.size}`);
  } else if (criterio === "lote" || criterio === "por_lote") {
    // MENOR VALOR POR LOTE: Múltiplos vencedores possíveis (um por lote)
    console.log(`  📊 Analisando lotes`);
    
    const itensPorLote: Record<string, ItemResposta[]> = {};
    
    itens.forEach(item => {
      const resposta = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
      if (resposta && (!resposta.rejeitado || fornecedoresRevertidos.has(resposta.fornecedor_id))) {
        const loteId = item.itens_cotacao.lote_id || 'sem_lote';
        if (!itensPorLote[loteId]) {
          itensPorLote[loteId] = [];
        }
        itensPorLote[loteId].push(item);
      }
    });

    // Para cada lote, calcular total por fornecedor e identificar vencedor
    Object.entries(itensPorLote).forEach(([loteId, itensDoLote]) => {
      const totaisPorFornecedor: Record<string, number> = {};
      
      itensDoLote.forEach(item => {
        const respostaId = item.cotacao_resposta_fornecedor_id;
        const resposta = respostas.find(r => r.id === respostaId);
        if (resposta) {
          const fornecedorId = resposta.fornecedor_id;
          const valorItem = Number(item.valor_unitario_ofertado) * item.itens_cotacao.quantidade;
          totaisPorFornecedor[fornecedorId] = (totaisPorFornecedor[fornecedorId] || 0) + valorItem;
        }
      });

      const menorTotal = Math.min(...Object.values(totaisPorFornecedor));
      Object.entries(totaisPorFornecedor).forEach(([fornecedorId, total]) => {
        if (Math.abs(total - menorTotal) < 0.01) {
          fornecedoresVencedoresSet.add(fornecedorId);
          const resp = respostas.find(r => r.fornecedor_id === fornecedorId);
          console.log(`    ✅ Lote ${loteId}: ${resp?.fornecedores.razao_social} com R$ ${total.toFixed(2)}`);
        }
      });
    });
  } else if (criterio === "desconto") {
    // MAIOR PERCENTUAL DE DESCONTO: Múltiplos vencedores possíveis (um por item)
    console.log(`  🔍 Analisando descontos por item`);
    
    const itensPorNumero: Record<number, ItemResposta[]> = {};
    
    itens.forEach(item => {
      const resposta = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
      if (resposta && (!resposta.rejeitado || fornecedoresRevertidos.has(resposta.fornecedor_id))) {
        const numItem = item.itens_cotacao.numero_item;
        if (!itensPorNumero[numItem]) {
          itensPorNumero[numItem] = [];
        }
        itensPorNumero[numItem].push(item);
      }
    });

    // Para cada item, encontrar o maior desconto
    Object.entries(itensPorNumero).forEach(([numItem, itensDoNumero]) => {
      if (itensDoNumero.length > 0) {
        const maiorDesconto = Math.max(...itensDoNumero.map(i => Number(i.percentual_desconto || 0)));
        const vencedores = itensDoNumero.filter(i => 
          Math.abs(Number(i.percentual_desconto || 0) - maiorDesconto) < 0.01
        );
        
        vencedores.forEach(vencedor => {
          const resposta = respostas.find(r => r.id === vencedor.cotacao_resposta_fornecedor_id);
          if (resposta) {
            fornecedoresVencedoresSet.add(resposta.fornecedor_id);
            if (parseInt(numItem) <= 15) {
              console.log(`      ✅ Item ${numItem}: ${resposta.fornecedores.razao_social} com ${maiorDesconto}%`);
            }
          }
        });
      }
    });
  }

  // Converter Set em array de objetos Fornecedor
  const fornecedoresVencedores = Array.from(fornecedoresVencedoresSet).map(id => {
    const resposta = respostas.find(r => r.fornecedor_id === id);
    return resposta?.fornecedores;
  }).filter(Boolean) as Fornecedor[];

  console.log(`  🏆 Fornecedores vencedores finais: ${fornecedoresVencedores.length}`);
  fornecedoresVencedores.forEach(f => console.log(`    - ${f.razao_social}`));

  return fornecedoresVencedores;
}

export async function carregarItensVencedoresPorFornecedor(
  fornecedorId: string,
  criterio: string,
  cotacaoId: string,
  respostas: Resposta[],
  todosItens: ItemResposta[]
): Promise<ItemResposta[]> {
  console.log(`🔍 [carregarItensVencedores] Fornecedor: ${fornecedorId}, Critério: ${criterio}`);
  
  const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
  if (!resposta) {
    console.log(`  ❌ Resposta não encontrada`);
    return [];
  }

  const itensDoFornecedor = todosItens.filter(i => i.cotacao_resposta_fornecedor_id === resposta.id);
  console.log(`  → Itens deste fornecedor: ${itensDoFornecedor.length}`);

  // Buscar rejeições revertidas
  const { data: rejeicoesRevertidas } = await supabase
    .from('fornecedores_rejeitados_cotacao')
    .select('fornecedor_id')
    .eq('cotacao_id', cotacaoId)
    .eq('revertido', true);

  const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);
  
  // Filtrar apenas itens de respostas válidas
  const itensValidos = todosItens.filter(item => {
    const resp = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
    return resp && (!resp.rejeitado || fornecedoresRevertidos.has(resp.fornecedor_id));
  });

  console.log(`  → Total de itens válidos de todos fornecedores: ${itensValidos.length}`);

  const itensVencidos: ItemResposta[] = [];

  if (criterio === "global") {
    // Se vencedor global, todos os itens são dele
    const menorValor = Math.min(...respostas
      .filter(r => !r.rejeitado || fornecedoresRevertidos.has(r.fornecedor_id))
      .map(r => Number(r.valor_total_anual_ofertado))
    );
    
    if (Math.abs(Number(resposta.valor_total_anual_ofertado) - menorValor) < 0.01) {
      itensVencidos.push(...itensDoFornecedor);
      console.log(`  ✅ Vencedor global - todos os ${itensDoFornecedor.length} itens`);
    }
  } else if (criterio === "item" || criterio === "por_item") {
    // Para cada item do fornecedor, verificar se tem menor valor
    console.log(`  🔍 Verificando item por item`);
    
    let contadorVencidos = 0;
    itensDoFornecedor.forEach(itemFornecedor => {
      const numeroItem = itemFornecedor.itens_cotacao.numero_item;
      const valorFornecedor = Number(itemFornecedor.valor_unitario_ofertado);
      
      // Buscar todas as propostas para este item específico
      const propostasDoItem = itensValidos.filter(i => i.itens_cotacao.numero_item === numeroItem);
      
      if (propostasDoItem.length > 0) {
        const menorValor = Math.min(...propostasDoItem.map(i => Number(i.valor_unitario_ofertado)));
        const ehVencedor = Math.abs(valorFornecedor - menorValor) < 0.001;
        
        if (numeroItem <= 15) {
          const nomesComValores = propostasDoItem.map(i => {
            const r = respostas.find(resp => resp.id === i.cotacao_resposta_fornecedor_id);
            return `${r?.fornecedores.razao_social?.substring(0, 15)}:${Number(i.valor_unitario_ofertado).toFixed(3)}`;
          });
          console.log(`    Item ${numeroItem}: [${nomesComValores.join(', ')}] → Menor: ${menorValor.toFixed(3)} → Vencedor? ${ehVencedor ? '✅' : '❌'}`);
        }
        
        if (ehVencedor) {
          itensVencidos.push(itemFornecedor);
          contadorVencidos++;
        }
      }
    });
    
    console.log(`  ✅ Total de itens vencidos: ${contadorVencidos}`);
  } else if (criterio === "lote" || criterio === "por_lote") {
    // Agrupar itens por lote e calcular totais
    const lotesFornecedor: Record<string, ItemResposta[]> = {};
    itensDoFornecedor.forEach(item => {
      const loteId = item.itens_cotacao.lote_id || 'sem_lote';
      if (!lotesFornecedor[loteId]) lotesFornecedor[loteId] = [];
      lotesFornecedor[loteId].push(item);
    });

    // Para cada lote do fornecedor
    Object.entries(lotesFornecedor).forEach(([loteId, itensDoLote]) => {
      // Calcular total do fornecedor neste lote
      const totalFornecedor = itensDoLote.reduce((sum, item) => 
        sum + (Number(item.valor_unitario_ofertado) * item.itens_cotacao.quantidade), 0
      );

      // Calcular totais de TODOS os fornecedores neste lote
      const todosItensDoLote = itensValidos.filter(i => 
        (i.itens_cotacao.lote_id || 'sem_lote') === loteId
      );
      
      const totaisPorFornecedor: Record<string, number> = {};
      todosItensDoLote.forEach(item => {
        const resp = respostas.find(r => r.id === item.cotacao_resposta_fornecedor_id);
        if (resp) {
          const valor = Number(item.valor_unitario_ofertado) * item.itens_cotacao.quantidade;
          totaisPorFornecedor[resp.fornecedor_id] = (totaisPorFornecedor[resp.fornecedor_id] || 0) + valor;
        }
      });

      const menorTotal = Math.min(...Object.values(totaisPorFornecedor));
      if (Math.abs(totalFornecedor - menorTotal) < 0.01) {
        itensVencidos.push(...itensDoLote);
        console.log(`    ✅ Lote ${loteId} vencido com R$ ${totalFornecedor.toFixed(2)}`);
      }
    });
  } else if (criterio === "desconto") {
    // MAIOR PERCENTUAL DE DESCONTO: Múltiplos vencedores possíveis (um por item)
    console.log(`  🔍 Verificando descontos item por item`);
    
    itensDoFornecedor.forEach(itemFornecedor => {
      const numeroItem = itemFornecedor.itens_cotacao.numero_item;
      const descontoFornecedor = Number(itemFornecedor.percentual_desconto || 0);
      
      const propostasDoItem = itensValidos.filter(i => i.itens_cotacao.numero_item === numeroItem);
      
      if (propostasDoItem.length > 0) {
        const maiorDesconto = Math.max(...propostasDoItem.map(i => Number(i.percentual_desconto || 0)));
        const ehVencedor = Math.abs(descontoFornecedor - maiorDesconto) < 0.01;
        
        if (ehVencedor) {
          itensVencidos.push(itemFornecedor);
        }
      }
    });
    
    console.log(`  ✅ Total de itens vencidos: ${itensVencidos.length}`);
  }

  return itensVencidos;
}
