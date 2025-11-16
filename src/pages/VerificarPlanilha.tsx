// @ts-nocheck - Tabelas podem não existir no schema atual
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, CheckCircle, XCircle } from "lucide-react";
import primaLogo from "@/assets/prima-qualita-logo.png";

export default function VerificarPlanilha() {
  const [searchParams] = useSearchParams();
  const [protocolo, setProtocolo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    const protocoloUrl = searchParams.get("protocolo");
    if (protocoloUrl) {
      setProtocolo(protocoloUrl);
      verificarPlanilhaComProtocolo(protocoloUrl);
    }
  }, [searchParams]);

  const verificarPlanilhaComProtocolo = async (prot: string) => {
    if (!prot.trim()) return;

    setLoading(true);
    setResultado(null);

    try {
      // SEMPRE PEGAR A PLANILHA MAIS RECENTE POR DATA DE GERAÇÃO
      const { data, error } = await supabase
        .from("planilhas_consolidadas")
        .select("*")
        .eq("protocolo", prot.trim())
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setResultado({ encontrado: false });
      } else {
        setResultado({ encontrado: true, dados: data });
      }
    } catch (error: any) {
      console.error("Erro ao verificar planilha:", error);
      setResultado({ encontrado: false });
    } finally {
      setLoading(false);
    }
  };

  const verificarPlanilha = async () => {
    if (!protocolo.trim()) {
      toast({
        title: "Protocolo obrigatório",
        description: "Por favor, informe o protocolo da planilha consolidada.",
        variant: "destructive",
      });
      return;
    }

    verificarPlanilhaComProtocolo(protocolo);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
      <div className="container mx-auto max-w-4xl py-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src={primaLogo} 
              alt="Prima Qualitá Saúde" 
              className="h-16 md:h-20 object-contain"
            />
          </div>
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
                placeholder="Informe o protocolo da planilha"
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
                  <p className="text-sm font-semibold text-gray-600">ID da Cotação</p>
                  <p className="text-sm font-mono">{resultado.dados.cotacao_id}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Arquivo</p>
                  <p className="text-sm break-all">{resultado.dados.nome_arquivo}</p>
                </div>

                {resultado.dados.fornecedores_incluidos && resultado.dados.fornecedores_incluidos.length > 0 && (
                  <div className="pt-4 border-t border-green-200">
                    <p className="text-sm font-semibold text-gray-600 mb-2">Fornecedores Incluídos nesta Planilha</p>
                    <ul className="list-disc list-inside space-y-1">
                      {resultado.dados.fornecedores_incluidos.map((cnpj: string, index: number) => (
                        <li key={index} className="text-sm text-gray-700">{cnpj}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
