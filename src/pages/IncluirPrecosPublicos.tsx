import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { toast } from "sonner";
import { Upload, FileText, X } from "lucide-react";
import { gerarPropostaFornecedorPDF } from "@/lib/gerarPropostaFornecedorPDF";

interface ItemCotacao {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_estimado: number | null;
}

interface RespostaItem {
  item_id: string;
  valor_unitario: string;
}

interface ArquivoComprovante {
  file: File;
  item_id: string;
}

const IncluirPrecosPublicos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cotacaoIdParam = searchParams.get("cotacao");

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [cotacao, setCotacao] = useState<any>(null);
  const [processoCompra, setProcessoCompra] = useState<any>(null);
  const [itens, setItens] = useState<ItemCotacao[]>([]);
  
  const [nomeFonte, setNomeFonte] = useState("");
  const [respostas, setRespostas] = useState<{ [key: string]: RespostaItem }>({});
  const [observacoes, setObservacoes] = useState("");
  const [arquivosComprovantes, setArquivosComprovantes] = useState<ArquivoComprovante[]>([]);

  useEffect(() => {
    if (cotacaoIdParam) {
      loadCotacao();
    }
  }, [cotacaoIdParam]);

  const loadCotacao = async () => {
    try {
      setLoading(true);

      const { data: cotacaoData, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("*, processos_compras(*)")
        .eq("id", cotacaoIdParam)
        .single();

      if (cotacaoError) throw cotacaoError;

      setCotacao(cotacaoData);
      setProcessoCompra(cotacaoData.processos_compras);

      const { data: itensData, error: itensError } = await supabase
        .from("itens_cotacao")
        .select("*")
        .eq("cotacao_id", cotacaoIdParam)
        .order("numero_item");

      if (itensError) throw itensError;

      setItens(itensData || []);

      const respostasIniciais: { [key: string]: RespostaItem } = {};
      (itensData || []).forEach((item) => {
        respostasIniciais[item.id] = {
          item_id: item.id,
          valor_unitario: "",
        };
      });
      setRespostas(respostasIniciais);

    } catch (error: any) {
      console.error("Erro ao carregar cotação:", error);
      toast.error("Erro ao carregar cotação");
    } finally {
      setLoading(false);
    }
  };

  const handleAddComprovante = (itemId: string, file: File) => {
    setArquivosComprovantes(prev => {
      const filtered = prev.filter(a => a.item_id !== itemId);
      return [...filtered, { file, item_id: itemId }];
    });
  };

  const handleRemoveComprovante = (itemId: string) => {
    setArquivosComprovantes(prev => prev.filter(a => a.item_id !== itemId));
  };

  const calcularValorTotal = () => {
    let total = 0;
    itens.forEach((item) => {
      const resposta = respostas[item.id];
      if (resposta && resposta.valor_unitario) {
        const valorUnitario = parseFloat(resposta.valor_unitario.replace(/,/g, "."));
        if (!isNaN(valorUnitario)) {
          total += valorUnitario * item.quantidade;
        }
      }
    });
    return total;
  };

  const handleSubmit = async () => {
    try {
      if (!nomeFonte.trim()) {
        toast.error("Por favor, informe o nome da fonte dos preços");
        return;
      }

      const todosPreenchidos = itens.every((item) => {
        const resposta = respostas[item.id];
        return resposta && resposta.valor_unitario && parseFloat(resposta.valor_unitario.replace(/,/g, ".")) > 0;
      });

      if (!todosPreenchidos) {
        toast.error("Por favor, preencha todos os valores unitários");
        return;
      }

      setEnviando(true);

      const valorTotal = calcularValorTotal();

      // Buscar ou criar fornecedor com nome especial para preços públicos
      const cnpjPrecosPublicos = "00000000000000";
      let fornecedorId: string;

      const { data: fornecedorExistente } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("cnpj", cnpjPrecosPublicos)
        .single();

      if (fornecedorExistente) {
        fornecedorId = fornecedorExistente.id;
      } else {
        const { data: novoFornecedor, error: errorFornecedor } = await supabase
          .from("fornecedores")
          .insert({
            razao_social: "Preços Públicos",
            cnpj: cnpjPrecosPublicos,
            email: "precos.publicos@sistema.com",
            telefone: "00000000000",
            endereco_comercial: "Sistema",
          })
          .select()
          .single();

        if (errorFornecedor) throw errorFornecedor;
        fornecedorId = novoFornecedor.id;
      }

      // Criar resposta da cotação
      const { data: respostaCotacao, error: errorResposta } = await supabase
        .from("cotacao_respostas_fornecedor")
        .insert({
          cotacao_id: cotacaoIdParam,
          fornecedor_id: fornecedorId,
          valor_total_anual_ofertado: valorTotal,
          observacoes_fornecedor: `Fonte: ${nomeFonte}\n\n${observacoes}`,
          data_envio_resposta: new Date().toISOString(),
        })
        .select()
        .single();

      if (errorResposta) throw errorResposta;

      // Gerar PDF da proposta
      const dadosFornecedor = {
        razao_social: `Preços Públicos - ${nomeFonte}`,
        cnpj: cnpjPrecosPublicos,
        endereco_comercial: "Sistema",
      };

      const { url: urlProposta, nome: nomeProposta } = await gerarPropostaFornecedorPDF(
        respostaCotacao.id,
        dadosFornecedor,
        valorTotal,
        `Fonte: ${nomeFonte}\n\n${observacoes}`,
        cotacao.titulo_cotacao
      );

      // Salvar anexo da proposta
      await supabase.from("anexos_cotacao_fornecedor").insert({
        cotacao_resposta_fornecedor_id: respostaCotacao.id,
        tipo_anexo: "proposta",
        nome_arquivo: nomeProposta,
        url_arquivo: urlProposta,
      });

      // Salvar comprovantes em PDF
      for (const comprovante of arquivosComprovantes) {
        const nomeArquivo = `comprovante_${comprovante.item_id}_${Date.now()}.pdf`;
        
        const { error: uploadError } = await supabase.storage
          .from("processo-anexos")
          .upload(nomeArquivo, comprovante.file);

        if (uploadError) throw uploadError;

        await supabase.from("anexos_cotacao_fornecedor").insert({
          cotacao_resposta_fornecedor_id: respostaCotacao.id,
          tipo_anexo: "comprovante",
          nome_arquivo: comprovante.file.name,
          url_arquivo: nomeArquivo,
        });
      }

      // Inserir itens da resposta
      const itensResposta = itens.map((item) => ({
        cotacao_resposta_fornecedor_id: respostaCotacao.id,
        item_cotacao_id: item.id,
        valor_unitario_ofertado: parseFloat(respostas[item.id].valor_unitario.replace(/,/g, ".")),
        marca: null,
      }));

      const { error: errorItens } = await supabase
        .from("respostas_itens_fornecedor")
        .insert(itensResposta);

      if (errorItens) throw errorItens;

      toast.success("Preços públicos incluídos com sucesso!");
      
      setTimeout(() => {
        navigate("/cotacoes");
      }, 1500);

    } catch (error: any) {
      console.error("Erro ao incluir preços públicos:", error);
      toast.error("Erro ao incluir preços públicos: " + (error.message || "Erro desconhecido"));
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Carregando...</p>
      </div>
    );
  }

  if (!cotacao) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cotação não encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center justify-center mb-6">
          <img src={primaLogo} alt="Prima Qualitá" className="h-16" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Incluir Preços Públicos</CardTitle>
            <CardDescription>
              {cotacao.titulo_cotacao}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dados da Fonte */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Dados da Fonte</h3>
              
              <div>
                <Label htmlFor="nome-fonte">Nome da Fonte dos Preços *</Label>
                <Input
                  id="nome-fonte"
                  value={nomeFonte}
                  onChange={(e) => setNomeFonte(e.target.value)}
                  placeholder="Ex: Banco de Preços em Saúde, Painel de Preços, etc."
                  required
                />
              </div>
            </div>

            {/* Tabela de Itens */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Itens da Cotação</h3>
              
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Item</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-24">Qtd</TableHead>
                      <TableHead className="w-24">Unid</TableHead>
                      <TableHead className="w-40">Valor Unit. (R$) *</TableHead>
                      <TableHead className="w-32">Vlr Total</TableHead>
                      <TableHead className="w-40">Comprovante</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((item) => {
                      const resposta = respostas[item.id];
                      const valorUnitario = resposta?.valor_unitario 
                        ? parseFloat(resposta.valor_unitario.replace(/,/g, "."))
                        : 0;
                      const valorTotal = valorUnitario * item.quantidade;
                      const comprovante = arquivosComprovantes.find(a => a.item_id === item.id);

                      return (
                        <TableRow key={item.id}>
                          <TableCell>{item.numero_item}</TableCell>
                          <TableCell>{item.descricao}</TableCell>
                          <TableCell>{item.quantidade}</TableCell>
                          <TableCell>{item.unidade}</TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              value={resposta?.valor_unitario || ""}
                              onChange={(e) => {
                                const valor = e.target.value.replace(/[^0-9,]/g, "");
                                setRespostas({
                                  ...respostas,
                                  [item.id]: { ...resposta, valor_unitario: valor },
                                });
                              }}
                              placeholder="0,00"
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {!isNaN(valorTotal) && valorTotal > 0
                              ? `R$ ${valorTotal.toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : "R$ 0,00"}
                          </TableCell>
                          <TableCell>
                            {comprovante ? (
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                <span className="text-sm truncate max-w-[100px]" title={comprovante.file.name}>
                                  {comprovante.file.name}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveComprovante(item.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div>
                                <input
                                  type="file"
                                  accept=".pdf"
                                  id={`comprovante-${item.id}`}
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      if (file.type !== "application/pdf") {
                                        toast.error("Apenas arquivos PDF são permitidos");
                                        return;
                                      }
                                      handleAddComprovante(item.id, file);
                                      toast.success("Comprovante anexado");
                                    }
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => document.getElementById(`comprovante-${item.id}`)?.click()}
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Anexar PDF
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={5} className="text-right">
                        VALOR TOTAL:
                      </TableCell>
                      <TableCell className="text-right text-lg">
                        R${" "}
                        {calcularValorTotal().toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Observações */}
            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Observações adicionais..."
                rows={4}
              />
            </div>

            {/* Botão Enviar */}
            <div className="flex justify-end gap-4">
              <Button
                variant="outline"
                onClick={() => navigate("/cotacoes")}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={enviando || !nomeFonte.trim()}
              >
                {enviando ? "Incluindo..." : "Incluir Preços Públicos"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IncluirPrecosPublicos;
