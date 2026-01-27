import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Gavel, Send, Upload, LogIn, X } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import primaLogo from "@/assets/prima-qualita-logo-horizontal.png";
import { z } from "zod";
import { DialogImportarProposta } from "@/components/selecoes/DialogImportarProposta";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

// Validação CNPJ
const validarCNPJ = (cnpj: string): boolean => {
  const cnpjLimpo = cnpj.replace(/[^\d]/g, "");
  if (cnpjLimpo.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpjLimpo)) return false;
  
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

const formatarCNPJ = (valor: string): string => {
  const apenasNumeros = valor.replace(/[^\d]/g, "");
  if (apenasNumeros.length <= 2) return apenasNumeros;
  if (apenasNumeros.length <= 5) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2)}`;
  if (apenasNumeros.length <= 8) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5)}`;
  if (apenasNumeros.length <= 12) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5, 8)}/${apenasNumeros.slice(8)}`;
  return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5, 8)}/${apenasNumeros.slice(8, 12)}-${apenasNumeros.slice(12, 14)}`;
};

// Identificar UF pelo CEP
const identificarUfPorCep = (cep: string): string => {
  const cepLimpo = cep.replace(/[^\d]/g, "");
  if (cepLimpo.length < 5) return "";
  
  const prefixo = parseInt(cepLimpo.substring(0, 5));
  
  // Faixas de CEP por estado
  if (prefixo >= 1000 && prefixo <= 19999) return "SP";
  if (prefixo >= 20000 && prefixo <= 28999) return "RJ";
  if (prefixo >= 29000 && prefixo <= 29999) return "ES";
  if (prefixo >= 30000 && prefixo <= 39999) return "MG";
  if (prefixo >= 40000 && prefixo <= 48999) return "BA";
  if (prefixo >= 49000 && prefixo <= 49999) return "SE";
  if (prefixo >= 50000 && prefixo <= 56999) return "PE";
  if (prefixo >= 57000 && prefixo <= 57999) return "AL";
  if (prefixo >= 58000 && prefixo <= 58999) return "PB";
  if (prefixo >= 59000 && prefixo <= 59999) return "RN";
  if (prefixo >= 60000 && prefixo <= 63999) return "CE";
  if (prefixo >= 64000 && prefixo <= 64999) return "PI";
  if (prefixo >= 65000 && prefixo <= 65999) return "MA";
  if (prefixo >= 66000 && prefixo <= 68899) return "PA";
  if (prefixo >= 68900 && prefixo <= 68999) return "AP";
  if (prefixo >= 69000 && prefixo <= 69299) return "AM";
  if (prefixo >= 69300 && prefixo <= 69399) return "RR";
  if (prefixo >= 69400 && prefixo <= 69899) return "AM";
  if (prefixo >= 69900 && prefixo <= 69999) return "AC";
  if (prefixo >= 70000 && prefixo <= 72799) return "DF";
  if (prefixo >= 72800 && prefixo <= 72999) return "GO";
  if (prefixo >= 73000 && prefixo <= 76799) return "GO";
  if (prefixo >= 76800 && prefixo <= 77999) return "TO";
  if (prefixo >= 78000 && prefixo <= 78899) return "MT";
  if (prefixo >= 78900 && prefixo <= 78999) return "RO";
  if (prefixo >= 79000 && prefixo <= 79999) return "MS";
  if (prefixo >= 80000 && prefixo <= 87999) return "PR";
  if (prefixo >= 88000 && prefixo <= 89999) return "SC";
  if (prefixo >= 90000 && prefixo <= 99999) return "RS";
  
  return "";
};

