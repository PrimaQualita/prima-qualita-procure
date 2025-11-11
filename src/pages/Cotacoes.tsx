import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Plus, Trash2, Edit, Send, Eye } from "lucide-react";
import { toast } from "sonner";
import { DialogItemCotacao } from "@/components/cotacoes/DialogItemCotacao";

interface Processo {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  valor_estimado_anual: number;
}

interface Cotacao {
  id: string;
  processo_compra_id: string;
  titulo_cotacao: string;
  status_cotacao: string;
  data_limite_resposta: string;
  processos_compras?: Processo;
}

interface ItemCotacao {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_estimado: number;
}

const Cotacoes = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [cotacaoSelecionada, setCotacaoSelecionada] = useState<Cotacao | null>(null);
  const [itens, setItens] = useState<ItemCotacao[]>([]);
  const [filtro, setFiltro] = useState("");
  const [dialogItemOpen, setDialogItemOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState<ItemCotacao | null>(null);

  useEffect(() => {
    checkAuth();
    loadCotacoes();
  }, []);

  useEffect(() => {
    if (cotacaoSelecionada) {
      loadItens(cotacaoSelecionada.id);
    }
  }, [cotacaoSelecionada]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
    setLoading(false);
  };

  const loadCotacoes = async () => {
    const { data, error } = await supabase
      .from("cotacoes_precos")
      .select(`
        *,
        processos_compras (
          id,
          numero_processo_interno,
          objeto_resumido,
          valor_estimado_anual
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar cotações");
      console.error(error);
    } else {
      setCotacoes(data || []);
    }
  };

  const loadItens = async (cotacaoId: string) => {
    const { data, error } = await supabase
      .from("itens_cotacao")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("numero_item", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar itens");
      console.error(error);
    } else {
      setItens(data || []);
    }
  };

  const handleSaveItem = async (itemData: Omit<ItemCotacao, "id">) => {
    if (!cotacaoSelecionada) return;

    if (itemEditando) {
      const { error } = await supabase
        .from("itens_cotacao")
        .update(itemData)
        .eq("id", itemEditando.id);

      if (error) {
        toast.error("Erro ao atualizar item");
        console.error(error);
      } else {
        toast.success("Item atualizado com sucesso");
        loadItens(cotacaoSelecionada.id);
      }
    } else {
      const { error } = await supabase
        .from("itens_cotacao")
        .insert({
          ...itemData,
          cotacao_id: cotacaoSelecionada.id,
        });

      if (error) {
        toast.error("Erro ao criar item");
        console.error(error);
      } else {
        toast.success("Item criado com sucesso");
        loadItens(cotacaoSelecionada.id);
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Deseja realmente excluir este item?")) return;

    const { error } = await supabase
      .from("itens_cotacao")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir item");
      console.error(error);
    } else {
      toast.success("Item excluído com sucesso");
      if (cotacaoSelecionada) {
        loadItens(cotacaoSelecionada.id);
      }
    }
  };

  const calcularTotal = () => {
    return itens.reduce((total, item) => total + (item.quantidade * item.valor_unitario_estimado), 0);
  };

  const cotacoesFiltradas = cotacoes.filter(c =>
    c.titulo_cotacao.toLowerCase().includes(filtro.toLowerCase()) ||
    c.processos_compras?.numero_processo_interno.toLowerCase().includes(filtro.toLowerCase())
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Gestão de Contratos e Processos</h1>
              <p className="text-sm text-muted-foreground">Cotação de Preços</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {!cotacaoSelecionada ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Cotações de Preços</CardTitle>
                  <CardDescription>
                    Selecione uma cotação para gerenciar os itens
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar cotação..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Processo</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cotacoesFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhuma cotação encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    cotacoesFiltradas.map((cotacao) => (
                      <TableRow key={cotacao.id}>
                        <TableCell>{cotacao.processos_compras?.numero_processo_interno}</TableCell>
                        <TableCell>{cotacao.titulo_cotacao}</TableCell>
                        <TableCell>
                          <Badge variant={cotacao.status_cotacao === "em_aberto" ? "default" : "secondary"}>
                            {cotacao.status_cotacao}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(cotacao.data_limite_resposta).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCotacaoSelecionada(cotacao)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Gerenciar Itens
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{cotacaoSelecionada.titulo_cotacao}</CardTitle>
                    <CardDescription>
                      Processo: {cotacaoSelecionada.processos_compras?.numero_processo_interno}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCotacaoSelecionada(null)}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Voltar
                    </Button>
                    <Button onClick={() => {
                      setItemEditando(null);
                      setDialogItemOpen(true);
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Item
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="requer_selecao"
                      checked={cotacaoSelecionada.processos_compras ? true : false}
                      onChange={async (e) => {
                        const { error } = await supabase
                          .from("processos_compras")
                          .update({ requer_selecao: e.target.checked })
                          .eq("id", cotacaoSelecionada.processo_compra_id);
                        
                        if (error) {
                          toast.error("Erro ao atualizar seleção de fornecedores");
                        } else {
                          toast.success(e.target.checked ? "Processo marcado para seleção de fornecedores" : "Processo desmarcado de seleção de fornecedores");
                          loadCotacoes();
                        }
                      }}
                      className="h-4 w-4 rounded border-input"
                    />
                    <label htmlFor="requer_selecao" className="text-sm font-medium cursor-pointer">
                      Requer Seleção de Fornecedores (Valor total superior a R$ 20.000,00)
                    </label>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Item</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-24">Qtd</TableHead>
                      <TableHead className="w-24">Unid.</TableHead>
                      <TableHead className="w-32 text-right">Vlr. Unit.</TableHead>
                      <TableHead className="w-32 text-right">Vlr. Total</TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          Nenhum item cadastrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {itens.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.numero_item}</TableCell>
                            <TableCell>{item.descricao}</TableCell>
                            <TableCell>{item.quantidade}</TableCell>
                            <TableCell>{item.unidade}</TableCell>
                            <TableCell className="text-right">
                              R$ {item.valor_unitario_estimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right">
                              R$ {(item.quantidade * item.valor_unitario_estimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setItemEditando(item);
                                    setDialogItemOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteItem(item.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold bg-muted">
                          <TableCell colSpan={5} className="text-right">TOTAL GERAL:</TableCell>
                          <TableCell className="text-right">
                            R$ {calcularTotal().toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <DialogItemCotacao
        open={dialogItemOpen}
        onOpenChange={setDialogItemOpen}
        item={itemEditando}
        numeroProximo={itens.length > 0 ? Math.max(...itens.map(i => i.numero_item)) + 1 : 1}
        onSave={handleSaveItem}
      />
    </div>
  );
};

export default Cotacoes;
