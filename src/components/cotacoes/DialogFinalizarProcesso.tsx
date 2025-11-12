import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ExternalLink, FileText, CheckCircle, AlertCircle, Download, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { gerarAutorizacaoCompraDireta } from "@/lib/gerarAutorizacaoPDF";

interface FornecedorVencedor {
  razaoSocial: string;
  cnpj: string;
  itensVencedores: Array<{ numero: number; valor: number }>;
  valorTotal: number;
}

interface CampoDocumento {
  id?: string;
  nome_campo: string;
  descricao: string;
  obrigatorio: boolean;
  ordem: number;
  status_solicitacao?: string;
  data_solicitacao?: string;
  data_conclusao?: string;
  data_aprovacao?: string;
  documentos_finalizacao_fornecedor?: DocumentoFinalizacao[];
}

interface DocumentoFinalizacao {
  id: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_upload: string;
}

interface Fornecedor {
  id: string;
  razao_social: string;
}

interface DocumentoExistente {
  id: string;
  tipo_documento: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_validade: string | null;
  em_vigor: boolean;
}

interface FornecedorData {
  fornecedor: Fornecedor;
  documentosExistentes: DocumentoExistente[];
  itensVencedores: any[];
  campos: CampoDocumento[];
  todosDocumentosAprovados: boolean;
}

interface DialogFinalizarProcessoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  onSuccess: () => void;
}

