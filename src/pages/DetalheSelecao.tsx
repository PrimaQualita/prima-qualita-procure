import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, FileText, Upload, Send, Gavel, Link, ClipboardCheck, FileCheck, Eye, Trash2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { DialogEnviarSelecao } from "@/components/selecoes/DialogEnviarSelecao";
import { DialogAnexarDocumentoSelecao } from "@/components/selecoes/DialogAnexarDocumentoSelecao";
import { DialogSessaoLances } from "@/components/selecoes/DialogSessaoLances";
import { DialogAnaliseDocumentalSelecao } from "@/components/selecoes/DialogAnaliseDocumentalSelecao";
import { DialogEnviarAtaAssinatura } from "@/components/selecoes/DialogEnviarAtaAssinatura";
import { gerarAtaSelecaoPDF } from "@/lib/gerarAtaSelecaoPDF";

interface Item {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca?: string;
  valor_unitario_estimado: number;
  valor_total: number;
}

const DetalheSelecao = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selecaoId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [valorTotal, setValorTotal] = useState(0);
  const [dialogEnviarOpen, setDialogEnviarOpen] = useState(false);
  const [dialogAvisoOpen, setDialogAvisoOpen] = useState(false);
  const [dialogEditalOpen, setDialogEditalOpen] = useState(false);
  const [avisoAnexado, setAvisoAnexado] = useState<any>(null);
  const [editalAnexado, setEditalAnexado] = useState<any>(null);
  const [confirmDeleteAviso, setConfirmDeleteAviso] = useState(false);
  const [confirmDeleteEdital, setConfirmDeleteEdital] = useState(false);
  const [dialogSessaoOpen, setDialogSessaoOpen] = useState(false);
  const [dialogAnaliseDocumentalOpen, setDialogAnaliseDocumentalOpen] = useState(false);
  const [gerandoAta, setGerandoAta] = useState(false);
  const [atasGeradas, setAtasGeradas] = useState<any[]>([]);
  const [confirmDeleteAta, setConfirmDeleteAta] = useState<string | null>(null);
  const [dialogEnviarAtaAssinaturaOpen, setDialogEnviarAtaAssinaturaOpen] = useState(false);
  const [ataParaEnviar, setAtaParaEnviar] = useState<string | null>(null);

  useEffect(() => {
    if (selecaoId) {
      checkAuth();
      loadSelecao();
    }
  }, [selecaoId]);

  // Realtime subscription para atualizar atas quando assinaturas mudam
  useEffect(() => {
    if (!selecaoId) return;

    const regenerarPDFSeNecessario = async (payload: any) => {
      // Se uma assinatura foi atualizada para "aceito", regenerar o PDF
      if (payload.new?.status_assinatura === 'aceito' && payload.old?.status_assinatura !== 'aceito') {
        console.log('Nova assinatura detectada - regenerando PDF...');
        const ataId = payload.new.ata_id;
        if (ataId) {
          try {
            const { atualizarAtaComAssinaturas } = await import('@/lib/gerarAtaSelecaoPDF');
            await atualizarAtaComAssinaturas(ataId);
            console.log('PDF regenerado com sucesso!');
          } catch (error) {
            console.error('Erro ao regenerar PDF:', error);
          }
        }
      }
      loadAtasGeradas();
    };

    const channel = supabase
      .channel(`atas-selecao-${selecaoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atas_selecao',
          filter: `selecao_id=eq.${selecaoId}`
        },
        () => {
          console.log('Ata atualizada - recarregando...');
          loadAtasGeradas();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'atas_assinaturas_fornecedor'
        },
        (payload) => {
          console.log('Assinatura de fornecedor atualizada:', payload);
          regenerarPDFSeNecessario(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'atas_assinaturas_usuario'
        },
        (payload) => {
          console.log('Assinatura de usuário atualizada:', payload);
          regenerarPDFSeNecessario(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selecaoId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const loadSelecao = async () => {
    try {
      // Carregar seleção
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*)")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);

      // Carregar planilha consolidada da cotação relacionada usando a data de criação da seleção
      if (selecaoData.cotacao_relacionada_id) {
        await loadItensFromPlanilha(selecaoData.cotacao_relacionada_id, selecaoData.created_at);
      }

      // Carregar documentos anexados
      await loadDocumentosAnexados();

      // Carregar atas geradas
      await loadAtasGeradas();

    } catch (error) {
      console.error("Erro ao carregar seleção:", error);
      toast.error("Erro ao carregar detalhes da seleção");
    } finally {
      setLoading(false);
    }
  };

  const loadItensFromPlanilha = async (cotacaoId: string, dataCriacaoSelecao: string) => {
    try {
      console.log("🔍 Buscando planilha para cotacao:", cotacaoId);
      console.log("📅 Data limite:", dataCriacaoSelecao);

      // Buscar a planilha consolidada E os itens originais da cotação
      const [planilhaResult, itensOriginaisResult] = await Promise.all([
        supabase
          .from("planilhas_consolidadas")
          .select("fornecedores_incluidos, data_geracao")
          .eq("cotacao_id", cotacaoId)
          .lte("data_geracao", dataCriacaoSelecao)
          .order("data_geracao", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("itens_cotacao")
          .select("*")
          .eq("cotacao_id", cotacaoId)
          .order("numero_item", { ascending: true })
      ]);

      const { data: planilha, error: planilhaError } = planilhaResult;
      const { data: itensOriginais, error: itensError } = itensOriginaisResult;

      console.log("📊 Planilha encontrada:", planilha);
      console.log("📋 Itens originais:", itensOriginais);

      if (planilhaError) throw planilhaError;
      if (itensError) throw itensError;

      if (!planilha) {
        console.warn("⚠️ Nenhuma planilha consolidada encontrada");
        toast.error("Nenhuma planilha consolidada encontrada");
        return;
      }

      if (!itensOriginais || itensOriginais.length === 0) {
        console.warn("⚠️ Nenhum item original encontrado");
        toast.error("Nenhum item encontrado na cotação");
        return;
      }

      // Criar mapa de itens originais por numero_item
      const mapaItens = new Map(
        itensOriginais.map(item => [item.numero_item, item])
      );

      // Extrair itens da planilha consolidada
      const fornecedoresArray = planilha.fornecedores_incluidos as any[];
      console.log("👥 Total de fornecedores:", fornecedoresArray?.length || 0);

      if (!fornecedoresArray || fornecedoresArray.length === 0) {
        console.warn("⚠️ Planilha sem fornecedores");
        toast.error("Planilha consolidada sem dados");
        return;
      }

      // Calcular o menor valor de cada item entre todos os fornecedores
      const menoresValoresPorItem = new Map<number, number>();

      fornecedoresArray.forEach((fornecedor: any) => {
        if (fornecedor.itens) {
          fornecedor.itens.forEach((item: any) => {
            const valorAtual = menoresValoresPorItem.get(item.numero_item);
            const valorItem = item.valor_unitario || 0;
            
            if (!valorAtual || valorItem < valorAtual) {
              menoresValoresPorItem.set(item.numero_item, valorItem);
            }
          });
        }
      });

      console.log("💵 Menores valores por item:", menoresValoresPorItem);

      // Usar os menores valores como valores estimados para a seleção
      const todosItens: Item[] = [];
      let total = 0;

      itensOriginais.forEach((itemOriginal) => {
        const valorEstimado = menoresValoresPorItem.get(itemOriginal.numero_item) || 0;
        const valorTotalItem = valorEstimado * itemOriginal.quantidade;
        
        todosItens.push({
          id: itemOriginal.id,
          numero_item: itemOriginal.numero_item,
          descricao: itemOriginal.descricao,
          quantidade: itemOriginal.quantidade,
          unidade: itemOriginal.unidade,
          marca: itemOriginal.marca,
          valor_unitario_estimado: valorEstimado,
          valor_total: valorTotalItem
        });

        total += valorTotalItem;
      });

      console.log("📦 Total de itens carregados:", todosItens.length);
      console.log("💰 Valor total:", total);

      setItens(todosItens);
      setValorTotal(total);
    } catch (error) {
      console.error("❌ Erro ao carregar itens:", error);
      toast.error("Erro ao carregar itens");
    }
  };

  const loadDocumentosAnexados = async () => {
    try {
      const { data, error } = await supabase
        .from("anexos_selecao")
        .select("*")
        .eq("selecao_id", selecaoId);

      if (error) throw error;

      if (data) {
        const aviso = data.find(d => d.tipo_documento === "aviso");
        const edital = data.find(d => d.tipo_documento === "edital");
        
        setAvisoAnexado(aviso);
        setEditalAnexado(edital);
      }
    } catch (error) {
      console.error("Erro ao carregar documentos:", error);
    }
  };

  const loadAtasGeradas = async () => {
    try {
      const { data, error } = await supabase
        .from("atas_selecao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .order("data_geracao", { ascending: false });

      if (error) throw error;
      setAtasGeradas(data || []);
    } catch (error) {
      console.error("Erro ao carregar atas:", error);
    }
  };

  const handleDeleteAta = async (ataId: string) => {
    try {
      const ata = atasGeradas.find(a => a.id === ataId);
      if (ata) {
        // Deletar do storage
        const storagePath = `atas-selecao/${selecaoId}/${ata.nome_arquivo}`;
        await supabase.storage.from("processo-anexos").remove([storagePath]);
      }

      // Deletar do banco
      const { error } = await supabase
        .from("atas_selecao")
        .delete()
        .eq("id", ataId);

      if (error) throw error;

      toast.success("Ata excluída com sucesso!");
      await loadAtasGeradas();
    } catch (error) {
      console.error("Erro ao excluir ata:", error);
      toast.error("Erro ao excluir ata");
    } finally {
      setConfirmDeleteAta(null);
    }
  };

  const handleAbrirEnviarAtaAssinatura = (ataId: string) => {
    setAtaParaEnviar(ataId);
    setDialogEnviarAtaAssinaturaOpen(true);
  };

  const handleEnviarFornecedores = () => {
    setDialogEnviarOpen(true);
  };

  const handleVoltar = () => {
    // Voltar para a visualização de seleções do processo
    if (selecao?.processo_compra_id) {
      navigate(`/selecoes?processo=${selecao.processo_compra_id}`);
    } else {
      navigate(-1);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const handleFinalizarSessao = async () => {
    if (!selecaoId) return;

    try {
      const { error } = await supabase
        .from("selecoes_fornecedores")
        .update({ sessao_finalizada: true })
        .eq("id", selecaoId);

      if (error) throw error;

      toast.success("Sessão de lances finalizada! Análise Documental disponível.");
      
      // Recarregar dados da seleção
      await loadSelecao();
    } catch (error) {
      console.error("Erro ao finalizar sessão:", error);
      toast.error("Erro ao finalizar sessão de lances");
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!selecao) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Seleção não encontrada</h2>
          <Button onClick={() => navigate("/selecoes")}>Voltar para Seleções</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              {selecao.numero_selecao && (
                <Badge variant="outline" className="text-lg font-semibold px-3 py-1">
                  {selecao.numero_selecao}
                </Badge>
              )}
              <h1 className="text-3xl font-bold">{selecao.titulo_selecao}</h1>
            </div>
            <p className="text-muted-foreground mt-1">
              Processo: {processo?.numero_processo_interno}
            </p>
          </div>
          <Button variant="outline" onClick={handleVoltar}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>

        {/* Informações da Seleção */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Informações da Seleção</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={selecao.status_selecao === "planejada" ? "default" : "secondary"}>
                  {selecao.status_selecao}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data da Sessão</p>
                <p className="font-medium">
                  {selecao.data_sessao_disputa.split('T')[0].split('-').reverse().join('/')} às {selecao.hora_sessao_disputa}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Critério de Julgamento</p>
                <p className="font-medium">{selecao.criterios_julgamento || processo?.criterio_julgamento}</p>
              </div>
            </div>
            {selecao.descricao && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">Descrição</p>
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selecao.descricao) }} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentos */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Documentos da Seleção</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Aviso de Seleção */}
              <div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDialogAvisoOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {avisoAnexado ? "Atualizar Aviso de Seleção" : "Anexar Aviso de Seleção"}
                </Button>
                {avisoAnexado && (
                  <div className="flex gap-2 mt-2">
                    <p className="text-sm text-green-600 flex-1">✓ Aviso anexado</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(avisoAnexado.url_arquivo, '_blank')}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Visualizar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => setConfirmDeleteAviso(true)}
                    >
                      Excluir
                    </Button>
                  </div>
                )}
              </div>

              {/* Edital */}
              <div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDialogEditalOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {editalAnexado ? "Atualizar Edital" : "Anexar Edital"}
                </Button>
                {editalAnexado && (
                  <div className="flex gap-2 mt-2">
                    <p className="text-sm text-green-600 flex-1">✓ Edital anexado</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(editalAnexado.url_arquivo, '_blank')}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Visualizar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => setConfirmDeleteEdital(true)}
                    >
                      Excluir
                    </Button>
                  </div>
                )}
              </div>

              {/* Gerar Link para Fornecedores */}
              <Button
                variant="default"
                className="w-full"
                onClick={handleEnviarFornecedores}
              >
                <Link className="h-4 w-4 mr-2" />
                Gerar Link para Fornecedores
              </Button>

              {/* Ver Propostas */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/propostas-selecao?selecao=${selecaoId}`)}
              >
                <FileText className="h-4 w-4 mr-2" />
                Ver Propostas
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Botão de Sessão de Lances */}
        <div className="mb-6 space-y-3">
          <Button
            variant="default"
            size="lg"
            className="w-full"
            onClick={() => setDialogSessaoOpen(true)}
          >
            <Gavel className="h-5 w-5 mr-2" />
            Abrir Sessão de Lances (Controle + Chat + Sistema de Lances)
          </Button>
          
          {/* Análise Documental - só disponível após finalizar sessão */}
          {selecao.sessao_finalizada && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setDialogAnaliseDocumentalOpen(true)}
            >
              <ClipboardCheck className="h-5 w-5 mr-2" />
              Análise Documental
            </Button>
          )}
          
          {/* Gerar Ata */}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={gerandoAta}
            onClick={async () => {
              setGerandoAta(true);
              try {
                const resultado = await gerarAtaSelecaoPDF(selecaoId!);
                toast.success("Ata gerada com sucesso!");
                await loadAtasGeradas();
              } catch (error) {
                console.error("Erro ao gerar ata:", error);
                toast.error("Erro ao gerar Ata");
              } finally {
                setGerandoAta(false);
              }
            }}
          >
            <FileCheck className="h-5 w-5 mr-2" />
            {gerandoAta ? "Gerando..." : "Gerar Ata"}
          </Button>

          {/* Atas Geradas */}
          {atasGeradas.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Atas Geradas</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-2">
                  {atasGeradas.map((ata) => (
                    <div key={ata.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{ata.nome_arquivo}</p>
                        <p className="text-xs text-muted-foreground">
                          Gerada em: {new Date(ata.data_geracao).toLocaleString("pt-BR")}
                          {ata.enviada_fornecedores && (
                            <span className="ml-2 text-green-600">• Enviada aos fornecedores</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(ata.url_arquivo, "_blank")}
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setConfirmDeleteAta(ata.id)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {!ata.enviada_fornecedores && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAbrirEnviarAtaAssinatura(ata.id)}
                            title="Enviar para Assinatura"
                          >
                            <SendHorizontal className="h-4 w-4 mr-1" />
                            Enviar para Assinatura
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Itens da Cotação */}
        <Card>
          <CardHeader>
            <CardTitle>Itens da Seleção (Planilha Consolidada)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Unid.</TableHead>
                  {processo?.tipo === "material" && <TableHead>Marca</TableHead>}
                  <TableHead className="text-right">Vlr. Unit.</TableHead>
                  <TableHead className="text-right">Vlr. Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nenhum item encontrado
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
                        {processo?.tipo === "material" && <TableCell>{item.marca || "-"}</TableCell>}
                        <TableCell className="text-right">{formatCurrency(item.valor_unitario_estimado)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.valor_total)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted font-bold">
                      <TableCell colSpan={processo?.tipo === "material" ? 6 : 5} className="text-right">
                        VALOR TOTAL GERAL
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(valorTotal)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <DialogEnviarSelecao
        open={dialogEnviarOpen}
        onOpenChange={setDialogEnviarOpen}
        selecaoId={selecaoId!}
        tituloSelecao={selecao.titulo_selecao}
        dataDisputa={selecao.data_sessao_disputa}
        horaDisputa={selecao.hora_sessao_disputa}
      />

      <DialogSessaoLances
        open={dialogSessaoOpen}
        onOpenChange={setDialogSessaoOpen}
        selecaoId={selecaoId!}
        itens={itens}
        criterioJulgamento={selecao?.criterios_julgamento || processo?.criterio_julgamento || "Menor Preço Global"}
        sessaoFinalizada={selecao?.sessao_finalizada || false}
        onFinalizarSessao={handleFinalizarSessao}
      />

      <DialogAnaliseDocumentalSelecao
        open={dialogAnaliseDocumentalOpen}
        onOpenChange={setDialogAnaliseDocumentalOpen}
        selecaoId={selecaoId!}
        onReabrirNegociacao={async (itensParaReabrir, fornecedorId) => {
          try {
            // Reabrir os itens para lances
            for (const item of itensParaReabrir) {
              // Verificar se já existe registro do item
              const { data: existing } = await supabase
                .from("itens_abertos_lances")
                .select("id")
                .eq("selecao_id", selecaoId!)
                .eq("numero_item", item)
                .maybeSingle();

              if (existing) {
                // Atualizar item existente para reabrir
                await supabase
                  .from("itens_abertos_lances")
                  .update({
                    aberto: true,
                    em_negociacao: true,
                    fornecedor_negociacao_id: fornecedorId || null,
                    data_abertura: new Date().toISOString(),
                    data_fechamento: null,
                    iniciando_fechamento: false,
                    data_inicio_fechamento: null,
                  })
                  .eq("id", existing.id);
              } else {
                // Criar novo registro
                await supabase
                  .from("itens_abertos_lances")
                  .insert({
                    selecao_id: selecaoId!,
                    numero_item: item,
                    aberto: true,
                    em_negociacao: true,
                    fornecedor_negociacao_id: fornecedorId || null,
                  });
              }
            }

            toast.success(`Itens ${itensParaReabrir.join(", ")} reabertos para negociação!`);
            
            // Abrir a sessão de lances
            setDialogSessaoOpen(true);
          } catch (error) {
            console.error("Erro ao reabrir negociação:", error);
            toast.error("Erro ao reabrir itens para negociação");
          }
        }}
      />

      <DialogAnexarDocumentoSelecao
        open={dialogAvisoOpen}
        onOpenChange={setDialogAvisoOpen}
        selecaoId={selecaoId!}
        tipoDocumento="aviso"
        titulo="Anexar Aviso de Seleção"
        onSuccess={() => {
          loadDocumentosAnexados();
          setDialogAvisoOpen(false);
        }}
      />

      <DialogAnexarDocumentoSelecao
        open={dialogEditalOpen}
        onOpenChange={setDialogEditalOpen}
        selecaoId={selecaoId!}
        tipoDocumento="edital"
        titulo="Anexar Edital"
        onSuccess={() => {
          loadDocumentosAnexados();
          setDialogEditalOpen(false);
        }}
      />

      {/* Confirmação de exclusão de Aviso */}
      <AlertDialog open={confirmDeleteAviso} onOpenChange={setConfirmDeleteAviso}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o Aviso de Seleção? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const { error } = await supabase
                  .from("anexos_selecao")
                  .delete()
                  .eq("id", avisoAnexado.id);
                
                if (error) {
                  toast.error("Erro ao excluir documento");
                } else {
                  toast.success("Documento excluído com sucesso");
                  loadDocumentosAnexados();
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão de Edital */}
      <AlertDialog open={confirmDeleteEdital} onOpenChange={setConfirmDeleteEdital}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o Edital? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const { error } = await supabase
                  .from("anexos_selecao")
                  .delete()
                  .eq("id", editalAnexado.id);
                
                if (error) {
                  toast.error("Erro ao excluir documento");
                } else {
                  toast.success("Documento excluído com sucesso");
                  loadDocumentosAnexados();
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão de Ata */}
      <AlertDialog open={!!confirmDeleteAta} onOpenChange={(open) => !open && setConfirmDeleteAta(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta Ata? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteAta && handleDeleteAta(confirmDeleteAta)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para enviar ata para assinatura */}
      {ataParaEnviar && (
        <DialogEnviarAtaAssinatura
          open={dialogEnviarAtaAssinaturaOpen}
          onOpenChange={(open) => {
            setDialogEnviarAtaAssinaturaOpen(open);
            if (!open) setAtaParaEnviar(null);
          }}
          ataId={ataParaEnviar}
          selecaoId={selecaoId!}
          onSuccess={loadAtasGeradas}
        />
      )}
    </div>
  );
};

export default DetalheSelecao;
