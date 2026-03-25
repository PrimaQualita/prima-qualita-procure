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
    lote_id?: string | null; // CRÍTICO: incluir lote_id para identificação por lote
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

  // Buscar planilha, compliance, lotes e rejeições em PARALELO para performance
  const [
    { data: planilha, error },
    { data: analisesCompliance },
    { data: lotesCotacao },
    { data: rejeicoesAtivas },
    { data: rejeicoesRevertidas }
  ] = await Promise.all([
    supabase
      .from('planilhas_consolidadas')
      .select('fornecedores_incluidos')
      .eq('cotacao_id', cotacaoId)
      .order('data_geracao', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('analises_compliance')
      .select('empresas_reprovadas')
      .eq('cotacao_id', cotacaoId),
    supabase
      .from('lotes_cotacao')
      .select('id, numero_lote')
      .eq('cotacao_id', cotacaoId),
    supabase
      .from('fornecedores_rejeitados_cotacao')
      .select('fornecedor_id, itens_afetados')
      .eq('cotacao_id', cotacaoId)
      .eq('revertido', false),
    supabase
      .from('fornecedores_rejeitados_cotacao')
      .select('fornecedor_id')
      .eq('cotacao_id', cotacaoId)
      .eq('revertido', true)
  ]);

  // Processar resultado da planilha
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

  // Processar compliance
  const cnpjsReprovadosCompliance = new Set<string>();
  for (const analise of analisesCompliance || []) {
    const reprovadas = analise.empresas_reprovadas as string[] || [];
    for (const cnpj of reprovadas) {
      if (cnpj) cnpjsReprovadosCompliance.add(cnpj);
    }
  }
  console.log(`  → CNPJs reprovados compliance: ${cnpjsReprovadosCompliance.size}`);

  // Processar lotes
  const loteIdPorNumero = new Map<number, string>();
  lotesCotacao?.forEach(l => loteIdPorNumero.set(l.numero_lote, l.id));

  // Mapear fornecedores rejeitados globalmente (sem itens específicos ou todos os itens)
  const fornecedoresRejeitadosGlobal = new Set<string>();
  // CRÍTICO: Para por_lote, itens_afetados são NÚMEROS DE LOTES, não números de itens
  // Mapear lotes rejeitados por fornecedor (quando critério é por_lote)
  const lotesRejeitadosPorFornecedor = new Map<string, Set<number>>();
  // Mapear itens rejeitados por fornecedor (para outros critérios)
  const itensRejeitadosPorFornecedor = new Map<string, Set<number>>();
  
  // Primeiro, identificar todos os itens/lotes disponíveis
  const todosNumerosItens = new Set<number>();
  const todosNumerosLotes = new Set<number>();
  
  fornecedoresPlanilha.forEach(f => {
    f.itens.forEach(item => todosNumerosItens.add(item.numero_item));
  });
  lotesCotacao?.forEach(l => todosNumerosLotes.add(l.numero_lote));
  
  rejeicoesAtivas?.forEach(r => {
    const itensAfetados = r.itens_afetados as number[] | null;
    if (!itensAfetados || itensAfetados.length === 0) {
      // Rejeição global (todos os itens/lotes)
      fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
    } else {
      // CRÍTICO: Quando critério é por_lote, itens_afetados são NÚMEROS DE LOTES
      if (criterio === "por_lote" || criterio === "lote") {
        // Verificar se rejeitou TODOS os lotes - se sim, é rejeição global
        const rejeitouTodosLotes = todosNumerosLotes.size > 0 && 
          itensAfetados.length >= todosNumerosLotes.size &&
          [...todosNumerosLotes].every(lote => itensAfetados.includes(lote));
        
        if (rejeitouTodosLotes) {
          fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
        } else {
          if (!lotesRejeitadosPorFornecedor.has(r.fornecedor_id)) {
            lotesRejeitadosPorFornecedor.set(r.fornecedor_id, new Set());
          }
          itensAfetados.forEach(loteNum => lotesRejeitadosPorFornecedor.get(r.fornecedor_id)!.add(loteNum));
        }
      } else {
        // Para outros critérios, são números de itens
        // Verificar se rejeitou TODOS os itens - se sim, é rejeição global
        const rejeitouTodosItens = todosNumerosItens.size > 0 && 
          itensAfetados.length >= todosNumerosItens.size &&
          [...todosNumerosItens].every(item => itensAfetados.includes(item));
        
        if (rejeitouTodosItens) {
          fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
        } else {
          if (!itensRejeitadosPorFornecedor.has(r.fornecedor_id)) {
            itensRejeitadosPorFornecedor.set(r.fornecedor_id, new Set());
          }
          itensAfetados.forEach(item => itensRejeitadosPorFornecedor.get(r.fornecedor_id)!.add(item));
        }
      }
    }
  });
  
  const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);

  console.log(`  → Fornecedores rejeitados globalmente: ${fornecedoresRejeitadosGlobal.size}`);
  console.log(`  → Fornecedores com rejeição por lote: ${lotesRejeitadosPorFornecedor.size}`);
  console.log(`  → Fornecedores com rejeição por item: ${itensRejeitadosPorFornecedor.size}`);
  console.log(`  → Fornecedores com rejeição revertida: ${fornecedoresRevertidos.size}`);

  // CRÍTICO: Identificar preços públicos - APENAS por email
  const ehPrecoPublico = (email?: string) => {
    return !!(email && email.includes('precos.publicos'));
  };

  // Separar fornecedores válidos (não rejeitados globalmente, não preço público, não reprovado compliance)
  // Fornecedores com rejeição por item/lote são considerados válidos mas serão filtrados por item/lote
  const fornecedoresValidos = fornecedoresPlanilha.filter(f => {
    // CRÍTICO: Excluir reprovados pelo compliance
    if (cnpjsReprovadosCompliance.has(f.cnpj)) {
      console.log(`  🚫 Excluindo ${f.razao_social} - reprovado compliance`);
      return false;
    }

    // Excluir preços públicos
    if (ehPrecoPublico(f.email)) {
      console.log(`  🚫 Excluindo ${f.razao_social} - preço público`);
      return false;
    }

    const resposta = respostas.find(r => r.fornecedor_id === f.fornecedor_id);
    const estaRejeitado = resposta?.rejeitado && !fornecedoresRevertidos.has(f.fornecedor_id);
    const rejeitadoGlobalNoBanco = fornecedoresRejeitadosGlobal.has(f.fornecedor_id);
    
    // Se tem rejeição apenas por itens/lotes específicos, ainda é válido para outros itens/lotes
    // Estes fornecedores serão filtrados item por item posteriormente
    const temRejeicaoParcialItem = itensRejeitadosPorFornecedor.has(f.fornecedor_id);
    const temRejeicaoParcialLote = lotesRejeitadosPorFornecedor.has(f.fornecedor_id);
    
    // CRÍTICO: Se fornecedor tem rejeição global (todos itens/lotes), excluir
    // Se tem rejeição parcial (apenas alguns itens/lotes), manter para recálculo granular
    if (rejeitadoGlobalNoBanco) {
      console.log(`  🚫 Excluindo ${f.razao_social} - rejeitado globalmente`);
      return false;
    }
    
    if (estaRejeitado && !temRejeicaoParcialItem && !temRejeicaoParcialLote) {
      console.log(`  🚫 Excluindo ${f.razao_social} - rejeitado sem itens específicos`);
      return false;
    }
    
    return true;
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
        // CRÍTICO: Verificar se fornecedor está rejeitado neste item específico
        const itensRejeitados = itensRejeitadosPorFornecedor.get(f.fornecedor_id);
        if (itensRejeitados?.has(numeroItem)) {
          console.log(`    → ${f.razao_social} rejeitado no item ${numeroItem} - pulando`);
          return;
        }
        if (fornecedoresRejeitadosGlobal.has(f.fornecedor_id)) return;
        
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
    // POR LOTE: menor valor total do lote - usa dados DIRETOS do banco, não da planilha
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
      let fornecedorVencedorId: string | null = null;

      // CRÍTICO: Iterar sobre TODAS as respostas do banco, não fornecedoresValidos da planilha
      respostas.forEach(resposta => {
        // Verificar se está rejeitado
        if (resposta.rejeitado) return;
        if (fornecedoresRejeitadosGlobal.has(resposta.fornecedor_id)) return;
        
        // CRÍTICO: Verificar se reprovado pelo compliance
        const cnpj = resposta.fornecedores?.cnpj || '';
        if (cnpjsReprovadosCompliance.has(cnpj)) {
          console.log(`    → ${resposta.fornecedores?.razao_social} excluído (reprovado compliance)`);
          return;
        }
        
        // Verificar se é preço público
        const email = resposta.fornecedores?.email || '';
        if (ehPrecoPublico(email)) return;

        // Buscar todos os itens do fornecedor que pertencem a este lote
        const itensDoFornecedorNoLote = itens.filter(item => 
          item.itens_cotacao.lote_id === loteId &&
          item.cotacao_resposta_fornecedor_id === resposta.id
        );

        if (itensDoFornecedorNoLote.length === 0) return;

        // CRÍTICO: Para por_lote, verificar se o LOTE (número) está rejeitado
        // Buscar o número do lote a partir do lote_id
        const loteInfo = lotesCotacao?.find(l => l.id === loteId);
        const numeroLote = loteInfo?.numero_lote;
        
        const lotesRejeitadosDoFornecedor = lotesRejeitadosPorFornecedor.get(resposta.fornecedor_id);
        if (lotesRejeitadosDoFornecedor && numeroLote && lotesRejeitadosDoFornecedor.has(numeroLote)) {
          console.log(`    → ${resposta.fornecedores?.razao_social} rejeitado no lote ${numeroLote}`);
          return; // Pula este fornecedor para este lote
        }

        // Calcular valor total do lote para este fornecedor
        const totalLote = itensDoFornecedorNoLote.reduce((sum, item) => {
          const quantidade = item.itens_cotacao.quantidade || 1;
          const valorUnitario = item.valor_unitario_ofertado || 0;
          return sum + (valorUnitario * quantidade);
        }, 0);

        console.log(`    → ${resposta.fornecedores?.razao_social} - Lote ${loteId}: R$ ${totalLote.toFixed(2)} (${itensDoFornecedorNoLote.length} itens)`);

        if (totalLote > 0 && totalLote < menorTotalLote) {
          menorTotalLote = totalLote;
          fornecedorVencedorId = resposta.fornecedor_id;
        }
      });

      if (fornecedorVencedorId) {
        fornecedoresVencedoresSet.add(fornecedorVencedorId);
        const fornecedorNome = respostas.find(r => r.fornecedor_id === fornecedorVencedorId)?.fornecedores?.razao_social;
        console.log(`  ✅ Vencedor Lote ${loteId}: ${fornecedorNome} (R$ ${menorTotalLote.toFixed(2)})`);
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

  // CRÍTICO: Buscar empresas reprovadas pelo compliance
  const { data: analisesCompliance } = await supabase
    .from('analises_compliance')
    .select('empresas_reprovadas')
    .eq('cotacao_id', cotacaoId);
  
  const cnpjsReprovadosCompliance = new Set<string>();
  for (const analise of analisesCompliance || []) {
    const reprovadas = analise.empresas_reprovadas as string[] || [];
    for (const cnpj of reprovadas) {
      if (cnpj) cnpjsReprovadosCompliance.add(cnpj);
    }
  }

  // Buscar lotes para mapear numero_lote -> lote_id (necessário para por_lote)
  const { data: lotesCotacao } = await supabase
    .from('lotes_cotacao')
    .select('id, numero_lote')
    .eq('cotacao_id', cotacaoId);

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
  // Para por_lote: mapear LOTES rejeitados por fornecedor
  const lotesRejeitadosPorFornecedor = new Map<string, Set<number>>();
  // Para outros critérios: mapear itens rejeitados por fornecedor
  const itensRejeitadosPorFornecedor = new Map<string, Set<number>>();
  
  // Primeiro, identificar todos os itens/lotes disponíveis
  const todosNumerosItens = new Set<number>();
  const todosNumerosLotes = new Set<number>();
  
  fornecedoresPlanilha.forEach(f => {
    f.itens.forEach(item => todosNumerosItens.add(item.numero_item));
  });
  lotesCotacao?.forEach(l => todosNumerosLotes.add(l.numero_lote));

  rejeicoesAtivas?.forEach(r => {
    const itensAfetados = r.itens_afetados as number[] | null;
    if (!itensAfetados || itensAfetados.length === 0) {
      // Rejeição global (todos os itens/lotes)
      fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
    } else {
      // CRÍTICO: Quando critério é por_lote, itens_afetados são NÚMEROS DE LOTES
      if (criterio === "por_lote" || criterio === "lote") {
        // Verificar se rejeitou TODOS os lotes - se sim, é rejeição global
        const rejeitouTodosLotes = todosNumerosLotes.size > 0 && 
          itensAfetados.length >= todosNumerosLotes.size &&
          [...todosNumerosLotes].every(lote => itensAfetados.includes(lote));
        
        if (rejeitouTodosLotes) {
          fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
        } else {
          if (!lotesRejeitadosPorFornecedor.has(r.fornecedor_id)) {
            lotesRejeitadosPorFornecedor.set(r.fornecedor_id, new Set());
          }
          itensAfetados.forEach(loteNum => lotesRejeitadosPorFornecedor.get(r.fornecedor_id)!.add(loteNum));
        }
      } else {
        // Para outros critérios, são números de itens
        // Verificar se rejeitou TODOS os itens - se sim, é rejeição global
        const rejeitouTodosItens = todosNumerosItens.size > 0 && 
          itensAfetados.length >= todosNumerosItens.size &&
          [...todosNumerosItens].every(item => itensAfetados.includes(item));
        
        if (rejeitouTodosItens) {
          fornecedoresRejeitadosGlobal.add(r.fornecedor_id);
        } else {
          if (!itensRejeitadosPorFornecedor.has(r.fornecedor_id)) {
            itensRejeitadosPorFornecedor.set(r.fornecedor_id, new Set());
          }
          itensAfetados.forEach(item => itensRejeitadosPorFornecedor.get(r.fornecedor_id)!.add(item));
        }
      }
    }
  });

  const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);

  // CRÍTICO: Identificar preços públicos - APENAS por email
  const ehPrecoPublico = (email?: string) => {
    return !!(email && email.includes('precos.publicos'));
  };

  // Fornecedores válidos (não rejeitados globalmente, não reprovado compliance)
  const fornecedoresValidos = fornecedoresPlanilha.filter(f => {
    // CRÍTICO: Excluir reprovados pelo compliance
    if (cnpjsReprovadosCompliance.has(f.cnpj)) {
      return false;
    }

    // Excluir preços públicos
    if (ehPrecoPublico(f.email)) {
      return false;
    }

    const resposta = respostas.find(r => r.fornecedor_id === f.fornecedor_id);
    const estaRejeitado = resposta?.rejeitado && !fornecedoresRevertidos.has(f.fornecedor_id);
    const rejeitadoGlobalNoBanco = fornecedoresRejeitadosGlobal.has(f.fornecedor_id);
    
    // Se tem rejeição apenas por itens/lotes específicos, ainda é válido para outros
    const temRejeicaoParcialItem = itensRejeitadosPorFornecedor.has(f.fornecedor_id);
    const temRejeicaoParcialLote = lotesRejeitadosPorFornecedor.has(f.fornecedor_id);
    
    // CRÍTICO: Se fornecedor tem rejeição global (todos itens/lotes), excluir
    // Se tem rejeição parcial (apenas alguns itens/lotes), manter para recálculo granular
    if (rejeitadoGlobalNoBanco) {
      return false;
    }
    
    if (estaRejeitado && !temRejeicaoParcialItem && !temRejeicaoParcialLote) {
      return false;
    }
    
    return true;
  });

  const fornecedorAtual = fornecedoresPlanilha.find(f => f.fornecedor_id === fornecedorId);
  if (!fornecedorAtual) {
    console.log(`  ❌ Fornecedor não encontrado na planilha`);
    return [];
  }

  // Buscar a resposta do fornecedor (NÃO verificar rejeitado aqui - será feito item por item)
  const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
  if (!resposta) {
    console.log(`  ❌ Resposta não encontrada para fornecedor ${fornecedorId}`);
    return [];
  }
  
  console.log(`  → Resposta encontrada: ${resposta.id}, rejeitado: ${resposta.rejeitado}`);
  console.log(`  → Total de itens recebidos (todosItens): ${todosItens.length}`);
  
  // Verificar quais itens pertencem a este fornecedor
  const itensDoFornecedor = todosItens.filter(item => item.cotacao_resposta_fornecedor_id === resposta.id);
  console.log(`  → Itens que pertencem a este fornecedor: ${itensDoFornecedor.length}`);
  if (itensDoFornecedor.length <= 10) {
    console.log(`  → Números dos itens: ${itensDoFornecedor.map(i => i.itens_cotacao.numero_item).join(', ')}`);
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
    // POR LOTE: menor valor total do lote - usa dados DIRETOS do banco, não da planilha
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

      // CRÍTICO: Iterar sobre TODAS as respostas do banco, não fornecedoresValidos da planilha
      respostas.forEach(respostaF => {
        // Verificar se está rejeitado (flag rejeitado E NÃO foi revertido)
        const foiRevertido = fornecedoresRevertidos.has(respostaF.fornecedor_id);
        if (respostaF.rejeitado && !foiRevertido) return;
        if (fornecedoresRejeitadosGlobal.has(respostaF.fornecedor_id) && !foiRevertido) return;
        
        // Verificar se é preço público
        const cnpj = respostaF.fornecedores?.cnpj || '';
        const email = respostaF.fornecedores?.email || '';
        if (ehPrecoPublico(email)) return;

        // Buscar todos os itens do fornecedor que pertencem a este lote
        const itensDoFornecedorNoLote = todosItens.filter(item => 
          item.itens_cotacao.lote_id === loteId &&
          item.cotacao_resposta_fornecedor_id === respostaF.id
        );

        if (itensDoFornecedorNoLote.length === 0) return;

        // CRÍTICO: Para por_lote, verificar se o LOTE (número) está rejeitado
        const loteInfo = lotesCotacao?.find(l => l.id === loteId);
        const numeroLote = loteInfo?.numero_lote;
        
        const lotesRejeitadosDoFornecedor = lotesRejeitadosPorFornecedor.get(respostaF.fornecedor_id);
        if (lotesRejeitadosDoFornecedor && numeroLote && lotesRejeitadosDoFornecedor.has(numeroLote)) {
          console.log(`    → ${respostaF.fornecedores?.razao_social} rejeitado no lote ${numeroLote}`);
          return; // Pula este fornecedor para este lote
        }
        
        // CRÍTICO: Verificar se reprovado pelo compliance
        if (cnpjsReprovadosCompliance.has(cnpj)) {
          return;
        }

        // Calcular valor total do lote para este fornecedor
        const totalLote = itensDoFornecedorNoLote.reduce((sum, item) => {
          const quantidade = item.itens_cotacao.quantidade || 1;
          const valorUnitario = item.valor_unitario_ofertado || 0;
          return sum + (valorUnitario * quantidade);
        }, 0);

        if (totalLote > 0 && totalLote < menorTotalLote) {
          menorTotalLote = totalLote;
          fornecedorVencedorId = respostaF.fornecedor_id;
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
  // DIAGNÓSTICO: Ver quais itens existem para este fornecedor
  console.log(`  🔎 Buscando itens do fornecedor no todosItens:`);
  console.log(`    - resposta.id para matching: ${resposta.id}`);
  console.log(`    - numerosItensVencedores: ${Array.from(numerosItensVencedores).join(', ')}`);
  
  // Verificar todos os itens deste fornecedor
  const itensDesteForneced = todosItens.filter(item => item.cotacao_resposta_fornecedor_id === resposta.id);
  console.log(`    - Itens encontrados com resposta.id matching: ${itensDesteForneced.length}`);
  if (itensDesteForneced.length <= 5) {
    itensDesteForneced.forEach(i => {
      console.log(`      Item ${i.itens_cotacao.numero_item}: id=${i.id}, respId=${i.cotacao_resposta_fornecedor_id}`);
    });
  }
  
  // Se não encontrou itens do fornecedor, o problema é no matching de resposta.id
  if (itensDesteForneced.length === 0 && todosItens.length > 0) {
    console.log(`    ⚠️ PROBLEMA: Nenhum item encontrado para resposta.id=${resposta.id}`);
    console.log(`    → Exemplos de cotacao_resposta_fornecedor_id nos itens:`);
    const idsUnicos = [...new Set(todosItens.slice(0, 10).map(i => i.cotacao_resposta_fornecedor_id))];
    idsUnicos.forEach(id => console.log(`      - ${id}`));
  }
  
  const itensVencidos = todosItens.filter(item => {
    const pertenceAoFornecedor = item.cotacao_resposta_fornecedor_id === resposta.id;
    const ehVencedor = numerosItensVencedores.has(item.itens_cotacao.numero_item);
    return pertenceAoFornecedor && ehVencedor;
  });

  console.log(`  ✅ Total de itens vencidos carregados: ${itensVencidos.length}`);

  return itensVencidos.sort((a, b) => a.itens_cotacao.numero_item - b.itens_cotacao.numero_item);
}
