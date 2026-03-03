import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ScrollAreaWithArrows } from "@/components/ui/scroll-area-with-arrows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Gavel, Lock, Unlock, Send, RefreshCw, Trophy, FileSpreadsheet, MessageSquare, Handshake, MessagesSquare, Trash2, CheckCircle, Ban, ChevronDown, ChevronUp, Bell, Timer, AlertCircle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ChatNegociacao } from "./ChatNegociacao";
import capaLogo from "@/assets/capa-processo-logo.png";
import capaRodape from "@/assets/capa-processo-rodape.png";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

interface Item {
  numero_item: number;
  descricao: string;
  quantidade?: number;
  unidade?: string;
  lote_id?: string;
}

interface Lote {
  id: string;
  numero_lote: number;
  descricao_lote: string;
  itens: Item[];
  valor_total_lote: number;
}

interface Lance {
  id: string;
  fornecedor_id: string;
  valor_lance: number;
  data_hora_lance: string;
  indicativo_lance_vencedor: boolean;
  numero_item: number;
  numero_rodada: number;
  tipo_lance: string | null;
  fornecedores: {
    razao_social: string;
    cnpj: string;
  };
  _inabilitado?: boolean; // Marcação local para lances de fornecedores inabilitados
  _isProposta?: boolean; // Marcação local para propostas iniciais tratadas como lances
}

interface Mensagem {
  id: string;
  mensagem: string;
  tipo_usuario: string;
  created_at: string;
  usuario_id: string | null;
  fornecedor_id: string | null;
  fornecedores?: {
    razao_social: string;
  } | null;
  profiles?: {
    nome_completo: string;
  } | null;
}

interface DialogSessaoLancesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecaoId: string;
  itens: Item[];
  lotes?: Lote[];
  criterioJulgamento: string;
  tituloSelecao?: string;
  numeroSelecao?: string;
  sessaoFinalizada?: boolean;
  onFinalizarSessao?: () => void;
  onVencedoresAtualizados?: () => void;
}

// Helper para converter número para numeral romano
const toRoman = (num: number): string => {
  const romanNumerals: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let result = '';
  for (const [value, symbol] of romanNumerals) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
};

