import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
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

// Cliente Supabase sem autenticação persistente - usa sessionStorage isolado
const supabaseAnon = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false, // Não persiste sessão
      autoRefreshToken: false, // Não atualiza token
      detectSessionInUrl: false // Não detecta sessão na URL
    }
  }
);

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
  lote_id: string | null;
  marca?: string;
}

interface Lote {
  id: string;
  numero_lote: number;
  descricao_lote: string;
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
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [criterioJulgamento, setCriterioJulgamento] = useState<'global' | 'por_item' | 'por_lote'>('global');
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
  const [marcasItens, setMarcasItens] = useState<{ [key: string]: string }>({});
  const [observacoes, setObservacoes] = useState("");
  const [tipoProcesso, setTipoProcesso] = useState<string>("");
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
      console.log("🔍 Carregando cotação com ID:", cotacaoIdParam);
      
      // Buscar cotação diretamente com join para obter tipo do processo
      const { data: cotacao, error: cotacaoError } = await supabaseAnon
        .from("cotacoes_precos")
        .select(`
          *,
          processos_compras!inner(tipo)
        `)
        .eq("id", cotacaoIdParam)
        .single();

      console.log("📊 Dados da cotação:", cotacao);
      console.log("❌ Erro ao buscar cotação:", cotacaoError);

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
      setCriterioJulgamento(cotacao.criterio_julgamento || 'global');
      setTipoProcesso(cotacao.processos_compras?.tipo || "");

      // Carregar lotes se for por lote
      if (cotacao.criterio_julgamento === 'por_lote') {
        const { data: lotesData, error: lotesError } = await supabaseAnon
          .from("lotes_cotacao")
          .select("*")
          .eq("cotacao_id", cotacao.id)
          .order("numero_lote", { ascending: true });

        if (lotesError) {
          console.error("Erro ao carregar lotes:", lotesError);
        } else {
          setLotes(lotesData || []);
        }
      }

      // Carregar itens da cotação
      const { data: itensData, error: itensError } = await supabaseAnon
        .from("itens_cotacao")
        .select("*")
        .eq("cotacao_id", cotacao.id)
        .order("numero_item", { ascending: true });

      console.log("📋 Itens carregados:", itensData);
      console.log("❌ Erro ao carregar itens:", itensError);

