import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Download, Trash2, CheckCircle, XCircle, FileText, Send } from "lucide-react";
import { Label } from "@/components/ui/label";
import { gerarCapaProcessoPDF } from "@/lib/gerarCapaProcessoPDF";
import { gerarRequisicaoPDF } from "@/lib/gerarRequisicaoPDF";
import { gerarAutorizacaoDespesaPDF } from "@/lib/gerarAutorizacaoDespesaPDF";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

interface AnexoProcesso {
  id: string;
  processo_compra_id: string;
  tipo_anexo: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_upload: string;
  usuario_upload_id?: string;
}

interface DialogAnexosProcessoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processoId: string;
  processoNumero: string;
}

const TIPOS_ANEXOS_OBRIGATORIOS = [
  { tipo: "capa_processo", label: "Capa do Processo" },
  { tipo: "requisicao", label: "Requisição" },
  { tipo: "termo_referencia", label: "Termo de Referência" },
  { tipo: "autorizacao_despesa", label: "Autorização da Despesa" },
];

const TIPOS_ANEXOS_GERADOS = [
  { tipo: "PROCESSO_COMPLETO", label: "Processo Completo Consolidado" },
  { tipo: "PROCESSO_COMPLETO_SELECAO", label: "Processo Completo Consolidado" },
];

