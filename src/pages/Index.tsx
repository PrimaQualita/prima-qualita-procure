import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowRight, ShoppingCart, Users, FileText } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in and redirect appropriately
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Verificar se é fornecedor
        const { data: fornecedorData } = await supabase
          .from("fornecedores")
          .select("id, status_aprovacao")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (fornecedorData) {
          // É fornecedor - redirecionar para portal do fornecedor
          navigate("/portal-fornecedor");
        } else {
          // É usuário interno - redirecionar para dashboard
          navigate("/dashboard");
        }
      }
    };
    
    checkSession();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center text-center mb-16">
          <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-24 mb-8" />
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Sistema de Compras
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mb-8">
            Portal integrado para gestão completa de processos de compras, cotações e seleção de
            fornecedores
          </p>
          <div className="flex gap-4">
            <Button size="lg" onClick={() => navigate("/auth")} className="group">
              Acessar Sistema
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mb-4">
                <ShoppingCart className="h-6 w-6 text-white" />
              </div>
              <CardTitle>Processos de Compras</CardTitle>
              <CardDescription>
                Gerencie todos os processos de compras organizados por contrato de gestão e ano de
                referência
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-secondary/50 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-secondary to-secondary/70 flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <CardTitle>Cotações e Seleções</CardTitle>
              <CardDescription>
                Envie cotações automatizadas e conduza processos de seleção de fornecedores com
                transparência
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-accent/50 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-accent-foreground" />
              </div>
              <CardTitle>Portal do Fornecedor</CardTitle>
              <CardDescription>
                Portal exclusivo para fornecedores responderem cotações, participarem de seleções e
                manterem documentos atualizados
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="mt-16 max-w-4xl mx-auto">
          <Card className="bg-gradient-to-br from-primary/5 to-secondary/5">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-4 text-center">Recursos Principais</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Controle completo de processos por contrato e ano</span>
                </li>
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Cotações automatizadas com convites por e-mail</span>
                </li>
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Seleção de fornecedores com disputa em tempo real</span>
                </li>
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Gestão de documentos com alertas de vencimento</span>
                </li>
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Log completo de auditoria de todas as ações</span>
                </li>
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Controle de acesso por perfis (Gestor/Colaborador)</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