      if (itensError) {
        toast.error("Erro ao carregar itens da cotação");
        console.error("Erro completo:", itensError);
      } else {
        setItens(itensData || []);
        console.log(`✅ ${itensData?.length || 0} itens carregados com sucesso`);
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

    // Validar preenchimento de valores baseado no critério de julgamento
    if (criterioJulgamento === 'global') {
      // Global: TODOS os itens devem ser cotados obrigatoriamente
      const todosItensPreenchidos = itens.every(item => valoresItens[item.id] && valoresItens[item.id] > 0);
      if (!todosItensPreenchidos) {
        toast.error("Para cotação global, todos os itens devem ser cotados");
        return;
      }
    } else if (criterioJulgamento === 'por_lote') {
      // Por lote: Se cotar algum item de um lote, deve cotar TODOS os itens daquele lote
      const lotesComItens = new Map<string, { total: number; cotados: number }>();
      
      itens.forEach(item => {
        if (item.lote_id) {
          if (!lotesComItens.has(item.lote_id)) {
            lotesComItens.set(item.lote_id, { total: 0, cotados: 0 });
          }
          const loteInfo = lotesComItens.get(item.lote_id)!;
          loteInfo.total++;
          if (valoresItens[item.id] && valoresItens[item.id] > 0) {
            loteInfo.cotados++;
          }
        }
      });

      // Verificar se algum lote está parcialmente cotado
      let loteInvalido = false;
      lotesComItens.forEach((info, loteId) => {
        if (info.cotados > 0 && info.cotados < info.total) {
          const lote = lotes.find(l => l.id === loteId);
          toast.error(`Lote ${lote?.numero_lote}: se cotar algum item do lote, deve cotar TODOS os itens deste lote`);
          loteInvalido = true;
        }
      });

      if (loteInvalido) return;

      // Verificar se pelo menos um lote completo foi cotado
      const algumLoteCotado = Array.from(lotesComItens.values()).some(info => info.cotados > 0);
      if (!algumLoteCotado) {
        toast.error("Você deve cotar pelo menos um lote completo");
        return;
      }
    } else if (criterioJulgamento === 'por_item') {
      // Por item: Pode deixar itens sem cotar, mas precisa cotar pelo menos um
      const algumItemCotado = itens.some(item => valoresItens[item.id] && valoresItens[item.id] > 0);
      if (!algumItemCotado) {
        toast.error("Você deve cotar pelo menos um item");
        return;
      }
    }

    setSaving(true);
    try {
      const cnpjLimpo = dadosEmpresa.cnpj.replace(/[^\d]/g, "");
      console.log("=== INÍCIO DO ENVIO ===");
      console.log("CNPJ limpo:", cnpjLimpo);
      
      let fornecedorId: string | undefined;
      
      // Buscar fornecedor existente
      console.log("1. Buscando fornecedor...");
      const { data: fornecedorBuscado, error: erroBusca } = await supabaseAnon
        .from("fornecedores")
        .select("id")
        .eq("cnpj", cnpjLimpo)
        .limit(1)
        .maybeSingle();

      console.log("Resultado busca:", fornecedorBuscado, "Erro:", erroBusca);

      if (fornecedorBuscado) {
        fornecedorId = fornecedorBuscado.id;
        console.log("✓ Fornecedor encontrado:", fornecedorId);
      } else {
        // Criar novo fornecedor
        console.log("2. Criando novo fornecedor...");
        const dadosFornecedor = {
          razao_social: dadosEmpresa.razao_social,
          cnpj: cnpjLimpo,
          email: `cotacao-${cnpjLimpo}@temporario.com`,
          telefone: "00000000000",
          endereco_comercial: `${dadosEmpresa.logradouro}, ${dadosEmpresa.numero} - ${dadosEmpresa.bairro}, ${dadosEmpresa.municipio}/${dadosEmpresa.uf} - CEP: ${dadosEmpresa.cep}`,
          status_aprovacao: "pendente",
          ativo: false,
        };
        console.log("Dados fornecedor:", dadosFornecedor);
        
        const { data: fornecedorCriado, error: erroCreate } = await supabaseAnon
          .from("fornecedores")
          .insert(dadosFornecedor)
          .select("id")
          .single();

        console.log("Resultado criação:", fornecedorCriado, "Erro:", erroCreate);

        if (erroCreate) {
          console.error("✗ Erro ao criar:", erroCreate);
          // Tentar buscar novamente
          const { data: fornecedorRetry } = await supabaseAnon
            .from("fornecedores")
            .select("id")
            .eq("cnpj", cnpjLimpo)
            .single();
          
          if (fornecedorRetry) {
            fornecedorId = fornecedorRetry.id;
            console.log("✓ Fornecedor encontrado na retry:", fornecedorId);
          } else {
            toast.error("Erro ao criar fornecedor: " + erroCreate.message);
            throw erroCreate;
          }
        } else {
          fornecedorId = fornecedorCriado.id;
          console.log("✓ Fornecedor criado:", fornecedorId);
        }
      }

      if (!fornecedorId) {
        throw new Error("Fornecedor não identificado");
      }

      // Verificar se fornecedor já respondeu esta cotação
      console.log("3. Verificando se já existe resposta anterior...");
      const { data: respostaExistente } = await supabaseAnon
        .from("cotacao_respostas_fornecedor")
        .select("id")
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorId)
        .maybeSingle();

      // Se já existe, excluir resposta anterior e seus itens para sobrescrever
      if (respostaExistente) {
        console.log("✓ Resposta anterior encontrada, sobrescrevendo...");
        
        // Excluir itens da resposta anterior
        const { error: erroExcluirItens } = await supabaseAnon
          .from("respostas_itens_fornecedor")
          .delete()
          .eq("cotacao_resposta_fornecedor_id", respostaExistente.id);

        if (erroExcluirItens) {
          console.error("Erro ao excluir itens anteriores:", erroExcluirItens);
          toast.error("Erro ao atualizar proposta. Tente novamente.");
          throw erroExcluirItens;
        }

        // Excluir resposta anterior
        const { error: erroExcluirResposta } = await supabaseAnon
          .from("cotacao_respostas_fornecedor")
          .delete()
          .eq("id", respostaExistente.id);

        if (erroExcluirResposta) {
          console.error("Erro ao excluir resposta anterior:", erroExcluirResposta);
          toast.error("Erro ao atualizar proposta. Tente novamente.");
          throw erroExcluirResposta;
        }

        console.log("✓ Resposta anterior excluída, criando nova...");
      }

      // Calcular valor total
      const valorTotal = itens.reduce((total, item) => {
        return total + (item.quantidade * (valoresItens[item.id] || 0));
      }, 0);
      console.log("4. Valor total calculado:", valorTotal);

      // Criar nova resposta da cotação
      console.log("5. Criando nova resposta da cotação...");
      const { data: resposta, error: respostaError } = await supabaseAnon
        .from("cotacao_respostas_fornecedor")
        .insert({
          cotacao_id: cotacaoId,
          fornecedor_id: fornecedorId,
          valor_total_anual_ofertado: valorTotal,
          observacoes_fornecedor: observacoes,
        })
        .select()
        .single();

      console.log("Resultado resposta:", resposta, "Erro:", respostaError);

      if (respostaError) {
        toast.error("Erro ao criar resposta: " + respostaError.message);
        throw respostaError;
      }

      // Atualizar marcas nos itens (se for Material)
      if (tipoProcesso === "Material") {
        console.log("6a. Atualizando marcas nos itens...");
        const updateMarcasPromises = itens
          .filter(item => marcasItens[item.id] && valoresItens[item.id] && valoresItens[item.id] > 0)
          .map(item => 
            supabaseAnon
              .from("itens_cotacao")
              .update({ marca: marcasItens[item.id] })
              .eq("id", item.id)
          );
        
        await Promise.all(updateMarcasPromises);
      }

      // Criar respostas dos itens (apenas itens que foram cotados)
      console.log("6. Criando respostas dos itens...");
      const respostasItens = itens
        .filter(item => valoresItens[item.id] && valoresItens[item.id] > 0)
        .map(item => ({
          cotacao_resposta_fornecedor_id: resposta.id,
          item_cotacao_id: item.id,
          valor_unitario_ofertado: valoresItens[item.id],
        }));
      console.log("Itens a inserir:", respostasItens);

      const { error: itensError } = await supabaseAnon
        .from("respostas_itens_fornecedor")
        .insert(respostasItens);

      console.log("Erro itens:", itensError);

      if (itensError) {
        toast.error("Erro ao criar itens: " + itensError.message);
        throw itensError;
      }

      console.log("=== SUCESSO! ===");
      toast.success("Resposta enviada com sucesso!");
      
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
      
    } catch (error: any) {
      console.error("=== ERRO GERAL ===", error);
      toast.error("Erro: " + (error?.message || "Erro desconhecido"));
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
        <form onSubmit={handleSubmit} onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }} className="space-y-6">
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
              {criterioJulgamento === 'por_lote' && lotes.length > 0 ? (
                // Exibição por lote
                <div className="space-y-6">
                  {lotes.map((lote) => {
                    const itensDoLote = itens.filter(item => item.lote_id === lote.id).sort((a, b) => a.numero_item - b.numero_item);
                    const totalLote = itensDoLote.reduce((acc, item) => {
                      const valor = valoresItens[item.id] || 0;
                      return acc + (valor * item.quantidade);
                    }, 0);

                    return (
                      <div key={lote.id} className="border rounded-lg overflow-hidden">
                        <div className="bg-primary text-primary-foreground px-4 py-3">
                          <h3 className="font-semibold">
                            LOTE {lote.numero_lote} - {lote.descricao_lote}
                          </h3>
                        </div>
                        <Table>
                           <TableHeader>
                            <TableRow>
                              <TableHead className="w-20">Item</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead className="w-24">Qtd</TableHead>
                              <TableHead className="w-24">Unid.</TableHead>
                              {tipoProcesso === "Material" && <TableHead className="w-40">Marca *</TableHead>}
                              <TableHead className="w-40">Valor Unitário (R$) *</TableHead>
                              <TableHead className="w-32 text-right">Valor Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                             {itensDoLote.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{item.numero_item}</TableCell>
                                <TableCell>{item.descricao}</TableCell>
                                <TableCell>{item.quantidade}</TableCell>
                                <TableCell>{item.unidade}</TableCell>
                                {tipoProcesso === "Material" && (
                                  <TableCell>
                                    <Input
                                      type="text"
                                      value={marcasItens[item.id] || ""}
                                      onChange={(e) => setMarcasItens({
                                        ...marcasItens,
                                        [item.id]: e.target.value
                                      })}
                                      placeholder="Marca do produto"
                                    />
                                  </TableCell>
                                )}
                                <TableCell>
                                   <Input
                                     type="text"
                                     data-item-index={itensDoLote.findIndex(i => i.id === item.id)}
                                     value={valoresItens[item.id] !== undefined && valoresItens[item.id] !== 0 
                                       ? valoresItens[item.id].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                       : ""}
                                     onChange={(e) => {
                                       const valorLimpo = e.target.value.replace(/\D/g, "");
                                       const valorNumerico = valorLimpo ? parseFloat(valorLimpo) / 100 : 0;
                                       setValoresItens({
                                         ...valoresItens,
                                         [item.id]: valorNumerico
                                       });
                                     }}
                                     onKeyDown={(e) => {
                                       if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                         e.preventDefault();
                                         const currentIndex = parseInt(e.currentTarget.getAttribute('data-item-index') || '0');
                                         const nextInput = document.querySelector(`input[data-item-index="${currentIndex + 1}"]`) as HTMLInputElement;
                                         if (nextInput) {
                                           nextInput.focus();
                                           nextInput.select();
                                         }
                                       } else if (e.key === 'ArrowUp') {
                                         e.preventDefault();
                                         const currentIndex = parseInt(e.currentTarget.getAttribute('data-item-index') || '0');
                                         const prevInput = document.querySelector(`input[data-item-index="${currentIndex - 1}"]`) as HTMLInputElement;
                                         if (prevInput) {
                                           prevInput.focus();
                                           prevInput.select();
                                         }
                                       }
                                     }}
                                     placeholder="0,00"
                                   />
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  R$ {((valoresItens[item.id] || 0) * item.quantidade).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
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
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })}
                  <div className="bg-primary text-primary-foreground px-6 py-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">TOTAL GERAL:</span>
                      <span className="text-2xl font-bold">
                        R$ {calcularTotalGeral().toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
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
                      {tipoProcesso === "Material" && <TableHead className="w-40">Marca *</TableHead>}
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
                        {tipoProcesso === "Material" && (
                          <TableCell>
                            <Input
                              type="text"
                              value={marcasItens[item.id] || ""}
                              onChange={(e) => setMarcasItens({
                                ...marcasItens,
                                [item.id]: e.target.value
                              })}
                              placeholder="Marca do produto"
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <Input
                            type="text"
                            data-item-index={itens.findIndex(i => i.id === item.id)}
                            value={valoresItens[item.id] !== undefined && valoresItens[item.id] !== 0 
                              ? valoresItens[item.id].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : ""}
                            onChange={(e) => {
                              const valorLimpo = e.target.value.replace(/\D/g, "");
                              const valorNumerico = valorLimpo ? parseFloat(valorLimpo) / 100 : 0;
                              setValoresItens({
                                ...valoresItens,
                                [item.id]: valorNumerico
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const currentIndex = parseInt(e.currentTarget.getAttribute('data-item-index') || '0');
                                const nextInput = document.querySelector(`input[data-item-index="${currentIndex + 1}"]`) as HTMLInputElement;
                                if (nextInput) {
                                  nextInput.focus();
                                  nextInput.select();
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const currentIndex = parseInt(e.currentTarget.getAttribute('data-item-index') || '0');
                                const prevInput = document.querySelector(`input[data-item-index="${currentIndex - 1}"]`) as HTMLInputElement;
                                if (prevInput) {
                                  prevInput.focus();
                                  prevInput.select();
                                }
                              }
                            }}
                            placeholder="0,00"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
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
              )}

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
