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

export function SolicitacoesAutorizacaoSelecao() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadSolicitacoes();

    // Listener para recarregar quando autorização de seleção for respondida
    const channel = supabase
      .channel('autorizacoes_selecao_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'solicitacoes_autorizacao_selecao'
        },
        () => {
          console.log('Solicitação de autorização de seleção atualizada, recarregando...');
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Verificar se o usuário é responsável legal
      const { data: profile } = await supabase
        .from("profiles")
        .select("responsavel_legal")
        .eq("id", user.id)
        .single();

      if (!profile?.responsavel_legal) return;

      // Buscar todas as solicitações pendentes (sem filtrar por responsável legal específico)
      const { data, error } = await supabase
        .from("solicitacoes_autorizacao_selecao")
        .select(`
          id,
          cotacao_id,
          processo_numero,
          status,
          data_solicitacao,
          solicitante_id
        `)
        .eq("status", "pendente")
        .order("data_solicitacao", { ascending: false });

      if (error) throw error;

      // Buscar nomes dos solicitantes
      const solicitacoesComNomes = await Promise.all(
        (data || []).map(async (sol) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("nome_completo")
            .eq("id", sol.solicitante_id)
            .single();
          
          return {
            ...sol,
            solicitante: {
              nome_completo: profile?.nome_completo || "Desconhecido"
            }
          };
        })
      );

      setSolicitacoes(solicitacoesComNomes);
    } catch (error) {
      console.error("Erro ao carregar solicitações:", error);
    }
  };

  const autorizarSolicitacao = async (cotacaoId: string, solicitacaoId: string) => {
    try {
      // Marcar checkbox requer_selecao do processo
      const { data: cotacao } = await supabase
        .from("cotacoes_precos")
        .select("processo_compra_id")
        .eq("id", cotacaoId)
        .single();

      if (cotacao) {
        await supabase
          .from("processos_compras")
          .update({ requer_selecao: true })
          .eq("id", cotacao.processo_compra_id);
      }

      // Atualizar TODAS as solicitações relacionadas a esta cotação
      await supabase
        .from("solicitacoes_autorizacao_selecao")
        .update({
          status: "aprovada",
          data_resposta: new Date().toISOString()
        })
        .eq("cotacao_id", cotacaoId)
        .eq("status", "pendente");

      toast.success("Redirecionando para gerar a autorização de seleção...");
      
      // Redirecionar para página de cotações com parâmetro para abrir dialog
      navigate(`/cotacoes?openFinalizarSelecao=${cotacaoId}`);
    } catch (error) {
      console.error("Erro ao autorizar:", error);
      toast.error("Erro ao autorizar solicitação");
    }
  };

  const rejeitarSolicitacao = async (id: string) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from("solicitacoes_autorizacao_selecao")
        .update({
          status: "rejeitada",
          data_resposta: new Date().toISOString()
        })
        .eq("id", id);

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

  if (solicitacoes.length === 0) {
    return null;
  }

  return (
    <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
      <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-500" />
      <AlertTitle className="text-lg font-semibold text-blue-900 dark:text-blue-100">
        Solicitações de Autorização de Seleção Pendentes
      </AlertTitle>
      <AlertDescription>
        <div className="text-blue-800 dark:text-blue-200 mb-4">
          Processos aguardando sua autorização para seleção de fornecedores
        </div>
        <div className="space-y-3">
          {solicitacoes.map((solicitacao) => (
            <div
              key={solicitacao.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-blue-900/20"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-blue-900 dark:text-blue-100">
                    Processo {solicitacao.processo_numero}
                  </span>
                  <Badge variant="outline" className="border-blue-400 text-blue-700 dark:text-blue-300">
                    Pendente
                  </Badge>
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Solicitado por: {solicitacao.solicitante.nome_completo}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {new Date(solicitacao.data_solicitacao).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  onClick={() => navigate("/cotacoes")}
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Ver Processo
                </Button>
                <Button
                  onClick={() => autorizarSolicitacao(solicitacao.cotacao_id, solicitacao.id)}
                  disabled={loading}
                  size="sm"
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Gerar Autorização
                </Button>
                <Button
                  onClick={() => rejeitarSolicitacao(solicitacao.id)}
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
