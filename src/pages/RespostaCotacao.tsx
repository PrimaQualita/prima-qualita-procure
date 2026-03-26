import React, { useState, useEffect, useRef } from "react";
import { limitarDuasCasasDecimais, truncarDuasCasas } from "@/lib/validators";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabasePublic as supabaseAnon } from "@/integrations/supabase/public-client";
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
import { Upload, FileText, X, Download, Eye } from "lucide-react";
import { gerarPropostaFornecedorPDF } from "@/lib/gerarPropostaFornecedorPDF";
import { DialogSelecionarResponsavelLegal } from "@/components/fornecedores/DialogSelecionarResponsavelLegal";
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

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
  email: z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
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
  const [prazoExpirado, setPrazoExpirado] = useState(false);
  const [cotacao, setCotacao] = useState<any>(null);
  const [processoCompra, setProcessoCompra] = useState<any>(null);
  const [itensCotacao, setItensCotacao] = useState<ItemCotacao[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [termoReferencia, setTermoReferencia] = useState<{nome_arquivo: string; url_arquivo: string} | null>(null);
  
  const [dadosEmpresa, setDadosEmpresa] = useState({
    razao_social: "",
    cnpj: "",
    email: "",
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
  const [dialogResponsavelLegalOpen, setDialogResponsavelLegalOpen] = useState(false);
  const [responsaveisLegaisDisponiveis, setResponsaveisLegaisDisponiveis] = useState<string[]>([]);
  const [modoManualResponsavel, setModoManualResponsavel] = useState(false);
  const responsavelLegalRef = useRef<string | undefined>(undefined);

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
        .select("razao_social, endereco_comercial, cnpj, email")
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
          email: fornecedor.email || '',
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

      // Verificar data limite - apenas setar flag, continua carregando itens
      // Usar fuso horário de Brasília (America/Sao_Paulo = UTC-3)
      const dataLimite = new Date(cotacaoData.data_limite_resposta);
      const agora = new Date();
      
      // Converter para horário de Brasília para comparação correta
      const agoraBrasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const dataLimiteBrasilia = new Date(dataLimite.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      
      if (dataLimiteBrasilia < agoraBrasilia) {
        setPrazoExpirado(true);
      }

      setCotacao(cotacaoData);

      // Buscar processo com contrato de gestão
      const { data: processoData } = await supabaseAnon
        .from("processos_compras")
        .select(`
          *,
          contratos_gestao:contrato_gestao_id(nome_contrato)
        `)
        .eq("id", cotacaoData.processo_compra_id)
        .single();

      setProcessoCompra(processoData);

      // Buscar termo de referência do processo
      if (processoData?.id) {
        const { data: termoData } = await supabaseAnon
          .from("anexos_processo_compra")
          .select("nome_arquivo, url_arquivo")
          .eq("processo_compra_id", processoData.id)
          .eq("tipo_anexo", "termo_referencia")
          .maybeSingle();

        if (termoData) {
          setTermoReferencia(termoData);
        }
      }

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
      const isPorLote = processoCompra?.criterio_julgamento === "por_lote";
      const mostrarMarca = processoCompra?.tipo === "material";

      // Definir cabeçalhos baseado no critério
      if (isDesconto) {
        const columns: any[] = [
          { header: 'Item', key: 'item', width: 10 },
          { header: 'Descrição', key: 'descricao', width: 50 },
          { header: 'Quantidade', key: 'quantidade', width: 15 },
          { header: 'Unidade', key: 'unidade', width: 12 },
        ];
        if (mostrarMarca) {
          columns.push({ header: 'Marca', key: 'marca', width: 20 });
        }
        columns.push({ header: 'Percentual de Desconto (%)', key: 'desconto', width: 25 });
        worksheet.columns = columns;

        // Adicionar linhas - critério desconto
        itensCotacao.forEach(item => {
          const rowData: any = {
            item: item.numero_item,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            desconto: ''
          };
          if (mostrarMarca) rowData.marca = '';
          worksheet.addRow(rowData);
        });
      } else {
        const columns: any[] = [
          { header: 'Item', key: 'item', width: 10 },
          { header: 'Descrição', key: 'descricao', width: 50 },
          { header: 'Quantidade', key: 'quantidade', width: 15 },
          { header: 'Unidade de Medida', key: 'unidade', width: 18 },
        ];
        if (mostrarMarca) {
          columns.push({ header: 'Marca', key: 'marca', width: 20 });
        }
        columns.push(
          { header: 'Valor Unitário', key: 'valorUnitario', width: 20 },
          { header: 'Valor Total', key: 'valorTotal', width: 20 }
        );
        worksheet.columns = columns;

        // Índices dinâmicos baseado em se tem marca ou não
        const colValor = mostrarMarca ? 6 : 5;
        const colTotal = mostrarMarca ? 7 : 6;
        const colLetraValor = mostrarMarca ? 'F' : 'E';
        const colLetraTotal = mostrarMarca ? 'G' : 'F';

        // Se for por lote, agrupar por lote
        if (isPorLote && lotes.length > 0) {
          lotes.forEach(lote => {
            // Adicionar linha de título do lote
            const loteRowData: any = {
              item: `LOTE ${lote.numero_lote}`,
              descricao: lote.descricao_lote,
              quantidade: '',
              unidade: '',
              valorUnitario: '',
              valorTotal: ''
            };
            if (mostrarMarca) loteRowData.marca = '';
            const loteRow = worksheet.addRow(loteRowData);
            
            // Estilizar linha do lote
            loteRow.eachCell((cell) => {
              cell.font = { bold: true };
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE6E6E6' }
              };
              cell.protection = { locked: true };
            });
            
            // Adicionar itens deste lote
            const itensDoLote = itensCotacao.filter(item => item.lote_id === lote.id);
            const primeiraLinhaItens = worksheet.rowCount + 1;
            
            itensDoLote.forEach(item => {
              const rowData: any = {
                item: item.numero_item,
                descricao: item.descricao,
                quantidade: item.quantidade,
                unidade: item.unidade,
                valorUnitario: '',
                valorTotal: ''
              };
              if (mostrarMarca) rowData.marca = '';
              const row = worksheet.addRow(rowData);

              // Fórmula para calcular Valor Total (Quantidade * Valor Unitário)
              const rowNumber = row.number;
              row.getCell(colTotal).value = { formula: `C${rowNumber}*${colLetraValor}${rowNumber}` };
            });
            
            const ultimaLinhaItens = worksheet.rowCount;
            
            // Adicionar linha de subtotal do lote
            const subtotalRowData: any = {
              item: '',
              descricao: '',
              quantidade: '',
              unidade: '',
              valorUnitario: `SUBTOTAL LOTE ${lote.numero_lote}:`,
              valorTotal: ''
            };
            if (mostrarMarca) subtotalRowData.marca = '';
            const subtotalRow = worksheet.addRow(subtotalRowData);
            
            // Fórmula para somar valores totais do lote
            subtotalRow.getCell(colTotal).value = { formula: `SUM(${colLetraTotal}${primeiraLinhaItens}:${colLetraTotal}${ultimaLinhaItens})` };
            
            // Estilizar linha de subtotal
            subtotalRow.eachCell((cell) => {
              cell.font = { bold: true };
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDDEEFF' }
              };
              cell.protection = { locked: true };
            });
          });
          
          // Adicionar linha de total geral
          const totalGeralRowData: any = {
            item: '',
            descricao: '',
            quantidade: '',
            unidade: '',
            valorUnitario: 'VALOR TOTAL GERAL:',
            valorTotal: ''
          };
          if (mostrarMarca) totalGeralRowData.marca = '';
          const totalGeralRow = worksheet.addRow(totalGeralRowData);
          
          // Soma de todos os subtotais (coluna de valor total)
          const linhasSubtotal: number[] = [];
          worksheet.eachRow((row, rowNumber) => {
            const cell = row.getCell(colValor);
            if (cell.value && String(cell.value).includes('SUBTOTAL LOTE')) {
              linhasSubtotal.push(rowNumber);
            }
          });
          
          if (linhasSubtotal.length > 0) {
            const formula = linhasSubtotal.map(r => `${colLetraTotal}${r}`).join('+');
            totalGeralRow.getCell(colTotal).value = { formula };
          }
          
          // Estilizar linha de total geral
          totalGeralRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF1E40AF' }
            };
            cell.protection = { locked: true };
          });
        } else {
          // Adicionar linhas - outros critérios (global ou item)
          itensCotacao.forEach(item => {
            const rowData: any = {
              item: item.numero_item,
              descricao: item.descricao,
              quantidade: item.quantidade,
              unidade: item.unidade,
              valorUnitario: '',
              valorTotal: ''
            };
            if (mostrarMarca) rowData.marca = '';
            const row = worksheet.addRow(rowData);

            // Fórmula para calcular Valor Total (Quantidade * Valor Unitário)
            const rowNumber = row.number;
            row.getCell(colTotal).value = { formula: `C${rowNumber}*${colLetraValor}${rowNumber}` };
          });
        }
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

        const isDesconto = processoCompra?.criterio_julgamento === "desconto";
        const criterio = processoCompra?.criterio_julgamento;
        const isPorLote = criterio === "lote" || criterio === "por_lote";
        const mostrarMarca = processoCompra?.tipo === "material";
        
        // Índices dinâmicos baseado em se tem marca ou não
        const colMarcaIdx = mostrarMarca ? 4 : -1;
        const colValorIdx = mostrarMarca ? 5 : 4;
        
        // Variável para rastrear o lote atual durante a importação
        let loteAtualId: string | null = null;

        // Ignorar cabeçalho (primeira linha)
        for (let i = 1; i < dados.length; i++) {
          const row = dados[i];
          if (!row || row.length === 0) continue;
          
          const itemCol = row[0];
          const marcaCol = mostrarMarca ? row[colMarcaIdx] : null;
          const valorCol = row[colValorIdx];
          
          // Detectar linha de título de lote e atualizar lote atual
          if (typeof itemCol === 'string' && itemCol.toUpperCase().startsWith('LOTE')) {
            if (isPorLote) {
              // Extrair número do lote (ex: "LOTE 1" ou "LOTE 2")
              const matchLote = itemCol.match(/LOTE\s*(\d+)/i);
              if (matchLote) {
                const numeroLote = parseInt(matchLote[1]);
                const loteEncontrado = lotes.find(l => l.numero_lote === numeroLote);
                loteAtualId = loteEncontrado?.id || null;
                console.log(`Linha ${i + 1}: Detectado título de lote ${numeroLote}, lote_id: ${loteAtualId}`);
              }
            }
            continue;
          }
          
          // Pular linhas de subtotal e total geral
          if (typeof valorCol === 'string' && (valorCol.includes('SUBTOTAL') || valorCol.includes('TOTAL'))) {
            console.log(`Linha ${i + 1}: Pulando linha de subtotal/total`);
            continue;
          }
          
          // Verificar se é uma linha válida de item (número de item válido)
          const numeroItem = typeof itemCol === 'number' ? itemCol : parseInt(String(itemCol));
          if (isNaN(numeroItem) || numeroItem <= 0) {
            console.log(`Linha ${i + 1}: item inválido - ${itemCol}`);
            continue;
          }
          
          const marca = marcaCol ? String(marcaCol).trim() : '';
          const valorUnitario = valorCol;
          
          console.log(`Linha ${i + 1} - Item: ${numeroItem}, LoteAtual: ${loteAtualId}, Valor: "${valorUnitario}", Marca: "${marca}"`);
          
          // Pular itens sem valor preenchido
          if (!valorUnitario || String(valorUnitario).trim() === '' || String(valorUnitario).trim() === '0') {
            console.log(`Linha ${i + 1}: valor vazio ou zero`);
            continue;
          }

          // Buscar item pelo numero_item E lote_id (quando aplicável)
          let item: ItemCotacao | undefined;
          if (isPorLote && loteAtualId) {
            // Buscar item pelo numero_item dentro do lote atual
            item = itensCotacao.find(it => it.numero_item === numeroItem && it.lote_id === loteAtualId);
          } else {
            // Buscar item apenas pelo numero_item (critérios não lotizados)
            item = itensCotacao.find(it => it.numero_item === numeroItem);
          }
          
          if (item) {
            const valorNumerico = truncarDuasCasas(parseFloat(String(valorUnitario).replace(/,/g, '.')));
            const valorFormatado = valorNumerico.toFixed(2).replace('.', ',');
            
            if (isDesconto) {
              novasRespostas[item.id] = {
                ...novasRespostas[item.id],
                percentual_desconto: valorNumerico,
                percentual_desconto_display: valorFormatado,
                marca_ofertada: marca,
                valor_unitario_ofertado: 0
              };
            } else {
              novasRespostas[item.id] = {
                ...novasRespostas[item.id],
                valor_unitario_ofertado: valorNumerico,
                valor_display: valorFormatado,
                marca_ofertada: marca
              };
            }
            importados++;
            console.log(`✅ Item ${numeroItem} (lote: ${loteAtualId}) importado - Valor: "${valorFormatado}", Marca: "${marca}"`);
          } else {
            console.log(`❌ Item ${numeroItem} não encontrado ${isPorLote ? `no lote ${loteAtualId}` : 'na lista de itens'}`);
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
            const valorNumerico = truncarDuasCasas(parseFloat(valorUnitario.replace(/,/g, '.')));
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

  const handlePreSubmit = async () => {
    // Verificar se o fornecedor tem responsáveis legais cadastrados
    const cnpjLimpo = dadosEmpresa.cnpj.replace(/[^\d]/g, "");
    if (cnpjLimpo.length === 14) {
      try {
        const { data: fornecedorData } = await supabaseAnon
          .from("fornecedores")
          .select("responsaveis_legais")
          .eq("cnpj", cnpjLimpo)
          .maybeSingle();

        const responsaveis = Array.isArray(fornecedorData?.responsaveis_legais)
          ? (fornecedorData.responsaveis_legais as string[]).filter((r: string) => r && r.trim() !== '')
          : [];

        if (responsaveis.length > 1) {
          setModoManualResponsavel(false);
          setResponsaveisLegaisDisponiveis(responsaveis);
          setDialogResponsavelLegalOpen(true);
          return;
        } else if (responsaveis.length === 1) {
          responsavelLegalRef.current = responsaveis[0];
        } else {
          // Empresa não cadastrada ou sem responsáveis - abrir modo manual
          setModoManualResponsavel(true);
          setResponsaveisLegaisDisponiveis([]);
          setDialogResponsavelLegalOpen(true);
          return;
        }
      } catch (error) {
        console.error("Erro ao buscar responsáveis legais:", error);
        // Falha na busca - abrir modo manual
        setModoManualResponsavel(true);
        setResponsaveisLegaisDisponiveis([]);
        setDialogResponsavelLegalOpen(true);
        return;
      }
    } else {
      // CNPJ inválido/incompleto - abrir modo manual
      setModoManualResponsavel(true);
      setResponsaveisLegaisDisponiveis([]);
      setDialogResponsavelLegalOpen(true);
      return;
    }
    handleSubmit();
  };

  const handleConfirmarResponsavelLegal = (selecionados: string[]) => {
    responsavelLegalRef.current = selecionados.join(', ');
    setDialogResponsavelLegalOpen(false);
    handleSubmit();
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
      
      // VALIDAÇÃO: Se preencheu marca OU valor em um item, AMBOS devem estar preenchidos
      // EXCETO para serviço ou mão de obra exclusiva, onde marca não é necessária
      const tipoProcesso = processoCompra?.tipo;
      const exigeMarca = tipoProcesso === "material";
      
      for (const item of itensCotacao) {
        const resposta = respostas[item.id];
        const temMarca = resposta?.marca_ofertada && resposta.marca_ofertada.trim() !== '';
        const temValor = criterio === "desconto" 
          ? (resposta?.percentual_desconto && resposta.percentual_desconto > 0)
          : (resposta?.valor_unitario_ofertado && resposta.valor_unitario_ofertado > 0);
        
        // Só validar marca se o tipo do processo for "material"
        if (exigeMarca) {
          if (temMarca && !temValor) {
            const campoFaltando = criterio === "desconto" ? "percentual de desconto" : "valor unitário";
            toast.error(`Item ${item.numero_item}: Você preencheu a marca, mas não informou o ${campoFaltando}. Complete o item ou deixe ambos os campos vazios.`);
            setSubmitting(false);
            return;
          }
          
          if (temValor && !temMarca) {
            toast.error(`Item ${item.numero_item}: Você preencheu o ${criterio === "desconto" ? "percentual de desconto" : "valor unitário"}, mas não informou a marca. Complete o item ou deixe ambos os campos vazios.`);
            setSubmitting(false);
            return;
          }
        }
      }
      
      if (criterio === "por_item" || criterio === "desconto") {
        // Para "por_item" e "desconto": apenas verificar se PELO MENOS um item foi preenchido
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
      } else if (criterio === "por_lote") {
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
          email: dadosEmpresa.email || `cotacao-${cnpjLimpo}@temporario.com`,
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

      // ANTES de limpar registros, deletar arquivos físicos do storage para evitar órfãos
      try {
        const { data: respostaExistente } = await supabaseAnon
          .from('cotacao_respostas_fornecedor')
          .select('id, url_pdf_proposta, comprovantes_urls')
          .eq('cotacao_id', cotacao.id)
          .eq('fornecedor_id', fornecedorId)
          .maybeSingle();

        if (respostaExistente) {
          const arquivosParaDeletar: string[] = [];

          // Coletar URL do PDF da proposta
          if (respostaExistente.url_pdf_proposta) {
            let pdfPath = respostaExistente.url_pdf_proposta;
            // Extrair path relativo do bucket
            if (pdfPath.includes('processo-anexos/')) {
              pdfPath = pdfPath.split('processo-anexos/').pop() || pdfPath;
            }
            pdfPath = pdfPath.split('?')[0];
            try { pdfPath = decodeURIComponent(pdfPath); } catch {}
            if (pdfPath) arquivosParaDeletar.push(pdfPath);
          }

          // Coletar comprovantes
          if (respostaExistente.comprovantes_urls && Array.isArray(respostaExistente.comprovantes_urls)) {
            respostaExistente.comprovantes_urls.forEach((url: string) => {
              let p = url;
              if (p.includes('processo-anexos/')) {
                p = p.split('processo-anexos/').pop() || p;
              }
              p = p.split('?')[0];
              try { p = decodeURIComponent(p); } catch {}
              if (p) arquivosParaDeletar.push(p);
            });
          }

          // Coletar anexos de cotação (tipo PROPOSTA etc)
          const { data: anexosExistentes } = await supabaseAnon
            .from('anexos_cotacao_fornecedor')
            .select('url_arquivo')
            .eq('cotacao_resposta_fornecedor_id', respostaExistente.id);

          if (anexosExistentes) {
            anexosExistentes.forEach((a: any) => {
              let p = a.url_arquivo;
              if (p?.includes('processo-anexos/')) {
                p = p.split('processo-anexos/').pop() || p;
              }
              p = p?.split('?')[0];
              try { p = decodeURIComponent(p); } catch {}
              if (p) arquivosParaDeletar.push(p);
            });
          }

          // Deletar arquivos do storage
          if (arquivosParaDeletar.length > 0) {
            console.log(`🗑️ Deletando ${arquivosParaDeletar.length} arquivo(s) antigo(s) do storage antes de limpar registros`);
            await supabaseAnon.storage.from('processo-anexos').remove(arquivosParaDeletar);
          }
        }
      } catch (errStorage) {
        // Não bloquear o envio por falha de limpeza de storage
        console.warn('⚠️ Erro ao limpar arquivos antigos do storage:', errStorage);
      }

      // Limpar resposta anterior (se existir) via SECURITY DEFINER
      await supabaseAnon.rpc('limpar_resposta_existente_fornecedor', {
        p_cotacao_id: cotacao.id,
        p_fornecedor_id: fornecedorId,
      });

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

      // Usar função RPC SECURITY DEFINER para contornar RLS
      const { data: rpcResult, error: itensError } = await supabaseAnon
        .rpc('inserir_respostas_itens', {
          p_itens: respostasItens
        });

      if (itensError) {
        console.error('❌ Erro ao criar itens:', itensError);
        toast.error("Erro ao criar itens: " + itensError.message);
        throw itensError;
      }

      console.log('✅ Itens inseridos com sucesso:', rpcResult);

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
      
      const { url: pdfUrl, path: pdfPath, nome: pdfNome, hash: hashProposta, protocolo } = await gerarPropostaFornecedorPDF(
        respostaCriada.id,
        {
          razao_social: dadosEmpresa.razao_social,
          cnpj: dadosEmpresa.cnpj,
          endereco_comercial: enderecoCompleto,
          email: dadosEmpresa.email,
        },
        valorTotal,
        observacoes,
        cotacao.titulo_cotacao,
        arquivosComprovantes,
        undefined,
        undefined,
        processoCompra?.criterio_julgamento,
        supabaseAnon, // Passar o cliente público para funcionar sem autenticação
        responsavelLegalRef.current,
        processoCompra?.tipo
      );

      // Finalizar resposta via função no backend (bypass das regras de atualização para usuário público)
      const { error: finalizarError } = await supabaseAnon.rpc('finalizar_resposta_cotacao_fornecedor', {
        p_resposta_id: respostaCriada.id,
        p_protocolo: protocolo,
        p_hash: hashProposta,
        p_url_pdf_proposta: pdfUrl,
        p_pdf_path: pdfPath,
        p_pdf_nome: pdfNome,
        p_comprovantes_urls: []
      });

      if (finalizarError) {
        throw finalizarError;
      }

      // Registrar auditoria de envio de proposta (via RPC para funcionar com cliente anônimo)
      const { error: auditError } = await supabaseAnon.rpc('registrar_auditoria_proposta_fornecedor', {
        p_entidade_id: respostaCriada.id,
        p_fornecedor_nome: dadosEmpresa.razao_social,
        p_fornecedor_cnpj: cnpjLimpo,
        p_valor_total: valorTotal,
        p_contrato_gestao: processoCompra?.contratos_gestao?.nome_contrato || "",
        p_numero_processo: processoCompra?.numero_processo_interno || "",
        p_titulo_cotacao: cotacao.titulo_cotacao
      });

      if (auditError) {
        console.error("Erro ao registrar auditoria (não bloqueia):", auditError);
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
        {/* Termo de Referência */}
        {termoReferencia && (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Termo de Referência
              </CardTitle>
              <CardDescription>
                Documento com as especificações técnicas e condições desta cotação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{termoReferencia.nome_arquivo}</span>
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/processo-anexos/${termoReferencia.url_arquivo}`;
                      window.open(url, '_blank');
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Visualizar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/processo-anexos/${termoReferencia.url_arquivo}`;
                      try {
                        const response = await fetch(url);
                        const blob = await response.blob();
                        const blobUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = termoReferencia.nome_arquivo;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(blobUrl);
                      } catch (error) {
                        console.error('Erro ao baixar arquivo:', error);
                        toast.error('Erro ao baixar o arquivo');
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Baixar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
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

              <div className="grid gap-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input
                  id="email"
                  type="email"
                  value={dadosEmpresa.email}
                  onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, email: e.target.value })}
                  placeholder="email@empresa.com.br"
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
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
                  <TableHead className="w-14">Item</TableHead>
                  <TableHead className={processoCompra?.tipo === "material" ? "w-[30%]" : "w-[45%]"}>Descrição</TableHead>
                  <TableHead className="text-center w-16">Qtd</TableHead>
                  <TableHead className="text-center w-14">Unid.</TableHead>
                  {processoCompra?.tipo === "material" && <TableHead className="text-center w-[150px]">Marca *</TableHead>}
                  {processoCompra?.criterio_julgamento === "desconto" ? (
                    <TableHead className="text-center w-[160px]">Percentual de Desconto Ofertado (%) *</TableHead>
                  ) : (
                    <>
                      <TableHead className="text-center w-[140px]">Valor Unitário (R$) *</TableHead>
                      <TableHead className="text-right w-[120px]">Valor Total</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {processoCompra?.criterio_julgamento === "por_lote" && lotes.length > 0 ? (
                  // Renderização agrupada por lote
                  <>
                    {lotes.map((lote) => {
                      const itensDoLote = itensCotacao.filter(item => item.lote_id === lote.id);
                      const subtotalLote = itensDoLote.reduce((acc, item) => {
                        return acc + (item.quantidade * (respostas[item.id]?.valor_unitario_ofertado || 0));
                      }, 0);
                      
                      return (
                        <React.Fragment key={`lote-group-${lote.id}`}>
                          {/* Linha de título do lote */}
                          <TableRow className="bg-muted/70">
                            <TableCell colSpan={7} className="font-bold text-primary">
                              LOTE {lote.numero_lote} - {lote.descricao_lote}
                            </TableCell>
                          </TableRow>
                          {/* Itens do lote */}
                          {itensDoLote.map((item) => (
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
                                    const valorLimpo = limitarDuasCasasDecimais(input);
                                    
                                    setRespostas({
                                      ...respostas,
                                      [item.id]: {
                                        ...respostas[item.id],
                                        valor_display: valorLimpo,
                                        valor_unitario_ofertado: truncarDuasCasas(parseFloat(valorLimpo.replace(',', '.')) || 0),
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
                          {/* Linha de subtotal do lote */}
                          <TableRow className="bg-blue-50">
                            <TableCell colSpan={6} className="text-right font-semibold">
                              SUBTOTAL LOTE {lote.numero_lote}:
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              R$ {subtotalLote.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                    <TableRow className="font-bold bg-primary text-primary-foreground">
                      <TableCell colSpan={6} className="text-right">
                        VALOR TOTAL GERAL:
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {calcularValorTotal().toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  </>
                ) : (
                  // Renderização normal (não é por lote)
                  <>
                    {itensCotacao.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell className="text-center">{item.quantidade}</TableCell>
                        <TableCell className="text-center">{item.unidade}</TableCell>
                        
                        {processoCompra?.criterio_julgamento === "desconto" ? (
                          // Modo Percentual de Desconto
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
                                    const valorLimpo = limitarDuasCasasDecimais(input);
                                    
                                    setRespostas({
                                      ...respostas,
                                      [item.id]: {
                                        ...respostas[item.id],
                                        percentual_desconto_display: valorLimpo,
                                        percentual_desconto: truncarDuasCasas(parseFloat(valorLimpo.replace(',', '.')) || 0),
                                      },
                                    });
                                  }}
                                  className="text-right flex-1"
                                />
                              </div>
                            </TableCell>
                          </>
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
                                  const valorLimpo = limitarDuasCasasDecimais(input);
                                  
                                  setRespostas({
                                    ...respostas,
                                    [item.id]: {
                                      ...respostas[item.id],
                                      valor_display: valorLimpo,
                                      valor_unitario_ofertado: truncarDuasCasas(parseFloat(valorLimpo.replace(',', '.')) || 0),
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
                    {processoCompra?.criterio_julgamento !== "desconto" && 
                     processoCompra?.criterio_julgamento !== "por_lote" && (
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell colSpan={6} className="text-right">
                          TOTAL GERAL:
                        </TableCell>
                        <TableCell className="text-right">
                          R$ {calcularValorTotal().toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
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
            {prazoExpirado && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md">
                <p className="font-semibold">O prazo para envio desta cotação expirou.</p>
                <p className="text-sm">Não é mais possível enviar propostas para esta cotação.</p>
              </div>
            )}
            
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
                  disabled={prazoExpirado}
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
                  disabled={prazoExpirado}
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
            
            {/* Informações importantes antes do botão */}
            <div className="space-y-2 text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg border">
              <p>
                <strong>1.</strong> Ao clicar em ENVIAR PROPOSTA, você concorda que o prazo de validade mínimo da sua proposta será de <strong>60 dias</strong>.
              </p>
              <p>
                <strong>2.</strong> Ao clicar em ENVIAR PROPOSTA, você declara estar ciente e concordar integralmente com os termos e condições contidas no Termo de Referência e/ou Instrumento Convocatório.
              </p>
            </div>
            
            <Button 
              onClick={handlePreSubmit}
              disabled={submitting || prazoExpirado}
              className="w-full"
            >
              {submitting ? "Enviando Proposta..." : prazoExpirado ? "Prazo Expirado" : "Enviar Proposta"}
            </Button>
            
            {submitting && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Gerando PDF certificado e enviando...
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <DialogSelecionarResponsavelLegal
        open={dialogResponsavelLegalOpen}
        onOpenChange={setDialogResponsavelLegalOpen}
        responsaveisLegais={responsaveisLegaisDisponiveis}
        onConfirm={handleConfirmarResponsavelLegal}
        loading={submitting}
        modoManual={modoManualResponsavel}
      />
    </div>
  );
};

export default RespostaCotacao;
