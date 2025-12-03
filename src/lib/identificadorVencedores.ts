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

interface FornecedorPlanilha {
  fornecedor_id: string;
  razao_social: string;
  cnpj: string;
  email: string;
  itens: Array<{
    numero_item: number;
    valor_unitario: number;
    percentual_desconto?: number;
    eh_vencedor?: boolean;
  }>;
}

export async function identificarVencedoresPorCriterio(
  criterio: string,
  cotacaoId: string,
  respostas: Resposta[],
  itens: ItemResposta[]
): Promise<Fornecedor[]> {
  console.log(`🏆 [identificadorVencedores] Identificando vencedores com RECÁLCULO DINÂMICO`);
  console.log(`  → Cotação ID: ${cotacaoId}`);
  console.log(`  → Critério: ${criterio}`);

  // Buscar a última planilha consolidada gerada para esta cotação
  const { data: planilha, error } = await supabase
    .from('planilhas_consolidadas')
    .select('fornecedores_incluidos')
    .eq('cotacao_id', cotacaoId)
    .order('data_geracao', { ascending: false })
    .limit(1)
    .single();

  if (error || !planilha) {
    console.log(`  ❌ Nenhuma planilha consolidada encontrada`);
    return [];
  }

  console.log(`  ✅ Planilha consolidada encontrada`);
  
  const fornecedoresPlanilha = planilha.fornecedores_incluidos as unknown as FornecedorPlanilha[];
  console.log(`  → Total de fornecedores na planilha: ${fornecedoresPlanilha?.length || 0}`);

  if (!fornecedoresPlanilha || fornecedoresPlanilha.length === 0) {
    return [];
  }

  // Buscar rejeições ativas E revertidas
  const { data: rejeicoesAtivas } = await supabase
    .from('fornecedores_rejeitados_cotacao')
    .select('fornecedor_id, itens_afetados')
    .eq('cotacao_id', cotacaoId)
    .eq('revertido', false);

  const { data: rejeicoesRevertidas } = await supabase
    .from('fornecedores_rejeitados_cotacao')
    .select('fornecedor_id')
    .eq('cotacao_id', cotacaoId)
    .eq('revertido', true);

  // Mapear fornecedores rejeitados globalmente (sem itens específicos ou todos os itens)
  const fornecedoresRejeitadosGlobal = new Set<string>();
  // Mapear itens rejeitados por fornecedor
  const itensRejeitadosPorFornecedor = new Map<string, Set<number>>();
  
  rejeicoesAtivas?.forEach(r => {
    const itensAfetados = r.itens_afetados as number[] | null;
    if (!itensAfetados || itensAfetados.length === 0) {
      // Rejeição global (todos os itens)
      fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
    } else {
      // Rejeição por itens específicos
      if (!itensRejeitadosPorFornecedor.has(r.fornecedor_id)) {
        itensRejeitadosPorFornecedor.set(r.fornecedor_id, new Set());
      }
      itensAfetados.forEach(item => itensRejeitadosPorFornecedor.get(r.fornecedor_id)!.add(item));
    }
  });
  
  const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);

  console.log(`  → Fornecedores rejeitados globalmente: ${fornecedoresRejeitadosGlobal.size}`);
  console.log(`  → Fornecedores com rejeição por item: ${itensRejeitadosPorFornecedor.size}`);
  console.log(`  → Fornecedores com rejeição revertida: ${fornecedoresRevertidos.size}`);

  // CRÍTICO: Identificar CNPJs de preços públicos (sequenciais)
  const ehPrecoPublico = (cnpj: string) => {
    if (!cnpj) return false;
    const primeiroDigito = cnpj.charAt(0);
    return cnpj.split('').every(d => d === primeiroDigito);
  };

  // Separar fornecedores válidos (não rejeitados globalmente, não preço público)
  // Fornecedores com rejeição por item são considerados válidos mas serão filtrados por item
  const fornecedoresValidos = fornecedoresPlanilha.filter(f => {
    const resposta = respostas.find(r => r.fornecedor_id === f.fornecedor_id);
    const estaRejeitado = resposta?.rejeitado && !fornecedoresRevertidos.has(f.fornecedor_id);
    const rejeitadoGlobalNoBanco = fornecedoresRejeitadosGlobal.has(f.fornecedor_id);
    
    // Se tem rejeição apenas por itens específicos, ainda é válido para outros itens
    const temRejeicaoParcial = itensRejeitadosPorFornecedor.has(f.fornecedor_id);
    
    return (!estaRejeitado && !rejeitadoGlobalNoBanco) || temRejeicaoParcial && !ehPrecoPublico(f.cnpj);
  });

  console.log(`  → Fornecedores válidos para cálculo: ${fornecedoresValidos.length}`);

  // ============================================================
  // RECÁLCULO DINÂMICO DOS VENCEDORES
  // ============================================================
  const fornecedoresVencedoresSet = new Set<string>();

  // Mapear todos os itens únicos
  const numerosItensUnicos = new Set<number>();
  fornecedoresValidos.forEach(f => {
    f.itens.forEach(item => numerosItensUnicos.add(item.numero_item));
  });

  console.log(`  → Total de itens únicos: ${numerosItensUnicos.size}`);

  if (criterio === "global") {
    // GLOBAL: menor valor total vence TODOS os itens
    let menorTotal = Infinity;
    let fornecedorVencedor: FornecedorPlanilha | null = null;

    fornecedoresValidos.forEach(f => {
      const valorTotal = f.itens.reduce((sum, item) => {
        const itemOriginal = itens.find(i => 
          i.itens_cotacao.numero_item === item.numero_item &&
          respostas.find(r => r.id === i.cotacao_resposta_fornecedor_id)?.fornecedor_id === f.fornecedor_id
        );
        const quantidade = itemOriginal?.itens_cotacao.quantidade || 1;
        return sum + (item.valor_unitario * quantidade);
      }, 0);

      console.log(`    → ${f.razao_social}: Total R$ ${valorTotal.toFixed(2)}`);

      if (valorTotal > 0 && valorTotal < menorTotal) {
        menorTotal = valorTotal;
        fornecedorVencedor = f;
      }
    });

    if (fornecedorVencedor) {
      fornecedoresVencedoresSet.add(fornecedorVencedor.fornecedor_id);
      console.log(`  ✅ Vencedor GLOBAL: ${fornecedorVencedor.razao_social}`);
    }

  } else if (criterio === "desconto" || criterio === "maior_percentual_desconto") {
    // DESCONTO: maior percentual por item vence
    numerosItensUnicos.forEach(numeroItem => {
      let maiorDesconto = -1;
      let fornecedorVencedor: FornecedorPlanilha | null = null;

      fornecedoresValidos.forEach(f => {
        const item = f.itens.find(i => i.numero_item === numeroItem);
        const desconto = item?.percentual_desconto || 0;

        if (desconto > 0 && desconto > maiorDesconto) {
          maiorDesconto = desconto;
          fornecedorVencedor = f;
        }
      });

      if (fornecedorVencedor) {
        fornecedoresVencedoresSet.add(fornecedorVencedor.fornecedor_id);
        console.log(`    Item ${numeroItem}: ${fornecedorVencedor.razao_social} (${maiorDesconto.toFixed(2)}%)`);
      }
    });

  } else if (criterio === "por_lote" || criterio === "lote") {
    // POR LOTE: menor valor total do lote - usa item_cotacao_id para identificação correta
    // Primeiro, identificar todos os lotes únicos a partir dos itens originais
    const lotesUnicos = new Set<string>();
    itens.forEach(item => {
      if (item.itens_cotacao.lote_id) {
        lotesUnicos.add(item.itens_cotacao.lote_id);
      }
    });

    console.log(`  → Lotes únicos encontrados: ${lotesUnicos.size}`);

    lotesUnicos.forEach(loteId => {
      let menorTotalLote = Infinity;
      let fornecedorVencedor: FornecedorPlanilha | null = null;

      // Para cada fornecedor válido, calcular o valor total do lote
      fornecedoresValidos.forEach(f => {
        // Verificar se está rejeitado globalmente
        if (fornecedoresRejeitadosGlobal.has(f.fornecedor_id)) return;
        
        // Buscar a resposta do fornecedor
        const resposta = respostas.find(r => r.fornecedor_id === f.fornecedor_id);
        if (!resposta) return;

        // Buscar todos os itens do fornecedor que pertencem a este lote
        const itensDoFornecedorNoLote = itens.filter(item => 
          item.itens_cotacao.lote_id === loteId &&
          item.cotacao_resposta_fornecedor_id === resposta.id
        );

        if (itensDoFornecedorNoLote.length === 0) return;

        // Calcular valor total do lote para este fornecedor
        const totalLote = itensDoFornecedorNoLote.reduce((sum, item) => {
          const quantidade = item.itens_cotacao.quantidade || 1;
          const valorUnitario = item.valor_unitario_ofertado || 0;
          return sum + (valorUnitario * quantidade);
        }, 0);

        console.log(`    → ${f.razao_social} - Lote ${loteId}: R$ ${totalLote.toFixed(2)} (${itensDoFornecedorNoLote.length} itens)`);

        if (totalLote > 0 && totalLote < menorTotalLote) {
          menorTotalLote = totalLote;
          fornecedorVencedor = f;
        }
      });

      if (fornecedorVencedor) {
        fornecedoresVencedoresSet.add(fornecedorVencedor.fornecedor_id);
        console.log(`  ✅ Vencedor Lote ${loteId}: ${fornecedorVencedor.razao_social} (R$ ${menorTotalLote.toFixed(2)})`);
      }
    });

  } else {
  // POR ITEM (padrão): menor valor unitário por item vence
    numerosItensUnicos.forEach(numeroItem => {
      let menorValor = Infinity;
      let fornecedorVencedor: FornecedorPlanilha | null = null;

      fornecedoresValidos.forEach(f => {
        // Verificar se fornecedor está rejeitado neste item específico
        const itensRejeitados = itensRejeitadosPorFornecedor.get(f.fornecedor_id);
        if (itensRejeitados?.has(numeroItem)) return;
        if (fornecedoresRejeitadosGlobal.has(f.fornecedor_id)) return;
        
        const item = f.itens.find(i => i.numero_item === numeroItem);
        const valor = item?.valor_unitario || 0;

        if (valor > 0 && valor < menorValor) {
          menorValor = valor;
          fornecedorVencedor = f;
        }
      });

      if (fornecedorVencedor) {
        fornecedoresVencedoresSet.add(fornecedorVencedor.fornecedor_id);
        console.log(`    Item ${numeroItem}: ${fornecedorVencedor.razao_social} (R$ ${menorValor.toFixed(2)})`);
      }
    });
  }

  // Converter Set em array de objetos Fornecedor
  const fornecedoresVencedores = Array.from(fornecedoresVencedoresSet).map(id => {
    const resposta = respostas.find(r => r.fornecedor_id === id);
    return resposta?.fornecedores;
  }).filter(Boolean) as Fornecedor[];

  console.log(`  🏆 Total de fornecedores vencedores: ${fornecedoresVencedores.length}`);
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
  console.log(`🔍 [carregarItensVencedores] RECÁLCULO DINÂMICO para fornecedor ${fornecedorId}`);
  
  // Buscar a última planilha consolidada
  const { data: planilha, error } = await supabase
    .from('planilhas_consolidadas')
    .select('fornecedores_incluidos')
    .eq('cotacao_id', cotacaoId)
    .order('data_geracao', { ascending: false })
    .limit(1)
    .single();

  if (error || !planilha) {
    console.log(`  ❌ Nenhuma planilha consolidada encontrada`);
    return [];
  }

  const fornecedoresPlanilha = planilha.fornecedores_incluidos as unknown as FornecedorPlanilha[];

  // Buscar rejeições ativas E revertidas
  const { data: rejeicoesAtivas } = await supabase
    .from('fornecedores_rejeitados_cotacao')
    .select('fornecedor_id, itens_afetados')
    .eq('cotacao_id', cotacaoId)
    .eq('revertido', false);

  const { data: rejeicoesRevertidas } = await supabase
    .from('fornecedores_rejeitados_cotacao')
    .select('fornecedor_id')
    .eq('cotacao_id', cotacaoId)
    .eq('revertido', true);

  // Mapear fornecedores rejeitados globalmente (sem itens específicos)
  const fornecedoresRejeitadosGlobal = new Set<string>();
  // Mapear itens rejeitados por fornecedor
  const itensRejeitadosPorFornecedor = new Map<string, Set<number>>();
  
  rejeicoesAtivas?.forEach(r => {
    const itensAfetados = r.itens_afetados as number[] | null;
    if (!itensAfetados || itensAfetados.length === 0) {
      // Rejeição global (todos os itens)
      fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
    } else {
      // Rejeição por itens específicos
      if (!itensRejeitadosPorFornecedor.has(r.fornecedor_id)) {
        itensRejeitadosPorFornecedor.set(r.fornecedor_id, new Set());
      }
      itensAfetados.forEach(item => itensRejeitadosPorFornecedor.get(r.fornecedor_id)!.add(item));
    }
  });

  const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);

  // CRÍTICO: Identificar CNPJs de preços públicos
  const ehPrecoPublico = (cnpj: string) => {
    if (!cnpj) return false;
    const primeiroDigito = cnpj.charAt(0);
    return cnpj.split('').every(d => d === primeiroDigito);
  };

  // Fornecedores válidos (não rejeitados globalmente, mas podem ter rejeição por item)
  const fornecedoresValidos = fornecedoresPlanilha.filter(f => {
    const resposta = respostas.find(r => r.fornecedor_id === f.fornecedor_id);
    const estaRejeitado = resposta?.rejeitado && !fornecedoresRevertidos.has(f.fornecedor_id);
    const rejeitadoGlobalNoBanco = fornecedoresRejeitadosGlobal.has(f.fornecedor_id);
    
    // Se tem rejeição apenas por itens específicos, ainda é válido para outros itens
    const temRejeicaoParcial = itensRejeitadosPorFornecedor.has(f.fornecedor_id);
    
    return (!estaRejeitado && !rejeitadoGlobalNoBanco) || temRejeicaoParcial && !ehPrecoPublico(f.cnpj);
  });

  const fornecedorAtual = fornecedoresPlanilha.find(f => f.fornecedor_id === fornecedorId);
  if (!fornecedorAtual) {
    console.log(`  ❌ Fornecedor não encontrado na planilha`);
    return [];
  }

  // Verificar se o fornecedor atual está válido
  const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
  if (!resposta) {
    console.log(`  ❌ Resposta não encontrada`);
    return [];
  }

  // ============================================================
  // RECÁLCULO DINÂMICO DOS ITENS VENCEDORES PARA ESTE FORNECEDOR
  // ============================================================
  const numerosItensVencedores = new Set<number>();

  // Mapear todos os itens únicos
  const numerosItensUnicos = new Set<number>();
  fornecedoresValidos.forEach(f => {
    f.itens.forEach(item => numerosItensUnicos.add(item.numero_item));
  });

  if (criterio === "global") {
    // GLOBAL: se este fornecedor tem menor total, todos os itens são dele
    let menorTotal = Infinity;
    let fornecedorVencedorId: string | null = null;

    fornecedoresValidos.forEach(f => {
      const valorTotal = f.itens.reduce((sum, item) => {
        const itemOriginal = todosItens.find(i => 
          i.itens_cotacao.numero_item === item.numero_item &&
          respostas.find(r => r.id === i.cotacao_resposta_fornecedor_id)?.fornecedor_id === f.fornecedor_id
        );
        const quantidade = itemOriginal?.itens_cotacao.quantidade || 1;
        return sum + (item.valor_unitario * quantidade);
      }, 0);

      if (valorTotal > 0 && valorTotal < menorTotal) {
        menorTotal = valorTotal;
        fornecedorVencedorId = f.fornecedor_id;
      }
    });

    if (fornecedorVencedorId === fornecedorId) {
      fornecedorAtual.itens.forEach(item => numerosItensVencedores.add(item.numero_item));
    }

  } else if (criterio === "desconto" || criterio === "maior_percentual_desconto") {
    // DESCONTO: maior percentual por item
    numerosItensUnicos.forEach(numeroItem => {
      let maiorDesconto = -1;
      let fornecedorVencedorId: string | null = null;

      fornecedoresValidos.forEach(f => {
        // Verificar se fornecedor está rejeitado neste item específico
        const itensRejeitados = itensRejeitadosPorFornecedor.get(f.fornecedor_id);
        if (itensRejeitados?.has(numeroItem)) return;
        if (fornecedoresRejeitadosGlobal.has(f.fornecedor_id)) return;
        
        const item = f.itens.find(i => i.numero_item === numeroItem);
        const desconto = item?.percentual_desconto || 0;

        if (desconto > 0 && desconto > maiorDesconto) {
          maiorDesconto = desconto;
          fornecedorVencedorId = f.fornecedor_id;
        }
      });

      if (fornecedorVencedorId === fornecedorId) {
        numerosItensVencedores.add(numeroItem);
      }
    });

  } else if (criterio === "por_lote" || criterio === "lote") {
    // POR LOTE: menor valor total do lote - usa dados diretos das respostas
    // Primeiro, identificar todos os lotes únicos a partir dos itens originais
    const lotesUnicos = new Set<string>();
    todosItens.forEach(item => {
      if (item.itens_cotacao.lote_id) {
        lotesUnicos.add(item.itens_cotacao.lote_id);
      }
    });

    console.log(`  → Lotes únicos encontrados: ${lotesUnicos.size}`);

    const lotesVencedores = new Set<string>();
    lotesUnicos.forEach(loteId => {
      let menorTotalLote = Infinity;
      let fornecedorVencedorId: string | null = null;

      // Para cada fornecedor válido, calcular o valor total do lote
      fornecedoresValidos.forEach(f => {
        // Verificar se está rejeitado globalmente
        if (fornecedoresRejeitadosGlobal.has(f.fornecedor_id)) return;
        
        // Buscar a resposta do fornecedor
        const respostaF = respostas.find(r => r.fornecedor_id === f.fornecedor_id);
        if (!respostaF) return;

        // Buscar todos os itens do fornecedor que pertencem a este lote
        const itensDoFornecedorNoLote = todosItens.filter(item => 
          item.itens_cotacao.lote_id === loteId &&
          item.cotacao_resposta_fornecedor_id === respostaF.id
        );

        if (itensDoFornecedorNoLote.length === 0) return;

        // Calcular valor total do lote para este fornecedor
        const totalLote = itensDoFornecedorNoLote.reduce((sum, item) => {
          const quantidade = item.itens_cotacao.quantidade || 1;
          const valorUnitario = item.valor_unitario_ofertado || 0;
          return sum + (valorUnitario * quantidade);
        }, 0);

        if (totalLote > 0 && totalLote < menorTotalLote) {
          menorTotalLote = totalLote;
          fornecedorVencedorId = f.fornecedor_id;
        }
      });

      if (fornecedorVencedorId === fornecedorId) {
        lotesVencedores.add(loteId);
        console.log(`  ✅ Fornecedor ${fornecedorId} venceu lote ${loteId}`);
      }
    });

    // Buscar os itens vencedores deste fornecedor (todos os itens dos lotes que ganhou)
    const itensDoFornecedorVencedores = todosItens.filter(item => 
      item.cotacao_resposta_fornecedor_id === resposta.id &&
      item.itens_cotacao.lote_id &&
      lotesVencedores.has(item.itens_cotacao.lote_id)
    );

    console.log(`  → Lotes vencedores para este fornecedor: ${Array.from(lotesVencedores).join(', ')}`);
    console.log(`  → Itens dos lotes vencedores: ${itensDoFornecedorVencedores.length}`);

    // Para critério por lote, retornar diretamente os itens dos lotes vencedores
    // (não usar numerosItensVencedores pois pode haver conflito de números entre lotes)
    return itensDoFornecedorVencedores.sort((a, b) => a.itens_cotacao.numero_item - b.itens_cotacao.numero_item);

  } else {
    // POR ITEM (padrão): menor valor unitário por item
    numerosItensUnicos.forEach(numeroItem => {
      let menorValor = Infinity;
      let fornecedorVencedorId: string | null = null;

      fornecedoresValidos.forEach(f => {
        // Verificar se fornecedor está rejeitado neste item específico
        const itensRejeitados = itensRejeitadosPorFornecedor.get(f.fornecedor_id);
        if (itensRejeitados?.has(numeroItem)) return;
        if (fornecedoresRejeitadosGlobal.has(f.fornecedor_id)) return;
        
        const item = f.itens.find(i => i.numero_item === numeroItem);
        const valor = item?.valor_unitario || 0;

        if (valor > 0 && valor < menorValor) {
          menorValor = valor;
          fornecedorVencedorId = f.fornecedor_id;
        }
      });

      if (fornecedorVencedorId === fornecedorId) {
        numerosItensVencedores.add(numeroItem);
      }
    });
  }

  console.log(`  → Itens vencedores após recálculo: ${numerosItensVencedores.size}`);
  if (numerosItensVencedores.size <= 15) {
    console.log(`  → Números: ${Array.from(numerosItensVencedores).join(', ')}`);
  }

  // Buscar os objetos ItemResposta correspondentes
  const itensVencidos = todosItens.filter(item => {
    const pertenceAoFornecedor = item.cotacao_resposta_fornecedor_id === resposta.id;
    const ehVencedor = numerosItensVencedores.has(item.itens_cotacao.numero_item);
    return pertenceAoFornecedor && ehVencedor;
  });

  console.log(`  ✅ Total de itens vencidos carregados: ${itensVencidos.length}`);

  return itensVencidos.sort((a, b) => a.itens_cotacao.numero_item - b.itens_cotacao.numero_item);
}
