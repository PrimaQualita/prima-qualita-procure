import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock, Save, Eye, Gavel, Trophy, Unlock, Send, TrendingDown } from "lucide-react";
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
  const [valorLance, setValorLance] = useState<string>("");
  const [itemSelecionado, setItemSelecionado] = useState<number | null>(null);
  const [itensEstimados, setItensEstimados] = useState<Map<number, number>>(new Map());
  const [menorValorPropostas, setMenorValorPropostas] = useState<Map<number, number>>(new Map()); // Menor valor ofertado por item das propostas
  const [itensEmFechamento, setItensEmFechamento] = useState<Map<number, number>>(new Map()); // Map<numeroItem, tempoExpiracao>
  const [itensEmNegociacao, setItensEmNegociacao] = useState<Map<number, string>>(new Map()); // Map<numeroItem, fornecedorId>
  const [observacao, setObservacao] = useState("");
  const [enviandoLance, setEnviandoLance] = useState(false);

  useEffect(() => {
    if (propostaId) {
      loadProposta();
    }
  }, [propostaId]);

  useEffect(() => {
    if (selecao?.id) {
      loadItensAbertos();
      loadLances();

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

      // Polling como fallback a cada 3 segundos para garantir sincronização de itens e lances
      const pollingInterval = setInterval(() => {
        loadItensAbertos();
        loadLances(); // Também atualiza lances para garantir valor mínimo atualizado
      }, 3000);

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(channelItens);
        clearInterval(pollingInterval);
      };
    }
  }, [selecao?.id]);

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
      // Buscar TODOS os registros de itens para esta seleção (abertos + em negociação)
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select("*")
        .eq("selecao_id", selecao.id);

      if (error) throw error;

      // Itens abertos incluem os normais e os em negociação
      const abertos = new Set(data?.filter((item: any) => item.aberto).map((item: any) => item.numero_item) || []);
      setItensAbertos(abertos);

      // Mapear itens em fechamento com timestamp de expiração
      const emFechamento = new Map<number, number>();
      const emNegociacao = new Map<number, string>();
      const now = Date.now();
      
      data?.forEach((item: any) => {
        // Itens em processo de fechamento
        if (item.aberto && item.iniciando_fechamento && item.data_inicio_fechamento && item.segundos_para_fechar !== null) {
          const inicioFechamento = new Date(item.data_inicio_fechamento).getTime();
          const tempoExpiracao = inicioFechamento + (item.segundos_para_fechar * 1000);
          
          if (tempoExpiracao > now) {
            emFechamento.set(item.numero_item, tempoExpiracao);
          }
        }
        
        // Itens em negociação (podem estar abertos)
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

  const handleEnviarLance = async (isNegociacao: boolean = false) => {
    if (!valorLance || !proposta || !selecao) {
      toast.error("Preencha o valor do lance");
      return;
    }

    if (itemSelecionado === null) {
      toast.error("Selecione um item para dar lance");
      return;
    }

    const valorNumerico = parseFloat(valorLance.replace(/\./g, "").replace(",", "."));
    
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      toast.error("Valor do lance inválido");
      return;
    }

    // Validações apenas para lances normais (não negociação)
    if (!isNegociacao) {
      const valorEstimado = itensEstimados.get(itemSelecionado) || 0;
      if (valorNumerico > valorEstimado) {
        toast.error(`Lance desclassificado! Valor deve ser menor ou igual ao estimado: R$ ${valorEstimado.toFixed(2).replace('.', ',')}`);
        return;
      }

      const valorMinimoAtual = getValorMinimoAtual(itemSelecionado);
      if (valorNumerico >= valorMinimoAtual) {
        toast.error(`Seu lance deve ser menor que R$ ${valorMinimoAtual.toFixed(2).replace('.', ',')}`);
        return;
      }
    } else {
      // Para negociação, o valor deve ser menor que o lance vencedor atual
      const valorMinimoAtual = getValorMinimoAtual(itemSelecionado);
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
          numero_item: itemSelecionado,
          valor_lance: valorNumerico,
          tipo_lance: isNegociacao ? 'negociacao' : 'lance'
        });

      if (error) throw error;

      toast.success(isNegociacao 
        ? `Proposta de negociação enviada para o Item ${itemSelecionado}!` 
        : `Lance enviado para o Item ${itemSelecionado}!`
      );
      setValorLance("");
      loadLances();
    } catch (error) {
      console.error("Erro ao enviar lance:", error);
      toast.error("Erro ao enviar lance");
    }
  };

  const isItemEmNegociacaoParaMim = (numeroItem: number): boolean => {
    const fornecedorNegociacao = itensEmNegociacao.get(numeroItem);
    return fornecedorNegociacao === proposta?.fornecedor_id;
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
              <CardContent className="space-y-6">
                {/* Botões de Itens Abertos */}
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Itens Abertos para Lances</Label>
                  {itensAbertos.size === 0 && itensEmNegociacao.size === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      <Lock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhum item aberto para lances no momento</p>
                      <p className="text-sm mt-1">Aguarde o gestor abrir os itens</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {/* Itens abertos para lances normais */}
                      {Array.from(itensAbertos).sort((a, b) => a - b).map((numeroItem) => {
                        const tempoExpiracao = itensEmFechamento.get(numeroItem);
                        const emFechamento = tempoExpiracao !== undefined;
                        const segundosRestantes = emFechamento ? Math.max(0, Math.ceil((tempoExpiracao - Date.now()) / 1000)) : 0;
                        const emNegociacao = itensEmNegociacao.has(numeroItem);
                        const negociacaoParaMim = isItemEmNegociacaoParaMim(numeroItem);
                        
                        // Não mostrar itens em negociação aqui se não for para este fornecedor
                        if (emNegociacao && !negociacaoParaMim) return null;
                        
                        return (
                          <Button
                            key={numeroItem}
                            onClick={() => setItemSelecionado(numeroItem)}
                            variant={itemSelecionado === numeroItem ? "default" : "outline"}
                            className={`gap-2 ${
                              emNegociacao && negociacaoParaMim 
                                ? 'border-amber-500 bg-amber-50 hover:bg-amber-100' 
                                : emFechamento 
                                  ? 'border-orange-500 bg-orange-50 hover:bg-orange-100' 
                                  : ''
                            }`}
                            size="lg"
                          >
                            {emNegociacao ? (
                              <Trophy className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Unlock className="h-4 w-4" />
                            )}
                            <div className="flex flex-col items-start">
                              <span>Item {numeroItem}</span>
                              {emNegociacao && negociacaoParaMim && (
                                <span className="text-xs text-amber-600 font-semibold">
                                  Negociação
                                </span>
                              )}
                              {emFechamento && !emNegociacao && (
                                <span className="text-xs text-orange-600 font-semibold">
                                  Fechando em {segundosRestantes}s
                                </span>
                              )}
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Aviso de Negociação */}
                {itemSelecionado !== null && isItemEmNegociacaoParaMim(itemSelecionado) && (
                  <div className="border-2 rounded-lg p-6 bg-gradient-to-r from-amber-50 to-amber-100 border-amber-300">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-12 w-12 rounded-full bg-amber-500 flex items-center justify-center">
                        <Trophy className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <Label className="text-lg font-bold text-amber-900">Rodada de Negociação - Item {itemSelecionado}</Label>
                        <p className="text-sm text-amber-700">Você é o vencedor! O comprador deseja negociar um valor menor.</p>
                      </div>
                    </div>
                    <div className="border-t border-amber-200 pt-3 mt-3">
                      <p className="text-sm text-amber-800 mb-2">
                        <strong>Seu lance vencedor:</strong> {formatarMoeda(getValorMinimoAtual(itemSelecionado))}
                      </p>
                      <p className="text-xs text-amber-600 mt-3 italic">
                        💡 Envie uma proposta com valor menor se desejar manter a venda. Você não é obrigado a reduzir.
                      </p>
                    </div>
                  </div>
                )}

                {/* Valor Mínimo e Estimado do Item Selecionado */}
                {itemSelecionado !== null && (
                  <div className="space-y-3">
                    {!fornecedorApresentouPropostaNoItem(itemSelecionado) ? (
                      <div className="border-2 rounded-lg p-6 bg-gradient-to-r from-gray-50 to-gray-100 border-gray-300">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-12 w-12 rounded-full bg-gray-500 flex items-center justify-center">
                            <span className="text-2xl text-white">⊘</span>
                          </div>
                          <div>
                            <Label className="text-lg font-bold text-gray-900">Sem Proposta no Item {itemSelecionado}</Label>
                            <p className="text-sm text-gray-700">Você não pode participar de lances neste item</p>
                          </div>
                        </div>
                        <div className="border-t border-gray-200 pt-3 mt-3">
                          <p className="text-sm text-gray-800">
                            <strong>Motivo:</strong> Você não apresentou proposta inicial para este item.
                          </p>
                          <p className="text-xs text-gray-600 mt-3 italic">
                            ℹ️ Apenas itens cotados na proposta inicial podem receber lances.
                          </p>
                        </div>
                      </div>
                    ) : isFornecedorDesclassificadoNoItem(itemSelecionado) ? (
                      <div className="border-2 rounded-lg p-6 bg-gradient-to-r from-red-50 to-red-100 border-red-300">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-12 w-12 rounded-full bg-red-500 flex items-center justify-center">
                            <span className="text-2xl text-white">✕</span>
                          </div>
                          <div>
                            <Label className="text-lg font-bold text-red-900">Desclassificado no Item {itemSelecionado}</Label>
                            <p className="text-sm text-red-700">Você não pode enviar lances para este item</p>
                          </div>
                        </div>
                        <div className="border-t border-red-200 pt-3 mt-3">
                          <p className="text-sm text-red-800 mb-2">
                            <strong>Motivo:</strong> Sua proposta inicial ({formatarMoeda(itens.find(i => i.numero_item === itemSelecionado)?.valor_unitario_ofertado || 0)}) está acima do valor estimado.
                          </p>
                          <p className="text-sm text-red-800">
                            <strong>Valor Estimado:</strong> {formatarMoeda(itensEstimados.get(itemSelecionado) || 0)}
                          </p>
                          <p className="text-xs text-red-600 mt-3 italic">
                            ⚠️ Apenas fornecedores com propostas iniciais iguais ou menores ao valor estimado podem participar da disputa deste item.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="border-2 rounded-lg p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-blue-300">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="h-6 w-6 text-blue-600" />
                            <Label className="text-sm font-semibold">Valor Mínimo Atual - Item {itemSelecionado}</Label>
                          </div>
                          <p className="font-bold text-3xl text-blue-700">
                            {formatarMoeda(getValorMinimoAtual(itemSelecionado))}
                          </p>
                          <p className="text-sm text-blue-600 mt-1">Seu lance deve ser menor que este valor</p>
                        </div>
                        
                        <div className="border-2 rounded-lg p-4 bg-gradient-to-r from-amber-50 to-amber-100 border-amber-300">
                          <div className="flex items-center gap-2 mb-2">
                            <Trophy className="h-6 w-6 text-amber-600" />
                            <Label className="text-sm font-semibold">Valor Estimado - Item {itemSelecionado}</Label>
                          </div>
                          <p className="font-bold text-3xl text-amber-700">
                            {formatarMoeda(itensEstimados.get(itemSelecionado) || 0)}
                          </p>
                          <p className="text-sm text-amber-600 mt-1">Lances acima deste valor são desclassificados</p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Formulário de Lance / Negociação */}
                {/* Formulário de Lance / Negociação - Disponível enquanto houver itens abertos */}
                {(itensAbertos.size > 0 || itensEmNegociacao.size > 0) && (
                  <div className={`border rounded-lg p-4 ${
                    itemSelecionado !== null && isItemEmNegociacaoParaMim(itemSelecionado) 
                      ? 'bg-amber-50 border-amber-300' 
                      : 'bg-muted/50'
                  }`}>
                    <Label className="text-sm font-semibold mb-3 block">
                      {itemSelecionado !== null && isItemEmNegociacaoParaMim(itemSelecionado) 
                        ? 'Enviar Proposta de Negociação' 
                        : 'Enviar Lance'}
                    </Label>
                    {itemSelecionado === null ? (
                      <p className="text-sm text-muted-foreground">Selecione um item acima para enviar seu lance</p>
                    ) : isItemEmNegociacaoParaMim(itemSelecionado) ? (
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            type="text"
                            placeholder="R$ 0,00"
                            value={valorLance ? `R$ ${valorLance}` : ""}
                            onChange={(e) => {
                              const valor = e.target.value.replace(/\D/g, "");
                              setValorLance(formatarMoedaInput(valor));
                            }}
                            className="text-lg font-semibold border-amber-300"
                          />
                        </div>
                        <Button 
                          onClick={() => handleEnviarLance(true)} 
                          size="lg"
                          className="bg-amber-600 hover:bg-amber-700"
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Enviar Negociação
                        </Button>
                      </div>
                    ) : !fornecedorApresentouPropostaNoItem(itemSelecionado) ? (
                      <p className="text-sm text-gray-600 font-medium">Você não pode participar de lances neste item porque não apresentou proposta inicial.</p>
                    ) : isFornecedorDesclassificadoNoItem(itemSelecionado) ? (
                      <p className="text-sm text-red-600 font-medium">Você está desclassificado neste item e não pode enviar lances.</p>
                    ) : (
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            type="text"
                            placeholder="R$ 0,00"
                            value={valorLance ? `R$ ${valorLance}` : ""}
                            onChange={(e) => {
                              const valor = e.target.value.replace(/\D/g, "");
                              setValorLance(formatarMoedaInput(valor));
                            }}
                            className="text-lg font-semibold"
                          />
                        </div>
                        <Button onClick={() => handleEnviarLance(false)} size="lg">
                          <Send className="mr-2 h-4 w-4" />
                          Enviar Lance
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Mensagem quando não há itens abertos para lances */}
                {itensAbertos.size === 0 && itensEmNegociacao.size === 0 && (
                  <div className="border rounded-lg p-4 bg-muted/50 border-muted-foreground/30">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Lock className="h-4 w-4" />
                      <p className="font-semibold">Aguardando abertura de itens</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Os lances serão liberados quando o gestor abrir os itens para disputa
                    </p>
                  </div>
                )}

                {/* Histórico de Lances do Item Selecionado */}
                {itemSelecionado !== null && getLancesDoItem(itemSelecionado).length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-3 block">Histórico de Lances - Item {itemSelecionado}</Label>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Posição</TableHead>
                            <TableHead>Fornecedor</TableHead>
                            <TableHead className="text-right">Valor do Lance</TableHead>
                            <TableHead className="w-32">Status</TableHead>
                            <TableHead>Data/Hora</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getLancesDoItem(itemSelecionado)
                            .sort((a, b) => a.valor_lance - b.valor_lance)
                            .map((lance, index) => {
                              const isProprioLance = lance.fornecedor_id === proposta.fornecedor_id;
                              const desclassificado = isLanceDesclassificado(itemSelecionado, lance.valor_lance);
                              const valorEstimado = itensEstimados.get(itemSelecionado) || 0;
                              
                              return (
                                <TableRow 
                                  key={lance.id}
                                  className={
                                    desclassificado 
                                      ? "bg-red-50 opacity-60" 
                                      : index === 0 && !desclassificado
                                      ? "bg-yellow-50"
                                      : ""
                                  }
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {index === 0 && !desclassificado && <Trophy className="h-4 w-4 text-yellow-600" />}
                                      <span className="font-bold">{index + 1}º</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {isProprioLance ? (
                                      <span className="text-primary font-bold">
                                        {lance.fornecedores.razao_social} (Você)
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        Fornecedor Oculto
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-bold">
                                    {formatarMoeda(lance.valor_lance)}
                                  </TableCell>
                                  <TableCell>
                                    {desclassificado ? (
                                      <Badge variant="destructive" className="text-xs">
                                        Desclassificado
                                      </Badge>
                                    ) : (
                                      <Badge variant="default" className="bg-green-500 text-xs">
                                        Classificado
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {formatDateTime(lance.data_hora_lance)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Legenda de Desclassificação */}
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        <strong>⚠️ Atenção:</strong> Lances com valores acima do estimado ({formatarMoeda(itensEstimados.get(itemSelecionado) || 0)}) são automaticamente desclassificados e não participam da disputa.
                      </p>
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
