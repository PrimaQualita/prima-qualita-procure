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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ExternalLink, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { gerarAutorizacaoCompraDireta } from "@/lib/gerarAutorizacaoPDF";

interface CampoDocumento {
  id?: string;
  nome_campo: string;
  descricao: string;
  obrigatorio: boolean;
  ordem: number;
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
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<string>("");
  const [documentosExistentes, setDocumentosExistentes] = useState<DocumentoExistente[]>([]);
  const [itensVencedores, setItensVencedores] = useState<any[]>([]);
  const [campos, setCampos] = useState<CampoDocumento[]>([]);
  const [novoCampo, setNovoCampo] = useState<CampoDocumento>({
    nome_campo: "",
    descricao: "",
    obrigatorio: true,
    ordem: 0,
  });
  const [dataLimiteDocumentos, setDataLimiteDocumentos] = useState<string>("");
  const [documentosAprovados, setDocumentosAprovados] = useState<Record<string, boolean>>({});
  const [statusDocumentosFornecedor, setStatusDocumentosFornecedor] = useState<string>("pendente");
  const [autorizacaoDiretaUrl, setAutorizacaoDiretaUrl] = useState<string>("");
  const [autorizacaoDiretaId, setAutorizacaoDiretaId] = useState<string>("");
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);

  useEffect(() => {
    if (open) {
      console.log("📂 Dialog aberto, carregando fornecedores vencedores e aprovações");
      loadFornecedoresVencedores();
      loadDocumentosAprovados();
      loadAutorizacoes();
      checkResponsavelLegal();
    }
  }, [open, cotacaoId]);

  useEffect(() => {
    if (fornecedorSelecionado) {
      console.log("🔄 Fornecedor selecionado mudou:", fornecedorSelecionado);
      loadDocumentosFornecedor(fornecedorSelecionado);
      loadItensVencedores(fornecedorSelecionado);
      loadCamposExistentes(); // CRÍTICO: Carrega os documentos solicitados/enviados
      loadStatusDocumentosFornecedor(fornecedorSelecionado);
    } else {
      setDocumentosExistentes([]);
      setItensVencedores([]);
      setCampos([]); // Limpa os campos quando nenhum fornecedor está selecionado
      setStatusDocumentosFornecedor("pendente");
    }
  }, [fornecedorSelecionado]);

  const loadFornecedoresVencedores = async () => {
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
        setFornecedores([]);
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
      const fornecedoresVencedores = new Set<string>();

      if (criterio === "global") {
        // Menor preço global - um único vencedor
        if (respostas.length > 0) {
          const menorValor = Math.min(...respostas.map(r => Number(r.valor_total_anual_ofertado)));
          const vencedor = respostas.find(r => Number(r.valor_total_anual_ofertado) === menorValor);
          if (vencedor) fornecedoresVencedores.add(vencedor.fornecedor_id);
        }
      } else if (criterio === "item" || criterio === "por_item") {
        // Menor preço por item - pode ter múltiplos vencedores
        if (itens && itens.length > 0) {
          const itensPorNumero: Record<number, any[]> = {};
          
          itens.forEach(item => {
            const numItem = item.itens_cotacao.numero_item;
            if (!itensPorNumero[numItem]) {
              itensPorNumero[numItem] = [];
            }
            itensPorNumero[numItem].push(item);
          });

          Object.values(itensPorNumero).forEach(itensDoNumero => {
            if (itensDoNumero.length > 0) {
              const menorValor = Math.min(...itensDoNumero.map(i => Number(i.valor_unitario_ofertado)));
              const vencedor = itensDoNumero.find(i => Number(i.valor_unitario_ofertado) === menorValor);
              if (vencedor) {
                const resposta = respostas.find(r => r.id === vencedor.cotacao_resposta_fornecedor_id);
                if (resposta) {
                  fornecedoresVencedores.add(resposta.fornecedor_id);
                }
              }
            }
          });
        }
      } else if (criterio === "lote" || criterio === "por_lote") {
        // Menor preço por lote - pode ter múltiplos vencedores
        if (itens && itens.length > 0) {
          const itensPorLote: Record<string, Record<string, any[]>> = {};
          
          itens.forEach(item => {
            const loteId = item.itens_cotacao.lote_id;
            if (!loteId) return;
            
            if (!itensPorLote[loteId]) {
              itensPorLote[loteId] = {};
            }
            
            const respostaId = item.cotacao_resposta_fornecedor_id;
            if (!itensPorLote[loteId][respostaId]) {
              itensPorLote[loteId][respostaId] = [];
            }
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
                if (resposta) {
                  fornecedoresVencedores.add(resposta.fornecedor_id);
                }
              }
            }
          });
        }
      }

      // Filtrar apenas fornecedores vencedores e remover duplicados
      const fornecedoresFiltrados = Array.from(fornecedoresVencedores)
        .map(fornecedorId => {
          const resposta = respostas.find(r => r.fornecedor_id === fornecedorId);
          return resposta ? {
            id: fornecedorId,
            razao_social: resposta.fornecedores.razao_social
          } : null;
        })
        .filter((f): f is Fornecedor => f !== null)
        .sort((a, b) => a.razao_social.localeCompare(b.razao_social));

      setFornecedores(fornecedoresFiltrados);
    } catch (error) {
      console.error("Erro ao carregar fornecedores vencedores:", error);
      toast.error("Erro ao carregar fornecedores vencedores");
      setFornecedores([]);
    }
  };

  const loadItensVencedores = async (fornecedorId: string) => {
    try {
      // Buscar cotação com critério de julgamento
      const { data: cotacao, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("criterio_julgamento")
        .eq("id", cotacaoId)
        .single();

      if (cotacaoError) throw cotacaoError;

      // Buscar resposta deste fornecedor
      const { data: resposta, error: respostaError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id")
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorId)
        .single();

      if (respostaError) throw respostaError;

      // Buscar todos os itens deste fornecedor
      const { data: itensDoFornecedor, error: itensError } = await supabase
        .from("respostas_itens_fornecedor")
        .select(`
          id,
          valor_unitario_ofertado,
          itens_cotacao!inner(numero_item, descricao, lote_id, quantidade, unidade, lotes_cotacao(numero_lote, descricao_lote))
        `)
        .eq("cotacao_resposta_fornecedor_id", resposta.id);

      if (itensError) throw itensError;

      if (!itensDoFornecedor || itensDoFornecedor.length === 0) {
        setItensVencedores([]);
        return;
      }

      // Buscar todas as respostas para comparação
      const { data: todasRespostas, error: todasRespostasError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id, fornecedor_id")
        .eq("cotacao_id", cotacaoId);

      if (todasRespostasError) throw todasRespostasError;

      const { data: todosItens, error: todosItensError } = await supabase
        .from("respostas_itens_fornecedor")
        .select(`
          id,
          cotacao_resposta_fornecedor_id,
          item_cotacao_id,
          valor_unitario_ofertado,
          itens_cotacao!inner(numero_item, lote_id, quantidade)
        `)
        .in("cotacao_resposta_fornecedor_id", todasRespostas?.map(r => r.id) || []);

      if (todosItensError) throw todosItensError;

      const criterio = cotacao?.criterio_julgamento || "global";
      const itensVencidos: any[] = [];

      if (criterio === "global") {
        // Global - todos os itens são vencedores
        itensVencidos.push(...itensDoFornecedor.map(item => ({
          ...item,
          vencedor: true
        })));
      } else if (criterio === "item" || criterio === "por_item") {
        // Por item - verificar cada item individualmente
        itensDoFornecedor.forEach(itemFornecedor => {
          const numeroItem = itemFornecedor.itens_cotacao.numero_item;
          const itensComMesmoNumero = todosItens?.filter(i => i.itens_cotacao.numero_item === numeroItem) || [];
          
          if (itensComMesmoNumero.length > 0) {
            const menorValor = Math.min(...itensComMesmoNumero.map(i => Number(i.valor_unitario_ofertado)));
            const ehVencedor = Number(itemFornecedor.valor_unitario_ofertado) === menorValor;
            
            if (ehVencedor) {
              itensVencidos.push({
                ...itemFornecedor,
                vencedor: true
              });
            }
          }
        });
      } else if (criterio === "lote" || criterio === "por_lote") {
        // Por lote - agrupar por lote e verificar
        const loteIds = [...new Set(itensDoFornecedor.map(i => i.itens_cotacao.lote_id).filter(Boolean))];
        
        loteIds.forEach(loteId => {
          const itensDoLote = todosItens?.filter(i => i.itens_cotacao.lote_id === loteId) || [];
          
          if (itensDoLote.length > 0) {
            const respostasPorLote: Record<string, any[]> = {};
            
            itensDoLote.forEach(item => {
              const respostaId = item.cotacao_resposta_fornecedor_id;
              if (!respostasPorLote[respostaId]) {
                respostasPorLote[respostaId] = [];
              }
              respostasPorLote[respostaId].push(item);
            });

            const totaisPorResposta = Object.entries(respostasPorLote).map(([respostaId, itens]) => {
              const total = itens.reduce((sum, item) => {
                return sum + (Number(item.valor_unitario_ofertado) * Number(item.itens_cotacao.quantidade));
              }, 0);
              return { respostaId, total };
            });

            if (totaisPorResposta.length > 0) {
              const menorTotal = Math.min(...totaisPorResposta.map(r => r.total));
              const vencedor = totaisPorResposta.find(r => r.total === menorTotal);
              
              if (vencedor?.respostaId === resposta.id) {
                const itensVencedoresDoLote = itensDoFornecedor.filter(i => i.itens_cotacao.lote_id === loteId);
                itensVencidos.push(...itensVencedoresDoLote.map(item => ({
                  ...item,
                  vencedor: true
                })));
              }
            }
          }
        });
      }

      setItensVencedores(itensVencidos.sort((a, b) => a.itens_cotacao.numero_item - b.itens_cotacao.numero_item));
    } catch (error) {
      console.error("Erro ao carregar itens vencedores:", error);
      toast.error("Erro ao carregar itens vencedores");
      setItensVencedores([]);
    }
  };

  const loadCamposExistentes = async () => {
    if (!fornecedorSelecionado) return;
    
    console.log("🔍 Carregando campos para fornecedor:", fornecedorSelecionado);
    
    // Carregar TODOS os campos (não apenas os pendentes) para mostrar os documentos enviados
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
      .eq("fornecedor_id", fornecedorSelecionado)
      .order("ordem");

    if (error) {
      console.error("❌ Erro ao carregar campos:", error);
      toast.error("Erro ao carregar documentos do fornecedor");
    } else {
      console.log("✅ Campos carregados:", data);
      console.log("📊 Total de campos:", data?.length);
      console.log("📄 Campos com documentos:", data?.filter((c: any) => c.documentos_finalizacao_fornecedor?.length > 0).length);
      setCampos(data || []);
    }
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

  const loadStatusDocumentosFornecedor = async (fornecedorId: string) => {
    const { data, error } = await supabase
      .from("campos_documentos_finalizacao")
      .select("status_solicitacao")
      .eq("cotacao_id", cotacaoId)
      .eq("fornecedor_id", fornecedorId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // Ignora erro de "não encontrado"
      console.error("Erro ao carregar status:", error);
    } else {
      setStatusDocumentosFornecedor(data?.status_solicitacao || "pendente");
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
      toast.success("Autorização deletada com sucesso");
    } catch (error) {
      console.error("Erro ao deletar autorização:", error);
      toast.error("Erro ao deletar autorização");
    }
  };

  const loadDocumentosFornecedor = async (fornecedorId: string) => {
    try {
      const { data, error } = await supabase
        .from("documentos_fornecedor")
        .select("id, tipo_documento, nome_arquivo, url_arquivo, data_validade, em_vigor")
        .eq("fornecedor_id", fornecedorId)
        .eq("em_vigor", true);

      if (error) throw error;

      // Definir ordem correta dos documentos - usando os nomes EXATOS do banco
      const ordemDocumentos = [
        "contrato_social",
        "cartao_cnpj",
        "inscricao_estadual_municipal",
        "cnd_federal",
        "cnd_tributos_estaduais",
        "cnd_divida_ativa_estadual",
        "cnd_tributos_municipais",
        "cnd_divida_ativa_municipal",
        "crf_fgts",
        "fgts",
        "cndt",
        "certificado_gestor"
      ];

      // Filtrar relatorio_kpmg e ordenar documentos
      const documentosFiltrados = (data || [])
        .filter(doc => doc.tipo_documento !== "relatorio_kpmg")
        .sort((a, b) => {
          const indexA = ordemDocumentos.indexOf(a.tipo_documento);
          const indexB = ordemDocumentos.indexOf(b.tipo_documento);
          // Se não encontrar o tipo na ordem, coloca no final
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

      setDocumentosExistentes(documentosFiltrados);
    } catch (error) {
      console.error("Erro ao carregar documentos do fornecedor:", error);
      toast.error("Erro ao carregar documentos do fornecedor");
    }
  };

  const getTipoDocumentoLabel = (tipo: string): string => {
    const labels: Record<string, string> = {
      contrato_social: "Contrato Social",
      cartao_cnpj: "Cartão CNPJ",
      inscricao_estadual_municipal: "Inscrição Estadual/Municipal",
      cnd_federal: "CND Federal",
      cnd_tributos_estaduais: "CND Tributos Estaduais",
      cnd_divida_ativa_estadual: "CND Dívida Ativa Estadual",
      cnd_tributos_municipais: "CND Tributos Municipais",
      cnd_divida_ativa_municipal: "CND Dívida Ativa Municipal",
      crf_fgts: "CRF FGTS",
      fgts: "CRF FGTS",
      cndt: "CNDT",
      certificado_gestor: "Certificado de Fornecedor",
    };
    return labels[tipo] || tipo;
  };

  const handleVisualizarDocumento = async (doc: DocumentoExistente) => {
    try {
      const pathMatch = doc.url_arquivo.match(/processo-anexos\/(.+)$/);
      if (!pathMatch) {
        toast.error("URL do documento inválida");
        return;
      }
      const filePath = pathMatch[1];
      const { data, error } = await supabase.storage
        .from('processo-anexos')
        .createSignedUrl(filePath, 60);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Não foi possível gerar URL de acesso");
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const fullUrl = data.signedUrl.startsWith('http') 
        ? data.signedUrl 
        : `${supabaseUrl}/storage/v1${data.signedUrl}`;
      
      window.open(fullUrl, '_blank');
    } catch (error) {
      console.error("Erro ao abrir documento:", error);
      toast.error("Erro ao visualizar documento");
    }
  };

  const adicionarCampo = () => {
    if (!novoCampo.nome_campo.trim()) {
      toast.error("Nome do campo é obrigatório");
      return;
    }

    const novaOrdem = campos.length > 0 ? Math.max(...campos.map(c => c.ordem)) + 1 : 1;
    setCampos([...campos, { ...novoCampo, ordem: novaOrdem }]);
    setNovoCampo({
      nome_campo: "",
      descricao: "",
      obrigatorio: true,
      ordem: 0,
    });
  };

  const removerCampo = (ordem: number) => {
    setCampos(campos.filter(c => c.ordem !== ordem));
  };

  const handleEnviarSolicitacao = async () => {
    if (!fornecedorSelecionado) {
      toast.error("Selecione o fornecedor vencedor");
      return;
    }

    if (campos.length === 0) {
      toast.error("Adicione pelo menos um documento para solicitar");
      return;
    }

    if (!dataLimiteDocumentos) {
      toast.error("Informe a data limite para envio dos documentos");
      return;
    }

    setLoading(true);
    try {
      // Buscar a ordem máxima atual na cotação para evitar conflitos
      const { data: camposExistentes } = await supabase
        .from("campos_documentos_finalizacao")
        .select("ordem")
        .eq("cotacao_id", cotacaoId)
        .order("ordem", { ascending: false })
        .limit(1);

      const ordemInicial = camposExistentes && camposExistentes.length > 0 
        ? camposExistentes[0].ordem + 1 
        : 1;

      // Deletar campos anteriores deste fornecedor se existirem
      await supabase
        .from("campos_documentos_finalizacao")
        .delete()
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorSelecionado);

      // Inserir novos campos com status "enviado" e ordem sequencial
      const camposParaInserir = campos.map((campo, index) => ({
        cotacao_id: cotacaoId,
        fornecedor_id: fornecedorSelecionado,
        nome_campo: campo.nome_campo,
        descricao: campo.descricao || `Data limite: ${new Date(dataLimiteDocumentos).toLocaleDateString('pt-BR')}`,
        obrigatorio: campo.obrigatorio,
        ordem: ordemInicial + index,
        status_solicitacao: 'enviado',
        data_solicitacao: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("campos_documentos_finalizacao")
        .insert(camposParaInserir);

      if (error) throw error;

      toast.success("Solicitação enviada ao fornecedor com sucesso!");
      setCampos([]);
      setDataLimiteDocumentos("");
      await loadStatusDocumentosFornecedor(fornecedorSelecionado);
    } catch (error) {
      console.error("Erro ao enviar solicitação:", error);
      toast.error("Erro ao enviar solicitação");
    } finally {
      setLoading(false);
    }
  };

  const handleAprovarDocumentos = async () => {
    if (!fornecedorSelecionado) {
      toast.error("Selecione o fornecedor");
      return;
    }

    setLoading(true);
    try {
      // Atualizar status dos documentos para "aprovado"
      await supabase
        .from("campos_documentos_finalizacao")
        .update({
          status_solicitacao: 'aprovado',
          data_aprovacao: new Date().toISOString(),
        })
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorSelecionado);

      // Atualizar registro de aprovação na cotação
      const novosAprovados = {
        ...documentosAprovados,
        [fornecedorSelecionado]: true
      };

      await supabase
        .from("cotacoes_precos")
        .update({ documentos_aprovados: novosAprovados })
        .eq("id", cotacaoId);

      setDocumentosAprovados(novosAprovados);
      toast.success("Documentos do fornecedor aprovados com sucesso!");
      await loadStatusDocumentosFornecedor(fornecedorSelecionado);
    } catch (error) {
      console.error("Erro ao aprovar documentos:", error);
      toast.error("Erro ao aprovar documentos");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizar = async () => {
    // Verificar se todos os fornecedores vencedores tiveram documentos aprovados
    const todosAprovados = fornecedores.every(f => documentosAprovados[f.id] === true);
    
    if (!todosAprovados) {
      toast.error("É necessário aprovar os documentos de todos os fornecedores vencedores antes de finalizar o processo");
      return;
    }

    setLoading(true);
    try {
      // Atualizar cotação como finalizada
      const { error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .update({
          processo_finalizado: true,
          data_finalizacao: new Date().toISOString(),
        })
        .eq("id", cotacaoId);

      if (cotacaoError) throw cotacaoError;

      toast.success("Processo finalizado com sucesso! Todos os fornecedores tiveram seus documentos aprovados.");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao finalizar processo:", error);
      toast.error("Erro ao finalizar processo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finalizar Processo de Cotação</DialogTitle>
          <DialogDescription>
            Selecione o fornecedor vencedor, verifique os documentos e solicite apenas documentos faltantes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Seleção de Fornecedor */}
          <div className="grid gap-2">
            <Label htmlFor="fornecedor">Fornecedor Vencedor *</Label>
            <Select value={fornecedorSelecionado} onValueChange={setFornecedorSelecionado}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o fornecedor vencedor" />
              </SelectTrigger>
              <SelectContent>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Itens Vencedores */}
          {fornecedorSelecionado && itensVencedores.length > 0 && (
            <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                🏆 Itens Vencedores do Fornecedor
              </h3>
              <div className="space-y-2">
                {itensVencedores.map((item) => (
                  <div key={item.id} className="flex items-start justify-between text-sm p-2 bg-white dark:bg-background rounded border">
                    <div className="flex-1">
                      <span className="font-medium">Item {item.itens_cotacao.numero_item}</span>
                      {item.itens_cotacao.lotes_cotacao && (
                        <span className="text-muted-foreground ml-2">
                          • Lote {item.itens_cotacao.lotes_cotacao.numero_lote}
                        </span>
                      )}
                      <p className="text-muted-foreground mt-1">{item.itens_cotacao.descricao}</p>
                      <p className="text-sm mt-1">
                        Quantidade: {item.itens_cotacao.quantidade} {item.itens_cotacao.unidade} • 
                        Valor Unitário: R$ {Number(item.valor_unitario_ofertado).toFixed(2)} • 
                        Total: R$ {(Number(item.valor_unitario_ofertado) * Number(item.itens_cotacao.quantidade)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documentos Existentes do Fornecedor */}
          {fornecedorSelecionado && documentosExistentes.length > 0 && (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-700 dark:text-green-400">
                ✓ Documentos Válidos em Cadastro
              </h3>
              <div className="space-y-2">
                {documentosExistentes.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between text-sm p-2 bg-white dark:bg-background rounded border">
                    <div className="flex-1">
                      <span className="font-medium">{getTipoDocumentoLabel(doc.tipo_documento)}</span>
                      {doc.data_validade && (
                        <span className="text-muted-foreground ml-2">
                          • Validade: {doc.data_validade.split('T')[0].split('-').reverse().join('/')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Em vigor
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVisualizarDocumento(doc)}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                ℹ️ Clique em "Ver" para conferir visualmente cada documento antes de finalizar o processo.
              </p>
            </div>
          )}

          {/* Mensagem quando todos documentos estão OK */}
          {fornecedorSelecionado && documentosExistentes.length > 0 && campos.length === 0 && (
            <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                ✅ Todos os documentos necessários estão em ordem! Você pode finalizar o processo diretamente ou adicionar campos para solicitar documentos complementares específicos.
              </p>
            </div>
          )}

          {/* Status dos Documentos do Fornecedor */}
          {fornecedorSelecionado && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-2">Status dos Documentos</h3>
              {documentosAprovados[fornecedorSelecionado] ? (
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30">
                    ✓ Documentos Aprovados
                  </Badge>
                </div>
              ) : statusDocumentosFornecedor === "concluido" ? (
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">
                    ⏳ Aguardando Aprovação
                  </Badge>
                  <p className="text-sm">Fornecedor enviou os documentos solicitados</p>
                </div>
              ) : statusDocumentosFornecedor === "enviado" ? (
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <Badge variant="outline" className="bg-orange-100 dark:bg-orange-900/30">
                    📤 Solicitação Enviada
                  </Badge>
                  <p className="text-sm">Aguardando fornecedor enviar documentos</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline">
                    ⚪ Nenhuma Solicitação
                  </Badge>
                </div>
          )}

          {/* Documentos Enviados pelo Fornecedor - Aguardando Aprovação */}
          {fornecedorSelecionado && campos.length > 0 && campos.some((c: any) => c.status_solicitacao === 'em_analise') && (
            <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-950/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                ⏳ Documentos Enviados - Aguardando Aprovação
              </h3>
              <div className="space-y-3">
                {campos
                  .filter((campo: any) => campo.status_solicitacao === 'em_analise')
                  .map((campo: any) => {
                    const documentosEnviados = campo.documentos_finalizacao_fornecedor || [];
                    
                    return (
                      <div key={campo.id} className="p-3 bg-white dark:bg-background rounded border">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium">{campo.nome_campo}</p>
                            {campo.descricao && (
                              <p className="text-sm text-muted-foreground mt-1">{campo.descricao}</p>
                            )}
                            {documentosEnviados.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {documentosEnviados.map((doc: any) => (
                                  <div key={doc.id} className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <a
                                      href={doc.url_arquivo}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:underline"
                                    >
                                      {doc.nome_arquivo}
                                    </a>
                                    <span className="text-xs text-muted-foreground">
                                      • {new Date(doc.data_upload).toLocaleDateString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={async () => {
                                try {
                                  const { error } = await supabase
                                    .from('campos_documentos_finalizacao')
                                    .update({
                                      status_solicitacao: 'aprovado',
                                      data_aprovacao: new Date().toISOString()
                                    })
                                    .eq('id', campo.id);
                                  
                                  if (error) throw error;
                                  
                                  toast.success(`Documento "${campo.nome_campo}" aprovado!`);
                                  await loadCamposExistentes();
                                  await loadStatusDocumentosFornecedor(fornecedorSelecionado);
                                } catch (error) {
                                  console.error("Erro ao aprovar documento:", error);
                                  toast.error("Erro ao aprovar documento");
                                }
                              }}
                            >
                              ✓ Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={async () => {
                                try {
                                  const { error } = await supabase
                                    .from('campos_documentos_finalizacao')
                                    .update({
                                      status_solicitacao: 'rejeitado',
                                    })
                                    .eq('id', campo.id);
                                  
                                  if (error) throw error;
                                  
                                  toast.info(`Documento "${campo.nome_campo}" rejeitado. O fornecedor deverá enviar novamente.`);
                                  await loadCamposExistentes();
                                  await loadStatusDocumentosFornecedor(fornecedorSelecionado);
                                } catch (error) {
                                  console.error("Erro ao rejeitar documento:", error);
                                  toast.error("Erro ao rejeitar documento");
                                }
                              }}
                            >
                              ✗ Rejeitar
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Documentos Aprovados */}
          {fornecedorSelecionado && campos.length > 0 && campos.some((c: any) => c.status_solicitacao === 'aprovado') && (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-700 dark:text-green-400">
                ✓ Documentos Aprovados
              </h3>
              <div className="space-y-2">
                {campos
                  .filter((campo: any) => campo.status_solicitacao === 'aprovado')
                  .map((campo: any) => (
                    <div key={campo.id} className="p-2 bg-white dark:bg-background rounded border flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{campo.nome_campo}</p>
                        <p className="text-xs text-muted-foreground">
                          Aprovado em {new Date(campo.data_aprovacao).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={async () => {
                            if (!confirm(`Tem certeza que deseja reverter a aprovação do documento "${campo.nome_campo}"? O fornecedor precisará enviá-lo novamente.`)) {
                              return;
                            }
                            try {
                              const { error } = await supabase
                                .from('campos_documentos_finalizacao')
                                .update({
                                  status_solicitacao: 'rejeitado',
                                  data_aprovacao: null
                                })
                                .eq('id', campo.id);
                              
                              if (error) throw error;
                              
                              toast.info(`Aprovação do documento "${campo.nome_campo}" revertida. Fornecedor deverá enviar novamente.`);
                              await loadCamposExistentes();
                              await loadStatusDocumentosFornecedor(fornecedorSelecionado);
                            } catch (error) {
                              console.error("Erro ao reverter aprovação:", error);
                              toast.error("Erro ao reverter aprovação");
                            }
                          }}
                        >
                          Reverter Aprovação
                        </Button>
                        <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          ✓ Aprovado
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Gerar Autorização - Aparece após aprovação de documentos */}
          {fornecedorSelecionado && documentosAprovados[fornecedorSelecionado] && (
            <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                📄 Autorização de Compra Direta
              </h3>
              {isResponsavelLegal ? (
                <div className="space-y-3">
                  <Button
                    onClick={async () => {
                      try {
                        setLoading(true);
                        
                        // Buscar dados do usuário
                        const { data: { session } } = await supabase.auth.getSession();
                        const { data: usuario } = await supabase
                          .from("profiles")
                          .select("nome_completo, cpf")
                          .eq("id", session?.user.id)
                          .single();
                        
                        const usuarioNome = usuario?.nome_completo || '';
                        const usuarioCpf = usuario?.cpf || '';
                        
                        // Buscar cotação para pegar processo_compra_id
                        const { data: cotacao } = await supabase
                          .from("cotacoes_precos")
                          .select("processo_compra_id")
                          .eq("id", cotacaoId)
                          .single();
                        
                        // Buscar processo
                        const { data: processoSelecionado } = await supabase
                          .from("processos_compras")
                          .select("numero_processo_interno, objeto_resumido, criterio_julgamento")
                          .eq("id", cotacao?.processo_compra_id)
                          .single();
                        
                        // Buscar respostas e itens
                        const { data: respostas } = await supabase
                          .from("cotacao_respostas_fornecedor")
                          .select(`
                            id,
                            fornecedor_id,
                            fornecedores!inner(razao_social, cnpj),
                            respostas_itens:respostas_itens_fornecedor!inner(
                              item_cotacao_id,
                              valor_unitario_ofertado,
                              itens_cotacao (numero_item, quantidade)
                            )
                          `)
                          .eq('cotacao_id', cotacaoId);
                        
                        // Identificar vencedores
                        const fornecedoresVencedores: any[] = [];
                        
                        if (processoSelecionado.criterio_julgamento === 'global') {
                          const totais = respostas?.map(r => ({
                            fornecedor: r,
                            total: r.respostas_itens?.reduce((sum: number, item: any) => 
                              sum + (item.valor_unitario_ofertado * item.itens_cotacao.quantidade), 0) || 0
                          })) || [];
                          
                          const menorTotal = Math.min(...totais.map(t => t.total));
                          const vencedor = totais.find(t => t.total === menorTotal);
                          
                          if (vencedor) {
                            fornecedoresVencedores.push({
                              razaoSocial: vencedor.fornecedor.fornecedores.razao_social,
                              cnpj: vencedor.fornecedor.fornecedores.cnpj,
                              itensVencedores: vencedor.fornecedor.respostas_itens?.map((item: any) => ({
                                numero: item.itens_cotacao.numero_item,
                                valor: item.valor_unitario_ofertado * item.itens_cotacao.quantidade
                              })) || [],
                              valorTotal: vencedor.total
                            });
                          }
                        } else if (processoSelecionado.criterio_julgamento === 'por_item') {
                          const fornecedoresMap = new Map();
                          
                          respostas?.forEach(r => {
                            r.respostas_itens?.forEach((item: any) => {
                              const chave = r.fornecedores.cnpj;
                              if (!fornecedoresMap.has(chave)) {
                                fornecedoresMap.set(chave, {
                                  razaoSocial: r.fornecedores.razao_social,
                                  cnpj: r.fornecedores.cnpj,
                                  itens: []
                                });
                              }
                              fornecedoresMap.get(chave).itens.push({
                                numero: item.itens_cotacao.numero_item,
                                itemId: item.item_cotacao_id,
                                valorUnitario: item.valor_unitario_ofertado,
                                quantidade: item.itens_cotacao.quantidade
                              });
                            });
                          });
                          
                          const itensVencedores = new Map();
                          fornecedoresMap.forEach(fornec => {
                            fornec.itens.forEach((item: any) => {
                              const menorAtual = itensVencedores.get(item.itemId);
                              if (!menorAtual || item.valorUnitario < menorAtual.valorUnitario) {
                                itensVencedores.set(item.itemId, {
                                  ...item,
                                  fornecedor: fornec
                                });
                              }
                            });
                          });
                          
                          const vencedoresPorFornecedor = new Map();
                          itensVencedores.forEach(item => {
                            const cnpj = item.fornecedor.cnpj;
                            if (!vencedoresPorFornecedor.has(cnpj)) {
                              vencedoresPorFornecedor.set(cnpj, {
                                razaoSocial: item.fornecedor.razaoSocial,
                                cnpj: item.fornecedor.cnpj,
                                itensVencedores: [],
                                valorTotal: 0
                              });
                            }
                            const fornecVenc = vencedoresPorFornecedor.get(cnpj);
                            const valorItem = item.valorUnitario * item.quantidade;
                            fornecVenc.itensVencedores.push({
                              numero: item.numero,
                              valor: valorItem
                            });
                            fornecVenc.valorTotal += valorItem;
                          });
                          
                          fornecedoresVencedores.push(...Array.from(vencedoresPorFornecedor.values()));
                        }
                        
                        if (fornecedoresVencedores.length === 0) {
                          toast.error('Nenhum fornecedor vencedor identificado');
                          return;
                        }
                        
                        const result = await gerarAutorizacaoCompraDireta(
                          processoSelecionado.numero_processo_interno,
                          processoSelecionado.objeto_resumido,
                          usuarioNome,
                          usuarioCpf,
                          fornecedoresVencedores
                        );
                        setAutorizacaoDiretaUrl(result.url);
                        
                        const { data: autorizacao, error: saveError } = await (supabase as any)
                          .from("autorizacoes_processo")
                          .insert({
                            cotacao_id: cotacaoId,
                            tipo_autorizacao: 'compra_direta',
                            url_arquivo: result.url,
                            nome_arquivo: result.fileName,
                            protocolo: result.protocolo,
                            usuario_gerador_id: session?.user.id
                          })
                          .select()
                          .single();
                        
                        if (saveError) throw saveError;
                        setAutorizacaoDiretaId(autorizacao.id);
                        
                        toast.success("Autorização gerada com sucesso");
                      } catch (error) {
                        console.error("Erro ao gerar autorização:", error);
                        toast.error("Erro ao gerar autorização");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    variant="outline"
                    className="w-full"
                    disabled={loading}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Gerar Autorização
                  </Button>
                  {autorizacaoDiretaUrl && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => window.open(autorizacaoDiretaUrl, '_blank')}
                          className="flex-1"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Visualizar
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            const response = await fetch(autorizacaoDiretaUrl);
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `autorizacao-compra-direta.pdf`;
                            link.click();
                            window.URL.revokeObjectURL(url);
                          }}
                          className="flex-1"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Baixar
                        </Button>
                      </div>
                      {isResponsavelLegal && autorizacaoDiretaId && (
                        <Button
                          variant="destructive"
                          onClick={() => deletarAutorizacao(autorizacaoDiretaId)}
                          size="sm"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Deletar Autorização
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Apenas responsáveis legais podem gerar autorizações. Solicite a um responsável legal.
                </p>
              )}
            </div>
          )}

            </div>
          )}

          {/* Adicionar Novo Campo - Disponível sempre que houver fornecedor selecionado */}
          {fornecedorSelecionado && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-2">Solicitar Documentos Adicionais/Faltantes</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {documentosAprovados[fornecedorSelecionado] 
                  ? "Mesmo com documentos aprovados, você pode solicitar documentos complementares caso necessário"
                  : "Adicione apenas documentos que não constam no cadastro ou que precisam ser atualizados"}
              </p>
              <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nome_campo">Nome do Documento *</Label>
                  <Input
                    id="nome_campo"
                    value={novoCampo.nome_campo}
                    onChange={(e) => setNovoCampo({ ...novoCampo, nome_campo: e.target.value })}
                    placeholder="Ex: Certidão Negativa Atualizada, Planilha de Custos..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="descricao">Descrição/Observações</Label>
                  <Input
                    id="descricao"
                    value={novoCampo.descricao}
                    onChange={(e) => setNovoCampo({ ...novoCampo, descricao: e.target.value })}
                    placeholder="Informações adicionais sobre o documento"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="obrigatorio"
                    checked={novoCampo.obrigatorio}
                    onCheckedChange={(checked) => 
                      setNovoCampo({ ...novoCampo, obrigatorio: checked as boolean })
                    }
                  />
                  <label htmlFor="obrigatorio" className="text-sm font-medium cursor-pointer">
                    Documento obrigatório
                  </label>
                </div>
                <Button type="button" onClick={adicionarCampo}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Campo
                </Button>
              </div>
            </div>

            {/* Botão Enviar Solicitação - aparece após adicionar pelo menos um campo */}
            {campos.length > 0 && dataLimiteDocumentos && (
              <div className="pt-4 border-t">
                <Button 
                  type="button" 
                  onClick={handleEnviarSolicitacao}
                  disabled={loading}
                  className="w-full"
                >
                  Enviar Solicitação ao Fornecedor
                </Button>
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  O fornecedor receberá notificação e poderá enviar os documentos através do portal
                </p>
              </div>
            )}
              
            {/* Data Limite para Documentos */}
              {campos.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="data_limite">Data Limite para Envio dos Documentos *</Label>
                  <Input
                    id="data_limite"
                    type="date"
                    value={dataLimiteDocumentos}
                    onChange={(e) => setDataLimiteDocumentos(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <p className="text-sm text-muted-foreground">
                    O fornecedor será notificado e terá até esta data para enviar os documentos solicitados
                  </p>
                </div>
              )}

              {/* Lista de Campos Adicionados */}
              {campos.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Documentos que Serão Solicitados ao Fornecedor</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Nome do Documento</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-32">Obrigatório</TableHead>
                        <TableHead className="w-20 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campos.map((campo, index) => (
                        <TableRow key={campo.ordem}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{campo.nome_campo}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {campo.descricao || "-"}
                          </TableCell>
                          <TableCell>
                            {campo.obrigatorio ? (
                              <span className="text-destructive font-medium">Sim</span>
                            ) : (
                              <span className="text-muted-foreground">Não</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removerCampo(campo.ordem)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          
          {/* Botão OK por Fornecedor - aparece quando há documentos aprovados mas ainda não deu OK geral */}
          {fornecedorSelecionado && 
           campos.some((c: any) => c.status_solicitacao === 'aprovado') && 
           !documentosAprovados[fornecedorSelecionado] && (
            <Button 
              onClick={handleAprovarDocumentos} 
              disabled={loading || campos.some((c: any) => c.status_solicitacao === 'em_analise')}
              variant="default"
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? "Processando..." : "✓ OK por Fornecedor"}
            </Button>
          )}
          
          {/* Mensagem quando há documentos pendentes de aprovação individual */}
          {fornecedorSelecionado && 
           campos.some((c: any) => c.status_solicitacao === 'em_analise') && 
           !documentosAprovados[fornecedorSelecionado] && (
            <p className="text-sm text-amber-600 dark:text-amber-400 w-full text-center font-medium">
              ⚠️ Aprove ou rejeite todos os documentos individualmente antes de dar OK por fornecedor
            </p>
          )}
          
          {/* Indicador de fornecedor aprovado */}
          {fornecedorSelecionado && documentosAprovados[fornecedorSelecionado] && (
            <div className="w-full p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-700 dark:text-green-400 text-center font-medium">
                ✓ Documentos deste fornecedor aprovados
              </p>
            </div>
          )}
          
          {/* Botão Finalizar Processo - só habilitado quando todos aprovados */}
          <Button 
            onClick={handleFinalizar} 
            disabled={loading || !fornecedores.every(f => documentosAprovados[f.id] === true)}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? "Finalizando..." : "Finalizar Processo"}
          </Button>
          
          {!fornecedores.every(f => documentosAprovados[f.id] === true) && (
            <p className="text-sm text-muted-foreground w-full text-center">
              {fornecedores.length > 1 
                ? "Dê OK para todos os fornecedores vencedores para finalizar o processo" 
                : "Dê OK para o fornecedor vencedor para finalizar o processo"}
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
