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
  marca: string;
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
  const [arquivosComprovantes, setArquivosComprovantes] = useState<File[]>([]);

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
          marca: "",
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

  const gerarTemplate = () => {
    // Template simplificado com apenas Valor Unitário e Marca
    const csvContent = [
      ['Número Item', 'Valor Unitário', 'Marca'],
      ...itens.map(item => [
        item.numero_item.toString(),
        '', // Valor vazio para preencher
        '' // Marca vazia para preencher
      ])
    ].map(row => row.join('\t')).join('\n');

    // Usar UTF-8 BOM para garantir compatibilidade
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `template_precos_publicos_${cotacao?.titulo_cotacao || 'cotacao'}.csv`;
    link.click();
    toast.success("Template baixado com sucesso!");
  };

  const importarTemplate = async (file: File) => {
    try {
      // Tentar ler com diferentes encodings
      const arrayBuffer = await file.arrayBuffer();
      let text = '';
      
      // Primeiro tenta UTF-8
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        text = decoder.decode(arrayBuffer);
      } catch {
        // Se UTF-8 falhar, tenta Windows-1252 (encoding comum do Excel)
        const decoder = new TextDecoder('windows-1252');
        text = decoder.decode(arrayBuffer);
      }
      
      console.log("Conteúdo do arquivo:", text);
      
      // Remove BOM se existir e divide as linhas
      const cleanText = text.replace(/^\uFEFF/, '');
      const lines = cleanText.split('\n');
      
      console.log("Total de linhas:", lines.length);
      console.log("Primeira linha (cabeçalho):", lines[0]);
      
      // Detecta o separador (tab ou ponto e vírgula)
      const separador = lines[0].includes('\t') ? '\t' : ';';
      console.log("Separador detectado:", separador === '\t' ? 'TAB' : 'PONTO E VÍRGULA');
      
      // Remove cabeçalho
      const dataLines = lines.slice(1);
      
      const novasRespostas = { ...respostas };
      let itensImportados = 0;
      
      dataLines.forEach((line, index) => {
        // Ignora linhas vazias
        if (!line.trim()) {
          console.log(`Linha ${index + 2} vazia, ignorando`);
          return;
        }
        
        console.log(`Processando linha ${index + 2}:`, line);
        
        // Remove aspas extras que o Excel pode adicionar
        const cleanLine = line.replace(/"/g, '');
        const campos = cleanLine.split(separador).map(campo => campo.trim()).filter(campo => campo !== '');
        console.log(`Campos separados:`, campos);
        
        // Template agora tem apenas: Número Item, Valor Unitário, Marca
        const [numItem, valor, marca] = campos;
        
        if (!numItem) {
          console.log(`Linha ${index + 2}: número do item vazio`);
          return;
        }
        
        const item = itens.find(i => i.numero_item === parseInt(numItem));
        console.log(`Item encontrado:`, item);
        
        if (item && valor && valor !== '') {
          // Limpa e formata o valor (aceita tanto vírgula quanto ponto)
          const valorLimpo = valor.replace(/[^\d,.-]/g, '').replace('.', ',');
          
          novasRespostas[item.id] = {
            item_id: item.id,
            valor_unitario: valorLimpo,
            marca: marca && marca !== '' ? marca.trim() : '',
          };
          
          console.log(`Item ${numItem} importado - Valor: ${valorLimpo}, Marca: ${marca}`);
          itensImportados++;
        } else {
          console.log(`Item ${numItem} NÃO importado - item existe: ${!!item}, valor: ${valor}`);
        }
      });
      
      console.log("Novas respostas:", novasRespostas);
      setRespostas(novasRespostas);
      toast.success(`${itensImportados} itens importados com sucesso!`);
    } catch (error) {
      console.error("Erro ao importar template:", error);
      toast.error("Erro ao importar template: " + (error instanceof Error ? error.message : "Erro desconhecido"));
    }
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

      // Criar resposta da cotação (observações SEM fonte - será adicionada no PDF)
      const { data: respostaCotacao, error: errorResposta } = await supabase
        .from("cotacao_respostas_fornecedor")
        .insert({
          cotacao_id: cotacaoIdParam,
          fornecedor_id: fornecedorId,
          valor_total_anual_ofertado: valorTotal,
          observacoes_fornecedor: observacoes || null,
          data_envio_resposta: new Date().toISOString(),
        })
        .select()
        .single();

      if (errorResposta) throw errorResposta;

      // Inserir itens da resposta ANTES de gerar o PDF
      const itensResposta = itens.map((item) => ({
        cotacao_resposta_fornecedor_id: respostaCotacao.id,
        item_cotacao_id: item.id,
        valor_unitario_ofertado: parseFloat(respostas[item.id].valor_unitario.replace(/,/g, ".")),
        marca: respostas[item.id].marca || null,
      }));

      const { error: errorItens } = await supabase
        .from("respostas_itens_fornecedor")
        .insert(itensResposta);

      if (errorItens) throw errorItens;

      // Buscar dados do usuário logado para certificação
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", user?.id)
        .single();

      // Gerar PDF da proposta
      const dadosFornecedor = {
        razao_social: nomeFonte, // Nome da fonte direto
        cnpj: cnpjPrecosPublicos,
        endereco_comercial: "Sistema",
      };

      const { url: urlProposta, nome: nomeProposta } = await gerarPropostaFornecedorPDF(
        respostaCotacao.id,
        dadosFornecedor,
        valorTotal,
        observacoes, // Observações sem a fonte
        cotacao.titulo_cotacao,
        arquivosComprovantes, // Passa os comprovantes para serem mesclados
        profile?.nome_completo || "Sistema",
        profile?.cpf || "Sistema"
      );

      // Salvar anexo da proposta com comprovantes mesclados
      await supabase.from("anexos_cotacao_fornecedor").insert({
        cotacao_resposta_fornecedor_id: respostaCotacao.id,
        tipo_anexo: "proposta",
        nome_arquivo: nomeProposta,
        url_arquivo: urlProposta,
      });

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

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={gerarTemplate}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Baixar Template
                </Button>
                <div>
                  <input
                    type="file"
                    accept=".csv"
                    id="importar-template"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        importarTemplate(file);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('importar-template')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Importar Template Preenchido
                  </Button>
                </div>
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
                      <TableHead className="w-40">Marca</TableHead>
                      <TableHead className="w-32">Vlr Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((item) => {
                      const resposta = respostas[item.id];
                      const valorUnitario = resposta?.valor_unitario 
                        ? parseFloat(resposta.valor_unitario.replace(/,/g, "."))
                        : 0;
                      const valorTotal = valorUnitario * item.quantidade;

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
                          <TableCell>
                            <Input
                              type="text"
                              value={resposta?.marca || ""}
                              onChange={(e) => {
                                setRespostas({
                                  ...respostas,
                                  [item.id]: { ...resposta, marca: e.target.value },
                                });
                              }}
                              placeholder="Marca (opcional)"
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
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={6} className="text-right">
                        VALOR TOTAL:
                      </TableCell>
                      <TableCell className="text-right text-lg">
                        R${" "}
                        {calcularValorTotal().toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Comprovantes */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Comprovantes (Arquivos PDF)</h3>
              <p className="text-sm text-muted-foreground">
                Anexe os documentos que comprovam os preços informados
              </p>
              
              {arquivosComprovantes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Arquivos anexados:</p>
                  <div className="space-y-1">
                    {arquivosComprovantes.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">{file.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setArquivosComprovantes(prev => prev.filter((_, i) => i !== index));
                            toast.info("Arquivo removido");
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  id="comprovantes-upload"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const pdfFiles = files.filter(f => f.type === "application/pdf");
                    
                    if (pdfFiles.length !== files.length) {
                      toast.error("Apenas arquivos PDF são permitidos");
                    }
                    
                    if (pdfFiles.length > 0) {
                      setArquivosComprovantes(prev => [...prev, ...pdfFiles]);
                      toast.success(`${pdfFiles.length} arquivo(s) anexado(s)`);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('comprovantes-upload')?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Anexar Comprovantes (PDF)
                </Button>
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