export function DialogAnexosProcesso({
  open,
  onOpenChange,
  processoId,
  processoNumero,
}: DialogAnexosProcessoProps) {
  const { toast } = useToast();
  const [anexos, setAnexos] = useState<AnexoProcesso[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [anexoToDelete, setAnexoToDelete] = useState<AnexoProcesso | null>(null);
  const [gerandoCapa, setGerandoCapa] = useState(false);
  const [gerandoRequisicao, setGerandoRequisicao] = useState(false);
  const [gerandoAutorizacao, setGerandoAutorizacao] = useState(false);
  const [enviandoNotificacao, setEnviandoNotificacao] = useState<string | null>(null);
  const [notificacoesPendentes, setNotificacoesPendentes] = useState<Set<string>>(new Set());

  // Ref para garantir que operações assíncronas sempre usem o processoId mais recente
  const processoIdRef = useRef(processoId);
  useEffect(() => {
    processoIdRef.current = processoId;
  }, [processoId]);
  
  // Permissões do usuário
  const [isGerenteContratos, setIsGerenteContratos] = useState(false);
  const [isSuperintendenteExecutivo, setIsSuperintendenteExecutivo] = useState(false);
  const [isResponsavelLegal, setIsResponsavelLegal] = useState(false);
  const [isGestorOuColaborador, setIsGestorOuColaborador] = useState(false);
  const [contratoProcessoId, setContratoProcessoId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ nome_completo: string; cargo?: string; genero?: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (open && processoId) {
      loadAnexos();
      checkUserPermissions();
      checkNotificacoesPendentes();
    }
  }, [open, processoId]);

  const checkNotificacoesPendentes = async () => {
    try {
      const { data } = await supabase
        .from("notificacoes_documentos_processo")
        .select("tipo_notificacao")
        .eq("processo_compra_id", processoId)
        .eq("status_notificacao", "pendente");
      
      const tipos = new Set((data || []).map((n: any) => n.tipo_notificacao));
      setNotificacoesPendentes(tipos);
    } catch (e) {
      console.error("Erro ao verificar notificações pendentes:", e);
    }
  };

  const checkUserPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      // Verificar se é gestor ou colaborador
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["gestor", "colaborador"])
        .maybeSingle();

      setIsGestorOuColaborador(!!userRole);

      // Buscar perfil do usuário
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo, cargo, gerente_contratos, superintendente_executivo, responsavel_legal, genero")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserProfile({ nome_completo: profile.nome_completo, cargo: profile.cargo, genero: profile.genero });
        setIsSuperintendenteExecutivo(profile.superintendente_executivo || false);
        // RL só é restrito se for APENAS RL (sem gestor/colaborador ou outros perfis)
        const isRL = profile.responsavel_legal || false;
        const hasOtherRoles = !!userRole || profile.superintendente_executivo;
        setIsResponsavelLegal(isRL && !hasOtherRoles);

        // Se for gerente de contratos, verificar se tem acesso ao contrato deste processo
        if (profile.gerente_contratos) {
          // Buscar o contrato_gestao_id do processo
          const { data: processo } = await supabase
            .from("processos_compras")
            .select("contrato_gestao_id")
            .eq("id", processoId)
            .single();

          if (processo) {
            setContratoProcessoId(processo.contrato_gestao_id);

            // Verificar se o usuário tem acesso a este contrato
            const { data: vinculo } = await supabase
              .from("gerentes_contratos_gestao")
              .select("id")
              .eq("usuario_id", user.id)
              .eq("contrato_gestao_id", processo.contrato_gestao_id)
              .maybeSingle();

            setIsGerenteContratos(!!vinculo);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao verificar permissões:", error);
    }
  };

  const loadAnexos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", processoId)
        .order("data_upload", { ascending: true });

      if (error) throw error;
      setAnexos(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar anexos:", error);
      toast({
        title: "Erro ao carregar anexos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (tipo: string, file: File) => {
    setUploading(tipo);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Upload file to storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${processoId}/${tipo}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get file path (relative path within bucket)
      const filePath = fileName;

      // Save to database (armazena apenas o caminho relativo)
      const { error: dbError } = await supabase
        .from("anexos_processo_compra")
        .insert({
          processo_compra_id: processoId,
          tipo_anexo: tipo,
          nome_arquivo: file.name,
          url_arquivo: filePath,
          usuario_upload_id: user.id,
        });

      if (dbError) throw dbError;

      // Registrar auditoria
      await registrarAuditoria({
        acao: 'criação',
        entidade: 'anexos_processo_compra',
        detalhes: {
          tipo: 'Anexo do Processo',
          numero_processo: processoNumero,
          nome_documento: tipo === 'capa_processo' ? 'Capa do Processo' : 
                          tipo === 'requisicao' ? 'Requisição' : 
                          tipo === 'termo_referencia' ? 'Termo de Referência' : tipo,
          nome_arquivo: file.name,
        },
      });

      toast({ title: "Anexo enviado com sucesso!" });
      await loadAnexos();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar anexo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  const handleDownload = async (anexo: AnexoProcesso) => {
    try {
      // Se for link curto do domínio (ex: /d/AbC12xYz), abrir diretamente
      if (anexo.url_arquivo.includes('/d/') && !anexo.url_arquivo.includes('/storage/')) {
        window.open(anexo.url_arquivo, '_blank');
        return;
      }

      // Se for URL completa pública (processo completo consolidado), usar abrirDocumentoStorage
      if (anexo.url_arquivo.startsWith('http')) {
        // Tentar extrair storage path para usar link curto
        const tipoAnexo = anexo.tipo_anexo;
        if (tipoAnexo === 'PROCESSO_COMPLETO' || tipoAnexo === 'PROCESSO_COMPLETO_SELECAO') {
          const { abrirDocumentoStorage } = await import('@/lib/abrirDocumentoStorage');
          let filePath = anexo.url_arquivo;
          // Extrair caminho relativo do storage
          if (filePath.includes('/documents/')) {
            filePath = filePath.split('/documents/')[1]?.split('?')[0] || filePath;
            await abrirDocumentoStorage(filePath, anexo.nome_arquivo, 'documents');
            return;
          }
          if (filePath.includes('/processo-anexos/')) {
            filePath = filePath.split('/processo-anexos/')[1]?.split('?')[0] || filePath;
            await abrirDocumentoStorage(filePath, anexo.nome_arquivo, 'processo-anexos');
            return;
          }
        }
        // Fallback: abrir URL diretamente
        const link = document.createElement("a");
        link.href = anexo.url_arquivo;
        link.download = anexo.nome_arquivo;
        link.target = "_blank";
        link.click();
        return;
      }

      // Para arquivos no bucket privado, gerar URL assinada
      let filePath = anexo.url_arquivo;
      
      // Se for URL completa antiga, extrair apenas o caminho relativo
      if (filePath.includes('/storage/v1/object/public/processo-anexos/')) {
        filePath = filePath.split('/storage/v1/object/public/processo-anexos/')[1];
      }

      // Gera URL assinada temporária para bucket privado
      const { data, error } = await supabase.storage
        .from("processo-anexos")
        .createSignedUrl(filePath, 3600); // URL válida por 1 hora

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Erro ao gerar URL de download");

      // Baixar diretamente o blob do arquivo
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("processo-anexos")
        .download(filePath);

      if (downloadError) throw downloadError;
      if (!fileData) throw new Error("Arquivo não encontrado");

      // Criar URL do blob para download
      const url = URL.createObjectURL(fileData);
      const link = document.createElement("a");
      link.href = url;
      link.download = anexo.nome_arquivo;
      link.click();
      
      // Limpar URL do blob
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error: any) {
      console.error("Erro ao baixar arquivo:", error);
      toast({
        title: "Erro ao baixar arquivo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const confirmDelete = async () => {
    if (!anexoToDelete) return;

    try {
      const anexo = anexoToDelete;
      const urlArquivo = anexo.url_arquivo;
      
      const getBucketAndPath = (
        raw: string,
        tipoAnexo?: string
      ): { bucket: "processo-anexos" | "documents"; path: string } | null => {
        if (!raw) return null;

        // 1) remover query string
        let s = String(raw).split("?")[0];

        // 2) se for URL completa, remover prefixo /storage/v1/object/public/
        s = s.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\//, "");

        // 3) inferir bucket
        let bucket: "processo-anexos" | "documents" = "processo-anexos";
        if (s.startsWith("documents/") || raw.includes("/documents/")) bucket = "documents";
        else if (s.startsWith("processo-anexos/") || raw.includes("/processo-anexos/")) bucket = "processo-anexos";
        else if (tipoAnexo === "PROCESSO_COMPLETO") bucket = "documents";
        else if (s.startsWith("processos/")) bucket = "documents";

        // 4) remover prefixo de bucket se estiver embutido
        s = s.replace(/^documents\//, "").replace(/^processo-anexos\//, "");

        // 5) decodificação recursiva (evita %2520 vs %20)
        try {
          while (s.includes("%")) {
            const decoded = decodeURIComponent(s);
            if (decoded === s) break;
            s = decoded;
          }
        } catch {}

        if (!s) return null;
        return { bucket, path: s };
      };

      const target = getBucketAndPath(urlArquivo, anexo.tipo_anexo);
      const bucket = target?.bucket || "processo-anexos";
      const filePath = target?.path || "";
      // Delete from storage se tiver path válido
      if (filePath) {
        console.log(`Deletando arquivo do bucket ${bucket}: ${filePath}`);
        const { error: storageError } = await supabase.storage
          .from(bucket)
          .remove([filePath]);
        
        if (storageError) {
          console.error("Erro ao deletar do storage:", storageError);
          // Continua mesmo se falhar no storage
        }
      }

      // Delete from database
      const { error } = await supabase
        .from("anexos_processo_compra")
        .delete()
        .eq("id", anexo.id);

      if (error) throw error;

      // Se deletou o processo completo (compra direta ou seleção), apenas voltar status - NÃO deletar documentos individuais
      // (planilha de habilitação, relatório final e autorização devem ser mantidos)
      if ((anexo.tipo_anexo === "PROCESSO_COMPLETO" || anexo.tipo_anexo === "PROCESSO_COMPLETO_SELECAO") && processoId) {
        console.log("🗑️ Processo completo deletado, voltando status do processo...");
        
        // Voltar status para em_cotacao e zerar valor total
        const { error: statusError } = await supabase
          .from("processos_compras")
          .update({ status_processo: "em_cotacao", valor_total_cotacao: 0 })
          .eq("id", processoId);

        if (statusError) {
          console.error("Erro ao atualizar status do processo:", statusError);
        }

        // REVERTER processo_finalizado na cotação vinculada
        try {
          const { data: cotacoesVinculadas } = await supabase
            .from("cotacoes_precos")
            .select("id")
            .eq("processo_compra_id", processoId)
            .eq("processo_finalizado", true);

          if (cotacoesVinculadas && cotacoesVinculadas.length > 0) {
            const cotacaoIds = cotacoesVinculadas.map(c => c.id);
            const { error: cotacaoError } = await supabase
              .from("cotacoes_precos")
              .update({ processo_finalizado: false })
              .in("id", cotacaoIds);

            if (cotacaoError) {
              console.error("Erro ao reverter processo_finalizado:", cotacaoError);
            } else {
              console.log(`🔄 processo_finalizado revertido para ${cotacaoIds.length} cotação(ões)`);
            }
          }
        } catch (cotErr) {
          console.warn("Erro ao reverter processo_finalizado:", cotErr);
        }

        // Limpar processos_para_contratar pendentes (que ainda não foram formalizados como contrato)
        try {
          // Buscar todos os processos_para_contratar deste processo
          const { data: ppcRecords } = await supabase
            .from("processos_para_contratar")
            .select("id")
            .eq("processo_compra_id", processoId);

          if (ppcRecords && ppcRecords.length > 0) {
            const ppcIds = ppcRecords.map(r => r.id);
            
            // Verificar quais já têm contrato com terceiros formalizado
            const { data: contratosExistentes } = await supabase
              .from("contratos_terceiros")
              .select("processo_para_contratar_id")
              .in("processo_para_contratar_id", ppcIds);

            const idsComContrato = new Set((contratosExistentes || []).map(c => c.processo_para_contratar_id));
            const idsSemContrato = ppcIds.filter(id => !idsComContrato.has(id));

            if (idsSemContrato.length > 0) {
              await supabase
                .from("processos_para_contratar")
                .delete()
                .in("id", idsSemContrato);
              console.log(`🗑️ ${idsSemContrato.length} registro(s) pendentes em processos_para_contratar removidos`);
            }
            if (idsComContrato.size > 0) {
              console.log(`⚠️ ${idsComContrato.size} registro(s) em processos_para_contratar mantidos (já possuem contrato formalizado)`);
            }
          }
        } catch (ppcError) {
          console.warn("Erro ao limpar processos_para_contratar:", ppcError);
        }
        
        console.log("✅ Processo completo deletado, status revertido");
      }

      // Buscar contrato de gestão para auditoria
      let contratoGestao = '';
      try {
        const { data: processoData } = await supabase
          .from("processos_compras")
          .select("contratos_gestao:contrato_gestao_id(nome_contrato)")
          .eq("id", processoId)
          .single();
        contratoGestao = (processoData?.contratos_gestao as any)?.nome_contrato || '';
      } catch (e) {
        console.warn('Não foi possível buscar contrato de gestão para auditoria:', e);
      }

      // Registrar auditoria
      const nomeDocumento = anexo.tipo_anexo === 'capa_processo' ? 'Capa do Processo' : 
                            anexo.tipo_anexo === 'requisicao' ? 'Requisição' : 
                            anexo.tipo_anexo === 'termo_referencia' ? 'Termo de Referência' :
                            anexo.tipo_anexo === 'autorizacao_despesa' ? 'Autorização de Despesa' :
                            anexo.tipo_anexo === 'PROCESSO_COMPLETO' ? 'Processo Completo (Mesclado)' :
                            anexo.tipo_anexo === 'PROCESSO_COMPLETO_SELECAO' ? 'Processo Completo Seleção (Mesclado)' :
                            anexo.tipo_anexo;
      
      await registrarAuditoria({
        acao: 'deleção',
        entidade: 'Anexo do Processo',
        entidade_id: anexo.id,
        detalhes: {
          tipo: 'Anexo do Processo',
          numero_processo: processoNumero,
          contrato_gestao: contratoGestao,
          nome_documento: nomeDocumento,
          nome_arquivo: anexo.nome_arquivo,
        },
      });

      toast({ title: "Anexo excluído com sucesso!" });
      setAnexoToDelete(null);
      await loadAnexos();
    } catch (error: any) {
      console.error("Erro ao excluir anexo:", error);
      setAnexoToDelete(null);
      toast({
        title: "Erro ao excluir anexo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getAnexoPorTipo = (tipo: string) => {
    return anexos.find((a) => a.tipo_anexo === tipo);
  };

  // Função para verificar se o usuário pode excluir um anexo
  const canDeleteAnexo = (anexo: AnexoProcesso) => {
    // Gestores e colaboradores podem excluir qualquer anexo
    if (isGestorOuColaborador) return true;
    
    // Gerente de Contratos só pode excluir Requisição que ele mesmo gerou
    if (isGerenteContratos && !isGestorOuColaborador) {
      return anexo.tipo_anexo === "requisicao" && anexo.usuario_upload_id === currentUserId;
    }
    
    // Superintendente Executivo pode excluir Autorização de Despesa que ele mesmo gerou
    if (isSuperintendenteExecutivo && anexo.tipo_anexo === "autorizacao_despesa" && anexo.usuario_upload_id === currentUserId) {
      return true;
    }
    
    // Outros usuários não podem excluir
    return false;
  };

  const handleGerarCapa = async () => {
    setGerandoCapa(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const currentProcessoId = processoIdRef.current;
      
      // Buscar dados do processo e contrato usando ref para evitar race condition
      const { data: processo, error: processoError } = await supabase
        .from("processos_compras")
        .select(`
          *,
          contratos_gestao:contrato_gestao_id (
            nome_contrato,
            observacoes
          )
        `)
        .eq("id", currentProcessoId)
        .single();

      if (processoError) throw processoError;
      if (!processo) throw new Error("Processo não encontrado");

      // Validar que o processo retornado é realmente o esperado
      if (processo.id !== currentProcessoId) {
        throw new Error("Inconsistência detectada: o processo retornado não corresponde ao solicitado");
      }

      const contrato = processo.contratos_gestao as any;

      // Gerar PDF da capa
      const pdfBlob = await gerarCapaProcessoPDF({
        numeroProcesso: processo.numero_processo_interno,
        numeroContrato: contrato?.nome_contrato || 'Não informado',
        observacoesContrato: contrato?.observacoes || '',
        objetoProcesso: processo.objeto_resumido,
      });

      // Upload para storage
      const fileName = `${processoId}/capa_processo_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Salvar no banco
      const { error: dbError } = await supabase
        .from("anexos_processo_compra")
        .insert({
          processo_compra_id: processoId,
          tipo_anexo: "capa_processo",
          nome_arquivo: `Capa_Processo_${processo.numero_processo_interno}.pdf`,
          url_arquivo: fileName,
          usuario_upload_id: user.id,
        });

      if (dbError) throw dbError;

      // Registrar auditoria
      await registrarAuditoria({
        acao: 'criação',
        entidade: 'anexos_processo_compra',
        detalhes: {
          tipo: 'Anexo do Processo',
          numero_processo: processo.numero_processo_interno,
          nome_documento: 'Capa do Processo',
          nome_arquivo: `Capa_Processo_${processo.numero_processo_interno}.pdf`,
          gerado_automaticamente: true,
        },
      });

      toast({ 
        title: "Capa do Processo gerada com sucesso!",
        description: "O documento foi criado e anexado ao processo."
      });
      
      await loadAnexos();
    } catch (error: any) {
      console.error("Erro ao gerar capa:", error);
      toast({
        title: "Erro ao gerar capa do processo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGerandoCapa(false);
    }
  };

  const handleGerarRequisicao = async () => {
    // Apenas Gerentes de Contratos vinculados ao contrato específico podem gerar Requisição
    if (!isGerenteContratos) {
      toast({
        title: "Acesso negado",
        description:
          "Apenas Gerentes de Contratos vinculados a este contrato podem gerar a Requisição.",
        variant: "destructive",
      });
      return;
    }

    setGerandoRequisicao(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar dados do processo e contrato
      const { data: processo, error: processoError } = await supabase
        .from("processos_compras")
        .select(`
          *,
          contratos_gestao:contrato_gestao_id (
            nome_contrato,
            ente_federativo
          )
        `)
        .eq("id", processoId)
        .single();

      if (processoError) throw processoError;
      if (!processo) throw new Error("Processo não encontrado");

      const contrato = processo.contratos_gestao as any;

      // Gerar protocolo no formato XXXX-XXXX-XXXX-XXXX
      const gerarProtocolo = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const gerarBloco = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `${gerarBloco()}-${gerarBloco()}-${gerarBloco()}-${gerarBloco()}`;
      };
      const protocolo = gerarProtocolo();

      // Gerar PDF da requisição
      const pdfBlob = await gerarRequisicaoPDF({
        numeroProcesso: processo.numero_processo_interno,
        numeroContrato: contrato?.nome_contrato || 'Não informado',
        enteFederativo: contrato?.ente_federativo || 'Não informado',
        objetoProcesso: processo.objeto_resumido,
        gerenteNome: userProfile?.nome_completo || 'Gerente de Contratos',
        gerenteCargo: userProfile?.cargo || 'Gerente de Contratos',
        protocolo: protocolo,
      });

      // Upload para storage
      const fileName = `${processoId}/requisicao_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Obter URL pública do arquivo
      const { data: publicUrlData } = supabase.storage
        .from("processo-anexos")
        .getPublicUrl(fileName);
      const urlArquivo = publicUrlData?.publicUrl || fileName;

      // Salvar no banco - anexo
      const { data: anexoData, error: dbError } = await supabase
        .from("anexos_processo_compra")
        .insert({
          processo_compra_id: processoId,
          tipo_anexo: "requisicao",
          nome_arquivo: `Requisicao_${processo.numero_processo_interno}.pdf`,
          url_arquivo: fileName,
          usuario_upload_id: user.id,
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      // Salvar protocolo para verificação
      const { error: protocoloError } = await supabase
        .from("protocolos_documentos_processo")
        .insert({
          protocolo: protocolo,
          tipo_documento: "requisicao",
          processo_compra_id: processoId,
          anexo_id: anexoData.id,
          nome_arquivo: `Requisicao_${processo.numero_processo_interno}.pdf`,
          url_arquivo: urlArquivo,
          responsavel_nome: userProfile?.nome_completo || 'Gerente de Contratos',
        });

      if (protocoloError) throw protocoloError;

      // Registrar auditoria
      await registrarAuditoria({
        acao: 'criação',
        entidade: 'anexos_processo_compra',
        detalhes: {
          tipo: 'Anexo do Processo',
          numero_processo: processo.numero_processo_interno,
          nome_documento: 'Requisição',
          nome_arquivo: `Requisicao_${processo.numero_processo_interno}.pdf`,
          protocolo: protocolo,
          gerado_automaticamente: true,
        },
      });

      toast({ 
        title: "Requisição gerada com sucesso!",
        description: "O documento foi criado e anexado ao processo."
      });

      // Marcar TODAS as notificações de requisição deste processo como atendidas (para todos os destinatários)
      await supabase
        .from("notificacoes_documentos_processo")
        .update({ status_notificacao: "gerada", atendida: true, lida: true })
        .eq("processo_compra_id", processoId)
        .eq("tipo_notificacao", "requisicao")
        .eq("status_notificacao", "pendente");
      
      await loadAnexos();
    } catch (error: any) {
      console.error("Erro ao gerar requisição:", error);
      toast({
        title: "Erro ao gerar requisição",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGerandoRequisicao(false);
    }
  };

  const handleGerarAutorizacaoDespesa = async () => {
    if (!isSuperintendenteExecutivo) {
      toast({
        title: "Acesso negado",
        description: "Apenas Superintendentes Executivos podem gerar a Autorização de Despesa.",
        variant: "destructive",
      });
      return;
    }

    setGerandoAutorizacao(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar dados do processo e contrato
      const { data: processo, error: processoError } = await supabase
        .from("processos_compras")
        .select(`
          *,
          contratos_gestao:contrato_gestao_id (
            nome_contrato
          )
        `)
        .eq("id", processoId)
        .single();

      if (processoError) throw processoError;
      if (!processo) throw new Error("Processo não encontrado");

      const contrato = processo.contratos_gestao as any;

      // Gerar protocolo no formato XXXX-XXXX-XXXX-XXXX
      const gerarProtocolo = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const gerarBloco = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `${gerarBloco()}-${gerarBloco()}-${gerarBloco()}-${gerarBloco()}`;
      };
      const protocolo = gerarProtocolo();

      // Gerar PDF da autorização de despesa
      const pdfBlob = await gerarAutorizacaoDespesaPDF({
        numeroProcesso: processo.numero_processo_interno,
        objetoProcesso: processo.objeto_resumido,
        centroCusto: processo.centro_custo,
        superintendenteNome: userProfile?.nome_completo || 'Superintendente Executivo',
        superintendenteGenero: String(userProfile?.genero ?? 'feminino').toLowerCase(),
        protocolo: protocolo,
      });

      // Upload para storage
      const fileName = `${processoId}/autorizacao_despesa_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Obter URL pública do arquivo
      const { data: publicUrlData } = supabase.storage
        .from("processo-anexos")
        .getPublicUrl(fileName);
      const urlArquivo = publicUrlData?.publicUrl || fileName;

      // Salvar no banco - anexo
      const { data: anexoData, error: dbError } = await supabase
        .from("anexos_processo_compra")
        .insert({
          processo_compra_id: processoId,
          tipo_anexo: "autorizacao_despesa",
          nome_arquivo: `Autorizacao_Despesa_${processo.numero_processo_interno}.pdf`,
          url_arquivo: fileName,
          usuario_upload_id: user.id,
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      // Salvar protocolo para verificação
      const { error: protocoloError } = await supabase
        .from("protocolos_documentos_processo")
        .insert({
          protocolo: protocolo,
          tipo_documento: "autorizacao_despesa",
          processo_compra_id: processoId,
          anexo_id: anexoData.id,
          nome_arquivo: `Autorizacao_Despesa_${processo.numero_processo_interno}.pdf`,
          url_arquivo: urlArquivo,
          responsavel_nome: userProfile?.nome_completo || 'Superintendente Executivo',
        });

      if (protocoloError) throw protocoloError;

      // Registrar auditoria
      await registrarAuditoria({
        acao: 'criação',
        entidade: 'anexos_processo_compra',
        detalhes: {
          tipo: 'Anexo do Processo',
          numero_processo: processo.numero_processo_interno,
          nome_documento: 'Autorização de Despesa',
          nome_arquivo: `Autorizacao_Despesa_${processo.numero_processo_interno}.pdf`,
          protocolo: protocolo,
          gerado_automaticamente: true,
        },
      });

      toast({ 
        title: "Autorização de Despesa gerada com sucesso!",
        description: "O documento foi criado e anexado ao processo."
      });

      // Marcar TODAS as notificações de autorização deste processo como atendidas (para todos os destinatários)
      await supabase
        .from("notificacoes_documentos_processo")
        .update({ status_notificacao: "gerada", atendida: true, lida: true })
        .eq("processo_compra_id", processoId)
        .eq("tipo_notificacao", "autorizacao_despesa")
        .eq("status_notificacao", "pendente");
      
      await loadAnexos();
    } catch (error: any) {
      console.error("Erro ao gerar autorização de despesa:", error);
      toast({
        title: "Erro ao gerar autorização de despesa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGerandoAutorizacao(false);
    }
  };

  const handleEnviarNotificacao = async (tipoNotificacao: 'requisicao' | 'autorizacao_despesa') => {
    setEnviandoNotificacao(tipoNotificacao);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar dados do processo
      const { data: processo, error: processoError } = await supabase
        .from("processos_compras")
        .select(`
          numero_processo_interno,
          objeto_resumido,
          contrato_gestao_id,
          contratos_gestao:contrato_gestao_id (
            nome_contrato
          )
        `)
        .eq("id", processoId)
        .single();

      if (processoError || !processo) throw new Error("Processo não encontrado");

      const contrato = processo.contratos_gestao as any;
      let destinatarios: string[] = [];

      if (tipoNotificacao === 'requisicao') {
        // Buscar gerentes de contratos vinculados ao contrato de gestão deste processo
        const { data: gerentes } = await supabase
          .from("gerentes_contratos_gestao")
          .select("usuario_id")
          .eq("contrato_gestao_id", processo.contrato_gestao_id);

        destinatarios = (gerentes || []).map(g => g.usuario_id);
        if (destinatarios.length === 0) {
          toast({ title: "Nenhum Gerente de Contratos vinculado a este contrato de gestão", variant: "destructive" });
          return;
        }
      } else {
        // Buscar superintendentes executivos
        const { data: supers } = await supabase
          .from("profiles")
          .select("id")
          .eq("superintendente_executivo", true)
          .eq("ativo", true);

        destinatarios = (supers || []).map(s => s.id);
        if (destinatarios.length === 0) {
          toast({ title: "Nenhum Superintendente Executivo encontrado", variant: "destructive" });
          return;
        }
      }

      // Verificar se já existem notificações pendentes para este processo/tipo
      const { data: existentes } = await supabase
        .from("notificacoes_documentos_processo")
        .select("destinatario_id")
        .eq("processo_compra_id", processoId)
        .eq("tipo_notificacao", tipoNotificacao)
        .eq("status_notificacao", "pendente");

      const destinatariosJaNotificados = new Set((existentes || []).map((e: any) => e.destinatario_id));
      const novosDestinatarios = destinatarios.filter(d => !destinatariosJaNotificados.has(d));

      if (novosDestinatarios.length === 0) {
        toast({ title: "Solicitação já enviada", description: "Já existe uma solicitação pendente para este processo." });
        setNotificacoesPendentes(prev => new Set([...prev, tipoNotificacao]));
        return;
      }

      // Criar notificações apenas para destinatários que ainda não foram notificados
      const notificacoes = novosDestinatarios.map(destId => ({
        processo_compra_id: processoId,
        tipo_notificacao: tipoNotificacao,
        destinatario_id: destId,
        remetente_id: user.id,
        numero_processo: processo.numero_processo_interno,
        objeto_processo: processo.objeto_resumido,
        contrato_gestao_nome: contrato?.nome_contrato || null,
        status_notificacao: "pendente",
      }));

      const { error: insertError } = await supabase
        .from("notificacoes_documentos_processo")
        .insert(notificacoes);

      if (insertError) throw insertError;

      setNotificacoesPendentes(prev => new Set([...prev, tipoNotificacao]));

      const labelTipo = tipoNotificacao === 'requisicao' 
        ? 'Gerente(s) de Contratos' 
        : 'Superintendente(s) Executivo(s)';

      toast({
        title: "Notificação enviada!",
        description: `Solicitação enviada para ${destinatarios.length} ${labelTipo}.`,
      });
    } catch (error: any) {
      console.error("Erro ao enviar notificação:", error);
      toast({
        title: "Erro ao enviar notificação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setEnviandoNotificacao(null);
    }
  };


  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Anexos do Processo {processoNumero}</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <p className="text-muted-foreground">Carregando anexos...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anexos do Processo {processoNumero}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Seção de Processo Completo Consolidado */}
          {TIPOS_ANEXOS_GERADOS.map(({ tipo, label }) => {
            const anexo = getAnexoPorTipo(tipo);

            if (!anexo) return null;

            // Formatar nome amigável para processo completo - usar número do processo da prop
            const nomeExibicao = (tipo === "PROCESSO_COMPLETO" || tipo === "PROCESSO_COMPLETO_SELECAO")
              ? `Processo ${processoNumero}`
              : anexo.nome_arquivo;

            return (
              <div key={tipo} className="border-2 border-primary rounded-lg p-4 bg-primary/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Label className="font-semibold text-base">{label}</Label>
                    <Badge className="text-xs bg-primary">
                      Gerado pelo Sistema
                    </Badge>
                  </div>
                  <CheckCircle className="h-5 w-5 text-primary" />
                </div>

                <div className="flex items-center justify-between bg-background p-3 rounded">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{nomeExibicao}</p>
                    <p className="text-xs text-muted-foreground">
                      Gerado em {new Date(anexo.data_upload).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDownload(anexo)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {canDeleteAnexo(anexo) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAnexoToDelete(anexo)}
                        title="Excluir documento"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Seção de Anexos Obrigatórios */}
          {TIPOS_ANEXOS_OBRIGATORIOS.map(({ tipo, label }) => {
            const anexo = getAnexoPorTipo(tipo);
            const isUploading = uploading === tipo;
            const isCapaProcesso = tipo === "capa_processo";
            const isRequisicao = tipo === "requisicao";
            const isAutorizacaoDespesa = tipo === "autorizacao_despesa";
            const isTermoReferencia = tipo === "termo_referencia";

            // Verificar dependências sequenciais
            const requisicaoExiste = !!getAnexoPorTipo("requisicao");
            const termoReferenciaExiste = !!getAnexoPorTipo("termo_referencia");
            const bloqueadoTermoReferencia = isTermoReferencia && !requisicaoExiste;
            const bloqueadoAutorizacao = isAutorizacaoDespesa && !termoReferenciaExiste;

            return (
              <div key={tipo} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">{label}</Label>
                  {anexo ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                </div>

                {anexo ? (
                  <div className="flex items-center justify-between bg-muted p-3 rounded">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{anexo.nome_arquivo}</p>
                      <p className="text-xs text-muted-foreground">
                        Enviado em {new Date(anexo.data_upload).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(anexo)}
                        title="Baixar anexo"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canDeleteAnexo(anexo) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAnexoToDelete(anexo)}
                          title="Excluir anexo"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {/* Botão Gerar Capa - apenas para gestor/colaborador */}
                      {isCapaProcesso && isGestorOuColaborador && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={handleGerarCapa}
                          disabled={gerandoCapa}
                          className="flex-1"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          {gerandoCapa ? "Gerando Capa..." : "Gerar Capa do Processo"}
                        </Button>
                      )}
                      {/* Botão Gerar Requisição - apenas para gerentes de contratos vinculados ao contrato */}
                      {isRequisicao && isGerenteContratos && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={handleGerarRequisicao}
                          disabled={gerandoRequisicao}
                          className="flex-1"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          {gerandoRequisicao ? "Gerando..." : "Gerar Requisição"}
                        </Button>
                      )}
                      {/* Botão Gerar Autorização - apenas para superintendente executivo e após Termo de Referência */}
                      {isAutorizacaoDespesa && isSuperintendenteExecutivo && !bloqueadoAutorizacao && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={handleGerarAutorizacaoDespesa}
                          disabled={gerandoAutorizacao}
                          className="flex-1"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          {gerandoAutorizacao ? "Gerando..." : "Gerar Autorização"}
                        </Button>
                      )}
                      {/* Botão Anexar PDF */}
                      {!isAutorizacaoDespesa && !bloqueadoTermoReferencia && (
                        (isRequisicao && isGerenteContratos) || 
                        (!isRequisicao && isGestorOuColaborador)
                      ) && (
                        <>
                          <input
                            type="file"
                            id={`file-${tipo}`}
                            className="hidden"
                            accept=".pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(tipo, file);
                            }}
                            disabled={isUploading}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => document.getElementById(`file-${tipo}`)?.click()}
                            disabled={isUploading}
                            className={(isCapaProcesso && isGestorOuColaborador) || ((isRequisicao && (isGerenteContratos || isGestorOuColaborador))) ? "flex-1" : "w-full"}
                          >
                            <FileUp className="h-4 w-4 mr-2" />
                            {isUploading ? "Enviando..." : "Anexar PDF"}
                          </Button>
                        </>
                      )}
                      {/* Mensagem de bloqueio - Termo de Referência aguardando Requisição */}
                      {bloqueadoTermoReferencia && (
                        <p className="text-sm text-muted-foreground italic">
                          Gere a Requisição primeiro para liberar o upload do Termo de Referência
                        </p>
                      )}
                      {/* Mensagem de bloqueio - Autorização aguardando Termo de Referência */}
                      {bloqueadoAutorizacao && isSuperintendenteExecutivo && (
                        <p className="text-sm text-muted-foreground italic">
                          Anexe o Termo de Referência primeiro para liberar a geração da Autorização de Despesa
                        </p>
                      )}
                      {/* Mensagem para gerente de contratos ou responsável legal sem acesso */}
                      {(isGerenteContratos || isResponsavelLegal) && !isGestorOuColaborador && !isRequisicao && !isAutorizacaoDespesa && !bloqueadoTermoReferencia && (
                        <p className="text-sm text-muted-foreground italic">
                          Documento não disponível para seu perfil
                        </p>
                      )}
                      {/* Mensagem para quem não é gerente de contratos na requisição */}
                      {isRequisicao && !isGerenteContratos && !isGestorOuColaborador && (
                        <p className="text-sm text-muted-foreground italic">
                          Apenas Gerente de Contratos vinculado pode gerar a Requisição
                        </p>
                      )}
                      {/* Mensagem para quem não é superintendente executivo na autorização */}
                      {isAutorizacaoDespesa && !isSuperintendenteExecutivo && !isGestorOuColaborador && (
                        <p className="text-sm text-muted-foreground italic">
                          Apenas Superintendente Executivo pode gerar a Autorização de Despesa
                        </p>
                      )}
                    </div>
                    {/* Botão Solicitar - Requisição (gestor/colaborador envia para gerente) */}
                    {isRequisicao && isGestorOuColaborador && !isGerenteContratos && (
                      notificacoesPendentes.has('requisicao') ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium w-full justify-center py-1">
                          <CheckCircle className="h-4 w-4" />
                          Solicitação Enviada
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEnviarNotificacao('requisicao')}
                          disabled={enviandoNotificacao === 'requisicao'}
                          className="w-full border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          {enviandoNotificacao === 'requisicao' ? "Enviando..." : "Solicitar ao Gerente de Contratos"}
                        </Button>
                      )
                    )}
                    {/* Botão Solicitar - Autorização (gestor/colaborador envia para superintendente) */}
                    {isAutorizacaoDespesa && isGestorOuColaborador && !isSuperintendenteExecutivo && !bloqueadoAutorizacao && (
                      notificacoesPendentes.has('autorizacao_despesa') ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium w-full justify-center py-1">
                          <CheckCircle className="h-4 w-4" />
                          Solicitação Enviada
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEnviarNotificacao('autorizacao_despesa')}
                          disabled={enviandoNotificacao === 'autorizacao_despesa'}
                          className="w-full border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          {enviandoNotificacao === 'autorizacao_despesa' ? "Enviando..." : "Solicitar ao Superintendente Executivo"}
                        </Button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={!!anexoToDelete} onOpenChange={(open) => !open && setAnexoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              Deseja realmente excluir o arquivo{" "}
              <strong className="text-foreground">{anexoToDelete?.nome_arquivo}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAnexoToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
