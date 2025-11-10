import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import primaLogo from "@/assets/prima-qualita-logo.png";

const ProcessosCompras = () => {
  const navigate = useNavigate();
  const [contratos, setContratos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContratos();
  }, []);

  const loadContratos = async () => {
    try {
      const { data, error } = await supabase
        .from("contratos_gestao")
        .select("*")
        .order("data_inicio", { ascending: false });

      if (error) throw error;
      setContratos(data || []);
    } catch (error) {
      console.error("Erro ao carregar contratos:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Processos de Compras</h1>
              <p className="text-sm text-muted-foreground">Gestão de Contratos e Processos</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Contratos de Gestão</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Carregando contratos...</p>
            ) : contratos.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Nenhum contrato de gestão cadastrado
                </p>
                <Button>Cadastrar Primeiro Contrato</Button>
              </div>
            ) : (
              <div className="space-y-4">
                {contratos.map((contrato) => (
                  <Card key={contrato.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-lg">{contrato.nome_contrato}</h3>
                      <p className="text-sm text-muted-foreground">
                        {contrato.ente_federativo}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <span>
                          Início:{" "}
                          {new Date(contrato.data_inicio).toLocaleDateString("pt-BR")}
                        </span>
                        <span>
                          Fim: {new Date(contrato.data_fim).toLocaleDateString("pt-BR")}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            contrato.status === "ativo"
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {contrato.status}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProcessosCompras;
