import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const SolicitacoesHomologacao = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();

  const { data: solicitacoes } = useQuery({
    queryKey: ["solicitacoes-homologacao", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_homologacao_selecao")
        .select(`
          *,
          selecoes_fornecedores:selecao_id (
            id,
            numero_selecao,
            processos_compras:processo_compra_id (
              numero_processo_interno,
              objeto_resumido
            )
          )
        `)
        .eq("responsavel_legal_id", userId)
        .eq("atendida", false)
        .order("data_solicitacao", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  if (!solicitacoes || solicitacoes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Solicitações de Homologação Pendentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {solicitacoes.map((solicitacao: any) => (
            <div
              key={solicitacao.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div>
                <p className="font-medium">
                  Seleção Nº {solicitacao.selecoes_fornecedores?.numero_selecao}
                </p>
                <p className="text-sm text-muted-foreground">
                  Processo: {solicitacao.selecoes_fornecedores?.processos_compras?.numero_processo_interno}
                </p>
                <p className="text-sm text-muted-foreground">
                  {solicitacao.selecoes_fornecedores?.processos_compras?.objeto_resumido}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => navigate(`/detalhe-selecao?id=${solicitacao.selecao_id}`)}
              >
                <Eye className="h-4 w-4 mr-2" />
                Gerar Homologação
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
