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
import { Gavel, Lock, Unlock, Send, RefreshCw, Trophy, FileSpreadsheet, MessageSquare, Handshake, MessagesSquare, Trash2, CheckCircle, Ban, ChevronDown, ChevronUp, Bell, Timer } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ChatNegociacao } from "./ChatNegociacao";
import capaLogo from "@/assets/capa-processo-logo.png";
import capaRodape from "@/assets/capa-processo-rodape.png";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";

interface Item {
  numero_item: number;
  descricao: string;
  quantidade?: number;
  unidade?: string;
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
  criterioJulgamento: string;
  tituloSelecao?: string;
  sessaoFinalizada?: boolean;
  onFinalizarSessao?: () => void;
}

export function DialogSessaoLances({
  open,
  onOpenChange,
  selecaoId,
  itens,
  criterioJulgamento,
  tituloSelecao = "Seleção de Fornecedores",
  sessaoFinalizada = false,
  onFinalizarSessao,
}: DialogSessaoLancesProps) {
  // Estado - Controle de Itens
  const [itensAbertos, setItensAbertos] = useState<Set<number>>(new Set());
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [itensFechados, setItensFechados] = useState<Set<number>>(new Set());
  const [itensEmNegociacao, setItensEmNegociacao] = useState<Map<number, string>>(new Map()); // Map<numeroItem, fornecedorId>
  const [itensComHistoricoNegociacao, setItensComHistoricoNegociacao] = useState<Map<number, string>>(new Map()); // Todos os itens que tiveram negociação (para histórico)
  const [itensNegociacaoConcluida, setItensNegociacaoConcluida] = useState<Set<number>>(new Set()); // Itens que já foram negociados ou marcados como "não negociar"
  const [vencedoresPorItem, setVencedoresPorItem] = useState<Map<number, { fornecedorId: string; razaoSocial: string; valorLance: number }>>(new Map());
  const [itensEmFechamento, setItensEmFechamento] = useState<Map<number, number>>(new Map()); // Map<numeroItem, tempoExpiracao>

  // Estado - Sistema de Lances
  const [lances, setLances] = useState<Lance[]>([]);
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

  // Estado - Planilhas de Lances geradas (múltiplas)
  const [planilhasGeradas, setPlanilhasGeradas] = useState<{ id: string; nome_arquivo: string; url_arquivo: string; data_geracao: string; protocolo: string }[]>([]);

  // Carregar dados iniciais
  useEffect(() => {
    if (open) {
      loadItensAbertos();
      loadLances();
      loadUserProfile();
      loadMensagens();
      loadVencedoresPorItem();
      loadPlanilhasGeradas();
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
      .on("postgres_changes", { event: "*", schema: "public", table: "lances_fornecedores", filter: `selecao_id=eq.${selecaoId}` }, () => loadLances())
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
    try {
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
            console.log(`Fechando item ${item.numero_item} automaticamente`);
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
    } catch (error) {
      console.error("Erro ao verificar fechamento automático:", error);
    }
  };

  // ========== FUNÇÕES DE CONTROLE DE ITENS ==========
  const loadItensAbertos = async () => {
    try {
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select("*")
        .eq("selecao_id", selecaoId);

      if (error) throw error;

      const abertos = new Set<number>();
      const fechados = new Set<number>();
      const emNegociacao = new Map<number, string>();
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
        }
        // Rastrear todos os itens que tiveram negociação (para histórico/ata)
        if (item.fornecedor_negociacao_id) {
          comHistorico.set(item.numero_item, item.fornecedor_negociacao_id);
        }
        // Rastrear itens com negociação concluída ou marcados como "não negociar"
        if (item.negociacao_concluida || item.nao_negociar) {
          concluidos.add(item.numero_item);
        }
      });

      setItensAbertos(abertos);
      setItensFechados(fechados);
      setItensEmNegociacao(emNegociacao);
      setItensComHistoricoNegociacao(comHistorico);
      setItensNegociacaoConcluida(concluidos);
      setItensEmFechamento(emFechamento);
    } catch (error) {
      console.error("Erro ao carregar itens abertos:", error);
    }
  };

  const loadVencedoresPorItem = async () => {
    try {
      // Buscar lances
      const { data: lancesData, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select("fornecedor_id, numero_item, valor_lance")
        .eq("selecao_id", selecaoId)
        .order("valor_lance", { ascending: true });

      if (lancesError) throw lancesError;

      // Buscar fornecedores
      const fornecedorIds = [...new Set(lancesData?.map(l => l.fornecedor_id) || [])];
      
      const { data: fornecedoresData, error: fornecedoresError } = await supabase
        .from("fornecedores")
        .select("id, razao_social")
        .in("id", fornecedorIds.length > 0 ? fornecedorIds : ['00000000-0000-0000-0000-000000000000']);

      if (fornecedoresError) throw fornecedoresError;

      const fornecedoresMap = new Map(fornecedoresData?.map(f => [f.id, f.razao_social]) || []);

      // Identificar vencedor por item (menor lance)
      const vencedores = new Map<number, { fornecedorId: string; razaoSocial: string; valorLance: number }>();
      
      lancesData?.forEach((lance) => {
        if (!vencedores.has(lance.numero_item)) {
          vencedores.set(lance.numero_item, {
            fornecedorId: lance.fornecedor_id,
            razaoSocial: fornecedoresMap.get(lance.fornecedor_id) || 'Fornecedor',
            valorLance: lance.valor_lance
          });
        }
      });

      setVencedoresPorItem(vencedores);
    } catch (error) {
      console.error("Erro ao carregar vencedores:", error);
    }
  };

  const handleAbrirNegociacao = async (numeroItem: number) => {
    const vencedor = vencedoresPorItem.get(numeroItem);
    if (!vencedor) {
      toast.error("Não foi possível identificar o vencedor deste item");
      return;
    }

    setSalvando(true);
    try {
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
            data_fechamento: null
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
          const { error } = await supabase
            .from("itens_abertos_lances")
            .update({ 
              aberto: false, 
              data_fechamento: new Date().toISOString(), 
              iniciando_fechamento: false 
            })
            .eq("selecao_id", selecaoId)
            .eq("numero_item", numeroItem)
            .eq("iniciando_fechamento", true);
          
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
      const { data, error } = await supabase
        .from("lances_fornecedores")
        .select(`*, fornecedores (razao_social, cnpj)`)
        .eq("selecao_id", selecaoId)
        .order("numero_item", { ascending: true })
        .order("valor_lance", { ascending: true })
        .order("data_hora_lance", { ascending: true });

      if (error) throw error;
      setLances(data || []);
      // Atualizar vencedores quando lances mudam
      loadVencedoresPorItem();
    } catch (error) {
      console.error("Erro ao carregar lances:", error);
    } finally {
      setLoadingLances(false);
    }
  };

  const getLancesDoItem = (numeroItem: number) => {
    return lances.filter(l => l.numero_item === numeroItem);
  };

  const getVencedorItem = (numeroItem: number) => {
    const lancesItem = getLancesDoItem(numeroItem);
    return lancesItem.length > 0 ? lancesItem[0] : null;
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
      const { error } = await supabase
        .from("lances_fornecedores")
        .delete()
        .eq("id", confirmDeleteLance.lanceId);

      if (error) throw error;

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
      // Marcar os lances vencedores
      const lancesOrdenados = [...lances].sort((a, b) => {
        if (a.numero_item !== b.numero_item) {
          return a.numero_item - b.numero_item;
        }
        return a.valor_lance - b.valor_lance;
      });

      // Identificar vencedor de cada item (menor lance)
      const vencedoresPorItem = new Map<number, string>();
      lancesOrdenados.forEach(lance => {
        if (!vencedoresPorItem.has(lance.numero_item)) {
          vencedoresPorItem.set(lance.numero_item, lance.id);
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

      // Chamar callback de finalização
      if (onFinalizarSessao) {
        onFinalizarSessao();
      }

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
      // Marcar os lances vencedores
      const lancesOrdenados = [...lances].sort((a, b) => {
        if (a.numero_item !== b.numero_item) {
          return a.numero_item - b.numero_item;
        }
        return a.valor_lance - b.valor_lance;
      });

      // Identificar vencedor de cada item (menor lance)
      const vencedoresPorItem = new Map<number, string>();
      lancesOrdenados.forEach(lance => {
        if (!vencedoresPorItem.has(lance.numero_item)) {
          vencedoresPorItem.set(lance.numero_item, lance.id);
        }
      });

      // Primeiro, limpar todos os indicativos
      await supabase
        .from("lances_fornecedores")
        .update({ indicativo_lance_vencedor: false })
        .eq("selecao_id", selecaoId);

      // Marcar lances vencedores
      for (const [, lanceId] of vencedoresPorItem) {
        await supabase
          .from("lances_fornecedores")
          .update({ indicativo_lance_vencedor: true })
          .eq("id", lanceId);
      }

      toast.success(`${vencedoresPorItem.size} vencedor(es) remarcado(s)!`);
      await loadLances();
      await loadVencedoresPorItem();
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
  const handleDeletarPlanilha = async (planilhaId: string, urlArquivo: string) => {
    try {
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
      
      // Recarregar lista de planilhas
      await loadPlanilhasGeradas();
      toast.success("Planilha deletada com sucesso!");
    } catch (error) {
      console.error("Erro ao deletar planilha:", error);
      toast.error("Erro ao deletar planilha");
    }
  };

  // ========== GERAR PLANILHA DE LANCES ==========
  const handleGerarPlanilhaLances = async () => {
    try {
      if (lances.length === 0) {
        toast.error("Nenhum lance registrado para gerar planilha");
        return;
      }

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
      const { data: selecaoInfo } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, processos_compras(numero_processo_interno)")
        .eq("id", selecaoId)
        .single();
      
      const numSelecao = selecaoInfo?.numero_selecao || "-";
      const numProcesso = (selecaoInfo?.processos_compras as any)?.numero_processo_interno || "-";

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

      // Agrupar lances por item
      const lancesGroupedByItem = itens.map(item => {
        const lancesItem = getLancesDoItem(item.numero_item);
        return { item, lances: lancesItem };
      });

      let yPosition = yStart + 22;

      lancesGroupedByItem.forEach(({ item, lances: lancesDoItem }) => {
        const tituloTexto = `Item ${item.numero_item}: ${item.descricao}`;

        if (lancesDoItem.length === 0) {
          // Para itens sem lances, criar tabela apenas com título
          autoTable(doc, {
            startY: yPosition,
            head: [
              [{ content: tituloTexto, colSpan: 4, styles: { fillColor: [224, 242, 241], textColor: [0, 128, 128], halign: "left", fontStyle: "bold", fontSize: 10 } }],
              ["Pos.", "Fornecedor", "Valor", "Data/Hora"]
            ],
            body: [[{ content: "Nenhum lance registrado para este item", colSpan: 4, styles: { halign: "center", textColor: [100, 100, 100], fontStyle: "italic" } }]],
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
          const tableData = lancesDoItem.map((lance, idx) => {
            const isNegociacao = lance.tipo_lance === "negociacao";
            const valorFormatado = formatCurrency(lance.valor_lance);
            
            return [
              `${idx + 1}º`,
              `${lance.fornecedores?.razao_social || "N/A"}\n${formatCNPJ(lance.fornecedores?.cnpj || "")}`,
              isNegociacao ? `${valorFormatado} *` : valorFormatado,
              new Date(lance.data_hora_lance).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              }),
            ];
          });

          autoTable(doc, {
            startY: yPosition,
            head: [
              [{ content: tituloTexto, colSpan: 4, styles: { fillColor: [224, 242, 241], textColor: [0, 128, 128], halign: "left", fontStyle: "bold", fontSize: 10 } }],
              ["Pos.", "Fornecedor", "Valor", "Data/Hora"]
            ],
            body: tableData,
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
            alternateRowStyles: {
              fillColor: [224, 242, 241] // Verde claro do logo
            },
            margin: { top: logoHeight + 10, bottom: rodapeHeight + 10 },
            didDrawPage: () => {
              adicionarLogoERodapeNovaPagina();
            },
            didParseCell: (data) => {
              // Destacar primeira posição (vencedor)
              if (data.row.index === 0 && data.section === "body") {
                data.cell.styles.fillColor = [254, 249, 195];
                data.cell.styles.fontStyle = "bold";
              }
              // Destacar valores de negociação
              if (data.column.index === 2 && data.section === "body") {
                const cellText = String(data.cell.raw);
                if (cellText.includes("*")) {
                  data.cell.styles.textColor = [22, 163, 74];
                }
              }
            },
          });

          yPosition = (doc as any).lastAutoTable.finalY + 8;
          
          // Legenda de negociação se houver lances de negociação
          const temNegociacao = lancesDoItem.some(l => l.tipo_lance === "negociacao");
          if (temNegociacao) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(22, 163, 74);
            doc.text("* Valor obtido por negociação", margin + 3, yPosition);
            doc.setTextColor(0, 0, 0);
            yPosition += 8;
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
        .select("numero_selecao, processo_compra_id, processos_compras(numero_processo_interno)")
        .eq("id", selecaoId)
        .single();

      const numeroSelecao = selecaoData?.numero_selecao || "-";
      const numeroProcesso = (selecaoData?.processos_compras as any)?.numero_processo_interno || "-";

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

      // Buscar itens das propostas para obter marcas
      let marcasPorItemFornecedor: Record<string, string> = {};
      if (vencedoresIds.size > 0) {
        const { data: itensPropostas } = await supabase
          .from("selecao_respostas_itens_fornecedor")
          .select("numero_item, marca, proposta_id, selecao_propostas_fornecedor!inner(fornecedor_id)")
          .eq("selecao_propostas_fornecedor.selecao_id", selecaoId);

        if (itensPropostas) {
          itensPropostas.forEach((ip: any) => {
            const key = `${ip.numero_item}-${ip.selecao_propostas_fornecedor?.fornecedor_id}`;
            marcasPorItemFornecedor[key] = ip.marca || "-";
          });
        }
      }

      let valorTotalGeral = 0;
      
      const resumoData = itens.map(item => {
        const vencedor = getVencedorItem(item.numero_item);
        const isNegociacao = vencedor?.tipo_lance === "negociacao";
        const valorUnitarioFormatado = vencedor ? formatCurrency(vencedor.valor_lance) : "-";
        const quantidade = item.quantidade || 1;
        const valorTotal = vencedor ? vencedor.valor_lance * quantidade : 0;
        const valorTotalFormatado = vencedor ? formatCurrency(valorTotal) : "-";
        
        // Somar ao valor total geral
        valorTotalGeral += valorTotal;
        
        // Buscar marca da proposta do fornecedor vencedor
        const marcaKey = vencedor ? `${item.numero_item}-${vencedor.fornecedor_id}` : "";
        const marca = marcasPorItemFornecedor[marcaKey] || "-";
        
        return [
          item.numero_item.toString(),
          item.descricao, // Descrição completa
          vencedor?.fornecedores?.razao_social || "Sem lances",
          marca,
          quantidade.toString(),
          item.unidade || "UN",
          isNegociacao ? `${valorUnitarioFormatado} *` : valorUnitarioFormatado,
          isNegociacao ? `${valorTotalFormatado} *` : valorTotalFormatado,
        ];
      });

      // Adicionar linha de valor total
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

      // Rastrear páginas do resumo que já receberam logo
      const paginasResumoProcessadas = new Set<number>();
      const paginaInicialResumo = doc.internal.pages.length - 1;
      paginasResumoProcessadas.add(paginaInicialResumo);

      autoTable(doc, {
        startY: resumoStartY,
        head: [["Item", "Descrição", "Vencedor", "Marca", "Qtd.", "Un.", "Valor Unit.", "Valor Total"]],
        body: resumoData,
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
        columnStyles: {
          0: { cellWidth: 15, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 80, halign: "justify" }, // Descrição justificada
          2: { cellWidth: 55 },
          3: { cellWidth: 30, halign: "center" }, // Marca centralizada
          4: { cellWidth: 18, halign: "center" },
          5: { cellWidth: 15, halign: "center" },
          6: { cellWidth: 30, halign: "right", fontStyle: "bold" },
          7: { cellWidth: 30, halign: "right", fontStyle: "bold" },
        },
        alternateRowStyles: {
          fillColor: [224, 242, 241] // Verde claro do logo
        },
        margin: { top: logoResumoHeight + 20 },
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
          if ((data.column.index === 6 || data.column.index === 7) && data.section === "body") {
            const cellText = String(data.cell.raw);
            if (cellText.includes("*")) {
              data.cell.styles.textColor = [0, 128, 128]; // Verde do logo
            }
          }
          // Estilizar linha de total
          if (data.section === "body" && data.row.index === resumoData.length - 1) {
            data.cell.styles.fillColor = [0, 128, 128]; // Verde do logo
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      // Legenda no resumo
      let finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(0, 128, 128); // Verde do logo
      doc.text("* Valor obtido por negociação", margin, finalY);
      doc.setTextColor(0, 0, 0);

      // Calcular totais por fornecedor
      const totaisPorFornecedor: Record<string, { nome: string; total: number }> = {};
      itens.forEach(item => {
        const vencedor = getVencedorItem(item.numero_item);
        if (vencedor && vencedor.fornecedores?.razao_social) {
          const fornecedorId = vencedor.fornecedor_id;
          const quantidade = item.quantidade || 1;
          const valorTotal = vencedor.valor_lance * quantidade;
          
          if (!totaisPorFornecedor[fornecedorId]) {
            totaisPorFornecedor[fornecedorId] = {
              nome: vencedor.fornecedores.razao_social,
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
        finalY += 10;

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
            0: { halign: "left", valign: "middle" },
            1: { halign: "right", fontStyle: "bold", valign: "middle", cellWidth: 80 },
          },
          alternateRowStyles: {
            fillColor: [224, 242, 241]
          },
          tableWidth: "auto",
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
      
      // Recarregar lista de planilhas
      await loadPlanilhasGeradas();
      toast.success("Planilha de lances gerada com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar planilha:", error);
      toast.error("Erro ao gerar planilha de lances");
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
        </DialogHeader>

        <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden min-h-0">
          {/* Coluna Esquerda - Controle de Itens */}
          <div className="col-span-3 flex flex-col overflow-hidden">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Controle de Itens
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
                    {itens.map((item) => {
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
                              {/* Countdown de fechamento */}
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
                    })}
                  </div>
                </ScrollAreaWithArrows>

                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <Button size="sm" className="flex-1 text-xs" onClick={handleAbrirItens} disabled={salvando || itensSelecionados.size === 0}>
                    <Unlock className="h-3 w-3 mr-1" />
                    Abrir ({itensSelecionados.size})
                  </Button>
                  <Button size="sm" variant="destructive" className="flex-1 text-xs" onClick={handleFecharItens} disabled={salvando || itensSelecionados.size === 0}>
                    <Lock className="h-3 w-3 mr-1" />
                    Fechar ({itensSelecionados.size})
                  </Button>
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
                    <Button variant="default" size="sm" onClick={handleGerarPlanilhaLances} className="text-xs">
                      <FileSpreadsheet className="h-3 w-3 mr-1" />
                      Gerar Planilha
                    </Button>
                  </div>
                </div>

                {planilhasGeradas.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs font-medium mb-2">Planilhas de Lances Geradas ({planilhasGeradas.length}):</p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                      {planilhasGeradas.map((planilha) => (
                        <Card key={planilha.id} className="bg-muted/50">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <FileSpreadsheet className="h-4 w-4 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{planilha.nome_arquivo}</p>
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
                                  onClick={() => handleDeletarPlanilha(planilha.id, planilha.url_arquivo)}
                                  className="h-7 px-2"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
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
                            <TableHead className="text-xs font-bold text-right">Valor</TableHead>
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
                            lances.map((lance) => (
                              <TableRow key={lance.id} className={lance.indicativo_lance_vencedor ? "bg-yellow-50 dark:bg-yellow-950" : ""}>
                                <TableCell className="text-xs font-medium">{lance.numero_item || "-"}</TableCell>
                                <TableCell className="text-xs">
                                  <div>{lance.fornecedores?.razao_social}</div>
                                  <div className="text-muted-foreground text-[10px]">{formatCNPJ(lance.fornecedores?.cnpj || "")}</div>
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  <span className={`font-bold ${lance.tipo_lance === "negociacao" ? "text-green-600" : ""}`}>
                                    {formatCurrency(lance.valor_lance)}
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
                            ))
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
                                <TableHead className="text-xs font-bold text-right">Valor</TableHead>
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
                                      {formatCurrency(lance.valor_lance)}
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
              const itensParaNegociacao = itens.filter(
                (item) => {
                  if (itensEmNegociacao.has(item.numero_item)) return true;
                  if (itensNegociacaoConcluida.has(item.numero_item)) return false;
                  return itensFechados.has(item.numero_item) && 
                         !itensAbertos.has(item.numero_item) && 
                         vencedoresPorItem.has(item.numero_item);
                }
              ).sort((a, b) => a.numero_item - b.numero_item);

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
                          const fornecedorId = itensEmNegociacao.get(numeroItem) || itensComHistoricoNegociacao.get(numeroItem);
                          const vencedor = vencedoresPorItem.get(numeroItem);
                          const temHistoricoNegociacao = itensComHistoricoNegociacao.has(numeroItem);
                          const chatAberto = itemChatPrivado === numeroItem;

                          if (emNegociacaoAtiva) {
                            return (
                              <div key={`neg-${numeroItem}`} className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg border border-amber-300">
                                <div className="flex items-start gap-2 mb-2">
                                  <Badge variant="outline" className="bg-amber-500 text-white border-amber-500 text-xs shrink-0">
                                    Em Negociação
                                  </Badge>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-xs">Item {numeroItem}</span>
                                    <p className="text-xs text-amber-700 dark:text-amber-300 truncate">
                                      {vencedor?.razaoSocial || 'Fornecedor'}
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
                                  <div className="mt-3 border-t border-amber-300 pt-3">
                                    <div className="h-[150px] bg-white dark:bg-background rounded-lg border">
                                      <ChatNegociacao
                                        selecaoId={selecaoId}
                                        numeroItem={numeroItem}
                                        fornecedorId={fornecedorId}
                                        fornecedorNome={vencedor?.razaoSocial || "Fornecedor"}
                                        tituloSelecao={tituloSelecao}
                                        isGestor={true}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div key={`avail-${numeroItem}`} className="p-2 bg-white dark:bg-background rounded-lg border text-xs">
                              <div className="flex items-start gap-2 mb-2">
                                <Trophy className="h-3 w-3 text-yellow-600 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold">Item {numeroItem}</span>
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
            <Button
              variant="default"
              size="lg"
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={handleFinalizarSessaoInterna}
              disabled={salvando}
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              {salvando ? "Finalizando..." : "Finalizar Sessão de Lances"}
            </Button>
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
    />
    </>
  );
}
