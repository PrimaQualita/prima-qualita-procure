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
import ExcelJS from 'exceljs';

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
    percentual_desconto?: number;
    percentual_desconto_display?: string;
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
  const [buscandoFornecedor, setBuscandoFornecedor] = useState(false);

  // Função para buscar fornecedor por CNPJ
  const buscarFornecedorPorCNPJ = async (cnpj: string) => {
    const cnpjLimpo = cnpj.replace(/[^\d]/g, "");
    
    // Só busca se CNPJ estiver completo (14 dígitos)
    if (cnpjLimpo.length !== 14) return;
    
    // Valida CNPJ antes de buscar
    if (!validarCNPJ(cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }
    
    setBuscandoFornecedor(true);
    
    try {
      const { data: fornecedor, error } = await supabaseAnon
        .from("fornecedores")
        .select("razao_social, endereco_comercial, cnpj")
        .eq("cnpj", cnpjLimpo)
        .maybeSingle();
      
      if (error) {
        console.error("Erro ao buscar fornecedor:", error);
        setBuscandoFornecedor(false);
        return;
      }
      
      if (fornecedor && fornecedor.endereco_comercial) {
        // Parse do endereço completo
        // Formato esperado: "Logradouro, Nº Numero, Bairro, Municipio/UF, CEP: 00000-000"
        const enderecoCompleto = fornecedor.endereco_comercial;
        
        // Extrair partes do endereço
        const partes = enderecoCompleto.split(',').map(p => p.trim());
        const logradouro = partes[0] || '';
        
        // Extrair número (após "Nº ")
        const numeroMatch = partes[1]?.match(/Nº\s*(.+)/);
        const numero = numeroMatch ? numeroMatch[1] : '';
        
        const bairro = partes[2] || '';
        
        // Extrair município (antes da barra)
        const municipioUf = partes[3]?.split('/') || [];
        const municipio = municipioUf[0]?.trim() || '';
        
        // Extrair CEP
        const cepMatch = enderecoCompleto.match(/CEP:\s*([0-9-]+)/);
        const cep = cepMatch ? cepMatch[1] : '';
        
        // Buscar UF via ViaCEP se CEP foi encontrado
        let uf = '';
        if (cep) {
          try {
            const cepLimpo = cep.replace(/\D/g, '');
            const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
            const viaCepData = await viaCepResponse.json();
            
            if (viaCepData && !viaCepData.erro) {
              uf = viaCepData.uf || '';
            }
          } catch (viaCepError) {
            console.error("Erro ao buscar CEP:", viaCepError);
            // Se falhar, tenta extrair UF do endereço
            uf = municipioUf[1]?.split(',')[0]?.trim() || '';
          }
        }
        
        // Preencher dados automaticamente
        setDadosEmpresa({
          ...dadosEmpresa,
          razao_social: fornecedor.razao_social || '',
          cnpj: cnpj,
          logradouro: logradouro,
          numero: numero,
          bairro: bairro,
          municipio: municipio,
          uf: uf,
          cep: cep,
          endereco_comercial: enderecoCompleto,
        });
        
        toast.success("Dados do fornecedor preenchidos automaticamente!");
      } else {
        toast.info("CNPJ não encontrado no cadastro. Preencha os dados manualmente.");
      }
    } catch (error) {
      console.error("Erro ao buscar fornecedor:", error);
    } finally {
      setBuscandoFornecedor(false);
    }
  };
  

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
          percentual_desconto: 0,
          percentual_desconto_display: "",
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

  const gerarTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Template');

      const isDesconto = processoCompra?.criterio_julgamento === "desconto";

      // Definir cabeçalhos baseado no critério
      if (isDesconto) {
        worksheet.columns = [
          { header: 'Item', key: 'item', width: 10 },
          { header: 'Descrição', key: 'descricao', width: 50 },
          { header: 'Quantidade', key: 'quantidade', width: 15 },
          { header: 'Unidade', key: 'unidade', width: 12 },
          { header: 'Marca', key: 'marca', width: 20 },
          { header: 'Percentual de Desconto (%)', key: 'desconto', width: 25 }
        ];

        // Adicionar linhas - critério desconto
        itensCotacao.forEach(item => {
          worksheet.addRow({
            item: item.numero_item,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            marca: '',
            desconto: ''
          });
        });
      } else {
        worksheet.columns = [
          { header: 'Item', key: 'item', width: 10 },
          { header: 'Descrição', key: 'descricao', width: 50 },
          { header: 'Quantidade', key: 'quantidade', width: 15 },
          { header: 'Unidade', key: 'unidade', width: 12 },
          { header: 'Marca', key: 'marca', width: 20 },
          { header: 'Valor Unitário', key: 'valorUnitario', width: 20 },
          { header: 'Valor Total', key: 'valorTotal', width: 20 }
        ];

        // Adicionar linhas - outros critérios
        itensCotacao.forEach(item => {
          const row = worksheet.addRow({
            item: item.numero_item,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            marca: '',
            valorUnitario: '',
            valorTotal: ''
          });

          // Fórmula para calcular Valor Total (Quantidade * Valor Unitário)
          const rowNumber = row.number;
          row.getCell(7).value = { formula: `C${rowNumber}*F${rowNumber}` };
        });
      }

      // Desproteger TODAS as células primeiro
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.protection = { locked: false };
        });
      });

      // Proteger apenas Item, Descrição, Quantidade, Unidade (colunas 1-4)
      for (let colNum = 1; colNum <= 4; colNum++) {
        worksheet.getColumn(colNum).eachCell((cell) => {
          cell.protection = { locked: true };
        });
      }

      // Se não for desconto, também proteger Valor Total (coluna 7)
      if (!isDesconto) {
        worksheet.getColumn(7).eachCell((cell) => {
          cell.protection = { locked: true };
        });
      }

      // Aplicar proteção na planilha
      await worksheet.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false
      });

      // Gerar arquivo e fazer download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_${cotacao?.titulo_cotacao || 'cotacao'}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast.success("Template baixado! Apenas 'Marca' e valores são editáveis.");
    } catch (error) {
      console.error("Erro ao gerar template:", error);
      toast.error("Erro ao gerar template");
    }
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
          let numeroItem, marca, valorUnitario;
          
          const isDesconto = processoCompra?.criterio_julgamento === "desconto";
          
          if (isDesconto) {
            // Colunas: Item, Descrição, Quantidade, Unidade, Marca, Desconto
            [numeroItem, , , , marca, valorUnitario] = dados[i];
          } else {
            // Colunas: Item, Descrição, Quantidade, Unidade, Marca, Valor Unitário, Valor Total
            [numeroItem, , , , marca, valorUnitario] = dados[i];
          }
          
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

      // Validar se valores foram preenchidos de acordo com critério
      const criterio = processoCompra?.criterio_julgamento;
      
      if (criterio === "item" || criterio === "desconto") {
        // Para "item" e "desconto": apenas verificar se PELO MENOS um item foi preenchido
        const algumPreenchido = itensCotacao.some(item => {
          const resposta = respostas[item.id];
          
          if (criterio === "desconto") {
            return resposta?.percentual_desconto && resposta.percentual_desconto > 0;
          }
          return resposta?.valor_unitario_ofertado && resposta.valor_unitario_ofertado > 0;
        });
        
        if (!algumPreenchido) {
          const mensagem = criterio === "desconto"
            ? "Por favor, preencha o percentual de desconto de pelo menos um item"
            : "Por favor, preencha o valor unitário de pelo menos um item";
          toast.error(mensagem);
          setSubmitting(false);
          return;
        }
      } else if (criterio === "global") {
        // Para "global": validar que TODOS os itens foram preenchidos
        const itensIncompletos = itensCotacao.filter(item => {
          const resposta = respostas[item.id];
          return !resposta?.valor_unitario_ofertado || resposta.valor_unitario_ofertado <= 0;
        });

        if (itensIncompletos.length > 0) {
          toast.error("Por favor, preencha os valores unitários de todos os itens");
          setSubmitting(false);
          return;
        }
      } else if (criterio === "lote") {
        // Para "lote": validar que se algum item de um lote foi preenchido, 
        // TODOS os itens daquele lote devem estar preenchidos
        // Mas não é obrigatório preencher todos os lotes
        
        // Agrupar itens por lote
        const itemsPorLote = new Map<string, ItemCotacao[]>();
        itensCotacao.forEach(item => {
          const loteId = item.lote_id || 'sem_lote';
          if (!itemsPorLote.has(loteId)) {
            itemsPorLote.set(loteId, []);
          }
          itemsPorLote.get(loteId)!.push(item);
        });
        
        // Verificar cada lote
        let algumLotePreenchido = false;
        for (const [loteId, itensDoLote] of itemsPorLote.entries()) {
          const itensPreenchidos = itensDoLote.filter(item => {
            const resposta = respostas[item.id];
            return resposta?.valor_unitario_ofertado && resposta.valor_unitario_ofertado > 0;
          });
          
          if (itensPreenchidos.length > 0) {
            algumLotePreenchido = true;
            
            // Se algum item do lote foi preenchido, todos devem estar
            if (itensPreenchidos.length !== itensDoLote.length) {
              const lote = lotes.find(l => l.id === loteId);
              const loteNome = lote ? `Lote ${lote.numero_lote}` : 'um dos lotes';
              toast.error(`Se você cotar algum item do ${loteNome}, deve cotar TODOS os itens desse lote. Não é permitido cotar parcialmente um lote.`);
              setSubmitting(false);
              return;
            }
          }
        }
        
        if (!algumLotePreenchido) {
          toast.error("Por favor, preencha pelo menos um lote completo");
          setSubmitting(false);
          return;
        }
      }

      const valorTotal = calcularValorTotal();

      // Preparar endereço completo
      const enderecoCompleto = `${dadosEmpresa.logradouro}, Nº ${dadosEmpresa.numero}, ${dadosEmpresa.bairro}, ${dadosEmpresa.municipio}/${dadosEmpresa.uf}, CEP: ${dadosEmpresa.cep}`;
      
      console.log('📍 Dados do endereço do formulário:', {
        logradouro: dadosEmpresa.logradouro,
        numero: dadosEmpresa.numero,
        bairro: dadosEmpresa.bairro,
        municipio: dadosEmpresa.municipio,
        uf: dadosEmpresa.uf,
        cep: dadosEmpresa.cep,
        enderecoCompleto
      });

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

      // PRIMEIRO: Inserir itens da resposta ANTES de gerar o PDF
      const respostasItens = itensCotacao.map(item => {
        const respostaItem = respostas[item.id];
        
        // Se critério for desconto, salvar percentual_desconto e 0 em valor_unitario
        if (processoCompra?.criterio_julgamento === "desconto") {
          return {
            cotacao_resposta_fornecedor_id: respostaCriada.id,
            item_cotacao_id: item.id,
            valor_unitario_ofertado: 0, // Valor padrão quando é desconto
            percentual_desconto: respostaItem?.percentual_desconto || 0,
            marca: respostaItem?.marca_ofertada || null,
          };
        }
        
        // Senão, salvar valor_unitario normalmente
        return {
          cotacao_resposta_fornecedor_id: respostaCriada.id,
          item_cotacao_id: item.id,
          valor_unitario_ofertado: respostaItem?.valor_unitario_ofertado || 0,
          marca: respostaItem?.marca_ofertada || null,
        };
      });

      console.log('💾 Inserindo', respostasItens.length, 'itens para resposta ID:', respostaCriada.id);

      const { data: itensInseridos, error: itensError } = await supabaseAnon
        .from("respostas_itens_fornecedor")
        .insert(respostasItens)
        .select();

      if (itensError) {
        console.error('❌ Erro ao criar itens:', itensError);
        toast.error("Erro ao criar itens: " + itensError.message);
        throw itensError;
      }

      console.log('✅ Itens inseridos com sucesso:', itensInseridos);

      // Aguardar um pouco para garantir que a transação foi concluída
      await new Promise(resolve => setTimeout(resolve, 500));

      // DEPOIS: Gerar PDF certificado com comprovantes anexados
      toast.info("Gerando proposta certificada...");
      
      console.log('📄 Dados sendo enviados para o PDF:', {
        razao_social: dadosEmpresa.razao_social,
        cnpj: dadosEmpresa.cnpj,
        endereco_comercial: enderecoCompleto,
      });
      
      console.log('📎 Arquivos comprovantes:', arquivosComprovantes.length, 'arquivos');
      arquivosComprovantes.forEach((arquivo, index) => {
        console.log(`  ${index + 1}. ${arquivo.name} (${arquivo.type})`);
      });
      
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
        arquivosComprovantes,
        undefined,
        undefined,
        processoCompra?.criterio_julgamento
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
              {/* CNPJ como primeiro campo */}
              <div className="grid gap-2">
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input
                  id="cnpj"
                  value={dadosEmpresa.cnpj}
                  onChange={(e) => {
                    const cnpjFormatado = formatarCNPJ(e.target.value);
                    setDadosEmpresa({ ...dadosEmpresa, cnpj: cnpjFormatado });
                  }}
                  onBlur={(e) => {
                    // Buscar fornecedor quando usuário sair do campo CNPJ
                    buscarFornecedorPorCNPJ(e.target.value);
                  }}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className={errors.cnpj ? "border-destructive" : ""}
                  disabled={buscandoFornecedor}
                />
                {buscandoFornecedor && (
                  <p className="text-sm text-muted-foreground">Buscando fornecedor...</p>
                )}
                {errors.cnpj && (
                  <p className="text-sm text-destructive">{errors.cnpj}</p>
                )}
              </div>

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
                  {processoCompra?.tipo === "material" && processoCompra?.criterio_julgamento !== "desconto" && (
                    <TableHead className="text-center">Marca *</TableHead>
                  )}
                  {processoCompra?.criterio_julgamento === "desconto" ? (
                    <TableHead className="text-center">Percentual de Desconto Ofertado (%) *</TableHead>
                  ) : (
                    <>
                      <TableHead className="text-center">Valor Unitário (R$) *</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensCotacao.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.numero_item}</TableCell>
                    <TableCell>{item.descricao}</TableCell>
                    <TableCell className="text-center">{item.quantidade}</TableCell>
                    <TableCell className="text-center">{item.unidade}</TableCell>
                    
                    {processoCompra?.criterio_julgamento === "desconto" ? (
                      // Modo Percentual de Desconto
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">%</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0,00"
                            value={
                              respostas[item.id]?.percentual_desconto_display !== undefined
                                ? respostas[item.id].percentual_desconto_display
                                : respostas[item.id]?.percentual_desconto
                                ? respostas[item.id].percentual_desconto
                                    .toFixed(2)
                                    .replace('.', ',')
                                : ''
                            }
                            onChange={(e) => {
                              const input = e.target.value;
                              const valorLimpo = input.replace(/[^\d,]/g, '');
                              
                              setRespostas({
                                ...respostas,
                                [item.id]: {
                                  ...respostas[item.id],
                                  percentual_desconto_display: valorLimpo,
                                  percentual_desconto: parseFloat(valorLimpo.replace(',', '.')) || 0,
                                },
                              });
                            }}
                            className="text-right flex-1"
                          />
                        </div>
                      </TableCell>
                    ) : (
                      // Modo Valor Unitário
                      <>
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
                      </>
                    )}
                  </TableRow>
                ))}
                {processoCompra?.criterio_julgamento !== "desconto" && (
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell colSpan={processoCompra?.tipo === "material" ? 6 : 5} className="text-right">
                      TOTAL GERAL:
                    </TableCell>
                    <TableCell className="text-right">
                      R$ {calcularValorTotal().toFixed(2)}
                    </TableCell>
                  </TableRow>
                )}
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
