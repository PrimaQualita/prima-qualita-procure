import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, CheckCircle2, XCircle, Search, Download } from "lucide-react";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";
import { stripHtml } from "@/lib/htmlUtils";

export default function VerificarAutorizacao() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [protocolo, setProtocolo] = useState(searchParams.get("protocolo") || "");
  const [loading, setLoading] = useState(false);
  const [autorizacao, setAutorizacao] = useState<any>(null);
  const [tipoDocumento, setTipoDocumento] = useState<'autorizacao' | 'relatorio' | 'compliance' | 'planilha' | 'encaminhamento' | 'recurso' | 'resposta_recurso' | null>(null);
  const [buscaRealizada, setBuscaRealizada] = useState(false);

  const verificarAutorizacao = async (protocoloParam?: string) => {
    const protocoloParaBuscar = protocoloParam || protocolo;
    
    if (!protocoloParaBuscar.trim()) {
      toast({
        title: "Protocolo obrigatório",
        description: "Digite o protocolo do documento para verificar",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setBuscaRealizada(true);
    setAutorizacao(null);
    setTipoDocumento(null);
    
    const protocoloLimpo = protocoloParaBuscar.trim();
    console.log('🔍 [VERIFICAÇÃO] Iniciando busca');
    console.log('📋 [VERIFICAÇÃO] Protocolo original:', protocoloParaBuscar);
    console.log('✨ [VERIFICAÇÃO] Protocolo limpo:', protocoloLimpo);
    console.log('📏 [VERIFICAÇÃO] Tamanho:', protocoloLimpo.length);
    
    try {
      // 1. Autorizações de Processo
      console.log('🔎 [VERIFICAÇÃO] Buscando em autorizacoes_processo...');
      const { data: autData, error: autError } = await supabase
        .from('autorizacoes_processo')
        .select('*')
        .eq('protocolo', protocoloLimpo)
        .maybeSingle();

      console.log('📄 [VERIFICAÇÃO] Resultado autorizacoes_processo:', { 
        encontrado: !!autData, 
        erro: autError?.message,
        dados: autData 
      });

      if (autData && !autError) {
        console.log('✅ [VERIFICAÇÃO] Autorização encontrada!');
        const { data: cotacao } = await supabase
          .from('cotacoes_precos')
          .select('titulo_cotacao, processo_compra_id')
          .eq('id', autData.cotacao_id)
          .single();

        let processo = null;
        if (cotacao?.processo_compra_id) {
          const { data: processoData } = await supabase
            .from('processos_compras')
            .select('numero_processo_interno, objeto_resumido')
            .eq('id', cotacao.processo_compra_id)
            .single();
          processo = processoData;
        }

        const { data: usuario } = await supabase
          .from('profiles')
          .select('nome_completo, cpf')
          .eq('id', autData.usuario_gerador_id)
          .single();

        setAutorizacao({
          ...autData,
          cotacao: cotacao ? { ...cotacao, processo } : null,
          usuario
        });
        setTipoDocumento('autorizacao');

        toast({
          title: "Autorização verificada",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // 2. Relatórios Finais
      console.log('🔎 [VERIFICAÇÃO] Buscando em relatorios_finais...');
      const { data: relData, error: relError } = await supabase
        .from('relatorios_finais')
        .select('*')
        .eq('protocolo', protocoloLimpo)
        .maybeSingle();

      console.log('📋 [VERIFICAÇÃO] Resultado relatorios_finais:', { 
        encontrado: !!relData, 
        erro: relError?.message,
        dados: relData 
      });

      if (relData && !relError) {
        console.log('✅ [VERIFICAÇÃO] Relatório Final encontrado!');
        const { data: cotacao } = await supabase
          .from('cotacoes_precos')
          .select('titulo_cotacao, processo_compra_id')
          .eq('id', relData.cotacao_id)
          .single();

        let processo = null;
        if (cotacao?.processo_compra_id) {
          const { data: processoData } = await supabase
            .from('processos_compras')
            .select('numero_processo_interno, objeto_resumido')
            .eq('id', cotacao.processo_compra_id)
            .single();
          processo = processoData;
        }

        const { data: usuario } = await supabase
          .from('profiles')
          .select('nome_completo, cpf')
          .eq('id', relData.usuario_gerador_id)
          .single();

        setAutorizacao({
          ...relData,
          cotacao: cotacao ? { ...cotacao, processo } : null,
          usuario
        });
        setTipoDocumento('relatorio');

        toast({
          title: "Relatório Final verificado",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // 3. Análises de Compliance
      console.log('🔎 [VERIFICAÇÃO] Buscando em analises_compliance...');
      const { data: compData, error: compError } = await supabase
        .from('analises_compliance')
        .select('*')
        .eq('protocolo', protocoloLimpo)
        .maybeSingle();

      console.log('📋 [VERIFICAÇÃO] Resultado analises_compliance:', { 
        encontrado: !!compData, 
        erro: compError?.message,
        dados: compData 
      });

      if (compData && !compError) {
        console.log('✅ [VERIFICAÇÃO] Análise de Compliance encontrada!');
        
        const { data: usuario } = await supabase
          .from('profiles')
          .select('nome_completo')
          .eq('id', compData.usuario_analista_id)
          .single();

        setAutorizacao({
          ...compData,
          usuario
        });
        setTipoDocumento('compliance');

        toast({
          title: "Análise de Compliance verificada",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // 4. Planilhas Consolidadas (SEMPRE PEGAR A MAIS RECENTE)
      console.log('🔎 [VERIFICAÇÃO] Buscando em planilhas_consolidadas...');
      const { data: planData, error: planError } = await supabase
        .from('planilhas_consolidadas')
        .select('*')
        .eq('protocolo', protocoloLimpo)
        .order('data_geracao', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('📋 [VERIFICAÇÃO] Resultado planilhas_consolidadas:', { 
        encontrado: !!planData, 
        erro: planError?.message,
        dados: planData 
      });

      if (planData && !planError) {
        console.log('✅ [VERIFICAÇÃO] Planilha Consolidada encontrada!');

        const { data: cotacao } = await supabase
          .from('cotacoes_precos')
          .select('titulo_cotacao, processo_compra_id')
          .eq('id', planData.cotacao_id)
          .single();

        let processo = null;
        if (cotacao?.processo_compra_id) {
          const { data: processoData } = await supabase
            .from('processos_compras')
            .select('numero_processo_interno, objeto_resumido')
            .eq('id', cotacao.processo_compra_id)
            .single();
          processo = processoData;
        }

        const { data: usuario } = await supabase
          .from('profiles')
          .select('nome_completo, cpf')
          .eq('id', planData.usuario_gerador_id)
          .single();

        setAutorizacao({
          ...planData,
          cotacao: cotacao ? { ...cotacao, processo } : null,
          usuario
        });
        setTipoDocumento('planilha');

        toast({
          title: "Planilha Consolidada verificada",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // 5. Encaminhamentos de Processo
      console.log('🔎 [VERIFICAÇÃO] Buscando em encaminhamentos_processo...');
      const { data: encData, error: encError } = await supabase
        .from('encaminhamentos_processo')
        .select('*')
        .eq('protocolo', protocoloLimpo)
        .maybeSingle();

      console.log('📋 [VERIFICAÇÃO] Resultado encaminhamentos_processo:', { 
        encontrado: !!encData, 
        erro: encError?.message,
        dados: encData 
      });

      if (encData && !encError) {
        console.log('✅ [VERIFICAÇÃO] Encaminhamento de Processo encontrado!');

        let cotacao = null;
        let processo = null;

        if (encData.cotacao_id) {
          const { data: cotacaoData } = await supabase
            .from('cotacoes_precos')
            .select('titulo_cotacao, processo_compra_id')
            .eq('id', encData.cotacao_id)
            .single();
          cotacao = cotacaoData;

          if (cotacaoData?.processo_compra_id) {
            const { data: processoData } = await supabase
              .from('processos_compras')
              .select('numero_processo_interno, objeto_resumido')
              .eq('id', cotacaoData.processo_compra_id)
              .single();
            processo = processoData;
          }
        }

        const { data: usuario } = await supabase
          .from('profiles')
          .select('nome_completo, cpf')
          .eq('id', encData.gerado_por)
          .single();

        setAutorizacao({
          ...encData,
          data_geracao: encData.created_at,
          cotacao: cotacao ? { ...cotacao, processo } : null,
          usuario
        });
        setTipoDocumento('encaminhamento');

        toast({
          title: "Encaminhamento de Processo verificado",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // 6. Recursos de Inabilitação (Recurso do Fornecedor)
      console.log('🔎 [VERIFICAÇÃO] Buscando em recursos_inabilitacao_selecao (recurso)...');
      // @ts-ignore - Supabase type inference too deep
      const recursoResult = await supabase
        .from('recursos_inabilitacao_selecao')
        .select('*')
        .eq('protocolo_recurso', protocoloLimpo)
        .maybeSingle();
      const recursoData = recursoResult.data as any;
      const recursoError = recursoResult.error;

      console.log('📋 [VERIFICAÇÃO] Resultado recursos_inabilitacao_selecao (recurso):', { 
        encontrado: !!recursoData, 
        erro: recursoError?.message 
      });

      if (recursoData && !recursoError) {
        console.log('✅ [VERIFICAÇÃO] Recurso de Inabilitação encontrado!');
        
        const { data: fornecedor } = await supabase
          .from('fornecedores')
          .select('razao_social, cnpj')
          .eq('id', recursoData.fornecedor_id)
          .single();

        setAutorizacao({
          ...recursoData,
          data_geracao: recursoData.data_envio_recurso,
          usuario: { nome_completo: fornecedor?.razao_social }
        });
        setTipoDocumento('recurso');

        toast({
          title: "Recurso de Inabilitação verificado",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // 7. Recursos de Inabilitação (Resposta do Gestor)
      console.log('🔎 [VERIFICAÇÃO] Buscando em recursos_inabilitacao_selecao (resposta)...');
      // @ts-ignore - Supabase type inference too deep
      const respostaRecursoResult = await supabase
        .from('recursos_inabilitacao_selecao')
        .select('*')
        .eq('protocolo_resposta', protocoloLimpo)
        .maybeSingle();
      const respostaRecursoData = respostaRecursoResult.data as any;
      const respostaRecursoError = respostaRecursoResult.error;

      console.log('📋 [VERIFICAÇÃO] Resultado recursos_inabilitacao_selecao (resposta):', { 
        encontrado: !!respostaRecursoData, 
        erro: respostaRecursoError?.message 
      });

      if (respostaRecursoData && !respostaRecursoError) {
        console.log('✅ [VERIFICAÇÃO] Resposta de Recurso encontrada!');
        
        let usuario = null;
        if (respostaRecursoData.usuario_gestor_id) {
          const { data: usuarioData } = await supabase
            .from('profiles')
            .select('nome_completo, cpf')
            .eq('id', respostaRecursoData.usuario_gestor_id)
            .single();
          usuario = usuarioData;
        }

        setAutorizacao({
          ...respostaRecursoData,
          data_geracao: respostaRecursoData.data_resposta_gestor,
          usuario
        });
        setTipoDocumento('resposta_recurso');

        toast({
          title: "Resposta de Recurso verificada",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // Não encontrou em nenhuma tabela
      console.error('❌ [VERIFICAÇÃO] Documento não encontrado em nenhuma tabela');
      console.error('🔍 [VERIFICAÇÃO] Protocolo buscado:', protocoloLimpo);
      
      toast({
        title: "Documento não encontrado",
        description: "Não foi possível localizar um documento com este protocolo. Verifique se o protocolo está correto.",
        variant: "destructive"
      });
      setAutorizacao(null);
      setTipoDocumento(null);
    } catch (error) {
      console.error('💥 [VERIFICAÇÃO] Erro ao verificar documento:', error);
      toast({
        title: "Erro ao verificar",
        description: "Ocorreu um erro ao buscar o documento",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const baixarAutorizacao = async () => {
    if (!autorizacao?.url_arquivo) return;

    try {
      const response = await fetch(autorizacao.url_arquivo);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = autorizacao.nome_arquivo || 'autorizacao.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar:', error);
      toast({
        title: "Erro ao baixar",
        description: "Não foi possível baixar a autorização",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10 py-12 px-4">
      <div className="container max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-6">
            <img src={logoHorizontal} alt="Prima Qualità" className="h-16" />
          </div>
          <h1 className="text-4xl font-bold text-foreground">Verificação de Documentos</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Insira o protocolo para verificar a autenticidade de autorizações, relatórios, planilhas e encaminhamentos
          </p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Buscar Documento
            </CardTitle>
            <CardDescription>
              Digite o protocolo completo do documento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="protocolo">Protocolo</Label>
              <div className="flex gap-2">
                <Input
                  id="protocolo"
                  placeholder="Digite o protocolo do documento"
                  value={protocolo}
                  onChange={(e) => setProtocolo(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && verificarAutorizacao()}
                />
                <Button 
                  onClick={() => verificarAutorizacao()} 
                  disabled={loading}
                  className="whitespace-nowrap"
                >
                  {loading ? "Verificando..." : "Verificar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {autorizacao && (
          <Card className="border-2 border-primary">
            <CardHeader className="bg-primary/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                  <div>
                    <CardTitle className="text-green-600">
                      {tipoDocumento === 'relatorio' ? 'Relatório Final Autêntico' : 
                       tipoDocumento === 'compliance' ? 'Análise de Riscos e Conformidades Autêntica' :
                       tipoDocumento === 'planilha' ? 'Planilha Consolidada Autêntica' :
                       tipoDocumento === 'encaminhamento' ? 'Encaminhamento de Processo Autêntico' :
                       'Autorização Autêntica'}
                    </CardTitle>
                    <CardDescription>Documento verificado e válido</CardDescription>
                  </div>
                </div>
                <Button onClick={baixarAutorizacao} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Baixar PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Protocolo</p>
                  <p className="font-mono font-semibold">{autorizacao.protocolo}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tipo de Documento</p>
                  <p className="font-semibold capitalize">
                    {tipoDocumento === 'relatorio' ? 'Relatório Final' : 
                     tipoDocumento === 'compliance' ? 'Análise de Riscos e Conformidades' :
                     tipoDocumento === 'planilha' ? 'Planilha Consolidada' :
                     tipoDocumento === 'encaminhamento' ? 'Encaminhamento de Processo' :
                     autorizacao.tipo_autorizacao === 'compra_direta' ? 'Autorização - Compra Direta' : 'Autorização - Seleção de Fornecedores'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Data de Geração</p>
                  <p className="font-semibold">
                    {new Date(autorizacao.data_geracao || autorizacao.data_analise).toLocaleString('pt-BR', {
                      dateStyle: 'long',
                      timeStyle: 'medium'
                    })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Responsável</p>
                  <p className="font-semibold">{autorizacao.usuario?.nome_completo}</p>
                  {autorizacao.usuario?.cpf && (
                    <p className="text-sm text-muted-foreground">CPF: {autorizacao.usuario.cpf}</p>
                  )}
                </div>
              </div>

              {autorizacao.cotacao && (
                <>
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Informações do Processo</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Número do Processo</p>
                        <p className="font-semibold">{autorizacao.cotacao.processo?.numero_processo_interno}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Cotação</p>
                        <p className="font-semibold">{autorizacao.cotacao.titulo_cotacao}</p>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <p className="text-sm text-muted-foreground">Objeto</p>
                        <p className="font-semibold">{stripHtml(autorizacao.cotacao.processo?.objeto_resumido || "")}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Validade Legal:</strong> Este documento possui validade legal conforme Lei 14.063/2020
                </p>
                <p className="text-xs text-muted-foreground">
                  Hash de Verificação: {autorizacao.protocolo.replace(/-/g, '').substring(0, 32).toUpperCase()}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {buscaRealizada && !loading && protocolo && !autorizacao && (
          <Card className="border-2 border-destructive">
            <CardHeader className="bg-destructive/5">
              <div className="flex items-center gap-3">
                <XCircle className="w-8 h-8 text-destructive" />
                <div>
                  <CardTitle className="text-destructive">Documento Não Encontrado</CardTitle>
                  <CardDescription>
                    Não foi possível localizar um documento com o protocolo informado
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                Verifique se o protocolo foi digitado corretamente e tente novamente.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Voltar ao Sistema
          </Button>
        </div>
      </div>
    </div>
  );
}
