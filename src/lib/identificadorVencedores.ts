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
    eh_vencedor?: boolean;
  }>;
}

export async function identificarVencedoresPorCriterio(
  criterio: string,
  cotacaoId: string,
  respostas: Resposta[],
  itens: ItemResposta[]
): Promise<Fornecedor[]> {
  console.log(`🏆 [identificadorVencedores] Buscando vencedores da PLANILHA CONSOLIDADA`);
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
  
  // DEBUG: Ver estrutura da planilha
  if (fornecedoresPlanilha && fornecedoresPlanilha.length > 0) {
    console.log(`  📊 ESTRUTURA DA PLANILHA (primeiro fornecedor):`, {
      fornecedor_id: fornecedoresPlanilha[0].fornecedor_id,
      razao_social: fornecedoresPlanilha[0].razao_social,
      totalItens: fornecedoresPlanilha[0].itens?.length || 0,
      primeiroItem: fornecedoresPlanilha[0].itens?.[0],
      estruturaCompleta: fornecedoresPlanilha[0]
    });
  }

  if (!fornecedoresPlanilha || fornecedoresPlanilha.length === 0) {
    return [];
  }
  // Buscar rejeições revertidas
  const { data: rejeicoesRevertidas } = await supabase
    .from('fornecedores_rejeitados_cotacao')
    .select('fornecedor_id')
    .eq('cotacao_id', cotacaoId)
    .eq('revertido', true);

  const fornecedoresRevertidos = new Set(rejeicoesRevertidas?.map(r => r.fornecedor_id) || []);

  // Identificar vencedores baseado nos dados da planilha consolidada
  const fornecedoresVencedoresSet = new Set<string>();

  // Para cada fornecedor na planilha
  fornecedoresPlanilha.forEach(fornecedorPlanilha => {
    console.log(`  🔍 Analisando fornecedor: ${fornecedorPlanilha.razao_social}`);
    console.log(`    → Total de itens deste fornecedor: ${fornecedorPlanilha.itens?.length || 0}`);
    
    // Verificar se o fornecedor foi rejeitado e não foi revertido
    const resposta = respostas.find(r => r.fornecedor_id === fornecedorPlanilha.fornecedor_id);
    const estaRejeitado = resposta?.rejeitado && !fornecedoresRevertidos.has(fornecedorPlanilha.fornecedor_id);
    
    console.log(`    → Está rejeitado? ${estaRejeitado}`);
    
    if (estaRejeitado) {
      console.log(`  ⏭️ Pulando fornecedor rejeitado: ${fornecedorPlanilha.razao_social}`);
      return;
    }

    // DEBUG: Ver estrutura dos itens
    if (fornecedorPlanilha.itens && fornecedorPlanilha.itens.length > 0) {
      console.log(`    → Estrutura do primeiro item:`, fornecedorPlanilha.itens[0]);
    }

    // Verificar se tem itens vencedores
    const itensVencedores = fornecedorPlanilha.itens?.filter(item => item.eh_vencedor === true) || [];
    
    console.log(`    → Itens com eh_vencedor=true: ${itensVencedores.length}`);
    
    if (itensVencedores.length > 0) {
      fornecedoresVencedoresSet.add(fornecedorPlanilha.fornecedor_id);
      console.log(`  ✅ Vencedor: ${fornecedorPlanilha.razao_social} (${itensVencedores.length} itens)`);
    }
  });

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
  console.log(`🔍 [carregarItensVencedores] Buscando itens vencedores da PLANILHA`);
  console.log(`  → Fornecedor ID: ${fornecedorId}`);
  
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
  const fornecedorPlanilha = fornecedoresPlanilha?.find(f => f.fornecedor_id === fornecedorId);

  if (!fornecedorPlanilha) {
    console.log(`  ❌ Fornecedor não encontrado na planilha`);
    return [];
  }

  console.log(`  ✅ Fornecedor encontrado na planilha: ${fornecedorPlanilha.razao_social}`);
  console.log(`  📊 Total de itens do fornecedor na planilha: ${fornecedorPlanilha.itens?.length || 0}`);
  
  // DEBUG: Ver estrutura dos itens deste fornecedor
  if (fornecedorPlanilha.itens && fornecedorPlanilha.itens.length > 0) {
    console.log(`  📋 Exemplo de item:`, fornecedorPlanilha.itens[0]);
  }

  // Obter os números dos itens vencidos da planilha
  const numerosItensVencidos = fornecedorPlanilha.itens
    ?.filter(item => item.eh_vencedor === true)
    .map(item => item.numero_item) || [];

  console.log(`  → Itens vencedores segundo planilha: ${numerosItensVencidos.length}`);
  if (numerosItensVencidos.length <= 15) {
    console.log(`  → Números: ${numerosItensVencidos.join(', ')}`);
  } else {
    console.log(`  → Primeiros 15 números: ${numerosItensVencidos.slice(0, 15).join(', ')}`);
  }

  // Buscar os objetos ItemResposta correspondentes
  const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
  if (!resposta) {
    console.log(`  ❌ Resposta não encontrada`);
    return [];
  }

  console.log(`  ✅ Resposta encontrada - ID: ${resposta.id}`);
  console.log(`  📦 Total de itens disponíveis para filtrar: ${todosItens.length}`);
  
  // DEBUG: Ver estrutura dos itens disponíveis
  if (todosItens.length > 0) {
    console.log(`  📋 Exemplo de item disponível:`, {
      id: todosItens[0].id,
      cotacao_resposta_fornecedor_id: todosItens[0].cotacao_resposta_fornecedor_id,
      numero_item: todosItens[0].itens_cotacao?.numero_item
    });
  }

  const itensVencidos = todosItens.filter(item => {
    const pertenceAoFornecedor = item.cotacao_resposta_fornecedor_id === resposta.id;
    const ehVencedor = numerosItensVencidos.includes(item.itens_cotacao.numero_item);
    
    // DEBUG dos primeiros 3 itens
    if (todosItens.indexOf(item) < 3) {
      console.log(`    🔍 Item ${item.itens_cotacao?.numero_item}:`, {
        pertenceAoFornecedor,
        ehVencedor,
        resposta_id_item: item.cotacao_resposta_fornecedor_id,
        resposta_id_esperado: resposta.id,
        numero_item: item.itens_cotacao.numero_item,
        esta_na_lista: numerosItensVencidos.includes(item.itens_cotacao.numero_item)
      });
    }
    
    return pertenceAoFornecedor && ehVencedor;
  });

  console.log(`  ✅ Total de itens vencidos carregados: ${itensVencidos.length}`);
  if (itensVencidos.length > 0) {
    console.log(`  📋 Estrutura do primeiro item vencido:`, itensVencidos[0]);
    console.log(`  📊 Números dos itens vencidos (primeiros 10):`, 
      itensVencidos.slice(0, 10).map(i => i.itens_cotacao?.numero_item)
    );
  }

  return itensVencidos;
}