const formatarTelefone = (valor: string): string => {
  const apenasNumeros = valor.replace(/[^\d]/g, "");
  if (apenasNumeros.length <= 2) return apenasNumeros;
  if (apenasNumeros.length <= 6) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`;
  if (apenasNumeros.length <= 10) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`;
  return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7, 11)}`;
};

const dadosEmpresaSchema = z.object({
  razao_social: z.string().trim().min(1, "Razão Social é obrigatória").max(255),
  cnpj: z.string().trim().min(1, "CNPJ é obrigatório").refine((val) => validarCNPJ(val), { message: "CNPJ inválido" }),
  email: z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
  telefone: z.string().trim().min(14, "Telefone inválido").max(15, "Telefone inválido"),
  logradouro: z.string().trim().min(1, "Logradouro é obrigatório").max(255),
  numero: z.string().trim().min(1, "Número é obrigatório").max(20),
  bairro: z.string().trim().min(1, "Bairro é obrigatório").max(100),
  municipio: z.string().trim().min(1, "Município é obrigatório").max(100),
  uf: z.string().length(2, "UF inválida"),
  cep: z.string().trim().min(8, "CEP inválido").max(9),
});

interface Item {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca?: string;
  valor_unitario_estimado: number;
  valor_total: number;
  lote_id?: string | null;
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

const ParticiparSelecao = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selecaoId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);
  const [criterioJulgamento, setCriterioJulgamento] = useState<string>("");
  const [itens, setItens] = useState<Item[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [documentosAnexados, setDocumentosAnexados] = useState<any[]>([]);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [isPublicAccess, setIsPublicAccess] = useState(false);
  const [jaEnviouProposta, setJaEnviouProposta] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [acessoCodigoDialogOpen, setAcessoCodigoDialogOpen] = useState(false);
  const [codigoAcesso, setCodigoAcesso] = useState("");
  const [validandoCodigo, setValidandoCodigo] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<{
    verificando: boolean;
    existe: boolean;
    temCadastro: boolean;
  }>({ verificando: false, existe: false, temCadastro: false });
  
  const [dadosEmpresa, setDadosEmpresa] = useState({
    razao_social: "",
    cnpj: "",
    email: "",
    telefone: "",
    logradouro: "",
    numero: "",
    bairro: "",
    municipio: "",
    uf: "",
    cep: "",
  });
  
  const [respostas, setRespostas] = useState<RespostaItem>({});
  const [observacoes, setObservacoes] = useState("");
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [arquivosComprovantes, setArquivosComprovantes] = useState<File[]>([]);
  const [prazoExpirado, setPrazoExpirado] = useState(false);

  // Verificar prazo em tempo real - encerrar exatamente no horário da sessão
  useEffect(() => {
    if (!selecao?.data_sessao_disputa || !selecao?.hora_sessao_disputa) return;

    const verificarPrazo = () => {
      // data_sessao_disputa pode vir como "YYYY-MM-DD" ou timestamp; usamos só a parte da data.
      const dataPart = String(selecao.data_sessao_disputa).split("T")[0];

      // hora_sessao_disputa pode vir como "HH:mm" ou "HH:mm:ss".
      const horaRaw = String(selecao.hora_sessao_disputa).trim();
      const horaPart =
        horaRaw.length === 5 ? `${horaRaw}:00` : horaRaw.length >= 8 ? horaRaw.slice(0, 8) : horaRaw;

      // Construir data/hora da sessão com offset de Brasília (UTC-3)
      const dataHoraSessao = new Date(`${dataPart}T${horaPart}-03:00`);
      if (Number.isNaN(dataHoraSessao.getTime())) return;

      const agora = new Date();
      setPrazoExpirado(agora >= dataHoraSessao);
    };

    // Verificar imediatamente
    verificarPrazo();

    // Verificar a cada segundo
    const interval = setInterval(verificarPrazo, 1000);

    return () => clearInterval(interval);
  }, [selecao?.data_sessao_disputa, selecao?.hora_sessao_disputa]);



  const verificarCnpjExistente = async (cnpj: string) => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
      return;
    }

    if (!validarCNPJ(cnpj)) {
      setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
      return;
    }

    setCnpjStatus(prev => ({ ...prev, verificando: true }));

    try {
      const { data: fornecedorExistente } = await supabase
        .from('fornecedores')
        .select('id, user_id, status_aprovacao, razao_social, email, telefone, endereco_comercial')
        .eq('cnpj', cnpjLimpo)
        .maybeSingle();

      if (fornecedorExistente) {
        const temCadastroCompleto = fornecedorExistente.user_id !== null;
        setCnpjStatus({
          verificando: false,
          existe: true,
          temCadastro: temCadastroCompleto
        });
        
        // Preencher automaticamente os dados do fornecedor se já existir
        setDadosEmpresa(prev => ({
          ...prev,
          razao_social: fornecedorExistente.razao_social || prev.razao_social,
          cnpj: formatarCNPJ(cnpjLimpo),
          email: fornecedorExistente.email || prev.email,
          telefone: fornecedorExistente.telefone ? formatarTelefone(fornecedorExistente.telefone) : prev.telefone,
        }));
        
        // Tentar extrair endereço se disponível
        if (fornecedorExistente.endereco_comercial) {
          const endereco = fornecedorExistente.endereco_comercial;
          
          // Parse mais robusto: dividir por vírgula e identificar partes
          // Formato esperado: "Rua X, Nº 123, Bairro, Cidade - UF, CEP" ou variações
          const partes = endereco.split(',').map(p => p.trim());
          
          let logradouro = '';
          let numero = '';
          let bairro = '';
          let municipio = '';
          let uf = '';
          let cep = '';
          
          // Primeira parte geralmente é logradouro (pode incluir número)
          if (partes[0]) {
            // Aceita números com hífen como 34-C
            const primeiraParteMatch = partes[0].match(/^(.+?)\s*[,\s]*(?:N[°ºo]?\s*)?(\d+[\w-]*)?$/i);
            if (primeiraParteMatch) {
              logradouro = primeiraParteMatch[1]?.trim() || partes[0];
              if (primeiraParteMatch[2]) numero = primeiraParteMatch[2];
            } else {
              logradouro = partes[0];
            }
          }
          
          // Procurar número em outras partes se não encontrou
          if (!numero) {
            for (const parte of partes) {
              // Aceita formatos como: "Nº 34-C", "N° 123", "34A", "100-B", etc.
              const matchNumero = parte.match(/^(?:N[°ºo]?\s*)?(\d+[\w-]*)$/i);
              if (matchNumero) {
                numero = matchNumero[1];
                break;
              }
            }
          }
          
          // Procurar UF (2 letras maiúsculas) - geralmente está junto com cidade
          for (let i = partes.length - 1; i >= 0; i--) {
            const matchUF = partes[i].match(/[-\/\s]([A-Z]{2})(?:\s*[-,]?\s*(\d{5}-?\d{3}))?$/i);
            if (matchUF) {
              uf = matchUF[1].toUpperCase();
              if (matchUF[2]) cep = matchUF[2];
              // Cidade é o que vem antes do UF
              const cidadeMatch = partes[i].match(/^(.+?)\s*[-\/]\s*[A-Z]{2}/i);
              if (cidadeMatch) municipio = cidadeMatch[1].trim();
              break;
            }
          }
          
          // Procurar CEP se não encontrou
          if (!cep) {
            for (const parte of partes) {
              const matchCEP = parte.match(/(\d{5}-?\d{3})/);
              if (matchCEP) {
                cep = matchCEP[1];
                break;
              }
            }
          }
          
          // Bairro geralmente é a penúltima parte antes de cidade-UF
          if (partes.length >= 3) {
            // Identificar qual parte é o bairro (não é logradouro, número, cidade-UF nem CEP)
            for (let i = 1; i < partes.length - 1; i++) {
              const parte = partes[i].trim();
              // Pular se for número (aceita formatos como 34-C, 100A, etc.)
              if (/^(?:N[°ºo]?\s*)?\d+[\w-]*$/i.test(parte)) continue;
              // Pular se contiver UF
              if (/[-\/]\s*[A-Z]{2}/i.test(parte)) continue;
              // Pular se for CEP
              if (/\d{5}-?\d{3}/.test(parte)) continue;
              
              if (!bairro) {
                bairro = parte;
              } else if (!municipio) {
                municipio = parte;
              }
            }
          }
          
          // Identificar UF pelo CEP se não encontrou
          if (!uf && cep) {
            uf = identificarUfPorCep(cep);
          }
          
          setDadosEmpresa(prev => ({
            ...prev,
            logradouro: logradouro || prev.logradouro,
            numero: numero || prev.numero,
            bairro: bairro || prev.bairro,
            municipio: municipio || prev.municipio,
            uf: uf || prev.uf,
            cep: cep || prev.cep,
          }));
        }
        
        toast.success("Dados do fornecedor preenchidos automaticamente!");
      } else {
        setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
      }
    } catch (error) {
      console.error('Erro ao verificar CNPJ:', error);
      setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
    }
  };

  useEffect(() => {
    if (selecaoId) {
      checkAuth();
    }
  }, [selecaoId]);

  const checkAuth = async () => {
    try {
      // FORÇAR MODO PÚBLICO se parâmetro ?modo=publico na URL
      const modoPublico = searchParams.get("modo") === "publico";
      
      if (modoPublico) {
        console.log("🔓 MODO PÚBLICO FORÇADO VIA URL - Ignorando autenticação");
        setFornecedor(null);
        setIsPublicAccess(true);
        await loadSelecao(null);
        return;
      }
      
      // Permite acesso público - não exige autenticação
      const { data: { session } } = await supabase.auth.getSession();
      
      console.log("🔐 Session:", session ? "Autenticado" : "Público (não autenticado)");
      
      if (session) {
        const { data: fornecedorData } = await supabase
          .from("fornecedores")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (fornecedorData) {
          console.log("✅ Fornecedor encontrado:", fornecedorData.razao_social);
          setFornecedor(fornecedorData);
          setDadosEmpresa({
            razao_social: fornecedorData.razao_social || "",
            cnpj: formatarCNPJ(fornecedorData.cnpj) || "",
            email: fornecedorData.email || "",
            telefone: formatarTelefone(fornecedorData.telefone) || "",
            logradouro: "",
            numero: "",
            bairro: "",
            municipio: "",
            uf: "",
            cep: "",
          });
          await loadSelecao(fornecedorData.id);
          return;
        }
      }
      
      // Acesso público sem autenticação - IMPORTANTE: fornecedor permanece null
      console.log("🌐 MODO PÚBLICO ATIVADO - FORMULÁRIO DEVE APARECER");
      setFornecedor(null); // Garante que fornecedor seja null para acesso público
      setIsPublicAccess(true); // Flag explícita para público
      await loadSelecao(null);
    } catch (error) {
      console.error("❌ Erro em checkAuth:", error);
      // Mesmo com erro, permite acesso público
      setFornecedor(null);
      setIsPublicAccess(true);
      await loadSelecao(null);
    }
  };

  const loadSelecao = async (fornecedorId: string | null) => {
    try {
      console.log("🔍 Iniciando carregamento da seleção:", selecaoId);
      
      // Carregar seleção
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*, contratos_gestao:contrato_gestao_id(nome_contrato))")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      console.log("✅ Seleção carregada:", selecaoData);
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);
      setCriterioJulgamento(selecaoData.processos_compras?.criterio_julgamento || "");

      // Se fornecedor autenticado, verificar se já enviou proposta
      if (fornecedorId) {
        const { data: propostaExistente } = await supabase
          .from("selecao_propostas_fornecedor")
          .select("*")
          .eq("selecao_id", selecaoId)
          .eq("fornecedor_id", fornecedorId)
          .maybeSingle();
        
        setJaEnviouProposta(!!propostaExistente);
        console.log("📋 Já enviou proposta:", !!propostaExistente);
      }

      // Carregar lotes se for por lote
      if (selecaoData.processos_compras?.criterio_julgamento === 'por_lote' && selecaoData.cotacao_relacionada_id) {
        const { data: lotesData } = await supabase
          .from("lotes_cotacao")
          .select("*")
          .eq("cotacao_id", selecaoData.cotacao_relacionada_id)
          .order("numero_lote", { ascending: true });
        setLotes(lotesData || []);
      }

      // Carregar itens
      if (selecaoData.cotacao_relacionada_id) {
        await loadItensFromPlanilha(
          selecaoData.cotacao_relacionada_id,
          selecaoData.created_at,
          selecaoData.processos_compras?.criterio_julgamento || ""
        );
      }

      // IMPORTANTE: Carregar documentos SEMPRE
      console.log("📄 Iniciando carregamento de documentos...");
      await loadDocumentosAnexados();
      console.log("✅ Carregamento de documentos concluído");

    } catch (error) {
      console.error("❌ Erro ao carregar seleção:", error);
      toast.error("Erro ao carregar detalhes da seleção");
    } finally {
      setLoading(false);
    }
  };

  const loadItensFromPlanilha = async (cotacaoId: string, dataCriacaoSelecao: string, criterioProcesso: string) => {
    try {
      const planilhaQueryBase = supabase
        .from("planilhas_consolidadas")
        .select("fornecedores_incluidos, data_geracao, estimativas_itens")
        .eq("cotacao_id", cotacaoId);

      // IMPORTANTE:
      // - Para critério por_lote, usar SEMPRE a planilha consolidada mais recente (mesmo que gerada após a criação da seleção)
      //   pois é ela que contém as chaves compostas (numero_lote_numero_item) e os valores corretos.
      // - Para demais critérios, mantém o comportamento anterior (até a data de criação da seleção).
      const planilhaQuery =
        criterioProcesso === "por_lote"
          ? planilhaQueryBase
          : planilhaQueryBase.lte("data_geracao", dataCriacaoSelecao);

      const [planilhaResult, itensOriginaisResult] = await Promise.all([
        planilhaQuery.order("data_geracao", { ascending: false }).limit(1).maybeSingle(),
        supabase
          .from("itens_cotacao")
          .select("*")
          .eq("cotacao_id", cotacaoId)
          .order("numero_item", { ascending: true }),
      ]);

      const { data: planilha } = planilhaResult;
      const { data: itensOriginais } = itensOriginaisResult;

      if (!itensOriginais || itensOriginais.length === 0) {
        console.log("⚠️ Nenhum item encontrado");
        return;
      }

      // Se não há planilha, usa valores estimados diretos dos itens
      if (!planilha) {
        console.log("⚠️ Sem planilha - carregando valores estimados dos itens");
        const todosItens: Item[] = itensOriginais.map((itemOriginal) => ({
          id: itemOriginal.id,
          numero_item: itemOriginal.numero_item,
          descricao: itemOriginal.descricao,
          quantidade: itemOriginal.quantidade,
          unidade: itemOriginal.unidade,
          marca: itemOriginal.marca || "",
          valor_unitario_estimado: itemOriginal.valor_unitario_estimado || 0,
          valor_total: (itemOriginal.valor_unitario_estimado || 0) * itemOriginal.quantidade,
          lote_id: itemOriginal.lote_id,
        }));
        setItens(todosItens);
        
        const respostasIniciais: RespostaItem = {};
        todosItens.forEach((item) => {
          respostasIniciais[item.id] = {
            valor_unitario_ofertado: 0,
            valor_display: "0,00",
            marca_ofertada: "",
          };
        });
        setRespostas(respostasIniciais);
        return;
      }

      // Usar critério vindo do processo carregado na seleção (evita race de setState)
      const criterioAtual = criterioProcesso || "";
      const isDesconto = criterioAtual === "desconto";

      // USAR estimativas_itens da planilha consolidada - reflete critério escolhido (média, mediana, menor)
      const estimativasItens = (planilha.estimativas_itens || {}) as Record<string, number>;
      console.log("📊 Usando estimativas da planilha consolidada:", estimativasItens);
      console.log("📊 Critério de julgamento atual:", criterioAtual);

      const todosItens: Item[] = [];

      // Carregar lotes se critério por_lote para obter numero_lote
      let lotesMap: Map<string, number> = new Map();
      if (criterioAtual === 'por_lote') {
        const { data: lotesData } = await supabase
          .from("lotes_cotacao")
          .select("id, numero_lote")
          .eq("cotacao_id", cotacaoId);
        
        if (lotesData) {
          lotesData.forEach(lote => {
            lotesMap.set(lote.id, lote.numero_lote);
          });
          console.log("📊 Lotes carregados:", Object.fromEntries(lotesMap));
        }
      }

      itensOriginais.forEach((itemOriginal) => {
        // Buscar valor estimado das estimativas salvas na planilha
        // Para critério por_lote: usar chave composta "numero_lote_numero_item"
        // Para outros critérios: usar chave simples "numero_item"
        let chaveEstimativa: string;
        
        if (criterioAtual === 'por_lote' && itemOriginal.lote_id) {
          const numeroLote = lotesMap.get(itemOriginal.lote_id);
          if (numeroLote) {
            chaveEstimativa = `${numeroLote}_${itemOriginal.numero_item}`;
          } else {
            chaveEstimativa = String(itemOriginal.numero_item);
          }
        } else {
          chaveEstimativa = String(itemOriginal.numero_item);
        }
        
        console.log(`📊 Item ${itemOriginal.numero_item} - chave: ${chaveEstimativa} - valor: ${estimativasItens[chaveEstimativa] || 0}`);
        
        const valorEstimado = estimativasItens[chaveEstimativa] || 0;
        const valorTotalItem = isDesconto ? 0 : (valorEstimado * itemOriginal.quantidade);
        
        todosItens.push({
          id: itemOriginal.id,
          numero_item: itemOriginal.numero_item,
          descricao: itemOriginal.descricao,
          quantidade: itemOriginal.quantidade,
          unidade: itemOriginal.unidade,
          marca: itemOriginal.marca,
          valor_unitario_estimado: valorEstimado,
          valor_total: valorTotalItem,
          lote_id: itemOriginal.lote_id
        });
      });

      setItens(todosItens);
      
      // Inicializar respostas
      const respostasIniciais: RespostaItem = {};
      todosItens.forEach((item) => {
        respostasIniciais[item.id] = {
          valor_unitario_ofertado: 0,
          valor_display: "0,00",
          marca_ofertada: "",
        };
      });
      setRespostas(respostasIniciais);
    } catch (error) {
      console.error("Erro ao carregar itens:", error);
    }
  };

  const loadDocumentosAnexados = async () => {
    try {
      console.log("🔍 Carregando documentos da seleção:", selecaoId);
      
      const { data, error } = await supabase
        .from("anexos_selecao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .order("data_upload", { ascending: true });

      console.log("📄 Documentos retornados:", { data, error });

      if (error) {
        console.error("❌ Erro ao carregar documentos:", error);
        return;
      }

      if (data && data.length > 0) {
        console.log(`✅ ${data.length} documentos carregados com sucesso`);
        setDocumentosAnexados(data);
      } else {
        console.log("⚠️ Nenhum documento encontrado");
        setDocumentosAnexados([]);
      }
    } catch (error) {
      console.error("💥 Exceção ao carregar documentos:", error);
    }
  };

  const formatarMoeda = useCallback((valor: string): string => {
    // Remove tudo exceto números
    const numeros = valor.replace(/\D/g, '');
    if (!numeros || numeros === '0') return '0,00';
    
    // Converte para número e divide por 100 para ter centavos
    const valorNumerico = parseFloat(numeros) / 100;
    
    // Formata com duas casas decimais
    const valorString = valorNumerico.toFixed(2);
    
    // Separa parte inteira e decimal
    const [inteiros, decimais] = valorString.split('.');
    
    // Adiciona separador de milhar na parte inteira
    const inteirosFormatados = inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    // Retorna com vírgula como separador decimal
    return `${inteirosFormatados},${decimais}`;
  }, []);

  const handleValorBlur = useCallback((itemId: string, value: string) => {
    // Para critério desconto, processar como percentual
    if (criterioJulgamento === "desconto") {
      // Remove apenas % e espaços, mantém números, vírgula e ponto
      const valorLimpo = value.replace(/[%\s]/g, '').trim();
      
      if (!valorLimpo || valorLimpo === '0' || valorLimpo === '') {
        setRespostas(prev => ({
          ...prev,
          [itemId]: { 
            ...prev[itemId], 
            valor_unitario_ofertado: 0, 
            valor_display: '0,00' 
          }
        }));
        return;
      }
      
      // Substituir vírgula por ponto para parseFloat
      const valorComPonto = valorLimpo.replace(',', '.');
      const valorNumerico = parseFloat(valorComPonto);
      
      if (isNaN(valorNumerico)) {
        setRespostas(prev => ({
          ...prev,
          [itemId]: { 
            ...prev[itemId], 
            valor_unitario_ofertado: 0, 
            valor_display: '0,00' 
          }
        }));
        return;
      }
      
      // O valor já está em percentual (0.35 representa 0,35%)
      // NÃO dividir por 100 - armazenar como está
      
      // Formatar para exibição com 2 casas decimais
      const valorFormatado = valorNumerico.toFixed(2).replace('.', ',');
      
      setRespostas(prev => ({
        ...prev,
        [itemId]: { 
          ...prev[itemId], 
          valor_unitario_ofertado: valorNumerico, // Armazenar o valor direto, não dividido
          valor_display: valorFormatado 
        }
      }));
      return;
    }
    
    // Para critério de valor monetário
    

    // Remove R$, espaços e pontos de milhar, mantém vírgula decimal
    let valorLimpo = value.replace(/R\$\s?/g, '').replace(/\s/g, '');
    
    // Se tem vírgula, usar como separador decimal
    if (valorLimpo.includes(',')) {
      // Remove pontos de milhar e substitui vírgula por ponto para parseFloat
      valorLimpo = valorLimpo.replace(/\./g, '').replace(',', '.');
    } else if (valorLimpo.includes('.')) {
      // Se só tem ponto, verificar se é milhar ou decimal
      const partes = valorLimpo.split('.');
      if (partes.length === 2 && partes[1].length <= 2) {
        // É separador decimal (ex: 69.00)
        // Já está no formato correto
      } else {
        // São pontos de milhar (ex: 6.900)
        valorLimpo = valorLimpo.replace(/\./g, '');
      }
    }
    
    const valorNumerico = parseFloat(valorLimpo);
    
    if (!valorNumerico || isNaN(valorNumerico) || valorNumerico === 0) {
      setRespostas(prev => ({
        ...prev,
        [itemId]: { 
          ...prev[itemId], 
          valor_unitario_ofertado: 0, 
          valor_display: '0,00' 
        }
      }));
      return;
    }
    
    // Formatar para exibição
    const valorFormatado = valorNumerico.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    setRespostas(prev => ({
      ...prev,
      [itemId]: { 
        ...prev[itemId], 
        valor_unitario_ofertado: valorNumerico, 
        valor_display: valorFormatado 
      }
    }));
  }, [criterioJulgamento]);

  const handleMarcaBlur = useCallback((itemId: string, marca: string) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { 
        ...prev[itemId], 
        marca_ofertada: marca 
      }
    }));
  }, []);

  const handleImportSuccess = (dadosImportados: Array<{
    numero_item: number;
    marca: string;
    valor_unitario: number;
    lote_id?: string | null;
  }>) => {
    // Atualizar respostas com dados importados
    const novasRespostas = { ...respostas };

    dadosImportados.forEach((dado) => {
      const item =
        criterioJulgamento === "por_lote" && dado.lote_id
          ? itens.find((i) => i.numero_item === dado.numero_item && i.lote_id === dado.lote_id)
          : itens.find((i) => i.numero_item === dado.numero_item);

      if (item) {
        // Para critério desconto, valor_unitario já está em percentual (0.35 = 0,35%)
        // Para outros critérios, representa valor monetário (500.00 = R$ 500,00)
        const valorFormatado =
          criterioJulgamento === "desconto"
            ? dado.valor_unitario.toFixed(2).replace(".", ",")
            : `R$ ${dado.valor_unitario.toFixed(2).replace(".", ",")}`;

        novasRespostas[item.id] = {
          valor_unitario_ofertado: dado.valor_unitario,
          valor_display: valorFormatado,
          marca_ofertada: dado.marca,
        };
      }
    });

    setRespostas(novasRespostas);

    // Forçar atualização dos inputs após o estado ser atualizado
    setTimeout(() => {
      dadosImportados.forEach((dado) => {
        const item =
          criterioJulgamento === "por_lote" && dado.lote_id
            ? itens.find((i) => i.numero_item === dado.numero_item && i.lote_id === dado.lote_id)
            : itens.find((i) => i.numero_item === dado.numero_item);

        if (item) {
          // Buscar inputs por ID único
          const inputValor = document.getElementById(`input-valor-${item.id}`) as HTMLInputElement;
          if (inputValor) {
            const valorFormatado =
              criterioJulgamento === "desconto"
                ? `${dado.valor_unitario.toFixed(2).replace(".", ",")}`
                : `R$ ${dado.valor_unitario.toFixed(2).replace(".", ",")}`;
            inputValor.value = valorFormatado;
          }

          const inputMarca = document.getElementById(`input-marca-${item.id}`) as HTMLInputElement;
          if (inputMarca) {
            inputMarca.value = dado.marca;
          }
        }
      });
    }, 100);

    toast.success("Dados importados com sucesso!");
  };

  const calcularValorTotal = () => {
    return itens.reduce((total, item) => {
      const resposta = respostas[item.id];
      const valorUnitario = resposta?.valor_unitario_ofertado || 0;
      return total + (valorUnitario * item.quantidade);
    }, 0);
  };

  const gerarCodigoAcesso = () => {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    for (let i = 0; i < 8; i++) {
      codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return codigo;
  };

  const handleSubmit = async () => {
    if (!fornecedor && !dadosEmpresa.cnpj) {
      toast.error("É necessário informar o CNPJ da empresa");
      return;
    }

    setSubmitting(true);
    try {
      // Validar prazo - encerrar exatamente no horário da sessão (Brasília)
      const dataPart = String(selecao.data_sessao_disputa).split("T")[0];
      const horaRaw = String(selecao.hora_sessao_disputa).trim();
      const horaPart =
        horaRaw.length === 5 ? `${horaRaw}:00` : horaRaw.length >= 8 ? horaRaw.slice(0, 8) : horaRaw;

      const dataHoraSessao = new Date(`${dataPart}T${horaPart}-03:00`);
      const agora = new Date();

      if (!Number.isNaN(dataHoraSessao.getTime()) && agora >= dataHoraSessao) {
        toast.error("O prazo para envio de propostas encerrou-se no início da sessão");
        setSubmitting(false);
        return;
      }

      // Validar dados da empresa se não autenticado
      if (!fornecedor) {
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
      }

      // Validar valores baseado no critério de julgamento
      const criterioJulgamento = processo?.criterio_julgamento;
      
      console.log("🎯 Critério de julgamento:", criterioJulgamento);
      
      const itensPreenchidos = itens.filter(item => {
        const resposta = respostas[item.id];
        return resposta?.valor_unitario_ofertado && resposta.valor_unitario_ofertado > 0;
      });

      console.log(`📊 Itens preenchidos: ${itensPreenchidos.length} de ${itens.length}`);

      // Se critério for "por item" ou "desconto", exigir apenas que PELO MENOS UM item seja preenchido
      if (criterioJulgamento === "Menor Preço por Item" || criterioJulgamento === "por_item" || 
          criterioJulgamento === "Maior Percentual de Desconto" || criterioJulgamento === "desconto") {
        if (itensPreenchidos.length === 0) {
          toast.error("Por favor, preencha ao menos um item para participar");
          setSubmitting(false);
          return;
        }
        console.log("✅ Validação por item/desconto OK - permite preenchimento parcial");
      } else if (criterioJulgamento === "Menor Preço por Lote" || criterioJulgamento === "por_lote") {
        // Para critério por lote, validar que todos os itens de cada lote preenchido estejam completos
        const lotesComItens = new Map<string, { total: number; preenchidos: number }>();
        
        itens.forEach(item => {
          const loteId = item.lote_id || 'sem_lote';
          if (!lotesComItens.has(loteId)) {
            lotesComItens.set(loteId, { total: 0, preenchidos: 0 });
          }
          const loteStats = lotesComItens.get(loteId)!;
          loteStats.total++;
          
          const resposta = respostas[item.id];
          if (resposta?.valor_unitario_ofertado && resposta.valor_unitario_ofertado > 0) {
            loteStats.preenchidos++;
          }
        });
        
        // Se começou a preencher um lote, deve preencher todos os itens desse lote
        for (const [loteId, stats] of lotesComItens.entries()) {
          if (stats.preenchidos > 0 && stats.preenchidos < stats.total) {
            toast.error("Ao preencher um lote, você deve cotar todos os itens desse lote");
            setSubmitting(false);
            return;
          }
        }
        
        if (itensPreenchidos.length === 0) {
          toast.error("Por favor, preencha ao menos um lote completo para participar");
          setSubmitting(false);
          return;
        }
        console.log("✅ Validação por lote OK");
      } else {
        // Para critério global, exigir todos os itens
        const itensIncompletos = itens.filter(item => {
          const resposta = respostas[item.id];
          return !resposta?.valor_unitario_ofertado || resposta.valor_unitario_ofertado <= 0;
        });

        if (itensIncompletos.length > 0) {
          toast.error("Para critério global, você deve preencher todos os itens");
          setSubmitting(false);
          return;
        }
        console.log("✅ Validação global OK - todos os itens preenchidos");
      }

      // VALIDAÇÃO OBRIGATÓRIA DE MARCA E VALOR: devem ser preenchidos juntos
      const itensSemMarca = itens.filter(item => {
        const resposta = respostas[item.id];
        const temValor = resposta?.valor_unitario_ofertado && resposta.valor_unitario_ofertado > 0;
        const temMarca = resposta?.marca_ofertada && resposta.marca_ofertada.trim() !== '';
        return temValor && !temMarca;
      });

      if (itensSemMarca.length > 0) {
        const numerosItens = itensSemMarca.map(item => item.numero_item).join(', ');
        toast.error(`Preencha a marca para os itens com valor/desconto ofertado: ${numerosItens}`);
        setSubmitting(false);
        return;
      }

      // VALIDAÇÃO REVERSA: se preencher marca, deve preencher valor/desconto
      const itensSemValor = itens.filter(item => {
        const resposta = respostas[item.id];
        const temValor = resposta?.valor_unitario_ofertado && resposta.valor_unitario_ofertado > 0;
        const temMarca = resposta?.marca_ofertada && resposta.marca_ofertada.trim() !== '';
        return temMarca && !temValor;
      });

      if (itensSemValor.length > 0) {
        const numerosItens = itensSemValor.map(item => item.numero_item).join(', ');
        toast.error(`Preencha o valor/desconto para os itens com marca informada: ${numerosItens}`);
        setSubmitting(false);
        return;
      }

      const valorTotal = calcularValorTotal();
      const enderecoCompleto = fornecedor?.endereco_comercial || 
        `${dadosEmpresa.logradouro}, Nº ${dadosEmpresa.numero}, ${dadosEmpresa.bairro}, ${dadosEmpresa.municipio}/${dadosEmpresa.uf}, CEP: ${dadosEmpresa.cep}`;
      
      const cnpjLimpo = (fornecedor?.cnpj || dadosEmpresa.cnpj).replace(/[^\d]/g, "");
      
      let fornecedorId: string;
      
      if (fornecedor) {
        fornecedorId = fornecedor.id;
      } else {
        // Buscar ou criar fornecedor
        const { data: fornecedorBuscado } = await supabase
          .from("fornecedores")
          .select("id")
          .eq("cnpj", cnpjLimpo)
          .limit(1)
          .maybeSingle();

        if (fornecedorBuscado) {
          fornecedorId = fornecedorBuscado.id;
        } else {
          const { data: fornecedorCriado, error: erroCreate } = await supabase
            .from("fornecedores")
            .insert({
              razao_social: dadosEmpresa.razao_social,
              cnpj: cnpjLimpo,
              email: dadosEmpresa.email,
              telefone: dadosEmpresa.telefone.replace(/[^\d]/g, ""),
              endereco_comercial: enderecoCompleto,
              status_aprovacao: "pendente",
              ativo: false,
            })
            .select("id")
            .single();

          if (erroCreate) throw erroCreate;
          fornecedorId = fornecedorCriado.id;
        }
      }

      // Verificar se fornecedor já tem proposta para esta seleção
      const { data: propostaExistente } = await supabase
        .from("selecao_propostas_fornecedor")
        .select("id, codigo_acesso")
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorId)
        .maybeSingle();

      let propostaId: string;
      let codigoAcesso: string;

      if (propostaExistente) {
        // ATUALIZAR proposta existente
        console.log("📝 Atualizando proposta existente:", propostaExistente.id);
        
        const { error: erroProposta } = await supabase
          .from("selecao_propostas_fornecedor")
          .update({
            observacoes_fornecedor: observacoes || null,
            valor_total_proposta: valorTotal,
            data_envio_proposta: new Date().toISOString(),
            email: fornecedor?.email || dadosEmpresa.email,
          })
          .eq("id", propostaExistente.id);

        if (erroProposta) throw erroProposta;

        // Deletar itens antigos da proposta
        const { error: erroDeleteItens } = await supabase
          .from("selecao_respostas_itens_fornecedor")
          .delete()
          .eq("proposta_id", propostaExistente.id);

        if (erroDeleteItens) throw erroDeleteItens;

        propostaId = propostaExistente.id;
        codigoAcesso = propostaExistente.codigo_acesso;
        
        console.log("✅ Proposta atualizada com sucesso");
      } else {
        // CRIAR nova proposta
        console.log("📝 Criando nova proposta");
        
        codigoAcesso = gerarCodigoAcesso();
        console.log("Código de acesso gerado:", codigoAcesso);

        const { data: propostaCriada, error: erroProposta } = await supabase
          .from("selecao_propostas_fornecedor")
          .insert({
            selecao_id: selecaoId,
            fornecedor_id: fornecedorId,
            observacoes_fornecedor: observacoes || null,
            valor_total_proposta: valorTotal,
            data_envio_proposta: new Date().toISOString(),
            codigo_acesso: codigoAcesso,
            email: fornecedor?.email || dadosEmpresa.email,
          })
          .select("id")
          .single();

        if (erroProposta) throw erroProposta;
        propostaId = propostaCriada.id;
        
        console.log("✅ Nova proposta criada com sucesso");
      }

      // Criar respostas dos itens (sempre novos, seja atualização ou criação)
      const itensParaInserir = itens.map(item => ({
        proposta_id: propostaId,
        numero_item: item.numero_item,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        lote_id: item.lote_id || null,
        marca: respostas[item.id]?.marca_ofertada || null,
        valor_unitario_ofertado: respostas[item.id]?.valor_unitario_ofertado || 0,
        valor_total_item: (respostas[item.id]?.valor_unitario_ofertado || 0) * item.quantidade,
      }));

      const { error: erroItens } = await supabase
        .from("selecao_respostas_itens_fornecedor")
        .insert(itensParaInserir);

      if (erroItens) throw erroItens;

      // Variável para capturar o protocolo gerado
      let protocoloGerado: string | null = null;

      // Gerar e salvar PDF da proposta
      try {
        const { gerarPropostaSelecaoPDF } = await import('@/lib/gerarPropostaSelecaoPDF');
        
        const enderecoCompleto = fornecedor?.endereco_comercial || 
          `${dadosEmpresa.logradouro}, Nº ${dadosEmpresa.numero}, ${dadosEmpresa.bairro}, ${dadosEmpresa.municipio}/${dadosEmpresa.uf}, CEP: ${dadosEmpresa.cep}`;
        
        const pdfResult = await gerarPropostaSelecaoPDF(
          propostaId,
          {
            razao_social: fornecedor?.razao_social || dadosEmpresa.razao_social,
            cnpj: fornecedor?.cnpj || dadosEmpresa.cnpj,
            email: fornecedor?.email || dadosEmpresa.email,
            logradouro: enderecoCompleto.split(',')[0]?.trim() || '',
            numero: enderecoCompleto.split('Nº ')[1]?.split(',')[0]?.trim() || '',
            bairro: enderecoCompleto.split(',')[2]?.trim() || '',
            municipio: enderecoCompleto.split(',')[3]?.split('/')[0]?.trim() || '',
            uf: enderecoCompleto.split('/')[1]?.split(',')[0]?.trim() || '',
            cep: enderecoCompleto.split('CEP: ')[1]?.trim() || ''
          },
          valorTotal,
          observacoes || null,
          selecao.titulo_selecao,
          new Date().toISOString(),
          undefined,
          criterioJulgamento,
          arquivosComprovantes
        );

        // Capturar o protocolo gerado
        protocoloGerado = pdfResult.protocolo || null;

        // Atualizar proposta com URL do PDF
        await supabase
          .from('selecao_propostas_fornecedor')
          .update({ url_pdf_proposta: pdfResult.url })
          .eq('id', propostaId);

        console.log('PDF da proposta gerado e salvo:', pdfResult.url, 'Protocolo:', protocoloGerado);
      } catch (pdfError) {
        console.error('Erro ao gerar PDF da proposta:', pdfError);
        // Não bloqueia o envio se houver erro no PDF
      }

      // Enviar e-mail com código de acesso
      const razaoSocialEmail = fornecedor?.razao_social || dadosEmpresa.razao_social;
      const emailDestino = fornecedor?.email || dadosEmpresa.email;

      try {
        const { error: emailError } = await supabase.functions.invoke('enviar-email-chave-acesso', {
          body: {
            email: emailDestino,
            razaoSocial: razaoSocialEmail,
            codigoAcesso: codigoAcesso,
            tituloSelecao: selecao.titulo_selecao,
          }
        });

        if (emailError) {
          console.error("Erro ao enviar e-mail:", emailError);
        }
      } catch (emailError) {
        console.error("Erro ao invocar função de e-mail:", emailError);
      }

      // Registrar auditoria da proposta de seleção via RPC (fornecedor externo)
      try {
        await supabase.rpc('registrar_auditoria_proposta_selecao_fornecedor', {
          p_entidade_id: propostaId,
          p_fornecedor_nome: fornecedor?.razao_social || dadosEmpresa.razao_social,
          p_fornecedor_cnpj: fornecedor?.cnpj || dadosEmpresa.cnpj.replace(/\D/g, ''),
          p_valor_total: valorTotal,
          p_contrato_gestao: processo?.processos_compras?.contratos_gestao?.nome_contrato || processo?.contratos_gestao?.nome_contrato || '',
          p_numero_processo: processo?.numero_processo_interno || '',
          p_titulo_selecao: selecao?.titulo_selecao || '',
          p_protocolo: protocoloGerado
        });
      } catch (auditError) {
        console.error('Erro ao registrar auditoria (não bloqueia envio):', auditError);
      }

      // Exibir mensagem de sucesso simples
      toast.success(
        propostaExistente 
          ? "Proposta atualizada com sucesso!" 
          : "Proposta registrada com sucesso!",
        { duration: 5000 }
      );
      
      setJaEnviouProposta(true);
      
    } catch (error: any) {
      console.error("Erro ao enviar proposta:", error);
      
      // Verificar se é erro de RLS (seleção encerrada)
      if (error?.code === 'PGRST301' || error?.message?.includes('policy') || error?.code === '42501') {
        toast.error("Esta seleção já foi encerrada. Não é possível enviar ou modificar propostas.");
      } else {
        toast.error("Erro ao enviar proposta. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
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

        {/* Documentos - SEMPRE exibir */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>📋 Documentos da Seleção</CardTitle>
            <CardDescription>Leia atentamente antes de participar da disputa</CardDescription>
          </CardHeader>
          <CardContent>
            {documentosAnexados.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documentosAnexados.map((doc) => (
                  <Button
                    key={doc.id}
                    variant="outline"
                    onClick={() => window.open(doc.url_arquivo, '_blank')}
                    className="h-auto py-4 px-4 justify-start"
                  >
                    <FileText className="h-5 w-5 mr-3 flex-shrink-0 text-primary" />
                    <div className="text-left overflow-hidden">
                      <p className="font-medium truncate text-sm">{doc.nome_arquivo}</p>
                      <p className="text-xs text-muted-foreground capitalize mt-1">
                        {doc.tipo_documento.replace('_', ' ')}
                      </p>
                    </div>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum documento anexado ainda</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Botão de Login - SEMPRE visível */}
        <Card className="mb-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                  <LogIn className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Já é fornecedor cadastrado?
                </h3>
                <div className="bg-yellow-100 border border-yellow-400 rounded-md p-3 mt-2">
                  <p className="text-sm text-gray-800">
                    Se você já enviou sua proposta, acesse o Portal do Fornecedor através do login para editar ou acompanhar o sistema de lances.
                  </p>
                  <p className="text-sm text-gray-800 mt-2">
                    <span className="font-medium">Ainda não enviou proposta?</span> Preencha o formulário abaixo para participar.
                  </p>
                  <p className="text-red-600 font-medium text-sm mt-2">
                    <span className="font-bold">Importante:</span> Caso ainda não possua cadastro, o mesmo deverá ser realizado obrigatoriamente após o envio da proposta para acompanhamento do processo e da seleção de fornecedores.
                  </p>
                </div>
              </div>
              <Button 
                onClick={() => navigate('/auth')}
                className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Fazer Login
              </Button>
            </div>
          </CardContent>
        </Card>


        {/* Registro de Proposta */}
        {prazoExpirado ? (
          <>
            {/* Mensagem de prazo encerrado */}
            <Card className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-950">
              <CardHeader>
                <CardTitle className="text-amber-700 dark:text-amber-400">⏰ Prazo Encerrado</CardTitle>
                <CardDescription className="text-amber-600 dark:text-amber-300">
                  O prazo para envio de novas propostas foi encerrado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-amber-700 dark:text-amber-300">
                  Não é mais possível enviar ou modificar propostas para esta seleção.
                  O prazo encerra exatamente no horário da sessão de disputa.
                </p>

                <div className="mt-4 p-3 bg-white dark:bg-card rounded border">
                  <p className="text-sm"><strong>Data da Sessão:</strong> {selecao?.data_sessao_disputa?.split('T')[0].split('-').reverse().join('/')}</p>
                  <p className="text-sm"><strong>Horário:</strong> {selecao?.hora_sessao_disputa}</p>
                </div>
              </CardContent>
            </Card>

            {/* Tabela de itens em modo somente leitura */}
            <Card className="mb-6 opacity-75">
              <CardHeader>
                <CardTitle>📝 Itens da Seleção (Somente Visualização)</CardTitle>
                <CardDescription>O prazo para envio de propostas encerrou</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Item</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[80px]">Qtd</TableHead>
                      <TableHead className="w-[80px]">Unid.</TableHead>
                      {processo?.tipo === "material" && <TableHead className="w-[120px]">Marca</TableHead>}
                      {criterioJulgamento === "desconto" ? (
                        <TableHead className="text-right w-[120px]">Desconto Est.</TableHead>
                      ) : (
                        <TableHead className="text-right w-[120px]">Vlr. Unit. Est.</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processo?.criterio_julgamento === 'por_lote' ? (
                      <>
                        {lotes.map(lote => {
                          const itensLote = itens.filter(i => i.lote_id === lote.id);
                          return (
                            <React.Fragment key={lote.id}>
                              <TableRow className="bg-primary/20">
                                <TableCell colSpan={processo?.tipo === "material" ? 6 : 5} className="font-bold text-primary">
                                  LOTE {lote.numero_lote} - {lote.descricao_lote}
                                </TableCell>
                              </TableRow>
                              {itensLote.map(item => (
                                <TableRow key={item.id}>
                                  <TableCell>{item.numero_item}</TableCell>
                                  <TableCell>{item.descricao}</TableCell>
                                  <TableCell className="text-center">{item.quantidade}</TableCell>
                                  <TableCell className="text-center">{item.unidade}</TableCell>
                                  {processo?.tipo === "material" && (
                                    <TableCell className="text-muted-foreground">-</TableCell>
                                  )}
                                  <TableCell className="text-right">
                                    {criterioJulgamento === "desconto" 
                                      ? (item.valor_unitario_estimado ? `${item.valor_unitario_estimado.toFixed(2)}%` : "-")
                                      : formatCurrency(item.valor_unitario_estimado)
                                    }
                                  </TableCell>
                                </TableRow>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </>
                    ) : (
                      itens.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{item.numero_item}</TableCell>
                          <TableCell>{item.descricao}</TableCell>
                          <TableCell className="text-center">{item.quantidade}</TableCell>
                          <TableCell className="text-center">{item.unidade}</TableCell>
                          {processo?.tipo === "material" && (
                            <TableCell className="text-muted-foreground">-</TableCell>
                          )}
                          <TableCell className="text-right">
                            {criterioJulgamento === "desconto" 
                              ? (item.valor_unitario_estimado ? `${item.valor_unitario_estimado.toFixed(2)}%` : "-")
                              : formatCurrency(item.valor_unitario_estimado)
                            }
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : !jaEnviouProposta ? (
          <>
            
            {/* Dados da Empresa - FORMULÁRIO FORÇADO PARA PÚBLICO */}
            {(isPublicAccess || !fornecedor) && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Dados da Empresa</CardTitle>
                  <CardDescription>Preencha os dados da sua empresa para participar</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>CNPJ *</Label>
                      <Input
                        value={dadosEmpresa.cnpj}
                        onChange={(e) => {
                          setDadosEmpresa(prev => ({ ...prev, cnpj: formatarCNPJ(e.target.value) }));
                          setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
                        }}
                        onBlur={(e) => verificarCnpjExistente(e.target.value)}
                        maxLength={18}
                        className={errors.cnpj ? "border-red-500" : cnpjStatus.temCadastro ? "border-green-500" : cnpjStatus.existe ? "border-amber-500" : ""}
                      />
                      {errors.cnpj && <p className="text-sm text-red-500 mt-1">{errors.cnpj}</p>}
                      {cnpjStatus.verificando && (
                        <p className="text-sm text-muted-foreground mt-1">Verificando CNPJ...</p>
                      )}
                      {cnpjStatus.temCadastro && (
                        <p className="text-sm text-green-600 mt-1">
                          ✓ CNPJ já cadastrado no sistema. Sua proposta será vinculada automaticamente à sua conta.
                        </p>
                      )}
                      {cnpjStatus.existe && !cnpjStatus.temCadastro && (
                        <p className="text-sm text-amber-600 mt-1">
                          ℹ️ Este CNPJ já enviou propostas anteriormente. Os dados serão vinculados.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Razão Social *</Label>
                      <Input
                        value={dadosEmpresa.razao_social}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, razao_social: e.target.value }))}
                        className={errors.razao_social ? "border-red-500" : ""}
                      />
                      {errors.razao_social && <p className="text-sm text-red-500 mt-1">{errors.razao_social}</p>}
                    </div>

                    <div>
                      <Label>E-mail *</Label>
                      <Input
                        type="email"
                        value={dadosEmpresa.email}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, email: e.target.value }))}
                        className={errors.email ? "border-red-500" : ""}
                      />
                      {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <Label>Telefone *</Label>
                      <Input
                        type="tel"
                        value={dadosEmpresa.telefone}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, telefone: formatarTelefone(e.target.value) }))}
                        maxLength={15}
                        placeholder="(XX) XXXXX-XXXX"
                        className={errors.telefone ? "border-red-500" : ""}
                      />
                      {errors.telefone && <p className="text-sm text-red-500 mt-1">{errors.telefone}</p>}
                    </div>

                    <div>
                      <Label>CEP *</Label>
                      <Input
                        value={dadosEmpresa.cep}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, cep: e.target.value }))}
                        className={errors.cep ? "border-red-500" : ""}
                      />
                      {errors.cep && <p className="text-sm text-red-500 mt-1">{errors.cep}</p>}
                    </div>

                    <div>
                      <Label>Logradouro *</Label>
                      <Input
                        value={dadosEmpresa.logradouro}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, logradouro: e.target.value }))}
                        className={errors.logradouro ? "border-red-500" : ""}
                      />
                      {errors.logradouro && <p className="text-sm text-red-500 mt-1">{errors.logradouro}</p>}
                    </div>

                    <div>
                      <Label>Número *</Label>
                      <Input
                        value={dadosEmpresa.numero}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, numero: e.target.value }))}
                        className={errors.numero ? "border-red-500" : ""}
                      />
                      {errors.numero && <p className="text-sm text-red-500 mt-1">{errors.numero}</p>}
                    </div>

                    <div>
                      <Label>Bairro *</Label>
                      <Input
                        value={dadosEmpresa.bairro}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, bairro: e.target.value }))}
                        className={errors.bairro ? "border-red-500" : ""}
                      />
                      {errors.bairro && <p className="text-sm text-red-500 mt-1">{errors.bairro}</p>}
                    </div>

                    <div>
                      <Label>Município *</Label>
                      <Input
                        value={dadosEmpresa.municipio}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, municipio: e.target.value }))}
                        className={errors.municipio ? "border-red-500" : ""}
                      />
                      {errors.municipio && <p className="text-sm text-red-500 mt-1">{errors.municipio}</p>}
                    </div>

                    <div>
                      <Label>UF *</Label>
                      <Select value={dadosEmpresa.uf} onValueChange={(value) => setDadosEmpresa(prev => ({ ...prev, uf: value }))}>
                        <SelectTrigger className={errors.uf ? "border-red-500" : ""}>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {errors.uf && <p className="text-sm text-red-500 mt-1">{errors.uf}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Proposta de Valores */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>📝 Registrar Proposta</CardTitle>
                    <CardDescription>Informe seus valores para os itens da seleção</CardDescription>
                  </div>
                  <Button onClick={() => setImportDialogOpen(true)} variant="default" size="lg" className="w-full sm:w-auto">
                    <Upload className="h-5 w-5 mr-2" />
                    Importar via Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Item</TableHead>
                      <TableHead className="w-[30%]">Descrição</TableHead>
                      <TableHead className="w-[50px]">Qtd</TableHead>
                      <TableHead className="w-[60px]">Unid.</TableHead>
                      {processo?.tipo === "material" && <TableHead className="w-[100px]">Marca</TableHead>}
                      {criterioJulgamento === "desconto" ? (
                        <>
                          <TableHead className="text-right w-[120px]">Desconto Estimado</TableHead>
                          <TableHead className="text-right w-[150px]">Desconto Ofertado</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="text-right w-[100px]">Vlr. Unit. Est.</TableHead>
                          <TableHead className="text-right w-[150px]">Seu Valor Unit.</TableHead>
                          <TableHead className="text-right w-[100px]">Vlr. Total</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processo?.criterio_julgamento === 'por_lote' ? (
                      <>
                        {lotes.map(lote => {
                          const itensLote = itens.filter(i => i.lote_id === lote.id);
                          const subtotalLote = criterioJulgamento !== "desconto" 
                            ? itensLote.reduce((acc, item) => acc + ((respostas[item.id]?.valor_unitario_ofertado || 0) * item.quantidade), 0)
                            : 0;
                          return (
                            <React.Fragment key={lote.id}>
                              <TableRow className="bg-primary/20">
                                <TableCell colSpan={criterioJulgamento === "desconto" ? 6 : 8} className="font-bold text-primary">
                                  LOTE {lote.numero_lote} - {lote.descricao_lote}
                                </TableCell>
                              </TableRow>
                              {itensLote.map(item => (
                                <TableRow key={item.id}>
                                  <TableCell>{item.numero_item}</TableCell>
                                  <TableCell>{item.descricao}</TableCell>
                                  <TableCell className="text-center">{item.quantidade}</TableCell>
                                  <TableCell className="text-center">{item.unidade}</TableCell>
                                  {processo?.tipo === "material" && (
                                    <TableCell>
                                      <Input
                                        id={`input-marca-${item.id}`}
                                        key={`marca-lote-${item.id}`}
                                        placeholder="Marca"
                                        defaultValue={respostas[item.id]?.marca_ofertada || ""}
                                        onBlur={(e) => handleMarcaBlur(item.id, e.target.value)}
                                      />
                                    </TableCell>
                                   )}
                                   {criterioJulgamento === "desconto" ? (
                                      <>
                                        <TableCell className="text-right">
                                          {item.valor_unitario_estimado && item.valor_unitario_estimado > 0
                                            ? `${item.valor_unitario_estimado.toFixed(2)}%`
                                            : "-"}
                                        </TableCell>
                                         <TableCell>
                                          <div className="relative">
                                            <Input
                                              id={`input-valor-${item.id}`}
                                              key={`valor-lote-${item.id}`}
                                              type="text"
                                              inputMode="decimal"
                                              placeholder="0,00"
                                              value={respostas[item.id]?.valor_display || ""}
                                              onChange={(e) => {
                                                const valor = e.target.value;
                                                setRespostas(prev => ({
                                                  ...prev,
                                                  [item.id]: { ...prev[item.id], valor_display: valor }
                                                }));
                                              }}
                                              onBlur={(e) => handleValorBlur(item.id, e.target.value)}
                                              className="pr-8"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">%</span>
                                          </div>
                                        </TableCell>
                                     </>
                                   ) : (
                                     <>
                                       <TableCell className="text-right">{formatCurrency(item.valor_unitario_estimado)}</TableCell>
                                       <TableCell>
                                         <Input
                                           id={`input-valor-${item.id}`}
                                           key={`valor-lote-${item.id}`}
                                           type="text"
                                           inputMode="decimal"
                                           placeholder="R$ 0,00"
                                           defaultValue={respostas[item.id]?.valor_display || "R$ 0,00"}
                                           onBlur={(e) => handleValorBlur(item.id, e.target.value)}
                                         />
                                       </TableCell>
                                       <TableCell className="text-right">
                                         {formatCurrency((respostas[item.id]?.valor_unitario_ofertado || 0) * item.quantidade)}
                                       </TableCell>
                                     </>
                                   )}
                                </TableRow>
                              ))}
                              {/* Subtotal do Lote */}
                              {criterioJulgamento !== "desconto" && (
                                <TableRow className="bg-blue-50 dark:bg-blue-950">
                                  <TableCell colSpan={processo?.tipo === "material" ? 7 : 6} className="text-right font-semibold">
                                    Subtotal Lote {lote.numero_lote}:
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-primary">
                                    {formatCurrency(subtotalLote)}
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {/* Total Geral */}
                        {criterioJulgamento !== "desconto" && (
                          <TableRow className="bg-primary text-primary-foreground">
                            <TableCell colSpan={processo?.tipo === "material" ? 7 : 6} className="text-right font-bold">
                              VALOR TOTAL GERAL:
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {formatCurrency(calcularValorTotal())}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ) : (
                      <>
                        {itens.map(item => (
                          <TableRow key={item.id}>
                            <TableCell>{item.numero_item}</TableCell>
                            <TableCell>{item.descricao}</TableCell>
                            <TableCell className="text-center">{item.quantidade}</TableCell>
                            <TableCell className="text-center">{item.unidade}</TableCell>
                            {processo?.tipo === "material" && (
                              <TableCell>
                                <Input
                                  id={`input-marca-${item.id}`}
                                  key={`marca-${item.id}`}
                                  placeholder="Marca"
                                  defaultValue={respostas[item.id]?.marca_ofertada || ""}
                                  onBlur={(e) => handleMarcaBlur(item.id, e.target.value)}
                                />
                              </TableCell>
                             )}
                              {criterioJulgamento === "desconto" ? (
                                <>
                                  <TableCell className="text-right">
                                    {item.valor_unitario_estimado && item.valor_unitario_estimado > 0
                                      ? `${item.valor_unitario_estimado.toFixed(2)}%`
                                      : "-"}
                                  </TableCell>
                                   <TableCell>
                                    <div className="relative">
                                      <Input
                                        id={`input-valor-${item.id}`}
                                        key={`valor-item-${item.id}`}
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        value={respostas[item.id]?.valor_display || ""}
                                        onChange={(e) => {
                                          const valor = e.target.value;
                                          setRespostas(prev => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], valor_display: valor }
                                          }));
                                        }}
                                        onBlur={(e) => handleValorBlur(item.id, e.target.value)}
                                        className="pr-8"
                                      />
                                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">%</span>
                                    </div>
                                  </TableCell>
                               </>
                             ) : (
                               <>
                                 <TableCell className="text-right">{formatCurrency(item.valor_unitario_estimado)}</TableCell>
                                 <TableCell>
                                   <Input
                                     id={`input-valor-${item.id}`}
                                     key={`valor-item-${item.id}`}
                                     type="text"
                                     inputMode="decimal"
                                     placeholder="R$ 0,00"
                                     defaultValue={respostas[item.id]?.valor_display || "R$ 0,00"}
                                     onBlur={(e) => handleValorBlur(item.id, e.target.value)}
                                   />
                                 </TableCell>
                                 <TableCell className="text-right">
                                   {formatCurrency((respostas[item.id]?.valor_unitario_ofertado || 0) * item.quantidade)}
                                 </TableCell>
                               </>
                             )}
                          </TableRow>
                        ))}
                      </>
                     )}
                     {criterioJulgamento !== "desconto" && (
                       <TableRow className="bg-muted font-bold">
                         <TableCell colSpan={processo?.tipo === "material" ? 7 : 6} className="text-right">
                           VALOR TOTAL
                         </TableCell>
                         <TableCell className="text-right">{formatCurrency(calcularValorTotal())}</TableCell>
                       </TableRow>
                     )}
                  </TableBody>
                </Table>
                
                <div className="mt-6 space-y-4">
                  <div>
                    <Label>Observações</Label>
                    <Textarea
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder="Observações sobre a proposta (opcional)"
                      rows={4}
                    />
                  </div>

                  {/* Área de Upload de Anexos */}
                  <div className="space-y-2">
                    <Label>Anexos em PDF (Opcional)</Label>
                    <p className="text-xs text-muted-foreground">Apenas arquivos PDF serão mesclados à proposta certificada</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="file"
                        id="upload-anexos-selecao"
                        multiple
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          
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
                          
                          // Limpar input para permitir selecionar mesmo arquivo novamente
                          e.target.value = '';
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('upload-anexos-selecao')?.click()}
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

                  <Button onClick={handleSubmit} disabled={submitting} className="w-full" size="lg">
                    <Send className="h-4 w-4 mr-2" />
                    {submitting ? "Enviando..." : "Enviar Proposta"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-green-600">✓ Proposta Registrada com Sucesso!</CardTitle>
              <CardDescription>
                Sua proposta foi recebida e está vinculada ao CNPJ {fornecedor?.cnpj ? formatarCNPJ(fornecedor.cnpj) : dadosEmpresa.cnpj}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Mostrar botão de cadastro apenas se NÃO estiver autenticado como fornecedor */}
                {!fornecedor && (
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      Cadastre-se para acompanhar suas seleções!
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                      Ao se cadastrar no sistema com o mesmo CNPJ ({dadosEmpresa.cnpj}), você terá acesso ao menu "Seleção de Fornecedores" onde poderá visualizar todas as seleções que enviou proposta, acompanhar o status e participar de futuras sessões de lances.
                    </p>
                    <Button 
                      onClick={() => navigate("/cadastro-fornecedor")}
                      className="w-full"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Ir para Cadastro de Fornecedor
                    </Button>
                  </div>
                )}

                {/* Se já está autenticado, mostrar mensagem de acesso ao portal */}
                {fornecedor && (
                  <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Você pode acompanhar esta e outras seleções no seu Portal do Fornecedor, no menu "Seleção de Fornecedores".
                    </p>
                  </div>
                )}

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Informações da Sessão:</p>
                  <p className="text-sm">
                    <strong>Data da Sessão:</strong> {selecao?.data_sessao_disputa?.split('T')[0].split('-').reverse().join('/')}
                  </p>
                  <p className="text-sm">
                    <strong>Horário:</strong> {selecao?.hora_sessao_disputa}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Botão Voltar */}
        <div className="text-center">
          <Button variant="outline" onClick={() => navigate("/portal-fornecedor")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Portal do Fornecedor
          </Button>
        </div>
      </div>

      {/* Diálogo de Importação */}
      <DialogImportarProposta
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        itens={itens}
        onImportSuccess={handleImportSuccess}
        criterioJulgamento={criterioJulgamento}
        lotes={lotes}
      />
    </div>
  );
};

export default ParticiparSelecao;
