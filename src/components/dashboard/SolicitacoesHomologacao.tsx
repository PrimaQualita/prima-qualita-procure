import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Solicitacao {
  id: string;
  selecao_id: string;
  data_solicitacao: string;
  selecoes_fornecedores: {
    id: string;
    numero_selecao: string;
    processos_compras: {
      numero_processo_interno: string;
      objeto_resumido: string;
    };
  };
}

export function SolicitacoesHomologacao() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadSolicitacoes();
  }, []);

  const loadSolicitacoes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("solicitacoes_homologacao_selecao")
        .select(`
          id,
          selecao_id,
          data_solicitacao,
          atendida,
          selecoes_fornecedores:selecao_id (
            id,
            numero_selecao,
            processos_compras:processo_compra_id (
              numero_processo_interno,
              objeto_resumido
            )
          )
        `)
        .eq("responsavel_legal_id", user.id)
        .eq("atendida", false)
        .order("data_solicitacao", { ascending: false });

      if (error) throw error;

      setSolicitacoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar solicitações:", error);
    }
  };

  const gerarHomologacao = (selecaoId: string) => {
    navigate(`/detalhe-selecao?id=${selecaoId}`);
  };

  if (solicitacoes.length === 0) {
    return null;
  }

  return (
    <Alert className="bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800">
      <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-500" />
      <AlertTitle className="text-lg font-semibold text-orange-900 dark:text-orange-100">
        Solicitações de Homologação Pendentes
      </AlertTitle>
      <AlertDescription>
        <div className="text-orange-800 dark:text-orange-200 mb-4">
          Seleções aguardando geração de homologação
        </div>
        <div className="space-y-3">
          {solicitacoes.map((solicitacao) => (
            <div
              key={solicitacao.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border border-orange-300 dark:border-orange-700 rounded-lg bg-white dark:bg-orange-900/20"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-orange-900 dark:text-orange-100">
                    Seleção Nº {solicitacao.selecoes_fornecedores?.numero_selecao}
                  </span>
                  <Badge variant="outline" className="border-orange-400 text-orange-700 dark:text-orange-300">
                    Pendente
                  </Badge>
                </div>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  Processo: {solicitacao.selecoes_fornecedores?.processos_compras?.numero_processo_interno}
                </p>
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  {solicitacao.selecoes_fornecedores?.processos_compras?.objeto_resumido}
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  {new Date(solicitacao.data_solicitacao).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  onClick={() => navigate(`/selecoes`)}
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none border-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Ver Seleções
                </Button>
                <Button
                  onClick={() => gerarHomologacao(solicitacao.selecao_id)}
                  size="sm"
                  className="flex-1 sm:flex-none bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Gerar Homologação
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
