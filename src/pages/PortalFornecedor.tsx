import { useState, useEffect } from "react";
import { DialogConsultarProposta } from "@/components/cotacoes/DialogConsultarProposta";
import { DialogEditarCadastroFornecedor } from "@/components/fornecedores/DialogEditarCadastroFornecedor";
import { DialogSelecionarResponsavelLegal } from "@/components/fornecedores/DialogSelecionarResponsavelLegal";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { LogOut, FileText, Gavel, MessageSquare, User, Upload, AlertCircle, CheckCircle, FileCheck, Pencil, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import GestaoDocumentosFornecedor from "@/components/fornecedores/GestaoDocumentosFornecedor";
import { NotificacaoRejeicao } from "@/components/fornecedores/NotificacaoRejeicao";
import { Input } from "@/components/ui/input";
import { atualizarAtaComAssinaturas } from "@/lib/gerarAtaSelecaoPDF";

export default function PortalFornecedor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [cotacoes, setCotacoes] = useState<any[]>([]);
  const [selecoes, setSelecoes] = useState<any[]>([]);
  const [documentosPendentes, setDocumentosPendentes] = useState<any[]>([]);
  const [documentosPendentesSelecao, setDocumentosPendentesSelecao] = useState<any[]>([]);
  const [atasPendentes, setAtasPendentes] = useState<any[]>([]);
  const [inabilitacoesPendentes, setInabilitacoesPendentes] = useState<any[]>([]);
  const [assinandoAta, setAssinandoAta] = useState<string | null>(null);
  const [dialogConsultarOpen, setDialogConsultarOpen] = useState(false);
  const [cotacaoSelecionada, setCotacaoSelecionada] = useState<string>("");
  const [dialogEditarCadastroOpen, setDialogEditarCadastroOpen] = useState(false);
  const [dialogResponsavelLegalOpen, setDialogResponsavelLegalOpen] = useState(false);
  const [assinaturaParaAssinar, setAssinaturaParaAssinar] = useState<string | null>(null);


  useEffect(() => {
    checkAuth();
  }, []);

  // Realtime subscription para atualizar seleções automaticamente
  useEffect(() => {
    if (!fornecedor) return;

    console.log("🔄 Iniciando subscription realtime para seleções...");

    const channel = supabase
      .channel(`selecoes-fornecedor-${fornecedor.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'selecoes_fornecedores'
        },
        (payload) => {
          console.log("📡 Recebido UPDATE em selecoes_fornecedores:", payload);
          // Recarregar seleções quando houver mudanças
          loadSelecoes(fornecedor.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'selecoes_fornecedores'
        },
        (payload) => {
          console.log("📡 Recebido INSERT em selecoes_fornecedores:", payload);
          loadSelecoes(fornecedor.id);
        }
      )
      .subscribe((status) => {
        console.log("📡 Status subscription realtime:", status);
      });

    return () => {
      console.log("🛑 Removendo subscription realtime...");
      supabase.removeChannel(channel);
    };
  }, [fornecedor]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Verificar se é fornecedor
    const { data: fornecedorData, error } = await supabase
      .from("fornecedores")
      .select("*")
      .eq("user_id", session.user.id)
      .single();

    if (error || !fornecedorData) {
      toast.error("Acesso negado. Este portal é exclusivo para fornecedores.");
      navigate("/dashboard");
      return;
    }

    setFornecedor(fornecedorData);
    await loadCotacoes(fornecedorData.id);
    await loadSelecoes(fornecedorData.id);
    await loadDocumentosPendentes(fornecedorData.id);
    await loadDocumentosPendentesSelecao(fornecedorData.id);
    await loadAtasPendentes(fornecedorData.id);
    await loadInabilitacoesPendentes(fornecedorData.id);
    setLoading(false);
  };

  const loadCotacoes = async (fornecedorId: string) => {
    try {
      // Buscar cotações onde o fornecedor respondeu
      const { data: respostas, error: respostasError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          cotacao_id,
          created_at,
          cotacoes_precos (
            id,
            titulo_cotacao,
            descricao_cotacao,
            data_limite_resposta,
            status_cotacao
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .order("created_at", { ascending: false });

      if (respostasError) throw respostasError;

      // Transformar para formato compatível com a interface
      const cotacoesFormatadas = (respostas || []).map((resposta: any) => ({
        id: resposta.cotacao_id,
        created_at: resposta.created_at,
        cotacoes_precos: resposta.cotacoes_precos
      }));

      setCotacoes(cotacoesFormatadas);
    } catch (error: any) {
      toast.error("Erro ao carregar cotações");
    }
  };

  const loadSelecoes = async (fornecedorId: string) => {
    try {
      console.log("📋 Carregando seleções para fornecedor:", fornecedorId);
      
      // Buscar seleções onde o fornecedor enviou proposta
      const { data, error } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          id,
          created_at,
          data_envio_proposta,
          selecao_id,
          selecoes_fornecedores (
            id,
            titulo_selecao,
            descricao,
            data_sessao_disputa,
            hora_sessao_disputa,
            status_selecao
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      console.log("✅ Seleções carregadas:", data);
      data?.forEach(s => {
        console.log(`  - ${s.selecoes_fornecedores?.titulo_selecao}: Data=${s.selecoes_fornecedores?.data_sessao_disputa}, Hora=${s.selecoes_fornecedores?.hora_sessao_disputa}`);
      });
      
      setSelecoes(data || []);
    } catch (error: any) {
      console.error("❌ Erro ao carregar seleções:", error);
      toast.error("Erro ao carregar seleções");
    }
  };

  const loadDocumentosPendentes = async (fornecedorId: string) => {
    try {
      console.log("🔍 Carregando documentos pendentes de cotação para fornecedor:", fornecedorId);
      
      // Buscar documentos solicitados em cotações de preços (não seleções)
      // Status "pendente" = recém solicitado pelo gestor, aguardando envio
      // Status "rejeitado" = recusado pelo gestor e precisa ser reenviado
      // Status "em_analise" = enviado pelo fornecedor, pode atualizar
      const { data: camposSolicitados, error: camposError } = await supabase
        .from("campos_documentos_finalizacao")
        .select(`
          id,
          nome_campo,
          descricao,
          obrigatorio,
          cotacao_id,
          selecao_id,
          status_solicitacao,
          cotacoes_precos (
            titulo_cotacao
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .not("cotacao_id", "is", null)
        .is("selecao_id", null)
        .eq("status_solicitacao", "pendente"); // Apenas pendentes, não em análise

      if (camposError) {
        console.error("❌ Erro ao buscar campos solicitados:", camposError);
        throw camposError;
      }

      console.log("📋 Campos solicitados encontrados:", camposSolicitados);

      if (!camposSolicitados || camposSolicitados.length === 0) {
        console.log("ℹ️ Nenhum documento pendente encontrado");
        setDocumentosPendentes([]);
        return;
      }

      // Buscar documentos já enviados
      const { data: docsEnviados } = await supabase
        .from("documentos_finalizacao_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .in("campo_documento_id", camposSolicitados.map(c => c.id));

      const docsEnviadosMap = new Map(docsEnviados?.map(d => [d.campo_documento_id, d]) || []);

      // Agrupar por cotação
      const cotacoesMap = new Map();
      
      for (const campo of camposSolicitados) {
        if (!cotacoesMap.has(campo.cotacao_id)) {
          cotacoesMap.set(campo.cotacao_id, {
            id: campo.cotacao_id,
            titulo_cotacao: campo.cotacoes_precos?.titulo_cotacao || "Processo sem título",
            campos_documentos_finalizacao: []
          });
        }

        const docEnviado = docsEnviadosMap.get(campo.id);
        cotacoesMap.get(campo.cotacao_id).campos_documentos_finalizacao.push({
          ...campo,
          enviado: campo.status_solicitacao === "em_analise",
          arquivo: docEnviado || null
        });
      }

      const documentosAgrupados = Array.from(cotacoesMap.values());
      console.log("✅ Documentos agrupados por cotação:", documentosAgrupados);
      setDocumentosPendentes(documentosAgrupados);
    } catch (error: any) {
      console.error("❌ Erro ao carregar documentos pendentes:", error);
    }
  };

  const loadDocumentosPendentesSelecao = async (fornecedorId: string) => {
    try {
      console.log("🔍 Carregando documentos pendentes de seleção para fornecedor:", fornecedorId);
      
      // Buscar documentos solicitados em seleções de fornecedores
      // APENAS status "pendente" significa que fornecedor ainda não enviou
      // Outros status (em_analise, aprovado, rejeitado) significam que já foi tratado
      const { data: camposSolicitados, error: camposError } = await supabase
        .from("campos_documentos_finalizacao")
        .select(`
          id,
          nome_campo,
          descricao,
          obrigatorio,
          selecao_id,
          status_solicitacao,
          selecoes_fornecedores (
            titulo_selecao,
            numero_selecao
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .not("selecao_id", "is", null)
        .eq("status_solicitacao", "pendente");

      if (camposError) {
        console.error("❌ Erro ao buscar campos solicitados de seleção:", camposError);
        throw camposError;
      }

      console.log("📋 Campos de seleção encontrados:", camposSolicitados);
      
      // Log detalhado de cada campo encontrado
      if (camposSolicitados && camposSolicitados.length > 0) {
        camposSolicitados.forEach(campo => {
          console.log(`🔍 Campo encontrado: ${campo.nome_campo}, Status: ${campo.status_solicitacao}`);
        });
      }

      if (!camposSolicitados || camposSolicitados.length === 0) {
        console.log("ℹ️ Nenhum documento pendente de seleção encontrado");
        setDocumentosPendentesSelecao([]);
        return;
      }

      // Buscar documentos já enviados
      const { data: docsEnviados } = await supabase
        .from("documentos_finalizacao_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .in("campo_documento_id", camposSolicitados.map(c => c.id));

      const docsEnviadosMap = new Map(docsEnviados?.map(d => [d.campo_documento_id, d]) || []);

      // Agrupar por seleção
      const selecoesMap = new Map();
      
      for (const campo of camposSolicitados) {
        if (!selecoesMap.has(campo.selecao_id)) {
          selecoesMap.set(campo.selecao_id, {
            id: campo.selecao_id,
            titulo_selecao: campo.selecoes_fornecedores?.titulo_selecao || "Seleção sem título",
            numero_selecao: campo.selecoes_fornecedores?.numero_selecao || "",
            campos_documentos_finalizacao: []
          });
        }

        const docEnviado = docsEnviadosMap.get(campo.id);
        selecoesMap.get(campo.selecao_id).campos_documentos_finalizacao.push({
          ...campo,
          enviado: campo.status_solicitacao === "em_analise",
          arquivo: docEnviado || null
        });
      }

      const documentosAgrupados = Array.from(selecoesMap.values());
      console.log("✅ Documentos de seleção agrupados:", documentosAgrupados);
      setDocumentosPendentesSelecao(documentosAgrupados);
    } catch (error: any) {
      console.error("❌ Erro ao carregar documentos pendentes de seleção:", error);
    }
  };

  const loadAtasPendentes = async (fornecedorId: string) => {
    try {
      const { data, error } = await supabase
        .from("atas_assinaturas_fornecedor")
        .select(`
          *,
          atas_selecao (
            id,
            protocolo,
            nome_arquivo,
            url_arquivo,
            data_geracao,
            selecao_id,
            selecoes_fornecedores (
              numero_selecao,
              titulo_selecao
            )
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .eq("status_assinatura", "pendente");

      if (error) throw error;
      setAtasPendentes(data || []);
    } catch (error) {
      console.error("Erro ao carregar atas pendentes:", error);
    }
  };

  const loadInabilitacoesPendentes = async (fornecedorId: string) => {
    try {
      console.log("🔍 Carregando inabilitações pendentes de recurso...");
      
      // Buscar rejeições em cotações onde o fornecedor ainda pode recorrer
      // (não revertidas e SEM recurso já enviado - apenas 'sem_recurso' ou null)
      // Exclui também 'declinou_recurso' pois fornecedor optou por não recorrer
      const { data: rejeicoes, error } = await supabase
        .from("fornecedores_rejeitados_cotacao")
        .select(`
          id,
          motivo_rejeicao,
          data_rejeicao,
          status_recurso,
          cotacao_id,
          cotacoes_precos (
            titulo_cotacao,
            processo_compra_id,
            processos_compras (
              numero_processo_interno
            )
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .eq("revertido", false)
        .or("status_recurso.is.null,status_recurso.eq.sem_recurso");

      if (error) throw error;
      
      console.log("✅ Inabilitações encontradas:", rejeicoes);
      setInabilitacoesPendentes(rejeicoes || []);
    } catch (error) {
      console.error("❌ Erro ao carregar inabilitações pendentes:", error);
    }
  };

  const handleAssinarAta = async (assinaturaId: string) => {
    // Verificar se há múltiplos responsáveis legais
    const responsaveisLegais = fornecedor?.responsaveis_legais || [];
    
    if (Array.isArray(responsaveisLegais) && responsaveisLegais.length > 1) {
      // Abrir diálogo para seleção
      setAssinaturaParaAssinar(assinaturaId);
      setDialogResponsavelLegalOpen(true);
      return;
    }

    // Se houver apenas um ou nenhum, usar o responsável existente ou vazio
    const responsaveis = responsaveisLegais.length === 1 ? responsaveisLegais : [];
    await executarAssinatura(assinaturaId, responsaveis);
  };

  const executarAssinatura = async (assinaturaId: string, responsaveisAssinantes: string[]) => {
    setAssinandoAta(assinaturaId);
    try {
      // Buscar o ata_id associado a esta assinatura
      const { data: assinaturaData, error: assinaturaError } = await supabase
        .from("atas_assinaturas_fornecedor")
        .select("ata_id")
        .eq("id", assinaturaId)
        .single();

      if (assinaturaError) throw assinaturaError;

      // Atualizar o status da assinatura
      const { error } = await supabase
        .from("atas_assinaturas_fornecedor")
        .update({
          status_assinatura: "aceito",
          data_assinatura: new Date().toISOString(),
          ip_assinatura: "browser",
          responsaveis_assinantes: responsaveisAssinantes,
        })
        .eq("id", assinaturaId);

      if (error) throw error;

      // Atualizar o PDF da ata com a nova assinatura
      console.log("Iniciando atualização do PDF da ata:", assinaturaData.ata_id);
      await atualizarAtaComAssinaturas(assinaturaData.ata_id);
      console.log("PDF da ata atualizado com sucesso!");

      toast.success("Ata assinada digitalmente com sucesso!");
      await loadAtasPendentes(fornecedor.id);
    } catch (error) {
      console.error("Erro ao assinar ata:", error);
      toast.error("Erro ao assinar ata: " + (error as Error).message);
    } finally {
      setAssinandoAta(null);
      setDialogResponsavelLegalOpen(false);
      setAssinaturaParaAssinar(null);
    }
  };

  const handleConfirmarResponsavelLegal = async (selecionados: string[]) => {
    if (assinaturaParaAssinar) {
      await executarAssinatura(assinaturaParaAssinar, selecionados);
    }
  };

  const handleUploadDocumento = async (campoId: string, file: File) => {
    console.log("🚀 Iniciando upload de documento:", { campoId, fileName: file.name, fornecedor: fornecedor?.id });
    
    if (!fornecedor) {
      console.error("❌ Fornecedor não encontrado");
      toast.error("Fornecedor não identificado");
      return;
    }

    try {
      // Buscar o nome do campo de documento
      const { data: campoData } = await supabase
        .from('campos_documentos_finalizacao')
        .select('nome_campo')
        .eq('id', campoId)
        .single();

      const nomeCampo = campoData?.nome_campo || 'Documento';
      
      // Sanitizar nomes para uso em arquivo
      const sanitizedNomeCampo = nomeCampo.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedRazaoSocial = fornecedor.razao_social.replace(/[^a-zA-Z0-9]/g, '_');

      console.log("📤 Fazendo upload para storage...");
      const fileExt = file.name.split('.').pop();
      // Salvar na categoria habilitacao com nome do campo + empresa
      const fileName = `habilitacao/${sanitizedNomeCampo}_${sanitizedRazaoSocial}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('processo-anexos')
        .upload(fileName, file);

      if (uploadError) {
        console.error("❌ Erro no upload do storage:", uploadError);
        throw uploadError;
      }

      console.log("✅ Upload no storage concluído");

      const { data: { publicUrl } } = supabase.storage
        .from('processo-anexos')
        .getPublicUrl(fileName);

      console.log("📝 Salvando registro do documento...");
      
      // Usar upsert para inserir ou atualizar automaticamente
      // nome_arquivo com formato: Nome do Campo - Razão Social
      const { error: upsertError } = await supabase
        .from('documentos_finalizacao_fornecedor')
        .upsert({
          fornecedor_id: fornecedor.id,
          campo_documento_id: campoId,
          url_arquivo: publicUrl,
          nome_arquivo: `${nomeCampo} - ${fornecedor.razao_social}`,
          data_upload: new Date().toISOString()
        }, {
          onConflict: 'fornecedor_id,campo_documento_id'
        });

      if (upsertError) {
        console.error("❌ Erro ao salvar documento:", upsertError);
        throw upsertError;
      }

      console.log("✅ Documento salvo no banco");
      console.log("🔄 Atualizando status do campo...");

      // Atualizar status do campo para "em_analise"
      const { error: updateError } = await supabase
        .from('campos_documentos_finalizacao')
        .update({ 
          status_solicitacao: 'em_analise',
          data_conclusao: new Date().toISOString()
        })
        .eq('id', campoId);

      if (updateError) {
        console.error("❌ Erro ao atualizar status:", updateError);
        throw updateError;
      }

      console.log("✅ Status atualizado com sucesso!");
      toast.success("Documento enviado com sucesso!");
      
      console.log("🔄 Recarregando lista de documentos pendentes...");
      await loadDocumentosPendentes(fornecedor.id);
      console.log("✅ Lista recarregada!");
    } catch (error: any) {
      console.error("❌ Erro ao fazer upload:", error);
      toast.error("Erro ao enviar documento");
    }
  };

  const handleUploadDocumentoSelecao = async (campoId: string, file: File) => {
    console.log("🚀 Iniciando upload de documento de seleção:", { campoId, fileName: file.name, fornecedor: fornecedor?.id });
    
    if (!fornecedor) {
      console.error("❌ Fornecedor não encontrado");
      toast.error("Fornecedor não identificado");
      return;
    }

    try {
      // Buscar o nome do campo para usar no nome do arquivo
      const { data: campoData } = await supabase
        .from('campos_documentos_finalizacao')
        .select('nome_campo')
        .eq('id', campoId)
        .single();
      
      const nomeCampo = campoData?.nome_campo || 'documento';
      // Sanitizar nome do campo e razão social para usar em nome de arquivo
      const nomeCampoSanitizado = nomeCampo.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').replace(/\s+/g, '_');
      const razaoSocialSanitizada = fornecedor.razao_social.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').replace(/\s+/g, '_');
      
      console.log("📤 Fazendo upload para storage...");
      const fileExt = file.name.split('.').pop();
      const fileName = `habilitacao/${nomeCampoSanitizado}_${razaoSocialSanitizada}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('processo-anexos')
        .upload(fileName, file);

      if (uploadError) {
        console.error("❌ Erro no upload do storage:", uploadError);
        throw uploadError;
      }

      console.log("✅ Upload no storage concluído");

      const { data: { publicUrl } } = supabase.storage
        .from('processo-anexos')
        .getPublicUrl(fileName);

      console.log("📝 Salvando registro do documento...");
      
      // Nome do arquivo para exibição: nome do campo + nome da empresa
      const nomeArquivoExibicao = `${nomeCampo} - ${fornecedor.razao_social}`;
      
      // Usar upsert para inserir ou atualizar automaticamente
      const { error: upsertError } = await supabase
        .from('documentos_finalizacao_fornecedor')
        .upsert({
          fornecedor_id: fornecedor.id,
          campo_documento_id: campoId,
          url_arquivo: publicUrl,
          nome_arquivo: nomeArquivoExibicao,
          data_upload: new Date().toISOString()
        }, {
          onConflict: 'fornecedor_id,campo_documento_id'
        });

      if (upsertError) {
        console.error("❌ Erro ao salvar documento:", upsertError);
        throw upsertError;
      }

      console.log("✅ Documento salvo no banco");
      console.log("🔄 Atualizando status do campo...");

      // Atualizar status do campo para "em_analise"
      const { error: updateError } = await supabase
        .from('campos_documentos_finalizacao')
        .update({ 
          status_solicitacao: 'em_analise',
          data_conclusao: new Date().toISOString()
        })
        .eq('id', campoId);

      if (updateError) {
        console.error("❌ Erro ao atualizar status:", updateError);
        throw updateError;
      }

      console.log("✅ Status atualizado com sucesso!");
      
      // Verificar se o update realmente funcionou
      const { data: campoVerificacao } = await supabase
        .from('campos_documentos_finalizacao')
        .select('status_solicitacao')
        .eq('id', campoId)
        .single();
      
      console.log("🔍 Status verificado no banco:", campoVerificacao?.status_solicitacao);
      
      toast.success("Documento enviado com sucesso!");
      
      // Pequeno delay para garantir que o banco foi atualizado
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log("🔄 Recarregando lista de documentos pendentes de seleção...");
      await loadDocumentosPendentesSelecao(fornecedor.id);
      console.log("✅ Lista recarregada!");
    } catch (error: any) {
      console.error("❌ Erro ao fazer upload:", error);
      toast.error("Erro ao enviar documento");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getStatusCotacaoBadge = (status: string) => {
    switch (status) {
      case "em_aberto":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600">Em Aberto</Badge>;
      case "encerrada":
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-600">Encerrada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusSelecaoBadge = (status: string) => {
    switch (status) {
      case "planejada":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">Planejada</Badge>;
      case "em_andamento":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Em Andamento</Badge>;
      case "concluida":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600">Concluída</Badge>;
      case "cancelada":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600">Cancelada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Portal do Fornecedor</h1>
              <p className="text-sm text-muted-foreground">{fornecedor?.razao_social}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Alerta de Documentos Pendentes */}
        {(documentosPendentes.length > 0 || documentosPendentesSelecao.length > 0) && (
          <Card className="mb-6 border-orange-500/50 bg-orange-500/10">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-orange-700 dark:text-orange-400 mb-2">
                    ⚠️ Você possui documentos pendentes de envio!
                  </p>
                  <p className="text-sm text-orange-600 dark:text-orange-300">
                    Acesse a aba {documentosPendentes.length > 0 && documentosPendentesSelecao.length > 0 
                      ? '"Cotações de Preços" ou "Seleções"' 
                      : documentosPendentes.length > 0 
                        ? '"Cotações de Preços"' 
                        : '"Seleções"'} para visualizar e enviar os documentos solicitados.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alerta de Atas Pendentes de Assinatura */}
        {atasPendentes.length > 0 && (
          <Card className="mb-6 border-blue-500/50 bg-blue-500/10">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <FileCheck className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-blue-700 dark:text-blue-400 mb-3">
                    📋 Você possui {atasPendentes.length} ata(s) pendente(s) de assinatura digital!
                  </p>
                  <div className="space-y-3">
                    {atasPendentes.map((assinatura) => (
                      <div key={assinatura.id} className="flex items-center justify-between p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg border">
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            Seleção: {assinatura.atas_selecao?.selecoes_fornecedores?.numero_selecao || "N/A"} - {assinatura.atas_selecao?.selecoes_fornecedores?.titulo_selecao || "Sem título"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Protocolo: {assinatura.atas_selecao?.protocolo?.substring(0, 16).toUpperCase().replace(/(.{4})/g, '$1-').slice(0, -1)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(assinatura.atas_selecao?.url_arquivo, "_blank")}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Ver Ata
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAssinarAta(assinatura.id)}
                            disabled={assinandoAta === assinatura.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {assinandoAta === assinatura.id ? "Assinando..." : "Aceitar/Assinar"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alerta de Inabilitações em Cotações - Possibilidade de Recurso */}
        {inabilitacoesPendentes.length > 0 && (
          <Card className="mb-6 border-red-500/50 bg-red-500/10">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-700 dark:text-red-400 mb-3">
                    ⚠️ Você foi inabilitado em {inabilitacoesPendentes.length} cotação(ões)! Você pode apresentar recurso.
                  </p>
                  <div className="space-y-3">
                    {inabilitacoesPendentes.map((inabilitacao) => (
                      <div key={inabilitacao.id} className="p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg border">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {inabilitacao.cotacoes_precos?.processos_compras?.numero_processo_interno || "Processo"} - {inabilitacao.cotacoes_precos?.titulo_cotacao || "Cotação"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Motivo: {inabilitacao.motivo_rejeicao}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Data: {new Date(inabilitacao.data_rejeicao).toLocaleDateString()}
                            </p>
                            {inabilitacao.status_recurso && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                Recurso: {inabilitacao.status_recurso === 'pendente' ? 'Em análise' : 
                                         inabilitacao.status_recurso === 'indeferido' ? 'Indeferido' : 
                                         inabilitacao.status_recurso}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-300 mt-3">
                    Acesse a aba "Cotações de Preços" para visualizar detalhes e enviar seu recurso.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {fornecedor?.status_aprovacao === "pendente" && (
          <Card className="mb-6 border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-6">
              <p className="text-center text-yellow-700 dark:text-yellow-400">
                ⏳ Seu cadastro está pendente de aprovação pelo gestor. Você receberá um e-mail quando for aprovado.
                <br />
                <strong>Enquanto isso, você pode participar de cotações e seleções de fornecedores.</strong>
              </p>
            </CardContent>
          </Card>
        )}

        {fornecedor?.status_aprovacao === "reprovado" && (
          <Card className="mb-6 border-red-500/50 bg-red-500/5">
            <CardContent className="pt-6">
              <p className="text-center text-red-700 dark:text-red-400">
                ❌ Seu cadastro foi reprovado. Entre em contato com o departamento de compras para mais informações.
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="perfil" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="perfil">
              <User className="mr-2 h-4 w-4" />
              Meu Perfil
            </TabsTrigger>
            <TabsTrigger value="cotacoes">
              <FileText className="mr-2 h-4 w-4" />
              Cotações de Preços
            </TabsTrigger>
            <TabsTrigger value="selecoes">
              <Gavel className="mr-2 h-4 w-4" />
              Seleções
            </TabsTrigger>
            <TabsTrigger value="contato">
              <MessageSquare className="mr-2 h-4 w-4" />
              Contato
            </TabsTrigger>
          </TabsList>

          <TabsContent value="perfil">
            <div className="space-y-6">
              {/* Informações do Cadastro */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Informações do Cadastro</CardTitle>
                    <CardDescription>
                      Dados do seu cadastro como fornecedor
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialogEditarCadastroOpen(true)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Razão Social</p>
                      <p className="font-medium">{fornecedor?.razao_social}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Nome Fantasia</p>
                      <p className="font-medium">{fornecedor?.nome_fantasia || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">CNPJ</p>
                      <p className="font-medium">{fornecedor?.cnpj}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Telefone</p>
                      <p className="font-medium">{fornecedor?.telefone || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">E-mail</p>
                      <p className="font-medium">{fornecedor?.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status do Cadastro</p>
                      <Badge 
                        variant="outline" 
                        className={
                          fornecedor?.status_aprovacao === 'aprovado' 
                            ? 'bg-green-500/10 text-green-600'
                            : fornecedor?.status_aprovacao === 'pendente'
                            ? 'bg-yellow-500/10 text-yellow-600'
                            : 'bg-red-500/10 text-red-600'
                        }
                      >
                        {fornecedor?.status_aprovacao === 'aprovado' ? 'Aprovado' : 
                         fornecedor?.status_aprovacao === 'pendente' ? 'Pendente' : 'Reprovado'}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Endereço</p>
                      <p className="font-medium">{fornecedor?.endereco_comercial || "-"}</p>
                    </div>
                    {fornecedor?.responsaveis_legais && Array.isArray(fornecedor.responsaveis_legais) && fornecedor.responsaveis_legais.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Responsáveis Legais</p>
                        <p className="font-medium">{fornecedor.responsaveis_legais.join(", ")}</p>
                      </div>
                    )}
                    {fornecedor?.status_aprovacao === 'aprovado' && (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">Data de Aprovação</p>
                          <p className="font-medium">
                            {fornecedor?.data_aprovacao 
                              ? new Date(fornecedor.data_aprovacao).toLocaleDateString()
                              : "-"}
                          </p>
                        </div>
                        {fornecedor?.data_validade_certificado && (
                          <div>
                             <p className="text-sm text-muted-foreground">Validade do Certificado</p>
                             <p className="font-medium">
                               {fornecedor.data_validade_certificado.split('T')[0].split('-').reverse().join('/')}
                             </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Gestão de Documentos - Disponível para todos os fornecedores */}
              {fornecedor?.id && (
                <GestaoDocumentosFornecedor fornecedorId={fornecedor.id} />
              )}
            </div>
          </TabsContent>

          <TabsContent value="cotacoes">
            <div className="space-y-6">
              {/* Notificação de Rejeição com Recurso */}
              {fornecedor?.id && (
                <NotificacaoRejeicao 
                  fornecedorId={fornecedor.id} 
                  onRecursoEnviado={() => loadInabilitacoesPendentes(fornecedor.id)}
                />
              )}

              {/* Documentos Pendentes de Cotações */}
              {documentosPendentes.length > 0 && (
                <Card className="border-orange-500/50 bg-orange-500/10">
                  <CardHeader>
                    <CardTitle className="text-orange-700 dark:text-orange-400">
                      📋 Documentos Solicitados - Finalização de Processos
                    </CardTitle>
                    <CardDescription className="text-orange-600 dark:text-orange-300">
                      Você foi selecionado como vencedor! Envie os documentos solicitados para conclusão dos processos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {documentosPendentes.map((cotacao: any) => (
                      <div key={cotacao.id} className="border rounded-lg p-4 bg-background">
                        <div className="mb-4">
                          <h4 className="font-semibold text-lg">{cotacao.titulo_cotacao}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Processo de Compra Direta - Documentos Adicionais
                          </p>
                        </div>
                        <div className="space-y-3">
                          {cotacao.campos_documentos_finalizacao.map((campo: any) => (
                            <div key={campo.id} className="p-4 bg-muted/30 rounded-lg border-2 border-dashed">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-medium text-base">{campo.nome_campo}</p>
                                    {campo.obrigatorio && (
                                      <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
                                    )}
                                    {campo.status_solicitacao === "aprovado" && (
                                      <Badge className="bg-green-600 text-white text-xs">
                                        ✓ Aprovado
                                      </Badge>
                                    )}
                                    {campo.status_solicitacao === "em_analise" && (
                                      <Badge className="bg-blue-600 text-white text-xs">
                                        ⏳ Em Análise
                                      </Badge>
                                    )}
                                    {campo.status_solicitacao === "rejeitado" && (
                                      <Badge variant="destructive" className="text-xs">
                                        ❌ Rejeitado
                                      </Badge>
                                    )}
                                    {campo.status_solicitacao === "pendente" && campo.enviado && (
                                      <Badge className="bg-orange-600 text-white text-xs">
                                        🔄 Atualização Solicitada
                                      </Badge>
                                    )}
                                  </div>
                                  {campo.descricao && campo.status_solicitacao === "rejeitado" && (
                                    <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                                      <strong>Motivo da rejeição:</strong> {campo.descricao}
                                    </p>
                                  )}
                                  {campo.descricao && campo.status_solicitacao === "pendente" && campo.enviado && (
                                    <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
                                      <strong>Motivo da solicitação:</strong> {campo.descricao}
                                    </p>
                                  )}
                                  {campo.descricao && campo.status_solicitacao !== "rejeitado" && campo.status_solicitacao !== "pendente" && (
                                    <p className="text-sm text-muted-foreground mb-3">{campo.descricao}</p>
                                  )}
                                  {campo.arquivo && (
                                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                                      <a 
                                        href={campo.arquivo.url_arquivo} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-sm text-green-700 dark:text-green-400 hover:underline flex items-center gap-2"
                                      >
                                        <FileText className="h-4 w-4" />
                                        {campo.arquivo.nome_arquivo}
                                      </a>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-2">
                                  {/* Visualizar - sempre disponível se tem arquivo */}
                                  {campo.arquivo && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => window.open(campo.arquivo.url_arquivo, "_blank")}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      Visualizar
                                    </Button>
                                  )}
                                  
                                  {/* Enviar/Atualizar - apenas quando status é "pendente" */}
                                  {campo.status_solicitacao === "pendente" && (
                                    <>
                                      <Input
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) handleUploadDocumento(campo.id, file);
                                        }}
                                        className="hidden"
                                        id={`upload-${campo.id}`}
                                      />
                                      <Button
                                        size="sm"
                                        onClick={() => document.getElementById(`upload-${campo.id}`)?.click()}
                                        className="bg-orange-600 hover:bg-orange-700"
                                      >
                                        <Upload className="h-4 w-4 mr-2" />
                                        {campo.enviado ? "Atualizar PDF" : "Enviar PDF"}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Lista de Cotações */}
              <Card>
                <CardHeader>
                  <CardTitle>Minhas Cotações de Preços</CardTitle>
                  <CardDescription>
                    Cotações em que você foi convidado a participar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {cotacoes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Você ainda não foi convidado para nenhuma cotação.
                    </p>
                  ) : (
                    <div className="space-y-4">
                    {cotacoes.map((cotacao) => (
                      <div key={cotacao.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">
                              {cotacao.cotacoes_precos?.titulo_cotacao}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {cotacao.cotacoes_precos?.descricao_cotacao}
                            </p>
                            <div className="flex gap-4 mt-3 text-sm">
                              <span>
                                Data de Envio: {new Date(cotacao.created_at).toLocaleDateString()}
                              </span>
                              {getStatusCotacaoBadge(cotacao.cotacoes_precos?.status_cotacao)}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => {
                              setCotacaoSelecionada(cotacao.id);
                              setDialogConsultarOpen(true);
                            }}
                          >
                            Consultar Proposta
                          </Button>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="selecoes">
            <div className="space-y-6">
              {/* Documentos Pendentes de Seleções */}
              {documentosPendentesSelecao.length > 0 && (
                <Card className="border-blue-500/50 bg-blue-500/10">
                  <CardHeader>
                    <CardTitle className="text-blue-700 dark:text-blue-400">
                      📋 Documentos Solicitados - Seleção de Fornecedores
                    </CardTitle>
                    <CardDescription className="text-blue-600 dark:text-blue-300">
                      Você foi selecionado como vencedor! Envie os documentos solicitados para conclusão do processo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {documentosPendentesSelecao.map((selecao: any) => (
                      <div key={selecao.id} className="border rounded-lg p-4 bg-background">
                        <div className="mb-4">
                          <h4 className="font-semibold text-lg">
                            {selecao.numero_selecao ? `${selecao.numero_selecao} - ` : ""}{selecao.titulo_selecao}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Seleção de Fornecedores - Documentos Adicionais
                          </p>
                        </div>
                        <div className="space-y-3">
                          {selecao.campos_documentos_finalizacao.map((campo: any) => (
                            <div key={campo.id} className="p-4 bg-muted/30 rounded-lg border-2 border-dashed">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-medium text-base">{campo.nome_campo}</p>
                                    {campo.obrigatorio && (
                                      <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
                                    )}
                                    {campo.status_solicitacao === "aprovado" && (
                                      <Badge className="bg-green-600 text-white text-xs">
                                        ✓ Aprovado
                                      </Badge>
                                    )}
                                    {campo.status_solicitacao === "em_analise" && (
                                      <Badge className="bg-blue-600 text-white text-xs">
                                        ⏳ Em Análise
                                      </Badge>
                                    )}
                                    {campo.status_solicitacao === "rejeitado" && (
                                      <Badge variant="destructive" className="text-xs">
                                        ❌ Rejeitado
                                      </Badge>
                                    )}
                                    {campo.status_solicitacao === "pendente" && campo.enviado && (
                                      <Badge className="bg-orange-600 text-white text-xs">
                                        🔄 Atualização Solicitada
                                      </Badge>
                                    )}
                                  </div>
                                  {campo.descricao && campo.status_solicitacao === "rejeitado" && (
                                    <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                                      <strong>Motivo da rejeição:</strong> {campo.descricao}
                                    </p>
                                  )}
                                  {campo.descricao && campo.status_solicitacao === "pendente" && campo.enviado && (
                                    <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
                                      <strong>Motivo da solicitação:</strong> {campo.descricao}
                                    </p>
                                  )}
                                  {campo.descricao && campo.status_solicitacao !== "rejeitado" && campo.status_solicitacao !== "pendente" && (
                                    <p className="text-sm text-muted-foreground mb-3">{campo.descricao}</p>
                                  )}
                                  {campo.arquivo && (
                                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                                      <a 
                                        href={campo.arquivo.url_arquivo} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-sm text-green-700 dark:text-green-400 hover:underline flex items-center gap-2"
                                      >
                                        <FileText className="h-4 w-4" />
                                        {campo.arquivo.nome_arquivo}
                                      </a>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-2">
                                  {/* Visualizar - sempre disponível se tem arquivo */}
                                  {campo.arquivo && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => window.open(campo.arquivo.url_arquivo, "_blank")}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      Visualizar
                                    </Button>
                                  )}
                                  
                                  {/* Enviar/Atualizar - apenas quando status é "pendente" */}
                                  {campo.status_solicitacao === "pendente" && (
                                    <>
                                      <Input
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) handleUploadDocumentoSelecao(campo.id, file);
                                        }}
                                        className="hidden"
                                        id={`upload-selecao-${campo.id}`}
                                      />
                                      <Button
                                        size="sm"
                                        onClick={() => document.getElementById(`upload-selecao-${campo.id}`)?.click()}
                                        className="bg-blue-600 hover:bg-blue-700"
                                      >
                                        <Upload className="h-4 w-4 mr-2" />
                                        {campo.enviado ? "Atualizar PDF" : "Enviar PDF"}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Lista de Seleções */}
              <Card>
                <CardHeader>
                  <CardTitle>Minhas Seleções de Fornecedores</CardTitle>
                  <CardDescription>
                    Processos seletivos em que você apresentou proposta
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selecoes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Você ainda não foi convidado para nenhuma seleção.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {selecoes.map((convite) => (
                        <div key={convite.id} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold">
                                {convite.selecoes_fornecedores?.titulo_selecao}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                {convite.selecoes_fornecedores?.descricao}
                              </p>
                              <div className="flex gap-4 mt-3 text-sm">
                                <span>
                                  Data: {convite.selecoes_fornecedores?.data_sessao_disputa?.split('-').reverse().join('/')}
                                </span>
                                <span>
                                  Horário: {convite.selecoes_fornecedores?.hora_sessao_disputa}
                                </span>
                                {getStatusSelecaoBadge(convite.selecoes_fornecedores?.status_selecao)}
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              onClick={() => navigate(`/sistema-lances-fornecedor?proposta=${convite.id}`)}
                            >
                              Participar/Editar Proposta
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="contato">
            <Card>
              <CardHeader>
                <CardTitle>Contato com Departamento de Compras</CardTitle>
                <CardDescription>
                  Entre em contato para dúvidas ou suporte
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate("/contatos")}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Abrir Página de Contato
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog para consultar proposta */}
      {fornecedor && (
        <DialogConsultarProposta
          open={dialogConsultarOpen}
          onOpenChange={setDialogConsultarOpen}
          cotacaoId={cotacaoSelecionada}
          fornecedorId={fornecedor.id}
        />
      )}

      {/* Dialog para editar cadastro */}
      {fornecedor && (
        <DialogEditarCadastroFornecedor
          open={dialogEditarCadastroOpen}
          onOpenChange={setDialogEditarCadastroOpen}
          fornecedor={fornecedor}
          onSave={() => checkAuth()}
        />
      )}

      {/* Dialog para selecionar responsável legal ao assinar */}
      {fornecedor && (
        <DialogSelecionarResponsavelLegal
          open={dialogResponsavelLegalOpen}
          onOpenChange={setDialogResponsavelLegalOpen}
          responsaveisLegais={fornecedor.responsaveis_legais || []}
          onConfirm={handleConfirmarResponsavelLegal}
          loading={assinandoAta !== null}
        />
      )}
    </div>
  );
}
