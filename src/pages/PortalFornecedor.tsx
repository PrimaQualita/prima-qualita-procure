import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { LogOut, FileText, Gavel, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export default function PortalFornecedor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [cotacoes, setCotacoes] = useState<any[]>([]);
  const [selecoes, setSelecoes] = useState<any[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Verificar se é fornecedor
    const { data: fornecedorData, error } = await supabase
      .from("fornecedores")
      .select("*")
      .eq("user_id", session.user.id)
      .single();

    if (error || !fornecedorData) {
      toast.error("Acesso negado. Este portal é exclusivo para fornecedores.");
      navigate("/dashboard");
      return;
    }

    setFornecedor(fornecedorData);
    await loadCotacoes(fornecedorData.id);
    await loadSelecoes(fornecedorData.id);
    setLoading(false);
  };

  const loadCotacoes = async (fornecedorId: string) => {
    try {
      const { data, error } = await supabase
        .from("cotacao_fornecedor_convites")
        .select(`
          *,
          cotacoes_precos (
            id,
            titulo_cotacao,
            descricao_cotacao,
            data_limite_resposta,
            status_cotacao
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCotacoes(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar cotações");
    }
  };

  const loadSelecoes = async (fornecedorId: string) => {
    try {
      const { data, error } = await supabase
        .from("selecao_fornecedor_convites")
        .select(`
          *,
          selecoes_fornecedores (
            id,
            titulo_selecao,
            descricao,
            data_sessao_disputa,
            hora_sessao_disputa,
            status_selecao
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSelecoes(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar seleções");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getStatusCotacaoBadge = (status: string) => {
    switch (status) {
      case "em_aberto":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600">Em Aberto</Badge>;
      case "encerrada":
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-600">Encerrada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusSelecaoBadge = (status: string) => {
    switch (status) {
      case "planejada":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">Planejada</Badge>;
      case "em_andamento":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Em Andamento</Badge>;
      case "concluida":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600">Concluída</Badge>;
      case "cancelada":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600">Cancelada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Portal do Fornecedor</h1>
              <p className="text-sm text-muted-foreground">{fornecedor?.razao_social}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {fornecedor?.status_aprovacao === "pendente" && (
          <Card className="mb-6 border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-6">
              <p className="text-center text-yellow-700 dark:text-yellow-400">
                ⏳ Seu cadastro está pendente de aprovação pelo gestor. Você receberá um e-mail quando for aprovado.
              </p>
            </CardContent>
          </Card>
        )}

        {fornecedor?.status_aprovacao === "reprovado" && (
          <Card className="mb-6 border-red-500/50 bg-red-500/5">
            <CardContent className="pt-6">
              <p className="text-center text-red-700 dark:text-red-400">
                ❌ Seu cadastro foi reprovado. Entre em contato com o departamento de compras para mais informações.
              </p>
            </CardContent>
          </Card>
        )}

        {fornecedor?.status_aprovacao === "aprovado" && (
          <Tabs defaultValue="cotacoes" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cotacoes">
                <FileText className="mr-2 h-4 w-4" />
                Cotações de Preços
              </TabsTrigger>
              <TabsTrigger value="selecoes">
                <Gavel className="mr-2 h-4 w-4" />
                Seleções
              </TabsTrigger>
              <TabsTrigger value="contato">
                <MessageSquare className="mr-2 h-4 w-4" />
                Contato
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cotacoes">
              <Card>
                <CardHeader>
                  <CardTitle>Minhas Cotações de Preços</CardTitle>
                  <CardDescription>
                    Cotações em que você foi convidado a participar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {cotacoes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Você ainda não foi convidado para nenhuma cotação.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {cotacoes.map((convite) => (
                        <div key={convite.id} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold">
                                {convite.cotacoes_precos?.titulo_cotacao}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                {convite.cotacoes_precos?.descricao_cotacao}
                              </p>
                              <div className="flex gap-4 mt-3 text-sm">
                                <span>
                                  Prazo: {new Date(convite.cotacoes_precos?.data_limite_resposta).toLocaleDateString()}
                                </span>
                                {getStatusCotacaoBadge(convite.cotacoes_precos?.status_cotacao)}
                              </div>
                            </div>
                            <Button size="sm" disabled={convite.cotacoes_precos?.status_cotacao !== "em_aberto"}>
                              Responder
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="selecoes">
              <Card>
                <CardHeader>
                  <CardTitle>Minhas Seleções de Fornecedores</CardTitle>
                  <CardDescription>
                    Processos seletivos em que você foi convidado a participar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selecoes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Você ainda não foi convidado para nenhuma seleção.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {selecoes.map((convite) => (
                        <div key={convite.id} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold">
                                {convite.selecoes_fornecedores?.titulo_selecao}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                {convite.selecoes_fornecedores?.descricao}
                              </p>
                              <div className="flex gap-4 mt-3 text-sm">
                                <span>
                                  Data: {new Date(convite.selecoes_fornecedores?.data_sessao_disputa).toLocaleDateString()}
                                </span>
                                <span>
                                  Horário: {convite.selecoes_fornecedores?.hora_sessao_disputa}
                                </span>
                                {getStatusSelecaoBadge(convite.selecoes_fornecedores?.status_selecao)}
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              disabled={convite.selecoes_fornecedores?.status_selecao !== "em_andamento"}
                            >
                              Participar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contato">
              <Card>
                <CardHeader>
                  <CardTitle>Contato com Departamento de Compras</CardTitle>
                  <CardDescription>
                    Entre em contato para dúvidas ou suporte
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => navigate("/contatos")}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Abrir Página de Contato
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
