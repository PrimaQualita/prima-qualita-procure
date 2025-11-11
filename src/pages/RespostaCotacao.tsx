import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { toast } from "sonner";
import { z } from "zod";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

// Função para validar CNPJ
const validarCNPJ = (cnpj: string): boolean => {
  const cnpjLimpo = cnpj.replace(/[^\d]/g, "");
  
  if (cnpjLimpo.length !== 14) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cnpjLimpo)) return false;
  
  // Validação dos dígitos verificadores
  let tamanho = cnpjLimpo.length - 2;
  let numeros = cnpjLimpo.substring(0, tamanho);
  const digitos = cnpjLimpo.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0))) return false;
  
  tamanho = tamanho + 1;
  numeros = cnpjLimpo.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === parseInt(digitos.charAt(1));
};

// Função para formatar CNPJ
const formatarCNPJ = (valor: string): string => {
  const apenasNumeros = valor.replace(/[^\d]/g, "");
  
  if (apenasNumeros.length <= 2) return apenasNumeros;
  if (apenasNumeros.length <= 5) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2)}`;
  if (apenasNumeros.length <= 8) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5)}`;
  if (apenasNumeros.length <= 12) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5, 8)}/${apenasNumeros.slice(8)}`;
  return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5, 8)}/${apenasNumeros.slice(8, 12)}-${apenasNumeros.slice(12, 14)}`;
};

const dadosEmpresaSchema = z.object({
  razao_social: z.string().trim().min(1, "Razão Social é obrigatória").max(255),
  cnpj: z.string().trim().min(1, "CNPJ é obrigatório").refine((val) => validarCNPJ(val), {
    message: "CNPJ inválido",
  }),
  logradouro: z.string().trim().min(1, "Logradouro é obrigatório").max(255),
  numero: z.string().trim().min(1, "Número é obrigatório").max(20),
  bairro: z.string().trim().min(1, "Bairro é obrigatório").max(100),
  municipio: z.string().trim().min(1, "Município é obrigatório").max(100),
  uf: z.string().length(2, "UF inválida"),
  cep: z.string().trim().min(8, "CEP inválido").max(9),
});

interface ItemCotacao {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
}

interface RespostaItem {
  [key: string]: number;
}

