import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText, Gavel } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import primaLogo from "@/assets/prima-qualita-logo-horizontal.png";

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

const ParticiparSelecao = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selecaoId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [valorTotal, setValorTotal] = useState(0);
  const [avisoAnexado, setAvisoAnexado] = useState<any>(null);
  const [editalAnexado, setEditalAnexado] = useState<any>(null);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [valorLance, setValorLance] = useState("");
  const [observacaoLance, setObservacaoLance] = useState("");
  const [lances, setLances] = useState<any[]>([]);
  const [sessaoAtiva, setSessaoAtiva] = useState(false);

  useEffect(() => {
    if (selecaoId) {
      checkAuth();
    }
  }, [selecaoId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("É necessário estar autenticado para participar da seleção");
      navigate("/auth");
      return;
    }
    
    // Buscar fornecedor associado ao usuário
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
    await loadSelecao(fornecedorData.id);
  };

  const loadSelecao = async (fornecedorId: string) => {
    try {
      // Carregar seleção
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*)")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;

      // Verificar se o fornecedor foi convidado para esta seleção
      const { data: conviteData, error: conviteError } = await supabase
        .from("selecao_fornecedor_convites")
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorId)
        .single();

      if (conviteError || !conviteData) {
        toast.error("Você não foi convidado para esta seleção");
        navigate("/portal-fornecedor");
        return;
      }
      
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);

      // Verificar se a sessão está ativa
      const agora = new Date();
      const dataHoraSessao = new Date(`${selecaoData.data_sessao_disputa}T${selecaoData.hora_sessao_disputa}`);
      setSessaoAtiva(agora >= dataHoraSessao && selecaoData.status_selecao === "em_disputa");

      // Carregar itens
      if (selecaoData.cotacao_relacionada_id) {
        await loadItensFromPlanilha(selecaoData.cotacao_relacionada_id, selecaoData.created_at);
      }

      // Carregar documentos
      await loadDocumentosAnexados();

      // Carregar lances existentes
      await loadLances();

    } catch (error) {
      console.error("Erro ao carregar seleção:", error);
      toast.error("Erro ao carregar detalhes da seleção");
    } finally {
      setLoading(false);
    }
  };

  const loadItensFromPlanilha = async (cotacaoId: string, dataCriacaoSelecao: string) => {
    try {
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

      const { data: planilha } = planilhaResult;
      const { data: itensOriginais } = itensOriginaisResult;

      if (!planilha || !itensOriginais || itensOriginais.length === 0) {
        return;
      }

      const fornecedoresArray = planilha.fornecedores_incluidos as any[];
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

      setItens(todosItens);
      setValorTotal(total);
    } catch (error) {
      console.error("Erro ao carregar itens:", error);
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

  const loadLances = async () => {
    try {
      const { data, error } = await supabase
        .from("lances_fornecedores")
        .select("*, fornecedores(razao_social)")
        .eq("selecao_id", selecaoId)
        .order("data_hora_lance", { ascending: false });

      if (error) throw error;

      setLances(data || []);
    } catch (error) {
      console.error("Erro ao carregar lances:", error);
    }
  };

  const handleEnviarLance = async () => {
    if (!valorLance || parseFloat(valorLance) <= 0) {
      toast.error("Informe um valor válido para o lance");
      return;
    }

    if (!sessaoAtiva) {
      toast.error("A sessão de disputa não está ativa no momento");
      return;
    }

    // Verificar se há lances anteriores
    if (lances.length > 0) {
      const menorLanceAtual = Math.min(...lances.map(l => l.valor_lance));
      if (parseFloat(valorLance) >= menorLanceAtual) {
        toast.error("Seu lance deve ser menor que o lance atual de R$ " + menorLanceAtual.toFixed(2));
        return;
      }
    } else {
      // Se não há lances, verificar contra o valor total estimado
      if (parseFloat(valorLance) >= valorTotal) {
        toast.error("Seu lance deve ser menor que o valor estimado de R$ " + valorTotal.toFixed(2));
        return;
      }
    }

    try {
      const { error } = await supabase
        .from("lances_fornecedores")
        .insert({
          selecao_id: selecaoId,
          fornecedor_id: fornecedor.id,
          valor_lance: parseFloat(valorLance),
          observacao_lance: observacaoLance || null,
        });

      if (error) throw error;

      toast.success("Lance enviado com sucesso!");
      setValorLance("");
      setObservacaoLance("");
      loadLances();
    } catch (error) {
      console.error("Erro ao enviar lance:", error);
      toast.error("Erro ao enviar lance");
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src={primaLogo} alt="Prima Qualitá" className="w-64 mx-auto mb-6" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!selecao) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src={primaLogo} alt="Prima Qualitá" className="w-64 mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4">Seleção não encontrada</h2>
          <Button onClick={() => navigate("/portal-fornecedor")}>
            Voltar para Portal do Fornecedor
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <img src={primaLogo} alt="Prima Qualitá" className="w-64 mx-auto mb-4" />
          <h1 className="text-3xl font-bold">{selecao.titulo_selecao}</h1>
          <p className="text-muted-foreground mt-2">
            Processo: {processo?.numero_processo_interno}
          </p>
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
                <Badge variant={selecao.status_selecao === "em_disputa" ? "default" : "secondary"}>
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
            <CardDescription>Leia atentamente antes de participar da disputa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {avisoAnexado && (
                <Button
                  variant="outline"
                  onClick={() => window.open(avisoAnexado.url_arquivo, '_blank')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Ver Aviso de Seleção
                </Button>
              )}
              {editalAnexado && (
                <Button
                  variant="outline"
                  onClick={() => window.open(editalAnexado.url_arquivo, '_blank')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Ver Edital
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sistema de Lances */}
        {sessaoAtiva && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5" />
                Enviar Lance
              </CardTitle>
              <CardDescription>
                A sessão de disputa está ativa. Envie seu lance para participar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Valor do Lance (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={valorLance}
                  onChange={(e) => setValorLance(e.target.value)}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Seu lance deve ser menor que o lance atual
                </p>
              </div>

              <div>
                <Label>Observação (opcional)</Label>
                <Input
                  placeholder="Adicione uma observação ao seu lance"
                  value={observacaoLance}
                  onChange={(e) => setObservacaoLance(e.target.value)}
                />
              </div>

              <Button onClick={handleEnviarLance} className="w-full">
                <Gavel className="h-4 w-4 mr-2" />
                Enviar Lance
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Histórico de Lances */}
        {lances.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Histórico de Lances</CardTitle>
              <CardDescription>Acompanhe os lances enviados durante a sessão</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lances.map((lance) => (
                    <TableRow key={lance.id}>
                      <TableCell>
                        {new Date(lance.data_hora_lance).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {lance.fornecedores?.razao_social || "Fornecedor"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(lance.valor_lance)}
                      </TableCell>
                      <TableCell>{lance.observacao_lance || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Itens da Seleção */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Itens da Seleção</CardTitle>
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
                  <TableHead className="text-right">Vlr. Unit. Est.</TableHead>
                  <TableHead className="text-right">Vlr. Total Est.</TableHead>
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
                        VALOR TOTAL ESTIMADO
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(valorTotal)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Botão Voltar */}
        <div className="text-center">
          <Button variant="outline" onClick={() => navigate("/portal-fornecedor")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Portal do Fornecedor
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ParticiparSelecao;
