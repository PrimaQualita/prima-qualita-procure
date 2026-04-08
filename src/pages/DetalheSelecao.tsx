import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, FileText, Upload, Send, Gavel, Link, ClipboardCheck, FileCheck, Eye, Trash2, SendHorizontal, RefreshCw, Download, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { DialogEnviarSelecao } from "@/components/selecoes/DialogEnviarSelecao";
import { DialogAnexarDocumentoSelecao } from "@/components/selecoes/DialogAnexarDocumentoSelecao";
import { DialogSessaoLances } from "@/components/selecoes/DialogSessaoLances";
import { DialogAnaliseDocumentalSelecao } from "@/components/selecoes/DialogAnaliseDocumentalSelecao";
import { DialogEnviarAtaAssinatura } from "@/components/selecoes/DialogEnviarAtaAssinatura";
import { gerarAtaSelecaoPDF, atualizarAtaComAssinaturas } from "@/lib/gerarAtaSelecaoPDF";
import { gerarHomologacaoSelecaoPDF } from "@/lib/gerarHomologacaoSelecaoPDF";
import { gerarProcessoCompletoSelecaoPDF } from "@/lib/gerarProcessoCompletoSelecaoPDF";
import { gerarEncaminhamentoContabilidadePDF, gerarProtocoloContabilidade } from "@/lib/gerarEncaminhamentoContabilidadePDF";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import { carregarFornecedoresVencedoresAtuaisSelecao } from "@/lib/selecaoVencedoresAtuais";
import { sincronizarProcessosParaContratarAposFinalizacao } from "@/lib/sincronizarProcessosParaContratar";

interface Item {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  lote_id?: string | null;
  marca?: string;
  valor_unitario_estimado: number;
  valor_total: number;
}

// Helper para converter número para numeral romano
const toRoman = (num: number): string => {
  const romanNumerals: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let result = '';
  for (const [value, symbol] of romanNumerals) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
};