export function DialogSessaoLances({
  open,
  onOpenChange,
  selecaoId,
  onVencedoresAtualizados,
  itens,
  lotes = [],
  criterioJulgamento,
  tituloSelecao = "Seleção de Fornecedores",
  numeroSelecao,
  sessaoFinalizada = false,
  onFinalizarSessao,
}: DialogSessaoLancesProps) {
  const isPorLote = criterioJulgamento === "por_lote";
  const isGlobal = criterioJulgamento === "global";
  
  // Para critério global, criar um "item virtual" que representa o valor total
  // Unidade/Quantidade só devem existir quando realmente houver essa informação (senão deve aparecer "-")
  const itensParaControle = isGlobal
    ? [{ numero_item: 0, descricao: "Total Global da Proposta", lote_id: undefined }]
    : itens;
  
  // Estado - Controle de Itens
  const [itensAbertos, setItensAbertos] = useState<Set<number>>(new Set());
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [itensFechados, setItensFechados] = useState<Set<number>>(new Set());
  const [itensEmNegociacao, setItensEmNegociacao] = useState<Map<number, string>>(new Map()); // Map<numeroItem, fornecedorId>
  const [fornecedoresNegociacao, setFornecedoresNegociacao] = useState<Map<number, { fornecedorId: string; razaoSocial: string }>>(new Map()); // Map<numeroItem, {fornecedorId, razaoSocial}>
  const [itensComHistoricoNegociacao, setItensComHistoricoNegociacao] = useState<Map<number, string>>(new Map()); // Todos os itens que tiveram negociação (para histórico)
  const [itensNegociacaoConcluida, setItensNegociacaoConcluida] = useState<Set<number>>(new Set()); // Itens que já foram negociados ou marcados como "não negociar"
  const [vencedoresPorItem, setVencedoresPorItem] = useState<Map<number, { fornecedorId: string; razaoSocial: string; valorLance: number }>>(new Map());
  const [itensEmFechamento, setItensEmFechamento] = useState<Map<number, number>>(new Map()); // Map<numeroItem, tempoExpiracao>
  
  // Estado - Controle de Lotes (apenas para critério por_lote)
  const [lotesAbertos, setLotesAbertos] = useState<Set<number>>(new Set());
  const [lotesSelecionados, setLotesSelecionados] = useState<Set<number>>(new Set());
  const [lotesEmFechamento, setLotesEmFechamento] = useState<Map<number, number>>(new Map());
  const [vencedoresPorLote, setVencedoresPorLote] = useState<Map<number, { fornecedorId: string; razaoSocial: string; valorLance: number }>>(new Map());

  // Estado - Sistema de Lances
  const [lances, setLances] = useState<Lance[]>([]);
  const [lancesCompletos, setLancesCompletos] = useState<Lance[]>([]); // Todos os lances incluindo inabilitados
  const [fornecedoresInabilitadosIds, setFornecedoresInabilitadosIds] = useState<Set<string>>(new Set());
  const [inabilitacoesPorFornecedor, setInabilitacoesPorFornecedor] = useState<Map<string, number[]>>(new Map()); // Map<fornecedor_id, itens_afetados>
  const [loadingLances, setLoadingLances] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [itemSelecionadoLances, setItemSelecionadoLances] = useState<number | null>(null);

  // Estado - Chat Geral
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastMsgCountRef = useRef(0);

  // Estado - Chat Privado de Negociação
  const [itemChatPrivado, setItemChatPrivado] = useState<number | null>(null);

  // Estado - Confirmação de exclusão de lance
  const [confirmDeleteLance, setConfirmDeleteLance] = useState<{ open: boolean; lanceId: string | null }>({ open: false, lanceId: null });

  // Estado - Confirmação de exclusão de planilha
  const [confirmDeletePlanilha, setConfirmDeletePlanilha] = useState<{ open: boolean; planilhaId: string | null; urlArquivo: string | null }>({ open: false, planilhaId: null, urlArquivo: null });

  // Estado - Planilhas de Lances geradas (múltiplas)
  const [planilhasGeradas, setPlanilhasGeradas] = useState<{ id: string; nome_arquivo: string; url_arquivo: string; data_geracao: string; protocolo: string }[]>([]);
  const [gerandoPlanilha, setGerandoPlanilha] = useState(false);

  // Estado - Fornecedores online (Presença em tempo real)
  const [fornecedoresOnline, setFornecedoresOnline] = useState<{ fornecedor_id: string; razao_social: string; online_at: string }[]>([]);

  // Estado - Estimativas para verificação de desclassificação por preço
  const [estimativasItens, setEstimativasItens] = useState<Map<number, number>>(new Map());

  // Carregar dados iniciais
  // IMPORTANTE: loadEstimativas DEVE executar antes de loadVencedoresPorItem
  // pois a verificação de desclassificação por preço depende das estimativas
  useEffect(() => {
    if (open) {
      const carregarDados = async () => {
        // Primeiro: carregar estimativas (necessárias para desclassificação por preço)
        await loadEstimativas();
        
        // Depois: carregar dados que dependem das estimativas
        loadItensAbertos();
        loadLances();
        loadUserProfile();
        loadMensagens();
        loadVencedoresPorItem();
        loadPlanilhasGeradas();
      };
      carregarDados();
    }
  }, [open, selecaoId]);

  // Auto-refresh e realtime para lances + polling para itens
  useEffect(() => {
    if (!open) return;

    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadLances();
      }, 5000);
    }

    // Polling para itens abertos a cada 3 segundos + verificação de fechamento automático
    const itensInterval = setInterval(() => {
      loadItensAbertos();
      verificarFechamentoAutomatico();
    }, 3000);

    const lancesChannel = supabase
      .channel(`lances_${selecaoId}`)
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "lances_fornecedores", 
        filter: `selecao_id=eq.${selecaoId}` 
      }, async (payload) => {
        console.log("🔔 Mudança detectada em lances_fornecedores:", payload);
        loadLances();
        // Atualizar vencedor do item quando lance é inserido/atualizado
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const numeroItem = (payload.new as any)?.numero_item;
          if (numeroItem) {
            console.log(`🏆 Atualizando vencedor automaticamente para item ${numeroItem}`);
            await atualizarVencedorItem(numeroItem);
            // Notificar componente pai
            if (onVencedoresAtualizados) {
              console.log("📢 REALTIME: Notificando componente pai...");
              onVencedoresAtualizados();
            }
          }
        }
      })
      .subscribe();

    const chatChannel = supabase
      .channel(`chat_${selecaoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mensagens_selecao", filter: `selecao_id=eq.${selecaoId}` }, () => loadMensagens())
      .subscribe();

    const itensChannel = supabase
      .channel(`itens_abertos_gestor_${selecaoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "itens_abertos_lances", filter: `selecao_id=eq.${selecaoId}` }, () => loadItensAbertos())
      .subscribe();

    return () => {
      if (interval) clearInterval(interval);
      clearInterval(itensInterval);
      supabase.removeChannel(lancesChannel);
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(itensChannel);
    };
  }, [open, selecaoId, autoRefresh]);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  // Atualizar countdown dos itens em fechamento
  useEffect(() => {
    if (itensEmFechamento.size === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      
      setItensEmFechamento(prev => {
        const novo = new Map(prev);
        let algumItemExpirou = false;

        novo.forEach((tempoExpiracao, numeroItem) => {
          if (tempoExpiracao <= now) {
            novo.delete(numeroItem);
            algumItemExpirou = true;
          }
        });

        if (algumItemExpirou) {
          loadItensAbertos();
        }

        return novo;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [itensEmFechamento.size]);

  // Rastrear fornecedores online via Presence
  useEffect(() => {
    if (!open || !selecaoId) return;

    const presenceChannel = supabase.channel(`presence_selecao_${selecaoId}`);

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const fornecedores: { fornecedor_id: string; razao_social: string; online_at: string }[] = [];
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            if (presence.fornecedor_id && presence.razao_social) {
              // Evitar duplicatas
              if (!fornecedores.some(f => f.fornecedor_id === presence.fornecedor_id)) {
                fornecedores.push({
                  fornecedor_id: presence.fornecedor_id,
                  razao_social: presence.razao_social,
                  online_at: presence.online_at,
                });
              }
            }
          });
        });
        
        setFornecedoresOnline(fornecedores);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [open, selecaoId]);

  // Helper para extrair primeiro nome da razão social
  const getPrimeiroNome = (razaoSocial: string) => {
    return razaoSocial.split(' ')[0];
  };

  // Função para formatar tempo restante
  const formatarTempoRestante = (tempoExpiracao: number) => {
    const agora = Date.now();
    const restante = Math.max(0, Math.floor((tempoExpiracao - agora) / 1000));
    const minutos = Math.floor(restante / 60);
    const segundos = restante % 60;
    return `${minutos}:${segundos.toString().padStart(2, '0')}`;
  };

  // Verificar fechamento automático dos itens
  const verificarFechamentoAutomatico = async () => {
    console.log("🔍 verificarFechamentoAutomatico: INICIANDO verificação...");
    try {
      // Buscar itens que estão em processo de fechamento e já deveriam ter fechado
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("aberto", true)
        .eq("iniciando_fechamento", true);

      if (error) throw error;

      const agora = Date.now();
      
      for (const item of data || []) {
        if (item.data_inicio_fechamento && item.segundos_para_fechar !== null) {
          const inicioFechamento = new Date(item.data_inicio_fechamento).getTime();
          const tempoExpiracao = inicioFechamento + (item.segundos_para_fechar * 1000);
          
          if (agora >= tempoExpiracao) {
            console.log(`Fechando item ${item.numero_item} automaticamente por tempo (${item.em_negociacao ? 'negociação' : 'lance'})`);
            await fecharItemNegociacao(item.numero_item);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao verificar fechamento automático:", error);
    }
  };

  // ========== FUNÇÃO PARA ATUALIZAR VENCEDOR DE UM ITEM ==========
  const atualizarVencedorItem = async (numeroItem: number) => {
    try {
      console.log(`\n🏆 [ATUALIZAR ITEM ${numeroItem}] Iniciando atualização...`);
      
      const isDesconto = criterioJulgamento === "desconto";
      console.log(`📊 [ATUALIZAR ITEM ${numeroItem}] Critério: ${criterioJulgamento}, isDesconto: ${isDesconto}`);
      
      // 1. Desmarcar todos os lances do item
      console.log(`🔄 [ATUALIZAR ITEM ${numeroItem}] Desmarcando todos os lances...`);
      const { error: clearError } = await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: false })
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem);
      
      if (clearError) {
        console.error(`❌ [ATUALIZAR ITEM ${numeroItem}] ERRO ao desmarcar:`, clearError);
        throw clearError;
      }
      
      console.log(`✅ [ATUALIZAR ITEM ${numeroItem}] Todos os lances desmarcados`);

      // 2. Buscar todos os lances do item (incluindo fornecedores)
      console.log(`🔍 [ATUALIZAR ITEM ${numeroItem}] Buscando lances do banco...`);
      const { data: lancesItem, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select(`
          id, 
          tipo_lance, 
          valor_lance, 
          fornecedor_id, 
          data_hora_lance,
          fornecedores!inner (id, razao_social)
        `)
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem)
        .order("valor_lance", { ascending: false }); // Ordenar por valor DESC para ver todos

      if (lancesError) {
        console.error(`❌ [ATUALIZAR ITEM ${numeroItem}] ERRO ao buscar lances:`, lancesError);
        throw lancesError;
      }

      console.log(`📋 [ATUALIZAR ITEM ${numeroItem}] Total de lances encontrados: ${lancesItem?.length || 0}`);
      console.log(`📋 [ATUALIZAR ITEM ${numeroItem}] TODOS OS VALORES:`, lancesItem?.map(l => l.valor_lance).join(", "));

      if (!lancesItem || lancesItem.length === 0) {
        console.log(`⚠️ [ATUALIZAR ITEM ${numeroItem}] Nenhum lance encontrado - pulando item`);
        return;
      }

      // 3. Buscar inabilitações ativas
      console.log(`🔍 [ATUALIZAR ITEM ${numeroItem}] Buscando inabilitações ativas...`);
      const { data: inabilitacoes } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      const inabilitadosSet = new Set<string>();
      (inabilitacoes || []).forEach((inab: any) => {
        // Se itens_afetados estiver vazio, o fornecedor está totalmente inabilitado
        if (!inab.itens_afetados || inab.itens_afetados.length === 0 || inab.itens_afetados.includes(numeroItem)) {
          inabilitadosSet.add(inab.fornecedor_id);
        }
      });

      console.log(`🚫 [ATUALIZAR ITEM ${numeroItem}] Fornecedores inabilitados:`, Array.from(inabilitadosSet));

      // 4. Filtrar lances válidos (excluir inabilitados)
      const lancesValidos = lancesItem.filter(lance => !inabilitadosSet.has(lance.fornecedor_id));
      
      console.log(`✅ [ATUALIZAR ITEM ${numeroItem}] Lances válidos: ${lancesValidos.length}`);
      console.log(`📊 [ATUALIZAR ITEM ${numeroItem}] Detalhes lances válidos:`, lancesValidos.map(l => ({
        id: l.id,
        fornecedor: (l.fornecedores as any)?.razao_social,
        valor: l.valor_lance,
        tipo: l.tipo_lance
      })));

      if (lancesValidos.length === 0) {
        console.log(`❌ [ATUALIZAR ITEM ${numeroItem}] Nenhum lance válido - pulando item`);
        return;
      }

      console.log(`🔄 [ATUALIZAR ITEM ${numeroItem}] Iniciando ordenação...`);
      // 5. Ordenar por valor (MELHOR VALOR VENCE - sem priorização de negociação)
      const lancesOrdenados = [...lancesValidos].sort((a, b) => {
        // Ordenar por valor conforme critério - negociação NÃO tem prioridade
        if (isDesconto) {
          // Desconto: MAIOR é melhor (DESCRESCENTE)
          console.log(`🔢 [ATUALIZAR ITEM ${numeroItem} DESCONTO] Comparando ${a.valor_lance} vs ${b.valor_lance}`);
          if (a.valor_lance !== b.valor_lance) return b.valor_lance - a.valor_lance;
        } else {
          // Preço: MENOR é melhor (ASCENDENTE)
          if (a.valor_lance !== b.valor_lance) return a.valor_lance - b.valor_lance;
        }
        
        // Desempate por data
        return new Date(a.data_hora_lance).getTime() - new Date(b.data_hora_lance).getTime();
      });

      console.log(`📊 [ATUALIZAR ITEM ${numeroItem}] Lances ordenados:`, 
        lancesOrdenados.map(l => ({
          fornecedor: (l.fornecedores as any)?.razao_social,
          valor: l.valor_lance,
          tipo: l.tipo_lance
        }))
      );

      // 6. Marcar o primeiro como vencedor
      const lanceVencedor = lancesOrdenados[0];
      console.log(`🏆 [ATUALIZAR ITEM ${numeroItem}] Lance vencedor identificado:`, {
        id: lanceVencedor.id,
        fornecedor: (lanceVencedor.fornecedores as any)?.razao_social,
        valor: lanceVencedor.valor_lance,
        tipo: lanceVencedor.tipo_lance
      });
      
      console.log(`💾 [ATUALIZAR ITEM ${numeroItem}] Atualizando registro no banco... ID: ${lanceVencedor.id}`);
      const { error: updateError } = await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: true })
        .eq("id", lanceVencedor.id);
      
      if (updateError) {
        console.error(`❌ [ATUALIZAR ITEM ${numeroItem}] ERRO ao marcar vencedor:`, updateError);
        throw updateError;
      }

      console.log(`✅ [ATUALIZAR ITEM ${numeroItem}] Vencedor marcado no banco com sucesso!\n`);
      
      // Notificar componente pai sobre atualização
      if (onVencedoresAtualizados) {
        console.log(`📢 [ATUALIZAR ITEM ${numeroItem}] Notificando componente pai...`);
        onVencedoresAtualizados();
      }
    } catch (error) {
      console.error(`❌ [ATUALIZAR ITEM ${numeroItem}] ERRO GERAL:`, error);
      throw error;
    }
  };

  const fecharItemNegociacao = async (numeroItem: number) => {
    try {
      console.log("🔒 Fechando item de negociação automaticamente:", numeroItem);
      
      // PASSO 1: Fechar o item na tabela itens_abertos_lances - LIMPAR TODOS OS CAMPOS
      const { error } = await supabase
        .from("itens_abertos_lances")
        .update({
          em_negociacao: false,
          negociacao_concluida: true,
          aberto: false,
          data_fechamento: new Date().toISOString(),
          iniciando_fechamento: false,
          data_inicio_fechamento: null,
          segundos_para_fechar: null
        })
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem);

      if (error) {
        console.error("Erro ao fechar item de negociação:", error);
        throw error;
      }

      // PASSO 2: Atualizar o vencedor do item
      await atualizarVencedorItem(numeroItem);

      console.log("✅ Item de negociação fechado com sucesso");
      toast.success(`Item ${numeroItem} fechado automaticamente após negociação`);
      
      // Recarregar dados
      loadItensAbertos();
      loadVencedoresPorItem();
      
      // Notificar componente pai
      if (onVencedoresAtualizados) {
        console.log("📢 FECHAR ITEM: Notificando componente pai...");
        onVencedoresAtualizados();
      }
    } catch (error) {
      console.error("Erro ao fechar item de negociação:", error);
      toast.error("Erro ao fechar item de negociação");
    }
  };

  // ========== FUNÇÕES DE CONTROLE DE ITENS ==========
  const loadItensAbertos = async () => {
    try {
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select(`
          *,
          fornecedores:fornecedor_negociacao_id (
            id,
            razao_social
          )
        `)
        .eq("selecao_id", selecaoId);

      if (error) throw error;

      const abertos = new Set<number>();
      const fechados = new Set<number>();
      const emNegociacao = new Map<number, string>();
      const fornecedoresNeg = new Map<number, { fornecedorId: string; razaoSocial: string }>();
      const comHistorico = new Map<number, string>();
      const concluidos = new Set<number>();
      const emFechamento = new Map<number, number>();
      const now = Date.now();

      data?.forEach((item) => {
        if (item.aberto) {
          abertos.add(item.numero_item);
          
          // Verificar se está em processo de fechamento
          if (item.iniciando_fechamento && item.data_inicio_fechamento && item.segundos_para_fechar !== null) {
            const inicioFechamento = new Date(item.data_inicio_fechamento).getTime();
            const tempoExpiracao = inicioFechamento + (item.segundos_para_fechar * 1000);
            
            if (tempoExpiracao > now) {
              emFechamento.set(item.numero_item, tempoExpiracao);
            }
          }
        } else {
          fechados.add(item.numero_item);
        }
        if (item.em_negociacao && item.fornecedor_negociacao_id) {
          emNegociacao.set(item.numero_item, item.fornecedor_negociacao_id);
          // Salvar dados do fornecedor em negociação
          const fornecedor = item.fornecedores as any;
          if (fornecedor) {
            fornecedoresNeg.set(item.numero_item, {
              fornecedorId: fornecedor.id,
              razaoSocial: fornecedor.razao_social || "Fornecedor"
            });
          }
        }
        // Rastrear todos os itens que tiveram negociação (para histórico/ata)
        if (item.fornecedor_negociacao_id) {
          comHistorico.set(item.numero_item, item.fornecedor_negociacao_id);
          // Salvar dados do fornecedor para histórico também
          const fornecedor = item.fornecedores as any;
          if (fornecedor && !fornecedoresNeg.has(item.numero_item)) {
            fornecedoresNeg.set(item.numero_item, {
              fornecedorId: fornecedor.id,
              razaoSocial: fornecedor.razao_social || "Fornecedor"
            });
          }
        }
        // Rastrear itens com negociação concluída ou marcados como "não negociar"
        if (item.negociacao_concluida || item.nao_negociar) {
          concluidos.add(item.numero_item);
        }
      });

      // Atualizar estados apropriados baseado no critério
      if (isPorLote) {
        setLotesAbertos(abertos);
        setLotesEmFechamento(emFechamento);
      }
      setItensAbertos(abertos);
      setItensFechados(fechados);
      setItensEmNegociacao(emNegociacao);
      setFornecedoresNegociacao(fornecedoresNeg);
      setItensComHistoricoNegociacao(comHistorico);
      setItensNegociacaoConcluida(concluidos);
      setItensEmFechamento(emFechamento);
    } catch (error) {
      console.error("Erro ao carregar itens abertos:", error);
    }
  };

  const loadVencedoresPorItem = async () => {
    try {
      // Buscar fornecedores inabilitados da seleção COM itens_afetados
      const { data: inabilitados, error: inabilitadosError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      if (inabilitadosError) throw inabilitadosError;

      // Criar mapa de fornecedor -> itens inabilitados
      const inabilitacoesPorFornecedor = new Map<string, number[]>();
      (inabilitados || []).forEach((f: any) => {
        inabilitacoesPorFornecedor.set(f.fornecedor_id, f.itens_afetados || []);
      });

      // Determinar ordem baseada no critério
      const isDesconto = criterioJulgamento === "desconto";

      // Carregar estimativas localmente se o estado ainda estiver vazio
      // Isso garante que a verificação de preço funcione mesmo na primeira chamada
      let estimativasLocal = estimativasItens;
      if (estimativasLocal.size === 0) {
        const { data: selecaoData } = await supabase
          .from("selecoes_fornecedores")
          .select("cotacao_relacionada_id")
          .eq("id", selecaoId)
          .single();

        if (selecaoData?.cotacao_relacionada_id) {
          const { data: planilhaData } = await supabase
            .from("planilhas_consolidadas")
            .select("estimativas_itens")
            .eq("cotacao_id", selecaoData.cotacao_relacionada_id)
            .order("data_geracao", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (planilhaData?.estimativas_itens) {
            const estimativasRaw = planilhaData.estimativas_itens as Record<string, number>;
            estimativasLocal = new Map<number, number>();

            if (isPorLote) {
              // Para por_lote, calcular subtotal por lote
              const { data: itensCotacao } = await supabase
                .from("itens_cotacao")
                .select("numero_item, quantidade, lote_id")
                .eq("cotacao_id", selecaoData.cotacao_relacionada_id);

              const { data: lotesCotacao } = await supabase
                .from("lotes_cotacao")
                .select("id, numero_lote")
                .eq("cotacao_id", selecaoData.cotacao_relacionada_id);

              if (itensCotacao && lotesCotacao) {
                const loteIdToNumero = new Map(lotesCotacao.map(l => [l.id, l.numero_lote]));
                const subtotaisPorLote = new Map<number, number>();

                itensCotacao.forEach(item => {
                  const numeroLote = item.lote_id ? loteIdToNumero.get(item.lote_id) : null;
                  if (numeroLote) {
                    const chaveComposta = `${numeroLote}_${item.numero_item}`;
                    const valorEstimado = estimativasRaw[chaveComposta] || 0;
                    const subtotalItem = valorEstimado * (item.quantidade || 1);
                    const subtotalAtual = subtotaisPorLote.get(numeroLote) || 0;
                    subtotaisPorLote.set(numeroLote, subtotalAtual + subtotalItem);
                  }
                });

                subtotaisPorLote.forEach((valor, lote) => estimativasLocal.set(lote, valor));
              }
            } else if (isGlobal) {
              // Para global, somar todos os itens
              const { data: itensCotacao } = await supabase
                .from("itens_cotacao")
                .select("numero_item, quantidade")
                .eq("cotacao_id", selecaoData.cotacao_relacionada_id);

              let totalGlobal = 0;
              if (itensCotacao) {
                itensCotacao.forEach(item => {
                  const valorEstimado = estimativasRaw[String(item.numero_item)] || 0;
                  totalGlobal += valorEstimado * (item.quantidade || 1);
                });
              }
              estimativasLocal.set(0, totalGlobal);
            } else {
              // Para outros critérios, usar direto
              Object.entries(estimativasRaw).forEach(([key, valor]) => {
                const numero = parseInt(key, 10);
                if (!isNaN(numero)) {
                  estimativasLocal.set(numero, valor);
                }
              });
            }
            
            console.log("📊 Estimativas carregadas localmente para loadVencedoresPorItem:", Array.from(estimativasLocal.entries()));
          }
        }
      }

      // Helper local: desclassificação por preço/estimativa
      const isDesclassificadoPorPreco = (numero: number, valor: number): boolean => {
        const valorEstimado = estimativasLocal.get(numero);
        if (!valorEstimado || valorEstimado === 0) return false;

        if (criterioJulgamento === "desconto") {
          // Para desconto: desclassifica se desconto ofertado for MENOR que o estimado
          const tolerancia = 0.001;
          return valor < valorEstimado - tolerancia;
        }

        // Para preço: desclassifica se valor > estimado (comparação em centavos)
        const toCents = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100);
        return toCents(valor) > toCents(valorEstimado);
      };

      // Buscar lances
      const { data: lancesData, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select("fornecedor_id, numero_item, valor_lance, tipo_lance")
        .eq("selecao_id", selecaoId)
        .order("valor_lance", { ascending: !isDesconto }); // Desconto: maior é melhor (descending)

      if (lancesError) throw lancesError;

      // Filtrar lances onde o fornecedor está inabilitado PARA AQUELE ITEM/LOTE ESPECÍFICO
      // E também filtrar lances com valor acima do estimado (desclassificação por preço)
      const lancesFiltrados = (lancesData || []).filter((lance) => {
        // Verificar inabilitação
        const itensInabilitados = inabilitacoesPorFornecedor.get(lance.fornecedor_id);
        if (itensInabilitados && itensInabilitados.includes(lance.numero_item)) {
          return false; // Inabilitado para este item
        }
        
        // Verificar desclassificação por preço (valor acima do estimado)
        if (isDesclassificadoPorPreco(lance.numero_item, lance.valor_lance)) {
          console.log(`🚫 Lance desclassificado por preço: item ${lance.numero_item}, valor ${lance.valor_lance}`);
          return false; // Valor acima do estimado
        }
        
        return true;
      });

      // Buscar fornecedores (dos lances)
      const fornecedorIdsLances = [...new Set(lancesFiltrados.map((l) => l.fornecedor_id))];

      const { data: fornecedoresDataLances, error: fornecedoresErrorLances } = await supabase
        .from("fornecedores")
        .select("id, razao_social")
        .in(
          "id",
          fornecedorIdsLances.length > 0 ? fornecedorIdsLances : ["00000000-0000-0000-0000-000000000000"]
        );

      if (fornecedoresErrorLances) throw fornecedoresErrorLances;

      const fornecedoresMap = new Map(fornecedoresDataLances?.map((f) => [f.id, f.razao_social]) || []);

      // Identificar vencedor por item baseado no MELHOR VALOR (apenas lances classificados)
      const vencedores = new Map<number, { fornecedorId: string; razaoSocial: string; valorLance: number }>();

      lancesFiltrados.forEach((lance) => {
        const vencedorAtual = vencedores.get(lance.numero_item);

        if (!vencedorAtual) {
          vencedores.set(lance.numero_item, {
            fornecedorId: lance.fornecedor_id,
            razaoSocial: fornecedoresMap.get(lance.fornecedor_id) || "Fornecedor",
            valorLance: lance.valor_lance,
          });
          return;
        }

        const valorMelhor = isDesconto
          ? lance.valor_lance > vencedorAtual.valorLance // Desconto: maior é melhor
          : lance.valor_lance < vencedorAtual.valorLance; // Preço: menor é melhor

        if (valorMelhor) {
          vencedores.set(lance.numero_item, {
            fornecedorId: lance.fornecedor_id,
            razaoSocial: fornecedoresMap.get(lance.fornecedor_id) || "Fornecedor",
            valorLance: lance.valor_lance,
          });
        }
      });

      // FALLBACK: itens/lotes sem lances vencedores devem considerar o valor da proposta original
      // (para que apareçam para negociação)
      // Nota: isGlobal e isPorLote já estão definidos no escopo do componente
      const numerosBase = isPorLote
        ? lotes.map((l) => l.numero_lote)
        : (isGlobal ? itensParaControle : itens).map((i) => i.numero_item);

      const numerosSemVencedor = numerosBase.filter((n) => !vencedores.has(n));

      if (numerosSemVencedor.length > 0) {
        const { data: propostas, error: propostasError } = await supabase
          .from("selecao_propostas_fornecedor")
          .select("id, fornecedor_id")
          .eq("selecao_id", selecaoId);

        if (propostasError) throw propostasError;

        const propostaIds = (propostas || []).map((p: any) => p.id);
        const fornecedorIdsPropostas = [...new Set((propostas || []).map((p: any) => p.fornecedor_id))];

        const { data: fornecedoresDataPropostas, error: fornecedoresErrorPropostas } = await supabase
          .from("fornecedores")
          .select("id, razao_social")
          .in(
            "id",
            fornecedorIdsPropostas.length > 0 ? fornecedorIdsPropostas : ["00000000-0000-0000-0000-000000000000"]
          );

        if (fornecedoresErrorPropostas) throw fornecedoresErrorPropostas;

        const fornecedoresMapPropostas = new Map(
          fornecedoresDataPropostas?.map((f) => [f.id, f.razao_social]) || []
        );

        const { data: itensPropostas, error: itensPropostasError } = propostaIds.length
          ? await supabase
              .from("selecao_respostas_itens_fornecedor")
              .select("proposta_id, numero_item, lote_id, valor_unitario_ofertado, valor_total_item, desclassificado")
              .in("proposta_id", propostaIds)
          : { data: [], error: null };

        if (itensPropostasError) throw itensPropostasError;

        const propostaToFornecedor = new Map<string, string>();
        (propostas || []).forEach((p: any) => {
          propostaToFornecedor.set(p.id, p.fornecedor_id);
        });

        if (isPorLote) {
          // === CRITÉRIO POR LOTE: vencedor é pelo menor VALOR TOTAL DO LOTE (soma dos itens do lote) ===
          const loteIdToNumero = new Map(lotes.map((l) => [l.id, l.numero_lote]));

          // totalPorLoteFornecedor: Map<numeroLote, Map<fornecedorId, total>>
          const totalPorLoteFornecedor = new Map<number, Map<string, number>>();

          (itensPropostas || []).forEach((ip: any) => {
            const numeroLote = ip.lote_id ? loteIdToNumero.get(ip.lote_id) : undefined;
            if (!numeroLote) return;
            if (!numerosSemVencedor.includes(numeroLote)) return;

            if (ip.desclassificado) return;

            const fornecedorId = propostaToFornecedor.get(ip.proposta_id);
            if (!fornecedorId) return;

            // inabilitação no nível do lote
            const itensInabilitados = inabilitacoesPorFornecedor.get(fornecedorId);
            if (itensInabilitados && itensInabilitados.includes(numeroLote)) return;

            const totalItem = Number(ip.valor_total_item) || 0;

            const mapFornecedor = totalPorLoteFornecedor.get(numeroLote) || new Map<string, number>();
            mapFornecedor.set(fornecedorId, (mapFornecedor.get(fornecedorId) || 0) + totalItem);
            totalPorLoteFornecedor.set(numeroLote, mapFornecedor);
          });

          numerosSemVencedor.forEach((numeroLote) => {
            const totals = totalPorLoteFornecedor.get(numeroLote);
            if (!totals) return;

            // Remover fornecedores desclassificados por estimativa, quando disponível
            const totaisValidos: Array<{ fornecedorId: string; total: number }> = [];
            totals.forEach((total, fornecedorId) => {
              if (!isDesclassificadoPorPreco(numeroLote, total)) {
                totaisValidos.push({ fornecedorId, total });
              }
            });

            if (totaisValidos.length === 0) return;

            totaisValidos.sort((a, b) => (isDesconto ? b.total - a.total : a.total - b.total));
            const melhor = totaisValidos[0];

            vencedores.set(numeroLote, {
              fornecedorId: melhor.fornecedorId,
              razaoSocial: fornecedoresMapPropostas.get(melhor.fornecedorId) || "Fornecedor",
              valorLance: melhor.total,
            });
          });
        } else {
          // === CRITÉRIOS POR ITEM / GLOBAL / DESCONTO: vencedor por item no melhor valor ===
          const melhoresPorItem = new Map<number, { fornecedorId: string; valor: number }>();

          (itensPropostas || []).forEach((ip: any) => {
            const numeroItem = ip.numero_item;
            if (!numerosSemVencedor.includes(numeroItem)) return;
            if (ip.desclassificado) return;

            const fornecedorId = propostaToFornecedor.get(ip.proposta_id);
            if (!fornecedorId) return;

            const itensInabilitados = inabilitacoesPorFornecedor.get(fornecedorId);
            if (itensInabilitados && itensInabilitados.includes(numeroItem)) return;

            const valor = Number(ip.valor_unitario_ofertado) || 0;
            if (valor <= 0) return;

            if (isDesclassificadoPorPreco(numeroItem, valor)) return;

            const atual = melhoresPorItem.get(numeroItem);
            if (!atual) {
              melhoresPorItem.set(numeroItem, { fornecedorId, valor });
              return;
            }

            const melhor = isDesconto ? valor > atual.valor : valor < atual.valor;
            if (melhor) {
              melhoresPorItem.set(numeroItem, { fornecedorId, valor });
            }
          });

          melhoresPorItem.forEach((melhor, numeroItem) => {
            vencedores.set(numeroItem, {
              fornecedorId: melhor.fornecedorId,
              razaoSocial: fornecedoresMapPropostas.get(melhor.fornecedorId) || "Fornecedor",
              valorLance: melhor.valor,
            });
          });
        }
      }

      console.log("🏆 Vencedores carregados (lances + proposta original):", Array.from(vencedores.entries()));
      setVencedoresPorItem(vencedores);
    } catch (error) {
      console.error("Erro ao carregar vencedores:", error);
    }
  };


  // Carregar estimativas da planilha consolidada para verificação de desclassificação por preço
  const loadEstimativas = async () => {
    try {
      // Buscar cotação relacionada à seleção
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("cotacao_relacionada_id")
        .eq("id", selecaoId)
        .single();

      if (!selecaoData?.cotacao_relacionada_id) return;

      // Buscar planilha consolidada mais recente
      const { data: planilhaData } = await supabase
        .from("planilhas_consolidadas")
        .select("estimativas_itens")
        .eq("cotacao_id", selecaoData.cotacao_relacionada_id)
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!planilhaData?.estimativas_itens) return;

      const estimativas = planilhaData.estimativas_itens as Record<string, number>;
      const novoMapa = new Map<number, number>();

      // Para por_lote, calcular subtotal por lote
      if (isPorLote) {
        // Buscar itens da cotação com seus lotes
        const { data: itensCotacao } = await supabase
          .from("itens_cotacao")
          .select("numero_item, quantidade, lote_id")
          .eq("cotacao_id", selecaoData.cotacao_relacionada_id);

        const { data: lotesCotacao } = await supabase
          .from("lotes_cotacao")
          .select("id, numero_lote")
          .eq("cotacao_id", selecaoData.cotacao_relacionada_id);

        if (itensCotacao && lotesCotacao) {
          const loteIdToNumero = new Map(lotesCotacao.map(l => [l.id, l.numero_lote]));
          const subtotaisPorLote = new Map<number, number>();

          itensCotacao.forEach(item => {
            const numeroLote = item.lote_id ? loteIdToNumero.get(item.lote_id) : null;
            if (numeroLote) {
              const chaveComposta = `${numeroLote}_${item.numero_item}`;
              const valorEstimado = estimativas[chaveComposta] || 0;
              const subtotalItem = valorEstimado * (item.quantidade || 1);
              const subtotalAtual = subtotaisPorLote.get(numeroLote) || 0;
              subtotaisPorLote.set(numeroLote, subtotalAtual + subtotalItem);
            }
          });

          subtotaisPorLote.forEach((valor, lote) => novoMapa.set(lote, valor));
        }
      } else if (isGlobal) {
        // Para global, somar todos os itens
        const { data: itensCotacao } = await supabase
          .from("itens_cotacao")
          .select("numero_item, quantidade")
          .eq("cotacao_id", selecaoData.cotacao_relacionada_id);

        let totalGlobal = 0;
        if (itensCotacao) {
          itensCotacao.forEach(item => {
            const valorEstimado = estimativas[String(item.numero_item)] || 0;
            totalGlobal += valorEstimado * (item.quantidade || 1);
          });
        }
        novoMapa.set(0, totalGlobal); // Item 0 representa o global
      } else {
        // Para por_item e desconto, usar diretamente
        Object.entries(estimativas).forEach(([key, value]) => {
          const numeroItem = parseInt(key, 10);
          if (!isNaN(numeroItem)) {
            novoMapa.set(numeroItem, value);
          }
        });
      }

      setEstimativasItens(novoMapa);
      console.log("📊 Estimativas carregadas:", Array.from(novoMapa.entries()));
    } catch (error) {
      console.error("Erro ao carregar estimativas:", error);
    }
  };

  // Verificar se um lance está desclassificado por preço
  const isLanceDesclassificadoPorPreco = (numeroItem: number, valorLance: number): boolean => {
    const valorEstimado = estimativasItens.get(numeroItem);
    if (!valorEstimado || valorEstimado === 0) return false;

    if (criterioJulgamento === "desconto") {
      // Para desconto: desclassifica se desconto ofertado for MENOR que o estimado
      const tolerancia = 0.001;
      return valorLance < valorEstimado - tolerancia;
    }

    // Para preço: desclassifica se valor > estimado (comparação em centavos)
    const toCents = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100);
    return toCents(valorLance) > toCents(valorEstimado);
  };

  // Verificar se TODOS os lances de um item estão desclassificados por preço
  const todosLancesDesclassificadosPorPreco = (numeroItem: number): boolean => {
    const lancesDoItem = getLancesCompletosDoItem(numeroItem);
    if (lancesDoItem.length === 0) return false;

    const valorEstimado = estimativasItens.get(numeroItem);
    if (!valorEstimado || valorEstimado === 0) return false;

    // Verificar cada lance
    return lancesDoItem.every(lance => isLanceDesclassificadoPorPreco(numeroItem, lance.valor_lance));
  };

  const handleAbrirNegociacao = async (numeroItem: number) => {
    const vencedor = vencedoresPorItem.get(numeroItem);
    if (!vencedor) {
      toast.error("Não foi possível identificar o vencedor deste item");
      return;
    }

    setSalvando(true);
    try {
      const TEMPO_NEGOCIACAO = 120; // 2 minutos igual ao fechamento automático
      const agora = new Date().toISOString();
      
      const { data: existente } = await supabase
        .from("itens_abertos_lances")
        .select("id")
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem)
        .single();

      if (existente) {
        const { error } = await supabase
          .from("itens_abertos_lances")
          .update({
            em_negociacao: true,
            fornecedor_negociacao_id: vencedor.fornecedorId,
            aberto: true,
            data_fechamento: null,
            iniciando_fechamento: true,
            data_inicio_fechamento: agora,
            segundos_para_fechar: TEMPO_NEGOCIACAO
          })
          .eq("id", existente.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("itens_abertos_lances")
          .insert({
            selecao_id: selecaoId,
            numero_item: numeroItem,
            aberto: true,
            em_negociacao: true,
            fornecedor_negociacao_id: vencedor.fornecedorId,
            iniciando_fechamento: true,
            data_inicio_fechamento: agora,
            segundos_para_fechar: TEMPO_NEGOCIACAO
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
      // PASSO 1: Fechar a negociação
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

      // PASSO 2: Atualizar indicativo_lance_vencedor
      console.log("🏆 Atualizando indicativo_lance_vencedor para o item:", numeroItem);
      
      // 2.1. Desmarcar todos os lances do item
      await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: false })
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem);

      // 2.2. Buscar o lance vencedor (com priorização de negociação)
      const isDesconto = criterioJulgamento === "desconto";
      
      const { data: lancesItem, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select("id, tipo_lance, valor_lance, fornecedor_id, data_hora_lance")
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem);

      if (lancesError) throw lancesError;

      if (lancesItem && lancesItem.length > 0) {
        // Ordenar por valor - MELHOR VALOR VENCE (sem priorização de negociação)
        const lancesOrdenados = [...lancesItem].sort((a, b) => {
          // Ordenar por valor conforme critério
          if (isDesconto) {
            if (a.valor_lance !== b.valor_lance) return b.valor_lance - a.valor_lance;
          } else {
            if (a.valor_lance !== b.valor_lance) return a.valor_lance - b.valor_lance;
          }
          
          // Desempate por data
          return new Date(a.data_hora_lance).getTime() - new Date(b.data_hora_lance).getTime();
        });

        // Marcar o primeiro como vencedor
        const lanceVencedor = lancesOrdenados[0];
        console.log("🏆 Lance vencedor identificado:", lanceVencedor);
        
        await supabase
          .from("lances_fornecedores")
          .update({ indicativo_lance_vencedor: true })
          .eq("id", lanceVencedor.id);

        console.log("✅ indicativo_lance_vencedor atualizado com sucesso");
      }

      // Fechar o chat se estiver aberto para este item
      if (itemChatPrivado === numeroItem) {
        setItemChatPrivado(null);
      }

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

  const handleReabrirParaNegociacao = async (numeroItem: number, fornecedorId: string) => {
    setSalvando(true);
    try {
      const TEMPO_NEGOCIACAO = 120;
      const agora = new Date().toISOString();

      const { error } = await supabase
        .from("itens_abertos_lances")
        .update({
          aberto: true,
          em_negociacao: true,
          nao_negociar: false,
          negociacao_concluida: false,
          data_fechamento: null,
          fornecedor_negociacao_id: fornecedorId,
          iniciando_fechamento: true,
          data_inicio_fechamento: agora,
          segundos_para_fechar: TEMPO_NEGOCIACAO,
        })
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem);

      if (error) throw error;

      console.log(`🔄 REABRIR: Item ${numeroItem} reaberto, recalculando vencedor...`);
      
      // Recalcular vencedor após reabrir
      await atualizarVencedorItem(numeroItem);
      
      toast.success(`Item ${numeroItem} reaberto para negociação`);
      await loadItensAbertos();
      
      // Notificar componente pai
      if (onVencedoresAtualizados) {
        console.log("📢 REABRIR: Notificando componente pai...");
        onVencedoresAtualizados();
      }
    } catch (error) {
      console.error("Erro ao reabrir para negociação:", error);
      toast.error("Erro ao reabrir para negociação");
    } finally {
      setSalvando(false);
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
    if (isPorLote) {
      setLotesSelecionados(new Set(lotes.map((lote) => lote.numero_lote)));
    } else if (isGlobal) {
      setItensSelecionados(new Set([0])); // Item virtual 0 para global
    } else {
      setItensSelecionados(new Set(itens.map((item) => item.numero_item)));
    }
  };

  const handleLimparSelecao = () => {
    if (isPorLote) {
      setLotesSelecionados(new Set());
    } else {
      setItensSelecionados(new Set());
    }
  };

  // === FUNÇÕES PARA LOTES (apenas critério por_lote) ===
  const handleToggleLote = (numeroLote: number) => {
    const novos = new Set(lotesSelecionados);
    if (novos.has(numeroLote)) {
      novos.delete(numeroLote);
    } else {
      novos.add(numeroLote);
    }
    setLotesSelecionados(novos);
  };

  const handleAbrirLotes = async () => {
    if (lotesSelecionados.size === 0) {
      toast.error("Selecione pelo menos um lote");
      return;
    }

    // Verificar limite de 10 lotes abertos
    const totalAbertos = lotesAbertos.size;
    const novosParaAbrir = Array.from(lotesSelecionados).filter(num => !lotesAbertos.has(num)).length;
    
    if (totalAbertos + novosParaAbrir > 10) {
      const disponiveis = 10 - totalAbertos;
      toast.error(`Limite de 10 lotes abertos por vez. Você pode abrir mais ${disponiveis} lote(s).`);
      return;
    }

    setSalvando(true);
    try {
      // Para lotes, usamos numero_item = numero_lote na tabela itens_abertos_lances
      const { data: existentes } = await supabase
        .from("itens_abertos_lances")
        .select("numero_item")
        .eq("selecao_id", selecaoId)
        .in("numero_item", Array.from(lotesSelecionados));

      const numerosExistentes = new Set(existentes?.map(e => e.numero_item) || []);

      if (numerosExistentes.size > 0) {
        await supabase
          .from("itens_abertos_lances")
          .update({ aberto: true, data_fechamento: null })
          .eq("selecao_id", selecaoId)
          .in("numero_item", Array.from(numerosExistentes));
      }

      const novosLotes = Array.from(lotesSelecionados)
        .filter(num => !numerosExistentes.has(num))
        .map(numeroLote => ({
          selecao_id: selecaoId,
          numero_item: numeroLote, // Usamos numero_item para armazenar numero_lote
          aberto: true,
        }));

      if (novosLotes.length > 0) {
        const { error } = await supabase.from("itens_abertos_lances").insert(novosLotes);
        if (error) throw error;
      }

      toast.success(`${lotesSelecionados.size} lote(s) aberto(s) para lances`);
      await loadItensAbertos();
      setLotesSelecionados(new Set());
    } catch (error) {
      console.error("Erro ao abrir lotes:", error);
      toast.error("Erro ao abrir lotes para lances");
    } finally {
      setSalvando(false);
    }
  };

  const handleFecharLotes = async () => {
    if (lotesSelecionados.size === 0) {
      toast.error("Selecione pelo menos um lote");
      return;
    }

    // Filtrar apenas lotes que estão abertos
    const lotesParaFechar = Array.from(lotesSelecionados).filter(numeroLote => 
      lotesAbertos.has(numeroLote)
    );

    if (lotesParaFechar.length === 0) {
      toast.error("Nenhum dos lotes selecionados está aberto");
      return;
    }

    setSalvando(true);
    try {
      const TEMPO_FECHAMENTO = 120;
      const agora = new Date().toISOString();
      
      // Atualizar todos os lotes selecionados de uma vez
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .update({
          iniciando_fechamento: true,
          data_inicio_fechamento: agora,
          segundos_para_fechar: TEMPO_FECHAMENTO,
        })
        .eq("selecao_id", selecaoId)
        .eq("aberto", true)
        .in("numero_item", lotesParaFechar)
        .select();
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        toast.error("Nenhum lote foi atualizado. Verifique se os lotes estão abertos.");
        return;
      }

      // Agendar fechamento automático para cada lote
      lotesParaFechar.forEach((numeroLote) => {
        setTimeout(async () => {
          await fecharItemNegociacao(numeroLote); // Reutiliza função de fechar item
        }, TEMPO_FECHAMENTO * 1000);
      });

      toast.success(`${data.length} lote(s) entrando em processo de fechamento (2 minutos)`);
      await loadItensAbertos();
      setLotesSelecionados(new Set());
    } catch (error) {
      console.error("Erro ao iniciar fechamento de lotes:", error);
      toast.error("Erro ao fechar lotes");
    } finally {
      setSalvando(false);
    }
  };

  const handleAbrirItens = async () => {
    if (itensSelecionados.size === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    // Verificar limite de 10 itens abertos
    const totalAbertos = itensAbertos.size;
    const novosParaAbrir = Array.from(itensSelecionados).filter(num => !itensAbertos.has(num)).length;
    
    if (totalAbertos + novosParaAbrir > 10) {
      const disponiveis = 10 - totalAbertos;
      toast.error(`Limite de 10 itens abertos por vez. Você pode abrir mais ${disponiveis} item(ns).`);
      return;
    }

    setSalvando(true);
    try {
      const { data: existentes } = await supabase
        .from("itens_abertos_lances")
        .select("numero_item")
        .eq("selecao_id", selecaoId)
        .in("numero_item", Array.from(itensSelecionados));

      const numerosExistentes = new Set(existentes?.map(e => e.numero_item) || []);

      if (numerosExistentes.size > 0) {
        await supabase
          .from("itens_abertos_lances")
          .update({ aberto: true, data_fechamento: null })
          .eq("selecao_id", selecaoId)
          .in("numero_item", Array.from(numerosExistentes));
      }

      const novosItens = Array.from(itensSelecionados)
        .filter(num => !numerosExistentes.has(num))
        .map(numeroItem => ({
          selecao_id: selecaoId,
          numero_item: numeroItem,
          aberto: true,
        }));

      if (novosItens.length > 0) {
        const { error } = await supabase.from("itens_abertos_lances").insert(novosItens);
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

    // Filtrar apenas itens que estão abertos
    const itensParaFechar = Array.from(itensSelecionados).filter(numeroItem => 
      itensAbertos.has(numeroItem)
    );

    if (itensParaFechar.length === 0) {
      toast.error("Nenhum dos itens selecionados está aberto");
      return;
    }

    setSalvando(true);
    try {
      const TEMPO_FECHAMENTO = 120;
      const agora = new Date().toISOString();
      
      console.log("Iniciando fechamento para itens:", itensParaFechar);
      console.log("Data de início:", agora);
      
      // Atualizar todos os itens selecionados de uma vez
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .update({
          iniciando_fechamento: true,
          data_inicio_fechamento: agora,
          segundos_para_fechar: TEMPO_FECHAMENTO,
        })
        .eq("selecao_id", selecaoId)
        .eq("aberto", true)
        .in("numero_item", itensParaFechar)
        .select();
      
      console.log("Resultado do update:", data, error);
      
      if (error) {
        console.error("Erro ao iniciar fechamento dos itens:", error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.warn("Nenhum item foi atualizado!");
        toast.error("Nenhum item foi atualizado. Verifique se os itens estão abertos.");
        return;
      }
      
      console.log(`Fechamento iniciado para ${data.length} itens às ${agora}`);

      // Agendar fechamento automático para cada item
      itensParaFechar.forEach((numeroItem) => {
        setTimeout(async () => {
          console.log(`⏰ Timeout: Fechando item ${numeroItem} automaticamente`);
          await fecharItemNegociacao(numeroItem);
          
          const error = null; // removido pois fecharItemNegociacao já trata erros
          
          if (error) {
            console.error(`Erro ao fechar item ${numeroItem}:`, error);
          } else {
            console.log(`Item ${numeroItem} fechado automaticamente`);
          }
        }, TEMPO_FECHAMENTO * 1000);
      });

      toast.success(`${data.length} item(ns) entrando em processo de fechamento (2 minutos)`);
      await loadItensAbertos();
      setItensSelecionados(new Set());
    } catch (error) {
      console.error("Erro ao iniciar fechamento de itens:", error);
      toast.error("Erro ao fechar itens");
    } finally {
      setSalvando(false);
    }
  };

  // ========== FUNÇÕES DO SISTEMA DE LANCES ==========
  const loadLances = async () => {
    try {
      // Buscar fornecedores inabilitados COM itens_afetados
      const { data: inabilitados } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      // Criar mapa de fornecedor -> itens inabilitados
      const inabilitacoesPorFornecedor = new Map<string, number[]>();
      (inabilitados || []).forEach((f: any) => {
        inabilitacoesPorFornecedor.set(f.fornecedor_id, f.itens_afetados || []);
      });
      
      // Manter o set de IDs para compatibilidade (fornecedores que têm QUALQUER inabilitação)
      const inabilitadosIds = new Set(
        (inabilitados || []).map((f: any) => f.fornecedor_id)
      );
      setFornecedoresInabilitadosIds(inabilitadosIds);
      
      // Armazenar mapa de inabilitações por fornecedor para uso em outras partes
      setInabilitacoesPorFornecedor(inabilitacoesPorFornecedor);

      // INCLUIR tipo_lance para priorizar negociações
      const { data: lancesData, error } = await supabase
        .from("lances_fornecedores")
        .select(`*, fornecedores (razao_social, cnpj)`)
        .eq("selecao_id", selecaoId)
        .order("numero_item", { ascending: true })
        .order("data_hora_lance", { ascending: true });

      if (error) throw error;

      // BUSCAR PROPOSTAS ORIGINAIS PARA INCLUIR COMO LANCES
      const { data: propostas } = await supabase
        .from("selecao_propostas_fornecedor")
        .select("id, fornecedor_id, fornecedores(razao_social, cnpj), data_envio")
        .eq("selecao_id", selecaoId);

      const propostaIds = (propostas || []).map((p: any) => p.id);
      
      const { data: itensPropostas } = propostaIds.length > 0 
        ? await supabase
            .from("selecao_respostas_itens_fornecedor")
            .select("proposta_id, numero_item, lote_id, valor_unitario_ofertado, valor_total_item, desclassificado")
            .in("proposta_id", propostaIds)
        : { data: [] };

      // Mapear propostas para formato de lances
      const propostasComoLances: any[] = [];
      const propostaMap = new Map((propostas || []).map((p: any) => [p.id, p]));

      // Mapa de lote_id para numero_lote (se for por_lote)
      const loteIdToNumero = new Map<string, number>();
      if (isPorLote) {
        lotes.forEach(l => loteIdToNumero.set(l.id, l.numero_lote));
      }

      if (isPorLote) {
        // Agrupar por lote + fornecedor
        const totalPorLoteFornecedor = new Map<string, { fornecedorId: string; fornecedores: any; valorTotal: number; dataEnvio: string }>();
        
        (itensPropostas || []).forEach((ip: any) => {
          if (ip.desclassificado) return;
          const propInfo = propostaMap.get(ip.proposta_id);
          if (!propInfo) return;
          
          const loteId = ip.lote_id;
          if (!loteId) return;
          const numeroLote = loteIdToNumero.get(loteId);
          if (numeroLote === undefined) return;

          const valorUnit = Number(ip.valor_unitario_ofertado) || 0;
          const totalItem = Number(ip.valor_total_item) > 0 
            ? Number(ip.valor_total_item) 
            : valorUnit * Number(ip.quantidade || 0); // Quantidade não temos aqui no item resposta, mas no item original. 
            // Na verdade, para simplificar e ser consistente com a planilha PDF, usamos valor_unitario_ofertado como base se total não existir
            // Mas cuidado: valor_lance deve ser o TOTAL DO LOTE
          
          // Melhor abordagem: usar valor_unitario_ofertado * quantidade (que precisamos pegar dos itens)
          // Mas como não temos quantidade fácil aqui, vamos assumir valor_total_item está correto ou usar unitário se for item único
          // O PDF faz um cálculo complexo. Vamos tentar usar o valor_total_item que vem do banco se disponível.
          
          const valorParaSoma = Number(ip.valor_total_item) || Number(ip.valor_unitario_ofertado) || 0;
          if (valorParaSoma <= 0) return;

          const key = `${numeroLote}_${propInfo.fornecedor_id}`;
          if (!totalPorLoteFornecedor.has(key)) {
            totalPorLoteFornecedor.set(key, { 
              fornecedorId: propInfo.fornecedor_id, 
              fornecedores: propInfo.fornecedores, 
              valorTotal: 0, 
              dataEnvio: propInfo.data_envio 
            });
          }
          totalPorLoteFornecedor.get(key)!.valorTotal += valorParaSoma;
        });

        totalPorLoteFornecedor.forEach((dados, key) => {
          const numeroLote = parseInt(key.split('_')[0]);
          propostasComoLances.push({
            id: `proposta_${dados.fornecedorId}_${numeroLote}`,
            fornecedor_id: dados.fornecedorId,
            fornecedores: dados.fornecedores,
            valor_lance: dados.valorTotal,
            data_hora_lance: dados.dataEnvio || new Date().toISOString(),
            numero_item: numeroLote,
            tipo_lance: 'proposta_inicial',
            indicativo_lance_vencedor: false,
            numero_rodada: 0,
            _isProposta: true
          });
        });
      } else if (isGlobal) {
        // Agrupar por fornecedor (Item 0)
        const totalPorFornecedor = new Map<string, { fornecedores: any; valorTotal: number; dataEnvio: string }>();
        (itensPropostas || []).forEach((ip: any) => {
          if (ip.desclassificado) return;
          const propInfo = propostaMap.get(ip.proposta_id);
          if (!propInfo) return;
          const valorParaSoma = Number(ip.valor_total_item) || Number(ip.valor_unitario_ofertado) || 0;
          if (valorParaSoma <= 0) return;

          if (!totalPorFornecedor.has(propInfo.fornecedor_id)) {
            totalPorFornecedor.set(propInfo.fornecedor_id, { 
              fornecedores: propInfo.fornecedores, 
              valorTotal: 0, 
              dataEnvio: propInfo.data_envio 
            });
          }
          totalPorFornecedor.get(propInfo.fornecedor_id)!.valorTotal += valorParaSoma;
        });

        totalPorFornecedor.forEach((dados, fornecedorId) => {
          propostasComoLances.push({
            id: `proposta_${fornecedorId}_0`,
            fornecedor_id: fornecedorId,
            fornecedores: dados.fornecedores,
            valor_lance: dados.valorTotal,
            data_hora_lance: dados.dataEnvio || new Date().toISOString(),
            numero_item: 0,
            tipo_lance: 'proposta_inicial',
            indicativo_lance_vencedor: false,
            numero_rodada: 0,
            _isProposta: true
          });
        });
      } else {
        // Por item
        (itensPropostas || []).forEach((ip: any) => {
          if (ip.desclassificado) return;
          const propInfo = propostaMap.get(ip.proposta_id);
          if (!propInfo) return;
          const valorUnit = Number(ip.valor_unitario_ofertado) || 0;
          if (valorUnit <= 0) return;

          propostasComoLances.push({
            id: `proposta_${propInfo.fornecedor_id}_${ip.numero_item}`,
            fornecedor_id: propInfo.fornecedor_id,
            fornecedores: propInfo.fornecedores,
            valor_lance: valorUnit,
            data_hora_lance: propInfo.data_envio || new Date().toISOString(),
            numero_item: ip.numero_item,
            tipo_lance: 'proposta_inicial',
            indicativo_lance_vencedor: false,
            numero_rodada: 0,
            _isProposta: true
          });
        });
      }

      // Combinar lances reais com propostas convertidas
      const todosOsLances = [...(lancesData || []), ...propostasComoLances];
      
      // Armazenar todos os lances (para planilha)
      setLancesCompletos(todosOsLances);
      
      // ORDENAÇÃO CUSTOMIZADA: Priorizar lances de negociação
      // Agrupar lances por item e ordenar cada grupo
      const isDesconto = criterioJulgamento === "desconto";
      
      // Marcar lances de fornecedores inabilitados mas NÃO filtrar - exibir todos
      const lancesComMarcacao = todosOsLances.map((lance: any) => {
        const itensInabilitados = inabilitacoesPorFornecedor.get(lance.fornecedor_id);
        const inabilitadoNoItem = itensInabilitados && itensInabilitados.includes(lance.numero_item);
        return { ...lance, _inabilitado: inabilitadoNoItem };
      });
      
      // CORREÇÃO: Ordenar primeiro por número do item, depois por valor dentro de cada item
      const lancesOrdenados = [...lancesComMarcacao].sort((a: any, b: any) => {
        // 1. Primeiro ordenar por número do item (crescente)
        if (a.numero_item !== b.numero_item) {
          return a.numero_item - b.numero_item;
        }
        
        // 2. Dentro do mesmo item, ordenar por valor (MELHOR VALOR VENCE)
        // Desconto: maior é melhor (ordem decrescente)
        // Preço: menor é melhor (ordem crescente)
        if (isDesconto) {
          return b.valor_lance - a.valor_lance; // Maior desconto primeiro
        } else {
          return a.valor_lance - b.valor_lance; // Menor preço primeiro
        }
      });
      
      console.log("🎯 Lances ordenados por item:", lancesOrdenados.length, "lances");
      console.log("📊 Distribuição por item:", 
        [...new Set(lancesOrdenados.map(l => l.numero_item))].map(item => 
          `Item ${item}: ${lancesOrdenados.filter(l => l.numero_item === item).length} lances`
        ).join(", ")
      );
      
      setLances(lancesOrdenados);
      // Atualizar vencedores quando lances mudam
      loadVencedoresPorItem();
    } catch (error) {
      console.error("Erro ao carregar lances:", error);
    } finally {
      setLoadingLances(false);
    }
  };

  const getLancesDoItem = (numeroItem: number) => {
    // Retorna todos os lances do item (incluindo marcados como inabilitados)
    return lances.filter(l => l.numero_item === numeroItem);
  };

  // Função para pegar lances válidos (não inabilitados) para cálculo de vencedor
  const getLancesValidosDoItem = (numeroItem: number) => {
    return lances.filter(l => l.numero_item === numeroItem && !l._inabilitado);
  };

  // Função para pegar TODOS os lances do item (incluindo inabilitados) - para planilha
  const getLancesCompletosDoItem = (numeroItem: number) => {
    return lancesCompletos.filter(l => l.numero_item === numeroItem);
  };

  const getVencedorItem = (numeroItem: number) => {
    // Primeiro, verificar lances válidos
    const lancesItem = getLancesValidosDoItem(numeroItem);
    if (lancesItem.length > 0) {
      return lancesItem[0];
    }
    
    // FALLBACK: Se não há lances, usar vencedor identificado pela proposta original (vencedoresPorItem)
    // Este Map já inclui fallback para propostas classificadas sem lances (calculado em loadVencedoresPorItem)
    const vencedorPorProposta = vencedoresPorItem.get(numeroItem);
    if (vencedorPorProposta) {
      // Retornar objeto compatível com interface do lance para uso consistente
      return {
        id: `proposta-${numeroItem}-${vencedorPorProposta.fornecedorId}`,
        fornecedor_id: vencedorPorProposta.fornecedorId,
        valor_lance: vencedorPorProposta.valorLance,
        data_hora_lance: new Date().toISOString(),
        indicativo_lance_vencedor: true,
        numero_item: numeroItem,
        numero_rodada: 0,
        tipo_lance: "proposta_original", // Marcador para indicar que veio da proposta
        fornecedores: {
          razao_social: vencedorPorProposta.razaoSocial,
          cnpj: ""
        }
      } as Lance;
    }
    
    return null;
  };

  const getRodadasItem = (numeroItem: number) => {
    const lancesItem = getLancesDoItem(numeroItem);
    const rodadas = new Set(lancesItem.map(l => l.numero_rodada || 1));
    return rodadas.size;
  };

  // ========== FUNÇÕES DO CHAT ==========
  const loadUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserProfile({ type: "interno", data: profile });
        return;
      }

      const { data: fornecedor } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (fornecedor) {
        setUserProfile({ type: "fornecedor", data: fornecedor });
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
    }
  };

  const loadMensagens = async () => {
    try {
      const { data, error } = await supabase
        .from("mensagens_selecao")
        .select(`*, fornecedores (razao_social)`)
        .eq("selecao_id", selecaoId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const mensagensComNomes = await Promise.all(
        (data || []).map(async (msg) => {
          if (msg.tipo_usuario === "interno" && msg.usuario_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("nome_completo")
              .eq("id", msg.usuario_id)
              .single();
            return { ...msg, profiles: profile };
          }
          return msg;
        })
      );

      const newMsgs = mensagensComNomes as any;
      
      // Atualizar contador de não lidas quando chat está fechado
      if (chatCollapsed && newMsgs.length > lastMsgCountRef.current) {
        setUnreadCount(prev => prev + (newMsgs.length - lastMsgCountRef.current));
      }
      
      if (!chatCollapsed) {
        lastMsgCountRef.current = newMsgs.length;
        setUnreadCount(0);
      }

      setMensagens(newMsgs);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
    }
  };

  const handleToggleChat = () => {
    if (chatCollapsed) {
      // Abrindo chat - resetar contagem
      setUnreadCount(0);
      lastMsgCountRef.current = mensagens.length;
    }
    setChatCollapsed(!chatCollapsed);
  };

  const handleEnviarMensagem = useCallback(async () => {
    const mensagemTexto = inputRef.current?.value.trim();
    if (!mensagemTexto || !userProfile) return;

    setEnviandoMsg(true);
    try {
      const { error } = await supabase.from("mensagens_selecao").insert({
        selecao_id: selecaoId,
        mensagem: mensagemTexto,
        tipo_usuario: userProfile.type,
        usuario_id: userProfile.type === "interno" ? userProfile.data.id : null,
        fornecedor_id: userProfile.type === "fornecedor" ? userProfile.data.id : null,
      });

      if (error) throw error;
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      toast.error("Erro ao enviar mensagem");
    } finally {
      setEnviandoMsg(false);
    }
  }, [selecaoId, userProfile]);

  const formatDateTime = (dateTime: string) => {
    return new Date(dateTime).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDeletarLance = (lanceId: string) => {
    setConfirmDeleteLance({ open: true, lanceId });
  };

  const confirmarExclusaoLance = async () => {
    if (!confirmDeleteLance.lanceId) return;
    
    try {
      // Buscar dados do lance antes de deletar (para auditoria)
      const { data: lanceData } = await supabase
        .from("lances_fornecedores")
        .select("*, fornecedores(razao_social, cnpj)")
        .eq("id", confirmDeleteLance.lanceId)
        .single();

      // Buscar dados da seleção para auditoria
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, titulo_selecao, processos_compras(numero_processo_interno, contratos_gestao:contrato_gestao_id(nome_contrato))")
        .eq("id", selecaoId)
        .single();

      const { error } = await supabase
        .from("lances_fornecedores")
        .delete()
        .eq("id", confirmDeleteLance.lanceId);

      if (error) throw error;

      // Registrar auditoria da exclusão do lance
      try {
        await registrarAuditoria({
          acao: 'exclusão',
          entidade: 'Lance',
          entidade_id: confirmDeleteLance.lanceId,
          detalhes: {
            fornecedor: lanceData?.fornecedores?.razao_social || 'N/A',
            cnpj_fornecedor: lanceData?.fornecedores?.cnpj || 'N/A',
            valor_lance: lanceData?.valor_lance || 0,
            numero_item: lanceData?.numero_item || 0,
            tipo_lance: lanceData?.tipo_lance || 'lance',
            numero_selecao: selecaoData?.numero_selecao || 'N/A',
            titulo_selecao: selecaoData?.titulo_selecao || 'N/A',
            numero_processo: (selecaoData?.processos_compras as any)?.numero_processo_interno || '',
            contrato_gestao: (selecaoData?.processos_compras as any)?.contratos_gestao?.nome_contrato || '',
          },
        });
      } catch (auditError) {
        console.error('Erro ao registrar auditoria de lance:', auditError);
      }

      toast.success("Lance excluído com sucesso");
      loadLances();
    } catch (error) {
      console.error("Erro ao excluir lance:", error);
      toast.error("Erro ao excluir lance");
    } finally {
      setConfirmDeleteLance({ open: false, lanceId: null });
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const formatDesconto = (value: number) => {
    return `${value.toFixed(2).replace('.', ',')}%`;
  };

  const formatValorLance = (value: number) => {
    return criterioJulgamento === "desconto" ? formatDesconto(value) : formatCurrency(value);
  };

  const formatCNPJ = (cnpj: string) => {
    return cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") || "";
  };

  const getNomeRemetente = (msg: Mensagem) => {
    if (msg.tipo_usuario === "interno" && msg.profiles) return msg.profiles.nome_completo;
    if (msg.tipo_usuario === "fornecedor" && msg.fornecedores) return msg.fornecedores.razao_social;
    return "Usuário";
  };

  const isMinhaMsg = (msg: Mensagem) => {
    if (!userProfile) return false;
    if (userProfile.type === "interno") return msg.usuario_id === userProfile.data.id;
    return msg.fornecedor_id === userProfile.data.id;
  };

  // ========== FINALIZAR SESSÃO ==========
  const handleFinalizarSessaoInterna = async () => {
    setSalvando(true);
    try {
      // Buscar dados da seleção para auditoria
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select(`
          numero_selecao,
          titulo_selecao,
          processos_compras!inner (
            numero_processo_interno,
            contratos_gestao (
              nome_contrato
            )
          )
        `)
        .eq("id", selecaoId)
        .maybeSingle();

      // Buscar fornecedores inabilitados
      const { data: inabilitados } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", selecaoId)
        .eq("revertido", false);

      const inabilitacoesPorFornecedor = new Map<string, number[]>();
      (inabilitados || []).forEach((f: any) => {
        inabilitacoesPorFornecedor.set(f.fornecedor_id, f.itens_afetados || []);
      });

      // Determinar se critério é desconto
      const isDesconto = criterioJulgamento === "desconto";
      
      // Filtrar lances excluindo fornecedores inabilitados por item
      const lancesFiltrados = lances.filter((lance) => {
        const itensInabilitados = inabilitacoesPorFornecedor.get(lance.fornecedor_id);
        if (!itensInabilitados) return true;
        return !itensInabilitados.includes(lance.numero_item);
      });

      // Identificar vencedor de cada item com priorização de negociação
      const vencedoresPorItem = new Map<number, string>();
      
      // Agrupar lances por item
      const lancesPorItem = new Map<number, typeof lancesFiltrados>();
      lancesFiltrados.forEach(lance => {
        if (!lancesPorItem.has(lance.numero_item)) {
          lancesPorItem.set(lance.numero_item, []);
        }
        lancesPorItem.get(lance.numero_item)!.push(lance);
      });

      // Para cada item, ordenar e escolher vencedor
      lancesPorItem.forEach((lancesDoItem, numeroItem) => {
        const lancesOrdenados = lancesDoItem.sort((a, b) => {
          // Ordenar por valor baseado no critério (MELHOR VALOR VENCE - sem priorizar negociação)
          if (isDesconto) {
            // Desconto: maior é melhor
            if (b.valor_lance !== a.valor_lance) return b.valor_lance - a.valor_lance;
          } else {
            // Preço: menor é melhor
            if (a.valor_lance !== b.valor_lance) return a.valor_lance - b.valor_lance;
          }
          
          // Desempate por data
          return new Date(a.data_hora_lance || 0).getTime() - new Date(b.data_hora_lance || 0).getTime();
        });

        if (lancesOrdenados.length > 0) {
          vencedoresPorItem.set(numeroItem, lancesOrdenados[0].id);
        }
      });

      // Marcar lances vencedores
      const updates = lances.map(lance => ({
        id: lance.id,
        indicativo_lance_vencedor: vencedoresPorItem.get(lance.numero_item) === lance.id
      }));

      for (const update of updates) {
        await supabase
          .from("lances_fornecedores")
          .update({ indicativo_lance_vencedor: update.indicativo_lance_vencedor })
          .eq("id", update.id);
      }

      // Registrar auditoria da finalização da sessão
      const processoData = selecaoData?.processos_compras as { numero_processo_interno?: string; contratos_gestao?: { nome_contrato?: string } } | null;
      await registrarAuditoria({
        acao: 'atualização',
        entidade: 'Sessão de Lances',
        entidade_id: selecaoId,
        detalhes: {
          tipo: 'Finalização de Sessão de Lances',
          numero_selecao: selecaoData?.numero_selecao || numeroSelecao || 'N/A',
          titulo_selecao: selecaoData?.titulo_selecao || tituloSelecao || 'N/A',
          numero_processo: processoData?.numero_processo_interno || 'N/A',
          contrato_gestao: processoData?.contratos_gestao?.nome_contrato || 'N/A',
          total_itens_lotes: isPorLote ? lotes.length : itens.length,
          total_vencedores: vencedoresPorItem.size,
        },
      });

      // Notificar componente pai sobre atualização de vencedores
      if (onVencedoresAtualizados) {
        console.log("📢 FINALIZAR SESSÃO: Notificando componente pai...");
        onVencedoresAtualizados();
      }

      // Chamar callback de finalização (garantir que conclua antes de fechar o diálogo)
      await Promise.resolve(onFinalizarSessao?.());

      toast.success("Sessão finalizada! Análise Documental disponível.");
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao finalizar sessão:", error);
      toast.error("Erro ao finalizar sessão");
    } finally {
      setSalvando(false);
    }
  };

  // ========== REMARCAR VENCEDORES ==========
  const handleRemarcarVencedores = async () => {
    setSalvando(true);
    try {
      console.log("🔄 REMARCAR: Iniciando remarcação de vencedores...");
      
      // Buscar TODOS os lances da seleção diretamente do banco
      const { data: todosLances, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select("numero_item")
        .eq("selecao_id", selecaoId);
      
      if (lancesError) {
        console.error("❌ REMARCAR: Erro ao buscar lances:", lancesError);
        throw lancesError;
      }
      
      // Obter todos os itens únicos dos lances
      const itensUnicos = [...new Set(todosLances?.map(l => l.numero_item) || [])];
      
      console.log(`📋 REMARCAR: Total de itens encontrados: ${itensUnicos.length}`, itensUnicos);
      
      // Atualizar vencedor de cada item usando a função centralizada
      for (const numeroItem of itensUnicos) {
        console.log(`\n⚙️ REMARCAR: ===== PROCESSANDO ITEM ${numeroItem} =====`);
        try {
          await atualizarVencedorItem(numeroItem);
          console.log(`✅ REMARCAR: Item ${numeroItem} processado com sucesso\n`);
        } catch (itemError) {
          console.error(`❌ REMARCAR: ERRO CRÍTICO ao processar item ${numeroItem}:`, itemError);
          console.error(`❌ REMARCAR: Stack trace:`, itemError);
          // Continua processando outros itens mesmo se um falhar
        }
      }

      console.log("✅ REMARCAR: Remarcação concluída - vencedores atualizados no banco");
      
      // Recarregar dados locais
      await loadLances();
      await loadVencedoresPorItem();
      
      // Notificar componente pai para recarregar vencedores na Análise Documental
      console.log("📢 REMARCAR: Notificando componente pai...");
      if (onVencedoresAtualizados) {
        onVencedoresAtualizados();
        console.log("✅ REMARCAR: Componente pai notificado!");
      }
      
      toast.success(`${itensUnicos.length} item(ns) processado(s). Vencedores atualizados!`);
    } catch (error) {
      console.error("Erro ao remarcar vencedores:", error);
      toast.error("Erro ao remarcar vencedores");
    } finally {
      setSalvando(false);
    }
  };

  // ========== CARREGAR PLANILHAS GERADAS ==========
  const loadPlanilhasGeradas = async () => {
    try {
      const { data, error } = await supabase
        .from("planilhas_lances_selecao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .order("data_geracao", { ascending: false });
      
      if (error) throw error;
      
      setPlanilhasGeradas(data || []);
    } catch (error) {
      console.error("Erro ao carregar planilhas:", error);
    }
  };

  // ========== VISUALIZAR PLANILHA ==========
  const handleVisualizarPlanilha = (url: string) => {
    window.open(url, "_blank");
  };

  // ========== DELETAR PLANILHA ==========
  const handleDeletarPlanilha = async () => {
    if (!confirmDeletePlanilha.planilhaId || !confirmDeletePlanilha.urlArquivo) return;
    
    const planilhaId = confirmDeletePlanilha.planilhaId;
    const urlArquivo = confirmDeletePlanilha.urlArquivo;
    
    try {
      // Buscar dados da planilha antes de deletar (para auditoria)
      const { data: planilhaData } = await supabase
        .from("planilhas_lances_selecao")
        .select("nome_arquivo, protocolo")
        .eq("id", planilhaId)
        .single();

      // Buscar dados da seleção para auditoria
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, titulo_selecao, processos_compras(numero_processo_interno, contratos_gestao:contrato_gestao_id(nome_contrato))")
        .eq("id", selecaoId)
        .single();

      // Extrair caminho do storage da URL
      const urlParts = urlArquivo.split("/storage/v1/object/public/processo-anexos/");
      const storagePath = urlParts[1];
      
      // Deletar arquivo do storage
      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from("processo-anexos")
          .remove([storagePath]);
        
        if (storageError) throw storageError;
      }
      
      // Deletar registro do banco
      const { error: dbError } = await supabase
        .from("planilhas_lances_selecao")
        .delete()
        .eq("id", planilhaId);
      
      if (dbError) throw dbError;

      // Formatar protocolo para padrão curto
      let protocoloFormatado = planilhaData?.protocolo || '';
      if (protocoloFormatado && protocoloFormatado.includes('-')) {
        const limpo = protocoloFormatado.replace(/-/g, '').toUpperCase().substring(0, 16);
        protocoloFormatado = `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
      }

      // Registrar auditoria da exclusão da planilha
      try {
        await registrarAuditoria({
          acao: 'exclusão',
          entidade: 'Planilha de Lances',
          entidade_id: planilhaId,
          detalhes: {
            nome_arquivo: planilhaData?.nome_arquivo || 'N/A',
            protocolo: protocoloFormatado || null,
            numero_selecao: selecaoData?.numero_selecao || 'N/A',
            titulo_selecao: selecaoData?.titulo_selecao || 'N/A',
            numero_processo: (selecaoData?.processos_compras as any)?.numero_processo_interno || '',
            contrato_gestao: (selecaoData?.processos_compras as any)?.contratos_gestao?.nome_contrato || '',
          },
        });
      } catch (auditError) {
        console.error('Erro ao registrar auditoria de planilha:', auditError);
      }
      
      // Recarregar lista de planilhas e lances
      await loadPlanilhasGeradas();
      await loadLances();
      toast.success("Planilha deletada com sucesso!");
    } catch (error) {
      console.error("Erro ao deletar planilha:", error);
      toast.error("Erro ao deletar planilha");
    } finally {
      setConfirmDeletePlanilha({ open: false, planilhaId: null, urlArquivo: null });
    }
  };

  // ========== GERAR PLANILHA DE LANCES ==========
  const handleGerarPlanilhaLances = async () => {
    if (gerandoPlanilha) return; // Evitar cliques duplos
    
    try {
      setGerandoPlanilha(true);

      const doc = new jsPDF("portrait");
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 15;
      const logoHeight = 40; // Altura do logo
      const rodapeHeight = 25; // Altura do rodapé
      
      // Função genérica para carregar imagem com alta resolução
      const loadImage = (src: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 3;
            canvas.width = img.naturalWidth * scale;
            canvas.height = img.naturalHeight * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.scale(scale, scale);
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png', 1.0));
            } else {
              reject(new Error('Erro ao criar canvas'));
            }
          };
          img.onerror = (e) => {
            console.error('Erro ao carregar imagem:', e);
            reject(new Error('Erro ao carregar imagem'));
          };
          img.src = src;
        });
      };

      let base64Logo: string | null = null;
      let base64Rodape: string | null = null;
      let base64LogoHorizontal: string | null = null;
      let yStart = 35;
      
      try {
        // Carregar logo, rodapé e logo horizontal em paralelo
        const [logoResult, rodapeResult, logoHorizontalResult] = await Promise.all([
          loadImage(capaLogo),
          loadImage(capaRodape),
          loadImage(logoHorizontal)
        ]);
        base64Logo = logoResult;
        base64Rodape = rodapeResult;
        base64LogoHorizontal = logoHorizontalResult;
        
        // Logo no topo - largura com margem de 1.5mm em cada lado
        const logoMargin = 4.25; // 1.5mm em pontos PDF
        doc.addImage(base64Logo, 'PNG', logoMargin, 0, pageWidth - (logoMargin * 2), logoHeight);
        // Rodapé no fim - largura com margem de 1.5mm em cada lado
        doc.addImage(base64Rodape, 'PNG', logoMargin, pageHeight - rodapeHeight, pageWidth - (logoMargin * 2), rodapeHeight);
        yStart = logoHeight + 10; // Aumentar espaçamento entre logo e título
      } catch (logoError) {
        console.warn('Imagem não carregou, usando cabeçalho alternativo:', logoError);
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 25, "F");
        yStart = 30;
      }
      
      // Rastrear páginas que já receberam logo/rodapé
      const paginasProcessadas = new Set<number>();
      paginasProcessadas.add(1); // Primeira página já foi processada
      
      // Função para adicionar logo e rodapé em nova página
      const adicionarLogoERodapeNovaPagina = () => {
        const paginaAtual = (doc as any).internal.pages.length - 1;
        if (!paginasProcessadas.has(paginaAtual)) {
          paginasProcessadas.add(paginaAtual);
          if (base64Logo) {
            const logoMargin = 4.25; // 1.5mm em pontos PDF
            doc.addImage(base64Logo, 'PNG', logoMargin, 0, pageWidth - (logoMargin * 2), logoHeight);
          }
          if (base64Rodape) {
            const logoMargin = 4.25; // 1.5mm em pontos PDF
            doc.addImage(base64Rodape, 'PNG', logoMargin, pageHeight - rodapeHeight, pageWidth - (logoMargin * 2), rodapeHeight);
          }
        }
      };
      
      // Buscar dados da seleção para o título
      const { data: selecaoInfoPlanilha } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, cotacao_relacionada_id, processos_compras(numero_processo_interno, objeto_resumido)")
        .eq("id", selecaoId)
        .single();
      
      const numSelecao = selecaoInfoPlanilha?.numero_selecao || "-";
      const numProcesso = (selecaoInfoPlanilha?.processos_compras as any)?.numero_processo_interno || "-";
      const objetoProcesso = (selecaoInfoPlanilha?.processos_compras as any)?.objeto_resumido || "Objeto do Processo";
      
      // Função para remover tags HTML
      const stripHtml = (html: string) => {
        return html?.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || '';
      };

      // Cabeçalho de texto
      doc.setTextColor(0, 128, 128); // Verde do logo
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`PLANILHA DE LANCES DA SELEÇÃO DE FORNECEDORES ${numSelecao}`, pageWidth / 2, yStart, { align: "center" });
      
      doc.setFontSize(12);
      doc.text(`PROCESSO ${numProcesso}`, pageWidth / 2, yStart + 8, { align: "center" });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Critério de Julgamento: ${criterioJulgamento === "por_item" ? "Menor Preço por Item" : criterioJulgamento === "global" ? "Menor Preço Global" : criterioJulgamento === "por_lote" ? "Menor Preço por Lote" : criterioJulgamento}`, pageWidth / 2, yStart + 16, { align: "center" });

      doc.setTextColor(0, 0, 0);

      // Função para converter número para romano
      const toRoman = (num: number): string => {
        const romanNumerals: [number, string][] = [
          [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
          [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
          [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
        ];
        let result = '';
        for (const [value, symbol] of romanNumerals) {
          while (num >= value) {
            result += symbol;
            num -= value;
          }
        }
        return result;
      };

      // Quando critério for "por_lote", usar lotes ao invés de itens
      const isPorLoteLocal = criterioJulgamento === "por_lote";
      const isGlobalLocal = criterioJulgamento === "global";
      
      // Preparar dados para iteração - usar lotes quando for por_lote, item único quando global
      let elementosParaIterar: { numero: number; descricao: string; quantidade: number; unidade: string; isLote: boolean; isGlobal?: boolean }[];
      
      if (isGlobalLocal) {
        // Para critério global: um único item com a descrição do objeto do processo
        // Unidade/Quantidade não existem no objeto (no resumo devem aparecer como "-")
        elementosParaIterar = [{
          numero: 0,
          descricao: stripHtml(objetoProcesso),
          quantidade: 0,
          unidade: "",
          isLote: false,
          isGlobal: true,
        }];
      } else if (isPorLoteLocal && lotes.length > 0) {
        elementosParaIterar = lotes.map(lote => ({
          numero: lote.numero_lote,
          descricao: lote.descricao_lote,
          quantidade: 1, // Lote não tem quantidade individual
          unidade: "LOTE",
          isLote: true
        }));
      } else {
        elementosParaIterar = itens.map(item => ({
          numero: item.numero_item,
          descricao: item.descricao,
          quantidade: item.quantidade || 1,
          unidade: item.unidade || "UN",
          isLote: false
        }));
      }

      // ========== BUSCAR PROPOSTAS ORIGINAIS PARA INCLUIR COMO "PRIMEIROS LANCES" ==========
      const { data: propostasParaPlanilha } = await supabase
        .from("selecao_propostas_fornecedor")
        .select("id, fornecedor_id, fornecedores(id, razao_social, cnpj), data_envio_proposta")
        .eq("selecao_id", selecaoId);

      const propostaIdsPlanilha = (propostasParaPlanilha || []).map((p: any) => p.id);
      
      const { data: itensPropostasPlanilha } = propostaIdsPlanilha.length > 0
        ? await supabase
            .from("selecao_respostas_itens_fornecedor")
            .select("proposta_id, numero_item, lote_id, valor_unitario_ofertado, valor_total_item, desclassificado")
            .in("proposta_id", propostaIdsPlanilha)
        : { data: [] };

      // Mapear proposta_id -> dados do fornecedor e data
      const propostaToFornecedorPlanilha = new Map<string, any>();
      (propostasParaPlanilha || []).forEach((p: any) => {
        propostaToFornecedorPlanilha.set(p.id, {
          fornecedor_id: p.fornecedor_id,
          fornecedores: p.fornecedores,
          data_envio: p.data_envio_proposta
        });
      });

      // Buscar lotes para mapear lote_id -> numero_lote (para por_lote)
      let loteIdToNumeroPlanilha = new Map<string, number>();
      if (isPorLoteLocal) {
        const cotacaoRelId = selecaoInfoPlanilha?.cotacao_relacionada_id || "";
        if (cotacaoRelId) {
          const { data: lotesDataPlanilha } = await supabase
            .from("lotes_cotacao")
            .select("id, numero_lote")
            .eq("cotacao_id", cotacaoRelId);
          (lotesDataPlanilha || []).forEach((l: any) => loteIdToNumeroPlanilha.set(l.id, l.numero_lote));
        } else {
          // Fallback: usar lotes do props
          lotes.forEach(l => loteIdToNumeroPlanilha.set(l.id, l.numero_lote));
        }
      }

      // Montar propostas como "lances iniciais" por item/lote
      const propostasComoLances = new Map<number, any[]>(); // Map<numero_item_ou_lote, lance-like[]>

      if (isPorLoteLocal) {
        // Agrupar por lote+fornecedor, somar valor total do lote
        const totalPorLoteFornecedor = new Map<string, { fornecedorId: string; fornecedores: any; valorTotal: number; dataEnvio: string }>();
        (itensPropostasPlanilha || []).forEach((ip: any) => {
          const propostaInfo = propostaToFornecedorPlanilha.get(ip.proposta_id);
          if (!propostaInfo) return;
          const loteId = ip.lote_id;
          if (!loteId) return;
          const numeroLote = loteIdToNumeroPlanilha.get(loteId);
          if (numeroLote === undefined) return;

          // Mesmo fallback usado no carregamento de lances da tela
          const valorParaSoma = Number(ip.valor_total_item) || Number(ip.valor_unitario_ofertado) || 0;
          if (valorParaSoma <= 0) return;

          const key = `${numeroLote}_${propostaInfo.fornecedor_id}`;
          if (!totalPorLoteFornecedor.has(key)) {
            totalPorLoteFornecedor.set(key, { fornecedorId: propostaInfo.fornecedor_id, fornecedores: propostaInfo.fornecedores, valorTotal: 0, dataEnvio: propostaInfo.data_envio });
          }
          totalPorLoteFornecedor.get(key)!.valorTotal += valorParaSoma;
        });

        totalPorLoteFornecedor.forEach((dados, key) => {
          const numeroLote = parseInt(key.split('_')[0], 10);
          if (!propostasComoLances.has(numeroLote)) propostasComoLances.set(numeroLote, []);
          propostasComoLances.get(numeroLote)!.push({
            id: `proposta_${dados.fornecedorId}_${numeroLote}`,
            fornecedor_id: dados.fornecedorId,
            fornecedores: dados.fornecedores,
            valor_lance: dados.valorTotal,
            data_hora_lance: dados.dataEnvio || new Date().toISOString(),
            numero_item: numeroLote,
            tipo_lance: 'proposta_inicial',
            _isProposta: true,
          });
        });
      } else if (isGlobalLocal) {
        // Agrupar por fornecedor, somar tudo em item 0
        const totalPorFornecedor = new Map<string, { fornecedores: any; valorTotal: number; dataEnvio: string }>();
        (itensPropostasPlanilha || []).forEach((ip: any) => {
          const propostaInfo = propostaToFornecedorPlanilha.get(ip.proposta_id);
          if (!propostaInfo) return;

          // Mesmo fallback usado no carregamento de lances da tela
          const valorParaSoma = Number(ip.valor_total_item) || Number(ip.valor_unitario_ofertado) || 0;
          if (valorParaSoma <= 0) return;

          if (!totalPorFornecedor.has(propostaInfo.fornecedor_id)) {
            totalPorFornecedor.set(propostaInfo.fornecedor_id, { fornecedores: propostaInfo.fornecedores, valorTotal: 0, dataEnvio: propostaInfo.data_envio });
          }
          totalPorFornecedor.get(propostaInfo.fornecedor_id)!.valorTotal += valorParaSoma;
        });

        totalPorFornecedor.forEach((dados, fornecedorId) => {
          if (!propostasComoLances.has(0)) propostasComoLances.set(0, []);
          propostasComoLances.get(0)!.push({
            id: `proposta_${fornecedorId}_0`,
            fornecedor_id: fornecedorId,
            fornecedores: dados.fornecedores,
            valor_lance: dados.valorTotal,
            data_hora_lance: dados.dataEnvio || new Date().toISOString(),
            numero_item: 0,
            tipo_lance: 'proposta_inicial',
            _isProposta: true,
          });
        });
      } else {
        // Por item
        (itensPropostasPlanilha || []).forEach((ip: any) => {
          const propostaInfo = propostaToFornecedorPlanilha.get(ip.proposta_id);
          if (!propostaInfo) return;

          const numeroItem = Number(ip.numero_item);
          if (!Number.isFinite(numeroItem)) return;

          const valorUnit = Number(ip.valor_unitario_ofertado) || 0;
          if (valorUnit <= 0) return;

          if (!propostasComoLances.has(numeroItem)) propostasComoLances.set(numeroItem, []);
          propostasComoLances.get(numeroItem)!.push({
            id: `proposta_${propostaInfo.fornecedor_id}_${numeroItem}`,
            fornecedor_id: propostaInfo.fornecedor_id,
            fornecedores: propostaInfo.fornecedores,
            valor_lance: valorUnit,
            data_hora_lance: propostaInfo.data_envio || new Date().toISOString(),
            numero_item: numeroItem,
            tipo_lance: 'proposta_inicial',
            _isProposta: true,
          });
        });
      }

      // Buscar lances reais diretamente do banco (não depender de lancesCompletos state que pode estar desatualizado)
      const { data: lancesReaisPlanilha } = await supabase
        .from("lances_fornecedores")
        .select(`*, fornecedores (razao_social, cnpj)`)
        .eq("selecao_id", selecaoId)
        .order("numero_item", { ascending: true })
        .order("data_hora_lance", { ascending: true });

      // Agrupar lances por item/lote - USANDO LANCES DO BANCO + PROPOSTAS COMO LANCES INICIAIS
      const lancesGroupedByItem = elementosParaIterar.map(elemento => {
        const lancesElemento = (lancesReaisPlanilha || []).filter((l: any) => l.numero_item === elemento.numero);
        const propostasElemento = propostasComoLances.get(elemento.numero) || [];
        
        // Combinar lances reais com propostas iniciais
        return { elemento, lances: [...lancesElemento, ...propostasElemento] };
      });

      let yPosition = yStart + 22;
      let temInabilitado = false; // Flag para legenda de inabilitados

      lancesGroupedByItem.forEach(({ elemento, lances: lancesDoItem }) => {
        // Título baseado em lote, global ou item
        // Remover prefixo "Lote XX - " da descrição se existir para evitar duplicação
        const descricaoLimpa = elemento.isLote 
          ? elemento.descricao.replace(/^Lote\s*\d+\s*[-–:]\s*/i, '')
          : elemento.descricao;
        
        let tituloTexto: string;
        let termoSemLances: string;
        
        if ((elemento as any).isGlobal) {
          // Para critério global: usar título com descrição do objeto
          tituloTexto = `Total Global: ${descricaoLimpa}`;
          termoSemLances = "Nenhum lance registrado";
        } else if (elemento.isLote) {
          tituloTexto = `Lote ${toRoman(elemento.numero)} - ${descricaoLimpa}`;
          termoSemLances = "Nenhum lance registrado para este lote";
        } else {
          tituloTexto = `Item ${elemento.numero}: ${elemento.descricao}`;
          termoSemLances = "Nenhum lance registrado para este item";
        }

        if (lancesDoItem.length === 0) {
          // Para itens/lotes sem lances, criar tabela apenas com título
          autoTable(doc, {
            startY: yPosition,
            head: [
              [{ content: tituloTexto, colSpan: 4, styles: { fillColor: [224, 242, 241], textColor: [0, 128, 128], halign: "justify", fontSize: 10 } }],
              ["Pos.", "Fornecedor", "Valor", "Data/Hora"]
            ],
            body: [[{ content: termoSemLances, colSpan: 4, styles: { halign: "center", textColor: [100, 100, 100], fontStyle: "italic" } }]],
            theme: "striped",
            styles: { 
              fontSize: 8, 
              cellPadding: 1.5,
              lineColor: [200, 200, 200],
              lineWidth: 0.1,
              valign: "middle",
              textColor: [0, 0, 0], // Preto
            },
            headStyles: { 
              fillColor: [0, 128, 128], // Verde do logo
              textColor: 255,
              fontStyle: "bold",
              halign: "center",
              valign: "middle"
            },
            columnStyles: {
              0: { cellWidth: 20, halign: "center", fontStyle: "bold" },
              1: { cellWidth: 80 },
              2: { cellWidth: 35, halign: "right", fontStyle: "bold" },
              3: { cellWidth: 45, halign: "center" },
            },
            margin: { top: logoHeight + 10, bottom: rodapeHeight + 10 },
            didDrawPage: () => {
              adicionarLogoERodapeNovaPagina();
            },
          });
          yPosition = (doc as any).lastAutoTable.finalY + 8;
        } else {
          // Função para verificar se fornecedor está inabilitado NESTE ITEM ESPECÍFICO
          const isInabilitadoNoItem = (fornecedorId: string, numeroItem: number) => {
            const itensInabilitados = inabilitacoesPorFornecedor.get(fornecedorId);
            if (!itensInabilitados) return false;
            return itensInabilitados.includes(numeroItem);
          };

          // Verificar se há fornecedores inabilitados neste item/lote específico
          const temInabilitadoNoItem = lancesDoItem.some(l => isInabilitadoNoItem(l.fornecedor_id, elemento.numero));
          if (temInabilitadoNoItem) temInabilitado = true;

          // Verificar desclassificação por preço (proposta acima do estimado)
          // Aplica-se a propostas iniciais (_isProposta) - lances normais já são validados no momento do registro
          const isDesclassificadoPorPrecoPlanilha = (lance: any): boolean => {
            if (!lance._isProposta) return false;
            const valorEstimado = estimativasItens.get(elemento.numero);
            if (!valorEstimado || valorEstimado === 0) return false;
            const isDescontoLocal = criterioJulgamento === "desconto";
            return isDescontoLocal ? lance.valor_lance < valorEstimado : lance.valor_lance > valorEstimado;
          };

          // Se TODOS os lances/propostas válidos são inabilitados ou desclassificados, marcar como FRACASSADO
          const todosInvalidosOuDesclassificados = lancesDoItem.every(l => 
            isInabilitadoNoItem(l.fornecedor_id, elemento.numero) || isDesclassificadoPorPrecoPlanilha(l)
          );

          // Reordenar: fornecedores válidos primeiro (ordenados por valor), inabilitados e desclassificados depois
          const lancesValidos = lancesDoItem.filter(l => !isInabilitadoNoItem(l.fornecedor_id, elemento.numero) && !isDesclassificadoPorPrecoPlanilha(l));
          const lancesInabilitados = lancesDoItem.filter(l => isInabilitadoNoItem(l.fornecedor_id, elemento.numero));
          const lancesDesclassificados = lancesDoItem.filter(l => !isInabilitadoNoItem(l.fornecedor_id, elemento.numero) && isDesclassificadoPorPrecoPlanilha(l));
          
          // Ordenar TODOS os grupos por valor (MELHOR VALOR VENCE - sem priorizar negociação)
          const isDesconto = criterioJulgamento === "desconto";
          const sortByValor = (a: any, b: any) => isDesconto ? b.valor_lance - a.valor_lance : a.valor_lance - b.valor_lance;
          
          const lancesValidosOrdenados = lancesValidos.sort(sortByValor);
          const lancesDesclassificadosOrdenados = lancesDesclassificados.sort(sortByValor);
          const lancesInabilitadosOrdenados = lancesInabilitados.sort(sortByValor);
          
          const lancesOrdenados = [...lancesValidosOrdenados, ...lancesDesclassificadosOrdenados, ...lancesInabilitadosOrdenados];

          let temDesclassificado = false;

          const tableData = lancesOrdenados.map((lance, idx) => {
            const isNegociacao = lance.tipo_lance === "negociacao";
            const isProposta = lance._isProposta === true;
            const isDesclassificado = isDesclassificadoPorPrecoPlanilha(lance);
            const valorFormatado = formatValorLance(lance.valor_lance);
            const isInabilitado = isInabilitadoNoItem(lance.fornecedor_id, elemento.numero);
            
            if (isDesclassificado) temDesclassificado = true;
            
            // Posição: só conta para fornecedores válidos (não inabilitados e não desclassificados)
            const posicaoExibida = (isInabilitado || isDesclassificado) ? "-" : `${lancesValidosOrdenados.findIndex(l => l.id === lance.id) + 1}º`;
            
            // Valor formatado com indicadores
            let valorExibido = valorFormatado;
            if (isNegociacao) valorExibido = `${valorFormatado} †`;
            if (isProposta) valorExibido = `${valorFormatado} *`;
            if (isDesclassificado) {
              valorExibido = isProposta ? `${valorFormatado} *` : valorFormatado;
            }
            
            return {
              data: [
                posicaoExibida,
                `${lance.fornecedores?.razao_social || "N/A"}\n${formatCNPJ(lance.fornecedores?.cnpj || "")}`,
                valorExibido,
                new Date(lance.data_hora_lance).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit"
                }),
              ],
              isInabilitado,
              isNegociacao,
              isProposta,
              isDesclassificado,
              isVencedor: !isInabilitado && !isDesclassificado && lancesValidosOrdenados.findIndex(l => l.id === lance.id) === 0
            };
          });

          autoTable(doc, {
            startY: yPosition,
            head: [
              [{ content: tituloTexto, colSpan: 4, styles: { fillColor: [224, 242, 241], textColor: [0, 128, 128], halign: "justify", fontSize: 10 } }],
              ["Pos.", "Fornecedor", criterioJulgamento === "desconto" ? "% Desconto" : "Valor", "Data/Hora"]
            ],
            body: tableData.map(row => row.data),
            theme: "striped",
            showHead: 'firstPage', // Não repetir cabeçalho (descrição) nas páginas seguintes
            styles: { 
              fontSize: 8, 
              cellPadding: 1.5,
              lineColor: [200, 200, 200],
              lineWidth: 0.1,
              valign: "middle",
              textColor: [0, 0, 0], // Preto
            },
            headStyles: { 
              fillColor: [0, 128, 128], // Verde do logo
              textColor: 255,
              fontStyle: "bold",
              halign: "center",
              valign: "middle"
            },
            columnStyles: {
              0: { cellWidth: 20, halign: "center", fontStyle: "bold" },
              1: { cellWidth: 80 },
              2: { cellWidth: 35, halign: "right", fontStyle: "bold" },
              3: { cellWidth: 45, halign: "center" },
            },
            alternateRowStyles: {
              fillColor: [224, 242, 241] // Verde claro do logo
            },
            margin: { top: logoHeight + 10, bottom: rodapeHeight + 10 },
            didDrawPage: () => {
              adicionarLogoERodapeNovaPagina();
            },
            didParseCell: (data) => {
              if (data.section === "body") {
                const rowInfo = tableData[data.row.index];
                
                // Destacar fornecedores inabilitados em vermelho
                if (rowInfo?.isInabilitado) {
                  data.cell.styles.textColor = [220, 38, 38]; // Vermelho
                  data.cell.styles.fillColor = [254, 226, 226]; // Fundo vermelho claro
                }
                // Destacar desclassificados em laranja
                else if (rowInfo?.isDesclassificado) {
                  data.cell.styles.textColor = [194, 65, 12]; // Laranja escuro
                  data.cell.styles.fillColor = [255, 237, 213]; // Fundo laranja claro
                }
                // Destacar primeira posição (vencedor) - apenas se não for inabilitado/desclassificado
                else if (rowInfo?.isVencedor) {
                  data.cell.styles.fillColor = [254, 249, 195];
                  data.cell.styles.fontStyle = "bold";
                }
                // Destacar valores de negociação
                if (data.column.index === 2 && rowInfo?.isNegociacao && !rowInfo?.isInabilitado) {
                  data.cell.styles.textColor = [22, 163, 74];
                }
                // Destacar propostas iniciais (azul)
                if (data.column.index === 2 && rowInfo?.isProposta && !rowInfo?.isInabilitado && !rowInfo?.isDesclassificado) {
                  data.cell.styles.textColor = [37, 99, 235]; // Azul
                }
              }
            },
          });

          yPosition = (doc as any).lastAutoTable.finalY + 8;
          
          // Indicador FRACASSADO quando todos os lances/propostas são inabilitados ou desclassificados
          if (todosInvalidosOuDesclassificados) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(220, 38, 38);
            doc.text(`${elemento.isLote ? 'Lote' : 'Item'} FRACASSADO - Nenhuma empresa classificada`, margin + 3, yPosition);
            doc.setTextColor(0, 0, 0);
            yPosition += 8;
          }
          
          // Legendas
          const temNegociacao = lancesDoItem.some(l => l.tipo_lance === "negociacao");
          const temProposta = lancesDoItem.some(l => (l as any)._isProposta);
          
          if (temNegociacao) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(22, 163, 74);
            doc.text("† Valor obtido por negociação", margin + 3, yPosition);
            doc.setTextColor(0, 0, 0);
            yPosition += 5;
          }
          
          if (temProposta) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(37, 99, 235);
            doc.text("* Valor da proposta inicial enviada pelo fornecedor", margin + 3, yPosition);
            doc.setTextColor(0, 0, 0);
            yPosition += 5;
          }
          
          if (temDesclassificado) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(194, 65, 12);
            doc.text("' Proposta desclassificada (valor acima do estimado)", margin + 3, yPosition);
            doc.setTextColor(0, 0, 0);
            yPosition += 5;
          }
          
          // Legenda de fornecedor inabilitado se houver
          if (temInabilitadoNoItem) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(220, 38, 38);
            doc.text("Linhas em vermelho indicam empresa inabilitada", margin + 3, yPosition);
            doc.setTextColor(0, 0, 0);
            yPosition += 8;
          } else if (temNegociacao || temProposta || temDesclassificado) {
            yPosition += 3;
          }
        }
      });

      // Resumo geral em nova página PAISAGEM
      doc.addPage("a4", "l"); // "l" = landscape
      const landscapeWidth = doc.internal.pageSize.getWidth();
      const landscapeHeight = doc.internal.pageSize.getHeight();
      
      // Adicionar logo horizontal centralizado no topo da página de resumo
      const logoResumoHeight = 22;
      const logoResumoWidth = 60;
      let resumoStartY = 15;
      
      if (base64LogoHorizontal) {
        // Centralizar logo horizontalmente
        const logoX = (landscapeWidth - logoResumoWidth) / 2;
        doc.addImage(base64LogoHorizontal, 'PNG', logoX, 8, logoResumoWidth, logoResumoHeight);
        resumoStartY = 8 + logoResumoHeight + 8; // Logo + espaçamento
      }
      
      // Buscar dados da seleção e processo para títulos
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, processo_compra_id, cotacao_relacionada_id, processos_compras(numero_processo_interno)")
        .eq("id", selecaoId)
        .single();

      const numeroSelecao = selecaoData?.numero_selecao || "-";
      const numeroProcesso = (selecaoData?.processos_compras as any)?.numero_processo_interno || "-";
      const cotacaoRelacionadaId = selecaoData?.cotacao_relacionada_id || "";

      // Título principal - verde do logo
      doc.setTextColor(0, 128, 128);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`MAPA RESUMO DA SELEÇÃO DE FORNECEDORES ${numeroSelecao}`, landscapeWidth / 2, resumoStartY + 5, { align: "center" });
      
      // Subtítulo com número do processo
      doc.setFontSize(11);
      doc.text(`PROCESSO ${numeroProcesso}`, landscapeWidth / 2, resumoStartY + 12, { align: "center" });
      resumoStartY += 22;
      
      doc.setTextColor(0, 0, 0);

      // Buscar marcas das propostas dos vencedores
      const vencedoresIds = new Set<string>();
      itens.forEach(item => {
        const vencedor = getVencedorItem(item.numero_item);
        if (vencedor) vencedoresIds.add(vencedor.fornecedor_id);
      });

      // Buscar TODAS as propostas para determinar marcas e quais itens receberam proposta
      const { data: todasPropostasItens } = await supabase
        .from("selecao_respostas_itens_fornecedor")
        .select("numero_item, lote_id, marca, valor_unitario_ofertado, valor_total_item, desclassificado, proposta_id, selecao_propostas_fornecedor!inner(fornecedor_id)")
        .eq("selecao_propostas_fornecedor.selecao_id", selecaoId);

      // Criar mapa de marcas por item/fornecedor
      let marcasPorItemFornecedor: Record<string, string> = {};
      // Criar Set de itens que receberam proposta ENVIADA (para distinguir DESERTO)
      const itensComPropostaEnviada = new Set<number>();
      const lotesComPropostaEnviada = new Set<number>();
      // Criar Set de itens que têm proposta CLASSIFICADA (não desclassificada, valor <= estimado, fornecedor habilitado)
      const itensComPropostaClassificada = new Set<number>();
      const lotesComPropostaClassificada = new Set<number>();

      if (todasPropostasItens) {
        // Buscar lotes para mapeamento lote_id -> numero_lote (se por_lote)
        let loteIdToNumero = new Map<string, number>();
        if (isPorLoteLocal) {
          const { data: lotesCotacao } = await supabase
            .from("lotes_cotacao")
            .select("id, numero_lote")
            .eq("cotacao_id", cotacaoRelacionadaId || "");
          if (lotesCotacao) {
            loteIdToNumero = new Map(lotesCotacao.map(l => [l.id, l.numero_lote]));
          }
        }

        // Para lote: agrupar totais por lote/fornecedor para verificar desclassificação
        const totaisPorLoteFornecedor = new Map<number, Map<string, number>>();

        todasPropostasItens.forEach((ip: any) => {
          const fornecedorId = ip.selecao_propostas_fornecedor?.fornecedor_id;
          const key = `${ip.numero_item}-${fornecedorId}`;
          marcasPorItemFornecedor[key] = ip.marca || "-";
          
          const valorOfertado = Number(ip.valor_unitario_ofertado) || 0;
          if (valorOfertado <= 0) return;

          // Registrar proposta enviada (para DESERTO)
          itensComPropostaEnviada.add(ip.numero_item);
          if (isPorLoteLocal && ip.lote_id) {
            const numeroLote = loteIdToNumero.get(ip.lote_id);
            if (numeroLote) lotesComPropostaEnviada.add(numeroLote);
          }
          
          // Verificar se proposta está desclassificada pelo banco
          if (ip.desclassificado) return;

          // Verificar se fornecedor está inabilitado
          const itensInabilitados = inabilitacoesPorFornecedor.get(fornecedorId);
          
          if (isPorLoteLocal && ip.lote_id) {
            const numeroLote = loteIdToNumero.get(ip.lote_id);
            if (!numeroLote) return;
            
            // Verificar inabilitação para o lote
            if (itensInabilitados && itensInabilitados.includes(numeroLote)) return;
            
            // Acumular total do lote para este fornecedor
            const valorTotalItem = Number(ip.valor_total_item) || 0;
            if (!totaisPorLoteFornecedor.has(numeroLote)) {
              totaisPorLoteFornecedor.set(numeroLote, new Map());
            }
            const mapFornecedor = totaisPorLoteFornecedor.get(numeroLote)!;
            mapFornecedor.set(fornecedorId, (mapFornecedor.get(fornecedorId) || 0) + valorTotalItem);
          } else {
            // Verificar inabilitação para o item
            if (itensInabilitados && itensInabilitados.includes(ip.numero_item)) return;
            
            // Verificar se valor está acima do estimado (desclassificação por preço)
            if (!isLanceDesclassificadoPorPreco(ip.numero_item, valorOfertado)) {
              itensComPropostaClassificada.add(ip.numero_item);
            }
          }
        });

        // Para lotes: verificar se há pelo menos um fornecedor com total <= estimado
        totaisPorLoteFornecedor.forEach((fornecedores, numeroLote) => {
          for (const [_, total] of fornecedores) {
            if (!isLanceDesclassificadoPorPreco(numeroLote, total)) {
              lotesComPropostaClassificada.add(numeroLote);
              break; // Basta um fornecedor classificado
            }
          }
        });
      }

      let valorTotalGeral = 0;
      
      // Para critério global: usar formato simplificado (linha única com total)
      let elementosResumo = elementosParaIterar;
      const vencedorGlobal = isGlobalLocal ? getVencedorItem(0) : null;
      let useGlobalResumoFormat = isGlobalLocal;
      
      // Usar elementos preparados anteriormente (lotes ou itens conforme critério)
      const resumoData = elementosResumo.map(elemento => {
        const vencedor = isGlobalLocal ? vencedorGlobal : getVencedorItem(elemento.numero);
        const quantidade = elemento.quantidade || 1;
        
        // Buscar marca da proposta do fornecedor vencedor (não aplicável para lotes ou global)
        const marcaKey = vencedor ? `${elemento.numero}-${vencedor.fornecedor_id}` : "";
        const isGlobalItem = (elemento as any).isGlobal;
        const marca = (elemento.isLote || isGlobalItem) ? "-" : (marcasPorItemFornecedor[marcaKey] || "-");
        
        // Formatar número/identificador: "-" para global, romano para lote, número para item
        let identificador: string;
        if (isGlobalItem) {
          identificador = String(elemento.numero).padStart(2, '0');
        } else if (elemento.isLote) {
          identificador = toRoman(elemento.numero);
        } else {
          identificador = elemento.numero.toString();
        }
        
        // Remover prefixo "Lote XX - " da descrição se existir para evitar duplicação
        const descricaoLimpaResumo = elemento.isLote 
          ? elemento.descricao.replace(/^Lote\s*\d+\s*[-–:]\s*/i, '')
          : elemento.descricao;
        
        // Determinar status quando não há vencedor:
        // DESERTO = nenhuma proposta classificada foi recebida para o item/lote
        // FRACASSADO = houve proposta(s), mas todas foram desclassificadas (preço > estimado) ou inabilitadas
        let statusSemVencedor = "DESERTO";
        let vencedorEfetivo = vencedor;
        
        // Para critério global no formato expandido, não verificar DESERTO/FRACASSADO por item
        if (!isGlobalLocal) {
          // Verificar se houve proposta ENVIADA para este item/lote (para distinguir DESERTO)
          const tevePropostaEnviada = elemento.isLote 
            ? lotesComPropostaEnviada.has(elemento.numero)
            : itensComPropostaEnviada.has(elemento.numero);
          
          // Verificar se há proposta CLASSIFICADA (não desclassificada, valor <= estimado, fornecedor habilitado)
          const tevePropostaClassificada = elemento.isLote
            ? lotesComPropostaClassificada.has(elemento.numero)
            : itensComPropostaClassificada.has(elemento.numero);
          
          // Verificar se todos os lances estão desclassificados por preço
          const todosDesclassificados = todosLancesDesclassificadosPorPreco(elemento.numero);
          
          // Se houve proposta enviada mas nenhuma classificada, sempre é FRACASSADO (mesmo que exista "vencedor" salvo)
          if (elemento.isLote && tevePropostaEnviada && !tevePropostaClassificada) {
            vencedorEfetivo = null;
            statusSemVencedor = "FRACASSADO";
          } else if (!vencedor) {
            // Se houve proposta ENVIADA mas nenhuma CLASSIFICADA, é FRACASSADO
            if (tevePropostaEnviada && !tevePropostaClassificada) {
              statusSemVencedor = "FRACASSADO";
            } else if (tevePropostaEnviada) {
              // Houve proposta classificada mas não há vencedor (caso estranho, mas tratamos)
              statusSemVencedor = "FRACASSADO";
            }
            // Se não houve proposta, permanece DESERTO
          } else if (todosDesclassificados && !tevePropostaClassificada) {
            // Há um vencedor potencial, mas todos os lances e propostas excedem o valor estimado
            vencedorEfetivo = null;
            statusSemVencedor = "FRACASSADO";
          }
        }

        // Calcular valores SOMENTE se há vencedor efetivo (não para FRACASSADO/DESERTO)
        const isNegociacao = vencedorEfetivo?.tipo_lance === "negociacao";
        
        // Calcular valores formatados
        let valorUnitarioFormatado: string;
        let valorTotal: number;
        
        if (!vencedorEfetivo) {
          valorUnitarioFormatado = "-";
          valorTotal = 0;
        } else if (criterioJulgamento === "desconto") {
          valorUnitarioFormatado = formatValorLance(vencedorEfetivo.valor_lance);
          valorTotal = 0;
        } else if (elemento.isLote) {
          valorUnitarioFormatado = formatValorLance(vencedorEfetivo.valor_lance);
          valorTotal = vencedorEfetivo.valor_lance;
        } else {
          valorUnitarioFormatado = formatValorLance(vencedorEfetivo.valor_lance);
          valorTotal = vencedorEfetivo.valor_lance * quantidade;
        }
        const valorTotalFormatado = (!vencedorEfetivo || criterioJulgamento === "desconto") ? "-" : formatCurrency(valorTotal);
        
        // Somar ao valor total geral SOMENTE se há vencedor efetivo
        if (vencedorEfetivo) {
          valorTotalGeral += valorTotal;
        }
        
        return [
          identificador,
          descricaoLimpaResumo,
          vencedorEfetivo?.fornecedores?.razao_social || statusSemVencedor,
          marca,
          (elemento.isLote) ? "-" : quantidade.toString(),
          (elemento.isLote) ? "LOTE" : (elemento.unidade || "UN"),
          isNegociacao ? `${valorUnitarioFormatado} *` : valorUnitarioFormatado,
          isNegociacao ? `${valorTotalFormatado} *` : valorTotalFormatado,
        ];
      });

      // Adicionar linha de valor total (apenas se não for desconto)
      if (criterioJulgamento !== "desconto") {
        if (isGlobalLocal) {
          resumoData.push([
            "",
            "",
            "",
            "",
            "",
            "",
            "VALOR TOTAL:",
            formatCurrency(valorTotalGeral)
          ]);
        } else {
          resumoData.push([
            "",
            "",
            "",
            "",
            "",
            "",
            "VALOR TOTAL:",
            formatCurrency(valorTotalGeral)
          ]);
        }
      }

      // Para critério global: transformar resumoData para 6 colunas (sem Unidade e Quantidade)
      let resumoDataFinal = resumoData;
      if (isGlobalLocal) {
        resumoDataFinal = resumoData.map(row => [
          row[0], // Item
          row[1], // Descrição
          row[2], // Vencedor
          row[3], // Marca
          row[6], // Valor Unit.
          row[7], // Valor Total
        ]);
      }

      // Rastrear páginas do resumo que já receberam logo
      const paginasResumoProcessadas = new Set<number>();
      const paginaInicialResumo = doc.internal.pages.length - 1;
      paginasResumoProcessadas.add(paginaInicialResumo);

      // Cabeçalho adaptado para lote, global ou item
      let colunaIdentificador: string;
      if (isGlobalLocal) {
        colunaIdentificador = "Item";
      } else if (isPorLoteLocal) {
        colunaIdentificador = "Lote";
      } else {
        colunaIdentificador = "Item";
      }
      
      const ocultarColunasMarcaQtdUn = isPorLoteLocal;

      // Cabeçalho e colunas específicos para critério global (sem Unidade e Quantidade)
      const headGlobal = [["Item", "Descrição", "Vencedor", "Marca", criterioJulgamento === "desconto" ? "% Desconto" : "Valor Unit.", criterioJulgamento === "desconto" ? "-" : "Valor Total"]];
      const headPadrao = [[
        colunaIdentificador, 
        "Descrição", 
        "Vencedor", 
        ocultarColunasMarcaQtdUn ? "-" : "Marca", 
        ocultarColunasMarcaQtdUn ? "-" : "Qtd.", 
        ocultarColunasMarcaQtdUn ? "-" : "Un.", 
        criterioJulgamento === "desconto" ? "% Desconto" : "Valor Unit.", 
        criterioJulgamento === "desconto" ? "-" : "Valor Total"
      ]];

      // Largura total da tabela (paisagem A4 = ~297mm, com margens de 14mm cada lado = 269mm úteis)
      const larguraTotalTabela = landscapeWidth - 28; // 28 = 14 + 14 de margem
      
      // Larguras ajustadas para critério global (6 colunas: Item, Descrição, Vencedor, Marca, Valor Unit., Valor Total)
      const colGlobalItem = 18;
      const colGlobalVencedor = 65;
      const colGlobalMarca = 35;
      const colGlobalValorUnit = 35;
      const colGlobalValorTotal = 35;
      const colGlobalDescricao = larguraTotalTabela - colGlobalItem - colGlobalVencedor - colGlobalMarca - colGlobalValorUnit - colGlobalValorTotal;
      const columnStylesGlobal = {
        0: { cellWidth: colGlobalItem, halign: "center" as const, fontStyle: "bold" as const },
        1: { cellWidth: colGlobalDescricao, halign: "justify" as const },
        2: { cellWidth: colGlobalVencedor, halign: "left" as const },
        3: { cellWidth: colGlobalMarca, halign: "center" as const },
        4: { cellWidth: colGlobalValorUnit, halign: "right" as const, fontStyle: "bold" as const },
        5: { cellWidth: colGlobalValorTotal, halign: "right" as const, fontStyle: "bold" as const },
      };

      // Calcular larguras proporcionais para tabela superior ter mesma largura que inferior
      // Total: larguraTotalTabela = landscapeWidth - 28
      const colItemWidth = 15;
      const colMarcaWidth = 30;
      const colQtdWidth = 18;
      const colUnWidth = 15;
      const colValorUnitWidth = 30;
      const colValorTotalWidth = 30;
      const colVencedorWidth = 55;
      // Descrição pega o restante
      const colDescricaoWidth = larguraTotalTabela - colItemWidth - colVencedorWidth - colMarcaWidth - colQtdWidth - colUnWidth - colValorUnitWidth - colValorTotalWidth;

      const columnStylesPadrao = {
        0: { cellWidth: colItemWidth, halign: "center" as const, fontStyle: "bold" as const },
        1: { cellWidth: colDescricaoWidth, halign: "justify" as const },
        2: { cellWidth: colVencedorWidth },
        3: { cellWidth: colMarcaWidth, halign: "center" as const },
        4: { cellWidth: colQtdWidth, halign: "center" as const },
        5: { cellWidth: colUnWidth, halign: "center" as const },
        6: { cellWidth: colValorUnitWidth, halign: "right" as const, fontStyle: "bold" as const },
        7: { cellWidth: colValorTotalWidth, halign: "right" as const, fontStyle: "bold" as const },
      };

      autoTable(doc, {
        startY: resumoStartY,
        head: useGlobalResumoFormat ? headGlobal : headPadrao,
        body: useGlobalResumoFormat ? resumoDataFinal : resumoData,
        theme: "striped",
        styles: { 
          fontSize: 8,
          cellPadding: 2, // Reduzido para comprimir altura das linhas
          valign: "middle",
          textColor: [0, 0, 0], // Preto
        },
        headStyles: { 
          fillColor: [0, 128, 128], // Verde do logo
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
          valign: "middle"
        },
        columnStyles: useGlobalResumoFormat ? columnStylesGlobal : columnStylesPadrao,
        alternateRowStyles: {
          fillColor: [224, 242, 241] // Verde claro do logo
        },
        tableWidth: larguraTotalTabela, // Mesma largura que tabela inferior
        margin: { left: 14, right: 14, top: logoResumoHeight + 20 },
        didDrawPage: () => {
          // Adicionar logo em todas as páginas do resumo
          const paginaAtual = doc.internal.pages.length - 1;
          if (!paginasResumoProcessadas.has(paginaAtual)) {
            paginasResumoProcessadas.add(paginaAtual);
            if (base64LogoHorizontal) {
              const logoX = (landscapeWidth - logoResumoWidth) / 2;
              doc.addImage(base64LogoHorizontal, 'PNG', logoX, 8, logoResumoWidth, logoResumoHeight);
            }
          }
        },
        didParseCell: (data) => {
          // Destacar valores de negociação
          const valorColIndices = isGlobalLocal ? [4, 5] : [6, 7];
          if (valorColIndices.includes(data.column.index) && data.section === "body") {
            const cellText = String(data.cell.raw);
            if (cellText.includes("*")) {
              data.cell.styles.textColor = [0, 128, 128]; // Verde do logo
            }
          }
          // Estilizar linha de total
          const currentData = useGlobalResumoFormat ? resumoDataFinal : resumoData;
          if (criterioJulgamento !== "desconto" && data.section === "body" && data.row.index === currentData.length - 1) {
            data.cell.styles.fillColor = [0, 128, 128]; // Verde do logo
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      // Legenda no resumo (apenas se não for global)
      let finalY = (doc as any).lastAutoTable.finalY + 5;
      if (!isGlobalLocal) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(0, 128, 128); // Verde do logo
        doc.text("* Valor obtido por negociação", margin, finalY);
        doc.setTextColor(0, 0, 0);
        finalY += 5;
      }

      // Calcular totais por fornecedor (apenas se não for desconto)
      if (criterioJulgamento !== "desconto") {
        const totaisPorFornecedor: Record<string, { nome: string; total: number }> = {};
        
        // Usar elementos preparados (lotes ou itens) - aplicar mesma lógica de FRACASSADO/DESERTO
        elementosParaIterar.forEach(elemento => {
          const vencedor = getVencedorItem(elemento.numero);
          
          // Verificar se houve proposta ENVIADA e CLASSIFICADA (mesma lógica do resumoData)
          const tevePropostaEnviada = elemento.isLote 
            ? lotesComPropostaEnviada.has(elemento.numero)
            : itensComPropostaEnviada.has(elemento.numero);
          const tevePropostaClassificada = elemento.isLote
            ? lotesComPropostaClassificada.has(elemento.numero)
            : itensComPropostaClassificada.has(elemento.numero);
          const todosDesclassificados = todosLancesDesclassificadosPorPreco(elemento.numero);
          
          // Aplicar mesma lógica do mapa superior - se é FRACASSADO/DESERTO, não conta
          let vencedorEfetivo = vencedor;
          if (elemento.isLote && tevePropostaEnviada && !tevePropostaClassificada) {
            vencedorEfetivo = null;
          } else if (!vencedor) {
            vencedorEfetivo = null;
          } else if (todosDesclassificados && !tevePropostaClassificada) {
            vencedorEfetivo = null;
          }
          
          // Somente contabilizar se há vencedor efetivo
          if (vencedorEfetivo && vencedorEfetivo.fornecedores?.razao_social) {
            const fornecedorId = vencedorEfetivo.fornecedor_id;
            
            // Para lote, o valor do lance já é o total; para item, multiplicar pela quantidade
            let valorTotal: number;
            if (elemento.isLote) {
              valorTotal = vencedorEfetivo.valor_lance; // Lance do lote já é o valor total
            } else {
              const quantidade = elemento.quantidade || 1;
              valorTotal = vencedorEfetivo.valor_lance * quantidade;
            }
            
            if (!totaisPorFornecedor[fornecedorId]) {
              totaisPorFornecedor[fornecedorId] = {
                nome: vencedorEfetivo.fornecedores.razao_social,
                total: 0
              };
            }
            totaisPorFornecedor[fornecedorId].total += valorTotal;
          }
        });

        // Preparar dados da tabela de resumo por fornecedor
        const resumoFornecedoresData = Object.values(totaisPorFornecedor)
          .sort((a, b) => b.total - a.total) // Ordenar por valor total decrescente
          .map(f => [f.nome, formatCurrency(f.total)]);

        // Calcular total geral dos fornecedores
        const totalGeralFornecedores = Object.values(totaisPorFornecedor).reduce((acc, f) => acc + f.total, 0);
        
        // Adicionar linha de valor total
        resumoFornecedoresData.push(["VALOR TOTAL", formatCurrency(totalGeralFornecedores)]);

        // Adicionar tabela de resumo por fornecedor
        if (resumoFornecedoresData.length > 0) {
          autoTable(doc, {
            startY: finalY + 5,
            head: [["Fornecedor", "Valor Total"]],
            body: resumoFornecedoresData,
            theme: "striped",
            styles: { 
              fontSize: 8,
              cellPadding: 2, // Reduzido para comprimir altura das linhas
              valign: "middle",
              textColor: [0, 0, 0], // Preto
            },
            headStyles: { 
              fillColor: [0, 128, 128],
              textColor: 255,
              fontStyle: "bold",
              halign: "center",
              valign: "middle",
              cellPadding: 2,
            },
            columnStyles: {
              0: { halign: "left", valign: "middle", cellWidth: landscapeWidth - 28 - 80 }, // Mesma largura total que tabela de cima
              1: { halign: "right", fontStyle: "bold", valign: "middle", cellWidth: 80 },
            },
            alternateRowStyles: {
              fillColor: [224, 242, 241]
            },
            tableWidth: landscapeWidth - 28, // Mesma largura que a tabela de resumo
            margin: { left: 14, right: 14, top: logoResumoHeight + 20 }, // Mesmas margens da planilha resumo
            didDrawPage: () => {
              const paginaAtual = doc.internal.pages.length - 1;
              if (!paginasResumoProcessadas.has(paginaAtual)) {
                paginasResumoProcessadas.add(paginaAtual);
                if (base64LogoHorizontal) {
                  const logoX = (landscapeWidth - logoResumoWidth) / 2;
                  doc.addImage(base64LogoHorizontal, 'PNG', logoX, 8, logoResumoWidth, logoResumoHeight);
                }
              }
            },
            didParseCell: (data) => {
              if (data.section === "body" && data.row.index === resumoFornecedoresData.length - 1) {
                data.cell.styles.fillColor = [0, 128, 128];
                data.cell.styles.textColor = [255, 255, 255];
                data.cell.styles.fontStyle = "bold";
              }
            },
          });
        }
      }

      // Obter ID do usuário (mover para antes da certificação)
      const { data: { user } } = await supabase.auth.getUser();

      // ========== CERTIFICAÇÃO DIGITAL ==========
      // Gerar protocolo único no formato XXXX-XXXX-XXXX-XXXX
      const generateProtocol = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const segments = [];
        for (let i = 0; i < 4; i++) {
          let segment = '';
          for (let j = 0; j < 4; j++) {
            segment += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          segments.push(segment);
        }
        return segments.join('-');
      };

      const protocolo = generateProtocol();

      // Buscar informações do usuário
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user?.id)
        .single();

      // Adicionar certificação digital no final do PDF
      finalY = (doc as any).lastAutoTable.finalY;
      
      // Verificar se há espaço suficiente na página atual para a certificação
      // Certificação precisa de aproximadamente 70mm de altura
      const certHeight = 70;
      const currentPageHeight = doc.internal.pageSize.height;
      const spaceRemaining = currentPageHeight - finalY - rodapeHeight;
      
      // Se não houver espaço, criar nova página landscape
      if (spaceRemaining < certHeight) {
        doc.addPage("landscape");
        finalY = logoResumoHeight + 20; // Começar após o logo
        
        // Adicionar logo na nova página
        if (base64LogoHorizontal) {
          const logoX = (landscapeWidth - logoResumoWidth) / 2;
          doc.addImage(base64LogoHorizontal, 'PNG', logoX, 8, logoResumoWidth, logoResumoHeight);
        }
      }
      
      const certPageWidth = doc.internal.pageSize.width;
      const certMargin = 15;
      const certBoxWidth = certPageWidth - (certMargin * 2);
      const certBoxHeight = 60; // Aumentado para acomodar mais conteúdo
      let certY = finalY + 15;

      // Desenhar box com fundo cinza claro e borda
      doc.setFillColor(245, 245, 245);
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.5);
      doc.rect(certMargin, certY, certBoxWidth, certBoxHeight, 'FD');

      // Título da certificação
      certY += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("CERTIFICAÇÃO DIGITAL", certPageWidth / 2, certY, { align: "center" });

      // Texto da lei
      certY += 8;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(80, 80, 80);
      const textoLei = "Este documento foi gerado eletronicamente conforme Art. 10 da Lei nº 14.063/2020";
      doc.text(textoLei, certPageWidth / 2, certY, { align: "center" });

      // Linha separadora
      certY += 6;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(certMargin + 10, certY, certPageWidth - certMargin - 10, certY);

      // Protocolo
      certY += 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Protocolo:", certMargin + 10, certY);
      doc.setFont("helvetica", "normal");
      doc.text(protocolo, certMargin + 35, certY);

      // Responsável
      certY += 7;
      doc.setFont("helvetica", "bold");
      const responsavel = userProfile?.nome_completo || "Sistema";
      doc.text("Responsável:", certMargin + 10, certY);
      doc.setFont("helvetica", "normal");
      doc.text(responsavel, certMargin + 35, certY);

      // Link de verificação
      certY += 8;
      const linkVerificacao = `${window.location.origin}/verificar-planilha?protocolo=${protocolo}`;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Verificar autenticidade:", certMargin + 10, certY);
      
      // Quebrar link em múltiplas linhas se necessário
      certY += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 255);
      const maxWidth = certBoxWidth - 20;
      const linkLines = doc.splitTextToSize(linkVerificacao, maxWidth);
      linkLines.forEach((line: string, index: number) => {
        doc.text(line, certMargin + 10, certY + (index * 4));
      });
      
      doc.setTextColor(0, 0, 0);

      // Salvar PDF no storage e banco de dados
      const pdfBlob = doc.output("blob");
      const nomeArquivo = `planilha-lances-selecao-${Date.now()}.pdf`;
      const storagePath = `selecao_${selecaoId}/${nomeArquivo}`;
      
      // Upload para o storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(storagePath, pdfBlob, {
          contentType: "application/pdf",
          upsert: false
        });
      
      if (uploadError) throw uploadError;
      
      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from("processo-anexos")
        .getPublicUrl(storagePath);
      
      const { data: selecaoInfoAudit } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, titulo_selecao, processos_compras(numero_processo_interno, contratos_gestao:contrato_gestao_id(nome_contrato))")
        .eq("id", selecaoId)
        .single();

      // Inserir nova planilha no banco (não sobrescrever)
      const { data: planilhaData, error: dbError } = await supabase
        .from("planilhas_lances_selecao")
        .insert({
          selecao_id: selecaoId,
          nome_arquivo: nomeArquivo,
          url_arquivo: urlData.publicUrl,
          usuario_gerador_id: user?.id,
          data_geracao: new Date().toISOString(),
          protocolo: protocolo
        })
        .select()
        .single();
      
      if (dbError) throw dbError;

      // Formatar protocolo para padrão curto
      const limpo = protocolo.replace(/-/g, '').toUpperCase().substring(0, 16);
      const protocoloFormatado = `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;

      // Registrar auditoria da geração da planilha
      try {
        await registrarAuditoria({
          acao: 'criação',
          entidade: 'Planilha de Lances',
          entidade_id: planilhaData?.id,
          detalhes: {
            nome_arquivo: nomeArquivo,
            protocolo: protocoloFormatado,
            numero_selecao: selecaoInfoAudit?.numero_selecao || 'N/A',
            titulo_selecao: selecaoInfoAudit?.titulo_selecao || 'N/A',
            numero_processo: (selecaoInfoAudit?.processos_compras as any)?.numero_processo_interno || '',
            contrato_gestao: (selecaoInfoAudit?.processos_compras as any)?.contratos_gestao?.nome_contrato || '',
          },
        });
      } catch (auditError) {
        console.error('Erro ao registrar auditoria de planilha:', auditError);
      }
      
      // Recarregar lista de planilhas
      await loadPlanilhasGeradas();
      toast.success("Planilha de lances gerada com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar planilha:", error);
      toast.error("Erro ao gerar planilha de lances");
    } finally {
      setGerandoPlanilha(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Sessão de Lances
          </DialogTitle>
          {/* Fornecedores Online */}
          {fornecedoresOnline.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="font-medium">{fornecedoresOnline.length} online:</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {fornecedoresOnline.map((f) => (
                  <Badge key={f.fornecedor_id} variant="secondary" className="text-xs py-0 px-2">
                    {getPrimeiroNome(f.razao_social)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden min-h-0">
          {/* Coluna Esquerda - Controle de Itens */}
          <div className="col-span-3 flex flex-col overflow-hidden">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  {isPorLote ? "Controle de Lotes" : "Controle de Itens"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
                <div className="flex gap-2 mb-3">
                  <Button variant="outline" size="sm" onClick={handleSelecionarTodos} className="text-xs">
                    Todos
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleLimparSelecao} className="text-xs">
                    Limpar
                  </Button>
                </div>

                <ScrollAreaWithArrows className="flex-1" orientation="both" scrollStep={60}>
                  <div className="space-y-2 pr-2 min-w-max">
                    {isPorLote ? (
                      // === RENDERIZAÇÃO POR LOTES ===
                      lotes.map((lote) => {
                        const estaAberto = lotesAbertos.has(lote.numero_lote);
                        const estaSelecionado = lotesSelecionados.has(lote.numero_lote);
                        const emFechamento = lotesEmFechamento.get(lote.numero_lote);

                        return (
                          <div
                            key={lote.numero_lote}
                            className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                              emFechamento 
                                ? "bg-amber-50 border-amber-400 dark:bg-amber-950" 
                                : estaAberto 
                                  ? "bg-green-50 border-green-300 dark:bg-green-950" 
                                  : "bg-background hover:bg-muted"
                            }`}
                          >
                            <Checkbox
                              id={`lote-${lote.numero_lote}`}
                              checked={estaSelecionado}
                              onCheckedChange={() => handleToggleLote(lote.numero_lote)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <Label htmlFor={`lote-${lote.numero_lote}`} className="cursor-pointer">
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold text-xs">Lote {lote.numero_lote}</span>
                                  {emFechamento ? (
                                    <Timer className="h-3 w-3 text-amber-600 animate-pulse" />
                                  ) : estaAberto ? (
                                    <Unlock className="h-3 w-3 text-green-600" />
                                  ) : (
                                    <Lock className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <Badge variant="secondary" className="text-xs px-1">
                                    {lote.itens?.length || 0} itens
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {lote.descricao_lote}
                                </p>
                                <p className="text-xs font-medium text-primary mt-0.5">
                                  Total: {formatCurrency(lote.valor_total_lote)}
                                </p>
                                {emFechamento && (
                                  <div className="flex items-center gap-1 mt-1 text-amber-700 font-semibold text-xs">
                                    <Timer className="h-3 w-3" />
                                    <span>Fechando em {formatarTempoRestante(emFechamento)}</span>
                                  </div>
                                )}
                              </Label>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      // === RENDERIZAÇÃO POR ITENS ===
                      (isGlobal ? itensParaControle : itens).map((item) => {
                        const estaAberto = itensAbertos.has(item.numero_item);
                        const estaSelecionado = itensSelecionados.has(item.numero_item);
                        const lancesItem = getLancesDoItem(item.numero_item);
                        const emFechamento = itensEmFechamento.get(item.numero_item);

                        return (
                          <div
                            key={item.numero_item}
                            className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                              emFechamento 
                                ? "bg-amber-50 border-amber-400 dark:bg-amber-950" 
                                : estaAberto 
                                  ? "bg-green-50 border-green-300 dark:bg-green-950" 
                                  : "bg-background hover:bg-muted"
                            } ${itemSelecionadoLances === item.numero_item ? "ring-2 ring-primary" : ""}`}
                            onClick={() => setItemSelecionadoLances(item.numero_item)}
                          >
                            <Checkbox
                              id={`item-${item.numero_item}`}
                              checked={estaSelecionado}
                              onCheckedChange={() => handleToggleItem(item.numero_item)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <Label htmlFor={`item-${item.numero_item}`} className="cursor-pointer">
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold text-xs">Item {item.numero_item}</span>
                                  {emFechamento ? (
                                    <Timer className="h-3 w-3 text-amber-600 animate-pulse" />
                                  ) : estaAberto ? (
                                    <Unlock className="h-3 w-3 text-green-600" />
                                  ) : (
                                    <Lock className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  {lancesItem.length > 0 && (
                                    <Badge variant="secondary" className="text-xs px-1">
                                      {lancesItem.length}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {item.descricao}
                                </p>
                                {emFechamento && (
                                  <div className="flex items-center gap-1 mt-1 text-amber-700 font-semibold text-xs">
                                    <Timer className="h-3 w-3" />
                                    <span>Fechando em {formatarTempoRestante(emFechamento)}</span>
                                  </div>
                                )}
                              </Label>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollAreaWithArrows>

                <div className="flex gap-2 mt-3 pt-3 border-t">
                  {isPorLote ? (
                    <>
                      <Button size="sm" className="flex-1 text-xs" onClick={handleAbrirLotes} disabled={salvando || lotesSelecionados.size === 0}>
                        <Unlock className="h-3 w-3 mr-1" />
                        Abrir ({lotesSelecionados.size})
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1 text-xs" onClick={handleFecharLotes} disabled={salvando || lotesSelecionados.size === 0}>
                        <Lock className="h-3 w-3 mr-1" />
                        Fechar ({lotesSelecionados.size})
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" className="flex-1 text-xs" onClick={handleAbrirItens} disabled={salvando || itensSelecionados.size === 0}>
                        <Unlock className="h-3 w-3 mr-1" />
                        Abrir ({itensSelecionados.size})
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1 text-xs" onClick={handleFecharItens} disabled={salvando || itensSelecionados.size === 0}>
                        <Lock className="h-3 w-3 mr-1" />
                        Fechar ({itensSelecionados.size})
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Coluna Central - Sistema de Lances */}
          <div className="col-span-6 flex flex-col overflow-hidden">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Sistema de Lances {itemSelecionadoLances ? `- Item ${itemSelecionadoLances}` : "- Todos"}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)} className="text-xs">
                      {autoRefresh ? "Pausar" : "Ativar"} Auto
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadLances}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={handleGerarPlanilhaLances} 
                      className="text-xs"
                      disabled={gerandoPlanilha}
                    >
                      {gerandoPlanilha ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-3 w-3 mr-1" />
                      )}
                      {gerandoPlanilha ? "Gerando..." : "Gerar Planilha"}
                    </Button>
                  </div>
                </div>

                {planilhasGeradas.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs font-medium mb-2">Planilhas de Lances Geradas ({planilhasGeradas.length}):</p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                      {planilhasGeradas.map((planilha, index) => {
                        // Nome bonito: "Planilha de Lances - Seleção XXX/YYYY" + numeral romano
                        // Ordem cronológica: primeiro criado = I, segundo = II, etc.
                        // Como planilhasGeradas está ordenado DESC (mais recente primeiro), invertemos o cálculo
                        const numeroOrdem = planilhasGeradas.length - index; // 1 para o mais antigo, N para o mais recente
                        const nomeBonito = numeroSelecao 
                          ? `Planilha de Lances - Seleção ${numeroSelecao}${numeroOrdem > 1 ? ` ${toRoman(numeroOrdem)}` : ''}`
                          : `Planilha de Lances${numeroOrdem > 1 ? ` ${toRoman(numeroOrdem)}` : ''}`;
                        
                        return (
                        <Card key={planilha.id} className="bg-muted/50">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <FileSpreadsheet className="h-4 w-4 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{nomeBonito}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {new Date(planilha.data_geracao).toLocaleString('pt-BR')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1 ml-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleVisualizarPlanilha(planilha.url_arquivo)}
                                  className="h-7 px-2 text-xs"
                                >
                                  Visualizar
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setConfirmDeletePlanilha({ open: true, planilhaId: planilha.id, urlArquivo: planilha.url_arquivo })}
                                  className="h-7 px-2"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-3">
                <div className="mb-2 flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">Critério: {criterioJulgamento}</Badge>
                  <Badge variant="outline" className="text-xs">Total Lances: {lances.length}</Badge>
                  {autoRefresh && <Badge variant="default" className="text-xs">● Auto Ativo</Badge>}
                </div>

                <Tabs defaultValue="todos" className="h-[calc(100%-30px)]">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="todos" className="text-xs">Todos os Lances</TabsTrigger>
                    <TabsTrigger value="item" className="text-xs">Por Item Selecionado</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="todos" className="h-[calc(100%-40px)] overflow-hidden">
                    <ScrollArea className="h-full">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/10">
                            <TableHead className="text-xs font-bold">Item</TableHead>
                            <TableHead className="text-xs font-bold">Fornecedor</TableHead>
                            <TableHead className="text-xs font-bold text-right">{criterioJulgamento === "desconto" ? "% Desconto" : "Valor"}</TableHead>
                            <TableHead className="text-xs font-bold">Data/Hora</TableHead>
                            <TableHead className="text-xs w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lances.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground text-xs">
                                Nenhum lance registrado
                              </TableCell>
                            </TableRow>
                          ) : (
                            lances.map((lance, idx) => {
                              // Calcular dinamicamente se este lance é o melhor do seu item
                              const lancesDoItem = getLancesDoItem(lance.numero_item || 0);
                              const ehMelhorLance = lancesDoItem.length > 0 && lancesDoItem[0].id === lance.id;
                              
                              // Verificar se é o primeiro lance de um novo item (para adicionar separador visual)
                              const itemAnterior = idx > 0 ? lances[idx - 1]?.numero_item : null;
                              const novoItem = itemAnterior !== null && itemAnterior !== lance.numero_item;
                              
                              return (
                                <TableRow 
                                  key={lance.id} 
                                  className={`
                                    ${ehMelhorLance ? "bg-yellow-50 dark:bg-yellow-950" : ""}
                                    ${novoItem ? "border-t-2 border-t-primary/30" : ""}
                                  `}
                                >
                                  <TableCell className="text-xs font-medium">
                                    <Badge variant={ehMelhorLance ? "default" : "secondary"} className="text-xs">
                                      {lance.numero_item || "-"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div>{lance.fornecedores?.razao_social}</div>
                                    <div className="text-muted-foreground text-[10px]">{formatCNPJ(lance.fornecedores?.cnpj || "")}</div>
                                  </TableCell>
                                  <TableCell className="text-xs text-right">
                                    <span className={`font-bold ${lance.tipo_lance === "negociacao" ? "text-green-600" : ""}`}>
                                      {formatValorLance(lance.valor_lance)}
                                    </span>
                                    {lance.tipo_lance === "negociacao" && (
                                      <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 bg-green-50 text-green-700 border-green-300">
                                        Neg.
                                      </Badge>
                                    )}
                                    {lance._isProposta && (
                                      <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 bg-blue-50 text-blue-700 border-blue-300">
                                        Inicial
                                      </Badge>
                                    )}
                                    {/* Verificar desclassificação visualmente se houver estimativa carregada */}
                                    {(() => {
                                      // Recuperar estimativa do item
                                      // Nota: A lógica completa está em loadVencedoresPorItem, aqui é uma aproximação visual
                                      // Se for por_lote, não temos fácil acesso ao subtotal do lote aqui sem recalcular
                                      // Para simplificar, mostramos desclassificado se o backend marcou (se tivéssemos esse campo)
                                      // ou tentamos recalcular se for item simples
                                      if (!isPorLote && !isGlobal && estimativasItens.size > 0) {
                                        const est = estimativasItens.get(lance.numero_item);
                                        if (est && est > 0) {
                                          const isDesc = criterioJulgamento === "desconto";
                                          const desclassificado = isDesc ? lance.valor_lance < est : lance.valor_lance > est;
                                          if (desclassificado) {
                                            return (
                                              <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 bg-red-50 text-red-700 border-red-300">
                                                Desclassificado
                                              </Badge>
                                            );
                                          }
                                        }
                                      }
                                      return null;
                                    })()}
                                  </TableCell>
                                  <TableCell className="text-xs">{formatDateTime(lance.data_hora_lance)}</TableCell>
                                  <TableCell className="text-xs">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => handleDeletarLance(lance.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="item" className="h-[calc(100%-40px)] overflow-hidden">
                    <ScrollArea className="h-full">
                      {itemSelecionadoLances ? (
                        <>
                          <div className="mb-3 p-2 bg-muted rounded-lg">
                            <p className="text-xs font-medium">Item {itemSelecionadoLances}</p>
                            <p className="text-xs text-muted-foreground">
                              {itens.find(i => i.numero_item === itemSelecionadoLances)?.descricao}
                            </p>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-primary/10">
                                <TableHead className="text-xs font-bold">Pos.</TableHead>
                                <TableHead className="text-xs font-bold">Fornecedor</TableHead>
                                <TableHead className="text-xs font-bold text-right">{criterioJulgamento === "desconto" ? "% Desconto" : "Valor"}</TableHead>
                                <TableHead className="text-xs font-bold">Data/Hora</TableHead>
                                <TableHead className="text-xs w-10"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getLancesDoItem(itemSelecionadoLances).map((lance, idx) => (
                                <TableRow key={lance.id} className={idx === 0 ? "bg-yellow-50 dark:bg-yellow-950" : ""}>
                                  <TableCell className="text-xs">
                                    <div className="flex items-center gap-1">
                                      {idx === 0 && <Trophy className="h-3 w-3 text-yellow-600" />}
                                      {idx + 1}º
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div>{lance.fornecedores?.razao_social}</div>
                                    <div className="text-muted-foreground text-[10px]">{formatCNPJ(lance.fornecedores?.cnpj || "")}</div>
                                  </TableCell>
                                  <TableCell className="text-xs text-right">
                                    <span className={`font-bold ${lance.tipo_lance === "negociacao" ? "text-green-600" : ""}`}>
                                      {formatValorLance(lance.valor_lance)}
                                    </span>
                                    {lance.tipo_lance === "negociacao" && (
                                      <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 bg-green-50 text-green-700 border-green-300">
                                        Neg.
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">{formatDateTime(lance.data_hora_lance)}</TableCell>
                                  <TableCell className="text-xs">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => handleDeletarLance(lance.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                              {getLancesDoItem(itemSelecionadoLances).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={5} className="text-center text-muted-foreground text-xs">
                                    Nenhum lance para este item
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </>
                      ) : (
                        <div className="text-center text-muted-foreground py-8 text-xs">
                          Selecione um item na coluna esquerda para ver os lances
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Coluna Direita - Negociação + Chat */}
          <div className="col-span-3 flex flex-col overflow-hidden gap-3">
            {/* Seção de Negociação */}
            {(() => {
              if (isPorLote) {
                const lotesParaNegociacao = lotes
                  .filter((lote) => {
                    const numeroLote = lote.numero_lote;
                    // Lote em negociação ativa sempre aparece
                    if (itensEmNegociacao.has(numeroLote)) return true;
                    // Lote já negociado/concluído não aparece
                    if (itensNegociacaoConcluida.has(numeroLote)) return false;
                    // Lote disponível para negociação: DEVE ter sido fechado (passou pelo ciclo de lances) E ter vencedor identificado
                    // Usamos itensFechados pois o loadItensAbertos armazena lotes fechados nele também
                    return !lotesAbertos.has(numeroLote) && itensFechados.has(numeroLote) && vencedoresPorItem.has(numeroLote);
                  })
                  .sort((a, b) => a.numero_lote - b.numero_lote);

                if (lotesParaNegociacao.length === 0) return null;

                return (
                  <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 flex-shrink-0">
                    <CardHeader className="py-2">
                      <CardTitle className="text-xs flex items-center gap-2 text-amber-700 dark:text-amber-300">
                        <Handshake className="h-4 w-4" />
                        Rodada de Negociação
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <ScrollAreaWithArrows className="h-[250px]" orientation="both" scrollStep={80}>
                        <div className="space-y-2">
                          {lotesParaNegociacao.map((lote) => {
                            const numeroLote = lote.numero_lote;
                            const emNegociacaoAtiva = itensEmNegociacao.has(numeroLote);
                            const fornecedorId =
                              itensEmNegociacao.get(numeroLote) ||
                              itensComHistoricoNegociacao.get(numeroLote);
                            const vencedor = vencedoresPorItem.get(numeroLote);
                            const fornecedorNegociando = fornecedoresNegociacao.get(numeroLote);
                            const temHistoricoNegociacao = itensComHistoricoNegociacao.has(numeroLote);
                            const chatAberto = itemChatPrivado === numeroLote;
                            // Usar nome do fornecedor em negociação se disponível, senão usar vencedor
                            const nomeFornecedor =
                              fornecedorNegociando?.razaoSocial || vencedor?.razaoSocial || "Fornecedor";

                            if (emNegociacaoAtiva) {
                              return (
                                <div
                                  key={`neg-lote-${numeroLote}`}
                                  className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg border border-amber-300"
                                >
                                  <div className="flex items-start gap-2 mb-2">
                                    <Badge
                                      variant="outline"
                                      className="bg-amber-500 text-white border-amber-500 text-xs shrink-0"
                                    >
                                      Em Negociação
                                    </Badge>
                                    <div className="min-w-0">
                                      <span className="font-semibold text-xs">Lote {numeroLote}</span>
                                      <p className="text-xs text-amber-700 dark:text-amber-300 truncate">
                                        {nomeFornecedor}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setItemChatPrivado(chatAberto ? null : numeroLote)}
                                      className={`text-xs flex-1 ${
                                        chatAberto
                                          ? "bg-amber-200 border-amber-400"
                                          : "border-amber-400 text-amber-700 hover:bg-amber-100"
                                      }`}
                                    >
                                      <MessagesSquare className="h-3 w-3 mr-1" />
                                      {chatAberto ? "Fechar" : "Chat"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleFecharNegociacao(numeroLote)}
                                      disabled={salvando}
                                      className="text-xs flex-1"
                                    >
                                      <Lock className="h-3 w-3 mr-1" />
                                      Encerrar
                                    </Button>
                                  </div>

                                  {chatAberto && fornecedorId && (
                                    <ChatNegociacao
                                      selecaoId={selecaoId}
                                      numeroItem={numeroLote}
                                      fornecedorId={fornecedorId}
                                      fornecedorNome={nomeFornecedor}
                                      tituloSelecao={tituloSelecao}
                                      isGestor={true}
                                      open={chatAberto}
                                      onClose={() => setItemChatPrivado(null)}
                                      itensDisponiveis={lotesParaNegociacao
                                        .filter((l) => itensEmNegociacao.has(l.numero_lote))
                                        .map((l) => {
                                          const fId = itensEmNegociacao.get(l.numero_lote) || "";
                                          const fNome =
                                            fornecedoresNegociacao.get(l.numero_lote)?.razaoSocial ||
                                            vencedoresPorItem.get(l.numero_lote)?.razaoSocial ||
                                            "Fornecedor";
                                          return {
                                            numeroItem: l.numero_lote,
                                            fornecedorId: fId,
                                            fornecedorNome: fNome,
                                          };
                                        })}
                                      onSelectItem={(item) => setItemChatPrivado(item.numeroItem)}
                                    />
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div
                                key={`avail-lote-${numeroLote}`}
                                className="p-2 bg-white dark:bg-background rounded-lg border text-xs"
                              >
                                <div className="flex items-start gap-2 mb-2">
                                  <Trophy className="h-3 w-3 text-yellow-600 shrink-0 mt-0.5" />
                                  <div className="min-w-0 flex-1">
                                    <span className="font-semibold">Lote {numeroLote}</span>
                                    <p className="text-muted-foreground truncate text-[10px]">
                                      {vencedor?.razaoSocial}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-amber-500 text-amber-700 hover:bg-amber-100 text-xs flex-1"
                                    onClick={() => handleAbrirNegociacao(numeroLote)}
                                    disabled={salvando}
                                  >
                                    <Handshake className="h-3 w-3 mr-1" />
                                    Negociar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-gray-400 text-gray-600 hover:bg-gray-100 text-xs px-2"
                                    onClick={() => handleNaoNegociar(numeroLote)}
                                    disabled={salvando}
                                    title="Não Negociar"
                                  >
                                    <Ban className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollAreaWithArrows>
                    </CardContent>
                  </Card>
                );
              }

              // Para critério global, usar itensParaControle (item virtual 0), senão usar itens normais
              const itensBase = isGlobal ? itensParaControle : itens;
              
              const itensParaNegociacao = itensBase
                .filter((item) => {
                  // Item em negociação ativa sempre aparece
                  if (itensEmNegociacao.has(item.numero_item)) return true;
                  // Item já negociado/concluído não aparece
                  if (itensNegociacaoConcluida.has(item.numero_item)) return false;
                  // Item disponível para negociação: DEVE estar fechado (passou pelo ciclo de lances) E ter vencedor identificado
                  // Não basta não estar em itensAbertos - precisa ter sido explicitamente fechado
                  return itensFechados.has(item.numero_item) && vencedoresPorItem.has(item.numero_item);
                })
                .sort((a, b) => a.numero_item - b.numero_item);

              if (itensParaNegociacao.length === 0) return null;

              return (
                <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 flex-shrink-0">
                  <CardHeader className="py-2">
                    <CardTitle className="text-xs flex items-center gap-2 text-amber-700 dark:text-amber-300">
                      <Handshake className="h-4 w-4" />
                      Rodada de Negociação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <ScrollAreaWithArrows className="h-[250px]" orientation="both" scrollStep={80}>
                      <div className="space-y-2">
                        {itensParaNegociacao.map((item) => {
                          const numeroItem = item.numero_item;
                          const emNegociacaoAtiva = itensEmNegociacao.has(numeroItem);
                          const fornecedorId =
                            itensEmNegociacao.get(numeroItem) || itensComHistoricoNegociacao.get(numeroItem);
                          const vencedor = vencedoresPorItem.get(numeroItem);
                          const fornecedorNegociando = fornecedoresNegociacao.get(numeroItem);
                          const temHistoricoNegociacao = itensComHistoricoNegociacao.has(numeroItem);
                          const chatAberto = itemChatPrivado === numeroItem;
                          // Usar nome do fornecedor em negociação se disponível, senão usar vencedor
                          const nomeFornecedor = fornecedorNegociando?.razaoSocial || vencedor?.razaoSocial || 'Fornecedor';

                          if (emNegociacaoAtiva) {
                            return (
                              <div key={`neg-${numeroItem}`} className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg border border-amber-300">
                                <div className="flex items-start gap-2 mb-2">
                                  <Badge variant="outline" className="bg-amber-500 text-white border-amber-500 text-xs shrink-0">
                                    Em Negociação
                                  </Badge>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-xs">{isGlobal ? "Total Global" : `Item ${numeroItem}`}</span>
                                    <p className="text-xs text-amber-700 dark:text-amber-300 truncate">
                                      {nomeFornecedor}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setItemChatPrivado(chatAberto ? null : numeroItem)}
                                    className={`text-xs flex-1 ${chatAberto ? 'bg-amber-200 border-amber-400' : 'border-amber-400 text-amber-700 hover:bg-amber-100'}`}
                                  >
                                    <MessagesSquare className="h-3 w-3 mr-1" />
                                    {chatAberto ? 'Fechar' : 'Chat'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleFecharNegociacao(numeroItem)}
                                    disabled={salvando}
                                    className="text-xs flex-1"
                                  >
                                    <Lock className="h-3 w-3 mr-1" />
                                    Encerrar
                                  </Button>
                                </div>
                                {chatAberto && fornecedorId && (
                                  <ChatNegociacao
                                    selecaoId={selecaoId}
                                    numeroItem={numeroItem}
                                    fornecedorId={fornecedorId}
                                    fornecedorNome={nomeFornecedor}
                                    tituloSelecao={tituloSelecao}
                                    isGestor={true}
                                    open={chatAberto}
                                    onClose={() => setItemChatPrivado(null)}
                                    itensDisponiveis={itensParaNegociacao
                                      .filter(i => itensEmNegociacao.has(i.numero_item))
                                      .map(i => {
                                        const fId = itensEmNegociacao.get(i.numero_item) || '';
                                        const fNome = fornecedoresNegociacao.get(i.numero_item)?.razaoSocial || 
                                                      vencedoresPorItem.get(i.numero_item)?.razaoSocial || 'Fornecedor';
                                        return { numeroItem: i.numero_item, fornecedorId: fId, fornecedorNome: fNome };
                                      })}
                                    onSelectItem={(item) => setItemChatPrivado(item.numeroItem)}
                                  />
                                )}
                              </div>
                            );
                          }

                          return (
                            <div key={`avail-${numeroItem}`} className="p-2 bg-white dark:bg-background rounded-lg border text-xs">
                              <div className="flex items-start gap-2 mb-2">
                                <Trophy className="h-3 w-3 text-yellow-600 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold">{isGlobal ? "Total Global" : `Item ${numeroItem}`}</span>
                                  <p className="text-muted-foreground truncate text-[10px]">
                                    {vencedor?.razaoSocial}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-amber-500 text-amber-700 hover:bg-amber-100 text-xs flex-1"
                                  onClick={() => handleAbrirNegociacao(numeroItem)}
                                  disabled={salvando}
                                >
                                  <Handshake className="h-3 w-3 mr-1" />
                                  Negociar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-gray-400 text-gray-600 hover:bg-gray-100 text-xs px-2"
                                  onClick={() => handleNaoNegociar(numeroItem)}
                                  disabled={salvando}
                                  title="Não Negociar"
                                >
                                  <Ban className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollAreaWithArrows>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Itens/Lotes Concluídos - Podem ser Reabertos */}
            {(() => {
              const podeReabrirNegociacao = (numero: number) => {
                const vencedor = vencedoresPorItem.get(numero);
                if (!vencedor?.fornecedorId) return false;

                // Se fornecedor vencedor está inabilitado (inclui inabilitação total com itens_afetados vazio), não pode reabrir
                const itensInabilitados = inabilitacoesPorFornecedor.get(vencedor.fornecedorId);
                if (itensInabilitados && (itensInabilitados.length === 0 || itensInabilitados.includes(numero))) {
                  return false;
                }

                // Se o vencedor (lance ou proposta original) está acima do estimado, é FRACASSADO e NÃO pode reabrir
                const vencedorEfetivo = getVencedorItem(numero);
                if (vencedorEfetivo && isLanceDesclassificadoPorPreco(numero, vencedorEfetivo.valor_lance)) {
                  return false;
                }

                // Caso existam lances e TODOS estejam desclassificados por preço, também é FRACASSADO
                if (todosLancesDesclassificadosPorPreco(numero)) return false;

                return true;
              };

              if (isPorLote) {
                const lotesConcluidos = lotes
                  .filter((lote) => {
                    const numeroLote = lote.numero_lote;
                    return (
                      itensNegociacaoConcluida.has(numeroLote) &&
                      podeReabrirNegociacao(numeroLote) &&
                      !itensEmNegociacao.has(numeroLote)
                    );
                  })
                  .sort((a, b) => a.numero_lote - b.numero_lote);

                if (lotesConcluidos.length === 0) return null;

                return (
                  <Card className="bg-gray-50 dark:bg-gray-900 border-gray-200 flex-shrink-0">
                    <CardHeader className="py-2">
                      <CardTitle className="text-xs flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <CheckCircle className="h-4 w-4" />
                        Lotes Concluídos ({lotesConcluidos.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <ScrollAreaWithArrows className="h-[120px]" orientation="both" scrollStep={80}>
                        <div className="space-y-2">
                          {lotesConcluidos.map((lote) => {
                            const numeroLote = lote.numero_lote;
                            const vencedor = vencedoresPorItem.get(numeroLote);

                            return (
                              <div
                                key={`done-lote-${numeroLote}`}
                                className="p-2 bg-white dark:bg-background rounded-lg border text-xs flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <Badge variant="outline" className="bg-gray-100 text-gray-700 text-[10px] shrink-0">
                                    Lote {numeroLote}
                                  </Badge>
                                  <span className="text-muted-foreground truncate text-[10px]">
                                    {vencedor?.razaoSocial}
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-blue-500 text-blue-700 hover:bg-blue-100 text-[10px] h-6 px-2"
                                  onClick={() => handleReabrirParaNegociacao(numeroLote, vencedor?.fornecedorId || "")}
                                  disabled={salvando || !vencedor?.fornecedorId}
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Reabrir
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollAreaWithArrows>
                    </CardContent>
                  </Card>
                );
              }

              // Para critério global, usar itensParaControle (item virtual 0), senão usar itens normais
              const itensBaseConc = isGlobal ? itensParaControle : itens;

              const itensConcluidos = itensBaseConc
                .filter((item) =>
                  itensNegociacaoConcluida.has(item.numero_item) &&
                  podeReabrirNegociacao(item.numero_item) &&
                  !itensEmNegociacao.has(item.numero_item)
                )
                .sort((a, b) => a.numero_item - b.numero_item);

              if (itensConcluidos.length === 0) return null;

              return (
                <Card className="bg-gray-50 dark:bg-gray-900 border-gray-200 flex-shrink-0">
                  <CardHeader className="py-2">
                    <CardTitle className="text-xs flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <CheckCircle className="h-4 w-4" />
                      Itens Concluídos ({itensConcluidos.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <ScrollAreaWithArrows className="h-[120px]" orientation="both" scrollStep={80}>
                      <div className="space-y-2">
                        {itensConcluidos.map((item) => {
                          const numeroItem = item.numero_item;
                          const vencedor = vencedoresPorItem.get(numeroItem);

                          return (
                            <div
                              key={`done-${numeroItem}`}
                              className="p-2 bg-white dark:bg-background rounded-lg border text-xs flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Badge variant="outline" className="bg-gray-100 text-gray-700 text-[10px] shrink-0">
                                  {isGlobal ? "Total Global" : `Item ${numeroItem}`}
                                </Badge>
                                <span className="text-muted-foreground truncate text-[10px]">
                                  {vencedor?.razaoSocial}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-blue-500 text-blue-700 hover:bg-blue-100 text-[10px] h-6 px-2"
                                onClick={() => handleReabrirParaNegociacao(numeroItem, vencedor?.fornecedorId || "")}
                                disabled={salvando || !vencedor?.fornecedorId}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Reabrir
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollAreaWithArrows>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Chat Colapsável */}
            <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
              <CardHeader className="py-2 cursor-pointer" onClick={handleToggleChat}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Chat em Tempo Real
                    {unreadCount > 0 && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5 min-w-5 flex items-center justify-center">
                        {unreadCount}
                      </Badge>
                    )}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    {chatCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              {!chatCollapsed && (
                <CardContent className="flex-1 flex flex-col overflow-hidden p-3 pt-0">
                  <ScrollAreaWithArrows className="flex-1" orientation="vertical" scrollStep={60}>
                    <div className="space-y-3 pr-2">
                      {mensagens.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4 text-xs">
                          Nenhuma mensagem ainda
                        </p>
                      ) : (
                        mensagens.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${isMinhaMsg(msg) ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                                isMinhaMsg(msg)
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="font-semibold text-xs">{getNomeRemetente(msg)}</span>
                                <span className="text-xs opacity-70">{formatDateTime(msg.created_at)}</span>
                              </div>
                              <p className="text-xs">{msg.mensagem}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollAreaWithArrows>

                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    <Input
                      ref={inputRef}
                      placeholder="Digite..."
                      className="text-xs"
                      onKeyPress={(e) => e.key === "Enter" && handleEnviarMensagem()}
                      disabled={enviandoMsg}
                    />
                    <Button size="sm" onClick={handleEnviarMensagem} disabled={enviandoMsg}>
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>

        {/* Botão Finalizar Sessão ou Remarcar Vencedores - Posição fixa no rodapé */}
        <div className="flex-shrink-0 pt-4 border-t bg-background">
          {!sessaoFinalizada ? (
            (() => {
              // Validação: todos os itens/lotes devem estar fechados
              // Para critério global, a sessão é sempre tratada como 1 único item (Total Global)
              const totalItensOuLotes = isPorLote ? lotes.length : (isGlobal ? 1 : itens.length);

              // Para critério global, considerar fechado apenas se o item virtual 0 estiver fechado
              const totalFechadosParaValidacao = isGlobal ? (itensFechados.has(0) ? 1 : 0) : itensFechados.size;

              const todosItensFechados = totalFechadosParaValidacao >= totalItensOuLotes && totalItensOuLotes > 0;

              // Validação: pelo menos uma planilha de lances deve ter sido gerada
              const planilhaGerada = planilhasGeradas.length > 0;

              // Determinar se pode finalizar
              const podeFinalizarSessao = todosItensFechados && planilhaGerada;

              // Mensagens de erro para cada validação
              const mensagensErro: string[] = [];
              if (!todosItensFechados) {
                const faltam = totalItensOuLotes - totalFechadosParaValidacao;
                mensagensErro.push(
                  isPorLote
                    ? `Faltam ${faltam} lote(s) para fechar`
                    : isGlobal
                      ? `Falta fechar o Total Global`
                      : `Faltam ${faltam} item(ns) para fechar`
                );
              }
              if (!planilhaGerada) {
                mensagensErro.push("Planilha de Lances não foi gerada");
              }

              return (
                <>
                  <Button
                    variant="default"
                    size="lg"
                    className={`w-full ${podeFinalizarSessao ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}`}
                    onClick={() => {
                      if (!podeFinalizarSessao) {
                        toast.error("Não é possível finalizar a sessão", {
                          description: mensagensErro.join(". "),
                          duration: 5000
                        });
                        return;
                      }
                      handleFinalizarSessaoInterna();
                    }}
                    disabled={salvando}
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    {salvando ? "Finalizando..." : "Finalizar Sessão de Lances"}
                  </Button>
                  {!podeFinalizarSessao && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                      <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Para finalizar a sessão:
                      </p>
                      <ul className="text-xs text-amber-600 mt-1 ml-4 list-disc">
                        {!todosItensFechados && (
                          <li>
                            {isPorLote
                              ? `Feche todos os ${totalItensOuLotes} lotes (${totalFechadosParaValidacao} fechados)`
                              : isGlobal
                                ? `Feche o Total Global (${totalFechadosParaValidacao} fechado)`
                                : `Feche todos os ${totalItensOuLotes} itens (${totalFechadosParaValidacao} fechados)`
                            }
                          </li>
                        )}
                        {!planilhaGerada && <li>Gere a Planilha de Lances</li>}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleRemarcarVencedores}
              disabled={salvando}
            >
              <RefreshCw className="h-5 w-5 mr-2" />
              {salvando ? "Processando..." : "Remarcar Vencedores"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {!sessaoFinalizada 
              ? "Ao finalizar, a Análise Documental será habilitada" 
              : "Sessão já finalizada - Use para recalcular os vencedores se necessário"}
          </p>
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={confirmDeleteLance.open}
      onOpenChange={(open) => !open && setConfirmDeleteLance({ open: false, lanceId: null })}
      onConfirm={confirmarExclusaoLance}
      title="Excluir lance"
      description="Tem certeza que deseja excluir este lance? Esta ação não pode ser desfeita."
      confirmText="Excluir"
      cancelText="Cancelar"
      variant="destructive"
    />

    <ConfirmDialog
      open={confirmDeletePlanilha.open}
      onOpenChange={(open) => !open && setConfirmDeletePlanilha({ open: false, planilhaId: null, urlArquivo: null })}
      onConfirm={handleDeletarPlanilha}
      title="Excluir Planilha"
      description="Tem certeza que deseja excluir esta planilha de lances? Esta ação não pode ser desfeita."
      confirmText="Excluir"
      cancelText="Cancelar"
      variant="destructive"
    />
    </>
  );
}
