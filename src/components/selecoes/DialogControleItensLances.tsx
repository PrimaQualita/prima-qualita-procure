import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Gavel, Lock, Unlock, Handshake, Trophy, Ban } from "lucide-react";
import { ChatSelecao } from "./ChatSelecao";
import { Badge } from "@/components/ui/badge";

interface Item {
  numero_item: number;
  descricao: string;
}

interface DialogControleItensLancesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecaoId: string;
  itens: Item[];
  onVencedoresAtualizados?: () => void;
}

export function DialogControleItensLances({
  open,
  onOpenChange,
  selecaoId,
  itens,
}: DialogControleItensLancesProps) {
  console.log("🎯 COMPONENT RENDER: DialogControleItensLances renderizando - open:", open, "selecaoId:", selecaoId, "itens:", itens?.length);
  
  const [itensAbertos, setItensAbertos] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());
  const [itensEmNegociacao, setItensEmNegociacao] = useState<Map<number, string>>(new Map()); // Map<numeroItem, fornecedorId>
  const [itensNegociacaoConcluida, setItensNegociacaoConcluida] = useState<Set<number>>(new Set()); // Itens que já foram negociados
  const [vencedoresPorItem, setVencedoresPorItem] = useState<Map<number, { fornecedorId: string; razaoSocial: string; valorLance: number }>>(new Map());

  useEffect(() => {
    console.log("🔧 USEEFFECT: Executado - open:", open, "selecaoId:", selecaoId);
    
    if (open) {
      console.log("✅ USEEFFECT: Diálogo ABERTO! Iniciando configurações...");
      loadItensAbertos();
      loadVencedoresPorItem();
      
      // Subscrição realtime para itens abertos
      const channelItens = supabase
        .channel(`itens_abertos_gestor_${selecaoId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "itens_abertos_lances",
            filter: `selecao_id=eq.${selecaoId}`,
          },
          () => {
            loadItensAbertos();
          }
        )
        .subscribe();

      // Subscrição realtime para lances de negociação
      const channelLances = supabase
        .channel(`lances_negociacao_gestor_${selecaoId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "lances_fornecedores",
            filter: `selecao_id=eq.${selecaoId}`,
          },
          async (payload: any) => {
            console.log("🔔 REALTIME: Novo lance detectado!", payload.new);
            console.log("🔍 REALTIME: tipo_lance =", payload.new.tipo_lance);
            console.log("🔍 REALTIME: numero_item =", payload.new.numero_item);
            
            // Se for um lance de negociação, fechar o item automaticamente
            if (payload.new.tipo_lance === 'negociacao') {
              console.log("✅ REALTIME: É lance de negociação! Fechando item:", payload.new.numero_item);
              await fecharItemNegociacao(payload.new.numero_item);
            } else {
              console.log("⚠️ REALTIME: NÃO é lance de negociação (tipo:", payload.new.tipo_lance, ")");
            }
          }
        )
        .subscribe((status) => {
          console.log("📡 REALTIME: Status do canal de lances:", status);
        });

      // Polling a cada 3 segundos como fallback
      console.log("⏰ USEEFFECT: Configurando polling a cada 3 segundos...");
      const pollingInterval = setInterval(() => {
        console.log("⏰ POLLING: Executando ciclo de verificação...");
        loadItensAbertos();
        loadVencedoresPorItem();
      }, 3000);

      return () => {
        console.log("🔴 USEEFFECT: Limpando recursos (desmontando componente)");
        supabase.removeChannel(channelItens);
        supabase.removeChannel(channelLances);
        clearInterval(pollingInterval);
      };
    } else {
      console.log("⚠️ USEEFFECT: Diálogo FECHADO - não configurando recursos");
    }
  }, [open, selecaoId]);

  const verificarFechamentoAutomatico = async () => {
    console.log("🔍 verificarFechamentoAutomatico: INICIANDO verificação...");
    try {
      // 1. Buscar itens que estão em processo de fechamento e já deveriam ter fechado
      // EXCLUIR itens que foram abertos recentemente (últimos 10 segundos) para evitar race conditions
      const dezSegundosAtras = new Date(Date.now() - 10000).toISOString();
      
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("aberto", true)
        .eq("iniciando_fechamento", true)
        .lt("data_abertura", dezSegundosAtras); // Só verificar itens abertos há mais de 10 segundos

      if (error) throw error;

      const agora = Date.now();
      
      for (const item of data || []) {
        if (item.data_inicio_fechamento && item.segundos_para_fechar !== null) {
          const inicioFechamento = new Date(item.data_inicio_fechamento).getTime();
          const tempoExpiracao = inicioFechamento + (item.segundos_para_fechar * 1000);
          
          if (agora >= tempoExpiracao) {
            // Tempo expirou, fechar o item
            console.log(`Fechando item ${item.numero_item} automaticamente por tempo`);
            await supabase
              .from("itens_abertos_lances")
              .update({ 
                aberto: false, 
                data_fechamento: new Date().toISOString(),
                iniciando_fechamento: false
              })
              .eq("id", item.id);
          }
        }
      }

      // 2. Verificar lances de negociação recentes (últimos 60 segundos) e fechar item automaticamente
      const sessentaSegundosAtras = new Date(Date.now() - 60000).toISOString();
      console.log("🔍 POLLING FALLBACK: Buscando lances de negociação desde:", sessentaSegundosAtras);
      console.log("🔍 POLLING FALLBACK: Itens em negociação atual:", Array.from(itensEmNegociacao));
      
      const { data: lancesNegociacao, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select("numero_item, created_at, tipo_lance, fornecedor_id")
        .eq("selecao_id", selecaoId)
        .eq("tipo_lance", "negociacao")
        .gte("created_at", sessentaSegundosAtras);

      console.log("🔍 POLLING FALLBACK: Lances de negociação encontrados:", lancesNegociacao);

      if (lancesError) {
        console.error("❌ POLLING FALLBACK: Erro ao verificar lances de negociação:", lancesError);
      } else if (lancesNegociacao && lancesNegociacao.length > 0) {
        console.log("✅ POLLING FALLBACK: Total de lances de negociação recentes:", lancesNegociacao.length);
        
        // Para cada lance de negociação recente, verificar se o item ainda está em negociação
        for (const lance of lancesNegociacao) {
          console.log(`🔍 POLLING FALLBACK: Verificando lance - Item ${lance.numero_item}, Em negociação: ${itensEmNegociacao.has(lance.numero_item)}`);
          
          if (itensEmNegociacao.has(lance.numero_item)) {
            console.log("🔒 POLLING FALLBACK: Fechando item de negociação:", lance.numero_item);
            await fecharItemNegociacao(lance.numero_item);
          }
        }
      } else {
        console.log("⚠️ POLLING FALLBACK: Nenhum lance de negociação recente encontrado");
      }
    } catch (error) {
      console.error("Erro ao verificar fechamento automático:", error);
    }
  };

  const fecharItemNegociacao = async (numeroItem: number) => {
    try {
      console.log("🔒 Fechando item de negociação automaticamente:", numeroItem);
      
      const { error } = await supabase
        .from("itens_abertos_lances")
        .update({
          em_negociacao: false,
          negociacao_concluida: true,
          aberto: false,
          data_fechamento: new Date().toISOString()
        })
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem);

      if (error) {
        console.error("Erro ao fechar item de negociação:", error);
        throw error;
      }

      console.log("✅ Item de negociação fechado com sucesso");
      toast.success(`Item ${numeroItem} fechado automaticamente após negociação`);
      
      // Recarregar dados
      loadItensAbertos();
      loadVencedoresPorItem();
    } catch (error) {
      console.error("Erro ao fechar item de negociação:", error);
      toast.error("Erro ao fechar item de negociação");
    }
  };

  const loadItensAbertos = async () => {
    try {
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select("*")
        .eq("selecao_id", selecaoId);

      if (error) throw error;

      const abertos = new Set(data?.filter((item) => item.aberto).map((item) => item.numero_item) || []);
      setItensAbertos(abertos);

      // Mapear itens em negociação
      const emNegociacao = new Map<number, string>();
      data?.forEach((item) => {
        if (item.em_negociacao && item.fornecedor_negociacao_id) {
          emNegociacao.set(item.numero_item, item.fornecedor_negociacao_id);
        }
      });
      setItensEmNegociacao(emNegociacao);

      // Mapear itens com negociação concluída ou marcados como "não negociar"
      const concluidos = new Set<number>();
      data?.forEach((item) => {
        if (item.negociacao_concluida || item.nao_negociar) {
          concluidos.add(item.numero_item);
        }
      });
      setItensNegociacaoConcluida(concluidos);
    } catch (error) {
      console.error("Erro ao carregar itens abertos:", error);
    }
  };

  const loadVencedoresPorItem = async () => {
    try {
      console.log("🔄 [LOAD VENCEDORES] Carregando vencedores...");
      
      // Buscar lances marcados como vencedores
      const { data: lancesVencedores, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select("*, fornecedores(id, razao_social)")
        .eq("selecao_id", selecaoId)
        .eq("indicativo_lance_vencedor", true);

      if (lancesError) throw lancesError;

      console.log(`📊 [LOAD VENCEDORES] Lances vencedores encontrados: ${lancesVencedores?.length || 0}`);
      
      // Buscar fornecedores inabilitados
      const { data: inabilitados } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      const fornecedoresInabilitadosMap = new Map<string, number[]>();
      inabilitados?.forEach(i => {
        fornecedoresInabilitadosMap.set(i.fornecedor_id, i.itens_afetados || []);
      });

      console.log(`🚫 [LOAD VENCEDORES] Fornecedores inabilitados:`, Array.from(fornecedoresInabilitadosMap.keys()));

      // Buscar todos os lances (incluindo negociação) ordenados
      const { data: todosLances } = await supabase
        .from("lances_fornecedores")
        .select("*, fornecedores(id, razao_social)")
        .eq("selecao_id", selecaoId)
        .order("valor_lance", { ascending: false }); // Ordenar do maior para menor (prioriza negociação e desconto)

      console.log("🎯 Lances ordenados com priorização de negociação:", todosLances);

      // Criar mapa de vencedores
      const vencedoresMap = new Map<number, { fornecedorId: string; razaoSocial: string; valorLance: number }>();
      
      // Processar cada item
      for (const item of itens) {
        const lancesDoItem = todosLances?.filter(l => l.numero_item === item.numero_item) || [];
        
        // Filtrar lances válidos (não inabilitados)
        const lancesValidos = lancesDoItem.filter(l => {
          const inabilitacoes = fornecedoresInabilitadosMap.get(l.fornecedor_id);
          if (!inabilitacoes) return true; // Não está inabilitado
          if (inabilitacoes.length === 0) return false; // Inabilitação geral
          return !inabilitacoes.includes(item.numero_item); // Verificar se o item está afetado
        });

        if (lancesValidos.length === 0) continue;

        // Priorizar lances de negociação, depois buscar por indicativo_lance_vencedor
        const lanceNegociacao = lancesValidos.find(l => l.tipo_lance === 'negociacao');
        const lanceVencedor = lancesValidos.find(l => l.indicativo_lance_vencedor === true);
        const vencedorFinal = lanceNegociacao || lanceVencedor || lancesValidos[0];

        if (vencedorFinal) {
          const fornecedorInfo = vencedorFinal.fornecedores || 
            lancesVencedores?.find(lv => lv.fornecedor_id === vencedorFinal.fornecedor_id)?.fornecedores;

          vencedoresMap.set(item.numero_item, {
            fornecedorId: vencedorFinal.fornecedor_id,
            razaoSocial: fornecedorInfo?.razao_social || 'Fornecedor',
            valorLance: vencedorFinal.valor_lance
          });
        }
      }

      console.log("🏆 Vencedores carregados (com priorização de negociação):", Array.from(vencedoresMap.entries()));
      setVencedoresPorItem(vencedoresMap);
    } catch (error) {
      console.error("Erro ao carregar vencedores:", error);
    }
  };

  const handleToggleItem = (numeroItem: number) => {
    const novos = new Set(itensSelecionados);
    if (novos.has(numeroItem)) {
      novos.delete(numeroItem);
    } else {
      novos.add(numeroItem);
    }
    setItensSelecionados(novos);
  };

  const handleSelecionarTodos = () => {
    setItensSelecionados(new Set(itens.map((item) => item.numero_item)));
  };

  const handleLimparSelecao = () => {
    setItensSelecionados(new Set());
  };

  const handleAbrirItens = async () => {
    if (itensSelecionados.size === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setSalvando(true);
    try {
      // Verificar quais itens já existem
      const { data: existentes } = await supabase
        .from("itens_abertos_lances")
        .select("numero_item")
        .eq("selecao_id", selecaoId)
        .in("numero_item", Array.from(itensSelecionados));

      const numerosExistentes = new Set(existentes?.map(e => e.numero_item) || []);

      // Atualizar itens existentes - LIMPAR TODOS OS CAMPOS (negociação + fechamento)
      if (numerosExistentes.size > 0) {
        await supabase
          .from("itens_abertos_lances")
          .update({ 
            aberto: true, 
            data_fechamento: null,
            iniciando_fechamento: false,
            data_inicio_fechamento: null,
            segundos_para_fechar: null,
            em_negociacao: false,
            fornecedor_negociacao_id: null,
            negociacao_concluida: false,
            nao_negociar: false
          })
          .eq("selecao_id", selecaoId)
          .in("numero_item", Array.from(numerosExistentes));

        // CRÍTICO: Recalcular vencedores ao reabrir itens
        console.log("🔄 [REABRIR] Recalculando vencedores para itens:", Array.from(numerosExistentes));
        
        // Buscar critério de julgamento
        const { data: selecaoData } = await supabase
          .from("selecoes_fornecedores")
          .select("cotacao:cotacoes_precos(criterio_julgamento)")
          .eq("id", selecaoId)
          .single();

        const isDesconto = selecaoData?.cotacao?.criterio_julgamento === "desconto";
        console.log("🎯 [REABRIR] Critério de julgamento:", selecaoData?.cotacao?.criterio_julgamento, "| isDesconto:", isDesconto);
        
        for (const numeroItem of numerosExistentes) {
          console.log(`\n📦 [REABRIR ITEM ${numeroItem}] Iniciando recálculo...`);
          
          // 1. Desmarcar todos os lances do item
          console.log(`🔄 [REABRIR ITEM ${numeroItem}] Desmarcando todos os lances...`);
          await supabase
            .from("lances_fornecedores")
            .update({ indicativo_lance_vencedor: false })
            .eq("selecao_id", selecaoId)
            .eq("numero_item", numeroItem);

          // 2. Buscar todos os lances válidos (não inabilitados)
          const { data: lancesItem } = await supabase
            .from("lances_fornecedores")
            .select("*, fornecedores(id, razao_social)")
            .eq("selecao_id", selecaoId)
            .eq("numero_item", numeroItem)
            .order("data_hora_lance", { ascending: false });

          console.log(`📋 [REABRIR ITEM ${numeroItem}] Total de lances encontrados: ${lancesItem?.length || 0}`);
          console.log(`📊 [REABRIR ITEM ${numeroItem}] Valores dos lances:`, lancesItem?.map(l => `${l.fornecedores?.razao_social}: ${l.valor_lance}`).join(', '));
          
          if (!lancesItem || lancesItem.length === 0) {
            console.log(`⚠️ [REABRIR ITEM ${numeroItem}] Nenhum lance encontrado, pulando...`);
            continue;
          }

          // 3. Buscar fornecedores inabilitados
          const { data: inabilitados } = await supabase
            .from("fornecedores_inabilitados_selecao")
            .select("fornecedor_id, itens_afetados")
            .eq("selecao_id", selecaoId)
            .eq("revertido", false);

          const fornecedoresInabilitadosIds = new Set(
            inabilitados?.filter(i => 
              !i.itens_afetados || i.itens_afetados.length === 0 || i.itens_afetados.includes(numeroItem)
            ).map(i => i.fornecedor_id) || []
          );

          console.log(`🚫 [REABRIR ITEM ${numeroItem}] Fornecedores inabilitados:`, Array.from(fornecedoresInabilitadosIds));

          // 4. Filtrar lances válidos
          const lancesValidos = lancesItem.filter(l => !fornecedoresInabilitadosIds.has(l.fornecedor_id));
          console.log(`✅ [REABRIR ITEM ${numeroItem}] Lances válidos após filtro: ${lancesValidos.length}`);
          
          if (lancesValidos.length === 0) {
            console.log(`⚠️ [REABRIR ITEM ${numeroItem}] Nenhum lance válido, pulando...`);
            continue;
          }

          // 5. Ordenar por critério (desconto = decrescente, preço = crescente)
          console.log(`🔄 [REABRIR ITEM ${numeroItem}] ANTES DA ORDENAÇÃO:`, lancesValidos.map(l => `${l.fornecedores?.razao_social}: ${l.valor_lance}`).join(', '));
          
          lancesValidos.sort((a, b) => {
            const resultado = isDesconto 
              ? b.valor_lance - a.valor_lance  // Desconto: maior é melhor
              : a.valor_lance - b.valor_lance; // Preço: menor é melhor
            console.log(`🔢 [REABRIR ITEM ${numeroItem}] Comparando ${a.valor_lance} vs ${b.valor_lance} = ${resultado}`);
            return resultado;
          });

          console.log(`📊 [REABRIR ITEM ${numeroItem}] DEPOIS DA ORDENAÇÃO:`, lancesValidos.map(l => `${l.fornecedores?.razao_social}: ${l.valor_lance}`).join(', '));

          // 6. Marcar o vencedor
          const vencedor = lancesValidos[0];
          console.log(`🏆 [REABRIR ITEM ${numeroItem}] VENCEDOR SELECIONADO:`, vencedor.fornecedores?.razao_social, '| Valor:', vencedor.valor_lance, '| ID:', vencedor.id);
          
          const { error: updateError } = await supabase
            .from("lances_fornecedores")
            .update({ indicativo_lance_vencedor: true })
            .eq("id", vencedor.id);

          if (updateError) {
            console.error(`❌ [REABRIR ITEM ${numeroItem}] Erro ao marcar vencedor:`, updateError);
          } else {
            console.log(`✅ [REABRIR ITEM ${numeroItem}] Vencedor marcado com sucesso no banco!`);
          }
        }
        
        console.log("\n✅ [REABRIR] Vencedores recalculados com sucesso! Recarregando dados...");
        
        // Forçar reload dos dados após recálculo
        await loadItensAbertos();
        await loadVencedoresPorItem(); // CRÍTICO: Recarregar vencedores na UI
        console.log("✅ [REABRIR] UI atualizada com novos vencedores!");
      }

      // Inserir novos itens
      const novosItens = Array.from(itensSelecionados)
        .filter(num => !numerosExistentes.has(num))
        .map(numeroItem => ({
          selecao_id: selecaoId,
          numero_item: numeroItem,
          aberto: true,
        }));

      if (novosItens.length > 0) {
        const { error } = await supabase
          .from("itens_abertos_lances")
          .insert(novosItens);

        if (error) throw error;
      }

      toast.success(`${itensSelecionados.size} item(ns) aberto(s) para lances`);
      await loadItensAbertos();
      setItensSelecionados(new Set());
    } catch (error) {
      console.error("Erro ao abrir itens:", error);
      toast.error("Erro ao abrir itens para lances");
    } finally {
      setSalvando(false);
    }
  };

  const handleFecharItens = async () => {
    if (itensSelecionados.size === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setSalvando(true);
    try {
      // Para cada item selecionado, definir tempo fixo de 2 minutos (120 segundos)
      const TEMPO_FECHAMENTO = 120; // 2 minutos
      
      const updates = Array.from(itensSelecionados).map(async (numeroItem) => {
        return supabase
          .from("itens_abertos_lances")
          .update({
            iniciando_fechamento: true,
            data_inicio_fechamento: new Date().toISOString(),
            segundos_para_fechar: TEMPO_FECHAMENTO,
          })
          .eq("selecao_id", selecaoId)
          .eq("numero_item", numeroItem);
      });

      await Promise.all(updates);

      // Agendar fechamento automático após 2 minutos
      Array.from(itensSelecionados).forEach(async (numeroItem) => {
        setTimeout(async () => {
          await supabase
            .from("itens_abertos_lances")
            .update({ 
              aberto: false, 
              data_fechamento: new Date().toISOString(),
              iniciando_fechamento: false
            })
            .eq("selecao_id", selecaoId)
            .eq("numero_item", numeroItem);
        }, TEMPO_FECHAMENTO * 1000);
      });

      toast.success(`${itensSelecionados.size} item(ns) entrando em processo de fechamento (2 minutos)`);
      await loadItensAbertos();
      setItensSelecionados(new Set());
    } catch (error) {
      console.error("Erro ao iniciar fechamento de itens:", error);
      toast.error("Erro ao fechar itens");
    } finally {
      setSalvando(false);
    }
  };

  const handleAbrirNegociacao = async (numeroItem: number) => {
    const vencedor = vencedoresPorItem.get(numeroItem);
    if (!vencedor) {
      toast.error("Nenhum vencedor identificado para este item");
      return;
    }

    setSalvando(true);
    try {
      // Verificar se já existe registro do item
      const { data: existente } = await supabase
        .from("itens_abertos_lances")
        .select("id")
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem)
        .single();

      if (existente) {
        // Atualizar para abrir negociação - LIMPAR TODOS OS CAMPOS DE FECHAMENTO
        const { error } = await supabase
          .from("itens_abertos_lances")
          .update({
            aberto: true,
            em_negociacao: true,
            fornecedor_negociacao_id: vencedor.fornecedorId,
            data_fechamento: null,
            iniciando_fechamento: false,
            data_inicio_fechamento: null,
            segundos_para_fechar: null
          })
          .eq("id", existente.id);

        if (error) throw error;
      } else {
        // Criar novo registro em negociação
        const { error } = await supabase
          .from("itens_abertos_lances")
          .insert({
            selecao_id: selecaoId,
            numero_item: numeroItem,
            aberto: true,
            em_negociacao: true,
            fornecedor_negociacao_id: vencedor.fornecedorId
          });

        if (error) throw error;
      }

      toast.success(`Negociação aberta com ${vencedor.razaoSocial} para o Item ${numeroItem}`);
      await loadItensAbertos();
    } catch (error) {
      console.error("Erro ao abrir negociação:", error);
      toast.error("Erro ao abrir negociação");
    } finally {
      setSalvando(false);
    }
  };

  const handleFecharNegociacao = async (numeroItem: number) => {
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("itens_abertos_lances")
        .update({
          aberto: false,
          em_negociacao: false,
          data_fechamento: new Date().toISOString(),
          negociacao_concluida: true // Marcar que a negociação foi concluída
        })
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem);

      if (error) throw error;

      toast.success(`Negociação encerrada para o Item ${numeroItem}`);
      await loadItensAbertos();
    } catch (error) {
      console.error("Erro ao fechar negociação:", error);
      toast.error("Erro ao fechar negociação");
    } finally {
      setSalvando(false);
    }
  };

  const handleNaoNegociar = async (numeroItem: number) => {
    setSalvando(true);
    try {
      // Verificar se já existe registro do item
      const { data: existente } = await supabase
        .from("itens_abertos_lances")
        .select("id")
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem)
        .maybeSingle();

      if (existente) {
        const { error } = await supabase
          .from("itens_abertos_lances")
          .update({
            nao_negociar: true,
            negociacao_concluida: true
          })
          .eq("id", existente.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("itens_abertos_lances")
          .insert({
            selecao_id: selecaoId,
            numero_item: numeroItem,
            aberto: false,
            nao_negociar: true,
            negociacao_concluida: true
          });

        if (error) throw error;
      }

      toast.success(`Item ${numeroItem} marcado como "Não Negociar"`);
      await loadItensAbertos();
    } catch (error) {
      console.error("Erro ao marcar não negociar:", error);
      toast.error("Erro ao marcar item");
    } finally {
      setSalvando(false);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  // Itens fechados com vencedor (candidatos a negociação)
  // Excluir itens que já tiveram negociação concluída ou foram marcados como "não negociar"
  const itensFechadosComVencedor = itens.filter(
    (item) => 
      !itensAbertos.has(item.numero_item) && 
      vencedoresPorItem.has(item.numero_item) && 
      !itensEmNegociacao.has(item.numero_item) &&
      !itensNegociacaoConcluida.has(item.numero_item)
  );

  console.log("📺 RENDER JSX: Renderizando Dialog - open:", open, "itensAbertos:", itensAbertos.size, "itensEmNegociacao:", itensEmNegociacao.size);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Controle de Lances e Chat
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Chat */}
          <div>
            <ChatSelecao selecaoId={selecaoId} />
          </div>

          {/* Controle de Itens */}
          <div>
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-4">Selecionar Itens para Lances</h3>
              
              <div className="flex gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelecionarTodos}
                >
                  Selecionar Todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLimparSelecao}
                >
                  Limpar Seleção
                </Button>
              </div>

              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {itens.map((item) => {
                    const estaAberto = itensAbertos.has(item.numero_item);
                    const estaSelecionado = itensSelecionados.has(item.numero_item);

                    return (
                      <div
                        key={item.numero_item}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          estaAberto ? "bg-green-50 border-green-300" : "bg-background"
                        }`}
                      >
                        <Checkbox
                          id={`item-${item.numero_item}`}
                          checked={estaSelecionado}
                          onCheckedChange={() => handleToggleItem(item.numero_item)}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`item-${item.numero_item}`}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">Item {item.numero_item}</span>
                              {estaAberto ? (
                                <Unlock className="h-3 w-3 text-green-600" />
                              ) : (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {item.descricao}
                            </p>
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1"
                  onClick={handleAbrirItens}
                  disabled={salvando || itensSelecionados.size === 0}
                >
                  <Unlock className="h-4 w-4 mr-2" />
                  Abrir Lances ({itensSelecionados.size})
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={handleFecharItens}
                  disabled={salvando || itensSelecionados.size === 0}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Fechar Lances ({itensSelecionados.size})
                </Button>
              </div>
            </div>

            {/* Seção de Negociação */}
            {(itensFechadosComVencedor.length > 0 || itensEmNegociacao.size > 0) && (
              <div className="border rounded-lg p-4 mt-4 bg-amber-50 border-amber-200">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Handshake className="h-5 w-5 text-amber-600" />
                  Rodada de Negociação
                </h3>

                {/* Itens em negociação ativa */}
                {Array.from(itensEmNegociacao.entries()).map(([numeroItem, fornecedorId]) => {
                  const vencedor = vencedoresPorItem.get(numeroItem);
                  return (
                    <div key={`neg-${numeroItem}`} className="flex items-center justify-between p-3 bg-amber-100 rounded-lg mb-2 border border-amber-300">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-amber-500 text-white border-amber-500">
                          <Handshake className="h-3 w-3 mr-1" />
                          Em Negociação
                        </Badge>
                        <div>
                          <span className="font-semibold">Item {numeroItem}</span>
                          <p className="text-sm text-amber-700">
                            Negociando com: {vencedor?.razaoSocial || 'Fornecedor'}
                          </p>
                          <p className="text-xs text-amber-600">
                            Valor atual: {formatCurrency(vencedor?.valorLance || 0)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleFecharNegociacao(numeroItem)}
                        disabled={salvando}
                      >
                        <Lock className="h-4 w-4 mr-1" />
                        Encerrar
                      </Button>
                    </div>
                  );
                })}

                {/* Itens disponíveis para negociação */}
                {itensFechadosComVencedor.length > 0 && (
                  <>
                    <p className="text-sm text-amber-700 mb-3">
                      Itens fechados com vencedor identificado - disponíveis para negociação:
                    </p>
                    <div className="space-y-2">
                      {itensFechadosComVencedor.map((item) => {
                        const vencedor = vencedoresPorItem.get(item.numero_item);
                        return (
                          <div key={`avail-${item.numero_item}`} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Trophy className="h-4 w-4 text-yellow-600" />
                              <div>
                                <span className="font-semibold">Item {item.numero_item}</span>
                                <p className="text-sm text-muted-foreground">
                                  Vencedor: {vencedor?.razaoSocial} - {formatCurrency(vencedor?.valorLance || 0)}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-amber-500 text-amber-700 hover:bg-amber-100"
                                onClick={() => handleAbrirNegociacao(item.numero_item)}
                                disabled={salvando}
                              >
                                <Handshake className="h-4 w-4 mr-1" />
                                Negociar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-gray-400 text-gray-600 hover:bg-gray-100"
                                onClick={() => handleNaoNegociar(item.numero_item)}
                                disabled={salvando}
                              >
                                <Ban className="h-4 w-4 mr-1" />
                                Não Negociar
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}