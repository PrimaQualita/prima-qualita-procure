import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { stripHtml } from "@/lib/htmlUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Plus, Trash2, Edit, ChevronRight, Upload, FileSpreadsheet, AlertCircle, FileText, Send, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { DialogItemCotacao } from "@/components/cotacoes/DialogItemCotacao";
import { DialogEnviarCotacao } from "@/components/cotacoes/DialogEnviarCotacao";
import { DialogLote } from "@/components/cotacoes/DialogLote";
import { DialogFinalizarProcesso } from "@/components/cotacoes/DialogFinalizarProcesso";
import { DialogCriarSelecao } from "@/components/cotacoes/DialogCriarSelecao";

import { DialogImportarItens } from "@/components/cotacoes/DialogImportarItens";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import DOMPurify from "dompurify";
import { gerarAutorizacaoCompraDireta, gerarAutorizacaoSelecao } from "@/lib/gerarAutorizacaoPDF";
import { useCanEdit, useUserContext } from "@/hooks/useUserContext";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import { compararAlteracoes } from "@/lib/compararAlteracoes";
import { AnoReferenciaFilter, extrairAnos, filtrarPorAno } from "@/components/AnoReferenciaFilter";

// Cache global para evitar recarregamentos desnecessários
let cachedContratos: Contrato[] | null = null;
let cachedUserData: { isResponsavelLegal: boolean; nome: string; cpf: string } | null = null;
let contratosLoaded = false;
let userDataLoaded = false;

// Função exportada para limpar o cache no logout
export const clearCotacoesCache = () => {
  cachedContratos = null;
  cachedUserData = null;
  contratosLoaded = false;
  userDataLoaded = false;
};

interface Contrato {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  status: string;
  cor_fundo?: string | null;
}

interface Processo {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  valor_estimado_anual: number;
  requer_cotacao: boolean;
  requer_selecao: boolean;
  tipo: string;
  criterio_julgamento?: string;
  ano_referencia?: number;
}

interface Cotacao {
  id: string;
  processo_compra_id: string;
  titulo_cotacao: string;
  descricao_cotacao: string;
  status_cotacao: string;
  data_limite_resposta: string;
  criterio_julgamento: 'por_item' | 'global' | 'por_lote' | 'desconto';
}

interface Lote {
  id: string;
  numero_lote: number;
  descricao_lote: string;
}

interface ItemCotacao {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_estimado: number;
  lote_id: string | null;
  marca?: string;
}

