import React, { useState, useEffect } from "react";
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

interface ItemVencedor {
  numero_item: number;
  numero_lote?: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_total_ganho: number; // Valor total que ganhou (para dividir entre itens se for lote/global)
  marca?: string;
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

  useEffect(() => {
    if (selecaoId) {
      loadDados();
    }
  }, [selecaoId, fornecedorIdParam]);

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
      await loadItensVencedores(selecaoId!, fornecedorData.id, selecaoData.processos_compras?.criterio_julgamento);

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const loadItensVencedores = async (selecaoId: string, fornecedorId: string, criterio: string) => {
    try {
      // Buscar todos os lances do fornecedor que são vencedores
      const { data: lancesVencedores, error: lancesError } = await supabase
        .from("lances_fornecedores")
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorId)
        .eq("indicativo_lance_vencedor", true);

      if (lancesError) throw lancesError;

      if (!lancesVencedores || lancesVencedores.length === 0) {
        // Verificar lances mais recentes como fallback
        const { data: todosLances } = await supabase
          .from("lances_fornecedores")
          .select("*")
          .eq("selecao_id", selecaoId)
          .order("data_hora_lance", { ascending: false });

        // Identificar vencedores dinamicamente
        const vencedoresPorItem = new Map<number, any>();
        todosLances?.forEach((lance: any) => {
          const key = lance.numero_item;
          if (!vencedoresPorItem.has(key)) {
            vencedoresPorItem.set(key, lance);
          } else {
            const atual = vencedoresPorItem.get(key);
            if (criterio === "desconto") {
              if (lance.valor_lance > atual.valor_lance) {
                vencedoresPorItem.set(key, lance);
              }
            } else {
              if (lance.valor_lance < atual.valor_lance) {
                vencedoresPorItem.set(key, lance);
              }
            }
          }
        });

        // Filtrar apenas os que o fornecedor ganhou
        const meusLancesVencedores: any[] = [];
        vencedoresPorItem.forEach((lance) => {
          if (lance.fornecedor_id === fornecedorId) {
            meusLancesVencedores.push(lance);
          }
        });

        if (meusLancesVencedores.length === 0) {
          toast.error("Você não tem itens vencedores nesta seleção");
          return;
        }

        await processarItensVencedores(selecaoId, meusLancesVencedores, criterio);
      } else {
        await processarItensVencedores(selecaoId, lancesVencedores, criterio);
      }
    } catch (error) {
      console.error("Erro ao carregar itens vencedores:", error);
      toast.error("Erro ao carregar itens vencedores");
    }
  };

  const processarItensVencedores = async (selecaoId: string, lancesVencedores: any[], criterio: string) => {
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

    if (!itensCotacao || !fornecedor) return;

    // Buscar proposta do fornecedor para esta seleção
    const { data: propostaFornecedor } = await supabase
      .from("selecao_propostas_fornecedor")
      .select("id")
      .eq("selecao_id", selecaoId)
      .eq("fornecedor_id", fornecedor.id)
      .maybeSingle();

    // Buscar marcas da proposta original do fornecedor via proposta_id
    // Usar descrição para matching pois numero_item pode repetir entre lotes
    const marcasPorDescricao = new Map<string, string>();
    if (propostaFornecedor) {
      const { data: respostasOriginais } = await (supabase as any)
        .from("selecao_respostas_itens_fornecedor")
        .select("numero_item, marca, descricao")
        .eq("proposta_id", propostaFornecedor.id);

      respostasOriginais?.forEach((resposta: any) => {
        if (resposta.marca && resposta.descricao) {
          // Usar primeiros 30 chars da descrição como chave para matching
          const chaveDescricao = resposta.descricao.substring(0, 30).toLowerCase();
          marcasPorDescricao.set(chaveDescricao, resposta.marca);
        }
      });
    }

    // Função helper para buscar marca pela descrição do item
    const buscarMarcaPorDescricao = (descricaoItem: string): string => {
      const chaveItem = descricaoItem.substring(0, 30).toLowerCase();
      // Buscar correspondência exata primeiro
      if (marcasPorDescricao.has(chaveItem)) {
        return marcasPorDescricao.get(chaveItem) || "";
      }
      // Buscar por substring se não encontrar exato
      for (const [chave, marca] of marcasPorDescricao.entries()) {
        if (chaveItem.includes(chave.substring(0, 15)) || chave.includes(chaveItem.substring(0, 15))) {
          return marca;
        }
      }
      return "";
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
          itensProcessados.push({
            numero_item: item.numero_item,
            numero_lote: numeroLote,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            valor_total_ganho: loteInfo.valorTotal,
            marca: buscarMarcaPorDescricao(item.descricao) || item.marca || "",
          });
        });
      });

      setLotesGanhos(lotesMap);
    } else if (criterio === "global") {
      // Global: todos os itens com valor total
      const valorTotalGlobal = lancesVencedores[0]?.valor_lance || 0;
      totalGanho = valorTotalGlobal;

      itensCotacao.forEach((item: any) => {
        itensProcessados.push({
          numero_item: item.numero_item,
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
          valor_total_ganho: valorTotalGlobal,
          marca: buscarMarcaPorDescricao(item.descricao) || item.marca || "",
        });
      });
    } else {
      // Por item
      lancesVencedores.forEach((lance: any) => {
        const itemOriginal = itensCotacao.find((i: any) => i.numero_item === lance.numero_item);
        if (itemOriginal) {
          const valorTotal = lance.valor_lance * itemOriginal.quantidade;
          totalGanho += valorTotal;
          
          itensProcessados.push({
            numero_item: lance.numero_item,
            numero_lote: itemOriginal.lotes_cotacao?.numero_lote,
            descricao: itemOriginal.descricao,
            quantidade: itemOriginal.quantidade,
            unidade: itemOriginal.unidade,
            valor_total_ganho: valorTotal,
            marca: buscarMarcaPorDescricao(itemOriginal.descricao) || itemOriginal.marca || "",
          });
        }
      });
    }

    setItensVencedores(itensProcessados);
    setValorTotalGanho(totalGanho);

    // Inicializar respostas
    const respostasIniciais: RespostaItem = {};
    itensProcessados.forEach((item) => {
      respostasIniciais[item.numero_item] = {
        valor_unitario: 0,
        marca: item.marca || "",
        valor_display: "",
      };
    });
    setRespostas(respostasIniciais);
  };

  const handleValorChange = (numeroItem: number, valor: string) => {
    const valorNumerico = parseFloat(valor.replace(",", ".")) || 0;
    setRespostas((prev) => ({
      ...prev,
      [numeroItem]: {
        ...prev[numeroItem],
        valor_unitario: valorNumerico,
        valor_display: valor,
      },
    }));
  };

  const handleMarcaChange = (numeroItem: number, marca: string) => {
    setRespostas((prev) => ({
      ...prev,
      [numeroItem]: {
        ...prev[numeroItem],
        marca,
      },
    }));
  };

  const calcularValorTotal = () => {
    return itensVencedores.reduce((total, item) => {
      const resposta = respostas[item.numero_item];
      if (resposta?.valor_unitario) {
        return total + (resposta.valor_unitario * item.quantidade);
      }
      return total;
    }, 0);
  };

  const validarTotaisPorLote = (): { valido: boolean; mensagem?: string } => {
    if (criterioJulgamento === "por_lote") {
      // Verificar se cada lote tem total igual ao valor ganho
      const totaisPorLote = new Map<number, number>();
      
      itensVencedores.forEach((item) => {
        if (item.numero_lote) {
          const resposta = respostas[item.numero_item];
          const valorItem = (resposta?.valor_unitario || 0) * item.quantidade;
          totaisPorLote.set(
            item.numero_lote,
            (totaisPorLote.get(item.numero_lote) || 0) + valorItem
          );
        }
      });

      for (const [numeroLote, totalPreenchido] of totaisPorLote.entries()) {
        const valorGanho = lotesGanhos.get(numeroLote) || 0;
        const diferenca = Math.abs(totalPreenchido - valorGanho);
        if (diferenca > 0.01) { // Tolerância de 1 centavo
          return {
            valido: false,
            mensagem: `O total do Lote ${numeroLote} (${formatCurrency(totalPreenchido)}) deve ser igual ao valor ganho (${formatCurrency(valorGanho)})`
          };
        }
      }
    } else if (criterioJulgamento === "global") {
      const totalPreenchido = calcularValorTotal();
      const diferenca = Math.abs(totalPreenchido - valorTotalGanho);
      if (diferenca > 0.01) {
        return {
          valido: false,
          mensagem: `O total da proposta (${formatCurrency(totalPreenchido)}) deve ser igual ao valor ganho (${formatCurrency(valorTotalGanho)})`
        };
      }
    }
    
    return { valido: true };
  };

  const handleSubmit = async () => {
    // Validar preenchimento
    const itensNaoPreenchidos = itensVencedores.filter(
      (item) => !respostas[item.numero_item]?.valor_unitario
    );

    if (itensNaoPreenchidos.length > 0) {
      toast.error("Preencha o valor unitário de todos os itens");
      return;
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
      const protocolo = `PR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Criar proposta realinhada
      const { data: proposta, error: propostaError } = await supabase
        .from("propostas_realinhadas")
        .upsert({
          selecao_id: selecaoId,
          fornecedor_id: fornecedor.id,
          valor_total_proposta: valorTotal,
          observacoes,
          protocolo,
        }, { onConflict: "selecao_id,fornecedor_id" })
        .select()
        .single();

      if (propostaError) throw propostaError;

      // Deletar itens existentes se for atualização
      await supabase
        .from("propostas_realinhadas_itens")
        .delete()
        .eq("proposta_realinhada_id", proposta.id);

      // Inserir itens
      const itensParaInserir = itensVencedores.map((item) => ({
        proposta_realinhada_id: proposta.id,
        numero_item: item.numero_item,
        numero_lote: item.numero_lote || null,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        valor_unitario: respostas[item.numero_item].valor_unitario,
        valor_total: respostas[item.numero_item].valor_unitario * item.quantidade,
        marca: respostas[item.numero_item].marca || null,
      }));

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
                    const resposta = respostas[item.numero_item];
                    const valorTotal = (resposta?.valor_unitario || 0) * item.quantidade;
                    
                    return (
                      <TableRow key={item.numero_item}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell className="text-sm">{item.descricao}</TableCell>
                        <TableCell>{item.quantidade}</TableCell>
                        <TableCell>{item.unidade}</TableCell>
                        {processo?.tipo === "material" && (
                          <TableCell className="text-center">
                            <span className="text-sm">{resposta?.marca || item.marca || "-"}</span>
                          </TableCell>
                        )}
                        <TableCell>
                          <Input
                            type="text"
                            value={resposta?.valor_display || ""}
                            onChange={(e) => handleValorChange(item.numero_item, e.target.value)}
                            placeholder="0,00"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(valorTotal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {criterioJulgamento === "por_lote" && numeroLote > 0 && (
                    <TableRow className="bg-muted font-bold">
                      <TableCell colSpan={processo?.tipo === "material" ? 5 : 4} className="text-right">
                        Subtotal do Lote
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(
                          itensDoLote.reduce((acc, item) => {
                            const resposta = respostas[item.numero_item];
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
          onClick={handleSubmit}
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
    </div>
  );
};

export default PropostaRealinhada;
