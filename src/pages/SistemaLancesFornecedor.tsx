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

      // Subscrição para itens abertos
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
          () => {
            loadItensAbertos();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(channelItens);
      };
    }
  }, [selecao?.id]);

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
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select("numero_item")
        .eq("selecao_id", selecao.id)
        .eq("aberto", true);

      if (error) throw error;

      const abertos = new Set(data?.map((item) => item.numero_item) || []);
      setItensAbertos(abertos);
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

  const handleEnviarLance = async () => {
    if (!valorLance || !proposta || !selecao) {
      toast.error("Preencha o valor do lance");
      return;
    }

    const valorNumerico = parseFloat(valorLance.replace(/\./g, "").replace(",", "."));
    
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      toast.error("Valor do lance inválido");
      return;
    }

    // Verificar se há itens abertos
    if (itensAbertos.size === 0) {
      toast.error("Não há itens abertos para lances no momento");
      return;
    }

    try {
      const { error } = await supabase
        .from("lances_fornecedores")
        .insert({
          selecao_id: selecao.id,
          fornecedor_id: proposta.fornecedor_id,
          valor_lance: valorNumerico,
        });

      if (error) throw error;

      toast.success("Lance enviado com sucesso!");
      setValorLance("");
      loadLances();
    } catch (error) {
      console.error("Erro ao enviar lance:", error);
      toast.error("Erro ao enviar lance");
    }
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
      // Atualizar cada item
      for (const item of itens) {
        const { error } = await supabase
          .from("selecao_respostas_itens_fornecedor")
          .update({
            valor_unitario_ofertado: item.valor_unitario_ofertado,
            marca_ofertada: item.marca_ofertada,
            valor_total_item: item.valor_unitario_ofertado * item.quantidade
          })
          .eq("id", item.id);

        if (error) throw error;
      }

      // Recalcular valor total da proposta
      const valorTotal = itens.reduce((acc, item) => acc + (item.valor_unitario_ofertado * item.quantidade), 0);
      
      const { error: propostaError } = await supabase
        .from("selecao_propostas_fornecedor")
        .update({ valor_total_proposta: valorTotal })
        .eq("id", propostaId);

      if (propostaError) throw propostaError;

      toast.success("Proposta atualizada com sucesso!");
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
            <ChatSelecao selecaoId={selecao.id} />
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
                {/* Valor Mínimo Atual */}
                {lances.length > 0 && (
                  <div className="border-2 rounded-lg p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-green-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-6 w-6 text-green-600" />
                        <div>
                          <p className="text-sm text-muted-foreground">Valor Mínimo Atual para Vencer</p>
                          <p className="font-bold text-3xl text-green-600">
                            {formatarMoeda(lances[0].valor_lance)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Seu lance deve ser</p>
                        <p className="font-semibold text-green-700">menor que este valor</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status dos Itens */}
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Itens Abertos para Lances</Label>
                  {itensAbertos.size === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      <Lock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhum item aberto para lances no momento</p>
                      <p className="text-sm mt-1">Aguarde o gestor abrir os itens</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Array.from(itensAbertos).sort((a, b) => a - b).map((numeroItem) => (
                        <Badge key={numeroItem} variant="default" className="bg-green-500 justify-center py-2">
                          <Unlock className="h-3 w-3 mr-1" />
                          Item {numeroItem}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Formulário de Lance */}
                {itensAbertos.size > 0 && editavel && (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <Label className="text-sm font-semibold mb-2 block">Enviar Lance</Label>
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
                      <Button onClick={handleEnviarLance} size="lg">
                        <Send className="mr-2 h-4 w-4" />
                        Enviar Lance
                      </Button>
                    </div>
                  </div>
                )}

                {!editavel && (
                  <div className="border rounded-lg p-4 bg-destructive/10 border-destructive/30">
                    <div className="flex items-center gap-2 text-destructive">
                      <Lock className="h-4 w-4" />
                      <p className="font-semibold">Lances bloqueados</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      O prazo para enviar lances encerrou (5 minutos antes da sessão)
                    </p>
                  </div>
                )}

                {/* Lance Vencedor Atual */}
                {lances.length > 0 && (
                  <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-300">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="h-5 w-5 text-yellow-600" />
                      <Label className="text-sm font-semibold">Lance Vencedor Atual</Label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Fornecedor</p>
                        <p className="font-semibold">{lances[0].fornecedores.razao_social}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">CNPJ</p>
                        <p className="font-medium">{formatCNPJ(lances[0].fornecedores.cnpj)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Melhor Lance</p>
                        <p className="font-bold text-xl text-green-600">
                          {formatarMoeda(lances[0].valor_lance)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Histórico de Lances - Mensagens de outros fornecedores com nome oculto */}
                {lances.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Histórico de Lances</Label>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Posição</TableHead>
                            <TableHead>Fornecedor</TableHead>
                            <TableHead className="text-right">Valor do Lance</TableHead>
                            <TableHead>Data/Hora</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lances.map((lance, index) => {
                            const isProprioLance = lance.fornecedor_id === proposta.fornecedor_id;
                            return (
                              <TableRow 
                                key={lance.id}
                                className={index === 0 ? "bg-yellow-50" : ""}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {index === 0 && <Trophy className="h-4 w-4 text-yellow-600" />}
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
                                <TableCell className="text-sm">
                                  {formatDateTime(lance.data_hora_lance)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
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
                ? "Você pode editar os valores e marcas até 5 minutos antes da sessão de disputa"
                : "O prazo para edição expirou. Os valores abaixo são apenas para consulta."}
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
                          value={item.valor_unitario_ofertado || ""}
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
