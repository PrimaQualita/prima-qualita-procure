import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, CheckCircle, XCircle } from "lucide-react";

export default function VerificarPlanilha() {
  const [protocolo, setProtocolo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const { toast } = useToast();

  const verificarPlanilha = async () => {
    if (!protocolo.trim()) {
      toast({
        title: "Protocolo obrigatório",
        description: "Por favor, informe o protocolo da planilha consolidada.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResultado(null);

    try {
      const { data, error } = await supabase
        .from("planilhas_consolidadas")
        .select(`
          *,
          cotacoes_precos!inner(
            titulo_cotacao,
            processos_compras!inner(
              numero_processo_interno,
              objeto_resumido,
              contratos_gestao!inner(
                nome_contrato
              )
            )
          ),
          profiles!planilhas_consolidadas_usuario_gerador_id_fkey(
            nome_completo
          )
        `)
        .eq("protocolo", protocolo.trim())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setResultado({ encontrado: false });
        toast({
          title: "Planilha não encontrada",
          description: "Nenhuma planilha consolidada foi encontrada com este protocolo.",
          variant: "destructive",
        });
      } else {
        setResultado({ encontrado: true, dados: data });
        toast({
          title: "Planilha verificada",
          description: "Planilha consolidada autêntica encontrada.",
        });
      }
    } catch (error: any) {
      console.error("Erro ao verificar planilha:", error);
      toast({
        title: "Erro na verificação",
        description: error.message || "Erro ao verificar a planilha consolidada.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
      <div className="container mx-auto max-w-4xl py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-900 mb-2">
            Verificação de Planilha Consolidada
          </h1>
          <p className="text-gray-600">
            Verifique a autenticidade de uma planilha consolidada através do protocolo
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Buscar Planilha</CardTitle>
            <CardDescription>
              Insira o protocolo da planilha consolidada para verificar sua autenticidade
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: a7d2c8e2-4b8f-4ac3-b4d5-0f4eac8b6e32"
                value={protocolo}
                onChange={(e) => setProtocolo(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && verificarPlanilha()}
                className="flex-1"
              />
              <Button onClick={verificarPlanilha} disabled={loading}>
                <Search className="h-4 w-4 mr-2" />
                {loading ? "Verificando..." : "Verificar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {resultado && !resultado.encontrado && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-red-700">
                <XCircle className="h-8 w-8" />
                <div>
                  <h3 className="font-semibold text-lg">Planilha não encontrada</h3>
                  <p className="text-sm">
                    Nenhuma planilha consolidada foi encontrada com o protocolo informado.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {resultado && resultado.encontrado && resultado.dados && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 mb-6">
                <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-green-900 mb-1">
                    Planilha Consolidada Autêntica
                  </h3>
                  <p className="text-sm text-green-700">
                    Esta planilha foi gerada oficialmente pelo sistema Prima Qualitá Saúde
                  </p>
                </div>
              </div>

              <div className="space-y-4 bg-white p-4 rounded-lg border border-green-200">
                <div>
                  <p className="text-sm font-semibold text-gray-600">Protocolo</p>
                  <p className="font-mono text-sm break-all">{resultado.dados.protocolo}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Data de Geração</p>
                  <p className="text-sm">
                    {new Date(resultado.dados.data_geracao).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Gerado por</p>
                  <p className="text-sm">{resultado.dados.profiles?.nome_completo || "Sistema"}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Contrato de Gestão</p>
                  <p className="text-sm">
                    {resultado.dados.cotacoes_precos?.processos_compras?.contratos_gestao?.nome_contrato}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Processo de Compras</p>
                  <p className="text-sm">
                    {resultado.dados.cotacoes_precos?.processos_compras?.numero_processo_interno} -{" "}
                    {resultado.dados.cotacoes_precos?.processos_compras?.objeto_resumido}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Cotação</p>
                  <p className="text-sm">{resultado.dados.cotacoes_precos?.titulo_cotacao}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Arquivo</p>
                  <p className="text-sm break-all">{resultado.dados.nome_arquivo}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
