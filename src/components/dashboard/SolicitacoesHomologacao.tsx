import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ExternalLink, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface HomologacaoPendente {
  id: string;
  nome_arquivo: string;
  protocolo: string;
  data_envio_assinatura: string;
  selecao_id: string;
  selecao: {
    numero_selecao: string;
    titulo_selecao: string;
  };
}

export function SolicitacoesHomologacao() {
  const [homologacoes, setHomologacoes] = useState<HomologacaoPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadHomologacoesPendentes();
  }, []);

  const loadHomologacoesPendentes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("homologacoes_selecao")
        .select(`
          id,
          nome_arquivo,
          protocolo,
          data_envio_assinatura,
          selecao_id,
          selecoes_fornecedores!inner(
            numero_selecao,
            titulo_selecao
          )
        `)
        .eq("responsavel_legal_id", user.id)
        .eq("status_assinatura", "pendente")
        .order("data_envio_assinatura", { ascending: false });

      if (error) throw error;

      const formattedData = (data || []).map(item => ({
        ...item,
        selecao: Array.isArray(item.selecoes_fornecedores) 
          ? item.selecoes_fornecedores[0] 
          : item.selecoes_fornecedores
      }));

      setHomologacoes(formattedData);
    } catch (error) {
      console.error("Erro ao carregar homologações pendentes:", error);
    }
  };

  const assinarHomologacao = async (homologacaoId: string, selecaoId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("homologacoes_selecao")
        .update({
          status_assinatura: "aceito",
          data_assinatura: new Date().toISOString()
        })
        .eq("id", homologacaoId);

      if (error) throw error;

      toast.success("Homologação assinada com sucesso!");
      await loadHomologacoesPendentes();
    } catch (error) {
      console.error("Erro ao assinar homologação:", error);
      toast.error("Erro ao assinar homologação");
    } finally {
      setLoading(false);
    }
  };

  const irParaSelecao = (selecaoId: string) => {
    navigate(`/detalhe-selecao?id=${selecaoId}`);
  };

  if (homologacoes.length === 0) {
    return null;
  }

  return (
    <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
      <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-500" />
      <AlertTitle className="text-lg font-semibold text-blue-900 dark:text-blue-100">
        Homologações Pendentes de Assinatura
      </AlertTitle>
      <AlertDescription>
        <p className="text-blue-800 dark:text-blue-200 mb-4">
          Homologações aguardando sua assinatura digital
        </p>
        <div className="space-y-3">
          {homologacoes.map((homologacao) => (
            <div
              key={homologacao.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-blue-900/20"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-blue-900 dark:text-blue-100">
                    Seleção {homologacao.selecao?.numero_selecao || "N/A"}
                  </span>
                  <Badge variant="outline" className="border-blue-400 text-blue-700 dark:text-blue-300">
                    Pendente
                  </Badge>
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {homologacao.selecao?.titulo_selecao || "Sem título"}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Enviado em: {new Date(homologacao.data_envio_assinatura).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  onClick={() => irParaSelecao(homologacao.selecao_id)}
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Ver Seleção
                </Button>
                <Button
                  onClick={() => assinarHomologacao(homologacao.id, homologacao.selecao_id)}
                  disabled={loading}
                  size="sm"
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Assinar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