const Cotacoes = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = useCanEdit();
  
  // Começa como false se já temos cache
  const [loading, setLoading] = useState(!contratosLoaded);
  const [loadingProcessos, setLoadingProcessos] = useState(false);
  const [loadingCotacoes, setLoadingCotacoes] = useState(false);
  const [loadingItens, setLoadingItens] = useState(false);
  const [contratos, setContratos] = useState<Contrato[]>(cachedContratos || []);
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState<Processo | null>(null);
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [cotacaoSelecionada, setCotacaoSelecionada] = useState<Cotacao | null>(null);
  const [itens, setItens] = useState<ItemCotacao[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [anoSelecionado, setAnoSelecionado] = useState("todos");
  const [dialogItemOpen, setDialogItemOpen] = useState(false);
  const [dialogCotacaoOpen, setDialogCotacaoOpen] = useState(false);
  const [dialogEnviarOpen, setDialogEnviarOpen] = useState(false);
  const [dialogLoteOpen, setDialogLoteOpen] = useState(false);
  const [dialogFinalizarOpen, setDialogFinalizarOpen] = useState(false);
  const [dialogCriarSelecaoOpen, setDialogCriarSelecaoOpen] = useState(false);
  const [dialogEditarCotacaoOpen, setDialogEditarCotacaoOpen] = useState(false);
  const [cotacaoEditando, setCotacaoEditando] = useState<Cotacao | null>(null);
  const [cotacaoOriginal, setCotacaoOriginal] = useState<Cotacao | null>(null);
  const [dialogImportarOpen, setDialogImportarOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [confirmDeleteCotacaoOpen, setConfirmDeleteCotacaoOpen] = useState(false);
  const [cotacaoParaExcluir, setCotacaoParaExcluir] = useState<string | null>(null);
  const [itemEditando, setItemEditando] = useState<ItemCotacao | null>(null);
  const [loteEditando, setLoteEditando] = useState<Lote | null>(null);
  const [confirmDeleteLoteOpen, setConfirmDeleteLoteOpen] = useState(false);
  const [loteParaExcluir, setLoteParaExcluir] = useState<string | null>(null);
  const [loteParaAdicionarItem, setLoteParaAdicionarItem] = useState<string | null>(null);
  const [confirmDeleteItemOpen, setConfirmDeleteItemOpen] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);
  const [confirmDeleteEmailOpen, setConfirmDeleteEmailOpen] = useState(false);
  const [emailParaExcluir, setEmailParaExcluir] = useState<string | null>(null);
  const [savingCotacao, setSavingCotacao] = useState(false);
  const [criterioJulgamento, setCriterioJulgamento] = useState<'por_item' | 'global' | 'por_lote' | 'desconto'>('global');
  const [naoRequerSelecao, setNaoRequerSelecao] = useState(false);
  const [autorizacaoAnexada, setAutorizacaoAnexada] = useState<File | null>(null);
  const [autorizacaoSelecaoAnexada, setAutorizacaoSelecaoAnexada] = useState<File | null>(null);
  const [emailsFornecedoresAnexados, setEmailsFornecedoresAnexados] = useState<File[]>([]);
  const [uploadingAutorizacao, setUploadingAutorizacao] = useState(false);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(cachedUserData?.isResponsavelLegal || false);
  const [usuarioNome, setUsuarioNome] = useState(cachedUserData?.nome || '');
  const [usuarioCpf, setUsuarioCpf] = useState(cachedUserData?.cpf || '');
  const [autorizacaoSelecaoUrl, setAutorizacaoSelecaoUrl] = useState('');
  const [autorizacaoDiretaUrl, setAutorizacaoDiretaUrl] = useState('');
  const [autorizacaoSelecaoId, setAutorizacaoSelecaoId] = useState('');
  const [autorizacaoDiretaId, setAutorizacaoDiretaId] = useState('');
  const [emailsSalvos, setEmailsSalvos] = useState<Array<{id: string; nome_arquivo: string; url_arquivo: string}>>([]);
  const [anexosProcessoObrigatorios, setAnexosProcessoObrigatorios] = useState<string[]>([]);
  const [novaCotacao, setNovaCotacao] = useState({
    titulo_cotacao: "",
    descricao_cotacao: "",
    data_limite_resposta: "",
  });

  // Tipos de anexos obrigatórios para criar cotação
  const TIPOS_ANEXOS_OBRIGATORIOS = ["capa_processo", "requisicao", "autorizacao_despesa", "termo_referencia"];
  
  // Verificar se todos os anexos obrigatórios estão presentes
  const anexosObrigatoriosCompletos = TIPOS_ANEXOS_OBRIGATORIOS.every(tipo => anexosProcessoObrigatorios.includes(tipo));
  
  // Lista de anexos faltantes para exibir no tooltip
  const anexosFaltantes = TIPOS_ANEXOS_OBRIGATORIOS.filter(tipo => !anexosProcessoObrigatorios.includes(tipo)).map(tipo => {
    const labels: Record<string, string> = {
      capa_processo: "Capa do Processo",
      requisicao: "Requisição",
      autorizacao_despesa: "Autorização da Despesa",
      termo_referencia: "Termo de Referência"
    };
    return labels[tipo] || tipo;
  });

  // Listener para limpar cache no logout (funciona mesmo se DashboardLayout não estiver montado)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearCotacoesCache();
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const init = async () => {
      // Usar cache se disponível
      if (userDataLoaded && cachedUserData) {
        setIsResponsavelLegal(cachedUserData.isResponsavelLegal);
        setUsuarioNome(cachedUserData.nome);
        setUsuarioCpf(cachedUserData.cpf);
      } else {
        await checkAuth();
      }
      
      // Usar cache APENAS se existe E tem dados
      if (contratosLoaded && cachedContratos && cachedContratos.length > 0) {
        setContratos(cachedContratos);
      } else {
        await loadContratos();
      }
      
      setLoading(false);
      
      // Verificar se há parâmetro para abrir o dialog de finalização
      const openFinalizarId = searchParams.get('openFinalizar');
      if (openFinalizarId) {
        await loadCotacaoByIdAndOpenDialog(openFinalizarId);
        setSearchParams({}, { replace: true });
        return;
      }

      // Verificar se há parâmetro para abrir o dialog de autorização de seleção
      const openFinalizarSelecaoId = searchParams.get('openFinalizarSelecao');
      if (openFinalizarSelecaoId) {
        await loadCotacaoByIdAndOpenDialogSelecao(openFinalizarSelecaoId);
        setSearchParams({}, { replace: true });
        return;
      }
      
      // Verificar se há parâmetros para restaurar o estado da navegação (voltando de outra página)
      const contratoId = searchParams.get('contrato');
      const processoId = searchParams.get('processo');
      const cotacaoId = searchParams.get('cotacao');
      
      if (contratoId && processoId && cotacaoId) {
        // Limpar parâmetros imediatamente para evitar loop
        setSearchParams({}, { replace: true });
        
        // Buscar dados em paralelo para performance
        const [contratoResult, processoResult, cotacaoResult] = await Promise.all([
          supabase.from("contratos_gestao").select("*").eq("id", contratoId).single(),
          supabase.from("processos_compras").select("*").eq("id", processoId).single(),
          supabase.from("cotacoes_precos").select("*").eq("id", cotacaoId).single()
        ]);
        
        if (contratoResult.data) {
          const contratoData = contratoResult.data;
          setContratoSelecionado({
            id: contratoData.id,
            nome_contrato: contratoData.nome_contrato,
            ente_federativo: contratoData.ente_federativo,
            status: contratoData.status
          });
        }
        
        if (processoResult.data) {
          const processoData = processoResult.data;
          setProcessoSelecionado({
            id: processoData.id,
            numero_processo_interno: processoData.numero_processo_interno,
            objeto_resumido: processoData.objeto_resumido,
            valor_estimado_anual: processoData.valor_estimado_anual,
            requer_cotacao: processoData.requer_cotacao,
            requer_selecao: processoData.requer_selecao,
            tipo: processoData.tipo,
            criterio_julgamento: processoData.criterio_julgamento
          });
        }
        
        if (cotacaoResult.data) {
          const cotacaoData = cotacaoResult.data;
          setCotacaoSelecionada({
            id: cotacaoData.id,
            processo_compra_id: cotacaoData.processo_compra_id,
            titulo_cotacao: cotacaoData.titulo_cotacao,
            descricao_cotacao: cotacaoData.descricao_cotacao,
            data_limite_resposta: cotacaoData.data_limite_resposta,
            status_cotacao: cotacaoData.status_cotacao,
            criterio_julgamento: cotacaoData.criterio_julgamento as "global" | "por_item" | "por_lote" | "desconto"
          });
        }
      }
    };
    
    init();
  }, []);

  useEffect(() => {
    if (contratoSelecionado) {
      loadProcessos(contratoSelecionado.id);
    }
  }, [contratoSelecionado]);

  useEffect(() => {
    if (processoSelecionado) {
      loadCotacoes(processoSelecionado.id);
      loadAnexosProcesso(processoSelecionado.id);
    } else {
      setAnexosProcessoObrigatorios([]);
    }
  }, [processoSelecionado]);

  useEffect(() => {
    if (cotacaoSelecionada) {
      loadItensAndRelated(cotacaoSelecionada.id);
      setCriterioJulgamento(cotacaoSelecionada.criterio_julgamento);
    }
  }, [cotacaoSelecionada]);

  const loadCotacaoByIdAndOpenDialog = async (cotacaoId: string) => {
    try {
      // Buscar a cotação pelo ID
      const { data: cotacao, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("*, processos_compras(*, contratos_gestao(*))")
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;
      if (!cotacao) return;

      // Buscar o contrato
      const contrato = (cotacao as any).processos_compras.contratos_gestao;
      const processo = (cotacao as any).processos_compras;

      // Carregar a hierarquia: contrato -> processo -> cotação
      setContratoSelecionado({
        id: contrato.id,
        nome_contrato: contrato.nome_contrato,
        ente_federativo: contrato.ente_federativo,
        status: contrato.status
      });

      // Aguardar um pouco para garantir que os processos foram carregados
      setTimeout(() => {
        setProcessoSelecionado({
          id: processo.id,
          numero_processo_interno: processo.numero_processo_interno,
          objeto_resumido: processo.objeto_resumido,
          valor_estimado_anual: processo.valor_estimado_anual,
          requer_cotacao: processo.requer_cotacao,
          requer_selecao: processo.requer_selecao,
          tipo: processo.tipo,
          criterio_julgamento: processo.criterio_julgamento
        });

        // Aguardar um pouco para garantir que as cotações foram carregadas
        setTimeout(() => {
          setCotacaoSelecionada({
            id: cotacao.id,
            processo_compra_id: cotacao.processo_compra_id,
            titulo_cotacao: cotacao.titulo_cotacao,
            descricao_cotacao: cotacao.descricao_cotacao,
            status_cotacao: cotacao.status_cotacao,
            data_limite_resposta: cotacao.data_limite_resposta,
            criterio_julgamento: cotacao.criterio_julgamento as 'por_item' | 'global' | 'por_lote' | 'desconto'
          });

          // Abrir o dialog
          setDialogFinalizarOpen(true);
        }, 300);
      }, 300);
    } catch (error) {
      console.error("Erro ao carregar cotação:", error);
      toast.error("Erro ao carregar cotação");
    }
  };

  // Função específica para abrir o dialog de Seleção de Fornecedores
  const loadCotacaoByIdAndOpenDialogSelecao = async (cotacaoId: string) => {
    try {
      // Buscar a cotação pelo ID
      const { data: cotacao, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("*, processos_compras(*, contratos_gestao(*))")
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;
      if (!cotacao) return;

      // Buscar o contrato
      const contrato = (cotacao as any).processos_compras.contratos_gestao;
      const processo = (cotacao as any).processos_compras;

      // Carregar a hierarquia: contrato -> processo -> cotação
      setContratoSelecionado({
        id: contrato.id,
        nome_contrato: contrato.nome_contrato,
        ente_federativo: contrato.ente_federativo,
        status: contrato.status
      });

      // Aguardar um pouco para garantir que os processos foram carregados
      setTimeout(() => {
        setProcessoSelecionado({
          id: processo.id,
          numero_processo_interno: processo.numero_processo_interno,
          objeto_resumido: processo.objeto_resumido,
          valor_estimado_anual: processo.valor_estimado_anual,
          requer_cotacao: processo.requer_cotacao,
          requer_selecao: processo.requer_selecao,
          tipo: processo.tipo,
          criterio_julgamento: processo.criterio_julgamento
        });

        // Aguardar um pouco para garantir que as cotações foram carregadas
        setTimeout(() => {
          setCotacaoSelecionada({
            id: cotacao.id,
            processo_compra_id: cotacao.processo_compra_id,
            titulo_cotacao: cotacao.titulo_cotacao,
            descricao_cotacao: cotacao.descricao_cotacao,
            status_cotacao: cotacao.status_cotacao,
            data_limite_resposta: cotacao.data_limite_resposta,
            criterio_julgamento: cotacao.criterio_julgamento as 'por_item' | 'global' | 'por_lote' | 'desconto'
          });

          // Abrir o dialog de SELEÇÃO (não de finalizar processo)
          setDialogCriarSelecaoOpen(true);
        }, 300);
      }, 300);
    } catch (error) {
      console.error("Erro ao carregar cotação para seleção:", error);
      toast.error("Erro ao carregar cotação");
    }
  };

  const checkAuth = async () => {
    // Usar cache se disponível
    if (userDataLoaded && cachedUserData) {
      setIsResponsavelLegal(cachedUserData.isResponsavelLegal);
      setUsuarioNome(cachedUserData.nome);
      setUsuarioCpf(cachedUserData.cpf);
      return;
    }
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    
    // Verificar se é responsável legal e buscar dados do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("responsavel_legal, nome_completo, cpf, gestor, compliance, superintendente_executivo")
      .eq("id", session.user.id)
      .single();
    
    const isRL = profile?.responsavel_legal || false;
    const hasProfileEditRole = profile?.gestor || profile?.compliance || profile?.superintendente_executivo;
    
    // Verificar user_roles para papéis cumulativos
    let hasUserRole = false;
    if (isRL && !hasProfileEditRole) {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      hasUserRole = userRoles?.some(r => ["gestor", "colaborador"].includes(r.role)) || false;
    }
    
    // Só é RL restrito se não tem outros perfis de edição
    const isOnlyRL = isRL && !hasProfileEditRole && !hasUserRole;
    
    const userData = {
      isResponsavelLegal: isOnlyRL,
      nome: profile?.nome_completo || '',
      cpf: profile?.cpf || ''
    };
    
    // Salvar no cache
    cachedUserData = userData;
    userDataLoaded = true;
    
    setIsResponsavelLegal(userData.isResponsavelLegal);
    setUsuarioNome(userData.nome);
    setUsuarioCpf(userData.cpf);
  };

  const loadContratos = async () => {
    // Usar cache APENAS se os dados existem E têm conteúdo
    if (contratosLoaded && cachedContratos && cachedContratos.length > 0) {
      setContratos(cachedContratos);
      return;
    }
    
    const { data, error } = await supabase
      .from("contratos_gestao")
      .select("*")
      .order("nome_contrato", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar contratos");
      console.error(error);
    } else {
      // Salvar no cache APENAS se retornou dados
      if (data && data.length > 0) {
        cachedContratos = data;
        contratosLoaded = true;
      }
      setContratos(data || []);
    }
  };

  const loadProcessos = async (contratoId: string) => {
    setLoadingProcessos(true);
    const { data, error } = await supabase
      .from("processos_compras")
      .select("*")
      .eq("contrato_gestao_id", contratoId)
      .eq("requer_cotacao", true)
      .order("numero_processo_interno", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar processos");
      console.error(error);
    } else {
      setProcessos(data || []);
    }
    setLoadingProcessos(false);
  };

  const loadCotacoes = async (processoId: string) => {
    setLoadingCotacoes(true);
    console.log("Carregando cotações para processo:", processoId);
    const { data, error } = await supabase
      .from("cotacoes_precos")
      .select("*")
      .eq("processo_compra_id", processoId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar cotações:", error);
      toast.error("Erro ao carregar cotações");
    } else {
      console.log("Cotações carregadas:", data);
      // Usa o critério do processo se a cotação não tiver um
      const processo = processos.find(p => p.id === processoId);
      setCotacoes((data || []).map(c => ({
        ...c,
        criterio_julgamento: (c.criterio_julgamento || processo?.criterio_julgamento || 'global') as 'por_item' | 'global' | 'por_lote' | 'desconto'
      })));
    }
    setLoadingCotacoes(false);
  };

  const loadAnexosProcesso = async (processoId: string) => {
    const { data, error } = await supabase
      .from("anexos_processo_compra")
      .select("tipo_anexo")
      .eq("processo_compra_id", processoId);

    if (error) {
      console.error("Erro ao carregar anexos do processo:", error);
      setAnexosProcessoObrigatorios([]);
    } else {
      const tipos = data?.map(a => a.tipo_anexo) || [];
      setAnexosProcessoObrigatorios(tipos);
    }
  };

  const loadItensAndRelated = async (cotacaoId: string) => {
    setLoadingItens(true);
    // Carregar tudo em paralelo para ser mais rápido
    await Promise.all([
      loadItens(cotacaoId),
      loadLotes(cotacaoId),
      loadAutorizacoes(cotacaoId),
      loadEmailsAnexados(cotacaoId)
    ]);
    setLoadingItens(false);
  };

  const loadLotes = async (cotacaoId: string) => {
    const { data, error } = await supabase
      .from("lotes_cotacao")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("numero_lote", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar lotes");
      console.error(error);
    } else {
      setLotes(data || []);
    }
  };

  const loadAutorizacoes = async (cotacaoId: string) => {
    const { data, error } = await (supabase as any)
      .from("autorizacoes_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId);

    if (error) {
      console.error("Erro ao carregar autorizações:", error);
      return;
    }

    if (data && data.length > 0) {
      data.forEach((autorizacao: any) => {
        if (autorizacao.tipo_autorizacao === 'compra_direta') {
          setAutorizacaoDiretaUrl(autorizacao.url_arquivo);
          setAutorizacaoDiretaId(autorizacao.id);
        } else if (autorizacao.tipo_autorizacao === 'selecao_fornecedores') {
          setAutorizacaoSelecaoUrl(autorizacao.url_arquivo);
          setAutorizacaoSelecaoId(autorizacao.id);
        }
      });
    }
  };

  const deletarAutorizacao = async (autorizacaoId: string, tipo: 'compra_direta' | 'selecao_fornecedores') => {
    try {
      // Buscar a URL do arquivo para deletar do storage
      const { data: autorizacao } = await supabase
        .from("autorizacoes_processo")
        .select("url_arquivo, nome_arquivo, protocolo")
        .eq("id", autorizacaoId)
        .single();

      if (autorizacao?.url_arquivo) {
        // Extrair path corretamente, removendo parâmetros de URL assinada
        let filePath = autorizacao.url_arquivo.split("/processo-anexos/")[1];
        if (filePath) {
          // Remover query params se houver (URLs assinadas)
          filePath = filePath.split("?")[0];
          
          const { error: storageError } = await supabase.storage
            .from("processo-anexos")
            .remove([filePath]);

          if (storageError) {
            console.error("Erro ao remover do storage:", storageError);
          }
        }
      }

      // Deletar do banco de dados
      const { error } = await supabase
        .from("autorizacoes_processo")
        .delete()
        .eq("id", autorizacaoId);

      if (error) {
        toast.error("Erro ao deletar autorização");
        console.error(error);
        return;
      }

      // Registrar auditoria da exclusão da autorização
      try {
        const tipoNome = tipo === 'selecao_fornecedores' ? 'Seleção de Fornecedores' : 'Compra Direta';
        await registrarAuditoria({
          acao: 'exclusão',
          entidade: 'Autorização de Processo',
          entidade_id: autorizacaoId,
          detalhes: {
            tipo: `Autorização de ${tipoNome}`,
            tipo_autorizacao: tipo,
            protocolo: autorizacao?.protocolo || null,
            nome_arquivo: autorizacao?.nome_arquivo || null,
            numero_processo: processoSelecionado?.numero_processo_interno || '',
            contrato_gestao: contratoSelecionado?.nome_contrato || '',
            titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || '',
          },
        });
      } catch (auditError) {
        console.warn('Erro ao registrar auditoria da exclusão da autorização:', auditError);
      }

      if (tipo === 'compra_direta') {
        setAutorizacaoDiretaUrl('');
        setAutorizacaoDiretaId('');
      } else {
        setAutorizacaoSelecaoUrl('');
        setAutorizacaoSelecaoId('');
      }

      toast.success("Autorização deletada com sucesso");
    } catch (error: any) {
      console.error("Erro ao deletar autorização:", error);
      toast.error("Erro ao deletar autorização");
    }
  };

  const loadEmailsAnexados = async (cotacaoId: string) => {
    const { data, error } = await (supabase as any)
      .from("emails_cotacao_anexados")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_upload", { ascending: true });

    if (error) {
      console.error("Erro ao carregar e-mails:", error);
      return;
    }

    setEmailsSalvos(data || []);
  };

  const salvarEmailsAnexados = async (files: File[]) => {
    if (!cotacaoSelecionada) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      for (const file of files) {
        // Sanitizar nome do arquivo removendo acentos e caracteres especiais
        const sanitizedName = file.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove acentos
          .replace(/[^a-zA-Z0-9._-]/g, '_') // Substitui caracteres especiais por _
          .replace(/_+/g, '_'); // Remove underscores duplicados
        
        // Upload para storage
        const fileName = `emails/${cotacaoSelecionada.id}/${Date.now()}-${sanitizedName}`;
        const { error: uploadError } = await supabase.storage
          .from('processo-anexos')
          .upload(fileName, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Salvar no banco com path do storage (não URL assinada)
        const { error: saveError } = await (supabase as any)
          .from("emails_cotacao_anexados")
          .insert({
            cotacao_id: cotacaoSelecionada.id,
            url_arquivo: `processo-anexos/${fileName}`,
            nome_arquivo: file.name,
            tamanho_arquivo: file.size,
            tipo_arquivo: file.type,
            usuario_upload_id: session.user.id
          });

        if (saveError) throw saveError;

        // Registrar auditoria de anexação de email
        await registrarAuditoria({
          acao: 'criação',
          entidade: 'emails_cotacao_anexados',
          detalhes: {
            tipo: 'E-mail de Fornecedor Anexado',
            nome_arquivo: file.name,
            contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
            numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
            titulo_cotacao: cotacaoSelecionada.titulo_cotacao,
          },
        });
      }

      await loadEmailsAnexados(cotacaoSelecionada.id);
      setEmailsFornecedoresAnexados([]);
      toast.success("E-mails salvos com sucesso");
    } catch (error) {
      console.error("Erro ao salvar e-mails:", error);
      toast.error("Erro ao salvar e-mails");
    }
  };

  const handleDeleteEmail = (emailId: string) => {
    setEmailParaExcluir(emailId);
    setConfirmDeleteEmailOpen(true);
  };

  const confirmarDeleteEmail = async () => {
    if (!emailParaExcluir) return;
    
    try {
      // Buscar o email para pegar a URL e nome antes de deletar
      const { data: email, error: fetchError } = await (supabase as any)
        .from("emails_cotacao_anexados")
        .select("url_arquivo, nome_arquivo")
        .eq("id", emailParaExcluir)
        .single();

      if (fetchError) throw fetchError;

      // Deletar o arquivo do storage
      if (email?.url_arquivo) {
        const path = email.url_arquivo.replace('processo-anexos/', '');
        const { error: storageError } = await supabase.storage
          .from('processo-anexos')
          .remove([path]);
        
        if (storageError) {
          console.error("Erro ao deletar arquivo do storage:", storageError);
        }
      }

      // Deletar o registro do banco
      const { error } = await (supabase as any)
        .from("emails_cotacao_anexados")
        .delete()
        .eq("id", emailParaExcluir);

      if (error) throw error;

      // Registrar auditoria de exclusão de email
      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'emails_cotacao_anexados',
        entidade_id: emailParaExcluir,
        detalhes: {
          tipo: 'E-mail de Fornecedor Anexado',
          nome_arquivo: email?.nome_arquivo || 'N/A',
          contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
          numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
          titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || 'N/A',
        },
      });

      if (cotacaoSelecionada) {
        await loadEmailsAnexados(cotacaoSelecionada.id);
      }
      toast.success("E-mail deletado com sucesso");
    } catch (error) {
      console.error("Erro ao deletar e-mail:", error);
      toast.error("Erro ao deletar e-mail");
    } finally {
      setConfirmDeleteEmailOpen(false);
      setEmailParaExcluir(null);
    }
  };

  const loadItens = async (cotacaoId: string) => {
    setLoadingItens(true);
    try {
      const { data, error } = await supabase
        .from("itens_cotacao")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("numero_item", { ascending: true });

      if (error) throw error;
      setItens(data || []);
    } catch (error) {
      toast.error("Erro ao carregar itens");
      console.error(error);
    } finally {
      setLoadingItens(false);
    }
  };

  const handleSaveCotacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!processoSelecionado) return;

    setSavingCotacao(true);
    try {
      // Converter datetime-local para UTC
      // Input datetime-local retorna "2025-12-03T19:00" - interpretar como Brasília (UTC-3)
      const dataLocalStr = novaCotacao.data_limite_resposta;
      let dataISO: string;
      
      if (dataLocalStr && dataLocalStr.includes('T') && !dataLocalStr.includes('Z') && !dataLocalStr.includes('+')) {
        // Formato datetime-local sem timezone - interpretar como Brasília e converter para UTC
        const dataComOffset = new Date(dataLocalStr + ':00-03:00');
        dataISO = dataComOffset.toISOString();
      } else {
        dataISO = dataLocalStr ? new Date(dataLocalStr).toISOString() : new Date().toISOString();
      }
      
      // Usa o critério de julgamento do processo
      const { error } = await supabase
        .from("cotacoes_precos")
        .insert({
          processo_compra_id: processoSelecionado.id,
          titulo_cotacao: novaCotacao.titulo_cotacao,
          descricao_cotacao: novaCotacao.descricao_cotacao,
          data_limite_resposta: dataISO,
          criterio_julgamento: processoSelecionado.criterio_julgamento || 'global',
        });

      if (error) throw error;

      // Registrar auditoria de criação
      await registrarAuditoria({
        acao: 'criação',
        entidade: 'cotacoes_precos',
        detalhes: {
          tipo: 'Cotação de Preços',
          titulo_cotacao: novaCotacao.titulo_cotacao,
          contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
          numero_processo: processoSelecionado.numero_processo_interno,
        },
      });

      toast.success("Cotação criada com sucesso!");
      setDialogCotacaoOpen(false);
      setNovaCotacao({
        titulo_cotacao: "",
        descricao_cotacao: "",
        data_limite_resposta: "",
      });
      loadCotacoes(processoSelecionado.id);
    } catch (error) {
      toast.error("Erro ao criar cotação");
      console.error(error);
    } finally {
      setSavingCotacao(false);
    }
  };

  const handleSaveItem = async (itemData: Omit<ItemCotacao, "id">) => {
    if (!cotacaoSelecionada) return;

    if (itemEditando) {
      // Comparar alterações antes de atualizar
      const alteracoes = compararAlteracoes(
        {
          numero_item: itemEditando.numero_item,
          descricao: itemEditando.descricao,
          quantidade: itemEditando.quantidade,
          unidade: itemEditando.unidade,
          valor_unitario_estimado: itemEditando.valor_unitario_estimado,
          marca: itemEditando.marca,
        },
        {
          numero_item: itemData.numero_item,
          descricao: itemData.descricao,
          quantidade: itemData.quantidade,
          unidade: itemData.unidade,
          valor_unitario_estimado: itemData.valor_unitario_estimado,
          marca: itemData.marca,
        }
      );

      const { error } = await supabase
        .from("itens_cotacao")
        .update(itemData)
        .eq("id", itemEditando.id);

      if (error) {
        toast.error("Erro ao atualizar item");
        console.error(error);
      } else {
        await registrarAuditoria({
          acao: 'edição',
          entidade: 'itens_cotacao',
          entidade_id: itemEditando.id,
          detalhes: {
            tipo: 'Item de Cotação',
            numero_item: itemData.numero_item,
            descricao: itemData.descricao?.substring(0, 50) || 'N/A',
            contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
            numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
            titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || 'N/A',
            alteracoes: alteracoes.length > 0 ? alteracoes : undefined,
          },
        });
        toast.success("Item atualizado com sucesso");
        loadItens(cotacaoSelecionada.id);
      }
    } else {
      const insertData: any = {
          ...itemData,
          cotacao_id: cotacaoSelecionada.id,
        };
      if (loteParaAdicionarItem) {
        insertData.lote_id = loteParaAdicionarItem;
      }
      const { error } = await supabase
        .from("itens_cotacao")
        .insert(insertData);

      if (error) {
        toast.error("Erro ao criar item");
        console.error(error);
      } else {
        await registrarAuditoria({
          acao: 'criação',
          entidade: 'itens_cotacao',
          detalhes: {
            tipo: 'Item de Cotação',
            numero_item: itemData.numero_item,
            descricao: itemData.descricao?.substring(0, 50) || 'N/A',
            contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
            numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
            titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || 'N/A',
          },
        });
        toast.success("Item criado com sucesso");
        loadItens(cotacaoSelecionada.id);
      }
    }
  };

  const handleDeleteItem = (id: string) => {
    setItemParaExcluir(id);
    setConfirmDeleteItemOpen(true);
  };

  const confirmarDeleteItem = async () => {
    if (!itemParaExcluir || !cotacaoSelecionada) return;
    const id = itemParaExcluir;
    setConfirmDeleteItemOpen(false);
    setItemParaExcluir(null);

    try {
      // Buscar dados do item antes de excluir
      const { data: itemData } = await supabase
        .from("itens_cotacao")
        .select("numero_item, descricao")
        .eq("id", id)
        .single();

      // Primeiro, deletar todas as respostas de fornecedores da cotação
      const { error: respostasItensError } = await supabase
        .from("respostas_itens_fornecedor")
        .delete()
        .eq("item_cotacao_id", id);

      if (respostasItensError) throw respostasItensError;

      // Depois deletar o item
      const { error } = await supabase
        .from("itens_cotacao")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'itens_cotacao',
        entidade_id: id,
        detalhes: {
          tipo: 'Item de Cotação',
          numero_item: itemData?.numero_item || 'N/A',
          descricao: itemData?.descricao?.substring(0, 50) || 'N/A',
          contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
          numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
          titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || 'N/A',
        },
      });

      toast.success("Item excluído com sucesso");
      await renumerarItens();
      loadItens(cotacaoSelecionada.id);
    } catch (error) {
      toast.error("Erro ao excluir item");
      console.error(error);
    }
  };

  const handleDeleteSelectedItems = async () => {
    if (!cotacaoSelecionada || itensSelecionados.size === 0) return;

    setLoadingItens(true);
    try {
      const idsArray = Array.from(itensSelecionados);

      // Deletar respostas de fornecedores e itens em paralelo
      const [respostasResult, itensResult] = await Promise.all([
        supabase
          .from("respostas_itens_fornecedor")
          .delete()
          .in("item_cotacao_id", idsArray),
        supabase
          .from("itens_cotacao")
          .delete()
          .in("id", idsArray)
      ]);

      if (respostasResult.error) throw respostasResult.error;
      if (itensResult.error) throw itensResult.error;

      const itensExcluidos = itens
        .filter((i: any) => idsArray.includes(i.id))
        .map((i: any) => ({
          numero_item: i.numero_item,
          descricao: (i.descricao || "").substring(0, 80),
        }));

      await registrarAuditoria({
        acao: "exclusão",
        entidade: "itens_cotacao",
        entidade_id: cotacaoSelecionada.id,
        detalhes: {
          tipo: "Itens de Cotação (Excluir Selecionados)",
          modo: "selecionados",
          quantidade_itens: idsArray.length,
          itens: itensExcluidos.slice(0, 25),
          criterio_julgamento: criterioJulgamento,
          contrato_gestao: contratoSelecionado?.nome_contrato || "N/A",
          numero_processo: processoSelecionado?.numero_processo_interno || "N/A",
          titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || "N/A",
        },
      });

      toast.success(`${itensSelecionados.size} ${itensSelecionados.size === 1 ? 'item excluído' : 'itens excluídos'} com sucesso`);
      setItensSelecionados(new Set());
      await renumerarItens();
      await loadItens(cotacaoSelecionada.id);
    } catch (error) {
      toast.error("Erro ao excluir itens selecionados");
      console.error(error);
    } finally {
      setLoadingItens(false);
    }
  };

  const renumerarItens = async () => {
    if (!cotacaoSelecionada) return;

    try {
      // Buscar todos os itens restantes ordenados
      const { data: itensRestantes, error: fetchError } = await supabase
        .from("itens_cotacao")
        .select("*")
        .eq("cotacao_id", cotacaoSelecionada.id)
        .order("numero_item", { ascending: true });

      if (fetchError) throw fetchError;
      if (!itensRestantes || itensRestantes.length === 0) return;

      // Verificar se é critério por lote
      const criterio = processoSelecionado?.criterio_julgamento;
      
      if (criterio === 'por_lote') {
        // Renumerar por lote - cada lote tem numeração independente
        const itensPorLote: { [loteId: string]: typeof itensRestantes } = {};
        
        itensRestantes.forEach(item => {
          const loteId = item.lote_id || 'sem_lote';
          if (!itensPorLote[loteId]) itensPorLote[loteId] = [];
          itensPorLote[loteId].push(item);
        });

        for (const itensDoLote of Object.values(itensPorLote)) {
          for (let i = 0; i < itensDoLote.length; i++) {
            const item = itensDoLote[i];
            if (item.numero_item !== i + 1) {
              await supabase
                .from("itens_cotacao")
                .update({ numero_item: i + 1 })
                .eq("id", item.id);
            }
          }
        }
      } else {
        // Renumerar globalmente - numeração sequencial única
        for (let i = 0; i < itensRestantes.length; i++) {
          const item = itensRestantes[i];
          if (item.numero_item !== i + 1) {
            await supabase
              .from("itens_cotacao")
              .update({ numero_item: i + 1 })
              .eq("id", item.id);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao renumerar itens:", error);
    }
  };

  const handleDeleteAllItems = async () => {
    if (!cotacaoSelecionada) return;

    try {
      const arquivosParaDeletar: string[] = [];
      
      // Função auxiliar para limpar paths de storage
      const cleanStoragePath = (url: string): string => {
        return url
          .split('?')[0]
          .replace(/^processo-anexos\//, '')
          .replace(/^.*\/processo-anexos\//, ''); // Remover URL completa se houver
      };

      // Primeiro, deletar todas as respostas de fornecedores da cotação
      const { data: respostasData } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id, comprovantes_urls, url_pdf_proposta")
        .eq("cotacao_id", cotacaoSelecionada.id);

      if (respostasData && respostasData.length > 0) {
        const respostaIds = respostasData.map(r => r.id);
        
        // Coletar url_pdf_proposta (campo direto na resposta)
        respostasData.forEach(r => {
          if (r.url_pdf_proposta) {
            arquivosParaDeletar.push(cleanStoragePath(r.url_pdf_proposta));
          }
        });
        
        // Coletar comprovantes_urls
        respostasData.forEach(r => {
          if (r.comprovantes_urls && Array.isArray(r.comprovantes_urls)) {
            r.comprovantes_urls.forEach((url: string) => {
              arquivosParaDeletar.push(cleanStoragePath(url));
            });
          }
        });
        
        // Buscar anexos de cotação fornecedor (comprovantes, etc.)
        const { data: anexosData } = await supabase
          .from("anexos_cotacao_fornecedor")
          .select("url_arquivo")
          .in("cotacao_resposta_fornecedor_id", respostaIds);
        
        if (anexosData) {
          anexosData.forEach(anexo => {
            if (anexo.url_arquivo) {
              arquivosParaDeletar.push(cleanStoragePath(anexo.url_arquivo));
            }
          });
        }
        
        // Deletar arquivos do storage PRIMEIRO
        if (arquivosParaDeletar.length > 0) {
          console.log(`🗑️ Deletando ${arquivosParaDeletar.length} arquivos do storage...`);
          const { error: storageError } = await supabase.storage
            .from('processo-anexos')
            .remove(arquivosParaDeletar);
          
          if (storageError) {
            console.error("Erro ao deletar arquivos do storage:", storageError);
            // Não bloqueia - continua para deletar registros
          }
        }
        
        // Deletar registros de anexos
        await supabase
          .from("anexos_cotacao_fornecedor")
          .delete()
          .in("cotacao_resposta_fornecedor_id", respostaIds);
        
        // Deletar respostas de itens
        const { error: respostasItensError } = await supabase
          .from("respostas_itens_fornecedor")
          .delete()
          .in("cotacao_resposta_fornecedor_id", respostaIds);

        if (respostasItensError) throw respostasItensError;

        // Deletar respostas de fornecedores
        const { error: respostasError } = await supabase
          .from("cotacao_respostas_fornecedor")
          .delete()
          .eq("cotacao_id", cotacaoSelecionada.id);

        if (respostasError) throw respostasError;
      }

      // Excluir todos os itens da cotação
      const { error: itensError } = await supabase
        .from("itens_cotacao")
        .delete()
        .eq("cotacao_id", cotacaoSelecionada.id);

      if (itensError) throw itensError;

      // Se for por lote, excluir também todos os lotes
      if (criterioJulgamento === 'por_lote') {
        const { error: lotesError } = await supabase
          .from("lotes_cotacao")
          .delete()
          .eq("cotacao_id", cotacaoSelecionada.id);

        if (lotesError) throw lotesError;
      }


      await registrarAuditoria({
        acao: "exclusão",
        entidade: "itens_cotacao",
        entidade_id: cotacaoSelecionada.id,
        detalhes: {
          tipo: "Itens de Cotação (Excluir Todos)",
          modo: "todos",
          quantidade_itens: itens.length,
          quantidade_lotes: criterioJulgamento === "por_lote" ? lotes.length : 0,
          respostas_fornecedores_excluidas: respostasData?.length || 0,
          criterio_julgamento: criterioJulgamento,
          contrato_gestao: contratoSelecionado?.nome_contrato || "N/A",
          numero_processo: processoSelecionado?.numero_processo_interno || "N/A",
          titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || "N/A",
        },
      });

      if (criterioJulgamento === "por_lote") {
        await registrarAuditoria({
          acao: "exclusão",
          entidade: "lotes_cotacao",
          entidade_id: cotacaoSelecionada.id,
          detalhes: {
            tipo: "Lotes de Cotação (Excluir Todos)",
            modo: "todos",
            quantidade_lotes: lotes.length,
            contrato_gestao: contratoSelecionado?.nome_contrato || "N/A",
            numero_processo: processoSelecionado?.numero_processo_interno || "N/A",
            titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || "N/A",
          },
        });
      }

      toast.success("Todos os itens e respostas foram excluídos com sucesso!");
      setConfirmDeleteAllOpen(false);
      loadItens(cotacaoSelecionada.id);
      if (criterioJulgamento === 'por_lote') {
        loadLotes(cotacaoSelecionada.id);
      }
    } catch (error) {
      console.error("Erro ao excluir itens:", error);
      toast.error("Erro ao excluir itens");
    }
  };

  const handleDeleteCotacao = async () => {
    if (!cotacaoParaExcluir || !processoSelecionado) return;

    // Buscar dados da cotação antes de excluir
    const { data: cotacaoData } = await supabase
      .from("cotacoes_precos")
      .select("titulo_cotacao")
      .eq("id", cotacaoParaExcluir)
      .single();

    try {
      console.log("🗑️ Iniciando deleção em cascata da cotação...");
      const arquivosParaDeletar: string[] = [];
      
      // 1. Buscar e coletar URLs de anexos de cotação fornecedor
      const { data: respostasData } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id")
        .eq("cotacao_id", cotacaoParaExcluir);

      if (respostasData && respostasData.length > 0) {
        const respostaIds = respostasData.map(r => r.id);
        
        // Buscar anexos
        const { data: anexosData } = await supabase
          .from("anexos_cotacao_fornecedor")
          .select("url_arquivo")
          .in("cotacao_resposta_fornecedor_id", respostaIds);
        
        if (anexosData) {
          anexosData.forEach(anexo => {
            if (anexo.url_arquivo) {
              const cleanPath = anexo.url_arquivo.split('?')[0].replace(/^processo-anexos\//, '');
              arquivosParaDeletar.push(cleanPath);
            }
          });
        }

        // Deletar respostas de itens
        await supabase
          .from("respostas_itens_fornecedor")
          .delete()
          .in("cotacao_resposta_fornecedor_id", respostaIds);

        // Deletar anexos de cotação fornecedor
        await supabase
          .from("anexos_cotacao_fornecedor")
          .delete()
          .in("cotacao_resposta_fornecedor_id", respostaIds);

        // Deletar respostas de fornecedores
        await supabase
          .from("cotacao_respostas_fornecedor")
          .delete()
          .eq("cotacao_id", cotacaoParaExcluir);
      }

      // 2. Buscar e deletar planilhas consolidadas
      const { data: planilhasData } = await supabase
        .from("planilhas_consolidadas")
        .select("url_arquivo")
        .eq("cotacao_id", cotacaoParaExcluir);
      
      if (planilhasData) {
        planilhasData.forEach(planilha => {
          if (planilha.url_arquivo) {
            const cleanPath = planilha.url_arquivo.split('?')[0].replace(/^processo-anexos\//, '');
            arquivosParaDeletar.push(cleanPath);
          }
        });
        
        await supabase
          .from("planilhas_consolidadas")
          .delete()
          .eq("cotacao_id", cotacaoParaExcluir);
      }

      // 3. Buscar e deletar autorizações
      const { data: autorizacoesData } = await supabase
        .from("autorizacoes_processo")
        .select("url_arquivo")
        .eq("cotacao_id", cotacaoParaExcluir);
      
      if (autorizacoesData) {
        autorizacoesData.forEach(autorizacao => {
          if (autorizacao.url_arquivo) {
            const cleanPath = autorizacao.url_arquivo.split('?')[0].replace(/^processo-anexos\//, '');
            arquivosParaDeletar.push(cleanPath);
          }
        });
        
        await supabase
          .from("autorizacoes_processo")
          .delete()
          .eq("cotacao_id", cotacaoParaExcluir);
      }

      // 4. Buscar e deletar relatórios finais
      const { data: relatoriosData } = await supabase
        .from("relatorios_finais")
        .select("url_arquivo")
        .eq("cotacao_id", cotacaoParaExcluir);
      
      if (relatoriosData) {
        relatoriosData.forEach(relatorio => {
          if (relatorio.url_arquivo) {
            const cleanPath = relatorio.url_arquivo.split('?')[0].replace(/^processo-anexos\//, '');
            arquivosParaDeletar.push(cleanPath);
          }
        });
        
        await supabase
          .from("relatorios_finais")
          .delete()
          .eq("cotacao_id", cotacaoParaExcluir);
      }

      // 5. Buscar e deletar análises de compliance
      const { data: analisesData } = await supabase
        .from("analises_compliance")
        .select("url_documento")
        .eq("cotacao_id", cotacaoParaExcluir);
      
      if (analisesData) {
        analisesData.forEach(analise => {
          if (analise.url_documento) {
            const cleanPath = analise.url_documento.split('?')[0].replace(/^processo-anexos\//, '');
            arquivosParaDeletar.push(cleanPath);
          }
        });
        
        await supabase
          .from("analises_compliance")
          .delete()
          .eq("cotacao_id", cotacaoParaExcluir);
      }

      // 6. Buscar e deletar emails anexados
      const { data: emailsData } = await supabase
        .from("emails_cotacao_anexados")
        .select("url_arquivo")
        .eq("cotacao_id", cotacaoParaExcluir);
      
      if (emailsData) {
        emailsData.forEach(email => {
          if (email.url_arquivo) {
            const cleanPath = email.url_arquivo.split('?')[0].replace(/^processo-anexos\//, '');
            arquivosParaDeletar.push(cleanPath);
          }
        });
        
        await supabase
          .from("emails_cotacao_anexados")
          .delete()
          .eq("cotacao_id", cotacaoParaExcluir);
      }

      // 7. Buscar e deletar encaminhamentos
      const { data: encaminhamentosData } = await supabase
        .from("encaminhamentos_processo")
        .select("storage_path")
        .eq("cotacao_id", cotacaoParaExcluir);
      
      if (encaminhamentosData) {
        encaminhamentosData.forEach(encaminhamento => {
          if (encaminhamento.storage_path) {
            const cleanPath = encaminhamento.storage_path.split('?')[0].replace(/^processo-anexos\//, '');
            arquivosParaDeletar.push(cleanPath);
          }
        });
        
        await supabase
          .from("encaminhamentos_processo")
          .delete()
          .eq("cotacao_id", cotacaoParaExcluir);
      }

      // 8. Buscar e deletar campos/documentos de finalização
      const { data: camposData } = await supabase
        .from("campos_documentos_finalizacao")
        .select("id")
        .eq("cotacao_id", cotacaoParaExcluir);
      
      if (camposData && camposData.length > 0) {
        const campoIds = camposData.map(c => c.id);
        
        const { data: docsFinalizacaoData } = await supabase
          .from("documentos_finalizacao_fornecedor")
          .select("url_arquivo")
          .in("campo_documento_id", campoIds);
        
        if (docsFinalizacaoData) {
          docsFinalizacaoData.forEach(doc => {
            if (doc.url_arquivo) {
              const cleanPath = doc.url_arquivo.split('?')[0].replace(/^processo-anexos\//, '');
              arquivosParaDeletar.push(cleanPath);
            }
          });
          
          await supabase
            .from("documentos_finalizacao_fornecedor")
            .delete()
            .in("campo_documento_id", campoIds);
        }
        
        await supabase
          .from("campos_documentos_finalizacao")
          .delete()
          .eq("cotacao_id", cotacaoParaExcluir);
      }

      // 9. Deletar arquivos do storage
      if (arquivosParaDeletar.length > 0) {
        console.log(`🗑️ Deletando ${arquivosParaDeletar.length} arquivos do storage...`);
        const { error: storageError } = await supabase.storage
          .from('processo-anexos')
          .remove(arquivosParaDeletar);
        
        if (storageError) {
          console.error("Erro ao deletar arquivos do storage:", storageError);
        } else {
          console.log(`✅ ${arquivosParaDeletar.length} arquivos deletados do storage`);
        }
      }

      // 10. Deletar todos os itens da cotação
      await supabase
        .from("itens_cotacao")
        .delete()
        .eq("cotacao_id", cotacaoParaExcluir);

      // 11. Deletar todos os lotes da cotação (se houver)
      await supabase
        .from("lotes_cotacao")
        .delete()
        .eq("cotacao_id", cotacaoParaExcluir);

      // 12. Deletar a cotação
      const { error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .delete()
        .eq("id", cotacaoParaExcluir);

      if (cotacaoError) throw cotacaoError;

      // Registrar auditoria de exclusão de cotação
      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'cotacoes_precos',
        entidade_id: cotacaoParaExcluir,
        detalhes: {
          tipo: 'Cotação de Preços',
          titulo_cotacao: cotacaoData?.titulo_cotacao || 'N/A',
          contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
          numero_processo: processoSelecionado.numero_processo_interno,
        },
      });

      toast.success("Cotação e todos os arquivos relacionados foram excluídos com sucesso!");
      setCotacaoParaExcluir(null);
      setConfirmDeleteCotacaoOpen(false);
      loadCotacoes(processoSelecionado.id);
    } catch (error) {
      console.error("Erro ao excluir cotação:", error);
      toast.error("Erro ao excluir cotação");
    }
  };

  const handleSaveLote = async (loteData: Omit<Lote, "id">) => {
    if (!cotacaoSelecionada) return;

    if (loteEditando) {
      // Comparar alterações antes de atualizar
      const alteracoes = compararAlteracoes(
        {
          numero_lote: loteEditando.numero_lote,
          descricao_lote: loteEditando.descricao_lote,
        },
        {
          numero_lote: loteData.numero_lote,
          descricao_lote: loteData.descricao_lote,
        }
      );

      const { error } = await supabase
        .from("lotes_cotacao")
        .update(loteData)
        .eq("id", loteEditando.id);

      if (error) {
        toast.error("Erro ao atualizar lote");
        console.error(error);
      } else {
        await registrarAuditoria({
          acao: 'edição',
          entidade: 'lotes_cotacao',
          entidade_id: loteEditando.id,
          detalhes: {
            tipo: 'Lote de Cotação',
            numero_lote: loteData.numero_lote,
            descricao_lote: loteData.descricao_lote?.substring(0, 50) || 'N/A',
            contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
            numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
            titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || 'N/A',
            alteracoes: alteracoes.length > 0 ? alteracoes : undefined,
          },
        });
        toast.success("Lote atualizado com sucesso");
        loadLotes(cotacaoSelecionada.id);
      }
    } else {
      const { error } = await supabase
        .from("lotes_cotacao")
        .insert({
          ...loteData,
          cotacao_id: cotacaoSelecionada.id,
        });

      if (error) {
        toast.error("Erro ao criar lote");
        console.error(error);
      } else {
        await registrarAuditoria({
          acao: 'criação',
          entidade: 'lotes_cotacao',
          detalhes: {
            tipo: 'Lote de Cotação',
            numero_lote: loteData.numero_lote,
            descricao_lote: loteData.descricao_lote?.substring(0, 50) || 'N/A',
            contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
            numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
            titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || 'N/A',
          },
        });
        toast.success("Lote criado com sucesso");
        loadLotes(cotacaoSelecionada.id);
      }
    }
  };

  const handleDeleteLote = (id: string) => {
    setLoteParaExcluir(id);
    setConfirmDeleteLoteOpen(true);
  };

  const confirmarDeleteLote = async () => {
    if (!loteParaExcluir) return;
    const id = loteParaExcluir;
    setConfirmDeleteLoteOpen(false);
    setLoteParaExcluir(null);

    try {
      // Buscar dados do lote antes de excluir
      const { data: loteData } = await supabase
        .from("lotes_cotacao")
        .select("numero_lote, descricao_lote")
        .eq("id", id)
        .single();

      // Buscar itens do lote
      const { data: itensLote } = await supabase
        .from("itens_cotacao")
        .select("id")
        .eq("lote_id", id);

      if (itensLote && itensLote.length > 0) {
        const itemIds = itensLote.map(item => item.id);

        // Deletar respostas de fornecedores dos itens do lote
        const { error: respostasError } = await supabase
          .from("respostas_itens_fornecedor")
          .delete()
          .in("item_cotacao_id", itemIds);

        if (respostasError) throw respostasError;

        // Deletar itens do lote
        const { error: itensError } = await supabase
          .from("itens_cotacao")
          .delete()
          .eq("lote_id", id);

        if (itensError) throw itensError;
      }

      // Deletar o lote
      const { error } = await supabase
        .from("lotes_cotacao")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Renumerar lotes restantes em ordem crescente (número e descrição com romano)
      if (cotacaoSelecionada) {
        const { data: lotesRestantes } = await supabase
          .from("lotes_cotacao")
          .select("id, numero_lote, descricao_lote")
          .eq("cotacao_id", cotacaoSelecionada.id)
          .order("numero_lote", { ascending: true });

        if (lotesRestantes && lotesRestantes.length > 0) {
          const numerosRomanos = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
          
          for (let i = 0; i < lotesRestantes.length; i++) {
            const novoNumero = i + 1;
            const loteAtual = lotesRestantes[i];
            
            if (loteAtual.numero_lote !== novoNumero) {
              // Atualizar número romano na descrição
              let novaDescricao = loteAtual.descricao_lote;
              // Regex para encontrar "LOTE X -" ou "LOTE X-" onde X é número romano
              const regexRomano = /LOTE\s+([IVXLCDM]+)\s*-/i;
              if (regexRomano.test(novaDescricao)) {
                novaDescricao = novaDescricao.replace(regexRomano, `LOTE ${numerosRomanos[i]} -`);
              }
              
              await supabase
                .from("lotes_cotacao")
                .update({ 
                  numero_lote: novoNumero,
                  descricao_lote: novaDescricao
                })
                .eq("id", loteAtual.id);
            }
          }
        }
      }

      // Registrar auditoria de exclusão de lote
      await registrarAuditoria({
        acao: 'exclusão',
        entidade: 'lotes_cotacao',
        entidade_id: id,
        detalhes: {
          tipo: 'Lote de Cotação',
          numero_lote: loteData?.numero_lote || 'N/A',
          descricao_lote: loteData?.descricao_lote?.substring(0, 50) || 'N/A',
          contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
          numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
          titulo_cotacao: cotacaoSelecionada?.titulo_cotacao || 'N/A',
        },
      });

      toast.success("Lote e todos os itens vinculados excluídos com sucesso");
      if (cotacaoSelecionada) {
        loadLotes(cotacaoSelecionada.id);
        loadItens(cotacaoSelecionada.id);
      }
    } catch (error) {
      toast.error("Erro ao excluir lote");
      console.error(error);
    }
  };

  const handleUpdateCriterioJulgamento = async (criterio: 'por_item' | 'global' | 'por_lote' | 'desconto') => {
    if (!cotacaoSelecionada) return;

    const { error } = await supabase
      .from("cotacoes_precos")
      .update({ criterio_julgamento: criterio })
      .eq("id", cotacaoSelecionada.id);

    if (error) {
      toast.error("Erro ao atualizar critério de julgamento");
      console.error(error);
    } else {
      toast.success("Critério atualizado com sucesso");
      setCriterioJulgamento(criterio);
      setCotacaoSelecionada({ ...cotacaoSelecionada, criterio_julgamento: criterio });
    }
  };

  const handleUpdateRequerSelecao = async (checked: boolean) => {
    if (!processoSelecionado) return;

    const { error } = await supabase
      .from("processos_compras")
      .update({ requer_selecao: checked })
      .eq("id", processoSelecionado.id);

    if (error) {
      toast.error("Erro ao atualizar seleção de fornecedores");
    } else {
      toast.success(checked ? "Processo marcado para seleção de fornecedores" : "Processo desmarcado de seleção de fornecedores");
      setProcessoSelecionado({ ...processoSelecionado, requer_selecao: checked });
    }
  };

  const calcularTotal = () => {
    return itens.reduce((total, item) => total + (item.quantidade * item.valor_unitario_estimado), 0);
  };

  const contratosFiltrados = contratos.filter(c =>
    c.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    c.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {/* Lista de Contratos */}
        {!contratoSelecionado && (
          <Card>
            <CardHeader>
              <CardTitle>Cotações de Preços</CardTitle>
              <CardDescription>
                Selecione um contrato para visualizar os processos que requerem cotação
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="px-4 sm:px-0 mb-4">
                <Input
                  placeholder="Buscar contrato..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Nome do Contrato</TableHead>
                      <TableHead className="min-w-[120px]">Ente Federativo</TableHead>
                      <TableHead className="min-w-[80px]">Status</TableHead>
                      <TableHead className="text-right min-w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contratosFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-xs sm:text-sm">
                          Nenhum contrato encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      contratosFiltrados.map((contrato, index) => (
                        <TableRow key={contrato.id} className={index % 2 === 0 ? "bg-green-100 dark:bg-green-900/40" : "bg-blue-100 dark:bg-blue-900/40"}>
                          <TableCell className="font-medium text-xs sm:text-sm">{contrato.nome_contrato}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{contrato.ente_federativo}</TableCell>
                          <TableCell>
                            <Badge variant={contrato.status === "ativo" ? "default" : "secondary"} className="text-xs">
                              {contrato.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setContratoSelecionado(contrato)}
                              className="text-xs"
                            >
                              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                              <span className="hidden sm:inline">Ver Processos</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de Processos */}
        {contratoSelecionado && !processoSelecionado && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processos que Requerem Cotação</CardTitle>
                  <CardDescription>
                    Contrato: {contratoSelecionado.nome_contrato}
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => setContratoSelecionado(null)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingProcessos ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-full max-w-md" />
                      </div>
                      <Skeleton className="h-9 w-32" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                <AnoReferenciaFilter
                  anos={extrairAnos(processos, p => p.ano_referencia)}
                  anoSelecionado={anoSelecionado}
                  onAnoChange={setAnoSelecionado}
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Processo</TableHead>
                      <TableHead>Objeto</TableHead>
                      <TableHead className="text-right">Valor Estimado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrarPorAno(processos, anoSelecionado, p => p.ano_referencia).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Nenhum processo que requer cotação encontrado neste contrato
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtrarPorAno(processos, anoSelecionado, p => p.ano_referencia).map((processo) => (
                        <TableRow key={processo.id}>
                          <TableCell className="font-medium">{processo.numero_processo_interno}</TableCell>
                          <TableCell dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processo.objeto_resumido) }} />
                          <TableCell className="text-right">
                            R$ {processo.valor_estimado_anual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setProcessoSelecionado(processo)}
                            >
                              <ChevronRight className="h-4 w-4 mr-2" />
                              Ver Cotações
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Lista de Cotações */}
        {processoSelecionado && !cotacaoSelecionada && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Cotações de Preços</CardTitle>
                  <CardDescription>
                    Processo: {processoSelecionado.numero_processo_interno}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button 
                            onClick={() => {
                              setNovaCotacao({
                                titulo_cotacao: processoSelecionado.numero_processo_interno,
                                descricao_cotacao: stripHtml(processoSelecionado.objeto_resumido),
                                data_limite_resposta: "",
                              });
                              setDialogCotacaoOpen(true);
                            }}
                            disabled={!anexosObrigatoriosCompletos || !canEdit}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nova Cotação
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!anexosObrigatoriosCompletos && (
                        <TooltipContent className="max-w-xs">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                            <div>
                              <p className="font-semibold mb-1">Anexos obrigatórios pendentes:</p>
                              <ul className="list-disc list-inside text-sm">
                                {anexosFaltantes.map(anexo => (
                                  <li key={anexo}>{anexo}</li>
                                ))}
                              </ul>
                              <p className="text-xs mt-2 text-muted-foreground">
                                Acesse "Anexos" no menu Processos de Compras para adicionar.
                              </p>
                            </div>
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="outline" onClick={() => setProcessoSelecionado(null)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cotacoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhuma cotação criada para este processo
                      </TableCell>
                    </TableRow>
                  ) : (
                    cotacoes.map((cotacao) => (
                      <TableRow key={cotacao.id}>
                        <TableCell className="font-medium">{cotacao.titulo_cotacao}</TableCell>
                        <TableCell>
                          <Badge variant={cotacao.status_cotacao === "em_aberto" ? "default" : "secondary"}>
                            {cotacao.status_cotacao}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(cotacao.data_limite_resposta).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCotacaoSelecionada(cotacao)}
                            >
                              <ChevronRight className="h-4 w-4 mr-2" />
                              Gerenciar Itens
                            </Button>
                            {canEdit && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setCotacaoEditando(cotacao);
                                    setCotacaoOriginal({ ...cotacao }); // Guardar original para comparação
                                    setDialogEditarCotacaoOpen(true);
                                  }}
                                  title="Editar cotação"
                                >
                                  <Edit className="h-4 w-4 text-primary" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setCotacaoParaExcluir(cotacao.id);
                                    setConfirmDeleteCotacaoOpen(true);
                                  }}
                                  title="Excluir cotação"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Gerenciamento de Itens da Cotação */}
        {cotacaoSelecionada && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle>{cotacaoSelecionada.titulo_cotacao}</CardTitle>
                      <CardDescription>
                        Processo: {processoSelecionado?.numero_processo_interno}
                      </CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => setCotacaoSelecionada(null)} className="shrink-0">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Voltar
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end ml-auto">
                    {canEdit && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setDialogImportarOpen(true)}
                          size="sm"
                        >
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Importar Excel
                        </Button>
                      </>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button 
                              variant="secondary"
                              onClick={() => {
                                if (emailsSalvos.length === 0) {
                                  toast.warning("É necessário anexar o e-mail de envio antes de ver as respostas", {
                                    description: "Faça o upload do comprovante de envio na seção 'E-mails Anexados' abaixo."
                                  });
                                  return;
                                }
                                navigate(`/respostas-cotacao?cotacao=${cotacaoSelecionada?.id}&contrato=${contratoSelecionado?.id}&processo=${processoSelecionado?.id}`);
                              }}
                              size="sm"
                              disabled={emailsSalvos.length === 0}
                            >
                              Ver Respostas
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {emailsSalvos.length === 0 && (
                          <TooltipContent>
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-amber-500" />
                              <span>Anexe o e-mail de envio primeiro</span>
                            </div>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    {!isResponsavelLegal && (
                      <Button 
                        variant="outline"
                        onClick={() => navigate(`/incluir-precos-publicos?cotacao=${cotacaoSelecionada?.id}&contrato=${contratoSelecionado?.id}&processo=${processoSelecionado?.id}`)}
                        disabled={itens.length === 0}
                        size="sm"
                      >
                        Incluir Preços Públicos
                      </Button>
                    )}
                    {canEdit && (
                      <>
                        <Button 
                          variant="default"
                          onClick={() => setDialogEnviarOpen(true)}
                          disabled={itens.length === 0}
                          size="sm"
                        >
                          Enviar para Fornecedores
                        </Button>
                        {itens.length > 0 && (
                          <Button 
                            variant="destructive"
                            onClick={() => setConfirmDeleteAllOpen(true)}
                            size="sm"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir Itens
                          </Button>
                        )}
                        <Button onClick={() => {
                          setItemEditando(null);
                          setLoteParaAdicionarItem(null);
                          setDialogItemOpen(true);
                        }} size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Novo Item
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-6 space-y-4 p-4 border rounded-lg bg-muted/50">
                  <div className="grid gap-4">
                    {/* Critério de Julgamento - somente leitura, vindo do processo */}
                    <div className="grid gap-2">
                      <Label>Critério de Julgamento (definido no processo)</Label>
                      <div className="p-3 bg-muted rounded-md">
                        <p className="font-medium">
                          {criterioJulgamento === 'global' && '📊 Menor Preço Global'}
                          {criterioJulgamento === 'por_item' && '📋 Menor Preço por Item'}
                          {criterioJulgamento === 'por_lote' && '📦 Menor Preço por Lote'}
                          {criterioJulgamento === 'desconto' && '💰 Maior Percentual de Desconto'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {criterioJulgamento === 'global' && 'Vencedor será o fornecedor com menor valor total geral'}
                          {criterioJulgamento === 'por_item' && 'Vencedor será escolhido item por item (menor preço em cada item)'}
                          {criterioJulgamento === 'desconto' && 'Vencedor será o fornecedor com maior percentual de desconto ofertado'}
                          {criterioJulgamento === 'por_lote' && 'Vencedor será escolhido lote por lote (menor preço em cada lote)'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Campo para anexar cópia dos e-mails enviados aos fornecedores */}
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg">
                      <Label htmlFor="emails-fornecedores-upload" className="text-base font-semibold mb-2 block">
                        Cópia dos E-mails Enviados aos Fornecedores
                      </Label>
                      
                       {/* E-mails já salvos */}
                      {emailsSalvos.length > 0 && (
                        <div className="mb-4 space-y-2">
                          <p className="text-sm font-medium">E-mails Salvos:</p>
                          {emailsSalvos.map((email) => {
                            // Extrair o path do storage (remover prefixo "processo-anexos/")
                            const storagePath = email.url_arquivo.replace('processo-anexos/', '');
                            const { data: { publicUrl } } = supabase.storage
                              .from('processo-anexos')
                              .getPublicUrl(storagePath);
                            
                            return (
                              <div key={email.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                                <span className="text-sm">📎 {email.nome_arquivo}</span>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(publicUrl, '_blank')}
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteEmail(email.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <Input
                            id="emails-fornecedores-upload"
                              type="file"
                              accept=".pdf,.eml,.msg,.zip"
                              multiple
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length > 0) {
                                  await salvarEmailsAnexados(files);
                                  e.target.value = '';
                                }
                              }}
                              className="flex-1"
                            />
                          </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Anexe a cópia dos e-mails enviados aos fornecedores (PDF, EML, MSG ou ZIP)
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="requer_selecao"
                          checked={processoSelecionado?.requer_selecao === true}
                          disabled={!canEdit}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              handleUpdateRequerSelecao(true);
                              setNaoRequerSelecao(false);
                            }
                          }}
                        />
                        <label htmlFor="requer_selecao" className="text-sm font-medium cursor-pointer">
                          Requer Seleção de Fornecedores (Acima R$ 20.000,00)
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="nao_requer_selecao"
                          checked={processoSelecionado?.requer_selecao === false}
                          disabled={!canEdit}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              handleUpdateRequerSelecao(false);
                              setNaoRequerSelecao(true);
                            }
                          }}
                        />
                        <label htmlFor="nao_requer_selecao" className="text-sm font-medium cursor-pointer">
                          Não Requer Seleção de Fornecedores (Compra Direta)
                        </label>
                      </div>
                    </div>

                    {/* Botão para enviar ao responsável legal apenas se NÃO for responsável legal */}
                    {processoSelecionado?.requer_selecao === true && !isResponsavelLegal && (
                      <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                          Apenas Responsáveis Legais podem gerar Autorização de Seleção. Solicite ao Responsável Legal.
                        </p>
                        <Button
                          onClick={async () => {
                            if (!processoSelecionado || !cotacaoSelecionada) return;
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              if (!session) return;

                              // Buscar responsáveis legais
                              const { data: responsaveisLegais, error: rlError } = await supabase
                                .from("profiles")
                                .select("id, nome_completo")
                                .eq("responsavel_legal", true)
                                .eq("ativo", true);

                              if (rlError) throw rlError;

                              if (!responsaveisLegais || responsaveisLegais.length === 0) {
                                toast.error("Nenhum responsável legal encontrado no sistema");
                                return;
                              }

                              // Por enquanto, vamos enviar para o primeiro responsável legal encontrado
                              // Você pode adicionar um diálogo de seleção se houver múltiplos
                              const responsavelLegal = responsaveisLegais[0];

                              // Criar solicitação
                              const { error: solicitacaoError } = await supabase
                                .from("solicitacoes_autorizacao_selecao")
                                .insert({
                                  cotacao_id: cotacaoSelecionada.id,
                                  processo_numero: processoSelecionado.numero_processo_interno,
                                  solicitante_id: session.user.id,
                                  responsavel_legal_id: responsavelLegal.id,
                                  status: "pendente"
                                });

                              if (solicitacaoError) throw solicitacaoError;

                              toast.success(`Solicitação enviada para ${responsavelLegal.nome_completo}`);
                            } catch (error) {
                              console.error("Erro ao enviar solicitação:", error);
                              toast.error("Erro ao enviar solicitação");
                            }
                          }}
                          className="w-full"
                          variant="outline"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Solicitar Autorização ao Responsável Legal
                        </Button>
                      </div>
                    )}

                    {processoSelecionado?.requer_selecao === true && (
                      <div className="flex flex-col md:flex-row items-stretch md:items-end gap-4 pt-2">
                        <div className="flex-1">
                          <Label htmlFor="autorizacao-selecao-upload">
                            Autorização *
                          </Label>
                          <div className="space-y-2 mt-1">
                            {/* Se já existe autorização, mostra para todos visualizarem */}
                            {autorizacaoSelecaoUrl ? (
                              <div className="flex flex-col gap-2">
                                <div className="mb-2 p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                                  ✓ Autorização de Seleção gerada
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="secondary"
                                    onClick={async () => {
                                      try {
                                        window.open(autorizacaoSelecaoUrl, '_blank');
                                      } catch (error) {
                                        toast.error("Erro ao visualizar: Verifique se há bloqueadores de anúncios ativos no navegador");
                                      }
                                    }}
                                    className="flex-1"
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Visualizar
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    onClick={async () => {
                                      try {
                                        const response = await fetch(autorizacaoSelecaoUrl);
                                        const blob = await response.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `autorizacao-selecao-${processoSelecionado?.numero_processo_interno}.pdf`;
                                        link.click();
                                        window.URL.revokeObjectURL(url);
                                      } catch (error) {
                                        toast.error("Erro ao baixar: Verifique se há bloqueadores de anúncios ativos no navegador");
                                      }
                                    }}
                                    className="flex-1"
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Baixar
                                  </Button>
                                </div>
                                {/* Apenas Responsável Legal pode deletar */}
                                {isResponsavelLegal && autorizacaoSelecaoId && (
                                  <Button
                                    variant="destructive"
                                    onClick={() => deletarAutorizacao(autorizacaoSelecaoId, 'selecao_fornecedores')}
                                    size="sm"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Deletar Autorização
                                  </Button>
                                )}
                              </div>
                            ) : isResponsavelLegal ? (
                              <>
                                <div className="mb-2 p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                                  ✓ Você tem permissão para gerar Autorização
                                </div>
                                <Button
                                  onClick={async () => {
                                    if (!processoSelecionado || !cotacaoSelecionada) return;
                                    try {
                                      const result = await gerarAutorizacaoSelecao(
                                        processoSelecionado.numero_processo_interno,
                                        processoSelecionado.objeto_resumido,
                                        usuarioNome,
                                        usuarioCpf
                                      );
                                      setAutorizacaoSelecaoUrl(result.url);
                                      
                                      // Salvar autorização no banco
                                      const { data: { session } } = await supabase.auth.getSession();
                                      const { data: autorizacao, error: saveError } = await (supabase as any)
                                        .from("autorizacoes_processo")
                                        .insert({
                                          cotacao_id: cotacaoSelecionada.id,
                                          tipo_autorizacao: 'selecao_fornecedores',
                                          url_arquivo: result.url,
                                          nome_arquivo: result.fileName,
                                          protocolo: result.protocolo,
                                          usuario_gerador_id: session?.user.id
                                        })
                                        .select()
                                        .single();
                                      
                                      if (saveError) throw saveError;
                                      setAutorizacaoSelecaoId(autorizacao.id);

                                      // Registrar auditoria da CRIAÇÃO (com protocolo)
                                      try {
                                        await registrarAuditoria({
                                          acao: 'criação',
                                          entidade: 'Autorização de Processo',
                                          entidade_id: autorizacao.id,
                                          detalhes: {
                                            tipo: 'Autorização de Seleção de Fornecedores',
                                            tipo_autorizacao: 'selecao_fornecedores',
                                            protocolo: result.protocolo,
                                            nome_arquivo: result.fileName,
                                            numero_processo: processoSelecionado.numero_processo_interno,
                                            contrato_gestao: contratoSelecionado?.nome_contrato || '',
                                            titulo_cotacao: cotacaoSelecionada.titulo_cotacao,
                                          },
                                        });
                                      } catch (auditError) {
                                        console.warn('Erro ao registrar auditoria da criação da autorização (seleção):', auditError);
                                      }
                                      
                                      // Atualizar status da solicitação se existir
                                      const { error: updateError } = await supabase
                                        .from("solicitacoes_autorizacao_selecao")
                                        .update({
                                          status: "aprovada",
                                          data_resposta: new Date().toISOString()
                                        })
                                        .eq("cotacao_id", cotacaoSelecionada.id)
                                        .eq("status", "pendente");

                                      if (updateError) {
                                        console.error("Erro ao atualizar solicitação:", updateError);
                                      }
                                      
                                      toast.success("Autorização gerada e salva com sucesso");
                                    } catch (error) {
                                      console.error("Erro ao gerar autorização:", error);
                                      toast.error("Erro ao gerar autorização");
                                    }
                                  }}
                                  variant="default"
                                  className="w-full"
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Gerar Autorização de Seleção
                                </Button>
                              </>
                            ) : (
                              <div className="mt-1 p-3 bg-muted rounded-lg border border-dashed">
                                <p className="text-sm text-muted-foreground flex items-center">
                                  <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                                  Apenas Responsáveis Legais podem gerar Autorização de Seleção
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        {!isResponsavelLegal && (
                          <Button
                            onClick={() => setDialogCriarSelecaoOpen(true)}
                            disabled={itens.length === 0 || (!autorizacaoSelecaoUrl && !autorizacaoSelecaoAnexada)}
                            size="lg"
                            className="md:w-auto w-full"
                          >
                            Enviar para Seleção de Fornecedores
                          </Button>
                        )}
                      </div>
                    )}

                    {processoSelecionado?.requer_selecao === false && (
                      <div className="flex justify-end pt-2">
                        <Button 
                          onClick={() => setDialogFinalizarOpen(true)}
                          disabled={itens.length === 0}
                          size="lg"
                          className="md:w-auto w-full"
                        >
                          Verificar Documentação
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {criterioJulgamento === 'por_lote' && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Lotes</h3>
                      {!isResponsavelLegal && (
                        <Button size="sm" onClick={() => {
                          setLoteEditando(null);
                          setDialogLoteOpen(true);
                        }}>
                          <Plus className="h-4 w-4 mr-2" />
                          Novo Lote
                        </Button>
                      )}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Nº Lote</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-32 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lotes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              Nenhum lote criado. Crie lotes para organizar os itens.
                            </TableCell>
                          </TableRow>
                        ) : (
                          lotes.map((lote) => (
                            <TableRow key={lote.id}>
                              <TableCell>{lote.numero_lote}</TableCell>
                              <TableCell>{lote.descricao_lote}</TableCell>
                              <TableCell className="text-right">
                                {!isResponsavelLegal ? (
                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setLoteEditando(lote);
                                        setDialogLoteOpen(true);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteLote(lote.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                  {criterioJulgamento === 'por_lote' && lotes.length > 0 ? (
                  // Exibição por lote
                  <div className="space-y-6">
                    {loadingItens ? (
                      <div className="space-y-4">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-64 w-full" />
                      </div>
                    ) : (
                      lotes.map((lote) => {
                        const itensDoLote = itens.filter(item => item.lote_id === lote.id).sort((a, b) => a.numero_item - b.numero_item);
                        const totalLote = itensDoLote.reduce((acc, item) => acc + (item.quantidade * item.valor_unitario_estimado), 0);

                      return (
                        <div key={lote.id} className="border rounded-lg overflow-hidden">
                          <div className="bg-primary text-primary-foreground px-4 py-3 flex justify-between items-center">
                            <h3 className="font-semibold">
                              LOTE {lote.numero_lote} - {lote.descricao_lote}
                            </h3>
                            {!isResponsavelLegal && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setItemEditando(null);
                                  setLoteParaAdicionarItem(lote.id);
                                  setDialogItemOpen(true);
                                }}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Adicionar Item
                              </Button>
                            )}
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">
                                  <Checkbox
                                    checked={itensDoLote.length > 0 && itensDoLote.every(item => itensSelecionados.has(item.id))}
                                    onCheckedChange={(checked) => {
                                      const novaSelecao = new Set(itensSelecionados);
                                      itensDoLote.forEach(item => {
                                        if (checked) {
                                          novaSelecao.add(item.id);
                                        } else {
                                          novaSelecao.delete(item.id);
                                        }
                                      });
                                      setItensSelecionados(novaSelecao);
                                    }}
                                  />
                                </TableHead>
                                <TableHead className="w-20">Item</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="w-24">Qtd</TableHead>
                                <TableHead className="w-24">Unid.</TableHead>
                                {processoSelecionado?.tipo === "material" && <TableHead className="w-32">Marca</TableHead>}
                                {cotacaoSelecionada?.criterio_julgamento === "desconto" ? (
                                  <TableHead className="w-32 text-right">Desconto</TableHead>
                                ) : (
                                  <>
                                    <TableHead className="w-32 text-right">Vlr. Unit.</TableHead>
                                    <TableHead className="w-32 text-right">Vlr. Total</TableHead>
                                  </>
                                )}
                                {!isResponsavelLegal && <TableHead className="w-32 text-right">Ações</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {itensDoLote.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={processoSelecionado?.tipo === "material" ? 9 : 8} className="text-center text-muted-foreground">
                                    Nenhum item neste lote
                                  </TableCell>
                                </TableRow>
                               ) : (
                                 <>
                                   {itensDoLote.map((item) => (
                                     <TableRow key={item.id}>
                                       <TableCell>
                                         <Checkbox
                                           checked={itensSelecionados.has(item.id)}
                                           onCheckedChange={(checked) => {
                                             const novaSelecao = new Set(itensSelecionados);
                                             if (checked) {
                                               novaSelecao.add(item.id);
                                             } else {
                                               novaSelecao.delete(item.id);
                                             }
                                             setItensSelecionados(novaSelecao);
                                           }}
                                         />
                                       </TableCell>
                                       <TableCell>{item.numero_item}</TableCell>
                                       <TableCell>{item.descricao}</TableCell>
                                       <TableCell>{item.quantidade}</TableCell>
                                       <TableCell>{item.unidade}</TableCell>
                                       {processoSelecionado?.tipo === "material" && (
                                         <TableCell>{item.marca || "-"}</TableCell>
                                       )}
                                        {cotacaoSelecionada?.criterio_julgamento === "desconto" ? (
                                          <TableCell className="text-right">
                                            {item.valor_unitario_estimado && item.valor_unitario_estimado > 0
                                              ? `${item.valor_unitario_estimado.toFixed(2)}%`
                                              : "-"}
                                          </TableCell>
                                        ) : (
                                         <>
                                           <TableCell className="text-right">
                                             R$ {item.valor_unitario_estimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                           </TableCell>
                                           <TableCell className="text-right">
                                             R$ {(item.quantidade * item.valor_unitario_estimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                           </TableCell>
                                         </>
                                       )}
                                       {!isResponsavelLegal && (
                                         <TableCell className="text-right">
                                           <div className="flex gap-1 justify-end">
                                             <Button
                                               variant="ghost"
                                               size="sm"
                                               onClick={() => {
                                                  setItemEditando(item);
                                                  setDialogItemOpen(true);
                                              }}
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleDeleteItem(item.id)}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                       )}
                                    </TableRow>
                                  ))}
                                  <TableRow className="bg-muted/50">
                                    <TableCell></TableCell>
                                    <TableCell colSpan={processoSelecionado?.tipo === "material" ? 6 : 5} className="text-right font-semibold">
                                      TOTAL DO LOTE {lote.numero_lote}:
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-lg">
                                      R$ {totalLote.toLocaleString("pt-BR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </TableCell>
                                    <TableCell></TableCell>
                                  </TableRow>
                                </>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    }))}
                    <div className="bg-primary text-primary-foreground px-6 py-4 rounded-lg flex justify-between items-center">
                      <span className="text-lg font-semibold">TOTAL GERAL:</span>
                      <span className="text-2xl font-bold">
                        R$ {calcularTotal().toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                ) : (
                  // Exibição padrão (global ou por item)
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={itens.length > 0 && itens.every(item => itensSelecionados.has(item.id))}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setItensSelecionados(new Set(itens.map(item => item.id)));
                              } else {
                                setItensSelecionados(new Set());
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead className="w-20">Item</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24">Qtd</TableHead>
                        <TableHead className="w-24">Unid.</TableHead>
                        {processoSelecionado?.tipo === "material" && <TableHead className="w-32">Marca</TableHead>}
                        {cotacaoSelecionada?.criterio_julgamento === "desconto" ? (
                          <TableHead className="w-32 text-right">Desconto</TableHead>
                        ) : (
                          <>
                            <TableHead className="w-32 text-right">Vlr. Unit.</TableHead>
                            <TableHead className="w-32 text-right">Vlr. Total</TableHead>
                          </>
                        )}
                        {!isResponsavelLegal && <TableHead className="w-32 text-right">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                      <TableBody>
                        {loadingItens ? (
                          Array.from({ length: 5 }).map((_, idx) => (
                            <TableRow key={idx}>
                              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                              {processoSelecionado?.tipo === "material" && (
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                              )}
                              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            </TableRow>
                          ))
                        ) : itens.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={processoSelecionado?.tipo === "material" ? 9 : 8} className="text-center text-muted-foreground">
                            Nenhum item cadastrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {itens.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Checkbox
                                  checked={itensSelecionados.has(item.id)}
                                  onCheckedChange={(checked) => {
                                    const novaSelecao = new Set(itensSelecionados);
                                    if (checked) {
                                      novaSelecao.add(item.id);
                                    } else {
                                      novaSelecao.delete(item.id);
                                    }
                                    setItensSelecionados(novaSelecao);
                                  }}
                                />
                              </TableCell>
                              <TableCell>{item.numero_item}</TableCell>
                              <TableCell>{item.descricao}</TableCell>
                              <TableCell>{item.quantidade}</TableCell>
                              <TableCell>{item.unidade}</TableCell>
                              {processoSelecionado?.tipo === "material" && (
                                <TableCell>{item.marca || "-"}</TableCell>
                              )}
                               {cotacaoSelecionada?.criterio_julgamento === "desconto" ? (
                                 <TableCell className="text-right">
                                   {item.valor_unitario_estimado && item.valor_unitario_estimado > 0
                                     ? `${item.valor_unitario_estimado.toFixed(2)}%`
                                     : "-"}
                                 </TableCell>
                               ) : (
                                <>
                                  <TableCell className="text-right">
                                    R$ {item.valor_unitario_estimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    R$ {(item.quantidade * item.valor_unitario_estimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                </>
                              )}
                              {!isResponsavelLegal && (
                                <TableCell className="text-right">
                                  <div className="flex gap-1 justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setItemEditando(item);
                                        setDialogItemOpen(true);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteItem(item.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                          <TableRow className="font-bold bg-muted">
                            <TableCell></TableCell>
                            <TableCell colSpan={processoSelecionado?.tipo === "material" ? 6 : 5} className="text-right">TOTAL GERAL:</TableCell>
                            <TableCell className="text-right">
                              R$ {calcularTotal().toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Dialog Nova Cotação */}
      <Dialog open={dialogCotacaoOpen} onOpenChange={setDialogCotacaoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Cotação de Preços</DialogTitle>
            <DialogDescription>
              Crie uma nova cotação para o processo {processoSelecionado?.numero_processo_interno}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCotacao}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="titulo_cotacao">Título da Cotação *</Label>
                <Input
                  id="titulo_cotacao"
                  value={novaCotacao.titulo_cotacao}
                  onChange={(e) => setNovaCotacao({ ...novaCotacao, titulo_cotacao: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="descricao_cotacao">Descrição</Label>
                <Textarea
                  id="descricao_cotacao"
                  value={novaCotacao.descricao_cotacao}
                  onChange={(e) => setNovaCotacao({ ...novaCotacao, descricao_cotacao: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="data_limite_resposta">Data Limite para Resposta *</Label>
                <Input
                  id="data_limite_resposta"
                  type="datetime-local"
                  value={novaCotacao.data_limite_resposta}
                  onChange={(e) => setNovaCotacao({ ...novaCotacao, data_limite_resposta: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogCotacaoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingCotacao}>
                {savingCotacao ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Item Cotação */}
      <DialogItemCotacao
        open={dialogItemOpen}
        onOpenChange={(open) => {
          setDialogItemOpen(open);
          if (!open) setLoteParaAdicionarItem(null);
        }}
        item={itemEditando}
        numeroProximo={
          loteParaAdicionarItem
            ? (itens.filter(i => i.lote_id === loteParaAdicionarItem).length > 0
              ? Math.max(...itens.filter(i => i.lote_id === loteParaAdicionarItem).map(i => i.numero_item)) + 1
              : 1)
            : itens.length + 1
        }
        tipoProcesso={processoSelecionado?.tipo}
        lotes={processoSelecionado?.criterio_julgamento === "por_lote" ? lotes : undefined}
        lotePreSelecionado={loteParaAdicionarItem}
        onLoteChange={(loteId) => setLoteParaAdicionarItem(loteId)}
        onSave={handleSaveItem}
      />

      {/* Dialog Enviar Cotação */}
      {cotacaoSelecionada && processoSelecionado && (
        <DialogEnviarCotacao
          open={dialogEnviarOpen}
          onOpenChange={setDialogEnviarOpen}
          cotacaoId={cotacaoSelecionada.id}
          processoNumero={processoSelecionado.numero_processo_interno}
          tituloCotacao={cotacaoSelecionada.titulo_cotacao}
          dataLimite={cotacaoSelecionada.data_limite_resposta}
        />
      )}

      {/* Dialog Lote */}
      {cotacaoSelecionada && (
        <DialogLote
          open={dialogLoteOpen}
          onOpenChange={setDialogLoteOpen}
          lote={loteEditando}
          numeroProximo={lotes.length > 0 ? Math.max(...lotes.map(l => l.numero_lote)) + 1 : 1}
          onSave={handleSaveLote}
        />
      )}

      {/* Dialog Finalizar Processo */}
      {cotacaoSelecionada && (
        <DialogFinalizarProcesso
          open={dialogFinalizarOpen}
          onOpenChange={setDialogFinalizarOpen}
          cotacaoId={cotacaoSelecionada.id}
          canEdit={canEdit}
          onSuccess={() => {
            if (processoSelecionado) {
              loadCotacoes(processoSelecionado.id);
            }
          }}
        />
      )}

      {/* Dialog Criar Seleção */}
      {cotacaoSelecionada && processoSelecionado && (
        <DialogCriarSelecao
          open={dialogCriarSelecaoOpen}
          onOpenChange={setDialogCriarSelecaoOpen}
          cotacaoId={cotacaoSelecionada.id}
          processoId={processoSelecionado.id}
          processoNumero={processoSelecionado.numero_processo_interno}
          criterioJulgamento={processoSelecionado.criterio_julgamento || 'global'}
          onSuccess={() => {
            if (processoSelecionado) {
              loadCotacoes(processoSelecionado.id);
            }
          }}
        />
      )}


      {/* Dialog Importar Itens */}
      {cotacaoSelecionada && (
        <DialogImportarItens
          open={dialogImportarOpen}
          onOpenChange={setDialogImportarOpen}
          cotacaoId={cotacaoSelecionada.id}
          nomeContrato={contratoSelecionado?.nome_contrato}
          numeroProcesso={processoSelecionado?.numero_processo_interno}
          tituloCotacao={cotacaoSelecionada.titulo_cotacao}
          onImportSuccess={() => {
            if (cotacaoSelecionada) {
              loadItens(cotacaoSelecionada.id);
              loadLotes(cotacaoSelecionada.id);
              loadCotacoes(processoSelecionado!.id);
            }
          }}
        />
      )}

      {/* Dialog Confirmar Exclusão */}
      <AlertDialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Excluir Itens
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itensSelecionados.size > 0 ? (
                <>
                  Você tem <strong>{itensSelecionados.size} {itensSelecionados.size === 1 ? 'item selecionado' : 'itens selecionados'}</strong>.
                  <br /><br />
                  Escolha uma opção:
                </>
              ) : (
                <>
                  Tem certeza que deseja excluir <strong>TODOS os {itens.length} itens</strong> desta cotação?
                  {criterioJulgamento === 'por_lote' && lotes.length > 0 && (
                    <>
                      <br /><br />
                      Esta ação também excluirá <strong>todos os {lotes.length} lotes</strong> criados.
                    </>
                  )}
                  <br /><br />
                  <span className="text-destructive font-semibold">Esta ação não pode ser desfeita!</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {itensSelecionados.size > 0 ? (
              <>
                <AlertDialogAction 
                  onClick={() => {
                    handleDeleteSelectedItems();
                    setConfirmDeleteAllOpen(false);
                  }}
                  className="bg-orange-600 text-white hover:bg-orange-700"
                >
                  Excluir Selecionados ({itensSelecionados.size})
                </AlertDialogAction>
                <AlertDialogAction 
                  onClick={() => {
                    handleDeleteAllItems();
                    setConfirmDeleteAllOpen(false);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir Todos ({itens.length})
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction 
                onClick={handleDeleteAllItems}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir Todos os Itens
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmação de exclusão de cotação */}
      <AlertDialog open={confirmDeleteCotacaoOpen} onOpenChange={setConfirmDeleteCotacaoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Excluir Cotação
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div>
                Tem certeza que deseja excluir esta cotação?
                <br /><br />
                Esta ação excluirá:
                <ul className="list-disc list-inside mt-2 ml-2">
                  <li>Todos os itens da cotação</li>
                  <li>Todos os lotes (se houver)</li>
                  <li>Todas as respostas de fornecedores</li>
                  <li>Todos os anexos relacionados</li>
                </ul>
                <br />
                <span className="text-destructive font-semibold">Esta ação não pode ser desfeita!</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCotacaoParaExcluir(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCotacao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Cotação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de edição de cotação */}
      <Dialog open={dialogEditarCotacaoOpen} onOpenChange={(open) => {
        setDialogEditarCotacaoOpen(open);
        if (!open) {
          setCotacaoEditando(null);
          setCotacaoOriginal(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cotação</DialogTitle>
            <DialogDescription>
              Altere as informações da cotação
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-titulo">Título</Label>
              <Input
                id="edit-titulo"
                value={cotacaoEditando?.titulo_cotacao || ""}
                onChange={(e) => setCotacaoEditando(prev => prev ? {...prev, titulo_cotacao: e.target.value} : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-prazo">Prazo para Resposta (Horário de Brasília)</Label>
              <Input
                id="edit-prazo"
                type="datetime-local"
                value={cotacaoEditando?.data_limite_resposta ? (() => {
                  // Converter de UTC para Brasília (UTC-3) para exibição
                  const dataUTC = new Date(cotacaoEditando.data_limite_resposta);
                  const dataBrasilia = new Date(dataUTC.getTime() - (3 * 60 * 60 * 1000));
                  return dataBrasilia.toISOString().slice(0, 16);
                })() : ""}
                onChange={(e) => setCotacaoEditando(prev => prev ? {...prev, data_limite_resposta: e.target.value} : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDialogEditarCotacaoOpen(false);
              setCotacaoEditando(null);
              setCotacaoOriginal(null);
            }}>
              Cancelar
            </Button>
            <Button onClick={async () => {
              if (!cotacaoEditando) return;
              try {
                // Converter datetime-local para UTC (ISO)
                // datetime-local retorna "2025-12-03T19:00" - interpretar como Brasília (UTC-3)
                // 19:00 Brasília = 22:00 UTC
                const dataLocalStr = cotacaoEditando.data_limite_resposta;
                let dataISO: string;
                
                if (dataLocalStr.includes('T') && !dataLocalStr.includes('Z') && !dataLocalStr.includes('+') && !dataLocalStr.includes('-', 10)) {
                  // Formato datetime-local sem timezone - interpretar como Brasília e converter para UTC
                  const dataComOffset = new Date(dataLocalStr + ':00-03:00');
                  dataISO = dataComOffset.toISOString();
                } else {
                  dataISO = new Date(dataLocalStr).toISOString();
                }
                
                const { error } = await supabase
                  .from("cotacoes_precos")
                  .update({
                    titulo_cotacao: cotacaoEditando.titulo_cotacao,
                    data_limite_resposta: dataISO
                  })
                  .eq("id", cotacaoEditando.id);
                
                if (error) throw error;
                
                // Comparar alterações
                const alteracoes = cotacaoOriginal ? compararAlteracoes(
                  {
                    titulo_cotacao: cotacaoOriginal.titulo_cotacao,
                    data_limite_resposta: cotacaoOriginal.data_limite_resposta,
                  },
                  {
                    titulo_cotacao: cotacaoEditando.titulo_cotacao,
                    data_limite_resposta: dataISO,
                  }
                ) : [];
                
                // Registrar auditoria de edição de cotação
                await registrarAuditoria({
                  acao: 'edição',
                  entidade: 'cotacoes_precos',
                  entidade_id: cotacaoEditando.id,
                  detalhes: {
                    tipo: 'Cotação de Preços',
                    titulo_cotacao: cotacaoEditando.titulo_cotacao,
                    contrato_gestao: contratoSelecionado?.nome_contrato || 'N/A',
                    numero_processo: processoSelecionado?.numero_processo_interno || 'N/A',
                    alteracoes: alteracoes.length > 0 ? alteracoes : undefined,
                  },
                });
                
                // Atualizar lista de cotações
                setCotacoes(prev => prev.map(c => 
                  c.id === cotacaoEditando.id 
                    ? {...c, titulo_cotacao: cotacaoEditando.titulo_cotacao, data_limite_resposta: dataISO}
                    : c
                ));
                
                toast.success("Cotação atualizada com sucesso!");
                setDialogEditarCotacaoOpen(false);
                setCotacaoEditando(null);
                setCotacaoOriginal(null);
              } catch (error: any) {
                toast.error("Erro ao atualizar cotação: " + error.message);
              }
            }}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação para exclusão de lote */}
      <AlertDialog open={confirmDeleteLoteOpen} onOpenChange={setConfirmDeleteLoteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir este lote? Todos os itens vinculados a ele também serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLoteParaExcluir(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarDeleteLote}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmação para exclusão de item */}
      <AlertDialog open={confirmDeleteItemOpen} onOpenChange={setConfirmDeleteItemOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir este item?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemParaExcluir(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmação para exclusão de e-mail */}
      <AlertDialog open={confirmDeleteEmailOpen} onOpenChange={setConfirmDeleteEmailOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir este e-mail anexado?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEmailParaExcluir(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarDeleteEmail}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Cotacoes;
