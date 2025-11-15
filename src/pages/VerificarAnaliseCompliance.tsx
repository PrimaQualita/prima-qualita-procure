import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import primaLogo from "@/assets/prima-qualita-logo.png";

interface AnaliseVerificada {
  id: string;
  protocolo: string;
  processo_numero: string;
  objeto_descricao: string;
  criterio_julgamento: string;
  url_documento: string;
  created_at: string;
}

export default function VerificarAnaliseCompliance() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [analise, setAnalise] = useState<AnaliseVerificada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const protocolo = searchParams.get("protocolo");
    if (protocolo) {
      verificarAnalise(protocolo);
    } else {
      setErro("Protocolo não informado");
    }
  }, [searchParams]);

  const verificarAnalise = async (protocolo: string) => {
    setLoading(true);
    setErro(null);
    setAnalise(null);

    try {
      const { data, error } = await supabase
        .from("analises_compliance")
        .select("*")
        .eq("protocolo", protocolo)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setErro("Análise de compliance não encontrada com este protocolo");
      } else {
        setAnalise(data);
        toast({
          title: "Análise verificada",
          description: "Análise de compliance autêntica encontrada.",
        });
      }
    } catch (error: any) {
      console.error("Erro ao verificar análise:", error);
      setErro("Erro ao verificar a análise de compliance");
    } finally {
      setLoading(false);
    }
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
            Verificação de Análise de Compliance
          </h1>
          <p className="text-gray-600">
            Verifique a autenticidade de uma análise de compliance através do protocolo
          </p>
        </div>

        {loading && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-muted-foreground">Verificando análise...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {erro && !loading && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-red-700">
                <XCircle className="h-8 w-8 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-lg">Análise Não Verificada</h3>
                  <p className="text-sm">{erro}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {analise && !loading && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 mb-6">
                <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-green-900 mb-1">
                    Análise de Compliance Autêntica
                  </h3>
                  <p className="text-sm text-green-700">
                    Esta análise foi gerada oficialmente pelo sistema Prima Qualitá Saúde
                  </p>
                </div>
              </div>

              <div className="space-y-4 bg-white p-4 rounded-lg border border-green-200">
                <div>
                  <p className="text-sm font-semibold text-gray-600">Protocolo</p>
                  <p className="font-mono text-sm break-all">{analise.protocolo}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Processo</p>
                  <p className="text-sm">{analise.processo_numero}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Objeto</p>
                  <p className="text-sm">{analise.objeto_descricao}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Critério de Julgamento</p>
                  <p className="text-sm">{analise.criterio_julgamento}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-600">Data de Geração</p>
                  <p className="text-sm">
                    {new Date(analise.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {analise.url_documento && (
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-2">Documento</p>
                    <Button
                      onClick={() => window.open(analise.url_documento, '_blank')}
                      variant="outline"
                      size="sm"
                    >
                      Visualizar Análise de Compliance
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-8 text-center">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </div>
    </div>
  );
}
