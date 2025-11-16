import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, ExternalLink } from "lucide-react";
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
  }, []);

  const loadSolicitacoes = async () => {
    try {
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

  const atualizarStatus = async (id: string, novoStatus: "autorizada" | "rejeitada") => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from("solicitacoes_autorizacao")
        .update({
          status: novoStatus,
          data_resposta: new Date().toISOString()
        })
        .eq("id", id);

      if (error) throw error;

      toast.success(
        novoStatus === "autorizada" 
          ? "Solicitação autorizada com sucesso!" 
          : "Solicitação rejeitada"
      );
      
      await loadSolicitacoes();
    } catch (error) {
      console.error("Erro ao atualizar solicitação:", error);
      toast.error("Erro ao atualizar solicitação");
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
    <Card>
      <CardHeader>
        <CardTitle>Solicitações de Autorização Pendentes</CardTitle>
        <CardDescription>
          Processos aguardando sua autorização para continuar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {solicitacoes.map((solicitacao) => (
            <div
              key={solicitacao.id}
              className="flex items-center justify-between p-4 border rounded-lg bg-muted/50"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">Processo {solicitacao.processo_numero}</span>
                  <Badge variant="outline">Pendente</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Solicitado por: {solicitacao.solicitante.nome_completo}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(solicitacao.data_solicitacao).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => irParaCotacao(solicitacao.cotacao_id)}
                  variant="outline"
                  size="sm"
                  title="Ver Processo"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => atualizarStatus(solicitacao.id, "autorizada")}
                  disabled={loading}
                  size="sm"
                  variant="default"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Autorizar
                </Button>
                <Button
                  onClick={() => atualizarStatus(solicitacao.id, "rejeitada")}
                  disabled={loading}
                  size="sm"
                  variant="destructive"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Rejeitar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
