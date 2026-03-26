import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, FileText, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Notificacao {
  id: string;
  processo_compra_id: string;
  tipo_notificacao: string;
  numero_processo: string;
  objeto_processo: string;
  contrato_gestao_nome: string | null;
  lida: boolean;
  atendida: boolean;
  created_at: string;
}

export function SolicitacoesDocumentosProcesso() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Cache de permissões para evitar re-fetch a cada polling
  const permissoesRef = useRef<{ isSuperintendente: boolean; isGerenteContratos: boolean; contratosVinculados: string[] } | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        // Carregar permissões uma vez
        await carregarPermissoes(user.id);
        loadNotificacoes(user.id);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => loadNotificacoes(userId), 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const carregarPermissoes = async (uid: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("superintendente_executivo, gerente_contratos")
      .eq("id", uid)
      .single();

    const isSuperintendente = profile?.superintendente_executivo || false;
    const isGerenteContratos = profile?.gerente_contratos || false;

    let contratosVinculados: string[] = [];
    if (isGerenteContratos) {
      const { data: vinculos } = await supabase
        .from("gerentes_contratos_gestao")
        .select("contrato_gestao_id")
        .eq("usuario_id", uid);
      contratosVinculados = (vinculos || []).map(v => v.contrato_gestao_id);
    }

    permissoesRef.current = { isSuperintendente, isGerenteContratos, contratosVinculados };
  };

  const loadNotificacoes = async (uid: string) => {
    try {
      // Usar permissões cacheadas
      if (!permissoesRef.current) return;
      const { isSuperintendente, isGerenteContratos, contratosVinculados } = permissoesRef.current;

      // Buscar TODAS as notificações pendentes (não filtrar por destinatario_id)
      // para que usuários que ganharam o perfil depois também vejam
      let query = supabase
        .from("notificacoes_documentos_processo")
        .select("*, processos_compras:processo_compra_id (contrato_gestao_id)")
        .eq("status_notificacao", "pendente")
        .order("created_at", { ascending: false });

      // Filtrar por tipo baseado nas permissões atuais do usuário
      const tiposPermitidos: string[] = [];
      if (isSuperintendente) tiposPermitidos.push("autorizacao_despesa");
      if (isGerenteContratos && contratosVinculados.length > 0) tiposPermitidos.push("requisicao");

      if (tiposPermitidos.length === 0) {
        setNotificacoes([]);
        return;
      }

      query = query.in("tipo_notificacao", tiposPermitidos);

      const { data, error } = await query;

      if (error) throw error;

      // Filtrar: só manter notificações para as quais o usuário AINDA tem permissão
      const notificacoesComPermissao = ((data as any[]) || []).filter(n => {
        if (n.tipo_notificacao === "autorizacao_despesa") {
          return isSuperintendente;
        }
        if (n.tipo_notificacao === "requisicao") {
          if (!isGerenteContratos || contratosVinculados.length === 0) return false;
          const contratoId = n.processos_compras?.contrato_gestao_id;
          return contratoId && contratosVinculados.includes(contratoId);
        }
        return false;
      });

      if (notificacoesComPermissao.length === 0) {
        setNotificacoes([]);
        return;
      }

      // Buscar anexos existentes para verificar pré-requisitos e documentos já gerados
      const processoIds = Array.from(new Set(notificacoesComPermissao.map(n => n.processo_compra_id)));
      const { data: anexosExistentes } = await supabase
        .from("anexos_processo_compra")
        .select("processo_compra_id, tipo_anexo")
        .in("processo_compra_id", processoIds)
        .in("tipo_anexo", ["requisicao", "autorizacao_despesa", "termo_referencia"]);

      // Mapear processos com cada tipo de anexo
      const processosComRequisicao = new Set(
        (anexosExistentes || []).filter((a: any) => a.tipo_anexo === "requisicao").map((a: any) => a.processo_compra_id)
      );
      const processosComTR = new Set(
        (anexosExistentes || []).filter((a: any) => a.tipo_anexo === "termo_referencia").map((a: any) => a.processo_compra_id)
      );

      // Filtrar notificações de autorização: só mostrar se Requisição + TR existirem (botão ativo)
      const notificacoesComPreRequisitos = notificacoesComPermissao.filter(n => {
        if (n.tipo_notificacao === "autorizacao_despesa") {
          return processosComRequisicao.has(n.processo_compra_id) && processosComTR.has(n.processo_compra_id);
        }
        return true;
      });

      const documentosGerados = new Set(
        (anexosExistentes || []).map((a: any) => `${a.processo_compra_id}_${a.tipo_anexo}`)
      );

      const notificacoesConcluidas = notificacoesComPreRequisitos.filter(n =>
        documentosGerados.has(`${n.processo_compra_id}_${n.tipo_notificacao}`)
      );

      // Auto-limpeza no banco: marca como atendida quando o documento já existe
      if (notificacoesConcluidas.length > 0) {
        await supabase
          .from("notificacoes_documentos_processo")
          .update({ status_notificacao: "gerada", atendida: true, lida: true })
          .in("id", notificacoesConcluidas.map(n => n.id));
      }

      const notificacoesAtivas = notificacoesComPreRequisitos.filter(n =>
        !documentosGerados.has(`${n.processo_compra_id}_${n.tipo_notificacao}`)
      );

      // Deduplicar: manter apenas a mais recente por processo/tipo
      const seen = new Map<string, any>();
      for (const n of notificacoesAtivas) {
        const key = `${n.processo_compra_id}_${n.tipo_notificacao}`;
        if (!seen.has(key)) {
          seen.set(key, n);
        }
      }

      setNotificacoes(Array.from(seen.values()));
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
    }
  };

  const handleMarcarAtendida = async (notificacao: Notificacao) => {
    try {
      // Marcar TODAS as notificações do mesmo processo/tipo como atendidas
      const { error } = await supabase
        .from("notificacoes_documentos_processo")
        .update({ status_notificacao: "atendida_manual", atendida: true, lida: true })
        .eq("processo_compra_id", notificacao.processo_compra_id)
        .eq("tipo_notificacao", notificacao.tipo_notificacao)
        .eq("status_notificacao", "pendente");

      if (error) throw error;
      setNotificacoes(prev => prev.filter(n => 
        !(n.processo_compra_id === notificacao.processo_compra_id && n.tipo_notificacao === notificacao.tipo_notificacao)
      ));
    } catch (error) {
      console.error("Erro ao marcar notificação:", error);
    }
  };

  const handleIrParaProcesso = (notificacao: Notificacao) => {
    navigate(`/processos-compras?abrirAnexos=${notificacao.processo_compra_id}`);
  };

  // Extrair texto limpo de HTML
  const extractText = (html: string): string => {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').substring(0, 120);
  };

  const notificacoesRequisicao = notificacoes.filter(n => n.tipo_notificacao === 'requisicao');
  const notificacoesAutorizacao = notificacoes.filter(n => n.tipo_notificacao === 'autorizacao_despesa');

  if (notificacoes.length === 0) return null;

  return (
    <div className="space-y-4">
      {notificacoesRequisicao.length > 0 && (
        <Alert className="border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100 dark:border-blue-700">
          <AlertCircle className="h-4 w-4 text-blue-500" />
          <AlertTitle className="text-blue-900 dark:text-blue-100">
            Solicitações de Requisição ({notificacoesRequisicao.length})
          </AlertTitle>
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            <div className="mt-3 space-y-3">
              {notificacoesRequisicao.map((notif) => (
                <div key={notif.id} className="flex items-start justify-between p-3 bg-card/70 rounded-lg border border-blue-200 dark:border-blue-800 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      Processo: {notif.numero_processo}
                    </p>
                    {notif.contrato_gestao_nome && (
                      <p className="text-xs text-muted-foreground">
                        Contrato: {notif.contrato_gestao_nome}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      Objeto: {extractText(notif.objeto_processo)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Solicitado em {new Date(notif.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleIrParaProcesso(notif)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <FileText className="h-4 w-4 mr-1" /> Gerar Requisição
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMarcarAtendida(notif)}
                      title="Marcar como atendida"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {notificacoesAutorizacao.length > 0 && (
        <Alert className="border-purple-500 bg-purple-50 text-purple-900 dark:bg-purple-950/50 dark:text-purple-100 dark:border-purple-700">
          <AlertCircle className="h-4 w-4 text-purple-500" />
          <AlertTitle className="text-purple-900 dark:text-purple-100">
            Solicitações de Autorização de Despesa ({notificacoesAutorizacao.length})
          </AlertTitle>
          <AlertDescription className="text-purple-800 dark:text-purple-200">
            <div className="mt-3 space-y-3">
              {notificacoesAutorizacao.map((notif) => (
                <div key={notif.id} className="flex items-start justify-between p-3 bg-card/70 rounded-lg border border-purple-200 dark:border-purple-800 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      Processo: {notif.numero_processo}
                    </p>
                    {notif.contrato_gestao_nome && (
                      <p className="text-xs text-muted-foreground">
                        Contrato: {notif.contrato_gestao_nome}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      Objeto: {extractText(notif.objeto_processo)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Solicitado em {new Date(notif.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleIrParaProcesso(notif)}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <FileText className="h-4 w-4 mr-1" /> Gerar Autorização
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMarcarAtendida(notif)}
                      title="Marcar como atendida"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