const RespostaCotacao = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cotacaoIdParam = searchParams.get("cotacao");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cotacaoId, setCotacaoId] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemCotacao[]>([]);
  const [cotacaoTitulo, setCotacaoTitulo] = useState("");
  const [cotacaoDescricao, setCotacaoDescricao] = useState("");
  const [dataLimite, setDataLimite] = useState("");
  
  const [dadosEmpresa, setDadosEmpresa] = useState({
    razao_social: "",
    cnpj: "",
    logradouro: "",
    numero: "",
    bairro: "",
    municipio: "",
    uf: "",
    cep: "",
  });
  
  const [valoresItens, setValoresItens] = useState<RespostaItem>({});
  const [observacoes, setObservacoes] = useState("");
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (cotacaoIdParam) {
      loadCotacao();
    } else {
      toast.error("Link de cotação inválido");
      setLoading(false);
    }
  }, [cotacaoIdParam]);

  const loadCotacao = async () => {
    try {
      // Buscar cotação diretamente
      const { data: cotacao, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("*")
        .eq("id", cotacaoIdParam)
        .single();

      if (cotacaoError || !cotacao) {
        toast.error("Cotação não encontrada");
        setLoading(false);
        return;
      }

      // Verificar data limite
      const dataLimite = new Date(cotacao.data_limite_resposta);
      if (dataLimite < new Date()) {
        toast.error("O prazo para resposta desta cotação expirou");
        setLoading(false);
        return;
      }

      setCotacaoId(cotacao.id);
      setCotacaoTitulo(cotacao.titulo_cotacao);
      setCotacaoDescricao(cotacao.descricao_cotacao || "");
      setDataLimite(cotacao.data_limite_resposta);

      // Carregar itens da cotação
      const { data: itensData, error: itensError } = await supabase
        .from("itens_cotacao")
        .select("*")
        .eq("cotacao_id", cotacao.id)
        .order("numero_item", { ascending: true });

      if (itensError) {
        toast.error("Erro ao carregar itens");
        console.error(itensError);
      } else {
        setItens(itensData || []);
      }

      setLoading(false);
    } catch (error) {
      console.error("Erro ao carregar cotação:", error);
      toast.error("Erro ao carregar cotação");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar dados da empresa
    try {
      dadosEmpresaSchema.parse(dadosEmpresa);
      setErrors({});
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: { [key: string]: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(newErrors);
        toast.error("Por favor, preencha todos os campos obrigatórios corretamente");
        return;
      }
    }

    // Validar se todos os itens têm valores
    const todosItensPreenchidos = itens.every(item => valoresItens[item.id] && valoresItens[item.id] > 0);
    if (!todosItensPreenchidos) {
      toast.error("Por favor, preencha os valores de todos os itens");
      return;
    }

    setSaving(true);
    try {
      const cnpjLimpo = dadosEmpresa.cnpj.replace(/[^\d]/g, "");
      let fornecedorId: string | undefined;
      
      // SEMPRE tentar buscar primeiro
      const { data: fornecedorBuscado } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("cnpj", cnpjLimpo)
        .limit(1)
        .maybeSingle();

      if (fornecedorBuscado) {
        // Já existe
        fornecedorId = fornecedorBuscado.id;
      } else {
        // Não existe, tentar criar
        const { data: fornecedorCriado, error: erroCreate } = await supabase
          .from("fornecedores")
          .insert({
            razao_social: dadosEmpresa.razao_social,
            cnpj: cnpjLimpo,
            email: `cotacao-${cnpjLimpo}@temporario.com`,
            telefone: "00000000000",
            endereco_comercial: `${dadosEmpresa.logradouro}, ${dadosEmpresa.numero} - ${dadosEmpresa.bairro}, ${dadosEmpresa.municipio}/${dadosEmpresa.uf} - CEP: ${dadosEmpresa.cep}`,
            status_aprovacao: "pendente",
            ativo: false,
          })
          .select("id")
          .single();

        if (erroCreate) {
          // Se deu erro (provavelmente duplicado por race condition), buscar novamente
          const { data: fornecedorRetry } = await supabase
            .from("fornecedores")
            .select("id")
            .eq("cnpj", cnpjLimpo)
            .single();
          
          if (fornecedorRetry) {
            fornecedorId = fornecedorRetry.id;
          } else {
            throw new Error("Não foi possível criar ou encontrar o fornecedor");
          }
        } else {
          fornecedorId = fornecedorCriado.id;
        }
      }

      if (!fornecedorId) {
        throw new Error("Fornecedor não identificado");
      }

      // Calcular valor total
      const valorTotal = itens.reduce((total, item) => {
        return total + (item.quantidade * (valoresItens[item.id] || 0));
      }, 0);

      // Criar resposta da cotação
      const { data: resposta, error: respostaError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .insert({
          cotacao_id: cotacaoId,
          fornecedor_id: fornecedorId,
          valor_total_anual_ofertado: valorTotal,
          observacoes_fornecedor: observacoes,
        })
        .select()
        .single();

      if (respostaError) throw respostaError;

      // Criar respostas dos itens
      const respostasItens = itens.map(item => ({
        cotacao_resposta_fornecedor_id: resposta.id,
        item_cotacao_id: item.id,
        valor_unitario_ofertado: valoresItens[item.id],
      }));

      const { error: itensError } = await supabase
        .from("respostas_itens_fornecedor")
        .insert(respostasItens);

      if (itensError) throw itensError;

      toast.success("Resposta enviada com sucesso!");
      
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
      
    } catch (error) {
      console.error("Erro ao enviar resposta:", error);
      toast.error("Erro ao enviar resposta. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const calcularTotalItem = (item: ItemCotacao) => {
    const valor = valoresItens[item.id] || 0;
    return item.quantidade * valor;
  };

  const calcularTotalGeral = () => {
    return itens.reduce((total, item) => total + calcularTotalItem(item), 0);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando cotação...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Resposta de Cotação de Preços</h1>
              <p className="text-sm text-muted-foreground">{cotacaoTitulo}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados da Empresa */}
          <Card>
            <CardHeader>
              <CardTitle>Dados da Empresa</CardTitle>
              <CardDescription>
                Preencha os dados completos da sua empresa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="razao_social">Razão Social *</Label>
                  <Input
                    id="razao_social"
                    value={dadosEmpresa.razao_social}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, razao_social: e.target.value })}
                    className={errors.razao_social ? "border-destructive" : ""}
                  />
                  {errors.razao_social && (
                    <p className="text-sm text-destructive">{errors.razao_social}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="cnpj">CNPJ *</Label>
                  <Input
                    id="cnpj"
                    value={dadosEmpresa.cnpj}
                    onChange={(e) => {
                      const cnpjFormatado = formatarCNPJ(e.target.value);
                      setDadosEmpresa({ ...dadosEmpresa, cnpj: cnpjFormatado });
                    }}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    className={errors.cnpj ? "border-destructive" : ""}
                  />
                  {errors.cnpj && (
                    <p className="text-sm text-destructive">{errors.cnpj}</p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 grid gap-2">
                    <Label htmlFor="logradouro">Logradouro *</Label>
                    <Input
                      id="logradouro"
                      value={dadosEmpresa.logradouro}
                      onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, logradouro: e.target.value })}
                      className={errors.logradouro ? "border-destructive" : ""}
                    />
                    {errors.logradouro && (
                      <p className="text-sm text-destructive">{errors.logradouro}</p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="numero">Número *</Label>
                    <Input
                      id="numero"
                      value={dadosEmpresa.numero}
                      onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, numero: e.target.value })}
                      className={errors.numero ? "border-destructive" : ""}
                    />
                    {errors.numero && (
                      <p className="text-sm text-destructive">{errors.numero}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="bairro">Bairro *</Label>
                    <Input
                      id="bairro"
                      value={dadosEmpresa.bairro}
                      onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, bairro: e.target.value })}
                      className={errors.bairro ? "border-destructive" : ""}
                    />
                    {errors.bairro && (
                      <p className="text-sm text-destructive">{errors.bairro}</p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="municipio">Município *</Label>
                    <Input
                      id="municipio"
                      value={dadosEmpresa.municipio}
                      onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, municipio: e.target.value })}
                      className={errors.municipio ? "border-destructive" : ""}
                    />
                    {errors.municipio && (
                      <p className="text-sm text-destructive">{errors.municipio}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="uf">UF *</Label>
                    <Select
                      value={dadosEmpresa.uf}
                      onValueChange={(value) => setDadosEmpresa({ ...dadosEmpresa, uf: value })}
                    >
                      <SelectTrigger className={errors.uf ? "border-destructive" : ""}>
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {UFS.map((uf) => (
                          <SelectItem key={uf} value={uf}>
                            {uf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.uf && (
                      <p className="text-sm text-destructive">{errors.uf}</p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="cep">CEP *</Label>
                    <Input
                      id="cep"
                      value={dadosEmpresa.cep}
                      onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, cep: e.target.value })}
                      placeholder="00000-000"
                      className={errors.cep ? "border-destructive" : ""}
                    />
                    {errors.cep && (
                      <p className="text-sm text-destructive">{errors.cep}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Itens da Cotação */}
          <Card>
            <CardHeader>
              <CardTitle>Itens da Cotação</CardTitle>
              <CardDescription>
                {cotacaoDescricao || "Informe os valores unitários para cada item"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Item</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24">Qtd</TableHead>
                    <TableHead className="w-24">Unid.</TableHead>
                    <TableHead className="w-40">Valor Unitário (R$) *</TableHead>
                    <TableHead className="w-32 text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.numero_item}</TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell>{item.quantidade}</TableCell>
                      <TableCell>{item.unidade}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={valoresItens[item.id] || ""}
                          onChange={(e) => setValoresItens({
                            ...valoresItens,
                            [item.id]: parseFloat(e.target.value) || 0
                          })}
                          placeholder="0,00"
                          required
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {calcularTotalItem(item).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted">
                    <TableCell colSpan={5} className="text-right">TOTAL GERAL:</TableCell>
                    <TableCell className="text-right">
                      R$ {calcularTotalGeral().toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="mt-4 grid gap-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={4}
                  placeholder="Adicione observações ou informações adicionais sobre sua proposta..."
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="submit" disabled={saving} size="lg">
              {saving ? "Enviando..." : "Enviar Resposta"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RespostaCotacao;
