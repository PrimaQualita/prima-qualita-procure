import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, ExternalLink, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Solicitacao {
  id: string;
  cotacao_id: string;
  processo_numero: string;
  status: string;
  data_solicitacao: string;
  solicitante: {
    nome_completo: string;
  };
}

export function SolicitacoesAutorizacao() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadSolicitacoes();

    // Listener para recarregar quando autorização for respondida
    const channel = supabase
      .channel('autorizacoes_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'solicitacoes_autorizacao'
        },
        () => {
          console.log('Solicitação de autorização atualizada, recarregando...');
          loadSolicitacoes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadSolicitacoes = async () => {
    try {
      // Verificar se o usuário é responsável legal
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("responsavel_legal")
        .eq("id", user.id)
        .single();

      if (!profile?.responsavel_legal) return;

      // Buscar todas as solicitações pendentes (sem filtrar por responsável legal específico)
      const { data, error } = await supabase
        .from("solicitacoes_autorizacao")
        .select(`
          id,
          cotacao_id,
          processo_numero,
          status,
          data_solicitacao,
          solicitante:profiles!solicitacoes_autorizacao_solicitante_id_fkey(nome_completo)
        `)
        .eq("status", "pendente")
        .order("data_solicitacao", { ascending: false });

      if (error) throw error;

      setSolicitacoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar solicitações:", error);
    }
  };

  const autorizarSolicitacao = async (cotacaoId: string) => {
    try {
      // Atualizar TODAS as solicitações relacionadas a esta cotação antes de redirecionar
      await supabase
        .from("solicitacoes_autorizacao")
        .update({
          status: "aprovada",
          data_resposta: new Date().toISOString()
        })
        .eq("cotacao_id", cotacaoId)
        .eq("status", "pendente");

      toast.success("Redirecionando para gerar a autorização...");
      navigate(`/cotacoes?openFinalizar=${cotacaoId}`);
    } catch (error) {
      console.error("Erro ao atualizar solicitações:", error);
      // Redirecionar mesmo com erro
      toast.success("Redirecionando para gerar a autorização...");
      navigate(`/cotacoes?openFinalizar=${cotacaoId}`);
    }
  };

  const rejeitarSolicitacao = async (id: string, cotacaoId: string) => {
    try {
      setLoading(true);

      // Rejeitar TODAS as solicitações relacionadas a esta cotação
      const { error } = await supabase
        .from("solicitacoes_autorizacao")
        .update({
          status: "rejeitada",
          data_resposta: new Date().toISOString()
        })
        .eq("cotacao_id", cotacaoId)
        .eq("status", "pendente");

      if (error) throw error;

      toast.success("Solicitação rejeitada");
      await loadSolicitacoes();
    } catch (error) {
      console.error("Erro ao rejeitar solicitação:", error);
      toast.error("Erro ao rejeitar solicitação");
    } finally {
      setLoading(false);
    }
  };

  const irParaCotacao = (cotacaoId: string) => {
    navigate("/cotacoes");
    // Nota: Aqui você pode adicionar lógica adicional para abrir o dialog específico
  };

  if (solicitacoes.length === 0) {
    return null;
  }

  return (
    <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
      <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
      <AlertTitle className="text-lg font-semibold text-yellow-900 dark:text-yellow-100">
        Solicitações de Autorização Pendentes
      </AlertTitle>
      <AlertDescription>
        <p className="text-yellow-800 dark:text-yellow-200 mb-4">
          Processos aguardando sua autorização para continuar
        </p>
        <div className="space-y-3">
          {solicitacoes.map((solicitacao) => (
            <div
              key={solicitacao.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border border-yellow-300 dark:border-yellow-700 rounded-lg bg-white dark:bg-yellow-900/20"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-yellow-900 dark:text-yellow-100">
                    Processo {solicitacao.processo_numero}
                  </span>
                  <Badge variant="outline" className="border-yellow-400 text-yellow-700 dark:text-yellow-300">
                    Pendente
                  </Badge>
                </div>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Solicitado por: {solicitacao.solicitante.nome_completo}
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  {new Date(solicitacao.data_solicitacao).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  onClick={() => irParaCotacao(solicitacao.cotacao_id)}
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none border-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Ver Processo
                </Button>
                <Button
                  onClick={() => autorizarSolicitacao(solicitacao.cotacao_id)}
                  disabled={loading}
                  size="sm"
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Autorizar
                </Button>
                <Button
                  onClick={() => rejeitarSolicitacao(solicitacao.id, solicitacao.cotacao_id)}
                  disabled={loading}
                  variant="destructive"
                  size="sm"
                  className="flex-1 sm:flex-none"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Rejeitar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
