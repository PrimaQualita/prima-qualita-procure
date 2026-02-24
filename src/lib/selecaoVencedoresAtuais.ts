import { supabase } from "@/integrations/supabase/client";

type CriterioJulgamento = "por_item" | "por_lote" | "global" | "desconto" | "maior_percentual_desconto" | string;

interface InabilitacaoFornecedor {
  global: boolean;
  itens: Set<number>;
}

const criterioEhDesconto = (criterio: CriterioJulgamento) =>
  criterio === "desconto" || criterio === "maior_percentual_desconto";

const toCents = (valor: number) => Math.round((Number(valor) + Number.EPSILON) * 100);

export async function carregarFornecedoresVencedoresAtuaisSelecao(
  selecaoId: string,
): Promise<Set<string>> {
  try {
    const { data: selecaoData, error: selecaoError } = await supabase
      .from("selecoes_fornecedores")
      .select("id, criterios_julgamento, cotacao_relacionada_id, processos_compras(criterio_julgamento)")
      .eq("id", selecaoId)
      .maybeSingle();

    if (selecaoError || !selecaoData) {
      throw selecaoError ?? new Error("Seleção não encontrada");
    }

    const criterio =
      (selecaoData.criterios_julgamento ||
        (selecaoData.processos_compras as any)?.criterio_julgamento ||
        "por_item") as CriterioJulgamento;

    const isPorLote = criterio === "por_lote";
    const isGlobal = criterio === "global";
    const isDesconto = criterioEhDesconto(criterio);
    const cotacaoId = selecaoData.cotacao_relacionada_id as string | null;

    const [lancesResult, inabilitacoesResult, propostasResult, planilhaResult, itensCotacaoResult, lotesResult] =
      await Promise.all([
        supabase
          .from("lances_fornecedores")
          .select("fornecedor_id, numero_item, valor_lance")
          .eq("selecao_id", selecaoId),
        supabase
          .from("fornecedores_inabilitados_selecao")
          .select("fornecedor_id, itens_afetados")
          .eq("selecao_id", selecaoId)
          .eq("revertido", false),
        supabase
          .from("selecao_propostas_fornecedor")
          .select("id, fornecedor_id")
          .eq("selecao_id", selecaoId),
        cotacaoId
          ? supabase
              .from("planilhas_consolidadas")
              .select("estimativas_itens, data_geracao")
              .eq("cotacao_id", cotacaoId)
              .order("data_geracao", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        cotacaoId
          ? supabase
              .from("itens_cotacao")
              .select("numero_item, lote_id, quantidade")
              .eq("cotacao_id", cotacaoId)
          : Promise.resolve({ data: [], error: null }),
        cotacaoId
          ? supabase
              .from("lotes_cotacao")
              .select("id, numero_lote")
              .eq("cotacao_id", cotacaoId)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (lancesResult.error) throw lancesResult.error;
    if (inabilitacoesResult.error) throw inabilitacoesResult.error;
    if (propostasResult.error) throw propostasResult.error;
    if (planilhaResult.error) throw planilhaResult.error;
    if (itensCotacaoResult.error) throw itensCotacaoResult.error;
    if (lotesResult.error) throw lotesResult.error;

    const propostas = propostasResult.data || [];
    const propostaIdParaFornecedor = new Map<string, string>(
      propostas.map((p: any) => [p.id, String(p.fornecedor_id)]),
    );

    const propostaIds = propostas.map((p: any) => p.id);

    const { data: respostasPropostas, error: respostasError } = propostaIds.length
      ? await supabase
          .from("selecao_respostas_itens_fornecedor")
          .select("proposta_id, numero_item, lote_id, valor_unitario_ofertado, valor_total_item")
          .in("proposta_id", propostaIds)
      : { data: [], error: null };

    if (respostasError) throw respostasError;

    const inabilitacoesPorFornecedor = new Map<string, InabilitacaoFornecedor>();
    (inabilitacoesResult.data || []).forEach((row: any) => {
      const fornecedorId = String(row.fornecedor_id);
      const itensAfetados: number[] = Array.isArray(row.itens_afetados)
        ? row.itens_afetados.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
        : [];

      const atual = inabilitacoesPorFornecedor.get(fornecedorId) || {
        global: false,
        itens: new Set<number>(),
      };

      if (itensAfetados.length === 0) {
        atual.global = true;
      } else {
        itensAfetados.forEach((n) => atual.itens.add(n));
      }

      inabilitacoesPorFornecedor.set(fornecedorId, atual);
    });

    const isInabilitadoNoNumero = (fornecedorId: string, numero: number) => {
      const reg = inabilitacoesPorFornecedor.get(String(fornecedorId));
      if (!reg) return false;
      if (reg.global) return true;
      return reg.itens.has(numero);
    };

    const itensCotacao = (itensCotacaoResult.data as any[]) || [];
    const lotes = (lotesResult.data as any[]) || [];

    const loteIdParaNumero = new Map<string, number>(
      lotes.map((l: any) => [String(l.id), Number(l.numero_lote)]),
    );

    const quantidadePorItem = new Map<number, number>();
    const quantidadePorLoteItem = new Map<string, number>();

    itensCotacao.forEach((item: any) => {
      const numeroItem = Number(item.numero_item);
      const quantidade = Number(item.quantidade || 1);
      if (!Number.isFinite(numeroItem)) return;
      if (!quantidadePorItem.has(numeroItem)) {
        quantidadePorItem.set(numeroItem, quantidade);
      }
      if (item.lote_id) {
        quantidadePorLoteItem.set(`${String(item.lote_id)}:${numeroItem}`, quantidade);
      }
    });

    const estimativasRaw = (planilhaResult.data as any)?.estimativas_itens as Record<string, number> | null;
    const estimativasPorItem = new Map<number, number>();
    const estimativaSubtotalPorLote = new Map<number, number>();
    let estimativaGlobal = 0;

    if (estimativasRaw && Object.keys(estimativasRaw).length > 0) {
      Object.entries(estimativasRaw).forEach(([key, valor]) => {
        if (!key.includes("_")) {
          const num = Number(key);
          if (Number.isFinite(num)) {
            estimativasPorItem.set(num, Number(valor) || 0);
          }
        }
      });

      itensCotacao.forEach((item: any) => {
        const numeroItem = Number(item.numero_item);
        const quantidade = Number(item.quantidade || 1);
        const numeroLote = item.lote_id ? loteIdParaNumero.get(String(item.lote_id)) : undefined;

        const chaveComposta = numeroLote != null ? `${numeroLote}_${numeroItem}` : "";
        const estimativaUnitaria = Number(
          chaveComposta && chaveComposta in estimativasRaw
            ? estimativasRaw[chaveComposta]
            : estimativasRaw[String(numeroItem)] ?? 0,
        );

        if (estimativaUnitaria > 0) {
          if (numeroLote != null) {
            estimativaSubtotalPorLote.set(
              numeroLote,
              (estimativaSubtotalPorLote.get(numeroLote) || 0) + estimativaUnitaria * quantidade,
            );
          }
          estimativaGlobal += estimativaUnitaria * quantidade;
        }
      });

      if (!itensCotacao.length && isGlobal) {
        estimativaGlobal = Object.values(estimativasRaw).reduce((sum, v) => sum + Number(v || 0), 0);
      }
    }

    const isDesclassificadoPorPreco = (numero: number, valor: number) => {
      let estimativa = 0;
      if (isPorLote) {
        estimativa = estimativaSubtotalPorLote.get(numero) || 0;
      } else if (isGlobal && numero === 0) {
        estimativa = estimativaGlobal || 0;
      } else {
        estimativa = estimativasPorItem.get(numero) || 0;
      }

      if (!estimativa || estimativa <= 0) return false;
      if (isDesconto) return valor < estimativa;
      return toCents(valor) > toCents(estimativa);
    };

    const adicionarMelhorValor = (
      mapaBase: Map<number, Map<string, number>>,
      numero: number,
      fornecedorId: string,
      valor: number,
    ) => {
      if (!Number.isFinite(valor) || valor <= 0) return;
      if (!mapaBase.has(numero)) {
        mapaBase.set(numero, new Map<string, number>());
      }

      const porFornecedor = mapaBase.get(numero)!;
      const atual = porFornecedor.get(fornecedorId);
      if (atual == null) {
        porFornecedor.set(fornecedorId, valor);
        return;
      }

      if (isDesconto ? valor > atual : valor < atual) {
        porFornecedor.set(fornecedorId, valor);
      }
    };

    const lancesPorNumero = new Map<number, Map<string, number>>();
    (lancesResult.data || []).forEach((lance: any) => {
      const fornecedorId = String(lance.fornecedor_id);
      const numero = Number(lance.numero_item || 0);
      const valor = Number(lance.valor_lance || 0);
      if (!fornecedorId || !Number.isFinite(numero)) return;
      adicionarMelhorValor(lancesPorNumero, numero, fornecedorId, valor);
    });

    const propostasPorNumero = new Map<number, Map<string, number>>();

    const obterQuantidade = (numeroItem: number, loteId?: string | null) => {
      if (loteId) {
        const key = `${loteId}:${numeroItem}`;
        if (quantidadePorLoteItem.has(key)) {
          return quantidadePorLoteItem.get(key) || 1;
        }
      }
      return quantidadePorItem.get(numeroItem) || 1;
    };

    if (isGlobal) {
      const totalGlobalPorFornecedor = new Map<string, number>();

      (respostasPropostas || []).forEach((resp: any) => {
        const fornecedorId = propostaIdParaFornecedor.get(String(resp.proposta_id));
        if (!fornecedorId) return;

        const numeroItem = Number(resp.numero_item || 0);
        if (isInabilitadoNoNumero(fornecedorId, numeroItem)) return;

        const valorUnitario = Number(resp.valor_unitario_ofertado || 0);
        if (valorUnitario <= 0) return;

        const quantidade = obterQuantidade(numeroItem, resp.lote_id);
        const valorTotal = Number(resp.valor_total_item || 0) > 0
          ? Number(resp.valor_total_item)
          : valorUnitario * quantidade;

        if (valorTotal <= 0) return;

        totalGlobalPorFornecedor.set(
          fornecedorId,
          (totalGlobalPorFornecedor.get(fornecedorId) || 0) + valorTotal,
        );
      });

      totalGlobalPorFornecedor.forEach((valor, fornecedorId) => {
        adicionarMelhorValor(propostasPorNumero, 0, fornecedorId, valor);
      });
    } else if (isPorLote) {
      (respostasPropostas || []).forEach((resp: any) => {
        const fornecedorId = propostaIdParaFornecedor.get(String(resp.proposta_id));
        if (!fornecedorId) return;

        if (!resp.lote_id) return;
        const numeroLote = loteIdParaNumero.get(String(resp.lote_id));
        if (!Number.isFinite(numeroLote)) return;
        if (isInabilitadoNoNumero(fornecedorId, Number(numeroLote))) return;

        const numeroItem = Number(resp.numero_item || 0);
        const valorUnitario = Number(resp.valor_unitario_ofertado || 0);
        if (valorUnitario <= 0) return;

        const quantidade = obterQuantidade(numeroItem, resp.lote_id);
        const valorTotal = Number(resp.valor_total_item || 0) > 0
          ? Number(resp.valor_total_item)
          : valorUnitario * quantidade;

        if (!propostasPorNumero.has(Number(numeroLote))) {
          propostasPorNumero.set(Number(numeroLote), new Map<string, number>());
        }

        const porFornecedor = propostasPorNumero.get(Number(numeroLote))!;
        porFornecedor.set(fornecedorId, (porFornecedor.get(fornecedorId) || 0) + valorTotal);
      });
    } else {
      (respostasPropostas || []).forEach((resp: any) => {
        const fornecedorId = propostaIdParaFornecedor.get(String(resp.proposta_id));
        if (!fornecedorId) return;

        const numeroItem = Number(resp.numero_item || 0);
        if (!Number.isFinite(numeroItem)) return;
        if (isInabilitadoNoNumero(fornecedorId, numeroItem)) return;

        const valorUnitario = Number(resp.valor_unitario_ofertado || 0);
        adicionarMelhorValor(propostasPorNumero, numeroItem, fornecedorId, valorUnitario);
      });
    }

    const obterVencedor = (numero: number, porFornecedor?: Map<string, number>) => {
      if (!porFornecedor || porFornecedor.size === 0) return null;

      const candidatos = Array.from(porFornecedor.entries())
        .filter(([fornecedorId]) => !isInabilitadoNoNumero(fornecedorId, numero))
        .filter(([, valor]) => !isDesclassificadoPorPreco(numero, valor))
        .sort((a, b) => (isDesconto ? b[1] - a[1] : a[1] - b[1]));

      if (!candidatos.length) return null;
      return candidatos[0][0];
    };

    const chaves = new Set<number>([...lancesPorNumero.keys(), ...propostasPorNumero.keys()]);
    const vencedores = new Set<string>();

    chaves.forEach((numero) => {
      const vencedorLance = obterVencedor(numero, lancesPorNumero.get(numero));
      if (vencedorLance) {
        vencedores.add(vencedorLance);
        return;
      }

      const vencedorProposta = obterVencedor(numero, propostasPorNumero.get(numero));
      if (vencedorProposta) {
        vencedores.add(vencedorProposta);
      }
    });

    return vencedores;
  } catch (error) {
    console.error("Erro ao calcular vencedores atuais da seleção:", error);
    return new Set<string>();
  }
}

export async function fornecedorEhVencedorAtualSelecao(
  selecaoId: string,
  fornecedorId: string,
): Promise<boolean> {
  const vencedores = await carregarFornecedoresVencedoresAtuaisSelecao(selecaoId);
  return vencedores.has(String(fornecedorId));
}
