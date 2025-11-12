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
import { ArrowLeft, Plus, Trash2, Edit, ChevronRight, Upload, FileSpreadsheet, AlertCircle, FileText } from "lucide-react";
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
import DOMPurify from "dompurify";
import { gerarAutorizacaoCompraDireta, gerarAutorizacaoSelecao } from "@/lib/gerarAutorizacaoPDF";

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
  tipo: string;
  criterio_julgamento?: string;
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
  marca?: string;
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
  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set());
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
  const [autorizacaoAnexada, setAutorizacaoAnexada] = useState<File | null>(null);
  const [autorizacaoSelecaoAnexada, setAutorizacaoSelecaoAnexada] = useState<File | null>(null);
  const [emailsFornecedoresAnexados, setEmailsFornecedoresAnexados] = useState<File[]>([]);
  const [uploadingAutorizacao, setUploadingAutorizacao] = useState(false);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);
  const [usuarioNome, setUsuarioNome] = useState('');
  const [usuarioCpf, setUsuarioCpf] = useState('');
  const [autorizacaoSelecaoUrl, setAutorizacaoSelecaoUrl] = useState('');
  const [autorizacaoDiretaUrl, setAutorizacaoDiretaUrl] = useState('');
  const [autorizacaoSelecaoId, setAutorizacaoSelecaoId] = useState('');
  const [autorizacaoDiretaId, setAutorizacaoDiretaId] = useState('');
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
      loadAutorizacoes(cotacaoSelecionada.id);
      setCriterioJulgamento(cotacaoSelecionada.criterio_julgamento);
    }
  }, [cotacaoSelecionada]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    
    // Verificar se é responsável legal e buscar dados do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("responsavel_legal, nome_completo, cpf")
      .eq("id", session.user.id)
      .single();
    
    setIsResponsavelLegal(profile?.responsavel_legal || false);
    setUsuarioNome(profile?.nome_completo || '');
    setUsuarioCpf(profile?.cpf || '');
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
      // Usa o critério do processo se a cotação não tiver um
      const processo = processos.find(p => p.id === processoId);
      setCotacoes((data || []).map(c => ({
        ...c,
        criterio_julgamento: (c.criterio_julgamento || processo?.criterio_julgamento || 'global') as 'por_item' | 'global' | 'por_lote'
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

  const loadAutorizacoes = async (cotacaoId: string) => {
    const { data, error } = await supabase
      .from("autorizacoes_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId);

    if (error) {
      console.error("Erro ao carregar autorizações:", error);
      return;
    }

    if (data && data.length > 0) {
      data.forEach(autorizacao => {
        if (autorizacao.tipo_autorizacao === 'compra_direta') {
          setAutorizacaoDiretaUrl(autorizacao.url_arquivo);
          setAutorizacaoDiretaId(autorizacao.id);
        } else if (autorizacao.tipo_autorizacao === 'selecao_fornecedores') {
          setAutorizacaoSelecaoUrl(autorizacao.url_arquivo);
          setAutorizacaoSelecaoId(autorizacao.id);
        }
      });
    }
  };

  const deletarAutorizacao = async (autorizacaoId: string, tipo: 'compra_direta' | 'selecao_fornecedores') => {
    const { error } = await supabase
      .from("autorizacoes_processo")
      .delete()
      .eq("id", autorizacaoId);

    if (error) {
      toast.error("Erro ao deletar autorização");
      console.error(error);
      return;
    }

    if (tipo === 'compra_direta') {
      setAutorizacaoDiretaUrl('');
      setAutorizacaoDiretaId('');
    } else {
      setAutorizacaoSelecaoUrl('');
      setAutorizacaoSelecaoId('');
    }

    toast.success("Autorização deletada com sucesso");
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
      // Usa o critério de julgamento do processo
      const { error } = await supabase
        .from("cotacoes_precos")
        .insert({
          processo_compra_id: processoSelecionado.id,
          titulo_cotacao: novaCotacao.titulo_cotacao,
          descricao_cotacao: novaCotacao.descricao_cotacao,
          data_limite_resposta: novaCotacao.data_limite_resposta,
          criterio_julgamento: processoSelecionado.criterio_julgamento || 'global',
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

    if (!cotacaoSelecionada) return;

    try {
      // Primeiro, deletar todas as respostas de fornecedores da cotação
      const { error: respostasItensError } = await supabase
        .from("respostas_itens_fornecedor")
        .delete()
        .eq("item_cotacao_id", id);

      if (respostasItensError) throw respostasItensError;

      // Depois deletar o item
      const { error } = await supabase
        .from("itens_cotacao")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Item excluído com sucesso");
      await renumerarItens();
      loadItens(cotacaoSelecionada.id);
    } catch (error) {
      toast.error("Erro ao excluir item");
      console.error(error);
    }
  };

  const handleDeleteSelectedItems = async () => {
    if (!cotacaoSelecionada || itensSelecionados.size === 0) return;

    try {
      const idsArray = Array.from(itensSelecionados);

      // Deletar respostas de fornecedores dos itens selecionados
      const { error: respostasError } = await supabase
        .from("respostas_itens_fornecedor")
        .delete()
        .in("item_cotacao_id", idsArray);

      if (respostasError) throw respostasError;

      // Deletar itens selecionados
      const { error } = await supabase
        .from("itens_cotacao")
        .delete()
        .in("id", idsArray);

      if (error) throw error;

      toast.success(`${itensSelecionados.size} ${itensSelecionados.size === 1 ? 'item excluído' : 'itens excluídos'} com sucesso`);
      setItensSelecionados(new Set());
      await renumerarItens();
      loadItens(cotacaoSelecionada.id);
    } catch (error) {
      toast.error("Erro ao excluir itens selecionados");
      console.error(error);
    }
  };

  const renumerarItens = async () => {
    if (!cotacaoSelecionada) return;

    try {
      // Buscar todos os itens restantes ordenados
      const { data: itensRestantes, error: fetchError } = await supabase
        .from("itens_cotacao")
        .select("*")
        .eq("cotacao_id", cotacaoSelecionada.id)
        .order("numero_item", { ascending: true });

      if (fetchError) throw fetchError;
      if (!itensRestantes || itensRestantes.length === 0) return;

      // Atualizar numeração sequencial
      const updates = itensRestantes.map((item, index) => 
        supabase
          .from("itens_cotacao")
          .update({ numero_item: index + 1 })
          .eq("id", item.id)
      );

      await Promise.all(updates);
    } catch (error) {
      console.error("Erro ao renumerar itens:", error);
    }
  };

  const handleDeleteAllItems = async () => {
    if (!cotacaoSelecionada) return;

    try {
      // Primeiro, deletar todas as respostas de fornecedores da cotação
      const { data: respostasData } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id")
        .eq("cotacao_id", cotacaoSelecionada.id);

      if (respostasData && respostasData.length > 0) {
        const respostaIds = respostasData.map(r => r.id);
        
        // Deletar respostas de itens
        const { error: respostasItensError } = await supabase
          .from("respostas_itens_fornecedor")
          .delete()
          .in("cotacao_resposta_fornecedor_id", respostaIds);

        if (respostasItensError) throw respostasItensError;

        // Deletar respostas de fornecedores
        const { error: respostasError } = await supabase
          .from("cotacao_respostas_fornecedor")
          .delete()
          .eq("cotacao_id", cotacaoSelecionada.id);

        if (respostasError) throw respostasError;
      }

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

      toast.success("Todos os itens e respostas foram excluídos com sucesso!");
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
    if (!confirm("Deseja realmente excluir este lote? Todos os itens vinculados a ele também serão excluídos.")) return;

    try {
      // Buscar itens do lote
      const { data: itensLote } = await supabase
        .from("itens_cotacao")
        .select("id")
        .eq("lote_id", id);

      if (itensLote && itensLote.length > 0) {
        const itemIds = itensLote.map(item => item.id);

        // Deletar respostas de fornecedores dos itens do lote
        const { error: respostasError } = await supabase
          .from("respostas_itens_fornecedor")
          .delete()
          .in("item_cotacao_id", itemIds);

        if (respostasError) throw respostasError;

        // Deletar itens do lote
        const { error: itensError } = await supabase
          .from("itens_cotacao")
          .delete()
          .eq("lote_id", id);

        if (itensError) throw itensError;
      }

      // Deletar o lote
      const { error } = await supabase
        .from("lotes_cotacao")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Lote e todos os itens vinculados excluídos com sucesso");
      if (cotacaoSelecionada) {
        loadLotes(cotacaoSelecionada.id);
        loadItens(cotacaoSelecionada.id);
      }
    } catch (error) {
      toast.error("Erro ao excluir lote");
      console.error(error);
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
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-10 sm:h-12" />
            <div>
              <h1 className="text-lg sm:text-xl font-bold">Gestão de Contratos e Processos</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Cotação de Preços</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {/* Lista de Contratos */}
        {!contratoSelecionado && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Contratos de Gestão</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Selecione um contrato para visualizar os processos que requerem cotação
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="px-4 sm:px-0 mb-4">
                <Input
                  placeholder="Buscar contrato..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Nome do Contrato</TableHead>
                      <TableHead className="min-w-[120px]">Ente Federativo</TableHead>
                      <TableHead className="min-w-[80px]">Status</TableHead>
                      <TableHead className="text-right min-w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contratosFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-xs sm:text-sm">
                          Nenhum contrato encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      contratosFiltrados.map((contrato) => (
                        <TableRow key={contrato.id}>
                          <TableCell className="font-medium text-xs sm:text-sm">{contrato.nome_contrato}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{contrato.ente_federativo}</TableCell>
                          <TableCell>
                            <Badge variant={contrato.status === "ativo" ? "default" : "secondary"} className="text-xs">
                              {contrato.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setContratoSelecionado(contrato)}
                              className="text-xs"
                            >
                              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                              <span className="hidden sm:inline">Ver Processos</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
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
                        <TableCell dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processo.objeto_resumido) }} />
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
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle>{cotacaoSelecionada.titulo_cotacao}</CardTitle>
                      <CardDescription>
                        Processo: {processoSelecionado?.numero_processo_interno}
                      </CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => setCotacaoSelecionada(null)} className="shrink-0">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Voltar
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end ml-auto">
                    <Button
                      variant="outline"
                      onClick={() => setDialogImportarOpen(true)}
                      size="sm"
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Importar Excel
                    </Button>
                    <Button 
                      variant="secondary"
                      onClick={() => setDialogRespostasOpen(true)}
                      size="sm"
                    >
                      Ver Respostas
                    </Button>
                    <Button 
                      variant="default"
                      onClick={() => setDialogEnviarOpen(true)}
                      disabled={itens.length === 0}
                      size="sm"
                    >
                      Enviar para Fornecedores
                    </Button>
                    {itens.length > 0 && (
                      <Button 
                        variant="destructive"
                        onClick={() => setConfirmDeleteAllOpen(true)}
                        size="sm"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir Itens
                      </Button>
                    )}
                    <Button onClick={() => {
                      setItemEditando(null);
                      setDialogItemOpen(true);
                    }} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Item
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-6 space-y-4 p-4 border rounded-lg bg-muted/50">
                  <div className="grid gap-4">
                    {/* Critério de Julgamento - somente leitura, vindo do processo */}
                    <div className="grid gap-2">
                      <Label>Critério de Julgamento (definido no processo)</Label>
                      <div className="p-3 bg-muted rounded-md">
                        <p className="font-medium">
                          {criterioJulgamento === 'global' && '📊 Menor Preço Global'}
                          {criterioJulgamento === 'por_item' && '📋 Menor Preço por Item'}
                          {criterioJulgamento === 'por_lote' && '📦 Menor Preço por Lote'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {criterioJulgamento === 'global' && 'Vencedor será o fornecedor com menor valor total geral'}
                          {criterioJulgamento === 'por_item' && 'Vencedor será escolhido item por item (menor preço em cada item)'}
                          {criterioJulgamento === 'por_lote' && 'Vencedor será escolhido lote por lote (menor preço em cada lote)'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Campo para anexar cópia dos e-mails enviados aos fornecedores */}
                    <div className="mb-4 p-4 bg-background border rounded-lg">
                      <Label htmlFor="emails-fornecedores-upload" className="text-base font-semibold mb-2 block">
                        Cópia dos E-mails Enviados aos Fornecedores
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="emails-fornecedores-upload"
                            type="file"
                            accept=".pdf,.eml,.msg,.zip"
                            multiple
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length > 0) {
                                setEmailsFornecedoresAnexados(prev => [...prev, ...files]);
                                toast.success(`${files.length} arquivo(s) anexado(s) com sucesso`);
                              }
                            }}
                            className="flex-1"
                          />
                          {emailsFornecedoresAnexados.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEmailsFornecedoresAnexados([]);
                                const input = document.getElementById('emails-fornecedores-upload') as HTMLInputElement;
                                if (input) input.value = '';
                                toast.info("Todos os e-mails removidos");
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {emailsFornecedoresAnexados.length > 0 && (
                          <div className="flex flex-col gap-1 mt-2">
                            {emailsFornecedoresAnexados.map((file, index) => (
                              <div key={index} className="flex items-center justify-between text-sm text-muted-foreground">
                                <span>📎 {file.name}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEmailsFornecedoresAnexados(prev => prev.filter((_, i) => i !== index));
                                    toast.info("Arquivo removido");
                                  }}
                                  className="h-6 w-6 p-0"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Anexe a cópia dos e-mails enviados aos fornecedores (PDF, EML, MSG ou ZIP)
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
                          Requer Seleção de Fornecedores (Acima R$ 20.000,00)
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
                          Não Requer Seleção de Fornecedores (Compra Direta)
                        </label>
                      </div>
                    </div>

                    {processoSelecionado?.requer_selecao && (
                      <div className="flex flex-col md:flex-row items-stretch md:items-end gap-4 pt-2">
                        <div className="flex-1">
                          <Label htmlFor="autorizacao-selecao-upload">
                            Autorização *
                          </Label>
                          {isResponsavelLegal ? (
                            <div className="space-y-2 mt-1">
                              <Button
                                onClick={async () => {
                                  if (!processoSelecionado || !cotacaoSelecionada) return;
                                  try {
                                    const result = await gerarAutorizacaoSelecao(
                                      processoSelecionado.numero_processo_interno,
                                      processoSelecionado.objeto_resumido,
                                      usuarioNome,
                                      usuarioCpf
                                    );
                                    setAutorizacaoSelecaoUrl(result.url);
                                    
                                    // Salvar autorização no banco
                                    const { data: { session } } = await supabase.auth.getSession();
                                    const { data: autorizacao, error: saveError } = await supabase
                                      .from("autorizacoes_processo")
                                      .insert({
                                        cotacao_id: cotacaoSelecionada.id,
                                        tipo_autorizacao: 'selecao_fornecedores',
                                        url_arquivo: result.url,
                                        nome_arquivo: result.fileName,
                                        protocolo: result.protocolo,
                                        usuario_gerador_id: session?.user.id
                                      })
                                      .select()
                                      .single();
                                    
                                    if (saveError) throw saveError;
                                    setAutorizacaoSelecaoId(autorizacao.id);
                                    
                                    toast.success("Autorização gerada e salva com sucesso");
                                  } catch (error) {
                                    console.error("Erro ao gerar autorização:", error);
                                    toast.error("Erro ao gerar autorização");
                                  }
                                }}
                                variant="outline"
                                className="w-full"
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Gerar Autorização
                              </Button>
                              {autorizacaoSelecaoUrl && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex gap-2">
                                    <Button
                                      variant="secondary"
                                      onClick={() => window.open(autorizacaoSelecaoUrl, '_blank')}
                                      className="flex-1"
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      Visualizar
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = autorizacaoSelecaoUrl;
                                        link.download = `autorizacao-selecao-${processoSelecionado?.numero_processo_interno}.pdf`;
                                        link.click();
                                      }}
                                      className="flex-1"
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      Baixar
                                    </Button>
                                  </div>
                                  {isResponsavelLegal && autorizacaoSelecaoId && (
                                    <Button
                                      variant="destructive"
                                      onClick={() => deletarAutorizacao(autorizacaoSelecaoId, 'selecao_fornecedores')}
                                      size="sm"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Deletar Autorização
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mt-1">
                                <Input
                                  id="autorizacao-selecao-upload"
                                  type="file"
                                  accept=".pdf,.doc,.docx"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      setAutorizacaoSelecaoAnexada(file);
                                      toast.success("Documento de autorização anexado");
                                    }
                                  }}
                                  disabled={uploadingAutorizacao}
                                  className="flex-1"
                                />
                                {autorizacaoSelecaoAnexada && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setAutorizacaoSelecaoAnexada(null);
                                      const input = document.getElementById('autorizacao-selecao-upload') as HTMLInputElement;
                                      if (input) input.value = '';
                                      toast.info("Documento de autorização removido");
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              {autorizacaoSelecaoAnexada && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {autorizacaoSelecaoAnexada.name}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        <Button
                          onClick={async () => {
                            if (!cotacaoSelecionada?.id) return;
                            
                            const { error } = await supabase
                              .from('cotacoes_precos')
                              .update({ enviado_para_selecao: true })
                              .eq('id', cotacaoSelecionada.id);
                            
                            if (error) {
                              toast.error('Erro ao enviar para seleção de fornecedores');
                              return;
                            }
                            
                            toast.success('Processo enviado para Seleção de Fornecedores');
                            if (processoSelecionado) {
                              loadCotacoes(processoSelecionado.id);
                            }
                          }}
                          disabled={itens.length === 0 || (!autorizacaoSelecaoUrl && !autorizacaoSelecaoAnexada)}
                          size="lg"
                          className="md:w-auto w-full"
                        >
                          Enviar para Seleção de Fornecedores
                        </Button>
                      </div>
                    )}

                    {naoRequerSelecao && (
                      <div className="flex flex-col md:flex-row items-stretch md:items-end gap-4 pt-2">
                        <div className="flex-1">
                          <Label htmlFor="autorizacao-upload">
                            Autorização *
                          </Label>
                          {isResponsavelLegal ? (
                            <div className="space-y-2 mt-1">
                              <Button
                                onClick={async () => {
                                  if (!processoSelecionado || !cotacaoSelecionada) return;
                                  try {
                                    const result = await gerarAutorizacaoCompraDireta(
                                      processoSelecionado.numero_processo_interno,
                                      processoSelecionado.objeto_resumido,
                                      usuarioNome,
                                      usuarioCpf
                                    );
                                    setAutorizacaoDiretaUrl(result.url);
                                    
                                    // Salvar autorização no banco
                                    const { data: { session } } = await supabase.auth.getSession();
                                    const { data: autorizacao, error: saveError } = await supabase
                                      .from("autorizacoes_processo")
                                      .insert({
                                        cotacao_id: cotacaoSelecionada.id,
                                        tipo_autorizacao: 'compra_direta',
                                        url_arquivo: result.url,
                                        nome_arquivo: result.fileName,
                                        protocolo: result.protocolo,
                                        usuario_gerador_id: session?.user.id
                                      })
                                      .select()
                                      .single();
                                    
                                    if (saveError) throw saveError;
                                    setAutorizacaoDiretaId(autorizacao.id);
                                    
                                    toast.success("Autorização gerada e salva com sucesso");
                                  } catch (error) {
                                    console.error("Erro ao gerar autorização:", error);
                                    toast.error("Erro ao gerar autorização");
                                  }
                                }}
                                variant="outline"
                                className="w-full"
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Gerar Autorização
                              </Button>
                              {autorizacaoDiretaUrl && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex gap-2">
                                    <Button
                                      variant="secondary"
                                      onClick={() => window.open(autorizacaoDiretaUrl, '_blank')}
                                      className="flex-1"
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      Visualizar
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = autorizacaoDiretaUrl;
                                        link.download = `autorizacao-compra-direta-${processoSelecionado?.numero_processo_interno}.pdf`;
                                        link.click();
                                      }}
                                      className="flex-1"
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      Baixar
                                    </Button>
                                  </div>
                                  {isResponsavelLegal && autorizacaoDiretaId && (
                                    <Button
                                      variant="destructive"
                                      onClick={() => deletarAutorizacao(autorizacaoDiretaId, 'compra_direta')}
                                      size="sm"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Deletar Autorização
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mt-1">
                                <Input
                                  id="autorizacao-upload"
                                  type="file"
                                  accept=".pdf,.doc,.docx"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      setAutorizacaoAnexada(file);
                                      toast.success("Documento de autorização anexado");
                                    }
                                  }}
                                  disabled={uploadingAutorizacao}
                                  className="flex-1"
                                />
                                {autorizacaoAnexada && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setAutorizacaoAnexada(null);
                                      const input = document.getElementById('autorizacao-upload') as HTMLInputElement;
                                      if (input) input.value = '';
                                      toast.info("Documento de autorização removido");
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              {autorizacaoAnexada && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {autorizacaoAnexada.name}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        <Button 
                          onClick={() => setDialogFinalizarOpen(true)}
                          disabled={itens.length === 0 || (!autorizacaoDiretaUrl && !autorizacaoAnexada)}
                          size="lg"
                          className="md:w-auto w-full"
                        >
                          Verificar Documentação
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
                                <TableHead className="w-12">
                                  <Checkbox
                                    checked={itensDoLote.length > 0 && itensDoLote.every(item => itensSelecionados.has(item.id))}
                                    onCheckedChange={(checked) => {
                                      const novaSelecao = new Set(itensSelecionados);
                                      itensDoLote.forEach(item => {
                                        if (checked) {
                                          novaSelecao.add(item.id);
                                        } else {
                                          novaSelecao.delete(item.id);
                                        }
                                      });
                                      setItensSelecionados(novaSelecao);
                                    }}
                                  />
                                </TableHead>
                                <TableHead className="w-20">Item</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="w-24">Qtd</TableHead>
                                <TableHead className="w-24">Unid.</TableHead>
                                {processoSelecionado?.tipo === "material" && <TableHead className="w-32">Marca</TableHead>}
                                <TableHead className="w-32 text-right">Vlr. Unit.</TableHead>
                                <TableHead className="w-32 text-right">Vlr. Total</TableHead>
                                <TableHead className="w-32 text-right">Ações</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {itensDoLote.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={processoSelecionado?.tipo === "material" ? 9 : 8} className="text-center text-muted-foreground">
                                    Nenhum item neste lote
                                  </TableCell>
                                </TableRow>
                               ) : (
                                 <>
                                   {itensDoLote.map((item) => (
                                     <TableRow key={item.id}>
                                       <TableCell>
                                         <Checkbox
                                           checked={itensSelecionados.has(item.id)}
                                           onCheckedChange={(checked) => {
                                             const novaSelecao = new Set(itensSelecionados);
                                             if (checked) {
                                               novaSelecao.add(item.id);
                                             } else {
                                               novaSelecao.delete(item.id);
                                             }
                                             setItensSelecionados(novaSelecao);
                                           }}
                                         />
                                       </TableCell>
                                       <TableCell>{item.numero_item}</TableCell>
                                       <TableCell>{item.descricao}</TableCell>
                                       <TableCell>{item.quantidade}</TableCell>
                                       <TableCell>{item.unidade}</TableCell>
                                       {processoSelecionado?.tipo === "material" && (
                                         <TableCell>{item.marca || "-"}</TableCell>
                                       )}
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
                                    <TableCell></TableCell>
                                    <TableCell colSpan={processoSelecionado?.tipo === "material" ? 6 : 5} className="text-right font-semibold">
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
                        <TableHead className="w-12">
                          <Checkbox
                            checked={itens.length > 0 && itens.every(item => itensSelecionados.has(item.id))}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setItensSelecionados(new Set(itens.map(item => item.id)));
                              } else {
                                setItensSelecionados(new Set());
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead className="w-20">Item</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24">Qtd</TableHead>
                        <TableHead className="w-24">Unid.</TableHead>
                        {processoSelecionado?.tipo === "material" && <TableHead className="w-32">Marca</TableHead>}
                        <TableHead className="w-32 text-right">Vlr. Unit.</TableHead>
                        <TableHead className="w-32 text-right">Vlr. Total</TableHead>
                        <TableHead className="w-32 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={processoSelecionado?.tipo === "material" ? 9 : 8} className="text-center text-muted-foreground">
                            Nenhum item cadastrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {itens.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Checkbox
                                  checked={itensSelecionados.has(item.id)}
                                  onCheckedChange={(checked) => {
                                    const novaSelecao = new Set(itensSelecionados);
                                    if (checked) {
                                      novaSelecao.add(item.id);
                                    } else {
                                      novaSelecao.delete(item.id);
                                    }
                                    setItensSelecionados(novaSelecao);
                                  }}
                                />
                              </TableCell>
                              <TableCell>{item.numero_item}</TableCell>
                              <TableCell>{item.descricao}</TableCell>
                              <TableCell>{item.quantidade}</TableCell>
                              <TableCell>{item.unidade}</TableCell>
                              {processoSelecionado?.tipo === "material" && (
                                <TableCell>{item.marca || "-"}</TableCell>
                              )}
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
                            <TableCell></TableCell>
                            <TableCell colSpan={processoSelecionado?.tipo === "material" ? 6 : 5} className="text-right">TOTAL GERAL:</TableCell>
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
        tipoProcesso={processoSelecionado?.tipo}
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

      {/* Dialog Confirmar Exclusão */}
      <AlertDialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Excluir Itens
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itensSelecionados.size > 0 ? (
                <>
                  Você tem <strong>{itensSelecionados.size} {itensSelecionados.size === 1 ? 'item selecionado' : 'itens selecionados'}</strong>.
                  <br /><br />
                  Escolha uma opção:
                </>
              ) : (
                <>
                  Tem certeza que deseja excluir <strong>TODOS os {itens.length} itens</strong> desta cotação?
                  {criterioJulgamento === 'por_lote' && lotes.length > 0 && (
                    <>
                      <br /><br />
                      Esta ação também excluirá <strong>todos os {lotes.length} lotes</strong> criados.
                    </>
                  )}
                  <br /><br />
                  <span className="text-destructive font-semibold">Esta ação não pode ser desfeita!</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {itensSelecionados.size > 0 ? (
              <>
                <AlertDialogAction 
                  onClick={() => {
                    handleDeleteSelectedItems();
                    setConfirmDeleteAllOpen(false);
                  }}
                  className="bg-orange-600 text-white hover:bg-orange-700"
                >
                  Excluir Selecionados ({itensSelecionados.size})
                </AlertDialogAction>
                <AlertDialogAction 
                  onClick={() => {
                    handleDeleteAllItems();
                    setConfirmDeleteAllOpen(false);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir Todos ({itens.length})
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction 
                onClick={handleDeleteAllItems}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir Todos os Itens
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Cotacoes;
