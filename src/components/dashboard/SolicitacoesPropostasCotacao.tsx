import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface PropostaNotificacao {
  id: string;
  cotacao_id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  fornecedor_cnpj: string;
  valor_total_anual_ofertado: number;
  data_envio_resposta: string | null;
  protocolo: string | null;
  numero_processo: string;
  titulo_cotacao: string;
  contrato_gestao_nome: string | null;
  contrato_gestao_id: string | null;
  processo_compra_id: string;
}

export function SolicitacoesPropostasCotacao() {
  const [propostas, setPropostas] = useState<PropostaNotificacao[]>([]);
  const [marcandoCiente, setMarcandoCiente] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadPropostas();
    const interval = setInterval(loadPropostas, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadPropostas = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Verificar se é gestor
      const { data: profile } = await supabase
        .from("profiles")
        .select("gestor")
        .eq("id", user.id)
        .single();

      if (!profile?.gestor) {
        setPropostas([]);
        return;
      }

      // Buscar todas as respostas de fornecedores que NÃO têm ciência registrada
      const { data: respostas, error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          cotacao_id,
          fornecedor_id,
          valor_total_anual_ofertado,
          data_envio_resposta,
          protocolo,
          fornecedores (razao_social, nome_fantasia, cnpj),
          cotacoes_precos (
            titulo_cotacao,
            processo_compra_id,
            processos_compras (
              id,
              numero_processo_interno,
              contrato_gestao_id,
              contratos_gestao (nome_contrato)
            )
          )
        `)
        .not("data_envio_resposta", "is", null)
        .order("data_envio_resposta", { ascending: false });

      if (error) throw error;

      // Buscar ciências já registradas
      const { data: ciencias } = await supabase
        .from("propostas_cotacao_cientes")
        .select("cotacao_resposta_fornecedor_id");

      const cienciasSet = new Set((ciencias || []).map((c: any) => c.cotacao_resposta_fornecedor_id));

      // Filtrar apenas propostas sem ciência
      const propostasSemCiencia = ((respostas as any[]) || [])
        .filter(r => !cienciasSet.has(r.id))
        .map(r => ({
          id: r.id,
          cotacao_id: r.cotacao_id,
          fornecedor_id: r.fornecedor_id,
          fornecedor_nome: r.fornecedores?.nome_fantasia || r.fornecedores?.razao_social || "N/A",
          fornecedor_cnpj: r.fornecedores?.cnpj || "",
          valor_total_anual_ofertado: r.valor_total_anual_ofertado,
          data_envio_resposta: r.data_envio_resposta,
          protocolo: r.protocolo,
          numero_processo: r.cotacoes_precos?.processos_compras?.numero_processo_interno || "N/A",
          titulo_cotacao: r.cotacoes_precos?.titulo_cotacao || "N/A",
          contrato_gestao_nome: r.cotacoes_precos?.processos_compras?.contratos_gestao?.nome_contrato || null,
          processo_compra_id: r.cotacoes_precos?.processo_compra_id || "",
        }));

      setPropostas(propostasSemCiencia);
    } catch (error) {
      console.error("Erro ao carregar propostas:", error);
    }
  };

  const handleMarcarCiente = async (proposta: PropostaNotificacao) => {
    setMarcandoCiente(proposta.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("propostas_cotacao_cientes")
        .insert({
          cotacao_resposta_fornecedor_id: proposta.id,
          usuario_ciente_id: user.id,
        });

      if (error) throw error;

      setPropostas(prev => prev.filter(p => p.id !== proposta.id));
      toast({ title: "Ciente registrado", description: "Notificação removida para todos os gestores." });
    } catch (error: any) {
      // Se já foi marcada por outro gestor (unique violation), apenas remove localmente
      if (error?.code === "23505") {
        setPropostas(prev => prev.filter(p => p.id !== proposta.id));
        return;
      }
      console.error("Erro ao marcar ciente:", error);
      toast({ title: "Erro", description: "Erro ao registrar ciência.", variant: "destructive" });
    } finally {
      setMarcandoCiente(null);
    }
  };

  const handleVisualizarRespostas = (proposta: PropostaNotificacao) => {
    navigate(`/cotacoes?abrirRespostas=${proposta.cotacao_id}`);
  };

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (propostas.length === 0) return null;

  return (
    <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100 dark:border-emerald-700">
      <Inbox className="h-4 w-4 text-emerald-500" />
      <AlertTitle className="text-emerald-900 dark:text-emerald-100">
        Propostas de Cotação Recebidas ({propostas.length})
      </AlertTitle>
      <AlertDescription className="text-emerald-800 dark:text-emerald-200">
        <div className="mt-3 space-y-3">
          {propostas.map((proposta) => (
            <div
              key={proposta.id}
              className="flex items-start justify-between p-3 bg-card/70 rounded-lg border border-emerald-200 dark:border-emerald-800 gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">
                  Processo: {proposta.numero_processo} — {proposta.titulo_cotacao}
                </p>
                {proposta.contrato_gestao_nome && (
                  <p className="text-xs text-muted-foreground">
                    Contrato: {proposta.contrato_gestao_nome}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Fornecedor: {proposta.fornecedor_nome} ({proposta.fornecedor_cnpj})
                </p>
                <p className="text-xs text-muted-foreground">
                  Valor: {formatarMoeda(proposta.valor_total_anual_ofertado)}
                </p>
                {proposta.data_envio_resposta && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Recebida em {new Date(proposta.data_envio_resposta).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => handleVisualizarRespostas(proposta)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileText className="h-4 w-4 mr-1" /> Visualizar
                </Button>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id={`ciente-${proposta.id}`}
                    disabled={marcandoCiente === proposta.id}
                    onCheckedChange={(checked) => {
                      if (checked) handleMarcarCiente(proposta);
                    }}
                  />
                  <label
                    htmlFor={`ciente-${proposta.id}`}
                    className="text-xs font-medium cursor-pointer select-none"
                  >
                    Ciente
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
