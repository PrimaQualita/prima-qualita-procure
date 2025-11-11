import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { LogOut, FileText, Gavel, MessageSquare, User, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import GestaoDocumentosFornecedor from "@/components/fornecedores/GestaoDocumentosFornecedor";
import { Input } from "@/components/ui/input";

export default function PortalFornecedor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [cotacoes, setCotacoes] = useState<any[]>([]);
  const [selecoes, setSelecoes] = useState<any[]>([]);
  const [documentosPendentes, setDocumentosPendentes] = useState<any[]>([]);

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
    await loadDocumentosPendentes(fornecedorData.id);
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

  const loadDocumentosPendentes = async (fornecedorId: string) => {
    try {
      console.log("🔍 Carregando documentos pendentes para fornecedor:", fornecedorId);
      
      // Buscar documentos solicitados na finalização do processo
      const { data: camposSolicitados, error: camposError } = await supabase
        .from("campos_documentos_finalizacao")
        .select(`
          id,
          nome_campo,
          descricao,
          obrigatorio,
          cotacao_id,
          status_solicitacao,
          cotacoes_precos (
            titulo_cotacao
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .in("status_solicitacao", ["enviado", "em_analise"]);

      if (camposError) {
        console.error("❌ Erro ao buscar campos solicitados:", camposError);
        throw camposError;
      }

      console.log("📋 Campos solicitados encontrados:", camposSolicitados);

      if (!camposSolicitados || camposSolicitados.length === 0) {
        console.log("ℹ️ Nenhum documento pendente encontrado");
        setDocumentosPendentes([]);
        return;
      }

      // Agrupar por cotação
      const cotacoesMap = new Map();
      
      for (const campo of camposSolicitados) {
        if (!cotacoesMap.has(campo.cotacao_id)) {
          cotacoesMap.set(campo.cotacao_id, {
            id: campo.cotacao_id,
            titulo_cotacao: campo.cotacoes_precos?.titulo_cotacao || "Processo sem título",
            campos_documentos_finalizacao: []
          });
        }

        // Verificar se já foi enviado
        const { data: docExistente } = await supabase
          .from("documentos_finalizacao_fornecedor")
          .select("id, url_arquivo, nome_arquivo")
          .eq("fornecedor_id", fornecedorId)
          .eq("campo_documento_id", campo.id)
          .maybeSingle();

        cotacoesMap.get(campo.cotacao_id).campos_documentos_finalizacao.push({
          ...campo,
          enviado: !!docExistente,
          arquivo: docExistente || null
        });
      }

      const documentosAgrupados = Array.from(cotacoesMap.values());
      console.log("✅ Documentos agrupados por cotação:", documentosAgrupados);
      setDocumentosPendentes(documentosAgrupados);
    } catch (error: any) {
      console.error("❌ Erro ao carregar documentos pendentes:", error);
    }
  };

  const handleUploadDocumento = async (campoId: string, file: File) => {
    if (!fornecedor) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `fornecedor_${fornecedor.id}/${campoId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('processo-anexos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('processo-anexos')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('documentos_finalizacao_fornecedor')
        .insert({
          fornecedor_id: fornecedor.id,
          campo_documento_id: campoId,
          url_arquivo: publicUrl,
          nome_arquivo: file.name
        });

      if (insertError) throw insertError;

      // Atualizar status do campo para "em_analise"
      await supabase
        .from('campos_documentos_finalizacao')
        .update({ 
          status_solicitacao: 'em_analise',
          data_conclusao: new Date().toISOString()
        })
        .eq('id', campoId);

      toast.success("Documento enviado com sucesso!");
      await loadDocumentosPendentes(fornecedor.id);
    } catch (error: any) {
      console.error("Erro ao fazer upload:", error);
      toast.error("Erro ao enviar documento");
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
        {/* Alerta de Documentos Pendentes */}
        {documentosPendentes.length > 0 && (
          <Card className="mb-6 border-orange-500/50 bg-orange-500/10">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-orange-700 dark:text-orange-400 mb-2">
                    ⚠️ Você possui documentos pendentes de envio!
                  </p>
                  <p className="text-sm text-orange-600 dark:text-orange-300">
                    Acesse a aba "Meu Perfil" para visualizar e enviar os documentos solicitados.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {fornecedor?.status_aprovacao === "pendente" && (
          <Card className="mb-6 border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-6">
              <p className="text-center text-yellow-700 dark:text-yellow-400">
                ⏳ Seu cadastro está pendente de aprovação pelo gestor. Você receberá um e-mail quando for aprovado.
                <br />
                <strong>Enquanto isso, você pode participar de cotações e seleções de fornecedores.</strong>
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

        <Tabs defaultValue="perfil" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="perfil">
              <User className="mr-2 h-4 w-4" />
              Meu Perfil
            </TabsTrigger>
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

          <TabsContent value="perfil">
            <div className="space-y-6">
              {/* Informações do Cadastro */}
              <Card>
                <CardHeader>
                  <CardTitle>Informações do Cadastro</CardTitle>
                  <CardDescription>
                    Dados do seu cadastro como fornecedor
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Razão Social</p>
                      <p className="font-medium">{fornecedor?.razao_social}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">CNPJ</p>
                      <p className="font-medium">{fornecedor?.cnpj}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">E-mail</p>
                      <p className="font-medium">{fornecedor?.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status do Cadastro</p>
                      <Badge 
                        variant="outline" 
                        className={
                          fornecedor?.status_aprovacao === 'aprovado' 
                            ? 'bg-green-500/10 text-green-600'
                            : fornecedor?.status_aprovacao === 'pendente'
                            ? 'bg-yellow-500/10 text-yellow-600'
                            : 'bg-red-500/10 text-red-600'
                        }
                      >
                        {fornecedor?.status_aprovacao === 'aprovado' ? 'Aprovado' : 
                         fornecedor?.status_aprovacao === 'pendente' ? 'Pendente' : 'Reprovado'}
                      </Badge>
                    </div>
                    {fornecedor?.status_aprovacao === 'aprovado' && (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">Data de Aprovação</p>
                          <p className="font-medium">
                            {fornecedor?.data_aprovacao 
                              ? new Date(fornecedor.data_aprovacao).toLocaleDateString()
                              : "-"}
                          </p>
                        </div>
                        {fornecedor?.data_validade_certificado && (
                          <div>
                             <p className="text-sm text-muted-foreground">Validade do Certificado</p>
                             <p className="font-medium">
                               {fornecedor.data_validade_certificado.split('T')[0].split('-').reverse().join('/')}
                             </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Gestão de Documentos - Apenas para aprovados */}
              {fornecedor?.status_aprovacao === 'aprovado' && (
                <GestaoDocumentosFornecedor fornecedorId={fornecedor.id} />
              )}

              {/* Documentos Solicitados em Processos de Compra Direta */}
              {documentosPendentes.length > 0 && (
                <Card className="border-orange-500/50">
                  <CardHeader>
                    <CardTitle className="text-orange-700 dark:text-orange-400">
                      📋 Documentos Solicitados em Processos de Compra Direta
                    </CardTitle>
                    <CardDescription>
                      Envie os documentos solicitados para conclusão dos processos
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {documentosPendentes.map((cotacao: any) => (
                      <div key={cotacao.id} className="border rounded-lg p-4 bg-muted/30">
                        <div className="mb-4">
                          <h4 className="font-semibold">{cotacao.titulo_cotacao}</h4>
                        </div>
                        <div className="space-y-3">
                          {cotacao.campos_documentos_finalizacao.map((campo: any) => (
                            <div key={campo.id} className="p-4 bg-background rounded-lg border">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-medium">{campo.nome_campo}</p>
                                    {campo.obrigatorio && (
                                      <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
                                    )}
                                    {campo.enviado && (
                                      <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                                        ✓ Enviado
                                      </Badge>
                                    )}
                                  </div>
                                  {campo.descricao && (
                                    <p className="text-sm text-muted-foreground mb-2">{campo.descricao}</p>
                                  )}
                                  {campo.arquivo && (
                                    <div className="mt-2">
                                      <a 
                                        href={campo.arquivo.url_arquivo} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 hover:underline"
                                      >
                                        📄 {campo.arquivo.nome_arquivo}
                                      </a>
                                    </div>
                                  )}
                                </div>
                                {!campo.enviado && (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="file"
                                      accept=".pdf"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          handleUploadDocumento(campo.id, file);
                                        }
                                      }}
                                      className="hidden"
                                      id={`upload-${campo.id}`}
                                    />
                                    <label htmlFor={`upload-${campo.id}`}>
                                      <Button size="sm" variant="outline" asChild>
                                        <span className="cursor-pointer">
                                          <Upload className="h-4 w-4 mr-2" />
                                          Enviar PDF
                                        </span>
                                      </Button>
                                    </label>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              
              {/* Mensagem para pendentes */}
              {fornecedor?.status_aprovacao === 'pendente' && (
                <Card className="border-yellow-500/50 bg-yellow-500/5">
                  <CardContent className="pt-6">
                    <p className="text-sm text-yellow-700 dark:text-yellow-400">
                      📄 A gestão de documentos estará disponível após aprovação do seu cadastro pelo gestor.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

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
      </div>
    </div>
  );
}