export function DialogFinalizarProcesso({
  open,
  onOpenChange,
  cotacaoId,
  onSuccess,
}: DialogFinalizarProcessoProps) {
  const [loading, setLoading] = useState(false);
  const [fornecedoresData, setFornecedoresData] = useState<FornecedorData[]>([]);
  const [fornecedorExpandido, setFornecedorExpandido] = useState<string | null>(null);
  const [novoCampo, setNovoCampo] = useState<{nome: string; descricao: string; obrigatorio: boolean}>({
    nome: "",
    descricao: "",
    obrigatorio: true
  });
  const [dataLimiteDocumentos, setDataLimiteDocumentos] = useState<string>("");
  const [documentosAprovados, setDocumentosAprovados] = useState<Record<string, boolean>>({});
  const [autorizacaoDiretaUrl, setAutorizacaoDiretaUrl] = useState<string>("");
  const [autorizacaoDiretaId, setAutorizacaoDiretaId] = useState<string>("");
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);

  useEffect(() => {
    if (open) {
      console.log("📂 Dialog aberto, carregando todos os fornecedores vencedores");
      loadAllFornecedores();
      loadDocumentosAprovados();
      loadAutorizacoes();
      checkResponsavelLegal();
    }
  }, [open, cotacaoId]);

  const loadAllFornecedores = async () => {
    setLoading(true);
    try {
      // Buscar cotação com critério de julgamento
      const { data: cotacao, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("criterio_julgamento")
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;

      // Buscar respostas dos fornecedores
      const { data: respostas, error: respostasError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          fornecedor_id,
          valor_total_anual_ofertado,
          fornecedores!inner(id, razao_social)
        `)
        .eq("cotacao_id", cotacaoId);

      if (respostasError) throw respostasError;

      if (!respostas || respostas.length === 0) {
        setFornecedoresData([]);
        setLoading(false);
        return;
      }

      // Buscar itens das respostas
      const { data: itens, error: itensError } = await supabase
        .from("respostas_itens_fornecedor")
        .select(`
          id,
          cotacao_resposta_fornecedor_id,
          item_cotacao_id,
          valor_unitario_ofertado,
          itens_cotacao!inner(numero_item, descricao, lote_id, quantidade, unidade)
        `)
        .in("cotacao_resposta_fornecedor_id", respostas.map(r => r.id));

      if (itensError) throw itensError;

      const criterio = cotacao?.criterio_julgamento || "global";
      const fornecedoresVencedores = await identificarVencedores(criterio, respostas, itens || []);

      // Carregar dados de cada fornecedor vencedor
      const fornecedoresComDados = await Promise.all(
        fornecedoresVencedores.map(async (forn) => {
          const [docs, itensVenc, campos] = await Promise.all([
            loadDocumentosFornecedor(forn.id),
            loadItensVencedores(forn.id, criterio, respostas, itens || []),
            loadCamposFornecedor(forn.id)
          ]);

          const todosAprovados = verificarTodosDocumentosAprovados(forn.id, docs, campos);

          return {
            fornecedor: forn,
            documentosExistentes: docs,
            itensVencedores: itensVenc,
            campos: campos,
            todosDocumentosAprovados: todosAprovados
          };
        })
      );

      setFornecedoresData(fornecedoresComDados);
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
      toast.error("Erro ao carregar fornecedores vencedores");
    } finally {
      setLoading(false);
    }
  };

  const identificarVencedores = async (criterio: string, respostas: any[], itens: any[]): Promise<Fornecedor[]> => {
    const fornecedoresVencedores = new Set<string>();

    if (criterio === "global") {
      if (respostas.length > 0) {
        const menorValor = Math.min(...respostas.map(r => Number(r.valor_total_anual_ofertado)));
        const vencedor = respostas.find(r => Number(r.valor_total_anual_ofertado) === menorValor);
        if (vencedor) fornecedoresVencedores.add(vencedor.fornecedor_id);
      }
    } else if (criterio === "item" || criterio === "por_item") {
      if (itens.length > 0) {
        const itensPorNumero: Record<number, any[]> = {};
        itens.forEach(item => {
          const numItem = item.itens_cotacao.numero_item;
          if (!itensPorNumero[numItem]) itensPorNumero[numItem] = [];
          itensPorNumero[numItem].push(item);
        });

        Object.values(itensPorNumero).forEach(itensDoNumero => {
          if (itensDoNumero.length > 0) {
            const menorValor = Math.min(...itensDoNumero.map(i => Number(i.valor_unitario_ofertado)));
            const vencedor = itensDoNumero.find(i => Number(i.valor_unitario_ofertado) === menorValor);
            if (vencedor) {
              const resposta = respostas.find(r => r.id === vencedor.cotacao_resposta_fornecedor_id);
              if (resposta) fornecedoresVencedores.add(resposta.fornecedor_id);
            }
          }
        });
      }
    } else if (criterio === "lote" || criterio === "por_lote") {
      if (itens.length > 0) {
        const itensPorLote: Record<string, Record<string, any[]>> = {};
        itens.forEach(item => {
          const loteId = item.itens_cotacao.lote_id;
          if (!loteId) return;
          if (!itensPorLote[loteId]) itensPorLote[loteId] = {};
          const respostaId = item.cotacao_resposta_fornecedor_id;
          if (!itensPorLote[loteId][respostaId]) itensPorLote[loteId][respostaId] = [];
          itensPorLote[loteId][respostaId].push(item);
        });

        Object.values(itensPorLote).forEach(respostasPorLote => {
          const totaisPorResposta = Object.entries(respostasPorLote).map(([respostaId, itensLote]) => {
            const total = itensLote.reduce((sum, item) => {
              return sum + (Number(item.valor_unitario_ofertado) * Number(item.itens_cotacao.quantidade));
            }, 0);
            return { respostaId, total };
          });

          if (totaisPorResposta.length > 0) {
            const menorTotal = Math.min(...totaisPorResposta.map(r => r.total));
            const vencedor = totaisPorResposta.find(r => r.total === menorTotal);
            if (vencedor) {
              const resposta = respostas.find(r => r.id === vencedor.respostaId);
              if (resposta) fornecedoresVencedores.add(resposta.fornecedor_id);
            }
          }
        });
      }
    }

    return Array.from(fornecedoresVencedores)
      .map(fornecedorId => {
        const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
        return resposta ? {
          id: fornecedorId,
          razao_social: resposta.fornecedores.razao_social
        } : null;
      })
      .filter((f): f is Fornecedor => f !== null)
      .sort((a, b) => a.razao_social.localeCompare(b.razao_social));
  };

  const loadDocumentosFornecedor = async (fornecedorId: string): Promise<DocumentoExistente[]> => {
    const tiposDocumentos = [
      "Contrato Social",
      "CNPJ",
      "Inscrição Municipal ou Estadual",
      "CND Federal",
      "CND Tributos Estaduais",
      "CND Dívida Ativa Estadual",
      "CND Tributos Municipais",
      "CND Dívida Ativa Municipal",
      "CRF FGTS",
      "CNDT",
      "Certificado de Fornecedor"
    ];

    const { data, error } = await supabase
      .from("documentos_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedorId)
      .in("tipo_documento", tiposDocumentos)
      .order("tipo_documento");

    if (error) {
      console.error("Erro ao carregar documentos:", error);
      return [];
    }

    const documentosOrdenados = tiposDocumentos
      .map(tipo => data?.find(doc => doc.tipo_documento === tipo))
      .filter((doc): doc is any => doc !== undefined);

    return documentosOrdenados as DocumentoExistente[];
  };

  const loadItensVencedores = async (fornecedorId: string, criterio: string, respostas: any[], todosItens: any[]): Promise<any[]> => {
    const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
    if (!resposta) return [];

    const itensDoFornecedor = todosItens.filter(i => i.cotacao_resposta_fornecedor_id === resposta.id);
    const itensVencidos: any[] = [];

    if (criterio === "global") {
      itensVencidos.push(...itensDoFornecedor);
    } else if (criterio === "item" || criterio === "por_item") {
      itensDoFornecedor.forEach(itemFornecedor => {
        const numeroItem = itemFornecedor.itens_cotacao.numero_item;
        const itensComMesmoNumero = todosItens.filter(i => i.itens_cotacao.numero_item === numeroItem);
        const menorValor = Math.min(...itensComMesmoNumero.map(i => Number(i.valor_unitario_ofertado)));
        if (Number(itemFornecedor.valor_unitario_ofertado) === menorValor) {
          itensVencidos.push(itemFornecedor);
        }
      });
    } else if (criterio === "lote" || criterio === "por_lote") {
      const loteIds = [...new Set(itensDoFornecedor.map(i => i.itens_cotacao.lote_id).filter(Boolean))];
      loteIds.forEach(loteId => {
        const itensDoLote = todosItens.filter(i => i.itens_cotacao.lote_id === loteId);
        const respostasPorLote: Record<string, any[]> = {};
        itensDoLote.forEach(item => {
          const respostaId = item.cotacao_resposta_fornecedor_id;
          if (!respostasPorLote[respostaId]) respostasPorLote[respostaId] = [];
          respostasPorLote[respostaId].push(item);
        });

        const totaisPorResposta = Object.entries(respostasPorLote).map(([respostaId, itens]) => {
          const total = itens.reduce((sum, item) => sum + (Number(item.valor_unitario_ofertado) * Number(item.itens_cotacao.quantidade)), 0);
          return { respostaId, total };
        });

        const menorTotal = Math.min(...totaisPorResposta.map(r => r.total));
        const vencedor = totaisPorResposta.find(r => r.total === menorTotal);
        if (vencedor?.respostaId === resposta.id) {
          itensVencidos.push(...itensDoFornecedor.filter(i => i.itens_cotacao.lote_id === loteId));
        }
      });
    }

    return itensVencidos.sort((a, b) => a.itens_cotacao.numero_item - b.itens_cotacao.numero_item);
  };

  const loadCamposFornecedor = async (fornecedorId: string): Promise<CampoDocumento[]> => {
    const { data, error } = await supabase
      .from("campos_documentos_finalizacao")
      .select(`
        *,
        documentos_finalizacao_fornecedor (
          id,
          nome_arquivo,
          url_arquivo,
          data_upload
        )
      `)
      .eq("cotacao_id", cotacaoId)
      .eq("fornecedor_id", fornecedorId)
      .order("ordem");

    if (error) {
      console.error("Erro ao carregar campos:", error);
      return [];
    }

    return data || [];
  };

  const verificarTodosDocumentosAprovados = (fornecedorId: string, docs: DocumentoExistente[], campos: CampoDocumento[]): boolean => {
    // Verificar documentos em cadastro
    const temDocumentoVencido = docs.some(doc => !doc.em_vigor);
    if (temDocumentoVencido) return false;

    // Verificar campos solicitados
    const temCamposPendentes = campos.some(campo => 
      campo.status_solicitacao !== "aprovado"
    );

    return !temCamposPendentes;
  };

  const loadDocumentosAprovados = async () => {
    const { data, error } = await supabase
      .from("cotacoes_precos")
      .select("documentos_aprovados")
      .eq("id", cotacaoId)
      .single();

    if (error) {
      console.error("Erro ao carregar aprovações:", error);
    } else {
      setDocumentosAprovados((data?.documentos_aprovados as Record<string, boolean>) || {});
    }
  };

  const loadAutorizacoes = async () => {
    const { data, error } = await (supabase as any)
      .from("autorizacoes_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .eq("tipo_autorizacao", "compra_direta")
      .order("data_geracao", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Erro ao carregar autorizações:", error);
    } else if (data) {
      setAutorizacaoDiretaUrl(data.url_arquivo);
      setAutorizacaoDiretaId(data.id);
    }
  };

  const checkResponsavelLegal = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user.id) return;

    const { data } = await supabase
      .from("profiles")
      .select("responsavel_legal")
      .eq("id", session.user.id)
      .single();

    setIsResponsavelLegal(data?.responsavel_legal || false);
  };

  const adicionarCampoDocumento = async (fornecedorId: string) => {
    if (!novoCampo.nome || !novoCampo.descricao) {
      toast.error("Preencha nome e descrição do documento");
      return;
    }

    if (!dataLimiteDocumentos) {
      toast.error("Defina a data limite para envio");
      return;
    }

    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      const ordemAtual = fornecedorData ? fornecedorData.campos.length : 0;

      const { data, error } = await supabase
        .from("campos_documentos_finalizacao")
        .insert({
          cotacao_id: cotacaoId,
          fornecedor_id: fornecedorId,
          nome_campo: novoCampo.nome.trim(),
          descricao: novoCampo.descricao.trim(),
          obrigatorio: novoCampo.obrigatorio,
          ordem: ordemAtual,
          status_solicitacao: "pendente",
          data_solicitacao: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error("Erro detalhado ao adicionar documento:", error);
        if (error.code === '23505') {
          toast.error("Este documento já foi solicitado para este fornecedor");
        } else {
          toast.error(`Erro ao adicionar documento: ${error.message || 'Erro desconhecido'}`);
        }
        return;
      }

      toast.success("Documento adicionado à lista");
      setNovoCampo({ nome: "", descricao: "", obrigatorio: true });
      setDataLimiteDocumentos("");
      await loadAllFornecedores();
    } catch (error: any) {
      console.error("Erro ao adicionar documento:", error);
      toast.error(`Erro ao adicionar documento: ${error.message || 'Erro desconhecido'}`);
    }
  };

  const enviarSolicitacaoDocumentos = async (fornecedorId: string) => {
    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      if (!fornecedorData) return;

      const camposPendentes = fornecedorData.campos.filter(c => c.status_solicitacao === "pendente");

      if (camposPendentes.length === 0) {
        toast.error("Nenhum documento pendente para enviar");
        return;
      }

      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({ status_solicitacao: "enviado" })
        .in("id", camposPendentes.map(c => c.id!));

      if (error) throw error;

      toast.success("Solicitação enviada ao fornecedor");
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao enviar solicitação:", error);
      toast.error("Erro ao enviar solicitação");
    }
  };

  const aprovarDocumento = async (campoId: string) => {
    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "aprovado",
          data_aprovacao: new Date().toISOString()
        })
        .eq("id", campoId);

      if (error) throw error;

      toast.success("Documento aprovado");
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao aprovar documento:", error);
      toast.error("Erro ao aprovar documento");
    }
  };

  const rejeitarDocumento = async (campoId: string) => {
    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "rejeitado",
          data_aprovacao: null
        })
        .eq("id", campoId);

      if (error) throw error;

      toast.success("Documento rejeitado");
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao rejeitar documento:", error);
      toast.error("Erro ao rejeitar documento");
    }
  };

  const aprovarTodosDocumentosFornecedor = async (fornecedorId: string) => {
    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      if (!fornecedorData) return;

      const camposEmAnalise = fornecedorData.campos.filter(c => c.status_solicitacao === "em_analise");

      if (camposEmAnalise.length === 0) {
        toast.error("Nenhum documento em análise para aprovar");
        return;
      }

      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "aprovado",
          data_aprovacao: new Date().toISOString()
        })
        .in("id", camposEmAnalise.map(c => c.id!));

      if (error) throw error;

      toast.success(`Todos os documentos de ${fornecedorData.fornecedor.razao_social} foram aprovados`);
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao aprovar documentos:", error);
      toast.error("Erro ao aprovar documentos");
    }
  };

  const reverterAprovacaoDocumento = async (campoId: string) => {
    try {
      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: "rejeitado",
          data_aprovacao: null
        })
        .eq("id", campoId);

      if (error) throw error;

      toast.success("Aprovação revertida");
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao reverter aprovação:", error);
      toast.error("Erro ao reverter aprovação");
    }
  };

  const enviarDocumentosParaFornecedor = async (fornecedorId: string) => {
    try {
      const fornecedorData = fornecedoresData.find(f => f.fornecedor.id === fornecedorId);
      if (!fornecedorData || fornecedorData.campos.length === 0) {
        toast.error("Nenhum documento foi adicionado para enviar");
        return;
      }

      // Atualizar status dos documentos pendentes para "enviado"
      const documentosPendentes = fornecedorData.campos.filter(c => c.status_solicitacao === "pendente");
      
      if (documentosPendentes.length === 0) {
        toast.info("Todos os documentos já foram enviados");
        return;
      }

      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .update({ status_solicitacao: "enviado" })
        .in("id", documentosPendentes.map(d => d.id!));

      if (error) throw error;

      toast.success(`Documentos enviados para ${fornecedorData.fornecedor.razao_social}`);
      await loadAllFornecedores();
    } catch (error) {
      console.error("Erro ao enviar documentos:", error);
      toast.error("Erro ao enviar documentos para fornecedor");
    }
  };

  const deletarAutorizacao = async (autorizacaoId: string) => {
    if (!confirm("Tem certeza que deseja deletar esta autorização? Será necessário gerar uma nova.")) {
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from("autorizacoes_processo")
        .delete()
        .eq("id", autorizacaoId);

      if (error) throw error;

      setAutorizacaoDiretaUrl("");
      setAutorizacaoDiretaId("");
      toast.success("Autorização deletada");
    } catch (error) {
      console.error("Erro ao deletar autorização:", error);
      toast.error("Erro ao deletar autorização");
    }
  };

  const gerarAutorizacao = async () => {
    try {
      setLoading(true);

      // Buscar dados do processo
      const { data: cotacao, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("processo_compra_id")
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;

      const { data: processo, error: processoError } = await supabase
        .from("processos_compras")
        .select("numero_processo_interno, objeto_resumido, criterio_julgamento")
        .eq("id", cotacao.processo_compra_id)
        .single();

      if (processoError) throw processoError;

      // Buscar usuário
      const { data: { session } } = await supabase.auth.getSession();
      const { data: usuario } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", session!.user.id)
        .single();

      // Buscar respostas e identificar fornecedores vencedores com valores
      const { data: respostas } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          fornecedor_id,
          fornecedores!inner(razao_social, cnpj)
        `)
        .eq("cotacao_id", cotacaoId);

      const { data: itensRespostas } = await supabase
        .from("respostas_itens_fornecedor")
        .select(`
          id,
          cotacao_resposta_fornecedor_id,
          valor_unitario_ofertado,
          itens_cotacao!inner(numero_item, quantidade)
        `)
        .in("cotacao_resposta_fornecedor_id", respostas?.map(r => r.id) || []);

      const fornecedoresVencedores = fornecedoresData.map(fData => {
        const resposta = respostas?.find(r => r.fornecedor_id === fData.fornecedor.id);
        const itensVencedores = fData.itensVencedores;
        const itensNumeros = itensVencedores.map(i => i.itens_cotacao.numero_item).sort((a, b) => a - b);
        
        let valorTotal = 0;
        const itensVencedoresComValor: Array<{ numero: number; valor: number }> = [];
        
        itensVencedores.forEach(item => {
          const itemResposta = itensRespostas?.find(
            ir => ir.cotacao_resposta_fornecedor_id === resposta?.id && 
                  ir.itens_cotacao.numero_item === item.itens_cotacao.numero_item
          );
          if (itemResposta) {
            const valorItem = Number(itemResposta.valor_unitario_ofertado) * Number(itemResposta.itens_cotacao.quantidade);
            valorTotal += valorItem;
            itensVencedoresComValor.push({
              numero: item.itens_cotacao.numero_item,
              valor: valorItem
            });
          }
        });

        return {
          razaoSocial: fData.fornecedor.razao_social,
          cnpj: resposta?.fornecedores.cnpj || "",
          itensVencedores: itensVencedoresComValor,
          valorTotal: valorTotal
        };
      });

      const resultadoAutorizacao = await gerarAutorizacaoCompraDireta(
        processo.numero_processo_interno,
        processo.objeto_resumido,
        usuario?.nome_completo || "",
        usuario?.cpf || "",
        fornecedoresVencedores
      );

      // Salvar no banco
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      const { error: insertError } = await (supabase as any)
        .from("autorizacoes_processo")
        .insert({
          cotacao_id: cotacaoId,
          protocolo: resultadoAutorizacao.protocolo,
          tipo_autorizacao: "compra_direta",
          nome_arquivo: resultadoAutorizacao.fileName,
          url_arquivo: resultadoAutorizacao.url,
          usuario_gerador_id: currentSession!.user.id,
          data_geracao: new Date().toISOString()
        });

      if (insertError) throw insertError;

      setAutorizacaoDiretaUrl(resultadoAutorizacao.url);
      toast.success("Autorização gerada com sucesso!");
      await loadAutorizacoes();
    } catch (error) {
      console.error("Erro ao gerar autorização:", error);
      toast.error("Erro ao gerar autorização");
    } finally {
      setLoading(false);
    }
  };

  const finalizarProcesso = async () => {
    if (!autorizacaoDiretaUrl) {
      toast.error("É necessário gerar a autorização antes de enviar para contratação");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase
        .from("cotacoes_precos")
        .update({
          processo_finalizado: true,
          data_finalizacao: new Date().toISOString()
        })
        .eq("id", cotacaoId);

      if (error) throw error;

      toast.success("Processo enviado para contratação!");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao finalizar processo:", error);
      toast.error("Erro ao finalizar processo");
    } finally {
      setLoading(false);
    }
  };

  const todosDocumentosAprovados = fornecedoresData.every(f => f.todosDocumentosAprovados);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>Verificar Documentação - Compra Direta</DialogTitle>
          <DialogDescription>
            Revise os documentos de cada fornecedor vencedor e solicite documentos adicionais se necessário
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-4">
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Carregando fornecedores...</p>
              </div>
            ) : fornecedoresData.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhum fornecedor vencedor encontrado</p>
              </div>
            ) : (
              fornecedoresData.map((fornData) => (
                <Card key={fornData.fornecedor.id} className="border-2">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl">{fornData.fornecedor.razao_social}</CardTitle>
                        <CardDescription>
                          {fornData.itensVencedores.length > 0 && (
                            <span className="text-sm">
                              Itens vencedores: {fornData.itensVencedores.map(i => i.itens_cotacao.numero_item).join(", ")}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      {fornData.todosDocumentosAprovados && (
                        <Badge className="bg-green-600">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Documentos Aprovados
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-6">
                    {/* Documentos Válidos em Cadastro */}
                    <div>
                      <h4 className="font-semibold text-lg mb-3">📄 Documentos Válidos em Cadastro</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo de Documento</TableHead>
                            <TableHead>Validade</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fornData.documentosExistentes.map((doc) => {
                            const hoje = new Date();
                            const validade = doc.data_validade ? new Date(doc.data_validade) : null;
                            const isValido = validade ? validade > hoje : false;

                            return (
                              <TableRow key={doc.id}>
                                <TableCell className="font-medium">{doc.tipo_documento}</TableCell>
                                <TableCell>
                                  {doc.data_validade ? new Date(doc.data_validade).toLocaleDateString('pt-BR') : 'N/A'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={isValido ? "default" : "destructive"}>
                                    {isValido ? "✓ Em vigor" : "✗ Vencido"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(doc.url_arquivo, '_blank')}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    Visualizar
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Documentos Solicitados */}
                    {fornData.campos.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-lg mb-3">📋 Documentos Solicitados</h4>
                        <div className="space-y-3">
                          {fornData.campos.map((campo) => (
                            <Card key={campo.id} className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h5 className="font-semibold">{campo.nome_campo}</h5>
                                    {campo.obrigatorio && (
                                      <Badge variant="outline" className="text-xs">Obrigatório</Badge>
                                    )}
                                    <Badge variant={
                                      campo.status_solicitacao === "aprovado" ? "default" :
                                      campo.status_solicitacao === "em_analise" ? "secondary" :
                                      campo.status_solicitacao === "rejeitado" ? "destructive" :
                                      "outline"
                                    }>
                                      {campo.status_solicitacao === "aprovado" ? "✓ Aprovado" :
                                       campo.status_solicitacao === "em_analise" ? "⏳ Em análise" :
                                       campo.status_solicitacao === "rejeitado" ? "✗ Rejeitado" :
                                       "⚠️ Pendente"}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-2">{campo.descricao}</p>
                                  
                                  {campo.documentos_finalizacao_fornecedor && campo.documentos_finalizacao_fornecedor.length > 0 && (
                                    <div className="mt-2">
                                      {campo.documentos_finalizacao_fornecedor.map((doc) => (
                                        <div key={doc.id} className="flex items-center gap-2 text-sm">
                                          <FileText className="h-4 w-4" />
                                          <a href={doc.url_arquivo} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                            {doc.nome_arquivo}
                                          </a>
                                          <span className="text-muted-foreground text-xs">
                                            ({new Date(doc.data_upload).toLocaleDateString('pt-BR')})
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                
                                {campo.status_solicitacao === "em_analise" && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => aprovarDocumento(campo.id!)}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Aprovar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => rejeitarDocumento(campo.id!)}
                                    >
                                      <AlertCircle className="h-4 w-4 mr-1" />
                                      Rejeitar
                                    </Button>
                                  </div>
                                )}
                                
                                {campo.status_solicitacao === "aprovado" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => reverterAprovacaoDocumento(campo.id!)}
                                  >
                                    Reverter Aprovação
                                  </Button>
                                )}
                              </div>
                            </Card>
                          ))}
                        </div>
                        
                        {fornData.campos.filter(c => c.status_solicitacao === "em_analise").length > 0 && (
                          <Button
                            onClick={() => aprovarTodosDocumentosFornecedor(fornData.fornecedor.id)}
                            className="mt-4"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Aprovar Documentos do Fornecedor
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Solicitar Documentos Adicionais/Faltantes */}
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-lg mb-3">➕ Solicitar Documentos Adicionais/Faltantes</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Nome do Documento</Label>
                          <Input
                            value={novoCampo.nome}
                            onChange={(e) => setNovoCampo({ ...novoCampo, nome: e.target.value })}
                            placeholder="Ex: Certidão de Regularidade"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Descrição</Label>
                          <Textarea
                            value={novoCampo.descricao}
                            onChange={(e) => setNovoCampo({ ...novoCampo, descricao: e.target.value })}
                            placeholder="Descrição do documento solicitado"
                            rows={1}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <Button
                          onClick={() => adicionarCampoDocumento(fornData.fornecedor.id)}
                          disabled={!novoCampo.nome.trim() || !novoCampo.descricao.trim()}
                          size="sm"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar Documento
                        </Button>
                        
                        {fornData.campos.length > 0 && (
                          <Button
                            onClick={() => enviarDocumentosParaFornecedor(fornData.fornecedor.id)}
                            variant="default"
                            size="sm"
                          >
                            Enviar para Fornecedor
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 pb-6 pt-4 border-t shrink-0">
          <div className="flex flex-col w-full gap-3">
            {/* Autorização */}
            {isResponsavelLegal && (
              <div className="flex items-center gap-3">
                {!autorizacaoDiretaUrl ? (
                  <Button
                    onClick={gerarAutorizacao}
                    disabled={loading || !todosDocumentosAprovados}
                    className="flex-1"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Gerar Autorização
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() => window.open(autorizacaoDiretaUrl, '_blank')}
                      variant="outline"
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Visualizar Autorização
                    </Button>
                    <Button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = autorizacaoDiretaUrl;
                        link.download = 'autorizacao-compra-direta.pdf';
                        link.click();
                      }}
                      variant="outline"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Baixar
                    </Button>
                    {isResponsavelLegal && (
                      <Button
                        onClick={() => deletarAutorizacao(autorizacaoDiretaId)}
                        variant="destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Deletar
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex gap-3">
              <Button onClick={() => onOpenChange(false)} variant="outline" className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={finalizarProcesso}
                disabled={loading || !autorizacaoDiretaUrl}
                className="flex-1"
              >
                Enviar para Contratação
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
