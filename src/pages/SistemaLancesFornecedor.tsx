import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock, Save, Eye, Gavel, Trophy, Unlock, Send, TrendingDown, MessageSquare } from "lucide-react";
import { ChatNegociacao } from "@/components/selecoes/ChatNegociacao";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChatSelecao } from "@/components/selecoes/ChatSelecao";
import { gerarPropostaSelecaoPDF } from "@/lib/gerarPropostaSelecaoPDF";

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

const SistemaLancesFornecedor = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const propostaId = searchParams.get("proposta");

  const [loading, setLoading] = useState(true);
  const [proposta, setProposta] = useState<any>(null);
  const [selecao, setSelecao] = useState<any>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [editavel, setEditavel] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [itensAbertos, setItensAbertos] = useState<Set<number>>(new Set());
  const [lances, setLances] = useState<any[]>([]);
  const [valoresLances, setValoresLances] = useState<Map<number, string>>(new Map()); // Map<numeroItem, valorDigitado>
  const [itemSelecionado, setItemSelecionado] = useState<number | null>(null);
  const [itensEstimados, setItensEstimados] = useState<Map<number, number>>(new Map());
  const [menorValorPropostas, setMenorValorPropostas] = useState<Map<number, number>>(new Map());
  const [itensEmFechamento, setItensEmFechamento] = useState<Map<number, number>>(new Map());
  const [itensEmNegociacao, setItensEmNegociacao] = useState<Map<number, string>>(new Map());
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState<Map<number, number>>(new Map());
  const [observacao, setObservacao] = useState("");
  const [enviandoLance, setEnviandoLance] = useState(false);

  useEffect(() => {
    if (propostaId) {
      loadProposta();
    }
  }, [propostaId]);

  useEffect(() => {
    if (selecao?.id && proposta?.fornecedor_id) {
      loadItensAbertos();
      loadLances();
      loadMensagensNaoLidas();

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

      // Polling como fallback a cada 3 segundos para garantir sincronização de itens e lances
      const pollingInterval = setInterval(() => {
        loadItensAbertos();
        loadLances();
      }, 3000);

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(channelItens);
        supabase.removeChannel(channelMensagens);
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

  // Atualizar countdown visual a cada 100ms para suavidade
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
          selecoes_fornecedores(*)
        `)
        .eq("id", propostaId)
        .single();

      if (propostaError) throw propostaError;
      
      setProposta(propostaData);
      setSelecao(propostaData.selecoes_fornecedores);

      // Buscar valores estimados da PLANILHA CONSOLIDADA mais recente
      if (propostaData.selecoes_fornecedores.cotacao_relacionada_id) {
        const { data: planilhaData, error: planilhaError } = await supabase
          .from("planilhas_consolidadas")
          .select("fornecedores_incluidos")
          .eq("cotacao_id", propostaData.selecoes_fornecedores.cotacao_relacionada_id)
          .order("data_geracao", { ascending: false })
          .limit(1)
          .single();

        if (!planilhaError && planilhaData?.fornecedores_incluidos) {
          const mapaEstimados = new Map<number, number>();
          
          // Extrair valores estimados (menores valores = vencedores) de cada item da planilha
          const fornecedores = planilhaData.fornecedores_incluidos as any[];
          fornecedores.forEach((fornecedor: any) => {
            if (fornecedor.itens) {
              fornecedor.itens.forEach((item: any) => {
                const valorAtual = mapaEstimados.get(item.numero_item);
                // Pegar apenas os valores dos itens vencedores OU o menor valor
                if (!valorAtual || item.valor_unitario < valorAtual) {
                  mapaEstimados.set(item.numero_item, item.valor_unitario);
                }
              });
            }
          });

          console.log('Valores estimados da planilha consolidada:', Object.fromEntries(mapaEstimados));
          setItensEstimados(mapaEstimados);
        }
      }

      // Buscar o menor valor de cada item das propostas de TODOS os fornecedores da seleção
      const { data: todasPropostas, error: propostasError } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          id,
          selecao_respostas_itens_fornecedor (
            numero_item,
            valor_unitario_ofertado
          )
        `)
        .eq("selecao_id", propostaData.selecoes_fornecedores.id);

      if (!propostasError && todasPropostas) {
        const mapaMenorValor = new Map<number, number>();
        
        todasPropostas.forEach((prop: any) => {
          if (prop.selecao_respostas_itens_fornecedor) {
            prop.selecao_respostas_itens_fornecedor.forEach((item: any) => {
              if (item.valor_unitario_ofertado > 0) {
                const valorAtual = mapaMenorValor.get(item.numero_item);
                if (!valorAtual || item.valor_unitario_ofertado < valorAtual) {
                  mapaMenorValor.set(item.numero_item, item.valor_unitario_ofertado);
                }
              }
            });
          }
        });

        console.log('Menor valor das propostas por item:', Object.fromEntries(mapaMenorValor));
        setMenorValorPropostas(mapaMenorValor);
      }

      // Verificar se ainda é editável (5 minutos antes da sessão)
      const dataHoraSelecao = new Date(`${propostaData.selecoes_fornecedores.data_sessao_disputa}T${propostaData.selecoes_fornecedores.hora_sessao_disputa}`);
      const cincoMinutosAntes = new Date(dataHoraSelecao.getTime() - 5 * 60 * 1000);
      const agora = new Date();
      
      setEditavel(agora < cincoMinutosAntes);

      // Carregar itens da proposta
      const { data: itensData, error: itensError } = await supabase
        .from("selecao_respostas_itens_fornecedor")
        .select("*")
        .eq("proposta_id", propostaId)
        .order("numero_item");

      if (itensError) throw itensError;
      
      // Mapear os dados para o formato correto
      const itensMapeados = (itensData || []).map(item => ({
        ...item,
        marca_ofertada: item.marca || ""
      }));
      
      setItens(itensMapeados);

    } catch (error) {
      console.error("Erro ao carregar proposta:", error);
      toast.error("Erro ao carregar proposta");
      navigate("/");
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
      
      console.log("Itens abertos carregados:", Array.from(abertos));
      setItensAbertos(abertos);

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
    if (!selecao?.id) return;

    try {
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

      setLances(data || []);
    } catch (error) {
      console.error("Erro ao carregar lances:", error);
    }
  };

  const getLancesDoItem = (numeroItem: number) => {
    return lances.filter(l => l.numero_item === numeroItem);
  };

  const fornecedorApresentouPropostaNoItem = (numeroItem: number): boolean => {
    const itemProposta = itens.find(i => i.numero_item === numeroItem);
    return !!itemProposta && itemProposta.valor_unitario_ofertado > 0;
  };

  const isFornecedorDesclassificadoNoItem = (numeroItem: number) => {
    const itemProposta = itens.find(i => i.numero_item === numeroItem);
    if (!itemProposta) {
      return false;
    }
    
    const valorEstimado = itensEstimados.get(numeroItem);
    if (!valorEstimado || valorEstimado === 0) {
      return false;
    }
    
    // Desclassifica APENAS se o valor ofertado for MAIOR (>) que o estimado
    // Valores iguais (=) ou menores (<) são CLASSIFICADOS
    return itemProposta.valor_unitario_ofertado > valorEstimado;
  };

  const isLanceDesclassificado = (numeroItem: number, valorLance: number) => {
    const valorEstimado = itensEstimados.get(numeroItem);
    if (!valorEstimado) return false;
    return valorLance > valorEstimado;
  };

  const getValorMinimoAtual = (numeroItem: number) => {
    const valorEstimado = itensEstimados.get(numeroItem) || 0;
    const valorMenorProposta = menorValorPropostas.get(numeroItem) || 0;
    const lancesDoItem = getLancesDoItem(numeroItem);
    
    // Filtrar apenas lances classificados (menores ou iguais ao estimado)
    const lancesClassificados = lancesDoItem.filter(l => l.valor_lance <= valorEstimado);
    
    if (lancesClassificados.length > 0) {
      // Retornar o menor lance classificado
      const valoresOrdenados = lancesClassificados
        .map(l => l.valor_lance)
        .sort((a, b) => a - b);
      
      return valoresOrdenados[0];
    }
    
    // Se não há lances, usar o menor valor das propostas dos fornecedores
    if (valorMenorProposta > 0) {
      return valorMenorProposta;
    }
    
    // Fallback para o valor estimado se não houver propostas
    return valorEstimado;
  };

  const handleEnviarLanceItem = async (numeroItem: number, isNegociacao: boolean = false) => {
    const valorLance = valoresLances.get(numeroItem) || "";
    
    if (!valorLance || !proposta || !selecao) {
      toast.error("Preencha o valor do lance");
      return;
    }

    const valorNumerico = parseFloat(valorLance.replace(/\./g, "").replace(",", "."));
    
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      toast.error("Valor do lance inválido");
      return;
    }

    // Validações apenas para lances normais (não negociação)
    if (!isNegociacao) {
      const valorEstimado = itensEstimados.get(numeroItem) || 0;
      if (valorNumerico > valorEstimado) {
        toast.error(`Lance desclassificado! Valor deve ser menor ou igual ao estimado: R$ ${valorEstimado.toFixed(2).replace('.', ',')}`);
        return;
      }

      const valorMinimoAtual = getValorMinimoAtual(numeroItem);
      if (valorNumerico >= valorMinimoAtual) {
        toast.error(`Seu lance deve ser menor que R$ ${valorMinimoAtual.toFixed(2).replace('.', ',')}`);
        return;
      }
    } else {
      // Para negociação, o valor deve ser menor que o lance vencedor atual
      const valorMinimoAtual = getValorMinimoAtual(numeroItem);
      if (valorNumerico >= valorMinimoAtual) {
        toast.error(`Valor de negociação deve ser menor que R$ ${valorMinimoAtual.toFixed(2).replace('.', ',')}`);
        return;
      }
    }

    try {
      const { error } = await supabase
        .from("lances_fornecedores")
        .insert({
          selecao_id: selecao.id,
          fornecedor_id: proposta.fornecedor_id,
          numero_item: numeroItem,
          valor_lance: valorNumerico,
          tipo_lance: isNegociacao ? 'negociacao' : 'lance'
        });

      if (error) throw error;

      toast.success(isNegociacao 
        ? `Proposta de negociação enviada para o Item ${numeroItem}!` 
        : `Lance enviado para o Item ${numeroItem}!`
      );
      setValoresLances(prev => {
        const novo = new Map(prev);
        novo.delete(numeroItem);
        return novo;
      });
      loadLances();
    } catch (error) {
      console.error("Erro ao enviar lance:", error);
      toast.error("Erro ao enviar lance");
    }
  };
  
  const handleValorLanceChange = (numeroItem: number, valor: string) => {
    const valorFormatado = formatarMoedaInput(valor.replace(/\D/g, ""));
    setValoresLances(prev => {
      const novo = new Map(prev);
      novo.set(numeroItem, valorFormatado);
      return novo;
    });
  };

  const isItemEmNegociacaoParaMim = (numeroItem: number): boolean => {
    const fornecedorNegociacao = itensEmNegociacao.get(numeroItem);
    return fornecedorNegociacao === proposta?.fornecedor_id;
  };

  const isFornecedorVencendoItem = (numeroItem: number): boolean => {
    if (!proposta?.fornecedor_id) return false;
    
    const valorEstimado = itensEstimados.get(numeroItem) || 0;
    const lancesDoItem = getLancesDoItem(numeroItem);
    
    // Filtrar apenas lances classificados (menores ou iguais ao estimado)
    const lancesClassificados = lancesDoItem.filter(l => l.valor_lance <= valorEstimado);
    
    if (lancesClassificados.length === 0) return false;
    
    // Ordenar por menor valor e desempate por data (mais antigo ganha)
    const lancesOrdenados = [...lancesClassificados].sort((a, b) => {
      if (a.valor_lance !== b.valor_lance) return a.valor_lance - b.valor_lance;
      return new Date(a.data_hora_lance).getTime() - new Date(b.data_hora_lance).getTime();
    });
    
    // Verificar se o lance vencedor é do fornecedor atual
    return lancesOrdenados[0]?.fornecedor_id === proposta.fornecedor_id;
  };

  const handleUpdateItem = (itemId: string, field: string, value: any) => {
    setItens(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleSalvar = async () => {
    if (!editavel) {
      toast.error("O prazo para edição já expirou");
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
            itensParaPDF // Passar itens atualizados diretamente
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

  const dataHoraSelecao = new Date(`${selecao.data_sessao_disputa}T${selecao.hora_sessao_disputa}`);
  const cincoMinutosAntes = new Date(dataHoraSelecao.getTime() - 5 * 60 * 1000);

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

        {/* Informações da Seleção */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              {selecao.titulo_selecao}
            </CardTitle>
            <CardDescription>
              Sessão de Disputa: {format(dataHoraSelecao, "dd/MM/yyyy 'às' HH:mm")}
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
                      Editável até {format(cincoMinutosAntes, "dd/MM/yyyy HH:mm")}
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
                  Acompanhe os lances e envie suas ofertas para os itens abertos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Grid de Itens com Lances Individuais */}
                {itensAbertos.size === 0 && itensEmNegociacao.size === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Lock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">Nenhum item aberto para lances</p>
                    <p className="text-xs mt-1">Aguarde o gestor abrir os itens</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {Array.from(itensAbertos).sort((a, b) => a - b).slice(0, 10).map((numeroItem) => {
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
                              <span className="font-semibold text-sm">Item {numeroItem}</span>
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
                              Sem proposta neste item
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
                                Sua proposta: {formatarMoeda(itens.find(i => i.numero_item === numeroItem)?.valor_unitario_ofertado || 0)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Estimado: {formatarMoeda(itensEstimados.get(numeroItem) || 0)}
                              </p>
                            </div>
                          ) : (
                            <>
                              {/* Valores */}
                              <div className="space-y-1.5">
                                <div className="bg-blue-50 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-1 text-[10px] text-blue-600 mb-0.5">
                                    <TrendingDown className="h-3 w-3" />
                                    <span>Mínimo</span>
                                  </div>
                                  <p className="font-bold text-sm text-blue-700">
                                    {formatarMoeda(getValorMinimoAtual(numeroItem))}
                                  </p>
                                </div>
                                
                                <div className="bg-amber-50 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-1 text-[10px] text-amber-600 mb-0.5">
                                    <Trophy className="h-3 w-3" />
                                    <span>Estimado</span>
                                  </div>
                                  <p className="font-bold text-sm text-amber-700">
                                    {formatarMoeda(itensEstimados.get(numeroItem) || 0)}
                                  </p>
                                </div>
                                
                                {/* Indicador de Liderança */}
                                {isFornecedorVencendoItem(numeroItem) && (
                                  <div className="bg-green-100 border border-green-300 rounded px-2 py-1.5 flex items-center justify-center gap-1.5">
                                    <Trophy className="h-4 w-4 text-green-600" />
                                    <span className="text-xs font-semibold text-green-700">Você está vencendo!</span>
                                  </div>
                                )}
                              </div>
                              {/* Input de Lance */}
                              <div className="space-y-1.5">
                                <Input
                                  type="text"
                                  placeholder="R$ 0,00"
                                  value={valorLanceAtual ? `R$ ${valorLanceAtual}` : ""}
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
                              
                              {/* Chat de Negociação (se aplicável) */}
                              {emNegociacao && negociacaoParaMim && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-7 text-xs border-amber-300 relative"
                                  onClick={() => setItemSelecionado(numeroItem)}
                                >
                                  <MessageSquare className="h-3 w-3 mr-1" />
                                  Abrir Chat
                                  {(mensagensNaoLidas.get(numeroItem) || 0) > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                                      {mensagensNaoLidas.get(numeroItem)}
                                    </span>
                                  )}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Chat de Negociação Expandido */}
                {itemSelecionado !== null && isItemEmNegociacaoParaMim(itemSelecionado) && (
                  <div className="border-2 border-amber-300 rounded-lg p-4 bg-amber-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-amber-600" />
                        <Label className="font-semibold text-amber-900">Chat de Negociação - Item {itemSelecionado}</Label>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setItemSelecionado(null)}
                        className="h-6 px-2 text-xs"
                      >
                        Fechar
                      </Button>
                    </div>
                    <div className="h-64">
                      <ChatNegociacao
                        selecaoId={selecao.id}
                        numeroItem={itemSelecionado}
                        fornecedorId={proposta.fornecedor_id}
                        fornecedorNome={proposta.fornecedores?.razao_social || "Fornecedor"}
                        tituloSelecao={selecao.titulo_selecao}
                        isGestor={false}
                        codigoAcesso={proposta.codigo_acesso}
                      />
                    </div>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Item</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24">Qtd</TableHead>
                    <TableHead className="w-24">Unidade</TableHead>
                    <TableHead className="w-40">Marca</TableHead>
                    <TableHead className="w-40">Valor Unitário</TableHead>
                    <TableHead className="w-40">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.numero_item}</TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell>{item.quantidade}</TableCell>
                      <TableCell>{item.unidade}</TableCell>
                      <TableCell>
                        <Input
                          value={item.marca_ofertada || ""}
                          onChange={(e) => handleUpdateItem(item.id, "marca_ofertada", e.target.value)}
                          disabled={!editavel}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.valor_unitario_ofertado ? item.valor_unitario_ofertado.toFixed(2) : ""}
                          onChange={(e) => handleUpdateItem(item.id, "valor_unitario_ofertado", parseFloat(e.target.value) || 0)}
                          disabled={!editavel}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatarMoeda(item.valor_unitario_ofertado * item.quantidade)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <div>
                <Label className="text-sm text-muted-foreground">Valor Total da Proposta</Label>
                <p className="text-2xl font-bold text-primary">
                  {formatarMoeda(itens.reduce((acc, item) => acc + (item.valor_unitario_ofertado * item.quantidade), 0))}
                </p>
              </div>
              
              {editavel && (
                <Button 
                  onClick={handleSalvar} 
                  disabled={salvando}
                  size="lg"
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
