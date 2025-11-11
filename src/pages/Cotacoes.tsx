import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Plus, Trash2, Edit, ChevronRight, Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { DialogItemCotacao } from "@/components/cotacoes/DialogItemCotacao";
import { DialogEnviarCotacao } from "@/components/cotacoes/DialogEnviarCotacao";
import { DialogLote } from "@/components/cotacoes/DialogLote";
import { DialogFinalizarProcesso } from "@/components/cotacoes/DialogFinalizarProcesso";
import { DialogRespostasCotacao } from "@/components/cotacoes/DialogRespostasCotacao";
import { DialogImportarItens } from "@/components/cotacoes/DialogImportarItens";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Contrato {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  status: string;
}

interface Processo {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  valor_estimado_anual: number;
  requer_cotacao: boolean;
  requer_selecao: boolean;
}

interface Cotacao {
  id: string;
  processo_compra_id: string;
  titulo_cotacao: string;
  descricao_cotacao: string;
  status_cotacao: string;
  data_limite_resposta: string;
  criterio_julgamento: 'por_item' | 'global' | 'por_lote';
}

interface Lote {
  id: string;
  numero_lote: number;
  descricao_lote: string;
}

interface ItemCotacao {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_estimado: number;
  lote_id: string | null;
}

const Cotacoes = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState<Processo | null>(null);
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [cotacaoSelecionada, setCotacaoSelecionada] = useState<Cotacao | null>(null);
  const [itens, setItens] = useState<ItemCotacao[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [filtro, setFiltro] = useState("");
  const [dialogItemOpen, setDialogItemOpen] = useState(false);
  const [dialogCotacaoOpen, setDialogCotacaoOpen] = useState(false);
  const [dialogEnviarOpen, setDialogEnviarOpen] = useState(false);
  const [dialogLoteOpen, setDialogLoteOpen] = useState(false);
  const [dialogFinalizarOpen, setDialogFinalizarOpen] = useState(false);
  const [dialogRespostasOpen, setDialogRespostasOpen] = useState(false);
  const [dialogImportarOpen, setDialogImportarOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState<ItemCotacao | null>(null);
  const [loteEditando, setLoteEditando] = useState<Lote | null>(null);
  const [savingCotacao, setSavingCotacao] = useState(false);
  const [criterioJulgamento, setCriterioJulgamento] = useState<'por_item' | 'global' | 'por_lote'>('global');
  const [naoRequerSelecao, setNaoRequerSelecao] = useState(false);
  const [novaCotacao, setNovaCotacao] = useState({
    titulo_cotacao: "",
    descricao_cotacao: "",
    data_limite_resposta: "",
  });

  useEffect(() => {
    checkAuth();
    loadContratos();
  }, []);

  useEffect(() => {
    if (contratoSelecionado) {
      loadProcessos(contratoSelecionado.id);
    }
  }, [contratoSelecionado]);

  useEffect(() => {
    if (processoSelecionado) {
      loadCotacoes(processoSelecionado.id);
    }
  }, [processoSelecionado]);

  useEffect(() => {
    if (cotacaoSelecionada) {
      loadItens(cotacaoSelecionada.id);
      loadLotes(cotacaoSelecionada.id);
      setCriterioJulgamento(cotacaoSelecionada.criterio_julgamento);
    }
  }, [cotacaoSelecionada]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
    setLoading(false);
  };

  const loadContratos = async () => {
    const { data, error } = await supabase
      .from("contratos_gestao")
      .select("*")
      .order("nome_contrato", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar contratos");
      console.error(error);
    } else {
      setContratos(data || []);
    }
  };

  const loadProcessos = async (contratoId: string) => {
    const { data, error } = await supabase
      .from("processos_compras")
      .select("*")
      .eq("contrato_gestao_id", contratoId)
      .eq("requer_cotacao", true)
      .order("numero_processo_interno", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar processos");
      console.error(error);
    } else {
      setProcessos(data || []);
    }
  };

  const loadCotacoes = async (processoId: string) => {
    console.log("Carregando cotações para processo:", processoId);
    const { data, error } = await supabase
      .from("cotacoes_precos")
      .select("*")
      .eq("processo_compra_id", processoId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar cotações:", error);
      toast.error("Erro ao carregar cotações");
    } else {
      console.log("Cotações carregadas:", data);
      setCotacoes((data || []).map(c => ({
        ...c,
        criterio_julgamento: (c.criterio_julgamento || 'global') as 'por_item' | 'global' | 'por_lote'
      })));
    }
  };

  const loadLotes = async (cotacaoId: string) => {
    const { data, error } = await supabase
      .from("lotes_cotacao")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("numero_lote", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar lotes");
      console.error(error);
    } else {
      setLotes(data || []);
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

  const handleSaveCotacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!processoSelecionado) return;

    setSavingCotacao(true);
    try {
      const { error } = await supabase
        .from("cotacoes_precos")
        .insert({
          processo_compra_id: processoSelecionado.id,
          titulo_cotacao: novaCotacao.titulo_cotacao,
          descricao_cotacao: novaCotacao.descricao_cotacao,
          data_limite_resposta: novaCotacao.data_limite_resposta,
        });

      if (error) throw error;

      toast.success("Cotação criada com sucesso!");
      setDialogCotacaoOpen(false);
      setNovaCotacao({
        titulo_cotacao: "",
        descricao_cotacao: "",
        data_limite_resposta: "",
      });
      loadCotacoes(processoSelecionado.id);
    } catch (error) {
      toast.error("Erro ao criar cotação");
      console.error(error);
    } finally {
      setSavingCotacao(false);
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

  const handleDeleteAllItems = async () => {
    if (!cotacaoSelecionada) return;

    try {
      // Excluir todos os itens da cotação
      const { error: itensError } = await supabase
        .from("itens_cotacao")
        .delete()
        .eq("cotacao_id", cotacaoSelecionada.id);

      if (itensError) throw itensError;

      // Se for por lote, excluir também todos os lotes
      if (criterioJulgamento === 'por_lote') {
        const { error: lotesError } = await supabase
          .from("lotes_cotacao")
          .delete()
          .eq("cotacao_id", cotacaoSelecionada.id);

        if (lotesError) throw lotesError;
      }

      toast.success("Todos os itens foram excluídos com sucesso!");
      setConfirmDeleteAllOpen(false);
      loadItens(cotacaoSelecionada.id);
      if (criterioJulgamento === 'por_lote') {
        loadLotes(cotacaoSelecionada.id);
      }
    } catch (error) {
      console.error("Erro ao excluir itens:", error);
      toast.error("Erro ao excluir itens");
    }
  };

  const handleSaveLote = async (loteData: Omit<Lote, "id">) => {
    if (!cotacaoSelecionada) return;

    if (loteEditando) {
      const { error } = await supabase
        .from("lotes_cotacao")
        .update(loteData)
        .eq("id", loteEditando.id);

      if (error) {
        toast.error("Erro ao atualizar lote");
        console.error(error);
      } else {
        toast.success("Lote atualizado com sucesso");
        loadLotes(cotacaoSelecionada.id);
      }
    } else {
      const { error } = await supabase
        .from("lotes_cotacao")
        .insert({
          ...loteData,
          cotacao_id: cotacaoSelecionada.id,
        });

      if (error) {
        toast.error("Erro ao criar lote");
        console.error(error);
      } else {
        toast.success("Lote criado com sucesso");
        loadLotes(cotacaoSelecionada.id);
      }
    }
  };

  const handleDeleteLote = async (id: string) => {
    if (!confirm("Deseja realmente excluir este lote? Todos os itens vinculados perderão o vínculo com o lote.")) return;

    const { error } = await supabase
      .from("lotes_cotacao")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir lote");
      console.error(error);
    } else {
      toast.success("Lote excluído com sucesso");
      if (cotacaoSelecionada) {
        loadLotes(cotacaoSelecionada.id);
        loadItens(cotacaoSelecionada.id);
      }
    }
  };

  const handleUpdateCriterioJulgamento = async (criterio: 'por_item' | 'global' | 'por_lote') => {
    if (!cotacaoSelecionada) return;

    const { error } = await supabase
      .from("cotacoes_precos")
      .update({ criterio_julgamento: criterio })
      .eq("id", cotacaoSelecionada.id);

    if (error) {
      toast.error("Erro ao atualizar critério de julgamento");
      console.error(error);
    } else {
      toast.success("Critério atualizado com sucesso");
      setCriterioJulgamento(criterio);
      setCotacaoSelecionada({ ...cotacaoSelecionada, criterio_julgamento: criterio });
    }
  };

  const handleUpdateRequerSelecao = async (checked: boolean) => {
    if (!processoSelecionado) return;

    const { error } = await supabase
      .from("processos_compras")
      .update({ requer_selecao: checked })
      .eq("id", processoSelecionado.id);

    if (error) {
      toast.error("Erro ao atualizar seleção de fornecedores");
    } else {
      toast.success(checked ? "Processo marcado para seleção de fornecedores" : "Processo desmarcado de seleção de fornecedores");
      setProcessoSelecionado({ ...processoSelecionado, requer_selecao: checked });
    }
  };

  const calcularTotal = () => {
    return itens.reduce((total, item) => total + (item.quantidade * item.valor_unitario_estimado), 0);
  };

  const contratosFiltrados = contratos.filter(c =>
    c.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    c.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
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
        {/* Lista de Contratos */}
        {!contratoSelecionado && (
          <Card>
            <CardHeader>
              <CardTitle>Contratos de Gestão</CardTitle>
              <CardDescription>
                Selecione um contrato para visualizar os processos que requerem cotação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar contrato..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Contrato</TableHead>
                    <TableHead>Ente Federativo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhum contrato encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    contratosFiltrados.map((contrato) => (
                      <TableRow key={contrato.id}>
                        <TableCell className="font-medium">{contrato.nome_contrato}</TableCell>
                        <TableCell>{contrato.ente_federativo}</TableCell>
                        <TableCell>
                          <Badge variant={contrato.status === "ativo" ? "default" : "secondary"}>
                            {contrato.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setContratoSelecionado(contrato)}
                          >
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Ver Processos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Lista de Processos */}
        {contratoSelecionado && !processoSelecionado && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processos que Requerem Cotação</CardTitle>
                  <CardDescription>
                    Contrato: {contratoSelecionado.nome_contrato}
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => setContratoSelecionado(null)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Processo</TableHead>
                    <TableHead>Objeto</TableHead>
                    <TableHead className="text-right">Valor Estimado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhum processo que requer cotação encontrado neste contrato
                      </TableCell>
                    </TableRow>
                  ) : (
                    processos.map((processo) => (
                      <TableRow key={processo.id}>
                        <TableCell className="font-medium">{processo.numero_processo_interno}</TableCell>
                        <TableCell dangerouslySetInnerHTML={{ __html: processo.objeto_resumido }} />
                        <TableCell className="text-right">
                          R$ {processo.valor_estimado_anual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setProcessoSelecionado(processo)}
                          >
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Ver Cotações
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Lista de Cotações */}
        {processoSelecionado && !cotacaoSelecionada && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Cotações de Preços</CardTitle>
                  <CardDescription>
                    Processo: {processoSelecionado.numero_processo_interno}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setProcessoSelecionado(null)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                  <Button onClick={() => setDialogCotacaoOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Cotação
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cotacoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhuma cotação criada para este processo
                      </TableCell>
                    </TableRow>
                  ) : (
                    cotacoes.map((cotacao) => (
                      <TableRow key={cotacao.id}>
                        <TableCell className="font-medium">{cotacao.titulo_cotacao}</TableCell>
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
                            <ChevronRight className="h-4 w-4 mr-2" />
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
        )}

        {/* Gerenciamento de Itens da Cotação */}
        {cotacaoSelecionada && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{cotacaoSelecionada.titulo_cotacao}</CardTitle>
                    <CardDescription>
                      Processo: {processoSelecionado?.numero_processo_interno}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCotacaoSelecionada(null)}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Voltar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDialogImportarOpen(true)}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Importar Excel
                    </Button>
                    <Button 
                      variant="secondary"
                      onClick={() => setDialogRespostasOpen(true)}
                    >
                      Ver Respostas
                    </Button>
                    <Button 
                      variant="default"
                      onClick={() => setDialogEnviarOpen(true)}
                      disabled={itens.length === 0}
                    >
                      Enviar para Fornecedores
                    </Button>
                    {itens.length > 0 && (
                      <Button 
                        variant="destructive"
                        onClick={() => setConfirmDeleteAllOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir Todos os Itens
                      </Button>
                    )}
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
                <div className="mb-6 space-y-4 p-4 border rounded-lg bg-muted/50">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="criterio_julgamento">Critério de Julgamento</Label>
                      <Select
                        value={criterioJulgamento}
                        onValueChange={(value: 'por_item' | 'global' | 'por_lote') => 
                          handleUpdateCriterioJulgamento(value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">Menor Preço Global</SelectItem>
                          <SelectItem value="por_item">Menor Preço por Item</SelectItem>
                          <SelectItem value="por_lote">Menor Preço por Lote</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {criterioJulgamento === 'global' && 'Vencedor será o fornecedor com menor valor total geral'}
                        {criterioJulgamento === 'por_item' && 'Vencedor será escolhido item por item (menor preço em cada item)'}
                        {criterioJulgamento === 'por_lote' && 'Vencedor será escolhido lote por lote (menor preço em cada lote)'}
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="requer_selecao"
                          checked={processoSelecionado?.requer_selecao || false}
                          onCheckedChange={(checked) => {
                            handleUpdateRequerSelecao(checked as boolean);
                            if (checked) setNaoRequerSelecao(false);
                          }}
                        />
                        <label htmlFor="requer_selecao" className="text-sm font-medium cursor-pointer">
                          Requer Seleção de Fornecedores (Valor total superior a R$ 20.000,00)
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="nao_requer_selecao"
                          checked={naoRequerSelecao}
                          onCheckedChange={(checked) => {
                            setNaoRequerSelecao(checked as boolean);
                            if (checked) handleUpdateRequerSelecao(false);
                          }}
                        />
                        <label htmlFor="nao_requer_selecao" className="text-sm font-medium cursor-pointer">
                          Não Requer Seleção (Compra Direta)
                        </label>
                      </div>
                    </div>

                    {naoRequerSelecao && (
                      <div className="flex justify-center pt-2">
                        <Button 
                          onClick={() => setDialogFinalizarOpen(true)}
                          disabled={itens.length === 0}
                          size="lg"
                          className="w-full max-w-md"
                        >
                          Finalizar Processo e Definir Documentos
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {criterioJulgamento === 'por_lote' && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Lotes</h3>
                      <Button size="sm" onClick={() => {
                        setLoteEditando(null);
                        setDialogLoteOpen(true);
                      }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Novo Lote
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Nº Lote</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-32 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lotes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              Nenhum lote criado. Crie lotes para organizar os itens.
                            </TableCell>
                          </TableRow>
                        ) : (
                          lotes.map((lote) => (
                            <TableRow key={lote.id}>
                              <TableCell>{lote.numero_lote}</TableCell>
                              <TableCell>{lote.descricao_lote}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setLoteEditando(lote);
                                      setDialogLoteOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteLote(lote.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                  {criterioJulgamento === 'por_lote' && lotes.length > 0 ? (
                  // Exibição por lote
                  <div className="space-y-6">
                    {lotes.map((lote) => {
                      const itensDoLote = itens.filter(item => item.lote_id === lote.id).sort((a, b) => a.numero_item - b.numero_item);
                      const totalLote = itensDoLote.reduce((acc, item) => {
                        return acc + (item.quantidade * item.valor_unitario_estimado);
                      }, 0);

                      return (
                        <div key={lote.id} className="border rounded-lg overflow-hidden">
                          <div className="bg-primary text-primary-foreground px-4 py-3 flex justify-between items-center">
                            <h3 className="font-semibold">
                              LOTE {lote.numero_lote} - {lote.descricao_lote}
                            </h3>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setItemEditando(null);
                                setDialogItemOpen(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Adicionar Item
                            </Button>
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
                              {itensDoLote.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                                    Nenhum item neste lote
                                  </TableCell>
                                </TableRow>
                              ) : (
                                <>
                                  {itensDoLote.map((item) => (
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
                                  <TableRow className="bg-muted/50">
                                    <TableCell colSpan={5} className="text-right font-semibold">
                                      TOTAL DO LOTE {lote.numero_lote}:
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-lg">
                                      R$ {totalLote.toLocaleString("pt-BR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </TableCell>
                                    <TableCell></TableCell>
                                  </TableRow>
                                </>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })}
                    <div className="bg-primary text-primary-foreground px-6 py-4 rounded-lg flex justify-between items-center">
                      <span className="text-lg font-semibold">TOTAL GERAL:</span>
                      <span className="text-2xl font-bold">
                        R$ {calcularTotal().toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                ) : (
                  // Exibição padrão (global ou por item)
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
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Dialog Nova Cotação */}
      <Dialog open={dialogCotacaoOpen} onOpenChange={setDialogCotacaoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Cotação de Preços</DialogTitle>
            <DialogDescription>
              Crie uma nova cotação para o processo {processoSelecionado?.numero_processo_interno}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCotacao}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="titulo_cotacao">Título da Cotação *</Label>
                <Input
                  id="titulo_cotacao"
                  value={novaCotacao.titulo_cotacao}
                  onChange={(e) => setNovaCotacao({ ...novaCotacao, titulo_cotacao: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="descricao_cotacao">Descrição</Label>
                <Textarea
                  id="descricao_cotacao"
                  value={novaCotacao.descricao_cotacao}
                  onChange={(e) => setNovaCotacao({ ...novaCotacao, descricao_cotacao: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="data_limite_resposta">Data Limite para Resposta *</Label>
                <Input
                  id="data_limite_resposta"
                  type="datetime-local"
                  value={novaCotacao.data_limite_resposta}
                  onChange={(e) => setNovaCotacao({ ...novaCotacao, data_limite_resposta: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogCotacaoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingCotacao}>
                {savingCotacao ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Item Cotação */}
      <DialogItemCotacao
        open={dialogItemOpen}
        onOpenChange={setDialogItemOpen}
        item={itemEditando}
        numeroProximo={itens.length > 0 ? Math.max(...itens.map(i => i.numero_item)) + 1 : 1}
        onSave={handleSaveItem}
      />

      {/* Dialog Enviar Cotação */}
      {cotacaoSelecionada && processoSelecionado && (
        <DialogEnviarCotacao
          open={dialogEnviarOpen}
          onOpenChange={setDialogEnviarOpen}
          cotacaoId={cotacaoSelecionada.id}
          processoNumero={processoSelecionado.numero_processo_interno}
          tituloCotacao={cotacaoSelecionada.titulo_cotacao}
          dataLimite={cotacaoSelecionada.data_limite_resposta}
        />
      )}

      {/* Dialog Lote */}
      {cotacaoSelecionada && (
        <DialogLote
          open={dialogLoteOpen}
          onOpenChange={setDialogLoteOpen}
          lote={loteEditando}
          numeroProximo={lotes.length > 0 ? Math.max(...lotes.map(l => l.numero_lote)) + 1 : 1}
          onSave={handleSaveLote}
        />
      )}

      {/* Dialog Finalizar Processo */}
      {cotacaoSelecionada && (
        <DialogFinalizarProcesso
          open={dialogFinalizarOpen}
          onOpenChange={setDialogFinalizarOpen}
          cotacaoId={cotacaoSelecionada.id}
          onSuccess={() => {
            if (processoSelecionado) {
              loadCotacoes(processoSelecionado.id);
            }
          }}
        />
      )}

      {/* Dialog Respostas Cotação */}
      {cotacaoSelecionada && (
        <DialogRespostasCotacao
          open={dialogRespostasOpen}
          onOpenChange={setDialogRespostasOpen}
          cotacaoId={cotacaoSelecionada.id}
          tituloCotacao={cotacaoSelecionada.titulo_cotacao}
          criterioJulgamento={criterioJulgamento}
          requerSelecao={processoSelecionado?.requer_selecao || false}
        />
      )}

      {/* Dialog Importar Itens */}
      {cotacaoSelecionada && (
        <DialogImportarItens
          open={dialogImportarOpen}
          onOpenChange={setDialogImportarOpen}
          cotacaoId={cotacaoSelecionada.id}
          onImportSuccess={() => {
            if (cotacaoSelecionada) {
              loadItens(cotacaoSelecionada.id);
              loadLotes(cotacaoSelecionada.id);
              loadCotacoes(processoSelecionado!.id);
            }
          }}
        />
      )}

      {/* Dialog Confirmar Exclusão de Todos os Itens */}
      <AlertDialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirmar Exclusão de Todos os Itens
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>TODOS os {itens.length} itens</strong> desta cotação?
              {criterioJulgamento === 'por_lote' && lotes.length > 0 && (
                <>
                  <br /><br />
                  Esta ação também excluirá <strong>todos os {lotes.length} lotes</strong> criados.
                </>
              )}
              <br /><br />
              <span className="text-destructive font-semibold">Esta ação não pode ser desfeita!</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAllItems}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Todos os Itens
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Cotacoes;
