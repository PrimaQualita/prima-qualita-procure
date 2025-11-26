import { useState, useEffect } from "react";
import { DialogConsultarProposta } from "@/components/cotacoes/DialogConsultarProposta";
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
import { NotificacaoRejeicao } from "@/components/fornecedores/NotificacaoRejeicao";
import { Input } from "@/components/ui/input";

export default function PortalFornecedor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [cotacoes, setCotacoes] = useState<any[]>([]);
  const [selecoes, setSelecoes] = useState<any[]>([]);
  const [documentosPendentes, setDocumentosPendentes] = useState<any[]>([]);
  const [dialogConsultarOpen, setDialogConsultarOpen] = useState(false);
  const [cotacaoSelecionada, setCotacaoSelecionada] = useState<string>("");

  useEffect(() => {
    checkAuth();
  }, []);

  // Realtime subscription para atualizar seleções automaticamente
  useEffect(() => {
    if (!fornecedor) return;

    console.log("🔄 Iniciando subscription realtime para seleções...");

    const channel = supabase
      .channel(`selecoes-fornecedor-${fornecedor.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'selecoes_fornecedores'
        },
        (payload) => {
          console.log("📡 Recebido UPDATE em selecoes_fornecedores:", payload);
          // Recarregar seleções quando houver mudanças
          loadSelecoes(fornecedor.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'selecoes_fornecedores'
        },
        (payload) => {
          console.log("📡 Recebido INSERT em selecoes_fornecedores:", payload);
          loadSelecoes(fornecedor.id);
        }
      )
      .subscribe((status) => {
        console.log("📡 Status subscription realtime:", status);
      });

    return () => {
      console.log("🛑 Removendo subscription realtime...");
      supabase.removeChannel(channel);
    };
  }, [fornecedor]);

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
      // Buscar cotações onde o fornecedor respondeu
      const { data: respostas, error: respostasError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          cotacao_id,
          created_at,
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

      if (respostasError) throw respostasError;

      // Transformar para formato compatível com a interface
      const cotacoesFormatadas = (respostas || []).map((resposta: any) => ({
        id: resposta.cotacao_id,
        created_at: resposta.created_at,
        cotacoes_precos: resposta.cotacoes_precos
      }));

      setCotacoes(cotacoesFormatadas);
    } catch (error: any) {
      toast.error("Erro ao carregar cotações");
    }
  };

  const loadSelecoes = async (fornecedorId: string) => {
    try {
      console.log("📋 Carregando seleções para fornecedor:", fornecedorId);
      
      // Buscar seleções onde o fornecedor enviou proposta
      const { data, error } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          id,
          created_at,
          data_envio_proposta,
          selecao_id,
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
      
      console.log("✅ Seleções carregadas:", data);
      data?.forEach(s => {
        console.log(`  - ${s.selecoes_fornecedores?.titulo_selecao}: Data=${s.selecoes_fornecedores?.data_sessao_disputa}, Hora=${s.selecoes_fornecedores?.hora_sessao_disputa}`);
      });
      
      setSelecoes(data || []);
    } catch (error: any) {
      console.error("❌ Erro ao carregar seleções:", error);
      toast.error("Erro ao carregar seleções");
    }
  };

  const loadDocumentosPendentes = async (fornecedorId: string) => {
    try {
      console.log("🔍 Carregando documentos pendentes para fornecedor:", fornecedorId);
      
      // Buscar documentos solicitados na finalização do processo
      // Apenas documentos com status "enviado" (ainda não enviados pelo fornecedor)
      // ou "rejeitado" (recusados pelo gestor e precisam ser reenviados)
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
        .in("status_solicitacao", ["enviado", "rejeitado"]);

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

        // Se está nesta lista, significa que está com status "enviado" ou "rejeitado"
        // ou seja, ainda não foi enviado pelo fornecedor ou precisa ser reenviado
        cotacoesMap.get(campo.cotacao_id).campos_documentos_finalizacao.push({
          ...campo,
          enviado: false, // Status "enviado" ou "rejeitado" = documento não enviado
          arquivo: null
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
    console.log("🚀 Iniciando upload de documento:", { campoId, fileName: file.name, fornecedor: fornecedor?.id });
    
    if (!fornecedor) {
      console.error("❌ Fornecedor não encontrado");
      toast.error("Fornecedor não identificado");
      return;
    }

    try {
      console.log("📤 Fazendo upload para storage...");
      const fileExt = file.name.split('.').pop();
      const fileName = `fornecedor_${fornecedor.id}/${campoId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('processo-anexos')
        .upload(fileName, file);

      if (uploadError) {
        console.error("❌ Erro no upload do storage:", uploadError);
        throw uploadError;
      }

      console.log("✅ Upload no storage concluído");

      const { data: { publicUrl } } = supabase.storage
        .from('processo-anexos')
        .getPublicUrl(fileName);

      console.log("📝 Salvando registro do documento...");
      
      // Usar upsert para inserir ou atualizar automaticamente
      const { error: upsertError } = await supabase
        .from('documentos_finalizacao_fornecedor')
        .upsert({
          fornecedor_id: fornecedor.id,
          campo_documento_id: campoId,
          url_arquivo: publicUrl,
          nome_arquivo: file.name,
          data_upload: new Date().toISOString()
        }, {
          onConflict: 'fornecedor_id,campo_documento_id'
        });

      if (upsertError) {
        console.error("❌ Erro ao salvar documento:", upsertError);
        throw upsertError;
      }

      console.log("✅ Documento salvo no banco");
      console.log("🔄 Atualizando status do campo...");

      // Atualizar status do campo para "em_analise"
      const { error: updateError } = await supabase
        .from('campos_documentos_finalizacao')
        .update({ 
          status_solicitacao: 'em_analise',
          data_conclusao: new Date().toISOString()
        })
        .eq('id', campoId);

      if (updateError) {
        console.error("❌ Erro ao atualizar status:", updateError);
        throw updateError;
      }

      console.log("✅ Status atualizado com sucesso!");
      toast.success("Documento enviado com sucesso!");
      
      console.log("🔄 Recarregando lista de documentos pendentes...");
      await loadDocumentosPendentes(fornecedor.id);
      console.log("✅ Lista recarregada!");
    } catch (error: any) {
      console.error("❌ Erro ao fazer upload:", error);
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
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-orange-700 dark:text-orange-400 mb-2">
                    ⚠️ Você possui documentos pendentes de envio!
                  </p>
                  <p className="text-sm text-orange-600 dark:text-orange-300">
                    Acesse a aba "Cotações de Preços" ou "Seleções" para visualizar e enviar os documentos solicitados.
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
            <div className="space-y-6">
              {/* Notificação de Rejeição com Recurso */}
              {fornecedor?.id && (
                <NotificacaoRejeicao fornecedorId={fornecedor.id} />
              )}

              {/* Documentos Pendentes de Cotações */}
              {documentosPendentes.length > 0 && (
                <Card className="border-orange-500/50 bg-orange-500/10">
                  <CardHeader>
                    <CardTitle className="text-orange-700 dark:text-orange-400">
                      📋 Documentos Solicitados - Finalização de Processos
                    </CardTitle>
                    <CardDescription className="text-orange-600 dark:text-orange-300">
                      Você foi selecionado como vencedor! Envie os documentos solicitados para conclusão dos processos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {documentosPendentes.map((cotacao: any) => (
                      <div key={cotacao.id} className="border rounded-lg p-4 bg-background">
                        <div className="mb-4">
                          <h4 className="font-semibold text-lg">{cotacao.titulo_cotacao}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Processo de Compra Direta - Documentos Adicionais
                          </p>
                        </div>
                        <div className="space-y-3">
                          {cotacao.campos_documentos_finalizacao.map((campo: any) => (
                            <div key={campo.id} className="p-4 bg-muted/30 rounded-lg border-2 border-dashed">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-medium text-base">{campo.nome_campo}</p>
                                    {campo.obrigatorio && (
                                      <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
                                    )}
                                    {campo.enviado && (
                                      <Badge className="bg-green-600 text-white text-xs">
                                        ✓ Documento Enviado
                                      </Badge>
                                    )}
                                  </div>
                                  {campo.descricao && (
                                    <p className="text-sm text-muted-foreground mb-3">{campo.descricao}</p>
                                  )}
                                  {campo.arquivo && (
                                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                                      <a 
                                        href={campo.arquivo.url_arquivo} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-sm text-green-700 dark:text-green-400 hover:underline flex items-center gap-2"
                                      >
                                        <FileText className="h-4 w-4" />
                                        {campo.arquivo.nome_arquivo}
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
                                        if (file) handleUploadDocumento(campo.id, file);
                                      }}
                                      className="hidden"
                                      id={`upload-${campo.id}`}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => document.getElementById(`upload-${campo.id}`)?.click()}
                                      className="bg-orange-600 hover:bg-orange-700"
                                    >
                                      <Upload className="h-4 w-4 mr-2" />
                                      Enviar PDF
                                    </Button>
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

              {/* Lista de Cotações */}
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
                    {cotacoes.map((cotacao) => (
                      <div key={cotacao.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">
                              {cotacao.cotacoes_precos?.titulo_cotacao}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {cotacao.cotacoes_precos?.descricao_cotacao}
                            </p>
                            <div className="flex gap-4 mt-3 text-sm">
                              <span>
                                Data de Envio: {new Date(cotacao.created_at).toLocaleDateString()}
                              </span>
                              {getStatusCotacaoBadge(cotacao.cotacoes_precos?.status_cotacao)}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => {
                              setCotacaoSelecionada(cotacao.id);
                              setDialogConsultarOpen(true);
                            }}
                          >
                            Consultar Proposta
                          </Button>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="selecoes">
            <Card>
              <CardHeader>
                <CardTitle>Minhas Seleções de Fornecedores</CardTitle>
                <CardDescription>
                  Processos seletivos em que você apresentou proposta
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
                                Data: {convite.selecoes_fornecedores?.data_sessao_disputa?.split('-').reverse().join('/')}
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

      {/* Dialog para consultar proposta */}
      {fornecedor && (
        <DialogConsultarProposta
          open={dialogConsultarOpen}
          onOpenChange={setDialogConsultarOpen}
          cotacaoId={cotacaoSelecionada}
          fornecedorId={fornecedor.id}
        />
      )}
    </div>
  );
}