// Formata protocolo (UUID ou string) para o padrão curto XXXX-XXXX-XXXX-XXXX
const formatarProtocoloCurto = (protocolo?: string | null): string => {
  if (!protocolo) return 'N/A';
  const limpo = protocolo.replace(/-/g, '').toUpperCase().substring(0, 16);
  if (limpo.length < 16) return protocolo;
  return `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
};

const DetalheSelecao = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selecaoId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);
const [itens, setItens] = useState<Item[]>([]);
  const [lotes, setLotes] = useState<{ id: string; numero_lote: number; descricao_lote: string; itens: Item[]; valor_total_lote: number }[]>([]);
  const [valorTotal, setValorTotal] = useState(0);
  const [dialogEnviarOpen, setDialogEnviarOpen] = useState(false);
  const [dialogAvisoOpen, setDialogAvisoOpen] = useState(false);
  const [dialogEditalOpen, setDialogEditalOpen] = useState(false);
  const [avisosAnexados, setAvisosAnexados] = useState<any[]>([]);
  const [editaisAnexados, setEditaisAnexados] = useState<any[]>([]);
  const [confirmDeleteAviso, setConfirmDeleteAviso] = useState(false);
  const [docParaExcluir, setDocParaExcluir] = useState<any>(null);
  const [confirmDeleteEdital, setConfirmDeleteEdital] = useState(false);
  const [dialogSessaoOpen, setDialogSessaoOpen] = useState(false);
  const [dialogAnaliseDocumentalOpen, setDialogAnaliseDocumentalOpen] = useState(false);
  const [gerandoAta, setGerandoAta] = useState(false);
  const [atasGeradas, setAtasGeradas] = useState<any[]>([]);
  const [confirmDeleteAta, setConfirmDeleteAta] = useState<string | null>(null);
  const [dialogEnviarAtaAssinaturaOpen, setDialogEnviarAtaAssinaturaOpen] = useState(false);
  const [ataParaEnviar, setAtaParaEnviar] = useState<string | null>(null);
  const [atualizandoPDF, setAtualizandoPDF] = useState<string | null>(null);
  const [forceReloadVencedores, setForceReloadVencedores] = useState(0);
  
  // Estados para Homologação
  const [gerandoHomologacao, setGerandoHomologacao] = useState(false);
  const [homologacoesGeradas, setHomologacoesGeradas] = useState<any[]>([]);
  const [confirmDeleteHomologacao, setConfirmDeleteHomologacao] = useState<string | null>(null);
  
  const [dialogResponsavelLegal, setDialogResponsavelLegal] = useState(false);
  const [responsaveisLegais, setResponsaveisLegais] = useState<any[]>([]);
  const [responsavelSelecionado, setResponsavelSelecionado] = useState<string>("");
  const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false);
  const [solicitacaoHomologacaoEnviada, setSolicitacaoHomologacaoEnviada] = useState(false);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);
  
  // RL pode APENAS visualizar + gerar/excluir homologação
  const canEditSelecao = !isResponsavelLegal;
  
  // Estado para Processo Completo
  const [gerandoProcessoCompleto, setGerandoProcessoCompleto] = useState(false);
  const [processoCompletoSalvo, setProcessoCompletoSalvo] = useState<any>(null);

  // Estados para Encaminhamento Contabilidade
  const [encaminhamentosContabilidade, setEncaminhamentosContabilidade] = useState<any[]>([]);
  const [gerandoEncaminhamentoContab, setGerandoEncaminhamentoContab] = useState(false);
  const [confirmDeleteEncContab, setConfirmDeleteEncContab] = useState<any>(null);

  useEffect(() => {
    if (selecaoId) {
      checkAuth();
      loadSelecao();
    }
  }, [selecaoId]);

  // Realtime subscription para atualizar atas quando assinaturas mudam
  useEffect(() => {
    if (!selecaoId) return;

    const regenerarPDFSeNecessario = async (payload: any) => {
      // Se uma assinatura foi atualizada para "aceito", regenerar o PDF
      if (payload.new?.status_assinatura === 'aceito' && payload.old?.status_assinatura !== 'aceito') {
        console.log('Nova assinatura detectada - regenerando PDF...');
        const ataId = payload.new.ata_id;
        if (ataId) {
          try {
            const { atualizarAtaComAssinaturas } = await import('@/lib/gerarAtaSelecaoPDF');
            await atualizarAtaComAssinaturas(ataId);
            console.log('PDF regenerado com sucesso!');
          } catch (error) {
            console.error('Erro ao regenerar PDF:', error);
          }
        }
      }
      loadAtasGeradas();
    };

    const channel = supabase
      .channel(`atas-selecao-${selecaoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atas_selecao',
          filter: `selecao_id=eq.${selecaoId}`
        },
        () => {
          console.log('Ata atualizada - recarregando...');
          loadAtasGeradas();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'atas_assinaturas_fornecedor'
        },
        (payload) => {
          console.log('Assinatura de fornecedor atualizada:', payload);
          regenerarPDFSeNecessario(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'atas_assinaturas_usuario'
        },
        (payload) => {
          console.log('Assinatura de usuário atualizada:', payload);
          regenerarPDFSeNecessario(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selecaoId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Verificar se usuário é responsável legal e outros perfis
    const { data: profile } = await supabase
      .from("profiles")
      .select("responsavel_legal, compliance, superintendente_executivo")
      .eq("id", session.user.id)
      .single();

    // Consultar user_roles para gestor/colaborador
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    const hasUserRole = userRoles?.some(r => ["gestor", "colaborador"].includes(r.role));
    const hasProfileEditRole = profile?.compliance || profile?.superintendente_executivo;

    if (profile) {
      const isRL = profile.responsavel_legal === true;
      // Só restringe se é APENAS RL (sem outros perfis com permissão de edição)
      const isOnlyRL = isRL && !hasProfileEditRole && !hasUserRole;
      setIsResponsavelLegal(isOnlyRL);
    } else {
      setIsResponsavelLegal(false);
    }
  };

  const loadSelecao = async () => {
    try {
      // Carregar seleção (incluindo contrato de gestão)
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*, contratos_gestao(nome_contrato))")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);

      // Carregar planilha consolidada da cotação relacionada usando a data de criação da seleção
      if (selecaoData.cotacao_relacionada_id) {
        await loadItensFromPlanilha(selecaoData.cotacao_relacionada_id, selecaoData.created_at);
      }

      // Carregar documentos anexados
      await loadDocumentosAnexados();

      // Carregar atas geradas
      await loadAtasGeradas();
      
      // Carregar homologações geradas
      await loadHomologacoesGeradas();
      
      // Carregar processo completo salvo
      await loadProcessoCompleto(selecaoData.processo_compra_id);
      
      // Carregar encaminhamentos contabilidade
      await loadEncaminhamentosContabilidade();

    } catch (error) {
      console.error("Erro ao carregar seleção:", error);
      toast.error("Erro ao carregar detalhes da seleção");
    } finally {
      setLoading(false);
    }
  };

  const loadItensFromPlanilha = async (cotacaoId: string, dataCriacaoSelecao: string) => {
    try {
      console.log("🔍 Buscando planilha para cotacao:", cotacaoId);

      // Buscar a planilha consolidada mais recente, os itens originais, lotes E o critério de julgamento da cotação
      const [planilhaResult, itensOriginaisResult, lotesResult, cotacaoResult] = await Promise.all([
        supabase
          .from("planilhas_consolidadas")
          .select("fornecedores_incluidos, estimativas_itens, data_geracao")
          .eq("cotacao_id", cotacaoId)
          .order("data_geracao", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("itens_cotacao")
          .select("*")
          .eq("cotacao_id", cotacaoId)
          .order("numero_item", { ascending: true }),
        supabase
          .from("lotes_cotacao")
          .select("*")
          .eq("cotacao_id", cotacaoId)
          .order("numero_lote", { ascending: true }),
        supabase
          .from("cotacoes_precos")
          .select("criterio_julgamento")
          .eq("id", cotacaoId)
          .single()
      ]);

      const { data: planilha, error: planilhaError } = planilhaResult;
      const { data: itensOriginais, error: itensError } = itensOriginaisResult;
      const { data: lotesData, error: lotesError } = lotesResult;
      const { data: cotacaoData, error: cotacaoError } = cotacaoResult;

      console.log("📊 Planilha encontrada:", planilha);
      console.log("📋 Itens originais:", itensOriginais);
      console.log("📦 Lotes encontrados:", lotesData);
      console.log("🎯 Critério de julgamento:", cotacaoData?.criterio_julgamento);

      if (planilhaError) throw planilhaError;
      if (itensError) throw itensError;
      if (lotesError) throw lotesError;
      if (cotacaoError) throw cotacaoError;

      if (!planilha) {
        console.warn("⚠️ Nenhuma planilha consolidada encontrada");
        toast.error("Nenhuma planilha consolidada encontrada");
        return;
      }

      if (!itensOriginais || itensOriginais.length === 0) {
        console.warn("⚠️ Nenhum item original encontrado");
        toast.error("Nenhum item encontrado na cotação");
        return;
      }

      // Criar mapa de itens originais por numero_item
      const mapaItens = new Map(
        itensOriginais.map(item => [item.numero_item, item])
      );

      // Extrair itens da planilha consolidada
      const fornecedoresArray = planilha.fornecedores_incluidos as any[];
      const estimativasItens = planilha.estimativas_itens as Record<string, number> | null;
      console.log("👥 Total de fornecedores:", fornecedoresArray?.length || 0);
      console.log("📊 Estimativas da planilha:", estimativasItens);

      if (!fornecedoresArray || fornecedoresArray.length === 0) {
        console.warn("⚠️ Planilha sem fornecedores");
        toast.error("Planilha consolidada sem dados");
        return;
      }

      // Para critério de desconto, buscar o MAIOR desconto de cada item
      // Para outros critérios, buscar o MENOR valor de cada item
      const isDesconto = cotacaoData?.criterio_julgamento === "desconto";
      const isPorLote = cotacaoData?.criterio_julgamento === "por_lote";
      const estimativasTemChaveComposta =
        !!estimativasItens && Object.keys(estimativasItens).some((k) => k.includes("_"));
      const isPlanilhaLoteLegacy = isPorLote && !!estimativasItens && !estimativasTemChaveComposta;

      if (isPlanilhaLoteLegacy) {
        toast.error("Planilha consolidada antiga detectada", {
          description:
            "Para critério por lote (média/mediana/menor por lote), gere a Planilha Consolidada novamente para atualizar as estimativas.",
        });
      }
      
      // Criar mapa de lote_id -> numero_lote para usar na chave composta
      const mapaLoteIdParaNumero = new Map<string, number>();
      if (lotesData) {
        lotesData.forEach((lote: any) => {
          mapaLoteIdParaNumero.set(lote.id, lote.numero_lote);
        });
      }
      
      // Usar os valores/descontos estimados para a seleção
      const todosItens: Item[] = [];
      let total = 0;

      itensOriginais.forEach((itemOriginal: any) => {
        let valorEstimado = 0;

        // Tentar usar estimativas_itens da planilha (fonte primária)
        if (estimativasItens) {
          if (isPorLote && itemOriginal.lote_id && estimativasTemChaveComposta) {
            // Para por_lote, usar chave composta numero_lote_numero_item
            const numeroLote = mapaLoteIdParaNumero.get(itemOriginal.lote_id);
            const chave = `${numeroLote}_${itemOriginal.numero_item}`;
            valorEstimado = Number(estimativasItens[chave] ?? 0);
            console.log(
              `   Item ${itemOriginal.numero_item} Lote ${numeroLote}: chave=${chave}, valor=${valorEstimado}`
            );
          } else if (!isPorLote) {
            // Para outros critérios, usar numero_item como chave
            valorEstimado = Number(estimativasItens[String(itemOriginal.numero_item)] ?? 0);
          }
        }

        // Fallback: se não encontrou estimativa, buscar menor valor dos fornecedores
        // (NÃO usar fallback em por_lote quando a planilha ainda está no formato antigo)
        if (valorEstimado === 0 && fornecedoresArray && !(isPorLote && !!estimativasItens && !estimativasTemChaveComposta)) {
          fornecedoresArray.forEach((fornecedor: any) => {
            if (fornecedor.itens) {
              const itemFornecedor = fornecedor.itens.find((i: any) => {
                if (isPorLote && itemOriginal.lote_id) {
                  return i.numero_item === itemOriginal.numero_item && i.lote_id === itemOriginal.lote_id;
                }
                return i.numero_item === itemOriginal.numero_item;
              });

              if (itemFornecedor) {
                const valorItem = isDesconto
                  ? (itemFornecedor.percentual_desconto || 0)
                  : (itemFornecedor.valor_unitario || 0);

                if (valorItem > 0) {
                  if (isDesconto) {
                    // Para desconto, queremos o MAIOR percentual
                    if (valorEstimado === 0 || valorItem > valorEstimado) {
                      valorEstimado = valorItem;
                    }
                  } else {
                    // Para valor, queremos o MENOR preço
                    if (valorEstimado === 0 || valorItem < valorEstimado) {
                      valorEstimado = valorItem;
                    }
                  }
                }
              }
            }
          });
        }

        // Para desconto, valor_total não é calculado (não faz sentido)
        const valorTotalItem = isDesconto ? 0 : (valorEstimado * itemOriginal.quantidade);

        todosItens.push({
          id: itemOriginal.id,
          numero_item: itemOriginal.numero_item,
          descricao: itemOriginal.descricao,
          quantidade: itemOriginal.quantidade,
          unidade: itemOriginal.unidade,
          lote_id: itemOriginal.lote_id ?? null,
          marca: itemOriginal.marca,
          valor_unitario_estimado: valorEstimado,
          valor_total: valorTotalItem
        });

        total += valorTotalItem;
      });

      console.log("📦 Total de itens carregados:", todosItens.length);
      console.log("💰 Valor total:", total);

      setItens(todosItens);
      setValorTotal(total);

      // Carregar lotes se critério for por_lote
      if (cotacaoData?.criterio_julgamento === "por_lote" && lotesData && lotesData.length > 0) {
        const lotesFormatados = lotesData.map((lote: any) => {
          const itensDoLote = todosItens.filter((item) => item.lote_id === lote.id);

          const valorTotalLote = itensDoLote.reduce((acc, item) => acc + item.valor_total, 0);

          return {
            id: lote.id,
            numero_lote: lote.numero_lote,
            descricao_lote: lote.descricao_lote,
            itens: itensDoLote,
            valor_total_lote: valorTotalLote
          };
        });

        console.log("📦 Lotes formatados:", lotesFormatados);
        setLotes(lotesFormatados);
      }
    } catch (error) {
      console.error("❌ Erro ao carregar itens:", error);
      toast.error("Erro ao carregar itens");
    }
  };

  // Carregar processo completo salvo
  const loadProcessoCompleto = async (processoId: string) => {
    try {
      const { data, error } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", processoId)
        .eq("tipo_anexo", "PROCESSO_COMPLETO_SELECAO")
        .order("data_upload", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setProcessoCompletoSalvo(data);
    } catch (error) {
      console.error("Erro ao carregar processo completo:", error);
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
        const avisos = data.filter(d => d.tipo_documento === "aviso");
        const editais = data.filter(d => d.tipo_documento === "edital");
        
        setAvisosAnexados(avisos);
        setEditaisAnexados(editais);
      }
    } catch (error) {
      console.error("Erro ao carregar documentos:", error);
    }
  };

  const loadAtasGeradas = async () => {
    try {
      const { data, error } = await supabase
        .from("atas_selecao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .order("data_geracao", { ascending: false });

      if (error) throw error;
      setAtasGeradas(data || []);
    } catch (error) {
      console.error("Erro ao carregar atas:", error);
    }
  };

  const handleDeleteAta = async (ataId: string) => {
    try {
      const ata = atasGeradas.find(a => a.id === ataId);
      if (ata) {
        // Deletar do storage
        const storagePath = `atas-selecao/${selecaoId}/${ata.nome_arquivo}`;
        await supabase.storage.from("processo-anexos").remove([storagePath]);
      }

      // Deletar do banco
      const { error } = await supabase
        .from("atas_selecao")
        .delete()
        .eq("id", ataId);

      if (error) throw error;

      // Registrar auditoria da exclusão
      try {
        await registrarAuditoria({
          acao: 'exclusão',
          entidade: 'Ata de Seleção',
          entidade_id: ataId,
          detalhes: {
            protocolo: formatarProtocoloCurto(ata?.protocolo),
            nome_arquivo: ata?.nome_arquivo || 'N/A',
            numero_selecao: selecao?.numero_selecao || 'N/A',
            numero_processo: processo?.numero_processo_interno || '',
             contrato_gestao: processo?.contratos_gestao?.nome_contrato || '',
             titulo_selecao: selecao?.titulo_selecao || 'N/A',
          },
        });
      } catch (auditError) {
        console.warn('Erro ao registrar auditoria da exclusão de ata:', auditError);
      }

      toast.success("Ata excluída com sucesso!");
      await loadAtasGeradas();
    } catch (error) {
      console.error("Erro ao excluir ata:", error);
      toast.error("Erro ao excluir ata");
    } finally {
      setConfirmDeleteAta(null);
    }
  };

  const handleAbrirEnviarAtaAssinatura = (ataId: string) => {
    setAtaParaEnviar(ataId);
    setDialogEnviarAtaAssinaturaOpen(true);
  };

  // ========== FUNÇÕES DE HOMOLOGAÇÃO ==========
  const loadHomologacoesGeradas = async () => {
    try {
      const { data, error } = await supabase
        .from("homologacoes_selecao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .order("data_geracao", { ascending: false });

      if (error) throw error;
      setHomologacoesGeradas(data || []);
    } catch (error) {
      console.error("Erro ao carregar homologações:", error);
    }
  };

  // ========== FUNÇÕES DE ENCAMINHAMENTO CONTABILIDADE ==========
  const loadEncaminhamentosContabilidade = async () => {
    if (!selecaoId) return;
    try {
      const { data, error } = await supabase
        .from("encaminhamentos_contabilidade")
        .select("*")
        .eq("selecao_id", selecaoId)
        .order("data_geracao", { ascending: false });

      if (error) throw error;
      setEncaminhamentosContabilidade(data || []);
    } catch (error) {
      console.error("Erro ao carregar encaminhamentos contabilidade:", error);
    }
  };

  const buscarVencedoresSelecao = async (): Promise<{ razaoSocial: string; cnpj: string }[]> => {
    if (!selecaoId || !processo) return [];
    
    try {
      // Usar helper centralizado que considera lances E propostas como fallback
      const vencedoresIds = await carregarFornecedoresVencedoresAtuaisSelecao(selecaoId);
      
      if (vencedoresIds.size === 0) return [];
      
      // Buscar dados dos fornecedores vencedores
      const { data: fornecedores, error } = await supabase
        .from("fornecedores")
        .select("id, razao_social, cnpj")
        .in("id", Array.from(vencedoresIds));
      
      if (error || !fornecedores) return [];
      
      return fornecedores.map((f: any) => ({
        razaoSocial: f.razao_social,
        cnpj: f.cnpj || ""
      }));
    } catch (err) {
      console.error("Erro ao buscar vencedores:", err);
      return [];
    }
  };

  const gerarEncaminhamentoContabilidade = async () => {
    if (!selecaoId || !processo) return;
    
    setGerandoEncaminhamentoContab(true);
    try {
      // Buscar dados do usuário
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user?.id)
        .single();

      // Buscar fornecedores vencedores
      const fornecedoresVencedores = await buscarVencedoresSelecao();
      
      if (fornecedoresVencedores.length === 0) {
        toast.error("Nenhum fornecedor vencedor encontrado");
        return;
      }

      const protocolo = gerarProtocoloContabilidade();
      const resultado = await gerarEncaminhamentoContabilidadePDF({
        numeroProcesso: processo.numero_processo_interno,
        objetoProcesso: processo.objeto_resumido,
        fornecedoresVencedores,
        usuarioNome: profile?.nome_completo || "Usuário",
        protocolo
      });

      // Salvar no banco
      const { error: insertError } = await supabase
        .from("encaminhamentos_contabilidade")
        .insert({
          selecao_id: selecaoId,
          processo_numero: processo.numero_processo_interno,
          objeto_processo: processo.objeto_resumido,
          fornecedores_vencedores: fornecedoresVencedores,
          protocolo,
          url_arquivo: resultado.url,
          nome_arquivo: resultado.fileName,
          storage_path: resultado.storagePath,
          usuario_gerador_id: user?.id,
          usuario_gerador_nome: profile?.nome_completo || "Usuário"
        });

      if (insertError) throw insertError;

      // Registrar auditoria da criação
      try {
        await registrarAuditoria({
          acao: 'criação',
          entidade: 'Encaminhamento Contabilidade (Seleção)',
          detalhes: {
            protocolo,
            nome_arquivo: resultado.fileName,
            numero_selecao: selecao?.numero_selecao || 'N/A',
            numero_processo: processo.numero_processo_interno,
            fornecedores_vencedores: fornecedoresVencedores.map(f => f.razaoSocial).join(', '),
          },
        });
      } catch (auditError) {
        console.warn('Erro ao registrar auditoria de encaminhamento contabilidade:', auditError);
      }

      toast.success("Encaminhamento para Contabilidade gerado!");
      await loadEncaminhamentosContabilidade();
    } catch (error: any) {
      console.error("Erro ao gerar encaminhamento:", error);
      toast.error("Erro ao gerar encaminhamento");
    } finally {
      setGerandoEncaminhamentoContab(false);
    }
  };

  const enviarParaContabilidade = async (encaminhamentoId: string) => {
    try {
      const { error } = await supabase
        .from("encaminhamentos_contabilidade")
        .update({
          enviado_contabilidade: true,
          data_envio_contabilidade: new Date().toISOString()
        })
        .eq("id", encaminhamentoId);

      if (error) throw error;

      toast.success("Enviado à Contabilidade!");
      await loadEncaminhamentosContabilidade();
    } catch (error) {
      console.error("Erro ao enviar:", error);
      toast.error("Erro ao enviar");
    }
  };

  const deletarEncaminhamentoContabilidade = async () => {
    if (!confirmDeleteEncContab) return;
    try {
      // Deletar arquivo do storage
      let filePath = confirmDeleteEncContab.storage_path || confirmDeleteEncContab.url_arquivo;
      if (filePath.includes("https://")) {
        const urlParts = filePath.split("/processo-anexos/");
        filePath = urlParts[1] || filePath;
      }
      await supabase.storage.from("processo-anexos").remove([filePath]);

      // Deletar resposta se existir
      if (confirmDeleteEncContab.url_resposta_pdf || confirmDeleteEncContab.storage_path_resposta) {
        let respostaPath = confirmDeleteEncContab.storage_path_resposta || confirmDeleteEncContab.url_resposta_pdf;
        if (respostaPath.includes("https://")) {
          const urlParts = respostaPath.split("/processo-anexos/");
          respostaPath = urlParts[1] || respostaPath;
        }
        await supabase.storage.from("processo-anexos").remove([respostaPath]);
      }

      // Deletar registro do banco
      await supabase.from("encaminhamentos_contabilidade").delete().eq("id", confirmDeleteEncContab.id);

      // Registrar auditoria da exclusão
      try {
        await registrarAuditoria({
          acao: 'exclusão',
          entidade: 'Encaminhamento Contabilidade (Seleção)',
          entidade_id: confirmDeleteEncContab.id,
          detalhes: {
            protocolo: confirmDeleteEncContab.protocolo || 'N/A',
            nome_arquivo: confirmDeleteEncContab.nome_arquivo || 'N/A',
            numero_selecao: selecao?.numero_selecao || 'N/A',
            numero_processo: processo?.numero_processo_interno || '',
          },
        });
      } catch (auditError) {
        console.warn('Erro ao registrar auditoria da exclusão de encaminhamento:', auditError);
      }
      
      toast.success("Encaminhamento excluído");
      setConfirmDeleteEncContab(null);
      await loadEncaminhamentosContabilidade();
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir");
    }
  };

  const loadResponsaveisLegais = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .eq("responsavel_legal", true)
        .eq("ativo", true)
        .order("nome_completo");

      if (error) throw error;
      setResponsaveisLegais(data || []);
    } catch (error) {
      console.error("Erro ao carregar responsáveis legais:", error);
      toast.error("Erro ao carregar responsáveis legais");
    }
  };

  const solicitarHomologacao = async () => {
    await loadResponsaveisLegais();
    setDialogResponsavelLegal(true);
  };

  const confirmarSolicitacaoHomologacao = async () => {
    if (!responsavelSelecionado) {
      toast.error("Selecione um responsável legal");
      return;
    }

    setEnviandoSolicitacao(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("solicitacoes_homologacao_selecao")
        .insert({
          selecao_id: selecaoId,
          responsavel_legal_id: responsavelSelecionado,
          solicitante_id: userData.user?.id,
        });

      if (error) throw error;

      toast.success("Solicitação enviada ao Responsável Legal com sucesso!");
      setSolicitacaoHomologacaoEnviada(true);
      setDialogResponsavelLegal(false);
      setResponsavelSelecionado("");
    } catch (error) {
      console.error("Erro ao enviar solicitação:", error);
      toast.error("Erro ao enviar solicitação");
    } finally {
      setEnviandoSolicitacao(false);
    }
  };

  const handleDeleteHomologacao = async (homologacaoId: string) => {
    try {
      const homologacao = homologacoesGeradas.find(h => h.id === homologacaoId);
      if (homologacao) {
        // Deletar do storage
        const storagePath = `homologacoes-selecao/${selecaoId}/${homologacao.nome_arquivo}`;
        await supabase.storage.from("processo-anexos").remove([storagePath]);
      }

      // Deletar do banco
      const { error } = await supabase
        .from("homologacoes_selecao")
        .delete()
        .eq("id", homologacaoId);

      if (error) throw error;

      // Registrar auditoria da exclusão
      try {
        const contratoGestao = processo?.contratos_gestao?.nome_contrato || '';
        await registrarAuditoria({
          acao: 'exclusão',
          entidade: 'Homologação Seleção',
          entidade_id: homologacaoId,
          detalhes: {
            protocolo: formatarProtocoloCurto(homologacao?.protocolo),
            nome_arquivo: homologacao?.nome_arquivo || 'N/A',
            numero_selecao: selecao?.numero_selecao || 'N/A',
            numero_processo: processo?.numero_processo_interno || '',
            contrato_gestao: contratoGestao,
          },
        });
      } catch (auditError) {
        console.warn('Erro ao registrar auditoria da exclusão de homologação:', auditError);
      }

      toast.success("Homologação excluída com sucesso!");
      await loadHomologacoesGeradas();
    } catch (error) {
      console.error("Erro ao excluir homologação:", error);
      toast.error("Erro ao excluir homologação");
    } finally {
      setConfirmDeleteHomologacao(null);
    }
  };

  const handleGerarProcessoCompleto = async () => {
    try {
      setGerandoProcessoCompleto(true);
      
      // Gerar o PDF (não temporário - salvar no storage)
      const result = await gerarProcessoCompletoSelecaoPDF(
        selecaoId!,
        selecao?.numero_selecao || "S/N",
        false // temporário = false para salvar no storage
      );
      
      // Salvar como anexo do processo de compra
      const { data: { session } } = await supabase.auth.getSession();
      const { error: anexoError } = await supabase
        .from("anexos_processo_compra")
        .insert({
          processo_compra_id: processo.id,
          tipo_anexo: "PROCESSO_COMPLETO_SELECAO",
          nome_arquivo: result.filename,
          url_arquivo: result.url,
          usuario_upload_id: session?.user.id,
          data_upload: new Date().toISOString()
        });

      if (anexoError) {
        console.error("Erro ao salvar processo completo:", anexoError);
        throw anexoError;
      }

      // Calcular valor total dos itens vencedores
      let valorTotalFechamento = 0;
      if (processo?.criterio_julgamento !== "desconto") {
        itens.forEach(item => {
          valorTotalFechamento += item.valor_total || 0;
        });
      }

      // Atualizar status do processo para concluído
      const { error: statusError } = await supabase
        .from("processos_compras")
        .update({ 
          status_processo: "concluido",
          valor_total_cotacao: valorTotalFechamento
        })
        .eq("id", processo.id);

      if (statusError) {
        console.error("Erro ao atualizar status do processo:", statusError);
      }

      // Atualizar status da seleção para encerrada
      const { error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .update({ 
          status_selecao: "encerrada"
        })
        .eq("id", selecaoId);

      if (selecaoError) {
        console.error("Erro ao atualizar status da seleção:", selecaoError);
      }

      // === CRIAR AUTOMATICAMENTE registro em processos_para_contratar (um por fornecedor vencedor) ===
      try {
        const criterioJulgamento = processo.criterio_julgamento || 'por_item';
        const isDesconto = criterioJulgamento === 'desconto' || criterioJulgamento === 'maior_percentual_desconto';
        const objetoLimpo = processo.objeto_resumido ? processo.objeto_resumido.replace(/<[^>]*>/g, '').trim() : null;
        const tipoProcesso = "Seleção de Fornecedores";

        // Buscar lances da seleção com dados do fornecedor
        const { data: lancesAll } = await supabase
          .from("lances_fornecedores")
          .select("fornecedor_id, numero_item, valor_lance, fornecedores!inner(id, razao_social, cnpj)")
          .eq("selecao_id", selecaoId!);

        // Buscar inabilitações ativas
        const { data: inabilitados } = await supabase
          .from("fornecedores_inabilitados_selecao")
          .select("fornecedor_id, itens_afetados")
          .eq("selecao_id", selecaoId!)
          .eq("revertido", false);

        const inabPorItem = new Map<string, Set<number>>();
        (inabilitados || []).forEach((inab: any) => {
          if (!inabPorItem.has(inab.fornecedor_id)) inabPorItem.set(inab.fornecedor_id, new Set());
          if (Array.isArray(inab.itens_afetados)) {
            inab.itens_afetados.forEach((n: number) => inabPorItem.get(inab.fornecedor_id)!.add(n));
          }
        });
        const estaInab = (fid: string, num: number) => inabPorItem.get(fid)?.has(num) || false;

        // Filtrar lances excluindo Banco de Preços e inabilitados
        const lancesValidos = (lancesAll || []).filter((l: any) => {
          const forn = l.fornecedores as any;
          if (forn?.cnpj === '' || (forn?.razao_social || '').toLowerCase().includes('banco de preços')) return false;
          return !estaInab(l.fornecedor_id, l.numero_item);
        });

        // Calcular vencedores com valores
        const valoresPorFornecedor = new Map<string, { nome: string; id: string; valorTotal: number }>();

        if (criterioJulgamento === 'global') {
          const lancesGlobal = lancesValidos.filter((l: any) => l.numero_item === 0);
          if (lancesGlobal.length > 0) {
            const sorted = lancesGlobal.sort((a: any, b: any) => isDesconto ? b.valor_lance - a.valor_lance : a.valor_lance - b.valor_lance);
            const v = sorted[0];
            const forn = v.fornecedores as any;
            valoresPorFornecedor.set(v.fornecedor_id, { nome: forn.razao_social, id: forn.id, valorTotal: isDesconto ? 0 : v.valor_lance });
          }
        } else if (criterioJulgamento === 'por_lote') {
          const loteMap = new Map<number, any[]>();
          lancesValidos.forEach((l: any) => {
            if (!loteMap.has(l.numero_item)) loteMap.set(l.numero_item, []);
            loteMap.get(l.numero_item)!.push(l);
          });
          loteMap.forEach((lancesLote) => {
            const sorted = lancesLote.sort((a: any, b: any) => isDesconto ? b.valor_lance - a.valor_lance : a.valor_lance - b.valor_lance);
            const v = sorted[0];
            if (v?.fornecedores) {
              const forn = v.fornecedores as any;
              if (!valoresPorFornecedor.has(v.fornecedor_id)) {
                valoresPorFornecedor.set(v.fornecedor_id, { nome: forn.razao_social, id: forn.id, valorTotal: 0 });
              }
              if (!isDesconto) valoresPorFornecedor.get(v.fornecedor_id)!.valorTotal += v.valor_lance;
            }
          });
        } else {
          // por_item
          const itemMap = new Map<number, any[]>();
          lancesValidos.forEach((l: any) => {
            if (!itemMap.has(l.numero_item)) itemMap.set(l.numero_item, []);
            itemMap.get(l.numero_item)!.push(l);
          });
          itemMap.forEach((lancesItem) => {
            const sorted = lancesItem.sort((a: any, b: any) => isDesconto ? b.valor_lance - a.valor_lance : a.valor_lance - b.valor_lance);
            const v = sorted[0];
            if (v?.fornecedores) {
              const forn = v.fornecedores as any;
              if (!valoresPorFornecedor.has(v.fornecedor_id)) {
                valoresPorFornecedor.set(v.fornecedor_id, { nome: forn.razao_social, id: forn.id, valorTotal: 0 });
              }
              if (!isDesconto) valoresPorFornecedor.get(v.fornecedor_id)!.valorTotal += v.valor_lance;
            }
          });
        }

        console.log(`🏆 Vencedores finais para processos_para_contratar (seleção):`);
        valoresPorFornecedor.forEach((v) => console.log(`  → ${v.nome}: R$ ${v.valorTotal.toFixed(2)}`));

        const vencedoresParaContratar = Array.from(valoresPorFornecedor.values()).map((dados) => ({
          fornecedorId: dados.id,
          fornecedorNome: dados.nome,
          valorAprovado: dados.valorTotal,
        }));

        const {
          fornecedoresIgnoradosPorContrato,
          registrosSincronizados,
          registroGenericoSincronizado,
        } = await sincronizarProcessosParaContratarAposFinalizacao({
          processoCompraId: processo.id,
          contratoGestaoId: processo.contrato_gestao_id,
          numeroProcesso: processo.numero_processo_interno,
          tipoProcesso,
          dataFinalizacaoIso: new Date().toISOString(),
          objeto: objetoLimpo,
          contaGerencial: processo.centro_custo || null,
          urlDossie: result.url,
          valorGenerico: valorTotalFechamento,
          vencedores: vencedoresParaContratar,
        });

        if (registrosSincronizados > 0) {
          console.log(`✅ ${registrosSincronizados} registro(s) em processos_para_contratar sincronizado(s) automaticamente (seleção)`);
        }

        if (registroGenericoSincronizado && vencedoresParaContratar.length === 0) {
          console.log("✅ Registro genérico em processos_para_contratar sincronizado (seleção)");
        }

        if (fornecedoresIgnoradosPorContrato > 0) {
          console.log(`⚠️ ${fornecedoresIgnoradosPorContrato} fornecedor(es) ignorado(s) (já possuem contrato formalizado)`);
        }
      } catch (ppcError: any) {
        console.error("❌ ERRO ao criar registro em processos_para_contratar (seleção):", ppcError);
        console.error("❌ Detalhes do erro:", JSON.stringify(ppcError));
      }

      // Recarregar dados
      await loadProcessoCompleto(processo.id);
      await loadSelecao();
      
      toast.success("Processo finalizado com sucesso! O PDF está disponível acima dos documentos.");
    } catch (error) {
      console.error("Erro ao gerar processo completo:", error);
      toast.error("Erro ao finalizar processo");
    } finally {
      setGerandoProcessoCompleto(false);
    }
  };

  const handleAtualizarPDFAta = async (ataId: string) => {
    setAtualizandoPDF(ataId);
    try {
      await atualizarAtaComAssinaturas(ataId);
      toast.success("PDF da ata atualizado com as assinaturas!");
      await loadAtasGeradas();
    } catch (error) {
      console.error("Erro ao atualizar PDF:", error);
      toast.error("Erro ao atualizar PDF: " + (error as Error).message);
    } finally {
      setAtualizandoPDF(null);
    }
  };

  const handleEnviarFornecedores = () => {
    setDialogEnviarOpen(true);
  };

  const handleVoltar = () => {
    // Voltar para a visualização de seleções do processo
    if (selecao?.processo_compra_id) {
      navigate(`/selecoes?processo=${selecao.processo_compra_id}`);
    } else {
      navigate(-1);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const handleFinalizarSessao = async () => {
    if (!selecaoId) return;

    try {
      const { error } = await supabase
        .from("selecoes_fornecedores")
        .update({ sessao_finalizada: true })
        .eq("id", selecaoId);

      if (error) throw error;

      toast.success("Sessão de lances finalizada! Análise Documental disponível.");
      
      // Recarregar dados da seleção
      await loadSelecao();
    } catch (error) {
      console.error("Erro ao finalizar sessão:", error);
      toast.error("Erro ao finalizar sessão de lances");
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!selecao) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Seleção não encontrada</h2>
          <Button onClick={() => navigate("/selecoes")}>Voltar para Seleções</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              {selecao.numero_selecao && (
                <Badge variant="outline" className="text-lg font-semibold px-3 py-1">
                  {selecao.numero_selecao}
                </Badge>
              )}
              <h1 className="text-3xl font-bold">{selecao.titulo_selecao}</h1>
            </div>
            <p className="text-muted-foreground mt-1">
              Processo: {processo?.numero_processo_interno}
            </p>
          </div>
          <Button variant="outline" onClick={handleVoltar}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
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
                <Badge variant={selecao.status_selecao === "planejada" ? "default" : "secondary"}>
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

        {/* Processo Completo Salvo */}
        {processoCompletoSalvo && (
          <Card className="mb-6 border-green-500 bg-green-50/50">
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2 text-green-700">
                <FileCheck className="h-5 w-5" />
                Processo Finalizado
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    Processo Completo - Seleção {selecao?.numero_selecao || processoCompletoSalvo.nome_arquivo?.match(/selecao_(\d+\/\d+)/)?.[1] || "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Finalizado em: {new Date(processoCompletoSalvo.data_upload).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(processoCompletoSalvo.url_arquivo, "_blank")}
                    title="Visualizar"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = processoCompletoSalvo.url_arquivo;
                      link.download = processoCompletoSalvo.nome_arquivo;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Documentos */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Documentos da Seleção</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Aviso de Seleção */}
              <div>
                {canEditSelecao && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setDialogAvisoOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {avisosAnexados.length > 0 ? "Adicionar Aviso de Seleção" : "Anexar Aviso de Seleção"}
                  </Button>
                )}
                {avisosAnexados.map((aviso) => (
                  <div key={aviso.id} className="flex gap-2 mt-2">
                    <p className="text-sm text-green-600 flex-1 truncate" title={aviso.nome_arquivo}>✓ {aviso.nome_arquivo || 'Aviso anexado'}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(aviso.url_arquivo, '_blank')}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Visualizar
                    </Button>
                    {canEditSelecao && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => { setDocParaExcluir(aviso); setConfirmDeleteAviso(true); }}
                      >
                        Excluir
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Edital */}
              <div>
                {canEditSelecao && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setDialogEditalOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {editaisAnexados.length > 0 ? "Adicionar Edital" : "Anexar Edital"}
                  </Button>
                )}
                {editaisAnexados.map((edital) => (
                  <div key={edital.id} className="flex gap-2 mt-2">
                    <p className="text-sm text-green-600 flex-1 truncate" title={edital.nome_arquivo}>✓ {edital.nome_arquivo || 'Edital anexado'}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(edital.url_arquivo, '_blank')}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Visualizar
                    </Button>
                    {canEditSelecao && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => { setDocParaExcluir(edital); setConfirmDeleteEdital(true); }}
                      >
                        Excluir
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Gerar Link para Fornecedores */}
              {canEditSelecao && (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={handleEnviarFornecedores}
                >
                  <Link className="h-4 w-4 mr-2" />
                  Gerar Link para Fornecedores
                </Button>
              )}

              {/* Ver Propostas */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/propostas-selecao?selecao=${selecaoId}`)}
              >
                <FileText className="h-4 w-4 mr-2" />
                Ver Propostas
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Botão de Sessão de Lances */}
        <div className="mb-6 space-y-3">
          <Button
            variant={canEditSelecao ? "default" : "outline"}
            size="lg"
            className="w-full"
            onClick={() => setDialogSessaoOpen(true)}
          >
            <Gavel className="h-5 w-5 mr-2" />
            {canEditSelecao ? "Abrir Sessão de Lances (Controle + Chat + Sistema de Lances)" : "Visualizar Sessão de Lances"}
          </Button>
          
          {/* Análise Documental - só disponível após finalizar sessão */}
          {canEditSelecao && selecao.sessao_finalizada && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setDialogAnaliseDocumentalOpen(true)}
            >
              <ClipboardCheck className="h-5 w-5 mr-2" />
              Análise Documental
            </Button>
          )}
          
          {/* Gerar Ata */}
          {canEditSelecao && (
            <Button
              variant="default"
              size="lg"
              className="w-full"
              disabled={gerandoAta}
              onClick={async () => {
                setGerandoAta(true);
                try {
                  const resultado = await gerarAtaSelecaoPDF(selecaoId!);
                  toast.success("Ata gerada com sucesso!");
                  await loadAtasGeradas();
                } catch (error) {
                  console.error("Erro ao gerar ata:", error);
                  toast.error("Erro ao gerar Ata");
                } finally {
                  setGerandoAta(false);
                }
              }}
            >
              <FileCheck className="h-5 w-5 mr-2" />
              {gerandoAta ? "Gerando..." : "Gerar Ata"}
            </Button>
          )}

          {/* Atas Geradas */}
          {atasGeradas.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Atas Geradas</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-2">
                {atasGeradas.map((ata, index) => {
                  // Ordem cronológica: primeiro criado = I, segundo = II, etc.
                  // Como atasGeradas está ordenado DESC (mais recente primeiro), invertemos o cálculo
                  const numeroOrdem = atasGeradas.length - index; // 1 para o mais antigo, N para o mais recente
                  return (
                    <div key={ata.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          Ata de Seleção - {selecao?.numero_selecao || "N/A"}{numeroOrdem > 1 ? ` ${toRoman(numeroOrdem)}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Gerada em: {new Date(ata.data_geracao).toLocaleString("pt-BR")}
                          {ata.enviada_fornecedores && (
                            <span className="ml-2 text-green-600">• Enviada aos fornecedores</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(ata.url_arquivo, "_blank")}
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEditSelecao && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setConfirmDeleteAta(ata.id)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {canEditSelecao && ata.enviada_fornecedores && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAtualizarPDFAta(ata.id)}
                            disabled={atualizandoPDF === ata.id}
                            title="Atualizar PDF com Assinaturas"
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${atualizandoPDF === ata.id ? 'animate-spin' : ''}`} />
                            {atualizandoPDF === ata.id ? "Atualizando..." : "Atualizar PDF"}
                          </Button>
                        )}
                        {canEditSelecao && !ata.enviada_fornecedores && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAbrirEnviarAtaAssinatura(ata.id)}
                            title="Enviar para Assinatura"
                          >
                            <SendHorizontal className="h-4 w-4 mr-1" />
                            Enviar para Assinatura
                          </Button>
                        )}
                        {canEditSelecao && ata.enviada_fornecedores && (
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={solicitarHomologacao}
                              disabled={solicitacaoHomologacaoEnviada}
                              title="Solicitar Homologação"
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Enviar ao Responsável Legal
                            </Button>
                            {solicitacaoHomologacaoEnviada && (
                              <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 mt-1">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Solicitação Enviada
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ver Propostas Realinhadas */}
          <Button
            variant="outline"
            size="lg"
            className="w-full mt-4"
            onClick={() => navigate(`/propostas-selecao?selecao=${selecaoId}&tipo=realinhadas`)}
          >
            <Eye className="h-5 w-5 mr-2" />
            Ver Propostas Realinhadas
          </Button>

          {/* Encaminhamento para Contabilidade */}
          {atasGeradas.some(ata => ata.enviada_fornecedores) && (
            <Card className="mt-4">
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Encaminhamento para Contabilidade
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-3">
                  {/* Botão Gerar */}
                  {canEditSelecao && (
                    <Button
                      onClick={gerarEncaminhamentoContabilidade}
                      disabled={gerandoEncaminhamentoContab}
                      className="w-full"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {gerandoEncaminhamentoContab ? "Gerando..." : "Gerar Encaminhamento para Contabilidade"}
                    </Button>
                  )}

                  {/* Lista de Encaminhamentos */}
                  {encaminhamentosContabilidade.length > 0 && (
                    <div className="flex flex-col gap-2 mt-2">
                      {encaminhamentosContabilidade.map((enc) => (
                        <div key={enc.id} className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                            <div className="flex-1">
                              <p className="font-medium text-sm">Protocolo: {enc.protocolo}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(enc.data_geracao).toLocaleString("pt-BR")}
                              </p>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {enc.enviado_contabilidade && (
                                  <Badge variant="default">Enviado à Contabilidade</Badge>
                                )}
                                {enc.respondido_contabilidade && (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    Respondido
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  try {
                                    let filePath = enc.storage_path || enc.url_arquivo;
                                    if (filePath.includes("https://")) {
                                      const urlParts = filePath.split("/processo-anexos/");
                                      filePath = urlParts[1] || filePath;
                                    }
                                    const { abrirDocumentoStorage } = await import('@/lib/abrirDocumentoStorage');
                                    await abrirDocumentoStorage(filePath, enc.nome_arquivo || 'Encaminhamento');
                                  } catch (error) {
                                    console.error("Erro:", error);
                                    toast.error("Erro ao visualizar");
                                  }
                                }}
                                title="Ver Encaminhamento"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  try {
                                    let filePath = enc.storage_path || enc.url_arquivo;
                                    if (filePath.includes("https://")) {
                                      const urlParts = filePath.split("/processo-anexos/");
                                      filePath = urlParts[1] || filePath;
                                    }
                                    const { data, error } = await supabase.storage
                                      .from("processo-anexos")
                                      .download(filePath);
                                    if (error) throw error;
                                    if (data) {
                                      const url = URL.createObjectURL(data);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      a.download = enc.nome_arquivo;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      URL.revokeObjectURL(url);
                                    }
                                  } catch (error) {
                                    console.error("Erro:", error);
                                    toast.error("Erro ao baixar");
                                  }
                                }}
                                title="Baixar"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {canEditSelecao && !enc.enviado_contabilidade && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => enviarParaContabilidade(enc.id)}
                                  title="Enviar à Contabilidade"
                                >
                                  <Send className="h-4 w-4 mr-1" />
                                  Enviar
                                </Button>
                              )}
                              {canEditSelecao && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setConfirmDeleteEncContab(enc)}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Resposta da Contabilidade */}
                          {enc.respondido_contabilidade && enc.url_resposta_pdf && (
                            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md ml-4">
                              <div className="flex-1 text-sm">
                                <div className="font-medium text-green-700">📄 Resposta da Contabilidade</div>
                                <div className="text-green-600 text-xs">
                                  Protocolo: {enc.protocolo_resposta}
                                </div>
                                {enc.data_resposta_contabilidade && (
                                  <div className="text-green-600 text-xs">
                                    {new Date(enc.data_resposta_contabilidade).toLocaleString("pt-BR")}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    let filePath = enc.storage_path_resposta || enc.url_resposta_pdf;
                                    if (filePath.includes("https://")) {
                                      const urlParts = filePath.split("/processo-anexos/");
                                      filePath = urlParts[1] || filePath;
                                    }
                                    const { abrirDocumentoStorage } = await import("@/lib/abrirDocumentoStorage");
                                    await abrirDocumentoStorage(filePath, "Resposta_Contabilidade.pdf");
                                  } catch (error) {
                                    console.error("Erro:", error);
                                    toast.error("Erro ao visualizar resposta");
                                  }
                                }}
                                className="border-green-300 hover:bg-green-100"
                                title="Ver Resposta"
                              >
                                <Eye className="h-4 w-4 text-green-700" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    let filePath = enc.storage_path_resposta || enc.url_resposta_pdf;
                                    if (filePath.includes("https://")) {
                                      const urlParts = filePath.split("/processo-anexos/");
                                      filePath = urlParts[1] || filePath;
                                    }
                                    const { data, error } = await supabase.storage
                                      .from("processo-anexos")
                                      .download(filePath);
                                    if (error) throw error;
                                    if (data) {
                                      const url = URL.createObjectURL(data);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      a.download = `resposta_contabilidade_${enc.protocolo_resposta}.pdf`;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      URL.revokeObjectURL(url);
                                    }
                                  } catch (error) {
                                    console.error("Erro:", error);
                                    toast.error("Erro ao baixar resposta");
                                  }
                                }}
                                className="border-green-300 hover:bg-green-100"
                                title="Baixar Resposta"
                              >
                                <Download className="h-4 w-4 text-green-700" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gerar Homologação - APENAS para Responsável Legal */}
          {(() => {
            console.log("🎨 RENDER - isResponsavelLegal:", isResponsavelLegal);
            return isResponsavelLegal;
          })() ? (
            <Button
              variant="default"
              size="lg"
              className="w-full mt-4"
              disabled={gerandoHomologacao}
              onClick={async () => {
                setGerandoHomologacao(true);
                try {
                  await gerarHomologacaoSelecaoPDF(selecaoId!, false);
                  toast.success("Homologação gerada com sucesso!");
                  await loadHomologacoesGeradas();
                } catch (error) {
                  console.error("Erro ao gerar homologação:", error);
                  toast.error("Erro ao gerar Homologação");
                } finally {
                  setGerandoHomologacao(false);
                }
              }}
            >
              <FileCheck className="h-5 w-5 mr-2" />
              {gerandoHomologacao ? "Gerando..." : "Gerar Homologação"}
            </Button>
          ) : (
            <div className="mt-4 p-4 bg-muted rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground text-center">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Apenas Responsáveis Legais podem gerar Homologação
              </p>
            </div>
          )}

          {/* Homologações Geradas */}
          {homologacoesGeradas.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Homologações Geradas</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-2">
                {homologacoesGeradas.map((homologacao, index) => (
                    <div key={homologacao.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          Homologação - Seleção {selecao?.numero_selecao || "N/A"}{index > 0 ? ` ${toRoman(index + 1)}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Gerada em: {new Date(homologacao.data_geracao).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(homologacao.url_arquivo, "_blank")}
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isResponsavelLegal && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmDeleteHomologacao(homologacao.id)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Botão Finalizar Processo */}
                {canEditSelecao && (
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      onClick={handleGerarProcessoCompleto}
                      disabled={gerandoProcessoCompleto}
                      className="w-full"
                      size="lg"
                    >
                      <Download className="h-5 w-5 mr-2" />
                      {gerandoProcessoCompleto ? "Gerando Processo Completo..." : "Finalizar Processo (Download Completo)"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Itens da Cotação */}
        <Card>
          <CardHeader>
            <CardTitle>Itens da Seleção (Planilha Consolidada)</CardTitle>
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
                  {processo?.criterio_julgamento === "desconto" ? (
                    <TableHead className="text-right">Desconto</TableHead>
                  ) : (
                    <>
                      <TableHead className="text-right">Vlr. Unit.</TableHead>
                      <TableHead className="text-right">Vlr. Total</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nenhum item encontrado
                    </TableCell>
                  </TableRow>
                ) : processo?.criterio_julgamento === "por_lote" && lotes.length > 0 ? (
                  /* Renderização agrupada por lotes */
                  <>
                    {lotes.map((lote) => (
                      <>
                        {/* Linha de título do lote */}
                        <TableRow key={`lote-${lote.id}`} className="bg-muted/50">
                          <TableCell 
                            colSpan={processo?.tipo === "material" ? 7 : 6} 
                            className="font-bold text-primary"
                          >
                            Lote {lote.numero_lote}: {lote.descricao_lote}
                          </TableCell>
                        </TableRow>
                        {/* Itens do lote */}
                        {lote.itens.map((item) => (
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
                        {/* Subtotal do lote */}
                        <TableRow className="bg-muted/30 border-b-2">
                          <TableCell 
                            colSpan={processo?.tipo === "material" ? 6 : 5} 
                            className="text-right font-semibold"
                          >
                            Subtotal Lote {lote.numero_lote}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(lote.valor_total_lote)}
                          </TableCell>
                        </TableRow>
                      </>
                    ))}
                    {/* Valor Total Geral */}
                    <TableRow className="bg-muted font-bold">
                      <TableCell colSpan={processo?.tipo === "material" ? 6 : 5} className="text-right">
                        VALOR TOTAL GERAL
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(valorTotal)}</TableCell>
                    </TableRow>
                  </>
                ) : (
                  /* Renderização padrão (outros critérios) */
                  <>
                    {itens.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell>{item.quantidade}</TableCell>
                        <TableCell>{item.unidade}</TableCell>
                        {processo?.tipo === "material" && <TableCell>{item.marca || "-"}</TableCell>}
                        {processo?.criterio_julgamento === "desconto" ? (
                          <TableCell className="text-right font-medium">
                            {item.valor_unitario_estimado && item.valor_unitario_estimado > 0
                              ? `${item.valor_unitario_estimado.toFixed(2)}%`
                              : "-"}
                          </TableCell>
                        ) : (
                          <>
                            <TableCell className="text-right">{formatCurrency(item.valor_unitario_estimado)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(item.valor_total)}</TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                    {processo?.criterio_julgamento !== "desconto" && (
                      <TableRow className="bg-muted font-bold">
                        <TableCell colSpan={processo?.tipo === "material" ? 6 : 5} className="text-right">
                          VALOR TOTAL GERAL
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(valorTotal)}</TableCell>
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <DialogEnviarSelecao
        open={dialogEnviarOpen}
        onOpenChange={setDialogEnviarOpen}
        selecaoId={selecaoId!}
        tituloSelecao={selecao.titulo_selecao}
        dataDisputa={selecao.data_sessao_disputa}
        horaDisputa={selecao.hora_sessao_disputa}
      />

      <DialogSessaoLances
        open={dialogSessaoOpen}
        onOpenChange={setDialogSessaoOpen}
        selecaoId={selecaoId!}
        itens={itens}
        lotes={lotes}
        criterioJulgamento={selecao?.criterios_julgamento || processo?.criterio_julgamento || "Menor Preço Global"}
        numeroSelecao={selecao?.numero_selecao}
        sessaoFinalizada={selecao?.sessao_finalizada || false}
        onFinalizarSessao={handleFinalizarSessao}
        onVencedoresAtualizados={() => {
          console.log("📢 [DETALHE] Vencedores atualizados! Forçando reload...");
          setForceReloadVencedores(prev => prev + 1);
        }}
        readOnly={isResponsavelLegal}
      />

      <DialogAnaliseDocumentalSelecao
        open={dialogAnaliseDocumentalOpen}
        onOpenChange={setDialogAnaliseDocumentalOpen}
        selecaoId={selecaoId!}
        forceReload={forceReloadVencedores}
        onReabrirNegociacao={async (itensParaReabrir, fornecedorId) => {
          try {
            // Reabrir os itens para lances
            for (const item of itensParaReabrir) {
              // Verificar se já existe registro do item
              const { data: existing } = await supabase
                .from("itens_abertos_lances")
                .select("id")
                .eq("selecao_id", selecaoId!)
                .eq("numero_item", item)
                .maybeSingle();

              const TEMPO_NEGOCIACAO = 120;
              const agora = new Date().toISOString();

              if (existing) {
                // Atualizar item existente para reabrir + iniciar cronômetro de fechamento automático
                await supabase
                  .from("itens_abertos_lances")
                  .update({
                    aberto: true,
                    em_negociacao: true,
                    fornecedor_negociacao_id: fornecedorId || null,
                    data_abertura: agora,
                    data_fechamento: null,
                    iniciando_fechamento: true,
                    data_inicio_fechamento: agora,
                    segundos_para_fechar: TEMPO_NEGOCIACAO,
                  })
                  .eq("id", existing.id);
              } else {
                // Criar novo registro
                await supabase
                  .from("itens_abertos_lances")
                  .insert({
                    selecao_id: selecaoId!,
                    numero_item: item,
                    aberto: true,
                    em_negociacao: true,
                    fornecedor_negociacao_id: fornecedorId || null,
                    iniciando_fechamento: true,
                    data_inicio_fechamento: agora,
                    segundos_para_fechar: TEMPO_NEGOCIACAO,
                  });
              }
            }

            toast.success(`Itens ${itensParaReabrir.join(", ")} reabertos para negociação!`);
            
            // Abrir a sessão de lances
            setDialogSessaoOpen(true);
          } catch (error) {
            console.error("Erro ao reabrir negociação:", error);
            toast.error("Erro ao reabrir itens para negociação");
          }
        }}
      />

      <DialogAnexarDocumentoSelecao
        open={dialogAvisoOpen}
        onOpenChange={setDialogAvisoOpen}
        selecaoId={selecaoId!}
        tipoDocumento="aviso"
        titulo="Anexar Aviso de Seleção"
        onSuccess={() => {
          loadDocumentosAnexados();
          setDialogAvisoOpen(false);
        }}
      />

      <DialogAnexarDocumentoSelecao
        open={dialogEditalOpen}
        onOpenChange={setDialogEditalOpen}
        selecaoId={selecaoId!}
        tipoDocumento="edital"
        titulo="Anexar Edital"
        onSuccess={() => {
          loadDocumentosAnexados();
          setDialogEditalOpen(false);
        }}
      />

      {/* Confirmação de exclusão de Aviso */}
      <AlertDialog open={confirmDeleteAviso} onOpenChange={(v) => { setConfirmDeleteAviso(v); if (!v) setDocParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este Aviso de Seleção? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!docParaExcluir) return;
                try {
                  let storagePath = docParaExcluir.url_arquivo;
                  if (storagePath.includes('https://')) {
                    const urlParts = storagePath.split('/processo-anexos/');
                    storagePath = urlParts[1] || storagePath;
                    storagePath = storagePath.split('?')[0];
                  }
                  await supabase.storage.from('processo-anexos').remove([storagePath]);
                  const { error } = await supabase.from("anexos_selecao").delete().eq("id", docParaExcluir.id);
                  if (error) throw error;
                  try {
                    await registrarAuditoria({
                      acao: 'exclusão',
                      entidade: 'Anexo de Seleção',
                      entidade_id: docParaExcluir.id,
                      detalhes: {
                        tipo_documento: 'Aviso de Seleção',
                        nome_arquivo: docParaExcluir.nome_arquivo || 'N/A',
                        numero_selecao: selecao?.numero_selecao || 'N/A',
                        numero_processo: processo?.numero_processo_interno || '',
                        contrato_gestao: processo?.contratos_gestao?.nome_contrato || '',
                      },
                    });
                  } catch (auditError) {
                    console.warn('Erro ao registrar auditoria:', auditError);
                  }
                  toast.success("Documento excluído com sucesso");
                  loadDocumentosAnexados();
                } catch (error) {
                  console.error("Erro ao excluir documento:", error);
                  toast.error("Erro ao excluir documento");
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão de Edital */}
      <AlertDialog open={confirmDeleteEdital} onOpenChange={setConfirmDeleteEdital}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o Edital? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  // 1. Extrair caminho do storage
                  let storagePath = editalAnexado.url_arquivo;
                  if (storagePath.includes('https://')) {
                    const urlParts = storagePath.split('/processo-anexos/');
                    storagePath = urlParts[1] || storagePath;
                    // Remover query strings
                    storagePath = storagePath.split('?')[0];
                  }
                  
                  // 2. Deletar arquivo do storage
                  await supabase.storage.from('processo-anexos').remove([storagePath]);
                  
                  // 3. Deletar registro do banco
                  const { error } = await supabase
                    .from("anexos_selecao")
                    .delete()
                    .eq("id", editalAnexado.id);
                  
                  if (error) throw error;

                  // 4. Registrar auditoria
                  try {
                    await registrarAuditoria({
                      acao: 'exclusão',
                      entidade: 'Anexo de Seleção',
                      entidade_id: editalAnexado.id,
                      detalhes: {
                        tipo_documento: 'Edital',
                        nome_arquivo: editalAnexado.nome_arquivo || 'N/A',
                        numero_selecao: selecao?.numero_selecao || 'N/A',
                        numero_processo: processo?.numero_processo_interno || '',
                        contrato_gestao: processo?.contratos_gestao?.nome_contrato || '',
                      },
                    });
                  } catch (auditError) {
                    console.warn('Erro ao registrar auditoria da exclusão de edital:', auditError);
                  }
                  
                  toast.success("Documento excluído com sucesso");
                  loadDocumentosAnexados();
                } catch (error) {
                  console.error("Erro ao excluir documento:", error);
                  toast.error("Erro ao excluir documento");
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão de Ata */}
      <AlertDialog open={!!confirmDeleteAta} onOpenChange={(open) => !open && setConfirmDeleteAta(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta Ata? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteAta && handleDeleteAta(confirmDeleteAta)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão de Homologação */}
      <AlertDialog open={!!confirmDeleteHomologacao} onOpenChange={(open) => !open && setConfirmDeleteHomologacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta Homologação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteHomologacao && handleDeleteHomologacao(confirmDeleteHomologacao)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para enviar ata para assinatura */}
      {ataParaEnviar && (
        <DialogEnviarAtaAssinatura
          open={dialogEnviarAtaAssinaturaOpen}
          onOpenChange={(open) => {
            setDialogEnviarAtaAssinaturaOpen(open);
            if (!open) setAtaParaEnviar(null);
          }}
          ataId={ataParaEnviar}
          selecaoId={selecaoId!}
          onSuccess={loadAtasGeradas}
        />
      )}

      {/* Dialog para selecionar responsável legal para homologação */}
      <AlertDialog open={dialogResponsavelLegal} onOpenChange={setDialogResponsavelLegal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar para Assinatura</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione o Responsável Legal que deve assinar esta Homologação:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={responsavelSelecionado} onValueChange={setResponsavelSelecionado}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um Responsável Legal" />
              </SelectTrigger>
              <SelectContent>
                {responsaveisLegais.map((responsavel) => (
                  <SelectItem key={responsavel.id} value={responsavel.id}>
                    {responsavel.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDialogResponsavelLegal(false);
              setResponsavelSelecionado("");
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarSolicitacaoHomologacao}
              disabled={!responsavelSelecionado || enviandoSolicitacao}
            >
              {enviandoSolicitacao ? "Enviando..." : "Enviar Solicitação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* Confirmação de exclusão de Encaminhamento Contabilidade */}
      <AlertDialog open={!!confirmDeleteEncContab} onOpenChange={(open) => !open && setConfirmDeleteEncContab(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este encaminhamento para contabilidade?
              {confirmDeleteEncContab?.protocolo && (
                <span className="block mt-2 font-medium">Protocolo: {confirmDeleteEncContab.protocolo}</span>
              )}
              {confirmDeleteEncContab?.respondido_contabilidade && (
                <span className="block mt-2 text-amber-600">⚠️ A resposta da contabilidade também será excluída.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteEncContab(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deletarEncaminhamentoContabilidade} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DetalheSelecao;
