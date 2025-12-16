import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock, Save, Eye, Gavel, Trophy, Unlock, Send, TrendingDown, MessageSquare, X, AlertCircle, Clock, FileX, CheckCircle, XCircle, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChatNegociacao } from "@/components/selecoes/ChatNegociacao";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChatSelecao } from "@/components/selecoes/ChatSelecao";
import { gerarPropostaSelecaoPDF } from "@/lib/gerarPropostaSelecaoPDF";
import { gerarRecursoPDF } from "@/lib/gerarRecursoPDF";

interface Item {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_ofertado: number;
  marca_ofertada?: string;
  marca?: string;
}

interface CotacaoItemLote {
  numero_lote: number;
  numero_item: number;
  quantidade: number;
  unidade: string;
  descricao: string;
}

const SistemaLancesFornecedor = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const propostaId = searchParams.get("proposta");

  const [loading, setLoading] = useState(true);
  const [proposta, setProposta] = useState<any>(null);
  const [selecao, setSelecao] = useState<any>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [itensCotacao, setItensCotacao] = useState<CotacaoItemLote[]>([]);
  const [editavel, setEditavel] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [itensAbertos, setItensAbertos] = useState<Set<number>>(new Set());
  const [itensFechados, setItensFechados] = useState<Set<number>>(new Set());
  const [lances, setLances] = useState<any[]>([]);
  const [valoresLances, setValoresLances] = useState<Map<number, string>>(new Map()); // Map<numeroItem, valorDigitado>
  const [itemSelecionado, setItemSelecionado] = useState<number | null>(null);
  const [itensEstimados, setItensEstimados] = useState<Map<number, number>>(new Map());
  const [menorValorPropostas, setMenorValorPropostas] = useState<Map<number, number>>(new Map());
  const [itensEmFechamento, setItensEmFechamento] = useState<Map<number, number>>(new Map());
  const [itensEmNegociacao, setItensEmNegociacao] = useState<Map<number, string>>(new Map());
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState<Map<number, number>>(new Map());
  const [fornecedoresInabilitados, setFornecedoresInabilitados] = useState<Set<string>>(new Set());
  const [observacao, setObservacao] = useState("");
  const [enviandoLance, setEnviandoLance] = useState(false);
  const [valoresDescontoTemp, setValoresDescontoTemp] = useState<Map<string, string>>(new Map()); // Map<itemId, valorTemp>
  
  // Estados para recurso de inabilitação
  const [minhaInabilitacao, setMinhaInabilitacao] = useState<any>(null);
  const [meuRecurso, setMeuRecurso] = useState<any>(null);
  const [motivoRecurso, setMotivoRecurso] = useState("");
  const [enviandoRecurso, setEnviandoRecurso] = useState(false);
  const [tempoRestanteRecurso, setTempoRestanteRecurso] = useState<number | null>(null);
  
  // Estados para intenção de recurso (janela de 5 minutos)
  const [habilitacaoEncerrada, setHabilitacaoEncerrada] = useState(false);
  const [dataEncerramentoHabilitacao, setDataEncerramentoHabilitacao] = useState<Date | null>(null);
  const [minhaIntencaoRecurso, setMinhaIntencaoRecurso] = useState<any>(null);
  const [tempoRestanteIntencao, setTempoRestanteIntencao] = useState<number | null>(null);
  const [dialogIntencaoRecurso, setDialogIntencaoRecurso] = useState(false);
  const [motivoIntencao, setMotivoIntencao] = useState("");
  const [enviandoIntencao, setEnviandoIntencao] = useState(false);
  
  // Estado para documentos rejeitados
  const [documentosRejeitados, setDocumentosRejeitados] = useState<any[]>([]);
  const [numeroProcesso, setNumeroProcesso] = useState<string>("");
  
  // Estados para proposta realinhada
  const [assinouAta, setAssinouAta] = useState(false);
  const [ehVencedor, setEhVencedor] = useState(false);
  const [jaEnviouPropostaRealinhada, setJaEnviouPropostaRealinhada] = useState(false);

  const normalizarTexto = (texto?: string): string => {
    if (!texto) return "";
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const pontuarDescricao = (a?: string, b?: string): number => {
    const na = normalizarTexto(a);
    const nb = normalizarTexto(b);
    if (!na || !nb) return 0;

    if (na.includes(nb) || nb.includes(na)) return 10;

    const ta = new Set(na.split(" ").filter((t) => t.length >= 4));
    const tb = new Set(nb.split(" ").filter((t) => t.length >= 4));
    let overlap = 0;
    ta.forEach((t) => {
      if (tb.has(t)) overlap += 1;
    });
    return overlap;
  };

  const resolverNumeroLoteParaItem = (
    item: {
      numero_item: number;
      quantidade?: number;
      unidade?: string;
      descricao?: string;
    },
    itensCotacaoLocal: CotacaoItemLote[]
  ): number | null => {
    const candidatos = itensCotacaoLocal.filter((ci) => ci.numero_item === item.numero_item);
    if (candidatos.length === 0) return null;

    let melhor: { numero_lote: number; score: number } | null = null;

    for (const ci of candidatos) {
      let score = 0;

      if (Number(ci.quantidade) === Number(item.quantidade)) score += 10;
      if (ci.unidade && item.unidade && ci.unidade === item.unidade) score += 2;

      score += pontuarDescricao(ci.descricao, item.descricao);

      if (!melhor || score > melhor.score) {
        melhor = { numero_lote: ci.numero_lote, score };
      }
    }

    return melhor?.numero_lote ?? null;
  };

  const calcularMenorValorDasPropostas = (
    todasPropostas: any[],
    criterioJulgamento: string | null | undefined,
    itensCotacaoLocal: CotacaoItemLote[],
    inabilitacoesPorFornecedor: Map<string, number[]>
  ): Map<number, number> => {
    // por_lote: menor subtotal do lote (soma de valor_unitario_ofertado * quantidade de todos itens do lote)
    if (criterioJulgamento === "por_lote") {
      const menorPorLote = new Map<number, number>();
      if (itensCotacaoLocal.length === 0) return menorPorLote;

      const esperadosPorLote = new Map<number, number>();
      itensCotacaoLocal.forEach((ci) => {
        esperadosPorLote.set(ci.numero_lote, (esperadosPorLote.get(ci.numero_lote) || 0) + 1);
      });

      todasPropostas.forEach((prop: any) => {
        const fornecedorIdStr = String(prop.fornecedor_id);
        const itensInabilitados = inabilitacoesPorFornecedor.get(fornecedorIdStr) || [];

        const totais = new Map<number, { total: number; preenchidos: number }>();

        (prop.selecao_respostas_itens_fornecedor || []).forEach((item: any) => {
          // Mantém compatibilidade com a regra atual de exclusão por item (quando existir)
          if (itensInabilitados.includes(item.numero_item)) return;

          if (Number(item.valor_unitario_ofertado) > 0) {
            const numeroLote = resolverNumeroLoteParaItem(item, itensCotacaoLocal);
            if (!numeroLote) return;

            const totalItem =
              Number(item.valor_total_item) > 0
                ? Number(item.valor_total_item)
                : Number(item.valor_unitario_ofertado) * Number(item.quantidade || 0);

            const atual = totais.get(numeroLote) || { total: 0, preenchidos: 0 };
            totais.set(numeroLote, {
              total: atual.total + totalItem,
              preenchidos: atual.preenchidos + 1,
            });
          }
        });

        totais.forEach((info, numeroLote) => {
          const esperados = esperadosPorLote.get(numeroLote) || 0;
          if (esperados > 0 && info.preenchidos === esperados && info.total > 0) {
            const atual = menorPorLote.get(numeroLote);
            if (!atual || info.total < atual) {
              menorPorLote.set(numeroLote, info.total);
            }
          }
        });
      });

      return menorPorLote;
    }

    // Demais critérios: manter exatamente a lógica atual (por item / desconto)
    const isDesconto = criterioJulgamento === "desconto";
    const mapaMenorValor = new Map<number, number>();

    todasPropostas.forEach((prop: any) => {
      const fornecedorIdStr = String(prop.fornecedor_id);
      const itensInabilitados = inabilitacoesPorFornecedor.get(fornecedorIdStr) || [];

      if (prop.selecao_respostas_itens_fornecedor) {
        prop.selecao_respostas_itens_fornecedor.forEach((item: any) => {
          if (itensInabilitados.includes(item.numero_item)) return;

          if (Number(item.valor_unitario_ofertado) > 0) {
            const valorAtual = mapaMenorValor.get(item.numero_item);

            if (isDesconto) {
              if (!valorAtual || Number(item.valor_unitario_ofertado) > valorAtual) {
                mapaMenorValor.set(item.numero_item, Number(item.valor_unitario_ofertado));
              }
            } else {
              if (!valorAtual || Number(item.valor_unitario_ofertado) < valorAtual) {
                mapaMenorValor.set(item.numero_item, Number(item.valor_unitario_ofertado));
              }
            }
          }
        });
      }
    });

    return mapaMenorValor;
  };

  // TEMPO REAL: Atualizar estado `editavel` a cada segundo
  useEffect(() => {
    if (!selecao?.data_sessao_disputa || !selecao?.hora_sessao_disputa) return;

    const verificarEditavel = () => {
      const horaCompleta = selecao.hora_sessao_disputa.includes(':') 
        ? selecao.hora_sessao_disputa 
        : `${selecao.hora_sessao_disputa}:00`;
      const horaFormatada = horaCompleta.split(':').length === 2 ? `${horaCompleta}:00` : horaCompleta;
      const dataHoraSelecao = new Date(`${selecao.data_sessao_disputa}T${horaFormatada}-03:00`);
      
      if (isNaN(dataHoraSelecao.getTime())) return;
      
      const cincoMinutosAntes = new Date(dataHoraSelecao.getTime() - 5 * 60 * 1000);
      const agora = new Date();
      const agoraBrasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      
      const novoEditavel = agoraBrasilia < cincoMinutosAntes;
      
      setEditavel(prev => {
        if (prev !== novoEditavel) {
          console.log("⏰ [TEMPO REAL] Editável mudou:", novoEditavel, { agoraBrasilia: agoraBrasilia.toISOString(), cincoMinutosAntes: cincoMinutosAntes.toISOString() });
        }
        return novoEditavel;
      });
    };

    // Verificar imediatamente
    verificarEditavel();

    // Verificar a cada segundo
    const interval = setInterval(verificarEditavel, 1000);

    return () => clearInterval(interval);
  }, [selecao?.data_sessao_disputa, selecao?.hora_sessao_disputa]);

  // CRÍTICO: Filtrar lances excluindo fornecedores inabilitados de forma reativa
  // Isso garante que sempre que lances ou fornecedoresInabilitados mudam, os lances são refiltrados
  const lancesFiltrados = useMemo(() => {
    // SEMPRE filtrar, mesmo que fornecedoresInabilitados esteja vazio inicialmente
    // porque os lances podem já ter sido carregados antes dos inabilitados
    const resultado = lances.filter(lance => {
      const fornecedorIdStr = String(lance.fornecedor_id);
      const isInabilitado = fornecedoresInabilitados.has(fornecedorIdStr);
      return !isInabilitado;
    });
    
    // Log apenas quando há diferença
    if (resultado.length !== lances.length) {
      console.log(`[useMemo lancesFiltrados] Filtrou ${lances.length - resultado.length} lances de fornecedores inabilitados`);
    }
    
    return resultado;
  }, [lances, fornecedoresInabilitados]);

  useEffect(() => {
    if (propostaId) {
      loadProposta();
    } else {
      // Se não tem propostaId, não fica em loading infinito
      setLoading(false);
    }
  }, [propostaId]);

  useEffect(() => {
    if (selecao?.id && proposta?.fornecedor_id) {
      loadItensAbertos();
      loadLances();
      loadMensagensNaoLidas();
      loadMinhaInabilitacao();
      loadDocumentosRejeitados();
      loadHabilitacaoStatus();
      loadMinhaIntencaoRecurso();
      loadStatusPropostaRealinhada();

      // Subscrição em tempo real para lances
      const channel = supabase
        .channel(`lances_${selecao.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "lances_fornecedores",
            filter: `selecao_id=eq.${selecao.id}`,
          },
          () => {
            loadLances();
          }
        )
        .subscribe();

      // Subscrição para itens abertos - Realtime
      const channelItens = supabase
        .channel(`itens_abertos_${selecao.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "itens_abertos_lances",
            filter: `selecao_id=eq.${selecao.id}`,
          },
          (payload) => {
            console.log("Itens abertos atualizado via realtime:", payload);
            loadItensAbertos();
          }
        )
        .subscribe((status) => {
          console.log("Status da subscrição itens_abertos:", status);
        });

      // Subscrição para mensagens de negociação - Realtime
      const channelMensagens = supabase
        .channel(`mensagens_negociacao_${selecao.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "mensagens_negociacao",
            filter: `selecao_id=eq.${selecao.id}`,
          },
          (payload: any) => {
            // Só incrementar se a mensagem for do gestor (não do próprio fornecedor)
            if (payload.new && payload.new.tipo_remetente === 'gestor') {
              const numeroItem = payload.new.numero_item;
              // Não incrementar se o chat do item está aberto
              if (itemSelecionado !== numeroItem) {
                setMensagensNaoLidas(prev => {
                  const novo = new Map(prev);
                  novo.set(numeroItem, (prev.get(numeroItem) || 0) + 1);
                  return novo;
                });
              }
            }
          }
        )
        .subscribe();
        
      // Subscrição para inabilitações - Realtime
      const channelInabilitacoes = supabase
        .channel(`inabilitacoes_${selecao.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "fornecedores_inabilitados_selecao",
            filter: `selecao_id=eq.${selecao.id}`,
          },
          () => {
            loadMinhaInabilitacao();
          }
        )
        .subscribe();

      // Polling como fallback a cada 3 segundos para garantir sincronização de itens e lances
      const pollingInterval = setInterval(() => {
        loadItensAbertos();
        loadLances();
      }, 3000);

      // Canal de presença para rastrear fornecedores online
      const presenceChannel = supabase.channel(`presence_selecao_${selecao.id}`);
      
      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          // Presença sincronizada
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Enviar nossa presença com dados do fornecedor
            const { data: fornecedorData } = await supabase
              .from('fornecedores')
              .select('razao_social')
              .eq('id', proposta.fornecedor_id)
              .single();
            
            await presenceChannel.track({
              fornecedor_id: proposta.fornecedor_id,
              razao_social: fornecedorData?.razao_social || 'Fornecedor',
              online_at: new Date().toISOString(),
            });
          }
        });

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(channelItens);
        supabase.removeChannel(channelMensagens);
        supabase.removeChannel(channelInabilitacoes);
        supabase.removeChannel(presenceChannel);
        clearInterval(pollingInterval);
      };
    }
  }, [selecao?.id, proposta?.fornecedor_id, itemSelecionado]);

  // Limpar mensagens não lidas quando abrir o chat de um item
  useEffect(() => {
    if (itemSelecionado !== null) {
      setMensagensNaoLidas(prev => {
        const novo = new Map(prev);
        novo.delete(itemSelecionado);
        return novo;
      });
    }
  }, [itemSelecionado]);

  const loadMensagensNaoLidas = async () => {
    if (!selecao?.id || !proposta?.fornecedor_id) return;
    
    try {
      // Buscar contagem de mensagens do gestor para cada item em negociação
      const { data, error } = await supabase
        .from("mensagens_negociacao")
        .select("numero_item")
        .eq("selecao_id", selecao.id)
        .eq("fornecedor_id", proposta.fornecedor_id)
        .eq("tipo_remetente", "gestor");

      if (error) throw error;

      // Contar mensagens por item
      const contagem = new Map<number, number>();
      data?.forEach((msg: any) => {
        contagem.set(msg.numero_item, (contagem.get(msg.numero_item) || 0) + 1);
      });
      
      setMensagensNaoLidas(contagem);
    } catch (error) {
      console.error("Erro ao carregar mensagens não lidas:", error);
    }
  };

  const loadMinhaInabilitacao = async () => {
    if (!selecao?.id || !proposta?.fornecedor_id) return;
    
    try {
      // Verificar se eu fui inabilitado
      const { data: inabilitacao, error: inabError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("*")
        .eq("selecao_id", selecao.id)
        .eq("fornecedor_id", proposta.fornecedor_id)
        .eq("revertido", false)
        .maybeSingle();

      if (inabError) throw inabError;
      
      setMinhaInabilitacao(inabilitacao);
      
      if (inabilitacao) {
        // Buscar o recurso mais recente (ordenado por created_at DESC)
        const { data: recursos, error: recursoError } = await supabase
          .from("recursos_inabilitacao_selecao")
          .select("*")
          .eq("inabilitacao_id", inabilitacao.id)
          .order("created_at", { ascending: false })
          .limit(1);
          
        if (recursoError) throw recursoError;
        
        const recurso = recursos?.[0] || null;
        
        if (recurso) {
          setMeuRecurso(recurso);
        } else {
          // Só criar recurso se fornecedor já manifestou intenção de recorrer
          // Buscar intenção de recurso primeiro
          const { data: intencao } = await supabase
            .from("intencoes_recurso_selecao")
            .select("*")
            .eq("selecao_id", selecao.id)
            .eq("fornecedor_id", proposta.fornecedor_id)
            .maybeSingle();
          
          if (intencao?.deseja_recorrer) {
            // Data limite: 1 dia útil a partir de agora
            const dataLimite = calcularProximoDiaUtil(new Date(), 1);
            
            const { data: novoRecurso, error: criarError } = await supabase
              .from("recursos_inabilitacao_selecao")
              .insert({
                inabilitacao_id: inabilitacao.id,
                selecao_id: selecao.id,
                fornecedor_id: proposta.fornecedor_id,
                motivo_recurso: "",
                data_limite_fornecedor: dataLimite.toISOString(),
                status_recurso: "aguardando_envio"
              })
              .select()
              .single();
              
            if (!criarError && novoRecurso) {
              setMeuRecurso(novoRecurso);
            }
          } else {
            setMeuRecurso(null);
          }
        }
      } else {
        setMeuRecurso(null);
      }
    } catch (error) {
      console.error("Erro ao carregar inabilitação:", error);
    }
  };

  // Função para carregar documentos rejeitados do fornecedor
  const loadDocumentosRejeitados = async () => {
    if (!selecao?.id || !proposta?.fornecedor_id) return;
    
    try {
      const { data, error } = await supabase
        .from("campos_documentos_finalizacao")
        .select("*")
        .eq("selecao_id", selecao.id)
        .eq("fornecedor_id", proposta.fornecedor_id)
        .eq("status_solicitacao", "rejeitado");

      if (error) throw error;
      
      setDocumentosRejeitados(data || []);
    } catch (error) {
      console.error("Erro ao carregar documentos rejeitados:", error);
    }
  };

  // Carregar status de habilitação encerrada da seleção
  const loadHabilitacaoStatus = async () => {
    if (!selecao?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("selecoes_fornecedores")
        .select("habilitacao_encerrada, data_encerramento_habilitacao")
        .eq("id", selecao.id)
        .single();

      if (error) throw error;
      
      setHabilitacaoEncerrada(data?.habilitacao_encerrada || false);
      if (data?.data_encerramento_habilitacao) {
        setDataEncerramentoHabilitacao(new Date(data.data_encerramento_habilitacao));
      }
    } catch (error) {
      console.error("Erro ao carregar status de habilitação:", error);
    }
  };

  // Carregar intenção de recurso do fornecedor
  const loadMinhaIntencaoRecurso = async () => {
    if (!selecao?.id || !proposta?.fornecedor_id) return;
    
    try {
      const { data, error } = await supabase
        .from("intencoes_recurso_selecao")
        .select("*")
        .eq("selecao_id", selecao.id)
        .eq("fornecedor_id", proposta.fornecedor_id)
        .maybeSingle();

      if (error) throw error;
      
      setMinhaIntencaoRecurso(data);
    } catch (error) {
      console.error("Erro ao carregar intenção de recurso:", error);
    }
  };

  // Verificar status de proposta realinhada (se assinou ata e é vencedor)
  const loadStatusPropostaRealinhada = async () => {
    if (!selecao?.id || !proposta?.fornecedor_id) return;
    
    try {
      // 1. Verificar se existe ata para esta seleção e se fornecedor assinou
      const { data: atas } = await supabase
        .from("atas_selecao")
        .select("id")
        .eq("selecao_id", selecao.id);
      
      if (!atas || atas.length === 0) {
        setAssinouAta(false);
        setEhVencedor(false);
        return;
      }
      
      const ataIds = atas.map(a => a.id);
      
      const { data: assinatura } = await supabase
        .from("atas_assinaturas_fornecedor")
        .select("status_assinatura, ata_id")
        .eq("fornecedor_id", proposta.fornecedor_id)
        .in("ata_id", ataIds)
        .eq("status_assinatura", "aceito")
        .maybeSingle();
      
      const fornecedorAssinouAta = !!assinatura;
      setAssinouAta(fornecedorAssinouAta);
      
      if (!fornecedorAssinouAta) {
        setEhVencedor(false);
        return;
      }
      
      // 2. Identificar vencedores DINAMICAMENTE (não depender de indicativo_lance_vencedor)
      const { data: todosLances } = await supabase
        .from("lances_fornecedores")
        .select("*")
        .eq("selecao_id", selecao.id)
        .order("data_hora_lance", { ascending: false });
      
      if (!todosLances || todosLances.length === 0) {
        setEhVencedor(false);
        return;
      }
      
      // Buscar critério de julgamento
      const criterio = selecao?.criterios_julgamento || "por_item";
      
      // Agrupar por item/lote e identificar vencedor de cada
      const vencedoresPorItem = new Map<number, string>();
      const itensPorFornecedor = new Map<number, { fornecedor_id: string; valor: number }[]>();
      
      todosLances.forEach((lance: any) => {
        const key = lance.numero_item;
        if (!itensPorFornecedor.has(key)) {
          itensPorFornecedor.set(key, []);
        }
        
        // Verificar se já existe lance deste fornecedor para este item
        const lancesItem = itensPorFornecedor.get(key)!;
        const existente = lancesItem.find(l => l.fornecedor_id === lance.fornecedor_id);
        
        if (!existente) {
          lancesItem.push({ fornecedor_id: lance.fornecedor_id, valor: lance.valor_lance });
        } else {
          // Atualizar se for melhor lance
          if (criterio === "desconto") {
            if (lance.valor_lance > existente.valor) {
              existente.valor = lance.valor_lance;
            }
          } else {
            if (lance.valor_lance < existente.valor) {
              existente.valor = lance.valor_lance;
            }
          }
        }
      });
      
      // Identificar vencedor de cada item
      itensPorFornecedor.forEach((lances, numeroItem) => {
        if (lances.length === 0) return;
        
        // Ordenar: desconto = maior vence, preço = menor vence
        const ordenado = [...lances].sort((a, b) => {
          if (criterio === "desconto") {
            return b.valor - a.valor; // Maior primeiro
          }
          return a.valor - b.valor; // Menor primeiro
        });
        
        vencedoresPorItem.set(numeroItem, ordenado[0].fornecedor_id);
      });
      
      // Verificar se o fornecedor atual é vencedor em algum item
      let fornecedorEhVencedor = false;
      vencedoresPorItem.forEach((vencedorId) => {
        if (vencedorId === proposta.fornecedor_id) {
          fornecedorEhVencedor = true;
        }
      });
      
      setEhVencedor(fornecedorEhVencedor);
      
      // 3. Verificar se já enviou proposta realinhada
      if (fornecedorEhVencedor) {
        const { data: propostaRealinhada } = await supabase
          .from("propostas_realinhadas")
          .select("id")
          .eq("selecao_id", selecao.id)
          .eq("fornecedor_id", proposta.fornecedor_id)
          .maybeSingle();
        
        setJaEnviouPropostaRealinhada(!!propostaRealinhada);
      }
    } catch (error) {
      console.error("Erro ao carregar status de proposta realinhada:", error);
    }
  };

  useEffect(() => {
    if (!habilitacaoEncerrada || !dataEncerramentoHabilitacao || minhaIntencaoRecurso) {
      setTempoRestanteIntencao(null);
      return;
    }

    const calcularTempoRestante = () => {
      // 5 minutos após o encerramento
      const dataLimite = new Date(dataEncerramentoHabilitacao.getTime() + 5 * 60 * 1000).getTime();
      const agora = Date.now();
      const diferenca = dataLimite - agora;
      
      if (diferenca <= 0) {
        setTempoRestanteIntencao(0);
      } else {
        setTempoRestanteIntencao(Math.floor(diferenca / 1000));
      }
    };

    calcularTempoRestante();
    const interval = setInterval(calcularTempoRestante, 1000);

    return () => clearInterval(interval);
  }, [habilitacaoEncerrada, dataEncerramentoHabilitacao, minhaIntencaoRecurso]);

  // Registrar intenção de recurso (Sim ou Não)
  const handleRegistrarIntencaoRecurso = async (desejaRecorrer: boolean, motivo?: string) => {
    if (!selecao?.id || !proposta?.fornecedor_id) return;

    setEnviandoIntencao(true);
    try {
      const { error } = await supabase
        .from("intencoes_recurso_selecao")
        .insert({
          selecao_id: selecao.id,
          fornecedor_id: proposta.fornecedor_id,
          deseja_recorrer: desejaRecorrer,
          motivo_intencao: motivo || null
        });

      if (error) throw error;

      if (desejaRecorrer) {
        toast.success("Intenção de recorrer registrada com sucesso!");
        setDialogIntencaoRecurso(false);
        setMotivoIntencao("");
        
        // Se fornecedor foi inabilitado, verificar se já existe recurso antes de criar
        if (minhaInabilitacao) {
          // Verificar se já existe recurso
          const { data: recursosExistentes } = await supabase
            .from("recursos_inabilitacao_selecao")
            .select("id")
            .eq("inabilitacao_id", minhaInabilitacao.id)
            .limit(1);
          
          // Só criar se não existir nenhum recurso
          if (!recursosExistentes || recursosExistentes.length === 0) {
            const dataLimite = calcularProximoDiaUtil(new Date(), 1);
            await supabase
              .from("recursos_inabilitacao_selecao")
              .insert({
                inabilitacao_id: minhaInabilitacao.id,
                selecao_id: selecao.id,
                fornecedor_id: proposta.fornecedor_id,
                motivo_recurso: "",
                data_limite_fornecedor: dataLimite.toISOString(),
                status_recurso: "aguardando_envio"
              });
          }
          loadMinhaInabilitacao();
        }
      } else {
        toast.info("Registrado que você não deseja recorrer.");
      }
      
      loadMinhaIntencaoRecurso();
    } catch (error) {
      console.error("Erro ao registrar intenção de recurso:", error);
      toast.error("Erro ao registrar intenção");
    } finally {
      setEnviandoIntencao(false);
    }
  };
  const calcularProximoDiaUtil = (dataBase: Date, diasUteis: number): Date => {
    const result = new Date(dataBase);
    let diasAdicionados = 0;
    
    while (diasAdicionados < diasUteis) {
      result.setDate(result.getDate() + 1);
      const diaSemana = result.getDay();
      // Pular sábado (6) e domingo (0)
      if (diaSemana !== 0 && diaSemana !== 6) {
        diasAdicionados++;
      }
    }
    
    return result;
  };

  // Countdown para o tempo restante do recurso
  useEffect(() => {
    if (!meuRecurso || meuRecurso.status_recurso !== "aguardando_envio") {
      setTempoRestanteRecurso(null);
      return;
    }

    const calcularTempoRestante = () => {
      const dataLimite = new Date(meuRecurso.data_limite_fornecedor).getTime();
      const agora = Date.now();
      const diferenca = dataLimite - agora;
      
      if (diferenca <= 0) {
        setTempoRestanteRecurso(0);
        // Atualizar status para expirado
        supabase
          .from("recursos_inabilitacao_selecao")
          .update({ status_recurso: "expirado" })
          .eq("id", meuRecurso.id)
          .then(() => loadMinhaInabilitacao());
      } else {
        setTempoRestanteRecurso(Math.floor(diferenca / 1000));
      }
    };

    calcularTempoRestante();
    const interval = setInterval(calcularTempoRestante, 1000);

    return () => clearInterval(interval);
  }, [meuRecurso]);

  const handleEnviarRecurso = async () => {
    if (!meuRecurso || !motivoRecurso.trim()) {
      toast.error("Informe o motivo do recurso");
      return;
    }

    setEnviandoRecurso(true);
    try {
      const dataEnvio = new Date();
      const dataLimiteGestor = calcularProximoDiaUtil(dataEnvio, 1);

      // Gerar PDF do recurso
      let pdfUrl = null;
      let pdfFileName = null;
      let pdfProtocolo = null;
      try {
        const pdfResult = await gerarRecursoPDF(
          motivoRecurso,
          proposta?.fornecedores?.razao_social || "Fornecedor",
          proposta?.fornecedores?.cnpj || "",
          numeroProcesso || "",
          minhaInabilitacao?.motivo_inabilitacao || "",
          selecao?.numero_selecao || ""
        );
        pdfUrl = pdfResult.url;
        pdfFileName = pdfResult.fileName;
        pdfProtocolo = pdfResult.protocolo;
      } catch (pdfError) {
        console.error("Erro ao gerar PDF do recurso:", pdfError);
        // Não bloqueia o envio se o PDF falhar
      }

      const { error } = await supabase
        .from("recursos_inabilitacao_selecao")
        .update({
          motivo_recurso: motivoRecurso,
          data_envio_recurso: dataEnvio.toISOString(),
          status_recurso: "enviado",
          data_limite_gestor: dataLimiteGestor.toISOString(),
          url_pdf_recurso: pdfUrl,
          nome_arquivo_recurso: pdfFileName,
          protocolo_recurso: pdfProtocolo
        })
        .eq("id", meuRecurso.id);

      if (error) throw error;

      toast.success("Recurso enviado com sucesso!");
      setMotivoRecurso("");
      loadMinhaInabilitacao();
    } catch (error) {
      console.error("Erro ao enviar recurso:", error);
      toast.error("Erro ao enviar recurso");
    } finally {
      setEnviandoRecurso(false);
    }
  };

  const formatarTempoRestante = (segundos: number): string => {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = segundos % 60;
    
    if (horas > 0) {
      return `${horas}h ${minutos}m ${segs}s`;
    }
    if (minutos > 0) {
      return `${minutos}m ${segs}s`;
    }
    return `${segs}s`;
  };

  useEffect(() => {
    if (itensEmFechamento.size === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      
      setItensEmFechamento(prev => {
        const novo = new Map(prev);
        let algumItemExpirou = false;

        novo.forEach((tempoExpiracao, numeroItem) => {
          if (tempoExpiracao > now) {
            novo.set(numeroItem, tempoExpiracao);
          } else {
            novo.delete(numeroItem);
            algumItemExpirou = true;
          }
        });

        if (algumItemExpirou) {
          loadItensAbertos();
        }

        return novo;
      });
    }, 100); // Atualiza a cada 100ms para visual mais suave

    return () => clearInterval(interval);
  }, [itensEmFechamento.size]);

  const loadProposta = async () => {
    try {
      // Carregar proposta com fornecedor e seleção
      const { data: propostaData, error: propostaError } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          *,
          fornecedores(*),
          selecoes_fornecedores(*, processos_compras(criterio_julgamento))
        `)
        .eq("id", propostaId)
        .single();

      if (propostaError) throw propostaError;

      const criterioJulgamento =
        propostaData.selecoes_fornecedores.processos_compras?.criterio_julgamento ||
        propostaData.selecoes_fornecedores.criterios_julgamento;

      // Normalizar: garantir que selecao.processos_compras.criterio_julgamento exista sempre
      const selecaoNormalizada = {
        ...propostaData.selecoes_fornecedores,
        processos_compras: {
          ...(propostaData.selecoes_fornecedores.processos_compras || {}),
          criterio_julgamento: criterioJulgamento,
        },
      };

      setProposta(propostaData);
      setSelecao(selecaoNormalizada);

      const cotacaoId = selecaoNormalizada?.cotacao_relacionada_id as string | null | undefined;
      let itensCotacaoLocal: CotacaoItemLote[] = itensCotacao;

      // Buscar número do processo através da cotação relacionada
      if (cotacaoId) {
        const { data: cotacaoData } = await supabase
          .from("cotacoes_precos")
          .select("processos_compras (numero_processo_interno)")
          .eq("id", cotacaoId)
          .single();

        setNumeroProcesso((cotacaoData as any)?.processos_compras?.numero_processo_interno || "");
      }

      // por_lote: carregar itens da cotação (mapeamento lote→itens) para permitir subtotal por lote
      if (criterioJulgamento === "por_lote" && cotacaoId) {
        const [{ data: lotesData, error: lotesError }, { data: itensData, error: itensError }] = await Promise.all([
          supabase.from("lotes_cotacao").select("id, numero_lote").eq("cotacao_id", cotacaoId),
          supabase
            .from("itens_cotacao")
            .select("lote_id, numero_item, quantidade, unidade, descricao")
            .eq("cotacao_id", cotacaoId),
        ]);

        if (lotesError) {
          console.error("❌ Erro ao buscar lotes_cotacao:", lotesError);
        }
        if (itensError) {
          console.error("❌ Erro ao buscar itens_cotacao:", itensError);
        }

        const mapaLotes = new Map<string, number>();
        (lotesData || []).forEach((l: any) => {
          mapaLotes.set(String(l.id), Number(l.numero_lote));
        });

        itensCotacaoLocal = (itensData || [])
          .map((it: any) => ({
            numero_lote: mapaLotes.get(String(it.lote_id)) || 0,
            numero_item: Number(it.numero_item),
            quantidade: Number(it.quantidade),
            unidade: String(it.unidade || ""),
            descricao: String(it.descricao || ""),
          }))
          .filter((it: CotacaoItemLote) => it.numero_lote > 0);

        setItensCotacao(itensCotacaoLocal);
      }

      // Buscar estimativas da planilha consolidada mais recente
      if (cotacaoId) {
        console.log('🔍 Buscando estimativas da cotação:', cotacaoId);

        const { data: planilhaData, error: planilhaError } = await supabase
          .from("planilhas_consolidadas")
          .select("estimativas_itens, data_geracao, id")
          .eq("cotacao_id", cotacaoId)
          .order("data_geracao", { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log('📊 Planilha consolidada mais recente:', planilhaData);
        console.log('📊 Erro ao buscar planilha:', planilhaError);
        if (!planilhaError && planilhaData) {
          console.log('📊 [loadProposta] estimativas_itens BRUTAS do banco:', planilhaData.estimativas_itens);
          console.log('📊 [loadProposta] Tipo:', typeof planilhaData.estimativas_itens);
          console.log('📊 [loadProposta] JSON:', JSON.stringify(planilhaData.estimativas_itens));
          
          if (planilhaData.estimativas_itens) {
            const estimativas = planilhaData.estimativas_itens as Record<string, number>;

            // por_lote: estimado = subtotal do lote (somatório estimativa_unitária × quantidade)
            if (criterioJulgamento === "por_lote") {
              const mapaSubtotalLote = new Map<number, number>();

              if (itensCotacaoLocal.length === 0) {
                console.warn("⚠️ por_lote: itensCotacaoLocal vazio; não foi possível calcular estimado por lote");
              } else {
                itensCotacaoLocal.forEach((ci) => {
                  const key = `${ci.numero_lote}_${ci.numero_item}`;
                  const estimativaUnit = Number(estimativas[key] || 0);
                  if (estimativaUnit > 0) {
                    mapaSubtotalLote.set(
                      ci.numero_lote,
                      (mapaSubtotalLote.get(ci.numero_lote) || 0) + estimativaUnit * Number(ci.quantidade)
                    );
                  }
                });
              }

              console.log('✅ [loadProposta] Estimado por LOTE (subtotal):', Object.fromEntries(mapaSubtotalLote));
              setItensEstimados(mapaSubtotalLote);
            } else {
              // Demais critérios: manter comportamento atual (chave numérica)
              const mapaEstimados = new Map<number, number>();
              Object.entries(estimativas).forEach(([numeroItem, valor]) => {
                const num = parseInt(numeroItem);
                mapaEstimados.set(num, Number(valor));
              });

              console.log('✅ [loadProposta] Mapa FINAL:', Object.fromEntries(mapaEstimados));
              console.log('✅ [loadProposta] Tamanho do mapa:', mapaEstimados.size);
              setItensEstimados(mapaEstimados);
              console.log('✅ [loadProposta] setItensEstimados CHAMADO');
            }
          } else {
            console.warn('⚠️ Planilha sem campo estimativas_itens - foi gerada antes da atualização');
            console.warn('⚠️ GERE UMA NOVA PLANILHA para que as estimativas apareçam');
          }
        } else {
          console.error('❌ Erro ao buscar planilha:', planilhaError);
          console.warn('⚠️ Nenhuma planilha consolidada encontrada para esta cotação');
        }
      } else {
        console.warn('⚠️ Seleção sem cotacao_relacionada_id');
      }

      // Buscar fornecedores inabilitados da seleção COM itens_afetados
      const { data: inabilitados, error: inabilitadosError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", propostaData.selecoes_fornecedores.id)
        .eq("revertido", false);

      // Criar mapa de fornecedor -> itens inabilitados
      const inabilitacoesPorFornecedor = new Map<string, number[]>();
      (inabilitados || []).forEach((f: any) => {
        inabilitacoesPorFornecedor.set(String(f.fornecedor_id), f.itens_afetados || []);
      });
      
      // CRÍTICO: Converter SEMPRE para String para garantir comparações corretas
      const fornecedoresInabilitadosIds = new Set<string>(
        (inabilitados || []).map((f: any) => String(f.fornecedor_id))
      );
      setFornecedoresInabilitados(fornecedoresInabilitadosIds);
      console.log('Fornecedores inabilitados na seleção (strings):', Array.from(fornecedoresInabilitadosIds));

      // Buscar o menor valor de cada item/lote das propostas de TODOS os fornecedores da seleção (exceto inabilitados)
      const { data: todasPropostas, error: propostasError } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          id,
          fornecedor_id,
          selecao_respostas_itens_fornecedor (
            numero_item,
            descricao,
            quantidade,
            unidade,
            valor_unitario_ofertado,
            valor_total_item
          )
        `)
        .eq("selecao_id", propostaData.selecoes_fornecedores.id);

      if (!propostasError && todasPropostas) {
        const mapaMelhorValor = calcularMenorValorDasPropostas(
          todasPropostas,
          criterioJulgamento,
          itensCotacaoLocal,
          inabilitacoesPorFornecedor
        );

        console.log('🏆 Melhor valor final (por item ou por lote):', Object.fromEntries(mapaMelhorValor));
        setMenorValorPropostas(mapaMelhorValor);
      }

      // Verificar se ainda é editável (5 minutos antes da sessão)
      // Usar fuso horário de Brasília (America/Sao_Paulo = UTC-3)
      const horaCompleta = propostaData.selecoes_fornecedores.hora_sessao_disputa.includes(':') 
        ? propostaData.selecoes_fornecedores.hora_sessao_disputa 
        : `${propostaData.selecoes_fornecedores.hora_sessao_disputa}:00`;
      // Garantir formato HH:MM:SS
      const horaFormatada = horaCompleta.split(':').length === 2 ? `${horaCompleta}:00` : horaCompleta;
      const dataHoraSelecao = new Date(`${propostaData.selecoes_fornecedores.data_sessao_disputa}T${horaFormatada}-03:00`);
      const cincoMinutosAntes = new Date(dataHoraSelecao.getTime() - 5 * 60 * 1000);
      const agora = new Date();
      const agoraBrasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      
      console.log("DEBUG editavel:", {
        horaOriginal: propostaData.selecoes_fornecedores.hora_sessao_disputa,
        horaFormatada,
        dataHoraSelecao: dataHoraSelecao.toISOString(),
        cincoMinutosAntes: cincoMinutosAntes.toISOString(),
        agoraBrasilia: agoraBrasilia.toISOString(),
        editavel: agoraBrasilia < cincoMinutosAntes
      });
      
      setEditavel(agoraBrasilia < cincoMinutosAntes);

      // Carregar itens da proposta
      const { data: itensData, error: itensError } = await supabase
        .from("selecao_respostas_itens_fornecedor")
        .select("*")
        .eq("proposta_id", propostaId)
        .order("numero_item");

      if (itensError) throw itensError;
      
      setItens(itensData || []);

    } catch (error) {
      console.error("Erro ao carregar proposta:", error);
      toast.error("Erro ao carregar proposta. Verifique se você tem acesso.");
      // NÃO redireciona - deixa mostrar a mensagem "Proposta não encontrada"
    } finally {
      setLoading(false);
    }
  };

  const loadItensAbertos = async () => {
    if (!selecao?.id) return;
    
    try {
      // Buscar TODOS os registros de itens para esta seleção
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select("*")
        .eq("selecao_id", selecao.id);

      if (error) throw error;

      // Filtrar APENAS itens com aberto === true (booleano estrito)
      const itensAbertosFiltrados = data?.filter((item: any) => item.aberto === true) || [];
      const abertos = new Set(itensAbertosFiltrados.map((item: any) => item.numero_item));
      
      // Filtrar itens fechados (aberto === false)
      const itensFechadosFiltrados = data?.filter((item: any) => item.aberto === false) || [];
      const fechados = new Set(itensFechadosFiltrados.map((item: any) => item.numero_item));
      
      console.log("Itens abertos carregados:", Array.from(abertos));
      console.log("Itens fechados carregados:", Array.from(fechados));
      setItensAbertos(abertos);
      setItensFechados(fechados);

      // Mapear itens em fechamento com timestamp de expiração
      const emFechamento = new Map<number, number>();
      const emNegociacao = new Map<number, string>();
      const now = Date.now();
      
      // Apenas processar itens que estão REALMENTE abertos
      itensAbertosFiltrados.forEach((item: any) => {
        // Itens em processo de fechamento
        if (item.iniciando_fechamento && item.data_inicio_fechamento && item.segundos_para_fechar !== null) {
          const inicioFechamento = new Date(item.data_inicio_fechamento).getTime();
          const tempoExpiracao = inicioFechamento + (item.segundos_para_fechar * 1000);
          
          if (tempoExpiracao > now) {
            emFechamento.set(item.numero_item, tempoExpiracao);
          }
        }
        
        // Itens em negociação
        if (item.em_negociacao && item.fornecedor_negociacao_id) {
          emNegociacao.set(item.numero_item, item.fornecedor_negociacao_id);
        }
      });
      
      setItensEmFechamento(emFechamento);
      setItensEmNegociacao(emNegociacao);

    } catch (error) {
      console.error("Erro ao carregar itens abertos:", error);
    }
  };

  const loadLances = async () => {
    if (!selecao?.id) {
      console.log('loadLances: selecao.id não disponível');
      return;
    }

    try {
      console.log('loadLances: Buscando inabilitados para selecao_id:', selecao.id);
      
      // CRÍTICO: Não recarregar itensEstimados aqui - eles já foram carregados no loadProposta
      // O polling NÃO deve limpar os valores estimados
      
      // Buscar fornecedores inabilitados da seleção COM itens_afetados
      const { data: inabilitados, error: inabilitadosError } = await supabase
        .from("fornecedores_inabilitados_selecao")
        .select("fornecedor_id, itens_afetados")
        .eq("selecao_id", selecao.id)
        .eq("revertido", false);

      if (inabilitadosError) {
        console.error('Erro ao buscar inabilitados:', inabilitadosError);
      }
      
      console.log('loadLances: Dados retornados de inabilitados:', inabilitados);

      // Criar mapa de fornecedor -> itens inabilitados
      const inabilitacoesPorFornecedor = new Map<string, number[]>();
      (inabilitados || []).forEach((f: any) => {
        inabilitacoesPorFornecedor.set(String(f.fornecedor_id), f.itens_afetados || []);
      });
      
      // Manter set de IDs para compatibilidade
      const inabilitadosIds = new Set<string>(
        (inabilitados || []).map((f: any) => String(f.fornecedor_id))
      );
      
      // CRÍTICO: Só atualizar se houver mudança para evitar loops infinitos
      if (inabilitadosIds.size > 0 || fornecedoresInabilitados.size !== inabilitadosIds.size) {
        setFornecedoresInabilitados(inabilitadosIds);
      }
      
      console.log('loadLances: Fornecedores inabilitados (Set):', Array.from(inabilitadosIds), 'tamanho:', inabilitadosIds.size);

      // Recalcular menor valor das propostas excluindo fornecedores inabilitados (por item ou por lote)
      const { data: todasPropostas } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          id,
          fornecedor_id,
          selecao_respostas_itens_fornecedor (
            numero_item,
            descricao,
            quantidade,
            unidade,
            valor_unitario_ofertado,
            valor_total_item
          )
        `)
        .eq("selecao_id", selecao.id);

      const criterioJulgamento = selecao?.processos_compras?.criterio_julgamento;

      // por_lote: só recalcular quando o mapeamento de itens da cotação já foi carregado
      if (todasPropostas) {
        if (criterioJulgamento === "por_lote" && itensCotacao.length === 0) {
          console.warn("⚠️ por_lote: itensCotacao ainda não carregado; mantendo menorValorPropostas atual");
        } else {
          const mapaMelhorValor = calcularMenorValorDasPropostas(
            todasPropostas,
            criterioJulgamento,
            itensCotacao,
            inabilitacoesPorFornecedor
          );

          console.log('🏆 Melhor valor (polling):', Object.fromEntries(mapaMelhorValor));
          setMenorValorPropostas(mapaMelhorValor);
        }
      }

      const { data, error } = await supabase
        .from("lances_fornecedores")
        .select(`
          *,
          fornecedores (
            razao_social,
            cnpj
          )
        `)
        .eq("selecao_id", selecao.id)
        .order("valor_lance", { ascending: true })
        .order("data_hora_lance", { ascending: true });

      if (error) throw error;

      // Filtrar lances de fornecedores inabilitados - comparar como string
      const lancesFiltrados = (data || []).filter((lance: any) => {
        const isInabilitado = inabilitadosIds.has(String(lance.fornecedor_id));
        if (isInabilitado) {
          console.log('Excluindo lance de fornecedor inabilitado:', lance.fornecedor_id, 'item:', lance.numero_item, 'valor:', lance.valor_lance);
        }
        return !isInabilitado;
      });
      
      console.log('Total lances originais:', data?.length, 'Total após filtro:', lancesFiltrados.length);

      setLances(lancesFiltrados);
    } catch (error) {
      console.error("Erro ao carregar lances:", error);
    }
  };

  // Filtrar lances do item - usa lancesFiltrados que já exclui fornecedores inabilitados
  const getLancesDoItem = (numeroItem: number) => {
    return lancesFiltrados.filter(l => l.numero_item === numeroItem);
  };

  const getSubtotalPropostaDoLote = (numeroLote: number): number => {
    if (itensCotacao.length === 0) return 0;

    const esperados = itensCotacao.filter((ci) => ci.numero_lote === numeroLote);
    if (esperados.length === 0) return 0;

    let total = 0;
    let preenchidos = 0;

    itens.forEach((it) => {
      if (Number(it.valor_unitario_ofertado) > 0) {
        const lote = resolverNumeroLoteParaItem(it, itensCotacao);
        if (lote === numeroLote) {
          total += Number(it.valor_unitario_ofertado) * Number(it.quantidade);
          preenchidos += 1;
        }
      }
    });

    // Participação granular por lote: só considera válido se o lote estiver completo
    if (preenchidos !== esperados.length) return 0;

    return total;
  };

  const fornecedorApresentouPropostaNoItem = (numeroItem: number): boolean => {
    const criterio = selecao?.processos_compras?.criterio_julgamento;

    if (criterio === "por_lote") {
      return getSubtotalPropostaDoLote(numeroItem) > 0;
    }

    const itemProposta = itens.find((i) => i.numero_item === numeroItem);
    return !!itemProposta && itemProposta.valor_unitario_ofertado > 0;
  };

  const isFornecedorDesclassificadoNoItem = (numeroItem: number) => {
    const criterio = selecao?.processos_compras?.criterio_julgamento;

    const valorEstimado = itensEstimados.get(numeroItem);
    if (!valorEstimado || valorEstimado === 0) {
      return false;
    }

    if (criterio === "por_lote") {
      const subtotal = getSubtotalPropostaDoLote(numeroItem);
      if (!subtotal) return false;
      return subtotal > valorEstimado;
    }

    const itemProposta = itens.find((i) => i.numero_item === numeroItem);
    if (!itemProposta) {
      return false;
    }

    const isDesconto = criterio === "desconto";

    if (isDesconto) {
      // Para desconto: desclassifica se desconto ofertado for MENOR (<) que o estimado
      // Porque menor desconto = preço mais alto
      return itemProposta.valor_unitario_ofertado < valorEstimado;
    }

    // Para valor: desclassifica se valor ofertado for MAIOR (>) que o estimado
    return itemProposta.valor_unitario_ofertado > valorEstimado;
  };

  const isLanceDesclassificado = (numeroItem: number, valorLance: number) => {
    const valorEstimado = itensEstimados.get(numeroItem);
    if (!valorEstimado) return false;
    
    const isDesconto = selecao?.processos_compras?.criterio_julgamento === "desconto";
    
    if (isDesconto) {
      // Para desconto: desclassifica se desconto ofertado < estimado
      return valorLance < valorEstimado;
    } else {
      // Para valor: desclassifica se valor ofertado > estimado
      return valorLance > valorEstimado;
    }
  };

  const getValorMinimoAtual = (numeroItem: number) => {
    const valorEstimado = itensEstimados.get(numeroItem) || 0;
    const valorMenorProposta = menorValorPropostas.get(numeroItem) || 0;
    const isDesconto = selecao?.processos_compras?.criterio_julgamento === "desconto";
    
    // Usar lancesFiltrados (já filtrado pelo useMemo acima)
    const lancesDoItem = lancesFiltrados.filter(l => l.numero_item === numeroItem);
    
    if (isDesconto) {
      // Para desconto: pegar o MAIOR lance (maior desconto = melhor)
      // Filtrar lances >= estimado (classificados)
      const lancesClassificados = lancesDoItem.filter(l => l.valor_lance >= valorEstimado);
      
      if (lancesClassificados.length > 0) {
        // Retornar o MAIOR lance (maior desconto)
        const valoresOrdenados = lancesClassificados
          .map(l => l.valor_lance)
          .sort((a, b) => b - a); // Descendente
        
        return valoresOrdenados[0];
      }
      
      // Se não há lances, usar o maior valor das propostas
      if (valorMenorProposta > 0) {
        return valorMenorProposta;
      }
    } else {
      // Para valor: pegar o MENOR lance (menor valor = melhor)
      // Filtrar lances <= estimado (classificados)
      const lancesClassificados = lancesDoItem.filter(l => l.valor_lance <= valorEstimado);
      
      if (lancesClassificados.length > 0) {
        // Retornar o MENOR lance
        const valoresOrdenados = lancesClassificados
          .map(l => l.valor_lance)
          .sort((a, b) => a - b); // Ascendente
        
        return valoresOrdenados[0];
      }
      
      // Se não há lances, usar o menor valor das propostas
      if (valorMenorProposta > 0) {
        return valorMenorProposta;
      }
    }
    
    // Fallback para o valor estimado se não houver propostas nem lances
    return valorEstimado;
  };

  const handleEnviarLanceItem = async (numeroItem: number, isNegociacao: boolean = false) => {
    const valorLance = valoresLances.get(numeroItem) || "";
    
    if (!valorLance || !proposta || !selecao) {
      toast.error("Preencha o valor do lance");
      return;
    }

    const isDesconto = selecao?.processos_compras?.criterio_julgamento === "desconto";
    
    // Para desconto, o valor já está no formato correto (0.34)
    // Para moeda, precisa converter formato brasileiro (1.234,56) para numérico (1234.56)
    const valorNumerico = isDesconto
      ? parseFloat(valorLance)
      : parseFloat(valorLance.replace(/\./g, "").replace(",", "."));
    
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      toast.error("Valor do lance inválido");
      return;
    }

    // Verificar se fornecedor já enviou lance com mesmo valor para este item
    const lancesDoFornecedorNoItem = lancesFiltrados.filter(
      l => l.numero_item === numeroItem && l.fornecedor_id === proposta.fornecedor_id
    );
    const jaEnviouMesmoValor = lancesDoFornecedorNoItem.some(
      l => Math.abs(l.valor_lance - valorNumerico) < 0.001
    );
    if (jaEnviouMesmoValor) {
      toast.error("Você já enviou um lance com este valor. Informe um valor diferente.");
      return;
    }

    // Validações apenas para lances normais (não negociação)
    if (!isNegociacao) {
      const valorEstimado = itensEstimados.get(numeroItem) || 0;
      const isDesconto = selecao?.processos_compras?.criterio_julgamento === "desconto";
      
      if (isDesconto) {
        // Para desconto: desclassifica se desconto < estimado
        if (valorNumerico < valorEstimado) {
          toast.error(`Lance desclassificado! Desconto deve ser maior ou igual ao estimado: ${valorEstimado.toFixed(2).replace('.', ',')}%`);
          return;
        }
      } else {
        // Para valor: desclassifica se valor > estimado
        if (valorNumerico > valorEstimado) {
          toast.error(`Lance desclassificado! Valor deve ser menor ou igual ao estimado: R$ ${valorEstimado.toFixed(2).replace('.', ',')}`);
          return;
        }
      }

      const valorMinimoAtual = getValorMinimoAtual(numeroItem);
      
      if (isDesconto) {
        // Para desconto: lance deve ser MAIOR que o máximo atual
        if (valorNumerico <= valorMinimoAtual) {
          toast.error(`Seu lance deve ser maior que ${valorMinimoAtual.toFixed(2).replace('.', ',')}%`);
          return;
        }
      } else {
        // Para valor: lance deve ser MENOR que o mínimo atual
        if (valorNumerico >= valorMinimoAtual) {
          toast.error(`Seu lance deve ser menor que R$ ${valorMinimoAtual.toFixed(2).replace('.', ',')}`);
          return;
        }
      }
    } else {
      // Para negociação, validar conforme critério
      const valorMinimoAtual = getValorMinimoAtual(numeroItem);
      const isDesconto = selecao?.processos_compras?.criterio_julgamento === "desconto";
      
      if (isDesconto) {
        // Para desconto em negociação: valor deve ser MAIOR que o máximo atual
        if (valorNumerico <= valorMinimoAtual) {
          toast.error(`Valor de negociação deve ser maior que ${valorMinimoAtual.toFixed(2).replace('.', ',')}%`);
          return;
        }
      } else {
        // Para valor em negociação: valor deve ser MENOR que o mínimo atual
        if (valorNumerico >= valorMinimoAtual) {
          toast.error(`Valor de negociação deve ser menor que R$ ${valorMinimoAtual.toFixed(2).replace('.', ',')}`);
          return;
        }
      }
    }

    try {
      const tipoLance = isNegociacao ? 'negociacao' : 'lance';
      console.log("💾 INSERINDO LANCE - tipo_lance:", tipoLance, "| isNegociacao:", isNegociacao, "| numeroItem:", numeroItem);

      const { error } = await supabase
        .from("lances_fornecedores")
        .insert({
          selecao_id: selecao.id,
          fornecedor_id: proposta.fornecedor_id,
          numero_item: numeroItem,
          valor_lance: valorNumerico,
          tipo_lance: tipoLance
        });

      if (error) throw error;

      console.log("🔥 Lance inserido com sucesso. tipo_lance:", tipoLance);

      // Se for negociação, fechar a negociação automaticamente após enviar o lance
      if (isNegociacao && proposta.codigo_acesso) {
        console.log("📨 Fechando negociação após aceitar - Item:", numeroItem);
        
        // Usar função SECURITY DEFINER para fechar negociação via código de acesso
        const { data, error: fechamentoError } = await supabase.rpc('fechar_negociacao_fornecedor', {
          p_selecao_id: selecao.id,
          p_numero_item: numeroItem,
          p_fornecedor_id: proposta.fornecedor_id,
          p_codigo_acesso: proposta.codigo_acesso,
          p_foi_aceito: true // Indica que foi aceitação, não recusa
        });

        if (fechamentoError) {
          console.error("❌ Erro ao fechar negociação:", fechamentoError);
        } else {
          const result = data as { success: boolean; error?: string };
          if (result?.success) {
            console.log("✅ Negociação fechada com sucesso após aceitar");
          } else {
            console.error("❌ Falha ao fechar negociação:", result?.error);
          }
        }
      }

      const isPorLote = selecao?.processos_compras?.criterio_julgamento === "por_lote";
      const tipoLabel = isPorLote ? "Lote" : "Item";
      toast.success(isNegociacao 
        ? `Proposta de negociação enviada para o ${tipoLabel} ${numeroItem}!` 
        : `Lance enviado para o ${tipoLabel} ${numeroItem}!`
      );
      setValoresLances(prev => {
        const novo = new Map(prev);
        novo.delete(numeroItem);
        return novo;
      });
      setItemSelecionado(null);
      loadLances();
      loadItensAbertos();
    } catch (error) {
      console.error("Erro ao enviar lance:", error);
      toast.error("Erro ao enviar lance");
    }
  };

  const handleRecusarNegociacao = async (numeroItem: number) => {
    if (!selecao?.id || !proposta?.fornecedor_id || !proposta?.codigo_acesso) {
      toast.error("Erro ao recusar negociação");
      return;
    }

    try {
      // Usar função SECURITY DEFINER para fechar negociação via código de acesso
      const { data, error } = await supabase.rpc('fechar_negociacao_fornecedor', {
        p_selecao_id: selecao.id,
        p_numero_item: numeroItem,
        p_fornecedor_id: proposta.fornecedor_id,
        p_codigo_acesso: proposta.codigo_acesso,
        p_foi_aceito: false // Indica que foi recusa
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error || 'Erro ao fechar negociação');
      }

      const isPorLote = selecao?.processos_compras?.criterio_julgamento === "por_lote";
      toast.success(`Negociação do ${isPorLote ? "Lote" : "Item"} ${numeroItem} recusada e encerrada`);
      setItemSelecionado(null);
      loadItensAbertos();
    } catch (error) {
      console.error("Erro ao recusar negociação:", error);
      toast.error("Erro ao recusar negociação");
    }
  };
  
  const handleValorLanceChange = (numeroItem: number, valor: string) => {
    const isDesconto = selecao?.processos_compras?.criterio_julgamento === "desconto";
    
    if (isDesconto) {
      // Para desconto, remover tudo que não é número ou ponto decimal
      const numero = valor.replace(/[^\d.,]/g, '').replace(',', '.');
      setValoresLances(prev => {
        const novo = new Map(prev);
        novo.set(numeroItem, numero);
        return novo;
      });
    } else {
      const valorFormatado = formatarMoedaInput(valor.replace(/\D/g, ""));
      setValoresLances(prev => {
        const novo = new Map(prev);
        novo.set(numeroItem, valorFormatado);
        return novo;
      });
    }
  };

  const isItemEmNegociacaoParaMim = (numeroItem: number): boolean => {
    const fornecedorNegociacao = itensEmNegociacao.get(numeroItem);
    return fornecedorNegociacao === proposta?.fornecedor_id;
  };

  const isFornecedorVencendoItem = (numeroItem: number): boolean => {
    const itemAberto = itensAbertos.has(numeroItem);
    const itemFechado = itensFechados.has(numeroItem);

    if (!itemAberto && !itemFechado) return false;

    const criterio = selecao?.processos_compras?.criterio_julgamento;
    const isDesconto = criterio === "desconto";
    const isPorLote = criterio === "por_lote";

    const valorEstimado = itensEstimados.get(numeroItem) || 0;

    const lancesDoItem = lances.filter(
      (l) => l.numero_item === numeroItem && !fornecedoresInabilitados.has(l.fornecedor_id)
    );

    // Se há lances, verificar pelos lances
    if (lancesDoItem.length > 0) {
      const lancesClassificados = isDesconto
        ? lancesDoItem.filter((l) => l.valor_lance >= valorEstimado)
        : lancesDoItem.filter((l) => l.valor_lance <= valorEstimado);

      if (lancesClassificados.length === 0) return false;

      const lancesOrdenados = [...lancesClassificados].sort((a, b) => {
        if (isDesconto) {
          if (a.valor_lance !== b.valor_lance) return b.valor_lance - a.valor_lance;
        } else {
          if (a.valor_lance !== b.valor_lance) return a.valor_lance - b.valor_lance;
        }
        return new Date(a.data_hora_lance).getTime() - new Date(b.data_hora_lance).getTime();
      });

      const vencedor = lancesOrdenados[0];
      return vencedor?.fornecedor_id === proposta.fornecedor_id;
    }

    // Se NÃO há lances, verificar pela proposta inicial
    const melhorValorProposta = menorValorPropostas.get(numeroItem);

    if (isPorLote) {
      const meuSubtotal = getSubtotalPropostaDoLote(numeroItem);
      if (meuSubtotal > 0 && melhorValorProposta) {
        const isClassificado = meuSubtotal <= valorEstimado;
        return isClassificado && meuSubtotal === melhorValorProposta;
      }
      return false;
    }

    const itemProposta = itens.find((i) => i.numero_item === numeroItem);
    if (itemProposta && itemProposta.valor_unitario_ofertado > 0 && melhorValorProposta) {
      return itemProposta.valor_unitario_ofertado === melhorValorProposta;
    }

    return false;
  };

  // Verifica se o fornecedor venceu um item fechado
  const getItensVencidosPeloFornecedor = (): number[] => {
    if (!proposta?.fornecedor_id) return [];

    const itensVencidos: number[] = [];

    const criterio = selecao?.processos_compras?.criterio_julgamento;
    const isDesconto = criterio === "desconto";
    const isPorLote = criterio === "por_lote";

    itensFechados.forEach((numeroItem) => {
      const valorEstimado = itensEstimados.get(numeroItem) || 0;
      const lancesDoItem = getLancesDoItem(numeroItem);

      // Filtrar apenas lances classificados
      const lancesClassificados = isDesconto
        ? lancesDoItem.filter((l) => l.valor_lance >= valorEstimado) // Desconto: maior ou igual ao estimado
        : lancesDoItem.filter((l) => l.valor_lance <= valorEstimado); // Preço: menor ou igual ao estimado

      if (lancesClassificados.length > 0) {
        // Ordenar PRIORIZANDO lances de negociação
        const lancesOrdenados = [...lancesClassificados].sort((a, b) => {
          // PRIORIDADE 1: Lances de negociação vêm SEMPRE primeiro
          const aIsNegociacao = a.tipo_lance === "negociacao";
          const bIsNegociacao = b.tipo_lance === "negociacao";

          if (aIsNegociacao && !bIsNegociacao) return -1; // a vem antes
          if (!aIsNegociacao && bIsNegociacao) return 1; // b vem antes

          // PRIORIDADE 2: Ordenar por valor conforme critério
          if (isDesconto) {
            // Desconto: maior valor vence
            if (a.valor_lance !== b.valor_lance) return b.valor_lance - a.valor_lance;
          } else {
            // Preço: menor valor vence
            if (a.valor_lance !== b.valor_lance) return a.valor_lance - b.valor_lance;
          }

          // PRIORIDADE 3: Desempate por data (mais antigo ganha)
          return new Date(a.data_hora_lance).getTime() - new Date(b.data_hora_lance).getTime();
        });

        // Verificar se o lance vencedor é do fornecedor atual
        if (lancesOrdenados[0]?.fornecedor_id === proposta.fornecedor_id) {
          itensVencidos.push(numeroItem);
        }
      } else {
        // Se não há lances, verificar proposta inicial
        const melhorValor = menorValorPropostas.get(numeroItem); // Contém o melhor valor (maior desconto ou menor preço)

        if (isPorLote) {
          const meuSubtotal = getSubtotalPropostaDoLote(numeroItem);
          if (meuSubtotal > 0 && melhorValor) {
            const isClassificado = meuSubtotal <= valorEstimado;
            if (isClassificado && meuSubtotal === melhorValor) {
              itensVencidos.push(numeroItem);
            }
          }
        } else {
          const itemProposta = itens.find((i) => i.numero_item === numeroItem);
          if (itemProposta && itemProposta.valor_unitario_ofertado > 0 && melhorValor) {
            const valorOfertado = itemProposta.valor_unitario_ofertado;

            const isClassificado = isDesconto ? valorOfertado >= valorEstimado : valorOfertado <= valorEstimado;

            if (isClassificado && valorOfertado === melhorValor) {
              itensVencidos.push(numeroItem);
            }
          }
        }
      }
    });

    return itensVencidos.sort((a, b) => a - b);
  };

  const getValorVencedorItem = (numeroItem: number): number => {
    const valorEstimado = itensEstimados.get(numeroItem) || 0;
    const lancesDoItem = getLancesDoItem(numeroItem);
    const isDesconto = selecao?.processos_compras?.criterio_julgamento === "desconto";
    
    // Filtrar conforme critério
    const lancesClassificados = isDesconto
      ? lancesDoItem.filter(l => l.valor_lance >= valorEstimado)
      : lancesDoItem.filter(l => l.valor_lance <= valorEstimado);
    
    if (lancesClassificados.length > 0) {
      // Ordenar PRIORIZANDO lances de negociação
      const lancesOrdenados = [...lancesClassificados].sort((a, b) => {
        // PRIORIDADE 1: Lances de negociação vêm SEMPRE primeiro
        const aIsNegociacao = a.tipo_lance === "negociacao";
        const bIsNegociacao = b.tipo_lance === "negociacao";
        
        if (aIsNegociacao && !bIsNegociacao) return -1;
        if (!aIsNegociacao && bIsNegociacao) return 1;
        
        // PRIORIDADE 2: Ordenar por valor conforme critério
        if (isDesconto) {
          if (a.valor_lance !== b.valor_lance) return b.valor_lance - a.valor_lance;
        } else {
          if (a.valor_lance !== b.valor_lance) return a.valor_lance - b.valor_lance;
        }
        
        // PRIORIDADE 3: Desempate por data
        return new Date(a.data_hora_lance).getTime() - new Date(b.data_hora_lance).getTime();
      });
      return lancesOrdenados[0]?.valor_lance || 0;
    }
    
    return menorValorPropostas.get(numeroItem) || 0;
  };

  const handleUpdateItem = (itemId: string, field: string, value: any) => {
    console.log(`Atualizando item ${itemId}, campo ${field}, valor:`, value);
    setItens(prev => prev.map(item => {
      if (item.id === itemId) {
        const updated = { ...item, [field]: value };
        console.log('Item atualizado:', updated);
        return updated;
      }
      return item;
    }));
  };

  const handleSalvar = async () => {
    if (!editavel) {
      toast.error("O prazo para edição já expirou");
      return;
    }

    // Validar: se um item tem valor ou marca preenchido, o outro campo também deve ser preenchido
    const itensInvalidos = itens.filter(item => {
      const temValor = item.valor_unitario_ofertado && item.valor_unitario_ofertado > 0;
      const temMarca = item.marca && item.marca.trim() !== '';
      
      // Se preencheu um mas não o outro, é inválido
      return (temValor && !temMarca) || (!temValor && temMarca);
    });

    if (itensInvalidos.length > 0) {
      const mensagens = itensInvalidos.map(item => {
        const temValor = item.valor_unitario_ofertado && item.valor_unitario_ofertado > 0;
        const campo = temValor ? 'marca' : 'valor';
        return `Item ${item.numero_item}: ${campo} não preenchido`;
      });
      
      toast.error(
        <div>
          <p className="font-semibold">Para salvar, preencha ambos os campos (valor e marca) nos itens:</p>
          <ul className="list-disc pl-5 mt-2">
            {mensagens.map((msg, idx) => <li key={idx}>{msg}</li>)}
          </ul>
        </div>
      );
      return;
    }

    setSalvando(true);
    try {
      // Atualizar cada item usando função SECURITY DEFINER
      console.log("Salvando itens:", itens.map(i => ({ id: i.id, valor: i.valor_unitario_ofertado, marca: i.marca })));
      
      for (const item of itens) {
        console.log(`Atualizando item ${item.id}:`, {
          valor: item.valor_unitario_ofertado,
          marca: item.marca,
          total: item.valor_unitario_ofertado * item.quantidade
        });
        
        const { data, error } = await supabase.rpc('atualizar_item_proposta_selecao', {
          p_item_id: item.id,
          p_proposta_id: propostaId,
          p_valor_unitario: item.valor_unitario_ofertado,
          p_marca: item.marca || null,
          p_valor_total: item.valor_unitario_ofertado * item.quantidade
        });

        console.log(`Resultado item ${item.id}:`, data);
        if (error) throw error;
        const result = data as { success: boolean; error?: string } | null;
        if (result && !result.success) throw new Error(result.error || 'Erro desconhecido');
      }

      // Recalcular valor total da proposta e atualizar data de envio
      const valorTotal = itens.reduce((acc, item) => acc + (item.valor_unitario_ofertado * item.quantidade), 0);
      const novaDataEnvio = new Date().toISOString();
      console.log("Valor total calculado:", valorTotal);
      console.log("Nova data de envio:", novaDataEnvio);
      
      const { error: propostaError } = await supabase
        .from("selecao_propostas_fornecedor")
        .update({ 
          valor_total_proposta: valorTotal,
          data_envio_proposta: novaDataEnvio
        })
        .eq("id", propostaId);

      if (propostaError) throw propostaError;

      // Se já existe PDF gerado, regenerar automaticamente
      console.log("URL do PDF atual:", proposta?.url_pdf_proposta);
      
      if (proposta?.url_pdf_proposta) {
        toast.info("Atualizando PDF da proposta...");
        
        try {
          // Deletar PDF antigo do storage - o URL armazenado já é o path dentro do bucket
          const pathAntigo = proposta.url_pdf_proposta;
          console.log("Path antigo do PDF:", pathAntigo);
          
          const deleteResult = await supabase.storage
            .from("processo-anexos")
            .remove([pathAntigo]);
          console.log("Resultado da exclusão do PDF antigo:", deleteResult);

          // Gerar novo PDF com os dados atualizados
          const enderecoCompleto = proposta.fornecedores?.endereco_comercial || '';
          console.log("Gerando novo PDF...");
          
          // Preparar itens atualizados para passar diretamente
          const itensParaPDF = itens.map(item => ({
            numero_item: item.numero_item,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            marca: item.marca,
            valor_unitario_ofertado: item.valor_unitario_ofertado
          }));
          
          const resultado = await gerarPropostaSelecaoPDF(
            propostaId!,
            {
              razao_social: proposta.fornecedores?.razao_social || '',
              cnpj: proposta.fornecedores?.cnpj || '',
              email: proposta.email || '',
              logradouro: enderecoCompleto.split(',')[0]?.trim() || '',
              numero: enderecoCompleto.split('Nº ')[1]?.split(',')[0]?.trim() || '',
              bairro: enderecoCompleto.split(',')[2]?.trim() || '',
              municipio: enderecoCompleto.split(',')[3]?.split('/')[0]?.trim() || '',
              uf: enderecoCompleto.split('/')[1]?.split(',')[0]?.trim() || '',
              cep: enderecoCompleto.split('CEP: ')[1]?.trim() || ''
            },
            valorTotal,
            proposta.observacoes_fornecedor || null,
            selecao?.titulo_selecao || '',
            novaDataEnvio, // Usar a nova data de envio
            itensParaPDF, // Passar itens atualizados diretamente
            selecao?.processos_compras?.criterio_julgamento
          );

          console.log("Resultado da geração do PDF:", resultado);

          // Atualizar URL no banco
          if (resultado.url) {
            const updateResult = await supabase
              .from("selecao_propostas_fornecedor")
              .update({ url_pdf_proposta: resultado.url })
              .eq("id", propostaId);
            console.log("Resultado da atualização da URL:", updateResult);
          }

          toast.success("Proposta e PDF atualizados com sucesso!");
        } catch (pdfError) {
          console.error("Erro ao regenerar PDF:", pdfError);
          toast.warning("Proposta salva, mas houve erro ao atualizar o PDF");
        }
      } else {
        console.log("Nenhum PDF existente para atualizar");
        toast.success("Proposta atualizada com sucesso!");
      }

      await loadProposta();

    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar alterações");
    } finally {
      setSalvando(false);
    }
  };

  const formatarMoeda = (valor: number): string => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(valor);
  };

  const formatarMoedaInput = (valor: string): string => {
    // Remove tudo que não é número
    const numero = valor.replace(/\D/g, "");
    
    // Converte para número e divide por 100 para ter as casas decimais
    const valorNumerico = parseFloat(numero) / 100;
    
    // Formata como moeda
    return valorNumerico.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatCNPJ = (cnpj: string) => {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  const formatDateTime = (dateTime: string) => {
    return new Date(dateTime).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!proposta || !selecao) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Proposta não encontrada</CardTitle>
            <CardDescription>A proposta solicitada não existe ou você não tem acesso.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Usar fuso horário de Brasília (America/Sao_Paulo = UTC-3)
  // Verificar se data e hora estão definidos E válidos antes de criar o objeto Date
  let dataHoraSelecao: Date | null = null;
  let cincoMinutosAntes: Date | null = null;
  
  if (selecao.data_sessao_disputa && selecao.hora_sessao_disputa) {
    // Garantir formato HH:MM:SS sem duplicar segundos
    const horaFormatada = selecao.hora_sessao_disputa.split(':').length === 2 
      ? `${selecao.hora_sessao_disputa}:00` 
      : selecao.hora_sessao_disputa;
    const tentativaData = new Date(`${selecao.data_sessao_disputa}T${horaFormatada}-03:00`);
    // Verificar se a data é válida (não é NaN)
    if (!isNaN(tentativaData.getTime())) {
      dataHoraSelecao = tentativaData;
      cincoMinutosAntes = new Date(dataHoraSelecao.getTime() - 5 * 60 * 1000);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>

        {/* Alerta IMEDIATO de Inabilitação - Aparece assim que fornecedor é inabilitado */}
        {minhaInabilitacao && !minhaIntencaoRecurso && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                ⚠️ Você foi inabilitado nesta seleção
              </CardTitle>
              <CardDescription className="text-red-600">
                Motivo: {minhaInabilitacao.motivo_inabilitacao}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-red-50 p-3 rounded-lg space-y-2">
                <p className="text-sm text-red-700">
                  <strong>Itens afetados:</strong> {minhaInabilitacao.itens_afetados?.length > 0 
                    ? minhaInabilitacao.itens_afetados.join(", ") 
                    : "Todos os itens"}
                </p>
                <p className="text-sm text-red-700">
                  <strong>Data da inabilitação:</strong> {format(new Date(minhaInabilitacao.data_inabilitacao), "dd/MM/yyyy 'às' HH:mm")}
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded-lg">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  Deseja apresentar recurso contra esta inabilitação?
                </p>
                <p className="text-xs text-amber-700 mb-3">
                  Você pode recorrer da decisão. O gestor poderá dar provimento total (reabilitar todos os itens), 
                  provimento parcial (reabilitar alguns itens) ou negar provimento.
                </p>
                <div className="flex gap-3">
                  <Button 
                    onClick={() => setDialogIntencaoRecurso(true)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Sim, desejo recorrer
                  </Button>
                  <Button 
                    onClick={() => handleRegistrarIntencaoRecurso(false)}
                    variant="outline"
                    className="flex-1 border-amber-300"
                    disabled={enviandoIntencao}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Não desejo recorrer
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aviso de Intenção de Recurso (5 minutos após encerramento da habilitação) - PARA FORNECEDORES NÃO INABILITADOS */}
        {habilitacaoEncerrada && !minhaInabilitacao && !minhaIntencaoRecurso && tempoRestanteIntencao !== null && tempoRestanteIntencao > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-amber-700">
                <AlertCircle className="h-5 w-5" />
                Habilitação Encerrada - Deseja Recorrer?
              </CardTitle>
              <CardDescription className="text-amber-600">
                A fase de habilitação foi encerrada. Você tem {formatarTempoRestante(tempoRestanteIntencao)} para manifestar se deseja ou não recorrer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Tempo restante para manifestar intenção: {formatarTempoRestante(tempoRestanteIntencao)}
                </span>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  onClick={() => setDialogIntencaoRecurso(true)}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Sim, desejo recorrer
                </Button>
                <Button 
                  onClick={() => handleRegistrarIntencaoRecurso(false)}
                  variant="outline"
                  className="flex-1 border-amber-300"
                  disabled={enviandoIntencao}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Não desejo recorrer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aviso quando intenção já foi registrada (não quis recorrer) */}
        {minhaIntencaoRecurso && !minhaIntencaoRecurso.deseja_recorrer && (
          <Card className="border-muted bg-muted/30">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-5 w-5" />
                <span className="text-sm">Você optou por não recorrer da habilitação.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alerta de Inabilitação com Recurso - Apenas para inabilitados que manifestaram intenção */}
        {minhaInabilitacao && minhaIntencaoRecurso?.deseja_recorrer && meuRecurso && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                Você foi inabilitado nesta seleção
              </CardTitle>
              <CardDescription className="text-red-600">
                Motivo: {minhaInabilitacao.motivo_inabilitacao}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {meuRecurso.status_recurso === "aguardando_envio" && tempoRestanteRecurso !== null && tempoRestanteRecurso > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Tempo restante para manifestar recurso: {formatarTempoRestante(tempoRestanteRecurso)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="motivoRecurso">Razões do Recurso</Label>
                    <Textarea
                      id="motivoRecurso"
                      placeholder="Descreva detalhadamente as razões pelas quais você discorda da inabilitação..."
                      value={motivoRecurso}
                      onChange={(e) => setMotivoRecurso(e.target.value)}
                      rows={5}
                      className="resize-none"
                    />
                  </div>
                  
                  <Button 
                    onClick={handleEnviarRecurso}
                    disabled={enviandoRecurso || !motivoRecurso.trim()}
                    className="w-full"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {enviandoRecurso ? "Enviando..." : "Enviar Recurso"}
                  </Button>
                </div>
              ) : meuRecurso.status_recurso === "aguardando_envio" && (tempoRestanteRecurso === null || tempoRestanteRecurso <= 0) ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">Prazo para recurso expirado</p>
                  <p className="text-sm">O prazo de 1 dia útil para apresentar recurso expirou.</p>
                </div>
              ) : meuRecurso.status_recurso === "expirado" ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">Prazo para recurso expirado</p>
                  <p className="text-sm">O prazo de 1 dia útil para apresentar recurso expirou.</p>
                </div>
              ) : meuRecurso.status_recurso === "enviado" ? (
                <div className="space-y-3">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm font-medium text-blue-700 mb-1">Recurso Enviado</p>
                    <p className="text-sm text-blue-600">
                      Seu recurso foi enviado em {format(new Date(meuRecurso.data_envio_recurso), "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                    <p className="text-sm text-blue-600 mt-2">
                      Aguardando análise do gestor.
                    </p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Suas razões:</p>
                    <p className="text-sm whitespace-pre-wrap">{meuRecurso.motivo_recurso}</p>
                  </div>
                </div>
              ) : meuRecurso.status_recurso === "deferido" ? (
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-green-700 mb-1">✅ Recurso Deferido</p>
                  <p className="text-sm text-green-600">
                    Seu recurso foi aceito pelo gestor.
                  </p>
                  {meuRecurso.resposta_gestor && (
                    <div className="mt-2 pt-2 border-t border-green-200">
                      <p className="text-xs text-green-600 mb-1">Resposta do gestor:</p>
                      <p className="text-sm text-green-700 whitespace-pre-wrap">{meuRecurso.resposta_gestor}</p>
                    </div>
                  )}
                </div>
              ) : meuRecurso.status_recurso === "indeferido" ? (
                <div className="bg-red-50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-red-700 mb-1">❌ Recurso Indeferido</p>
                  <p className="text-sm text-red-600">
                    Seu recurso foi rejeitado pelo gestor.
                  </p>
                  {meuRecurso.resposta_gestor && (
                    <div className="mt-2 pt-2 border-t border-red-200">
                      <p className="text-xs text-red-600 mb-1">Resposta do gestor:</p>
                      <p className="text-sm text-red-700 whitespace-pre-wrap">{meuRecurso.resposta_gestor}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Card de Proposta Realinhada - Quando fornecedor assinou ata e é vencedor */}
        {assinouAta && ehVencedor && (
          <Card className="border-green-500/50 bg-green-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-green-700">
                <Trophy className="h-5 w-5" />
                {jaEnviouPropostaRealinhada ? "Proposta Realinhada Enviada" : "Parabéns! Você é vencedor nesta seleção"}
              </CardTitle>
              <CardDescription className="text-green-600">
                {jaEnviouPropostaRealinhada 
                  ? "Sua proposta realinhada já foi enviada com sucesso."
                  : "Agora você precisa enviar a proposta realinhada com os valores detalhados dos itens que ganhou."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => navigate(`/proposta-realinhada?selecao=${selecao?.id}&fornecedor=${proposta?.fornecedor_id}`)}
                className={jaEnviouPropostaRealinhada ? "bg-green-600 hover:bg-green-700" : ""}
              >
                <FileText className="mr-2 h-4 w-4" />
                {jaEnviouPropostaRealinhada ? "Ver Proposta Realinhada" : "Enviar Proposta Realinhada"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Aviso Compacto de Documentos Rejeitados */}
        {documentosRejeitados.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <FileX className="h-4 w-4 text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-700">
              <span className="font-medium">{documentosRejeitados.length} documento(s) rejeitado(s):</span>{" "}
              {documentosRejeitados.map(d => d.nome_campo).join(", ")}
            </span>
          </div>
        )}

        {/* Dialog de Intenção de Recurso (para informar motivo) */}
        <Dialog open={dialogIntencaoRecurso} onOpenChange={setDialogIntencaoRecurso}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Manifestar Intenção de Recorrer</DialogTitle>
              <DialogDescription>
                Por favor, informe o motivo pelo qual você deseja recorrer da decisão de habilitação.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="motivoIntencao">Motivo da Intenção de Recurso *</Label>
                <Textarea
                  id="motivoIntencao"
                  placeholder="Descreva brevemente o motivo da sua intenção de recorrer..."
                  value={motivoIntencao}
                  onChange={(e) => setMotivoIntencao(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setDialogIntencaoRecurso(false);
                  setMotivoIntencao("");
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={() => handleRegistrarIntencaoRecurso(true, motivoIntencao)}
                disabled={enviandoIntencao || !motivoIntencao.trim()}
              >
                {enviandoIntencao ? "Registrando..." : "Registrar Intenção"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Informações da Seleção */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              {selecao.titulo_selecao}
            </CardTitle>
            <CardDescription>
              Sessão de Disputa: {dataHoraSelecao ? format(dataHoraSelecao, "dd/MM/yyyy 'às' HH:mm") : "Data não definida"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Código de Acesso</Label>
                <p className="font-mono font-bold text-lg">{proposta.codigo_acesso}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Fornecedor</Label>
                <p className="font-semibold">{proposta.fornecedores.razao_social}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Status de Edição</Label>
                <div className="flex items-center gap-2">
                  {editavel ? (
                    <Badge variant="default" className="bg-green-500">
                      <Eye className="h-3 w-3 mr-1" />
                      Editável até {cincoMinutosAntes ? format(cincoMinutosAntes, "dd/MM/yyyy HH:mm") : "N/A"}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <Lock className="h-3 w-3 mr-1" />
                      Bloqueado para edição
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grid com Chat e Sistema de Lances */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat - 1/3 da largura */}
          <div className="lg:col-span-1">
            <ChatSelecao selecaoId={selecao.id} codigoAcesso={proposta?.codigo_acesso} />
          </div>

          {/* Sistema de Lances - 2/3 da largura */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="h-5 w-5" />
                  Sistema de Lances em Tempo Real
                </CardTitle>
                <CardDescription>
                  Acompanhe os lances e envie suas ofertas para os {selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "lotes abertos" : "itens abertos"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Grid de Itens com Lances Individuais */}
                {itensAbertos.size === 0 && itensEmNegociacao.size === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Lock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">Nenhum {selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "lote aberto" : "item aberto"} para lances</p>
                    <p className="text-xs mt-1">Aguarde o gestor abrir os {selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "lotes" : "itens"}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {Array.from(itensAbertos)
                      .sort((a, b) => a - b)
                      .slice(0, 10)
                      .map((numeroItem) => {
                      const tempoExpiracao = itensEmFechamento.get(numeroItem);
                      const emFechamento = tempoExpiracao !== undefined;
                      const segundosRestantes = emFechamento ? Math.max(0, Math.ceil((tempoExpiracao - Date.now()) / 1000)) : 0;
                      const emNegociacao = itensEmNegociacao.has(numeroItem);
                      const negociacaoParaMim = isItemEmNegociacaoParaMim(numeroItem);
                      
                      if (emNegociacao && !negociacaoParaMim) return null;
                      
                      const podeParticipar = fornecedorApresentouPropostaNoItem(numeroItem);
                      const desclassificado = isFornecedorDesclassificadoNoItem(numeroItem);
                      const valorLanceAtual = valoresLances.get(numeroItem) || "";
                      
                      return (
                        <div
                          key={numeroItem}
                          className={`border rounded-lg p-3 space-y-2 ${
                            emNegociacao && negociacaoParaMim 
                              ? 'border-amber-400 bg-amber-50' 
                              : emFechamento 
                                ? 'border-orange-400 bg-orange-50' 
                                : 'border-border bg-card'
                          }`}
                        >
                          {/* Header do Item */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {emNegociacao ? (
                                <Trophy className="h-3.5 w-3.5 text-amber-600" />
                              ) : (
                                <Unlock className="h-3.5 w-3.5 text-primary" />
                              )}
                              <span className="font-semibold text-sm">{selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "Lote" : "Item"} {numeroItem}</span>
                            </div>
                            {emFechamento && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-400 text-orange-600 bg-orange-100">
                                {segundosRestantes}s
                              </Badge>
                            )}
                            {emNegociacao && negociacaoParaMim && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 bg-amber-100">
                                Negociação
                              </Badge>
                            )}
                          </div>
                          
                          {/* Status de participação */}
                          {!podeParticipar ? (
                            <div className="text-center py-2 px-1 bg-muted/50 rounded text-[11px] text-muted-foreground">
                              Sem proposta neste {selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "lote" : "item"}
                            </div>
                          ) : desclassificado ? (
                            <div className="text-center py-2 px-1 bg-red-50 rounded space-y-1">
                              <Badge variant="destructive" className="text-[10px]">
                                Desclassificado
                              </Badge>
                              <p className="text-[10px] text-red-600">
                                Proposta acima do estimado
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {selecao?.processos_compras?.criterio_julgamento === "por_lote" ? (
                                  <>Seu subtotal: {formatarMoeda(getSubtotalPropostaDoLote(numeroItem))}</>
                                ) : (
                                  <>Sua proposta: {formatarMoeda(itens.find(i => i.numero_item === numeroItem)?.valor_unitario_ofertado || 0)}</>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Estimado: {formatarMoeda(itensEstimados.get(numeroItem) || 0)}
                              </p>
                            </div>
                          ) : (
                            <>
                              {/* Valores */}
                              <div className="space-y-1.5">
                                {/* Card Mínimo - fica verde quando vencendo */}
                                <div className={`rounded px-2 py-1.5 ${
                                  isFornecedorVencendoItem(numeroItem) 
                                    ? 'bg-green-50 border border-green-200' 
                                    : 'bg-blue-50'
                                }`}>
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <div className={`flex items-center gap-1 text-[10px] mb-0.5 ${
                                        isFornecedorVencendoItem(numeroItem) 
                                          ? 'text-green-600' 
                                          : 'text-blue-600'
                                      }`}>
                                        <TrendingDown className="h-3 w-3" />
                                        <span>{selecao?.processos_compras?.criterio_julgamento === "desconto" ? "Melhor Percentual" : "Mínimo"}</span>
                                      </div>
                                      <p className={`font-bold text-sm ${
                                        isFornecedorVencendoItem(numeroItem) 
                                          ? 'text-green-700' 
                                          : 'text-blue-700'
                                      }`}>
                                        {selecao?.processos_compras?.criterio_julgamento === "desconto" 
                                          ? `${getValorMinimoAtual(numeroItem).toFixed(2).replace('.', ',')}%`
                                          : formatarMoeda(getValorMinimoAtual(numeroItem))
                                        }
                                      </p>
                                    </div>
                                    {isFornecedorVencendoItem(numeroItem) && (
                                      <div className="flex flex-col items-center text-green-600">
                                        <Trophy className="h-4 w-4" />
                                        <span className="text-[8px] font-semibold">Vencendo!</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="bg-amber-50 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-1 text-[10px] text-amber-600 mb-0.5">
                                    <Trophy className="h-3 w-3" />
                                    <span>Estimado</span>
                                  </div>
                                  <p className="font-bold text-sm text-amber-700">
                                    {(() => {
                                      const valorEstimado = itensEstimados.get(numeroItem) || 0;
                                      const criterio = selecao?.processos_compras?.criterio_julgamento;
                                      return criterio === "desconto" 
                                        ? `${valorEstimado.toFixed(2).replace('.', ',')}%`
                                        : formatarMoeda(valorEstimado);
                                    })()}
                                  </p>
                                </div>
                              </div>
                              {/* Input de Lance */}
                              <div className="space-y-1.5">
                                <Input
                                  type="text"
                                  placeholder={selecao?.processos_compras?.criterio_julgamento === "desconto" ? "0,00%" : "R$ 0,00"}
                                  value={selecao?.processos_compras?.criterio_julgamento === "desconto" 
                                    ? (valorLanceAtual ? `${valorLanceAtual}%` : "")
                                    : (valorLanceAtual ? `R$ ${valorLanceAtual}` : "")
                                  }
                                  onChange={(e) => handleValorLanceChange(numeroItem, e.target.value)}
                                  className={`h-8 text-sm font-medium ${
                                    emNegociacao ? 'border-amber-300' : ''
                                  }`}
                                />
                                <Button 
                                  onClick={() => handleEnviarLanceItem(numeroItem, emNegociacao && negociacaoParaMim)} 
                                  size="sm"
                                  className={`w-full h-7 text-xs ${
                                    emNegociacao && negociacaoParaMim 
                                      ? 'bg-amber-600 hover:bg-amber-700' 
                                      : ''
                                  }`}
                                  disabled={!valorLanceAtual}
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  {emNegociacao && negociacaoParaMim ? 'Negociar' : 'Enviar'}
                                </Button>
                              </div>
                              
                              {/* Botões de Negociação (se aplicável) */}
                              {emNegociacao && negociacaoParaMim && (
                                <div className="space-y-1.5">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="w-full h-7 text-[10px] px-1"
                                    onClick={() => handleRecusarNegociacao(numeroItem)}
                                  >
                                    <X className="h-3 w-3 mr-0.5 flex-shrink-0" />
                                    Recusar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-7 text-[10px] border-amber-300 relative px-1"
                                    onClick={() => setItemSelecionado(numeroItem)}
                                  >
                                    <MessageSquare className="h-3 w-3 mr-0.5 flex-shrink-0" />
                                    Chat
                                    {(mensagensNaoLidas.get(numeroItem) || 0) > 0 && (
                                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                                        {mensagensNaoLidas.get(numeroItem)}
                                      </span>
                                    )}
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Chat de Negociação como Dialog */}
                {itemSelecionado !== null && isItemEmNegociacaoParaMim(itemSelecionado) && (
                  <ChatNegociacao
                    selecaoId={selecao.id}
                    numeroItem={itemSelecionado}
                    fornecedorId={proposta.fornecedor_id}
                    fornecedorNome={proposta.fornecedores?.razao_social || "Fornecedor"}
                    tituloSelecao={selecao.titulo_selecao}
                    isGestor={false}
                    codigoAcesso={proposta.codigo_acesso}
                    open={true}
                    onClose={() => setItemSelecionado(null)}
                  />
                )}

                {/* Seção de Itens Vencidos pelo Fornecedor */}
                {itensFechados.size > 0 && (
                  <div className="mt-6 pt-4 border-t">
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy className="h-5 w-5 text-green-600" />
                      <h3 className="font-semibold text-green-700">{selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "Lotes Fechados" : "Itens Fechados"} - Resultado</h3>
                    </div>
                    
                    {getItensVencidosPeloFornecedor().length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-green-600 mb-3">
                          Parabéns! Você venceu {getItensVencidosPeloFornecedor().length} {selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "lote(s)" : "item(ns)"}:
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {getItensVencidosPeloFornecedor().map((numeroItem) => {
                            const item = itens.find(i => i.numero_item === numeroItem);
                            const valorVencedor = getValorVencedorItem(numeroItem);
                            
                            return (
                              <div
                                key={numeroItem}
                                className="border-2 border-green-400 bg-green-50 rounded-lg p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Trophy className="h-3.5 w-3.5 text-green-600" />
                                    <span className="font-semibold text-sm text-green-700">{selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "Lote" : "Item"} {numeroItem}</span>
                                  </div>
                                  <Badge className="text-[10px] px-1.5 py-0 bg-green-600">
                                    Vencedor
                                  </Badge>
                                </div>
                                
                                <div className="text-xs text-muted-foreground line-clamp-2">
                                  {item?.descricao || ""}
                                </div>
                                
                                <div className="bg-green-100 rounded px-2 py-1.5">
                                  <div className="text-[10px] text-green-600 mb-0.5">
                                    {selecao?.processos_compras?.criterio_julgamento === "desconto" ? "Desconto Vencedor" : "Valor Vencedor"}
                                  </div>
                                  <p className="font-bold text-sm text-green-700">
                                    {selecao?.processos_compras?.criterio_julgamento === "desconto" 
                                      ? `${formatarMoeda(valorVencedor)}%`
                                      : formatarMoeda(valorVencedor)
                                    }
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {Array.from(itensFechados).sort((a, b) => a - b).map((numeroItem) => {
                          const item = itens.find(i => i.numero_item === numeroItem);
                          const valorVencedor = getValorVencedorItem(numeroItem);
                          
                          return (
                            <div
                              key={numeroItem}
                              className="border border-muted bg-muted/30 rounded-lg p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-semibold text-sm text-muted-foreground">{selecao?.processos_compras?.criterio_julgamento === "por_lote" ? "Lote" : "Item"} {numeroItem}</span>
                                </div>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  Fechado
                                </Badge>
                              </div>
                              
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {item?.descricao || ""}
                              </div>
                              
                              <div className="bg-muted/50 rounded px-2 py-1.5">
                                <div className="text-[10px] text-muted-foreground mb-0.5">
                                  {selecao?.processos_compras?.criterio_julgamento === "desconto" ? "Desconto Vencedor" : "Valor Vencedor"}
                                </div>
                                <p className="font-bold text-sm text-muted-foreground">
                                  {selecao?.processos_compras?.criterio_julgamento === "desconto" 
                                    ? `${formatarMoeda(valorVencedor)}%`
                                    : formatarMoeda(valorVencedor)
                                  }
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tabela de Itens */}
        <Card>
          <CardHeader>
            <CardTitle>Itens da Proposta</CardTitle>
            <CardDescription>
              {editavel 
                ? "Você pode editar os valores e marcas da proposta até 5 minutos antes da sessão de disputa"
                : "O prazo para edição da proposta expirou. Os valores abaixo são apenas para consulta. Os lances continuam disponíveis enquanto o gestor mantiver os itens abertos."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] text-center">Item</TableHead>
                    <TableHead className="w-[35%] text-center">Descrição</TableHead>
                    <TableHead className="w-[90px] text-center">Qtd</TableHead>
                    <TableHead className="w-[70px] text-center">Unid</TableHead>
                    {selecao?.processos_compras?.tipo === "material" && <TableHead className="w-[140px] text-center">Marca</TableHead>}
                    <TableHead className="w-[90px] text-right pr-4">
                      {selecao?.processos_compras?.criterio_julgamento === "desconto" ? "% Desconto" : "Valor Unitário"}
                    </TableHead>
                    {selecao?.processos_compras?.criterio_julgamento !== "desconto" && (
                      <TableHead className="w-[130px] text-center">Valor Total</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selecao?.processos_compras?.criterio_julgamento === "por_lote" ? (
                    (() => {
                      const showMarca = selecao?.processos_compras?.tipo === "material";
                      const isDesconto = selecao?.processos_compras?.criterio_julgamento === "desconto";
                      const colSpan = 4 + (showMarca ? 1 : 0) + 1 + (isDesconto ? 0 : 1);

                      const grupos = new Map<number, Item[]>();
                      const semLote: Item[] = [];

                      itens.forEach((it) => {
                        const lote = resolverNumeroLoteParaItem(it, itensCotacao);
                        if (!lote) {
                          semLote.push(it);
                          return;
                        }
                        const arr = grupos.get(lote) || [];
                        grupos.set(lote, [...arr, it]);
                      });

                      const lotesOrdenados = Array.from(grupos.keys()).sort((a, b) => a - b);

                      return (
                        <>
                          {lotesOrdenados.map((numeroLote) => {
                            const itensDoLote = (grupos.get(numeroLote) || []).slice().sort((a, b) => a.numero_item - b.numero_item);
                            return (
                              <React.Fragment key={`lote_${numeroLote}`}>
                                <TableRow>
                                  <TableCell colSpan={colSpan} className="bg-muted/30 font-semibold">
                                    Lote {numeroLote}
                                  </TableCell>
                                </TableRow>

                                {itensDoLote.map((item) => (
                                  <TableRow key={item.id}>
                                    <TableCell className="w-[50px] font-medium text-center">{item.numero_item}</TableCell>
                                    <TableCell className="w-[35%] text-left">{item.descricao}</TableCell>
                                    <TableCell className="w-[90px] text-center">{item.quantidade}</TableCell>
                                    <TableCell className="w-[70px] text-center">{item.unidade}</TableCell>
                                    {showMarca && (
                                      <TableCell className="w-[140px]">
                                        <Input
                                          value={item.marca || ""}
                                          onChange={(e) => handleUpdateItem(item.id, "marca", e.target.value)}
                                          disabled={!editavel}
                                          className="w-full"
                                        />
                                      </TableCell>
                                    )}
                                    <TableCell className="w-[90px] text-right pr-4">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.valor_unitario_ofertado ? item.valor_unitario_ofertado.toFixed(2) : ""}
                                        onChange={(e) =>
                                          handleUpdateItem(item.id, "valor_unitario_ofertado", parseFloat(e.target.value) || 0)
                                        }
                                        disabled={!editavel}
                                        className="w-full"
                                      />
                                    </TableCell>
                                    <TableCell className="w-[130px] font-semibold text-center">
                                      {formatarMoeda(item.valor_unitario_ofertado * item.quantidade)}
                                    </TableCell>
                                  </TableRow>
                                ))}

                                <TableRow>
                                  <TableCell colSpan={colSpan} className="text-right text-sm text-muted-foreground">
                                    Subtotal do Lote {numeroLote}: <span className="font-semibold text-foreground">{formatarMoeda(getSubtotalPropostaDoLote(numeroLote))}</span>
                                  </TableCell>
                                </TableRow>
                              </React.Fragment>
                            );
                          })}

                          {semLote.length > 0 && (
                            <>
                              <TableRow>
                                <TableCell colSpan={colSpan} className="bg-muted/30 font-semibold">
                                  Itens sem lote identificado
                                </TableCell>
                              </TableRow>
                              {semLote.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell className="w-[50px] font-medium text-center">{item.numero_item}</TableCell>
                                  <TableCell className="w-[35%] text-left">{item.descricao}</TableCell>
                                  <TableCell className="w-[90px] text-center">{item.quantidade}</TableCell>
                                  <TableCell className="w-[70px] text-center">{item.unidade}</TableCell>
                                  {showMarca && (
                                    <TableCell className="w-[140px]">
                                      <Input
                                        value={item.marca || ""}
                                        onChange={(e) => handleUpdateItem(item.id, "marca", e.target.value)}
                                        disabled={!editavel}
                                        className="w-full"
                                      />
                                    </TableCell>
                                  )}
                                  <TableCell className="w-[90px] text-right pr-4">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={item.valor_unitario_ofertado ? item.valor_unitario_ofertado.toFixed(2) : ""}
                                      onChange={(e) =>
                                        handleUpdateItem(item.id, "valor_unitario_ofertado", parseFloat(e.target.value) || 0)
                                      }
                                      disabled={!editavel}
                                      className="w-full"
                                    />
                                  </TableCell>
                                  <TableCell className="w-[130px] font-semibold text-center">
                                    {formatarMoeda(item.valor_unitario_ofertado * item.quantidade)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    itens.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="w-[50px] font-medium text-center">{item.numero_item}</TableCell>
                        <TableCell className="w-[35%] text-left">{item.descricao}</TableCell>
                        <TableCell className="w-[90px] text-center">{item.quantidade}</TableCell>
                        <TableCell className="w-[70px] text-center">{item.unidade}</TableCell>
                        {selecao?.processos_compras?.tipo === "material" && (
                          <TableCell className="w-[140px]">
                            <Input
                              value={item.marca || ""}
                              onChange={(e) => handleUpdateItem(item.id, "marca", e.target.value)}
                              disabled={!editavel}
                              className="w-full"
                            />
                          </TableCell>
                        )}
                        <TableCell className="w-[90px] text-right pr-4">
                          {selecao?.processos_compras?.criterio_julgamento === "desconto" ? (
                            <div className="flex items-center justify-end gap-1">
                              {editavel ? (
                                <>
                                  <Input
                                    type="text"
                                    value={
                                      valoresDescontoTemp.get(item.id) ??
                                      (item.valor_unitario_ofertado ? item.valor_unitario_ofertado.toFixed(2).replace('.', ',') : "")
                                    }
                                    onChange={(e) => {
                                      setValoresDescontoTemp((prev) => {
                                        const novo = new Map(prev);
                                        novo.set(item.id, e.target.value);
                                        return novo;
                                      });
                                    }}
                                    onBlur={(e) => {
                                      const valor = e.target.value.replace(',', '.');
                                      const numero = parseFloat(valor);
                                      if (!isNaN(numero) && numero >= 0) {
                                        handleUpdateItem(item.id, "valor_unitario_ofertado", numero);
                                      } else if (e.target.value === '' || e.target.value === '0') {
                                        handleUpdateItem(item.id, "valor_unitario_ofertado", 0);
                                      }
                                      setValoresDescontoTemp((prev) => {
                                        const novo = new Map(prev);
                                        novo.delete(item.id);
                                        return novo;
                                      });
                                    }}
                                    className="w-16 text-right"
                                    placeholder="0,00"
                                  />
                                  <span className="text-sm font-medium whitespace-nowrap">%</span>
                                </>
                              ) : (
                                <span className="text-sm font-medium">
                                  {item.valor_unitario_ofertado && item.valor_unitario_ofertado > 0
                                    ? `${item.valor_unitario_ofertado.toFixed(2).replace('.', ',')}%`
                                    : "-"}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.valor_unitario_ofertado ? item.valor_unitario_ofertado.toFixed(2) : ""}
                              onChange={(e) => handleUpdateItem(item.id, "valor_unitario_ofertado", parseFloat(e.target.value) || 0)}
                              disabled={!editavel}
                              className="w-full"
                            />
                          )}
                        </TableCell>
                        {selecao?.processos_compras?.criterio_julgamento !== "desconto" && (
                          <TableCell className="w-[130px] font-semibold text-center">
                            {formatarMoeda(item.valor_unitario_ofertado * item.quantidade)}
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              {selecao?.processos_compras?.criterio_julgamento !== "desconto" && (
                <div>
                  <Label className="text-sm text-muted-foreground">Valor Total da Proposta</Label>
                  <p className="text-2xl font-bold text-primary">
                    {formatarMoeda(itens.reduce((acc, item) => acc + (item.valor_unitario_ofertado * item.quantidade), 0))}
                  </p>
                </div>
              )}
              
              {editavel && (
                <Button 
                  onClick={handleSalvar} 
                  disabled={salvando}
                  size="lg"
                  className={selecao?.processos_compras?.criterio_julgamento === "desconto" ? "ml-auto" : ""}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {salvando ? "Salvando..." : "Salvar Alterações"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SistemaLancesFornecedor;
