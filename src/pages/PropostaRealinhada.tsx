import React, { useState, useEffect, useRef } from "react";
import { limitarDuasCasasDecimais, truncarDuasCasas } from "@/lib/validators";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, FileText, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import primaLogo from "@/assets/prima-qualita-logo-horizontal.png";
import { gerarPropostaRealinhadaPDF } from "@/lib/gerarPropostaRealinhadaPDF";
import { fornecedorEhVencedorAtualSelecao } from "@/lib/selecaoVencedoresAtuais";
import { DialogSelecionarResponsavelLegal } from "@/components/fornecedores/DialogSelecionarResponsavelLegal";

interface ItemVencedor {
  numero_item: number;
  numero_lote?: number;
  // Em critério por_lote, numero_item pode se repetir em lotes diferentes.
  // Este campo garante chave única (lote_id + numero_item).
  lote_id?: string | null;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_total_ganho: number; // Valor total que ganhou (para dividir entre itens se for lote/global)
  marca?: string;
  valor_unitario_lance?: number; // Valor unitário do lance (para critério por_item e desconto)
  valor_unitario_proposta_original?: number; // Valor unitário da proposta de seleção original
}

interface RespostaItem {
  [key: string]: {
    valor_unitario: number;
    marca: string;
    valor_display?: string;
  };
}

