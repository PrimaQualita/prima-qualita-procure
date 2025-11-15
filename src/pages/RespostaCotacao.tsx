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
import { Upload, FileText, X } from "lucide-react";
import { gerarPropostaFornecedorPDF } from "@/lib/gerarPropostaFornecedorPDF";
import * as XLSX from 'xlsx';

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
  [key: string]: {
    valor_unitario_ofertado: number;
    marca_ofertada: string;
    valor_display?: string;
  };
}

const RespostaCotacao = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cotacaoIdParam = searchParams.get("cotacao");
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cotacao, setCotacao] = useState<any>(null);
  const [processoCompra, setProcessoCompra] = useState<any>(null);
  const [itensCotacao, setItensCotacao] = useState<ItemCotacao[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  
  const [dadosEmpresa, setDadosEmpresa] = useState({
    razao_social: "",
    cnpj: "",
    logradouro: "",
    numero: "",
    bairro: "",
    municipio: "",
    uf: "",
    cep: "",
    endereco_comercial: "",
  });
  
  const [respostas, setRespostas] = useState<RespostaItem>({});
  const [observacoes, setObservacoes] = useState("");
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [arquivosComprovantes, setArquivosComprovantes] = useState<File[]>([]);
  

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
      // Buscar cotação
      const { data: cotacaoData, error: cotacaoError } = await supabaseAnon
        .from("cotacoes_precos")
        .select("*")
        .eq("id", cotacaoIdParam)
        .maybeSingle();

      if (cotacaoError) {
        console.error("Erro ao buscar cotação:", cotacaoError);
        toast.error("Erro ao carregar cotação: " + cotacaoError.message);
        setLoading(false);
        return;
      }

      if (!cotacaoData) {
        toast.error("Cotação não encontrada ou não está mais disponível para respostas");
        setLoading(false);
        return;
      }

      // Verificar data limite
      const dataLimite = new Date(cotacaoData.data_limite_resposta);
      if (dataLimite < new Date()) {
        toast.error("O prazo para resposta desta cotação expirou");
        setLoading(false);
        return;
      }

      setCotacao(cotacaoData);

      // Buscar processo
      const { data: processoData } = await supabaseAnon
        .from("processos_compras")
        .select("*")
        .eq("id", cotacaoData.processo_compra_id)
        .single();

      setProcessoCompra(processoData);

      // Carregar lotes se for por lote
      if (cotacaoData.criterio_julgamento === 'por_lote') {
        const { data: lotesData } = await supabaseAnon
          .from("lotes_cotacao")
          .select("*")
          .eq("cotacao_id", cotacaoData.id)
          .order("numero_lote", { ascending: true });

        setLotes(lotesData || []);
      }

      // Carregar itens
      const { data: itensData, error: itensError } = await supabaseAnon
        .from("itens_cotacao")
        .select("*")
        .eq("cotacao_id", cotacaoData.id)
        .order("numero_item", { ascending: true });

      if (itensError) {
        console.error("Erro ao carregar itens:", itensError);
        throw itensError;
      }

      console.log("Itens carregados:", itensData);
      setItensCotacao(itensData || []);
      
      // Inicializar respostas para cada item
      const respostasIniciais: { [key: string]: any } = {};
      (itensData || []).forEach((item) => {
        respostasIniciais[item.id] = {
          valor_unitario_ofertado: 0,
          valor_display: "",
          marca_ofertada: "",
        };
      });
      setRespostas(respostasIniciais);
      setLoading(false);
    } catch (error) {
      console.error("Erro ao carregar cotação:", error);
      toast.error("Erro ao carregar dados da cotação");
      setLoading(false);
    }
  };

  const gerarTemplate = () => {
    // Criar dados do Excel
    const dados = [
      ['Número Item', 'Marca', 'Valor Unitário'],
      ...itensCotacao.map(item => [
        item.numero_item,
        '',
        ''
      ])
    ];

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dados);

    // Definir largura das colunas
    ws['!cols'] = [
      { wch: 15 },
      { wch: 30 },
      { wch: 20 }
    ];

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    // Gerar e baixar arquivo
    XLSX.writeFile(wb, `template_${cotacao?.titulo_cotacao || 'cotacao'}.xlsx`);
    toast.success("Template Excel baixado com sucesso!");
  };

  const importarTemplate = async (file: File) => {
    try {
      const novasRespostas = { ...respostas };
      let importados = 0;

      // Verificar se é arquivo Excel (.xlsx)
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const dados = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        // Ignorar cabeçalho (primeira linha)
        for (let i = 1; i < dados.length; i++) {
          const [numeroItem, marca, valorUnitario] = dados[i];
          
          if (!numeroItem) continue;

          const item = itensCotacao.find(it => it.numero_item === parseInt(numeroItem.toString()));
          
          if (item && valorUnitario) {
            const valorNumerico = parseFloat(valorUnitario.toString().replace(/,/g, '.'));
            const valorFormatado = valorNumerico.toFixed(2).replace('.', ',');
            
            novasRespostas[item.id] = {
              ...novasRespostas[item.id],
              valor_unitario_ofertado: valorNumerico,
              valor_display: valorFormatado,
              marca_ofertada: marca ? marca.toString() : ''
            };
            importados++;
          }
        }
      } else {
        // Processar CSV/TXT
        const texto = await file.text();
        const linhas = texto.split('\n').filter(l => l.trim());
        
        if (linhas.length < 2) {
          toast.error('Arquivo vazio ou inválido');
          return;
        }

        const separador = linhas[0].includes('\t') ? '\t' : ',';

        for (let i = 1; i < linhas.length; i++) {
          const linha = linhas[i].trim();
          if (!linha) continue;

          const campos = linha.split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
          
          if (campos.length < 2) continue;

          const [numeroItem, marca, valorUnitario] = campos;
          
          const item = itensCotacao.find(it => it.numero_item === parseInt(numeroItem));
          
          if (item && valorUnitario) {
            const valorNumerico = parseFloat(valorUnitario.replace(/,/g, '.'));
            const valorFormatado = valorNumerico.toFixed(2).replace('.', ',');
            
            novasRespostas[item.id] = {
              ...novasRespostas[item.id],
              valor_unitario_ofertado: valorNumerico,
              valor_display: valorFormatado,
              marca_ofertada: marca || ''
            };
            importados++;
          }
        }
      }

      setRespostas(novasRespostas);
      toast.success(`${importados} item(ns) importado(s) com sucesso!`);
    } catch (error) {
      console.error('Erro ao importar:', error);
      toast.error('Erro ao importar template');
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Validar dados da empresa
      try {
        dadosEmpresaSchema.parse(dadosEmpresa);
        setErrors({});
      } catch (error: any) {
        const fieldErrors: { [key: string]: string } = {};
        error.errors.forEach((err: any) => {
          fieldErrors[err.path[0]] = err.message;
        });
        setErrors(fieldErrors);
        toast.error("Por favor, preencha todos os campos corretamente");
        setSubmitting(false);
        return;
      }

      // Validar se todos os valores foram preenchidos
      const itensIncompletos = itensCotacao.filter(item => {
        const resposta = respostas[item.id];
        return !resposta?.valor_unitario_ofertado || resposta.valor_unitario_ofertado <= 0;
      });

      if (itensIncompletos.length > 0) {
        toast.error("Por favor, preencha os valores unitários de todos os itens");
        setSubmitting(false);
        return;
      }

      const valorTotal = calcularValorTotal();

      // Preparar endereço completo
      const enderecoCompleto = `${dadosEmpresa.logradouro}, Nº ${dadosEmpresa.numero}, ${dadosEmpresa.bairro}, ${dadosEmpresa.municipio}/${dadosEmpresa.uf}, CEP: ${dadosEmpresa.cep}`;

      // Preparar itens para o PDF
      const itensParaPDF = itensCotacao.map(item => ({
        numero_item: item.numero_item,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        marca_ofertada: respostas[item.id]?.marca_ofertada || '',
        valor_unitario_ofertado: respostas[item.id]?.valor_unitario_ofertado || 0
      }));

      const cnpjLimpo = dadosEmpresa.cnpj.replace(/[^\d]/g, "");
      
      let fornecedorId: string | undefined;
      
      // Buscar ou criar fornecedor
      const { data: fornecedorBuscado } = await supabaseAnon
        .from("fornecedores")
        .select("id")
        .eq("cnpj", cnpjLimpo)
        .limit(1)
        .maybeSingle();

      if (fornecedorBuscado) {
        fornecedorId = fornecedorBuscado.id;
      } else {
        const dadosFornecedor = {
          razao_social: dadosEmpresa.razao_social,
          cnpj: cnpjLimpo,
          email: `cotacao-${cnpjLimpo}@temporario.com`,
          telefone: "00000000000",
          endereco_comercial: enderecoCompleto,
          status_aprovacao: "pendente",
          ativo: false,
        };
        
        const { data: fornecedorCriado, error: erroCreate } = await supabaseAnon
          .from("fornecedores")
          .insert(dadosFornecedor)
          .select("id")
          .single();

        if (erroCreate) {
          const { data: fornecedorRetry } = await supabaseAnon
            .from("fornecedores")
            .select("id")
            .eq("cnpj", cnpjLimpo)
            .single();
          
          if (fornecedorRetry) {
            fornecedorId = fornecedorRetry.id;
          } else {
            toast.error("Erro ao criar fornecedor: " + erroCreate.message);
            throw erroCreate;
          }
        } else {
          fornecedorId = fornecedorCriado.id;
        }
      }

      if (!fornecedorId) {
        throw new Error("Fornecedor não identificado");
      }

      // Verificar se fornecedor já respondeu esta cotação
      const { data: respostaExistente } = await supabaseAnon
        .from("cotacao_respostas_fornecedor")
        .select("id")
        .eq("cotacao_id", cotacao.id)
        .eq("fornecedor_id", fornecedorId)
        .maybeSingle();

      // Se já existe, excluir resposta anterior
      if (respostaExistente) {
        await supabaseAnon
          .from("respostas_itens_fornecedor")
          .delete()
          .eq("cotacao_resposta_fornecedor_id", respostaExistente.id);

        await supabaseAnon
          .from("cotacao_respostas_fornecedor")
          .delete()
          .eq("id", respostaExistente.id);
      }

      // Criar nova resposta
      const { data: respostaCriada, error: erroResposta } = await supabaseAnon
        .from("cotacao_respostas_fornecedor")
        .insert({
          cotacao_id: cotacao.id,
          fornecedor_id: fornecedorId,
          observacoes_fornecedor: observacoes || null,
          valor_total_anual_ofertado: valorTotal,
          data_envio_resposta: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (erroResposta || !respostaCriada) {
        toast.error("Erro ao criar resposta");
        throw erroResposta;
      }

      // Gerar PDF certificado com comprovantes anexados
      toast.info("Gerando proposta certificada...");
      
      const { url: pdfUrl, nome: pdfNome } = await gerarPropostaFornecedorPDF(
        respostaCriada.id,
        {
          razao_social: dadosEmpresa.razao_social,
          cnpj: dadosEmpresa.cnpj,
          endereco_comercial: enderecoCompleto,
        },
        valorTotal,
        observacoes,
        cotacao.titulo_cotacao,
        arquivosComprovantes
      );

      // Salvar anexo da proposta no banco
      await supabaseAnon
        .from('anexos_cotacao_fornecedor')
        .insert({
          cotacao_resposta_fornecedor_id: respostaCriada.id,
          tipo_anexo: 'PROPOSTA',
          url_arquivo: pdfUrl,
          nome_arquivo: pdfNome,
        });

      // Inserir itens da resposta
      const respostasItens = itensCotacao.map(item => ({
        cotacao_resposta_fornecedor_id: respostaCriada.id,
        item_cotacao_id: item.id,
        valor_unitario_ofertado: respostas[item.id]?.valor_unitario_ofertado || 0,
        marca: respostas[item.id]?.marca_ofertada || null,
      }));

      const { error: itensError } = await supabaseAnon
        .from("respostas_itens_fornecedor")
        .insert(respostasItens);

      if (itensError) {
        toast.error("Erro ao criar itens: " + itensError.message);
        throw itensError;
      }

      toast.success("Resposta enviada com sucesso!");
      
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
      
    } catch (error: any) {
      console.error("Erro ao enviar resposta:", error);
      toast.error("Erro: " + (error?.message || "Erro desconhecido"));
    } finally {
      setSubmitting(false);
    }
  };


  const calcularValorTotal = () => {
    return itensCotacao.reduce((total, item) => {
      const resposta = respostas[item.id];
      if (resposta && resposta.valor_unitario_ofertado) {
        return total + (item.quantidade * resposta.valor_unitario_ofertado);
      }
      return total;
    }, 0);
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
              <p className="text-sm text-muted-foreground">{cotacao?.titulo_cotacao}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="uf">UF *</Label>
                  <Select value={dadosEmpresa.uf} onValueChange={(value) => setDadosEmpresa({ ...dadosEmpresa, uf: value })}>
                    <SelectTrigger className={errors.uf ? "border-destructive" : ""}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {UFS.map(uf => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
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
                    maxLength={9}
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
              Informe os valores unitários para cada item
            </CardDescription>
            
            {/* Botões de Template e Anexos */}
            <div className="flex flex-col gap-4 pt-4">
              <div className="flex flex-wrap gap-2">
                <input
                  type="file"
                  id="importar-template"
                  accept=".csv,.txt,.xlsx"
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
                  onClick={gerarTemplate}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Baixar Template
                </Button>
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
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Item</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="text-center">Unid.</TableHead>
                  {processoCompra?.tipo === "material" && (
                    <TableHead className="text-center">Marca *</TableHead>
                  )}
                  <TableHead className="text-center">Valor Unitário (R$) *</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensCotacao.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.numero_item}</TableCell>
                    <TableCell>{item.descricao}</TableCell>
                    <TableCell className="text-center">{item.quantidade}</TableCell>
                    <TableCell className="text-center">{item.unidade}</TableCell>
                    {processoCompra?.tipo === "material" && (
                      <TableCell>
                        <Input
                          type="text"
                          placeholder="Informe a marca"
                          value={respostas[item.id]?.marca_ofertada || ""}
                          onChange={(e) =>
                            setRespostas({
                              ...respostas,
                              [item.id]: {
                                ...respostas[item.id],
                                marca_ofertada: e.target.value,
                              },
                            })
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={
                          respostas[item.id]?.valor_display !== undefined
                            ? respostas[item.id].valor_display
                            : respostas[item.id]?.valor_unitario_ofertado
                            ? respostas[item.id].valor_unitario_ofertado
                                .toFixed(2)
                                .replace('.', ',')
                            : ""
                        }
                        onChange={(e) => {
                          const input = e.target.value;
                          // Permite apenas números, vírgula e um ponto decimal
                          const valorLimpo = input.replace(/[^\d,]/g, '');
                          
                          setRespostas({
                            ...respostas,
                            [item.id]: {
                              ...respostas[item.id],
                              valor_display: valorLimpo,
                              valor_unitario_ofertado: parseFloat(valorLimpo.replace(',', '.')) || 0,
                            },
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      R${" "}
                      {(
                        item.quantidade *
                        (respostas[item.id]?.valor_unitario_ofertado || 0)
                      ).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={processoCompra?.tipo === "material" ? 6 : 5} className="text-right">
                    TOTAL GERAL:
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {calcularValorTotal().toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Adicione observações ou informações adicionais sobre sua proposta..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Enviar Proposta */}
        <Card>
          <CardHeader>
            <CardTitle>Enviar Proposta Certificada</CardTitle>
            <CardDescription>
              Ao clicar em enviar, sua proposta será gerada automaticamente em PDF certificado e enviada
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Área de Upload de Anexos */}
            <div className="space-y-2">
              <Label>Comprovantes em PDF (Opcional)</Label>
              <p className="text-xs text-muted-foreground">Apenas arquivos PDF serão mesclados à proposta</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="file"
                  id="upload-comprovantes"
                  multiple
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    
                    // Validar que todos são PDFs
                    const arquivosPDF = files.filter(file => 
                      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
                    );
                    
                    const arquivosInvalidos = files.length - arquivosPDF.length;
                    
                    if (arquivosInvalidos > 0) {
                      toast.error(`${arquivosInvalidos} arquivo(s) ignorado(s). Apenas PDFs são aceitos.`);
                    }
                    
                    if (arquivosPDF.length > 0) {
                      setArquivosComprovantes([...arquivosComprovantes, ...arquivosPDF]);
                      toast.success(`${arquivosPDF.length} arquivo(s) PDF adicionado(s)`);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('upload-comprovantes')?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Adicionar PDFs
                </Button>
              </div>
              
              {arquivosComprovantes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {arquivosComprovantes.length} arquivo(s) anexado(s):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {arquivosComprovantes.map((arquivo, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-muted px-3 py-1 rounded-md text-sm"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="max-w-[200px] truncate">{arquivo.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setArquivosComprovantes(
                              arquivosComprovantes.filter((_, i) => i !== index)
                            );
                            toast.success("Arquivo removido");
                          }}
                          className="hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <Button 
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? "Enviando Proposta..." : "Enviar Proposta"}
            </Button>
            
            {submitting && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Gerando PDF certificado e enviando...
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RespostaCotacao;
