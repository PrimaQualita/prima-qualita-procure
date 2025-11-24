import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Upload, Send, Gavel } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { DialogEnviarSelecao } from "@/components/selecoes/DialogEnviarSelecao";
import { DialogAnexarDocumentoSelecao } from "@/components/selecoes/DialogAnexarDocumentoSelecao";
import { SistemaLances } from "@/components/selecoes/SistemaLances";

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
  const [mostrarLances, setMostrarLances] = useState(false);

  useEffect(() => {
    if (selecaoId) {
      checkAuth();
      loadSelecao();
    }
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

      // Buscar a planilha consolidada mais recente até a data de criação da seleção
      const { data: planilha, error } = await supabase
        .from("planilhas_consolidadas")
        .select("fornecedores_incluidos, data_geracao")
        .eq("cotacao_id", cotacaoId)
        .lte("data_geracao", dataCriacaoSelecao)
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log("📊 Planilha encontrada:", planilha);
      console.log("❌ Erro:", error);

      if (error) {
        console.error("Erro ao buscar planilha:", error);
        throw error;
      }

      if (!planilha) {
        console.warn("⚠️ Nenhuma planilha consolidada encontrada para esta cotação até a data de criação");
        toast.error("Nenhuma planilha consolidada encontrada");
        return;
      }

      if (planilha?.fornecedores_incluidos) {
        const fornecedoresData = planilha.fornecedores_incluidos as any;
        console.log("👥 Dados dos fornecedores:", fornecedoresData);
        
        // Extrair itens da planilha consolidada
        const todosItens: Item[] = [];
        let total = 0;

        if (fornecedoresData.fornecedores && fornecedoresData.fornecedores.length > 0) {
          const primeiroFornecedor = fornecedoresData.fornecedores[0];
          console.log("🏢 Primeiro fornecedor:", primeiroFornecedor);
          
          if (primeiroFornecedor.itens) {
            primeiroFornecedor.itens.forEach((item: any) => {
              const valorUnitario = item.valores?.[0]?.valor || item.valor_unitario || 0;
              const valorTotalItem = valorUnitario * item.quantidade;
              
              todosItens.push({
                id: item.item_id || item.id,
                numero_item: item.numero_item,
                descricao: item.descricao,
                quantidade: item.quantidade,
                unidade: item.unidade,
                marca: item.marca,
                valor_unitario_estimado: valorUnitario,
                valor_total: valorTotalItem
              });

              total += valorTotalItem;
            });
          }
        }

        console.log("📦 Total de itens carregados:", todosItens.length);
        console.log("💰 Valor total:", total);

        setItens(todosItens);
        setValorTotal(total);
      } else {
        console.warn("⚠️ Planilha sem dados de fornecedores");
      }
    } catch (error) {
      console.error("❌ Erro ao carregar itens da planilha:", error);
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

  const handleEnviarFornecedores = () => {
    if (!avisoAnexado || !editalAnexado) {
      toast.error("É necessário anexar o Aviso de Seleção e o Edital antes de enviar aos fornecedores");
      return;
    }
    setDialogEnviarOpen(true);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
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
            <h1 className="text-3xl font-bold">{selecao.titulo_selecao}</h1>
            <p className="text-muted-foreground mt-1">
              Processo: {processo?.numero_processo_interno}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/selecoes")}>
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
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[250px]">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDialogAvisoOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {avisoAnexado ? "Atualizar Aviso de Seleção" : "Anexar Aviso de Seleção"}
                </Button>
                {avisoAnexado && (
                  <p className="text-sm text-green-600 mt-2">✓ Aviso anexado</p>
                )}
              </div>

              <div className="flex-1 min-w-[250px]">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDialogEditalOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {editalAnexado ? "Atualizar Edital" : "Anexar Edital"}
                </Button>
                {editalAnexado && (
                  <p className="text-sm text-green-600 mt-2">✓ Edital anexado</p>
                )}
              </div>

              <div className="flex-1 min-w-[250px]">
                <Button
                  variant="default"
                  className="w-full"
                  onClick={handleEnviarFornecedores}
                  disabled={!avisoAnexado || !editalAnexado}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Enviar para Fornecedores
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botão para Controle de Lances */}
        <div className="mb-6">
          <Button
            variant="default"
            size="lg"
            className="w-full"
            onClick={() => setMostrarLances(!mostrarLances)}
          >
            <Gavel className="h-5 w-5 mr-2" />
            {mostrarLances ? "Ocultar Sistema de Lances" : "Abrir Sistema de Lances"}
          </Button>
        </div>

        {/* Sistema de Lances */}
        {mostrarLances && (
          <SistemaLances
            selecaoId={selecaoId!}
            criterioJulgamento={selecao.criterios_julgamento || processo?.criterio_julgamento}
          />
        )}

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
    </div>
  );
};

export default DetalheSelecao;