const PropostaRealinhada = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selecaoId = searchParams.get("selecao");
  const fornecedorIdParam = searchParams.get("fornecedor");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [criterioJulgamento, setCriterioJulgamento] = useState<string>("");
  const [itensVencedores, setItensVencedores] = useState<ItemVencedor[]>([]);
  const [respostas, setRespostas] = useState<RespostaItem>({});
  const [observacoes, setObservacoes] = useState("");
  const [jaEnviouProposta, setJaEnviouProposta] = useState(false);
  const [propostaExistente, setPropostaExistente] = useState<any>(null);
  const [valorTotalGanho, setValorTotalGanho] = useState(0);
  const [lotesGanhos, setLotesGanhos] = useState<Map<number, number>>(new Map()); // Map<numero_lote, valor_total_lote>
  const [dialogResponsavelLegalOpen, setDialogResponsavelLegalOpen] = useState(false);
  const [responsaveisLegaisDisponiveis, setResponsaveisLegaisDisponiveis] = useState<string[]>([]);
  const responsavelLegalRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (selecaoId) {
      loadDados();
    }
  }, [selecaoId, fornecedorIdParam]);

  const buildRespostaKey = (
    criterio: string,
    item: { numero_item: number; numero_lote?: number; lote_id?: string | null }
  ) => {
    if (criterio === "por_lote") {
      const loteKey = item.lote_id ?? (item.numero_lote != null ? `lote:${item.numero_lote}` : "lote:unknown");
      return `${loteKey}#${item.numero_item}`;
    }
    return String(item.numero_item);
  };

  const getRespostaKey = (item: ItemVencedor) => buildRespostaKey(criterioJulgamento, item);

  const loadDados = async () => {
    try {
      setLoading(true);

      // Verificar autenticação do fornecedor
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar autenticado");
        navigate("/auth");
        return;
      }

      // Buscar fornecedor pelo user_id
      const { data: fornecedorData, error: fornecedorError } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (fornecedorError || !fornecedorData) {
        toast.error("Fornecedor não encontrado");
        navigate("/portal-fornecedor");
        return;
      }

      setFornecedor(fornecedorData);

      // Carregar seleção
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*)")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);
      setCriterioJulgamento(selecaoData.processos_compras?.criterio_julgamento || "");

      // Verificar se já enviou proposta realinhada
      const { data: propostaRealinhada } = await supabase
        .from("propostas_realinhadas")
        .select("*, propostas_realinhadas_itens(*)")
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorData.id)
        .maybeSingle();

      if (propostaRealinhada) {
        setJaEnviouProposta(true);
        setPropostaExistente(propostaRealinhada);
      }

      // Carregar itens que o fornecedor ganhou
      await loadItensVencedores(selecaoId!, fornecedorData.id, selecaoData.processos_compras?.criterio_julgamento, fornecedorData);

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const loadItensVencedores = async (selecaoId: string, fornecedorId: string, criterio: string, fornecedorData: any) => {
    try {
      const ehVencedorAtual = await fornecedorEhVencedorAtualSelecao(selecaoId, fornecedorId);
      if (!ehVencedorAtual) {
        setItensVencedores([]);
        setValorTotalGanho(0);
        setRespostas({});
        toast.error("Você não tem itens vencedores nesta seleção");
        return;
      }

      // Buscar inabilitações ativas do fornecedor nesta seleção
      const { data: inabilitacoes } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("itens_afetados")
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorId)
        .eq("revertido", false);

      const itensInabilitados = new Set<number>();
      inabilitacoes?.forEach((inab: any) => {
        if (Array.isArray(inab.itens_afetados)) {
          inab.itens_afetados.forEach((item: number) => itensInabilitados.add(item));
        }
      });

      const filtrarInabilitados = (lances: any[]) => {
        return lances.filter((lance: any) => !itensInabilitados.has(Number(lance.numero_item)));
      };

      // Buscar todos os lances para cálculo dinâmico (IGNORAR indicativo_lance_vencedor estático)
      const { data: todosLances, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select("*")
        .eq("selecao_id", selecaoId)
        .order("data_hora_lance", { ascending: false });

      if (lancesError) throw lancesError;

      if (todosLances && todosLances.length > 0) {
        // Buscar TODAS as inabilitações ativas para filtrar lances de fornecedores inabilitados
        const { data: todasInabilitacoes, error: inabilitacoesError } = await supabase
          .from("fornecedores_inabilitados_selecao")
          .select("fornecedor_id, itens_afetados")
          .eq("selecao_id", selecaoId)
          .eq("revertido", false);

        if (inabilitacoesError) throw inabilitacoesError;

        const fornecedoresInabilitadosGlobalmente = new Set<string>();
        const inabilitacoesPorFornecedor = new Map<string, Set<number>>();

        todasInabilitacoes?.forEach((inab: any) => {
          if (!inab.itens_afetados || inab.itens_afetados.length === 0) {
            fornecedoresInabilitadosGlobalmente.add(String(inab.fornecedor_id));
          } else {
            if (!inabilitacoesPorFornecedor.has(String(inab.fornecedor_id))) {
              inabilitacoesPorFornecedor.set(String(inab.fornecedor_id), new Set());
            }
            inab.itens_afetados.forEach((item: number) => {
              inabilitacoesPorFornecedor.get(String(inab.fornecedor_id))!.add(Number(item));
            });
          }
        });

        const lancesValidos = (todosLances || []).filter((lance: any) => {
          const fornecedorLance = String(lance.fornecedor_id);
          const numeroItem = Number(lance.numero_item);
          const valorLance = Number(lance.valor_lance || 0);

          if (!Number.isFinite(numeroItem) || valorLance <= 0) return false;
          if (fornecedoresInabilitadosGlobalmente.has(fornecedorLance)) return false;

          const itensInab = inabilitacoesPorFornecedor.get(fornecedorLance);
          if (itensInab?.has(numeroItem)) return false;

          return true;
        });

        const vencedoresPorItem = new Map<number, any>();
        lancesValidos.forEach((lance: any) => {
          const key = Number(lance.numero_item || 0);
          if (!vencedoresPorItem.has(key)) {
            vencedoresPorItem.set(key, lance);
            return;
          }

          const atual = vencedoresPorItem.get(key);
          if (criterio === "desconto" || criterio === "maior_percentual_desconto") {
            if (Number(lance.valor_lance) > Number(atual.valor_lance)) {
              vencedoresPorItem.set(key, lance);
            }
          } else {
            if (Number(lance.valor_lance) < Number(atual.valor_lance)) {
              vencedoresPorItem.set(key, lance);
            }
          }
        });

        const meusLancesVencedores: any[] = [];
        vencedoresPorItem.forEach((lance) => {
          if (String(lance.fornecedor_id) === String(fornecedorId)) {
            meusLancesVencedores.push(lance);
          }
        });

        const lancesFinais = filtrarInabilitados(meusLancesVencedores);
        if (lancesFinais.length > 0) {
          await processarItensVencedores(selecaoId, lancesFinais, criterio, fornecedorData);
          return;
        }

        // Fornecedor confirmado como vencedor mas não ganhou via lances diretos
        // Cair para lógica de propostas originais abaixo
        console.log("📄 Fornecedor é vencedor mas não por lances diretos, verificando propostas...");
      }

      // FALLBACK: Identificar vencedor pela proposta original (sem lances ou lances não determinaram vencedor para este fornecedor)
      console.log("📄 Identificando vencedor pelas propostas originais (fallback)");

      const { data: todasPropostas } = await supabase
        .from("selecao_propostas_fornecedor")
        .select("id, fornecedor_id, valor_total_proposta")
        .eq("selecao_id", selecaoId);

      if (!todasPropostas || todasPropostas.length === 0) {
        toast.error("Nenhuma proposta encontrada para esta seleção");
        return;
      }

      const { data: inabilitadosGlobais } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      const fornecedoresInabilitadosGlobalmente = new Set<string>();
      inabilitadosGlobais?.forEach((inab: any) => {
        if (!inab.itens_afetados || inab.itens_afetados.length === 0) {
          fornecedoresInabilitadosGlobalmente.add(String(inab.fornecedor_id));
        }
      });

      const propostasValidas = todasPropostas.filter(
        (p: any) => !fornecedoresInabilitadosGlobalmente.has(String(p.fornecedor_id))
      );

      if (propostasValidas.length === 0) {
        toast.error("Não há propostas válidas (todos os fornecedores foram inabilitados)");
        return;
      }

      // Para critérios por_lote e por_item, não podemos fazer comparação global de valor_total_proposta
      // pois o fornecedor pode vencer lotes/itens específicos sem ser o mais barato no total geral.
      // A função processarItensVencedoresSemLances faz a análise granular correta.
      if (criterio === "por_lote" || criterio === "por_item") {
        const minhaPropostaFallback = propostasValidas.find((p: any) => String(p.fornecedor_id) === String(fornecedorId));
        if (!minhaPropostaFallback) {
          toast.error("Proposta do fornecedor não encontrada");
          return;
        }
        await processarItensVencedoresSemLances(selecaoId, fornecedorId, criterio, fornecedorData, minhaPropostaFallback);
        return;
      }

      const ehDesconto = criterio === "desconto" || criterio === "maior_percentual_desconto";
      propostasValidas.sort((a: any, b: any) => {
        if (ehDesconto) {
          return (b.valor_total_proposta || 0) - (a.valor_total_proposta || 0);
        }
        return (a.valor_total_proposta || 0) - (b.valor_total_proposta || 0);
      });

      const propostaVencedora = propostasValidas[0];
      if (String(propostaVencedora.fornecedor_id) !== String(fornecedorId)) {
        toast.error("Você não é o vencedor desta seleção");
        return;
      }

      await processarItensVencedoresSemLances(selecaoId, fornecedorId, criterio, fornecedorData, propostaVencedora);
    } catch (error) {
      console.error("Erro ao carregar itens vencedores:", error);
      toast.error("Erro ao carregar itens vencedores");
    }
  };

  const processarItensVencedores = async (selecaoId: string, lancesVencedores: any[], criterio: string, fornecedorData: any) => {
    // Buscar a cotação relacionada para obter descrições dos itens
    const { data: selecaoData } = await supabase
      .from("selecoes_fornecedores")
      .select("cotacao_relacionada_id")
      .eq("id", selecaoId)
      .single();

    if (!selecaoData?.cotacao_relacionada_id) return;

    const { data: itensCotacao } = await supabase
      .from("itens_cotacao")
      .select("*, lotes_cotacao(numero_lote, descricao_lote)")
      .eq("cotacao_id", selecaoData.cotacao_relacionada_id);

    if (!itensCotacao || !fornecedorData) return;

    // Buscar proposta do fornecedor para esta seleção
    const { data: propostaFornecedor } = await supabase
      .from("selecao_propostas_fornecedor")
      .select("id")
      .eq("selecao_id", selecaoId)
      .eq("fornecedor_id", fornecedorData.id)
      .maybeSingle();

    // Buscar marcas e valores da proposta original do fornecedor via proposta_id
    // Usar palavras-chave da descrição para matching
    const respostasOriginais: any[] = [];
    if (propostaFornecedor) {
      const { data } = await (supabase as any)
        .from("selecao_respostas_itens_fornecedor")
        .select("numero_item, lote_id, marca, descricao, valor_unitario_ofertado")
        .eq("proposta_id", propostaFornecedor.id);
      
      if (data) {
        respostasOriginais.push(...data);
      }
    }

    // Função para extrair palavras-chave de uma descrição
    const extrairPalavrasChave = (texto: string): string[] => {
      const palavrasIgnorar = new Set([
        'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'em', 'no', 'na', 
        'nos', 'nas', 'por', 'uma', 'um', 'e', 'ou', 'que', 'a', 'o',
        'tipo', 'uso', 'alta', 'alto', 'mínima', 'mínimo', 'máxima', 'máximo'
      ]);
      return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(p => p.length > 2 && !palavrasIgnorar.has(p));
    };

    const normalizarDescricao = (texto: string): string => {
      return (texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    // Função helper para buscar marca e valor original
    // REGRA CRÍTICA: em critério por_lote, numero_item pode se repetir em lotes diferentes.
    // Portanto, por_lote deve usar o identificador do lote (lote_id) + numero_item.
    const buscarDadosOriginaisPorDescricao = (
      descricaoItem: string,
      numeroItem: number,
      loteId?: string | null
    ): { marca: string; valorUnitario: number } => {
      // ======== LÓGICA ISOLADA: POR LOTE ========
      if (criterio === "por_lote") {
        // Se temos lote_id, fazemos matching determinístico (sem heurística) para evitar cruzar lotes.
        if (loteId) {
          const matchDireto = respostasOriginais.find(
            (r) => r?.lote_id === loteId && r?.numero_item === numeroItem
          );

          if (matchDireto) {
            return {
              marca: String(matchDireto?.marca || "").trim(),
              valorUnitario: Number(matchDireto?.valor_unitario_ofertado || 0),
            };
          }

          // Fallback seguro apenas para dados antigos sem lote_id: exige match EXATO de descrição
          const itemNorm = normalizarDescricao(descricaoItem);
          const candidatosSemLote = respostasOriginais.filter((r) => {
            if (r?.lote_id) return false;
            if (r?.numero_item !== numeroItem) return false;
            const descNorm = normalizarDescricao(String(r?.descricao || ""));
            return descNorm && itemNorm && descNorm === itemNorm;
          });

          if (candidatosSemLote.length === 1) {
            const r = candidatosSemLote[0];
            return {
              marca: String(r?.marca || "").trim(),
              valorUnitario: Number(r?.valor_unitario_ofertado || 0),
            };
          }

          // Se não achou com segurança, é melhor NÃO preencher do que preencher errado de outro lote.
          return { marca: "", valorUnitario: 0 };
        }

        // Sem lote_id (não esperado): manter comportamento anterior por descrição, mas sem fallback por numero_item.
        const itemNorm = normalizarDescricao(descricaoItem);

        if (itemNorm) {
          const candidatos = respostasOriginais
            .map((r) => ({
              r,
              descNorm: normalizarDescricao(String(r?.descricao || "")),
              marcaNorm: String(r?.marca || "").trim(),
            }))
            .filter(
              (c) =>
                c.marcaNorm &&
                c.descNorm &&
                (c.descNorm.startsWith(itemNorm) ||
                  itemNorm.startsWith(c.descNorm) ||
                  c.descNorm.includes(itemNorm) ||
                  itemNorm.includes(c.descNorm))
            )
            .sort((a, b) => {
              const aPrefix = a.descNorm.startsWith(itemNorm) || itemNorm.startsWith(a.descNorm);
              const bPrefix = b.descNorm.startsWith(itemNorm) || itemNorm.startsWith(b.descNorm);
              if (aPrefix !== bPrefix) return bPrefix ? 1 : -1;

              const lenDiffA = Math.abs(a.descNorm.length - itemNorm.length);
              const lenDiffB = Math.abs(b.descNorm.length - itemNorm.length);
              return lenDiffA - lenDiffB;
            });

          if (candidatos.length > 0) {
            const best = candidatos[0];
            return {
              marca: best.marcaNorm,
              valorUnitario: Number(best.r?.valor_unitario_ofertado || 0),
            };
          }
        }

        return { marca: "", valorUnitario: 0 };
      }

      // ======== OUTROS CRITÉRIOS (NÃO ALTERAR): match direto por numero_item ========
      const matchDirecto = respostasOriginais.find((r) => r.numero_item === numeroItem);
      if (matchDirecto) {
        return {
          marca: String(matchDirecto.marca || ""),
          valorUnitario: Number(matchDirecto.valor_unitario_ofertado || 0),
        };
      }

      // Fallback por palavras-chave (apenas se não encontrou pelo número)
      const palavrasItem = extrairPalavrasChave(descricaoItem);
      let melhorMatch = { marca: "", valorUnitario: 0, score: 0 };

      for (const resposta of respostasOriginais) {
        if (!resposta?.descricao) continue;

        const palavrasResposta = extrairPalavrasChave(String(resposta.descricao));
        let score = 0;

        for (const palavra of palavrasResposta) {
          if (palavrasItem.some((p) => p.includes(palavra) || palavra.includes(p))) score++;
        }

        if (score > melhorMatch.score && score >= 2) {
          melhorMatch = {
            marca: String(resposta.marca || ""),
            valorUnitario: Number(resposta.valor_unitario_ofertado || 0),
            score,
          };
        }
      }

      return { marca: melhorMatch.marca, valorUnitario: melhorMatch.valorUnitario };
    };

    const itensProcessados: ItemVencedor[] = [];
    const lotesMap = new Map<number, number>();
    let totalGanho = 0;

    if (criterio === "por_lote") {
      // Agrupar por lote
      const lotesPorNumero = new Map<number, { itens: any[], valorTotal: number }>();
      
      lancesVencedores.forEach((lance: any) => {
        const numeroLote = lance.numero_item; // Em por_lote, numero_item é o numero_lote
        if (!lotesPorNumero.has(numeroLote)) {
          lotesPorNumero.set(numeroLote, { itens: [], valorTotal: lance.valor_lance });
        }
        lotesMap.set(numeroLote, lance.valor_lance);
        totalGanho += lance.valor_lance;
      });

      // Buscar itens de cada lote ganho
      lotesPorNumero.forEach((loteInfo, numeroLote) => {
        const itensDoLote = itensCotacao.filter((item: any) => 
          item.lotes_cotacao?.numero_lote === numeroLote
        );
        
        itensDoLote.forEach((item: any) => {
          const dadosOriginais = buscarDadosOriginaisPorDescricao(item.descricao, item.numero_item, item.lote_id);
          itensProcessados.push({
            numero_item: item.numero_item,
            numero_lote: numeroLote,
            lote_id: item.lote_id || null,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            valor_total_ganho: loteInfo.valorTotal,
            marca: dadosOriginais.marca || item.marca || "",
            valor_unitario_proposta_original: dadosOriginais.valorUnitario,
          });
        });
      });

      setLotesGanhos(lotesMap);
    } else if (criterio === "global") {
      // Global: todos os itens com valor total
      const valorTotalGlobal = lancesVencedores[0]?.valor_lance || 0;
      totalGanho = valorTotalGlobal;

      itensCotacao.forEach((item: any) => {
        const dadosOriginais = buscarDadosOriginaisPorDescricao(item.descricao, item.numero_item);
        itensProcessados.push({
          numero_item: item.numero_item,
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
          valor_total_ganho: valorTotalGlobal,
          marca: dadosOriginais.marca || item.marca || "",
          valor_unitario_proposta_original: dadosOriginais.valorUnitario,
        });
      });
    } else {
      // Por item ou desconto - cada lance já é o valor unitário do item
      lancesVencedores.forEach((lance: any) => {
        const itemOriginal = itensCotacao.find((i: any) => i.numero_item === lance.numero_item);
        if (itemOriginal) {
          // Em por_item/desconto, lance.valor_lance é o valor UNITÁRIO
          const valorUnitario = lance.valor_lance;
          const valorTotal = valorUnitario * itemOriginal.quantidade;
          totalGanho += valorTotal;
          
          const dadosOriginais = buscarDadosOriginaisPorDescricao(itemOriginal.descricao, lance.numero_item);
          itensProcessados.push({
            numero_item: lance.numero_item,
            numero_lote: itemOriginal.lotes_cotacao?.numero_lote,
            lote_id: itemOriginal.lote_id || null,
            descricao: itemOriginal.descricao,
            quantidade: itemOriginal.quantidade,
            unidade: itemOriginal.unidade,
            valor_total_ganho: valorTotal,
            marca: dadosOriginais.marca || itemOriginal.marca || "",
            valor_unitario_lance: valorUnitario, // Guardar valor unitário do lance
            valor_unitario_proposta_original: dadosOriginais.valorUnitario,
          });
        }
      });
    }

    // Ordenar itens por numero_item em ordem CRESCENTE
    itensProcessados.sort((a, b) => a.numero_item - b.numero_item);

    setItensVencedores(itensProcessados);
    setValorTotalGanho(totalGanho);

    // Inicializar respostas baseado no critério
    const respostasIniciais: RespostaItem = {};

    // Para critérios por_item e desconto: preencher valores automaticamente (readonly)
    // Para critérios global e por_lote: preencher apenas marcas
    const preencherValoresAutomaticamente = criterio === "por_item" || criterio === "desconto";

    itensProcessados.forEach((item) => {
      const key = buildRespostaKey(criterio, item);

      if (preencherValoresAutomaticamente && item.valor_unitario_lance) {
        // Critério por_item ou desconto: valores já definidos na sessão de lances
        respostasIniciais[key] = {
          valor_unitario: item.valor_unitario_lance,
          marca: item.marca || "",
          valor_display: item.valor_unitario_lance.toFixed(2).replace(".", ","),
        };
      } else {
        // Critério global ou por_lote: apenas marcas preenchidas
        respostasIniciais[key] = {
          valor_unitario: 0,
          marca: item.marca || "",
          valor_display: "",
        };
      }
    });

    setRespostas(respostasIniciais);
  };

  // Nova função para processar itens quando não há lances (vencedor pela proposta original)
  const processarItensVencedoresSemLances = async (
    selecaoId: string,
    fornecedorId: string,
    criterio: string,
    fornecedorData: any,
    propostaVencedora: any
  ) => {
    try {
      console.log("📄 processarItensVencedoresSemLances iniciado", { selecaoId, fornecedorId, criterio });
      
      // Buscar a cotação relacionada para obter descrições dos itens
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("cotacao_relacionada_id")
        .eq("id", selecaoId)
        .single();

      if (!selecaoData?.cotacao_relacionada_id) {
        toast.error("Cotação relacionada não encontrada");
        return;
      }

      const cotacaoId = selecaoData.cotacao_relacionada_id;

      // Buscar estimativas da planilha consolidada mais recente
      const { data: planilhaData } = await supabase
        .from("planilhas_consolidadas")
        .select("estimativas_itens")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();

      const estimativas = (planilhaData?.estimativas_itens || {}) as Record<string, number>;

      const { data: itensCotacao } = await supabase
        .from("itens_cotacao")
        .select("*, lotes_cotacao(numero_lote, descricao_lote)")
        .eq("cotacao_id", cotacaoId);

      if (!itensCotacao) {
        toast.error("Itens da cotação não encontrados");
        return;
      }

      // Buscar TODAS as propostas de TODOS os fornecedores para identificar vencedor real por item
      const { data: todasPropostas } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          id, fornecedor_id, valor_total_proposta,
          selecao_respostas_itens_fornecedor (
            numero_item, lote_id, valor_unitario_ofertado, valor_total_item, marca, descricao, quantidade, unidade
          )
        `)
        .eq("selecao_id", selecaoId);

      if (!todasPropostas || todasPropostas.length === 0) {
        toast.error("Nenhuma proposta encontrada");
        return;
      }

      // Buscar inabilitações para excluir fornecedores inabilitados
      const { data: inabilitacoes } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      const fornecedoresInabilitadosGlobalmente = new Set<string>();
      const inabilitacoesPorFornecedor = new Map<string, Set<number>>();
      
      inabilitacoes?.forEach((inab: any) => {
        if (!inab.itens_afetados || inab.itens_afetados.length === 0) {
          fornecedoresInabilitadosGlobalmente.add(inab.fornecedor_id);
        } else {
          if (!inabilitacoesPorFornecedor.has(inab.fornecedor_id)) {
            inabilitacoesPorFornecedor.set(inab.fornecedor_id, new Set());
          }
          inab.itens_afetados.forEach((item: number) => {
            inabilitacoesPorFornecedor.get(inab.fornecedor_id)!.add(item);
          });
        }
      });

      // Proposta do fornecedor atual
      const minhaPropostaData = todasPropostas.find((p: any) => p.fornecedor_id === fornecedorId);
      if (!minhaPropostaData) {
        toast.error("Proposta do fornecedor não encontrada");
        return;
      }

      const meusItens = minhaPropostaData.selecao_respostas_itens_fornecedor || [];

      const itensProcessados: ItemVencedor[] = [];
      const lotesMap = new Map<number, number>();
      let totalGanho = 0;

      const ehDesconto = criterio === "desconto" || criterio === "maior_percentual_desconto";

      // Em por_lote, numero_item pode se repetir em lotes diferentes.
      // Priorizar sempre lote_id para evitar cruzamento incorreto de lotes.
      const obterNumeroLoteDoItem = (item: any): number => {
        if (item?.lote_id) {
          const matchPorLoteId = itensCotacao.find(
            (ic: any) => String(ic.lote_id) === String(item.lote_id)
          );
          const numeroLote = Number(matchPorLoteId?.lotes_cotacao?.numero_lote || 0);
          if (Number.isFinite(numeroLote) && numeroLote > 0) {
            return numeroLote;
          }
        }

        // Fallback legado: só usar numero_item se ele for único na cotação.
        const candidatosMesmoNumero = itensCotacao.filter(
          (ic: any) => Number(ic.numero_item) === Number(item?.numero_item)
        );
        if (candidatosMesmoNumero.length === 1) {
          return Number(candidatosMesmoNumero[0]?.lotes_cotacao?.numero_lote || 0);
        }

        const numeroLoteInformado = Number(item?.numero_lote || 0);
        return Number.isFinite(numeroLoteInformado) ? numeroLoteInformado : 0;
      };

      // ======= LÓGICA POR CRITÉRIO =======
      if (criterio === "por_lote") {
        // Buscar lances existentes para considerar lances + propostas
        const { data: lancesExistentes } = await supabase
          .from("lances_fornecedores")
          .select("fornecedor_id, numero_item, valor_lance")
          .eq("selecao_id", selecaoId);

        // Mapa de lances: numero_item(=lote) → Map<fornecedorId, melhorValor>
        const lancesPorLote = new Map<number, Map<string, number>>();
        (lancesExistentes || []).forEach((lance: any) => {
          const fId = String(lance.fornecedor_id);
          const lote = Number(lance.numero_item || 0);
          const valor = Number(lance.valor_lance || 0);
          if (!Number.isFinite(lote) || valor <= 0) return;
          if (fornecedoresInabilitadosGlobalmente.has(fId)) return;
          if (inabilitacoesPorFornecedor.get(fId)?.has(lote)) return;

          if (!lancesPorLote.has(lote)) lancesPorLote.set(lote, new Map());
          const porF = lancesPorLote.get(lote)!;
          const atual = porF.get(fId);
          if (atual == null || (ehDesconto ? valor > atual : valor < atual)) {
            porF.set(fId, valor);
          }
        });

        // Calcular totais por lote para cada fornecedor válido (propostas)
        const totaisPorLotePorFornecedor = new Map<number, Map<string, number>>();

        for (const proposta of todasPropostas) {
          if (fornecedoresInabilitadosGlobalmente.has(proposta.fornecedor_id)) continue;

          const itens = proposta.selecao_respostas_itens_fornecedor || [];
          for (const item of itens) {
            const numeroLote = obterNumeroLoteDoItem(item);
            if (numeroLote === 0) continue;

            // Verificar inabilitação granular por lote
            if (inabilitacoesPorFornecedor.get(proposta.fornecedor_id)?.has(numeroLote)) continue;

            if (!totaisPorLotePorFornecedor.has(numeroLote)) {
              totaisPorLotePorFornecedor.set(numeroLote, new Map());
            }
            const mapaFornecedores = totaisPorLotePorFornecedor.get(numeroLote)!;
            mapaFornecedores.set(
              proposta.fornecedor_id,
              (mapaFornecedores.get(proposta.fornecedor_id) || 0) + Number(item.valor_total_item || 0)
            );
          }
        }

        // Combinar todos os lotes (lances + propostas)
        const todosLotes = new Set<number>([...lancesPorLote.keys(), ...totaisPorLotePorFornecedor.keys()]);

        // Identificar vencedor de cada lote (lances têm prioridade sobre propostas)
        todosLotes.forEach((numeroLote) => {
          // Calcular estimativa do lote
          let estimativaLote = 0;
          itensCotacao.forEach((ic: any) => {
            if (ic.lotes_cotacao?.numero_lote === numeroLote) {
              const key = `${numeroLote}_${ic.numero_item}`;
              const estimUnit = Number(estimativas[key] || 0);
              estimativaLote += estimUnit * Number(ic.quantidade);
            }
          });

          // Tentar primeiro por lances
          let vencedorId: string | null = null;
          let valorVencedor = 0;

          const lancesDoLote = lancesPorLote.get(numeroLote);
          if (lancesDoLote && lancesDoLote.size > 0) {
            const candidatos = Array.from(lancesDoLote.entries())
              .filter(([, valor]) => estimativaLote === 0 || valor <= estimativaLote)
              .sort((a, b) => ehDesconto ? b[1] - a[1] : a[1] - b[1]);
            if (candidatos.length > 0) {
              [vencedorId, valorVencedor] = candidatos[0];
            }
          }

          // Se não encontrou por lance, tentar por proposta
          if (!vencedorId) {
            const propostasDoLote = totaisPorLotePorFornecedor.get(numeroLote);
            if (propostasDoLote && propostasDoLote.size > 0) {
              const candidatos = Array.from(propostasDoLote.entries())
                .filter(([, valor]) => estimativaLote === 0 || valor <= estimativaLote)
                .sort((a, b) => ehDesconto ? b[1] - a[1] : a[1] - b[1]);
              if (candidatos.length > 0) {
                [vencedorId, valorVencedor] = candidatos[0];
              }
            }
          }

          if (!vencedorId || vencedorId !== fornecedorId) return; // Não venceu este lote

          lotesMap.set(numeroLote, valorVencedor);
          totalGanho += valorVencedor;

          // Adicionar itens deste lote
          const meusItensLote = meusItens.filter((item: any) => {
            const numeroLoteItem = obterNumeroLoteDoItem(item);
            return numeroLoteItem === numeroLote;
          });

          meusItensLote.forEach((itemProposta: any) => {
            itensProcessados.push({
              numero_item: itemProposta.numero_item,
              numero_lote: numeroLote,
              lote_id: itemProposta.lote_id || null,
              descricao: itemProposta.descricao,
              quantidade: Number(itemProposta.quantidade),
              unidade: itemProposta.unidade || "",
              valor_total_ganho: valorVencedor,
              marca: itemProposta.marca || "",
              valor_unitario_proposta_original: Number(itemProposta.valor_unitario_ofertado || 0),
            });
          });
        });

        setLotesGanhos(lotesMap);

      } else if (criterio === "global") {
        // Calcular total global de cada fornecedor válido
        const totaisPorFornecedor: { fornecedorId: string; total: number }[] = [];

        for (const proposta of todasPropostas) {
          if (fornecedoresInabilitadosGlobalmente.has(proposta.fornecedor_id)) continue;
          totaisPorFornecedor.push({
            fornecedorId: proposta.fornecedor_id,
            total: Number(proposta.valor_total_proposta || 0)
          });
        }

        // Calcular estimativa global
        let estimativaGlobal = 0;
        itensCotacao.forEach((ic: any) => {
          const estimUnit = Number(estimativas[String(ic.numero_item)] || 0);
          estimativaGlobal += estimUnit * Number(ic.quantidade);
        });

        // Filtrar por estimativa e ordenar
        const validos = totaisPorFornecedor
          .filter(f => estimativaGlobal === 0 || f.total <= estimativaGlobal)
          .sort((a, b) => ehDesconto ? b.total - a.total : a.total - b.total);

        if (validos.length === 0) {
          toast.error("Seleção fracassada - nenhuma proposta válida");
          return;
        }

        if (validos[0].fornecedorId !== fornecedorId) {
          toast.error("Você não é o vencedor desta seleção");
          return;
        }

        totalGanho = validos[0].total;

        for (const itemProposta of meusItens) {
          itensProcessados.push({
            numero_item: itemProposta.numero_item,
            descricao: itemProposta.descricao,
            quantidade: Number(itemProposta.quantidade),
            unidade: itemProposta.unidade || "",
            valor_total_ganho: totalGanho,
            marca: itemProposta.marca || "",
            valor_unitario_proposta_original: Number(itemProposta.valor_unitario_ofertado || 0),
          });
        }

      } else {
        // Por item ou desconto - identificar vencedor de cada item separadamente
        const itensPorNumero = new Map<number, { fornecedorId: string; valor: number; itemProposta: any }[]>();

        for (const proposta of todasPropostas) {
          if (fornecedoresInabilitadosGlobalmente.has(proposta.fornecedor_id)) continue;

          const itens = proposta.selecao_respostas_itens_fornecedor || [];
          for (const item of itens) {
            // Verificar inabilitação granular por item
            if (inabilitacoesPorFornecedor.get(proposta.fornecedor_id)?.has(item.numero_item)) continue;

            if (!itensPorNumero.has(item.numero_item)) {
              itensPorNumero.set(item.numero_item, []);
            }
            itensPorNumero.get(item.numero_item)!.push({
              fornecedorId: proposta.fornecedor_id,
              valor: Number(item.valor_unitario_ofertado || 0),
              itemProposta: item
            });
          }
        }

        // Para cada item, identificar vencedor
        itensPorNumero.forEach((propostas, numeroItem) => {
          const itemCotacao = itensCotacao.find((ic: any) => ic.numero_item === numeroItem);
          const estimativaUnit = Number(estimativas[String(numeroItem)] || 0);

          // Filtrar propostas acima do estimado (FRACASSADO)
          const validas = propostas.filter(p => estimativaUnit === 0 || p.valor <= estimativaUnit);

          if (validas.length === 0) return; // Item fracassado

          // Ordenar por valor
          validas.sort((a, b) => ehDesconto ? b.valor - a.valor : a.valor - b.valor);

          const vencedor = validas[0];
          if (vencedor.fornecedorId !== fornecedorId) return; // Este fornecedor não venceu este item

          const quantidade = Number(vencedor.itemProposta.quantidade || itemCotacao?.quantidade || 1);
          const valorTotal = vencedor.valor * quantidade;
          totalGanho += valorTotal;

          itensProcessados.push({
            numero_item: numeroItem,
            numero_lote: itemCotacao?.lotes_cotacao?.numero_lote,
            lote_id: vencedor.itemProposta.lote_id || null,
            descricao: vencedor.itemProposta.descricao || itemCotacao?.descricao || "",
            quantidade: quantidade,
            unidade: vencedor.itemProposta.unidade || itemCotacao?.unidade || "",
            valor_total_ganho: valorTotal,
            marca: vencedor.itemProposta.marca || "",
            valor_unitario_lance: vencedor.valor,
            valor_unitario_proposta_original: vencedor.valor,
          });
        });
      }

      if (itensProcessados.length === 0) {
        toast.error("Você não tem itens vencedores nesta seleção");
        return;
      }

      // Ordenar itens por numero_item
      itensProcessados.sort((a, b) => a.numero_item - b.numero_item);

      setItensVencedores(itensProcessados);
      setValorTotalGanho(totalGanho);

      // Inicializar respostas baseado no critério
      const respostasIniciais: RespostaItem = {};
      const preencherValoresAutomaticamente = criterio === "por_item" || criterio === "desconto" || criterio === "maior_percentual_desconto";

      itensProcessados.forEach((item) => {
        const key = buildRespostaKey(criterio, item);

        if (preencherValoresAutomaticamente && item.valor_unitario_proposta_original) {
          respostasIniciais[key] = {
            valor_unitario: item.valor_unitario_proposta_original,
            marca: item.marca || "",
            valor_display: item.valor_unitario_proposta_original.toFixed(2).replace(".", ","),
          };
        } else {
          respostasIniciais[key] = {
            valor_unitario: 0,
            marca: item.marca || "",
            valor_display: "",
          };
        }
      });

      setRespostas(respostasIniciais);
      console.log("✅ processarItensVencedoresSemLances concluído", { itensProcessados: itensProcessados.length, totalGanho });
    } catch (error) {
      console.error("Erro ao processar itens vencedores sem lances:", error);
      toast.error("Erro ao carregar itens da proposta");
    }
  };

  const handleValorChange = (item: ItemVencedor, valor: string) => {
    const key = getRespostaKey(item);
    const valorLimpo = limitarDuasCasasDecimais(valor);
    const valorNumerico = truncarDuasCasas(parseFloat(valorLimpo.replace(",", ".")) || 0);

    // Validar se o valor não excede o valor da proposta original
    if (
      item?.valor_unitario_proposta_original &&
      valorNumerico > item.valor_unitario_proposta_original + 0.001
    ) {
      toast.error(
        `O valor unitário não pode ser maior que o valor da proposta original (${formatCurrency(item.valor_unitario_proposta_original)})`
      );
      return;
    }

    setRespostas((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        valor_unitario: valorNumerico,
        valor_display: valorLimpo,
      },
    }));
  };

  const handleMarcaChange = (item: ItemVencedor, marca: string) => {
    const key = getRespostaKey(item);

    setRespostas((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        marca,
      },
    }));
  };

  const calcularValorTotal = () => {
    return itensVencedores.reduce((total, item) => {
      const resposta = respostas[getRespostaKey(item)];
      if (resposta?.valor_unitario) {
        return total + resposta.valor_unitario * item.quantidade;
      }
      return total;
    }, 0);
  };

  const validarTotaisPorLote = (): { valido: boolean; mensagem?: string } => {
    if (criterioJulgamento === "por_lote") {
      // Verificar se cada lote tem total igual ou menor ao valor ganho
      const totaisPorLote = new Map<number, number>();

      itensVencedores.forEach((item) => {
        if (item.numero_lote) {
          const resposta = respostas[getRespostaKey(item)];
          const valorItem = (resposta?.valor_unitario || 0) * item.quantidade;
          totaisPorLote.set(
            item.numero_lote,
            (totaisPorLote.get(item.numero_lote) || 0) + valorItem
          );
        }
      });

      for (const [numeroLote, totalPreenchido] of totaisPorLote.entries()) {
        const valorGanho = lotesGanhos.get(numeroLote) || 0;

        // Não permitir valor MAIOR que o ganho
        if (totalPreenchido > valorGanho + 0.01) {
          return {
            valido: false,
            mensagem: `O total do Lote ${numeroLote} (${formatCurrency(totalPreenchido)}) não pode ser maior que o valor ganho (${formatCurrency(valorGanho)})`,
          };
        }

        // Valor MENOR é permitido se observações estiverem preenchidas
        if (totalPreenchido < valorGanho - 0.01 && !observacoes.trim()) {
          return {
            valido: false,
            mensagem: `O total do Lote ${numeroLote} (${formatCurrency(totalPreenchido)}) é menor que o valor ganho (${formatCurrency(valorGanho)}). Preencha as observações para justificar o desconto adicional.`,
          };
        }
      }
    } else if (criterioJulgamento === "global") {
      const totalPreenchido = calcularValorTotal();

      // Não permitir valor MAIOR que o ganho
      if (totalPreenchido > valorTotalGanho + 0.01) {
        return {
          valido: false,
          mensagem: `O total da proposta (${formatCurrency(totalPreenchido)}) não pode ser maior que o valor ganho (${formatCurrency(valorTotalGanho)})`,
        };
      }

      // Valor MENOR é permitido se observações estiverem preenchidas
      if (totalPreenchido < valorTotalGanho - 0.01 && !observacoes.trim()) {
        return {
          valido: false,
          mensagem: `O total da proposta (${formatCurrency(totalPreenchido)}) é menor que o valor ganho (${formatCurrency(valorTotalGanho)}). Preencha as observações para justificar o desconto adicional.`,
        };
      }
    }

    return { valido: true };
  };

  const handlePreSubmit = () => {
    // Verificar responsáveis legais do fornecedor
    const responsaveis = fornecedor?.responsaveis_legais;
    const responsaveisArray = Array.isArray(responsaveis)
      ? (responsaveis as string[]).filter((r: string) => r && r.trim() !== '')
      : [];

    if (responsaveisArray.length > 1) {
      setResponsaveisLegaisDisponiveis(responsaveisArray);
      setDialogResponsavelLegalOpen(true);
      return;
    } else if (responsaveisArray.length === 1) {
      responsavelLegalRef.current = responsaveisArray[0];
    } else {
      responsavelLegalRef.current = undefined;
    }
    handleSubmit();
  };

  const handleConfirmarResponsavelLegal = (selecionados: string[]) => {
    responsavelLegalRef.current = selecionados.join(', ');
    setDialogResponsavelLegalOpen(false);
    handleSubmit();
  };

  const handleSubmit = async () => {
    // Validar preenchimento
    const itensNaoPreenchidos = itensVencedores.filter(
      (item) => !respostas[getRespostaKey(item)]?.valor_unitario
    );

    if (itensNaoPreenchidos.length > 0) {
      toast.error("Preencha o valor unitário de todos os itens");
      return;
    }

    // Validar se algum item excede o valor da proposta original
    for (const item of itensVencedores) {
      const resposta = respostas[getRespostaKey(item)];
      if (
        item.valor_unitario_proposta_original &&
        resposta?.valor_unitario > item.valor_unitario_proposta_original + 0.001
      ) {
        toast.error(
          `Item ${item.numero_item}: O valor unitário (${formatCurrency(resposta.valor_unitario)}) não pode ser maior que o valor da proposta original (${formatCurrency(item.valor_unitario_proposta_original)})`
        );
        return;
      }
    }

    // Validar totais por lote/global
    const validacao = validarTotaisPorLote();
    if (!validacao.valido) {
      toast.error(validacao.mensagem);
      return;
    }

    setSubmitting(true);
    try {
      const valorTotal = calcularValorTotal();

      // Preparar itens para PDF
      const itensParaPDF = itensVencedores.map((item) => {
        const resposta = respostas[getRespostaKey(item)];
        return {
          numero_item: item.numero_item,
          numero_lote: item.numero_lote || null,
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
          valor_unitario: resposta.valor_unitario,
          valor_total: resposta.valor_unitario * item.quantidade,
          marca: resposta.marca || null,
        };
      });

      // Gerar PDF (protocolo é gerado internamente)
      const { pdfUrl, protocolo } = await gerarPropostaRealinhadaPDF(
        itensParaPDF,
        {
          razao_social: fornecedor.razao_social,
          cnpj: fornecedor.cnpj,
          email: fornecedor.email,
          telefone: fornecedor.telefone,
          endereco_comercial: fornecedor.endereco_comercial,
        },
        {
          numero_processo_interno: processo.numero_processo_interno,
          objeto_resumido: processo.objeto_resumido,
          criterio_julgamento: criterioJulgamento,
        },
        observacoes,
        processo?.tipo,
        responsavelLegalRef.current
      );

      // Criar proposta realinhada com URL do PDF
      const { data: proposta, error: propostaError } = await supabase
        .from("propostas_realinhadas")
        .upsert(
          {
            selecao_id: selecaoId,
            fornecedor_id: fornecedor.id,
            valor_total_proposta: valorTotal,
            observacoes,
            protocolo,
            url_pdf_proposta: pdfUrl,
            nome_responsavel_legal: responsavelLegalRef.current || null,
          },
          { onConflict: "selecao_id,fornecedor_id" }
        )
        .select()
        .single();

      if (propostaError) throw propostaError;

      // Deletar itens existentes se for atualização
      await supabase
        .from("propostas_realinhadas_itens")
        .delete()
        .eq("proposta_realinhada_id", proposta.id);

      // Inserir itens
      const itensParaInserir = itensVencedores.map((item) => {
        const resposta = respostas[getRespostaKey(item)];
        return {
          proposta_realinhada_id: proposta.id,
          numero_item: item.numero_item,
          numero_lote: item.numero_lote || null,
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
          valor_unitario: resposta.valor_unitario,
          valor_total: resposta.valor_unitario * item.quantidade,
          marca: resposta.marca || null,
        };
      });

      const { error: itensError } = await supabase
        .from("propostas_realinhadas_itens")
        .insert(itensParaInserir);

      if (itensError) throw itensError;

      toast.success("Proposta realinhada enviada com sucesso!");
      setJaEnviouProposta(true);
      setPropostaExistente(proposta);
    } catch (error) {
      console.error("Erro ao enviar proposta:", error);
      toast.error("Erro ao enviar proposta realinhada");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (jaEnviouProposta && propostaExistente) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl py-8">
          <div className="flex justify-center mb-6">
            <img src={primaLogo} alt="Prima Qualità" className="h-16" />
          </div>

          <Card className="border-green-500 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <Check className="h-6 w-6" />
                Proposta Realinhada Enviada
              </CardTitle>
              <CardDescription>
                Sua proposta realinhada já foi enviada com sucesso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p><strong>Protocolo:</strong> {propostaExistente.protocolo}</p>
                <p><strong>Valor Total:</strong> {formatCurrency(propostaExistente.valor_total_proposta)}</p>
                <p><strong>Data de Envio:</strong> {new Date(propostaExistente.data_envio).toLocaleString("pt-BR")}</p>
              </div>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Agrupar itens por lote se critério for por_lote
  const itensAgrupados = criterioJulgamento === "por_lote"
    ? Array.from(
        itensVencedores.reduce((map, item) => {
          const lote = item.numero_lote || 0;
          if (!map.has(lote)) map.set(lote, []);
          map.get(lote)!.push(item);
          return map;
        }, new Map<number, ItemVencedor[]>())
      )
    : [[0, itensVencedores] as [number, ItemVencedor[]]];

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl py-8">
        <div className="flex justify-center mb-6">
          <img src={primaLogo} alt="Prima Qualità" className="h-16" />
        </div>

        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Proposta Realinhada</CardTitle>
            <CardDescription>
              Preencha os valores unitários para os itens que você ganhou.
              {criterioJulgamento === "por_lote" && (
                <span className="block mt-2 text-amber-600">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  Para cada lote, o total dos valores deve ser igual ao valor ganho no lance.
                </span>
              )}
              {criterioJulgamento === "global" && (
                <span className="block mt-2 text-amber-600">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  O total da proposta deve ser igual ao valor ganho ({formatCurrency(valorTotalGanho)}).
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Processo</p>
                <p className="font-medium">{processo?.numero_processo_interno}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Critério de Julgamento</p>
                <p className="font-medium">{criterioJulgamento}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fornecedor</p>
                <p className="font-medium">{fornecedor?.razao_social}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor Total Ganho</p>
                <p className="font-medium text-green-600">{formatCurrency(valorTotalGanho)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mensagem informativa sobre preenchimento */}
        {(criterioJulgamento === "por_item" || criterioJulgamento === "desconto") && (
          <Card className="mb-4 border-green-500 bg-green-50 dark:bg-green-950/20">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">
                  Os valores unitários já foram preenchidos automaticamente com base nos lances vencedores da sessão.
                </span>
              </div>
            </CardContent>
          </Card>
        )}
        
        {(criterioJulgamento === "global" || criterioJulgamento === "por_lote") && (
          <Card className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {criterioJulgamento === "global" 
                    ? `Preencha os valores unitários de cada item. O total deve ser igual a ${formatCurrency(valorTotalGanho)}.`
                    : "Preencha os valores unitários de cada item. O total de cada lote deve ser igual ao valor ganho."
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Itens agrupados */}
        {itensAgrupados.map(([numeroLote, itensDoLote]) => (
          <Card key={numeroLote} className="mb-6">
            <CardHeader className="py-3">
              {criterioJulgamento === "por_lote" && numeroLote > 0 ? (
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Lote {numeroLote}
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    Valor ganho: {formatCurrency(lotesGanhos.get(numeroLote) || 0)}
                  </span>
                </div>
              ) : (
                <CardTitle className="text-base">Itens Vencedores</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Item</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-20">Qtd</TableHead>
                    <TableHead className="w-20">Unid.</TableHead>
                    {processo?.tipo === "material" && (
                      <TableHead className="w-32">Marca</TableHead>
                    )}
                    <TableHead className="w-36">Valor Unitário</TableHead>
                    <TableHead className="w-32 text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensDoLote.map((item) => {
                    const key = getRespostaKey(item);
                    const resposta = respostas[key];
                    const valorTotal = (resposta?.valor_unitario || 0) * item.quantidade;
                    const valorReadonly =
                      criterioJulgamento === "por_item" || criterioJulgamento === "desconto";

                    return (
                      <TableRow key={key}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell className="text-sm">{item.descricao}</TableCell>
                        <TableCell>{item.quantidade}</TableCell>
                        <TableCell>{item.unidade}</TableCell>
                        {processo?.tipo === "material" && (
                          <TableCell className="text-center">
                            <span className="text-sm">{resposta?.marca || item.marca || ""}</span>
                          </TableCell>
                        )}
                        <TableCell>
                          {valorReadonly ? (
                            <span className="text-sm font-medium text-foreground">
                              {resposta?.valor_display ||
                                formatCurrency(resposta?.valor_unitario || 0)
                                  .replace("R$", "")
                                  .trim()}
                            </span>
                          ) : (
                            <Input
                              type="text"
                              value={resposta?.valor_display || ""}
                              onChange={(e) => handleValorChange(item, e.target.value)}
                              placeholder="0,00"
                              className="h-8"
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(valorTotal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {criterioJulgamento === "por_lote" && numeroLote > 0 && (
                    <TableRow className="bg-muted font-bold">
                      <TableCell
                        colSpan={processo?.tipo === "material" ? 5 : 4}
                        className="text-right"
                      >
                        Subtotal do Lote
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(
                          itensDoLote.reduce((acc, item) => {
                            const resposta = respostas[getRespostaKey(item)];
                            return acc + (resposta?.valor_unitario || 0) * item.quantidade;
                          }, 0)
                        )}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        {/* Total Geral */}
        <Card className="mb-6 border-primary">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Valor Total da Proposta Realinhada</span>
              <span className="text-2xl font-bold text-primary">
                {formatCurrency(calcularValorTotal())}
              </span>
            </div>
            {(criterioJulgamento === "por_lote" || criterioJulgamento === "global") && (
              <div className="mt-2 text-sm text-muted-foreground">
                Valor ganho: {formatCurrency(valorTotalGanho)}
                {Math.abs(calcularValorTotal() - valorTotalGanho) > 0.01 && (
                  <span className="text-red-500 ml-2">
                    (Diferença: {formatCurrency(calcularValorTotal() - valorTotalGanho)})
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Observações */}
        <Card className="mb-6">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Observações (opcional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações adicionais..."
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Botão Enviar */}
        <Button
          className="w-full"
          size="lg"
          onClick={handlePreSubmit}
          disabled={submitting || itensVencedores.length === 0}
        >
          {submitting ? (
            "Enviando..."
          ) : (
            <>
              <Save className="h-5 w-5 mr-2" />
              Enviar Proposta Realinhada
            </>
          )}
        </Button>
      </div>

      <DialogSelecionarResponsavelLegal
        open={dialogResponsavelLegalOpen}
        onOpenChange={setDialogResponsavelLegalOpen}
        responsaveisLegais={responsaveisLegaisDisponiveis}
        onConfirm={handleConfirmarResponsavelLegal}
        loading={submitting}
      />
    </div>
  );
};

export default PropostaRealinhada;
