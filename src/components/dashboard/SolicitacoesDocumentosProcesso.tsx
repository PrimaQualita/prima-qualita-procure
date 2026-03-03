import { useState, useEffect } from "react";
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

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
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

  const loadNotificacoes = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("notificacoes_documentos_processo")
        .select("*")
        .eq("destinatario_id", uid)
        .eq("atendida", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotificacoes((data as any[]) || []);
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
    }
  };

  const handleMarcarAtendida = async (id: string) => {
    try {
      const { error } = await supabase
        .from("notificacoes_documentos_processo")
        .update({ atendida: true, lida: true })
        .eq("id", id);

      if (error) throw error;
      setNotificacoes(prev => prev.filter(n => n.id !== id));
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
                      onClick={() => handleMarcarAtendida(notif.id)}
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
                      onClick={() => handleMarcarAtendida(notif.id)}
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
